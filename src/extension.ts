import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);
const RETRIEVE_MAP_KEY = 'sfGuard.retrieveTimestamps';

interface ConflictInfo {
    hasConflict: boolean;
    modifiedBy?: string;
    modifiedDate?: string;
    reason?: string;
}

//Checking if the file is a salesforce metadata file
function isSalesforceFile(filePath: string): boolean {
	const salesforceExtensions = ['.cls','.trigger','.apex'];
	const fileExtension = path.extname(filePath).toLowerCase();
	return salesforceExtensions.includes(fileExtension);
}

function getRetrieveMap(context: vscode.ExtensionContext): Map<string, Date> {
    const stored = context.workspaceState.get<Record<string, string>>(RETRIEVE_MAP_KEY, {});
    const map = new Map<string, Date>();
    
    for (const [key, value] of Object.entries(stored)) {
        map.set(key, new Date(value));
    }
    
    return map;
}

function saveRetrieveMap(context: vscode.ExtensionContext, map: Map<string, Date>) {
    const obj: Record<string, string> = {};
    
    map.forEach((date, key) => {
        obj[key] = date.toISOString();
    });
    
    context.workspaceState.update(RETRIEVE_MAP_KEY, obj);
}

async function getCurrentSalesforceUsername(): Promise<string | null> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        
        if (!workspaceFolder) {
            return null;
        }

        // Get current org info
        const { stdout } = await execAsync(
            'sf org display --json',
            { cwd: workspaceFolder }
        );

        const result = JSON.parse(stdout);
        
        if (result.status === 0 && result.result) {
            // Can be username or alias
            return result.result.username || result.result.alias || null;
        }

        return null;
    } catch (error) {
        console.error('Error getting current username:', error);
        return null;
    }
}

async function checkForConflicts(filePath: string, context: vscode.ExtensionContext): Promise<ConflictInfo> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        
        if (!workspaceFolder) {
            return { hasConflict: false };
        }

		//Get current logged-in user
        const currentUser = await getCurrentSalesforceUsername();
		if (!currentUser) {
            console.log('Could not determine current user');
            return { hasConflict: false };
        }
		console.log("Current Salesforce User:", currentUser);

        // Get file metadata name and type
        const fileName = path.basename(filePath, path.extname(filePath));
        const fileExt = path.extname(filePath).toLowerCase();
        
        // Determine metadata type
        let metadataType = '';
        switch (fileExt) {
            case '.cls':
                metadataType = 'ApexClass';
                break;
            case '.trigger':
                metadataType = 'ApexTrigger';
                break;
            case '.apex':
                metadataType = 'ApexPage';
                break;
            default:
                return { hasConflict: false };
        }

        // Query Salesforce org for this file's info
        const query = `SELECT LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username FROM ${metadataType} WHERE Name='${fileName}'`;
        
        const { stdout } = await execAsync(
            `sf data query --query "${query}" --json`,
            { cwd: workspaceFolder }
        );

        const result = JSON.parse(stdout);
        
        // Check if query was successful
        if (result.status !== 0 || !result.result?.records?.length) {
            console.log('No record found in org or query failed');
            return { hasConflict: false };
        }

        const orgRecord = result.result.records[0];
        const modifiedByName = orgRecord.LastModifiedBy?.Name || 'Unknown';
		const modifiedByUsername = orgRecord.LastModifiedBy?.Username || '';
        const orgLastModified = new Date(orgRecord.LastModifiedDate);

        console.log(`Last modified in org: ${modifiedByName} (${orgLastModified.toISOString()})`);
        
        // Get retrieve map
        const retrieveMap = getRetrieveMap(context);
        const lastRetrieved = retrieveMap.get(fileName);

        if (!lastRetrieved) {
			// Check if current user was the last to modify
        	const isCurrentUser = modifiedByUsername.toLowerCase() === currentUser.toLowerCase() ||
    								modifiedByName.toLowerCase().includes(currentUser.toLowerCase()) ||
    								currentUser.toLowerCase().includes(modifiedByUsername.toLowerCase());

        	const hasConflict = !isCurrentUser;
        	if (hasConflict) {
            	console.log(`⚠️ Conflict: File was last modified by ${modifiedByName}, not you!`);
        	} else {
            	console.log(`✅ Safe: You (${currentUser}) were the last to modify this file`);
        	}

        	return {
            	hasConflict,
            	modifiedBy: modifiedByName,
            	modifiedDate: orgLastModified.toLocaleString(),
            	reason: hasConflict ? 'File modified in org after last retrieve' : undefined
        	};
        }

        // Check if org was modified after our last retrieve
        const hasConflict = orgLastModified > lastRetrieved;

        console.log(`📊 Conflict Check for ${fileName}:`);
        console.log(`   Last Retrieved: ${lastRetrieved.toLocaleString()}`);
        console.log(`   Org Modified: ${orgLastModified.toLocaleString()}`);
        console.log(`   Conflict: ${hasConflict ? 'YES ⚠️' : 'NO ✅'}`);

        return {
            hasConflict,
            modifiedBy: modifiedByName,
            modifiedDate: orgLastModified.toLocaleString(),
            reason: hasConflict ? 'File modified in org after last retrieve' : undefined
        };

    } catch (error) {
        console.error('Error checking conflicts:', error);
        // On error, allow deployment (fail-open)
        return { hasConflict: false };
    }
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, "salesforce-deployment-guard" is now active!');

	const disposable = vscode.commands.registerCommand('salesforce-deployment-guard.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from salesforce-deployment-guard!');
	});

	const testListCommands = vscode.commands.registerCommand('salesforce-deployment-guard.listSFCommands', async () => {
    	const allCommands = await vscode.commands.getCommands();
    	const sfCommands = allCommands.filter(cmd =>
        	cmd.startsWith('sfdx') || cmd.startsWith('sf.')
    	);

    	console.log('Available Salesforce Commands:', sfCommands);
    	vscode.window.showInformationMessage(`Found ${sfCommands.length} SF commands. Check console.`);
	});

	const trackedRetrieve = vscode.commands.registerCommand(
        "salesforce-deployment-guard.retrieve",
        async (uri?: vscode.Uri) => {
            try {
                // Get file URI
                if (!uri) {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showErrorMessage("No file is open");
                        return;
                    }
                    uri = editor.document.uri;
                }

                const filePath = uri.fsPath;
                const fileName = path.basename(filePath);
                const fileBaseName = path.basename(filePath, path.extname(filePath));

                if (!isSalesforceFile(filePath)) {
                    vscode.window.showErrorMessage(`${fileName} is not a Salesforce file`);
                    return;
                }

                vscode.window.showInformationMessage(`⬇️ Retrieving ${fileName}...`);

                // Call the original SFDX retrieve command
                await vscode.commands.executeCommand('sf.retrieve.source.path', uri);

                // Update retrieve timestamp
                const retrieveMap = getRetrieveMap(context);
                retrieveMap.set(fileBaseName, new Date());
                saveRetrieveMap(context, retrieveMap);

                console.log(`✅ Tracked retrieve for ${fileBaseName} at ${new Date().toLocaleString()}`);
                vscode.window.showInformationMessage(`✅ Retrieved and synced: ${fileName}`);

            } catch (error) {
                vscode.window.showErrorMessage(`❌ Retrieve failed: ${error}`);
            }
        }
    );

	const safeDeploy = vscode.commands.registerCommand(
        "salesforce-deployment-guard.safeDeploy",
        async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage("No file is open");
                return;
            }

            const filePath = editor.document.fileName;
            const fileName = path.basename(filePath);
            const fileBaseName = path.basename(filePath, path.extname(filePath));

            if (!isSalesforceFile(filePath)) {
                vscode.window.showErrorMessage(`${fileName} is not a Salesforce file`);
                return;
            }

            // Save if dirty
            if (editor.document.isDirty) {
                await editor.document.save();
            }

            // Check for conflicts
            let conflictInfo: ConflictInfo | undefined;
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "🔍 Checking for conflicts...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 30 });
                conflictInfo = await checkForConflicts(filePath, context);
                progress.report({ increment: 100 });
            });

            if (conflictInfo?.hasConflict) {
                const choice = await vscode.window.showWarningMessage(
                    `⚠️ WARNING: ${conflictInfo.reason}\n\n` +
                    `File: "${fileName}"\n` +
                    `Last modified by: ${conflictInfo.modifiedBy}\n` +
                    `Modified on: ${conflictInfo.modifiedDate}\n\n` +
                    `Please retrieve the file first to sync with Salesforce Guard.`,
                    { modal: true },
                    '⬇️ Retrieve Now',
                    '🚀 Deploy Anyway',
                    '❌ Cancel'
                );

                if (choice === '❌ Cancel' || !choice) {
                    vscode.window.showInformationMessage('Deployment cancelled');
                    return;
                }

                if (choice === '⬇️ Retrieve Now') {
                    // Call our tracked retrieve command
                    await vscode.commands.executeCommand(
                        'salesforce-deployment-guard.retrieve',
                        vscode.Uri.file(filePath)
                    );
                    vscode.window.showInformationMessage('✅ File retrieved. You can now deploy safely.');
                    return;
                }

                // If "Deploy Anyway" - continue to deployment
            }

            // Deploy the file
            vscode.window.showInformationMessage(`🚀 Deploying ${fileName}...`);

            try {
                await vscode.commands.executeCommand('sf.deploy.source.path',
                    vscode.Uri.file(filePath)
                );

                // Update retrieve timestamp after successful deploy (sync)
                const retrieveMap = getRetrieveMap(context);
                retrieveMap.set(fileBaseName, new Date());
                saveRetrieveMap(context, retrieveMap);

                console.log(`✅ Updated sync timestamp for ${fileBaseName} after deployment`);
                vscode.window.showInformationMessage(`✅ ${fileName} deployed successfully!`);

            } catch (error) {
                vscode.window.showErrorMessage(`❌ Deployment failed: ${error}`);
            }
        }
    );

	context.subscriptions.push(disposable, safeDeploy, testListCommands, trackedRetrieve);
}

export function deactivate() {}
