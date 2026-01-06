import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface ConflictInfo {
    hasConflict: boolean;
    modifiedBy?: string;
    modifiedDate?: string;
    currentUser?: string;
}

//Checking if the file is a salesforce metadata file
function isSalesforceFile(filePath: string): boolean {
	const salesforceExtensions = ['.cls','.trigger','.apex'];
	const fileExtension = path.extname(filePath).toLowerCase();
	return salesforceExtensions.includes(fileExtension);
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

async function checkForConflicts(filePath: string): Promise<ConflictInfo> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        
        if (!workspaceFolder) {
            return { hasConflict: false };
        }

		// Get current logged-in user
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
        const modifiedDate = new Date(orgRecord.LastModifiedDate).toLocaleString();

        console.log(`Last modified by: ${modifiedByName} (${modifiedByUsername})`);
        
        // Check if current user was the last to modify
        const isCurrentUser =
            modifiedByUsername.toLowerCase() === currentUser.toLowerCase() ||
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
            modifiedDate,
            currentUser
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

	const safeDeploy = vscode.commands.registerCommand("salesforce-deployment-guard.safeDeploy", async () => {
		const editor = vscode.window.activeTextEditor;

		//Show error if no file is open
		if (!editor) {
			vscode.window.showErrorMessage("No file is open. Please open a Salesforce metadata file to deploy.");
			return;
		}

		const filePath = editor.document.fileName;
		const fileName = path.basename(filePath);

		//Check if the file is a salesforce metadata file
		if (!isSalesforceFile(filePath)) {
			vscode.window.showErrorMessage(`The file ${fileName} is not a Salesforce metadata file. Please open a valid file to deploy.`);
			return;
		}

		//First save the file if there are unsaved changes
		if(editor.document.isDirty) {
			await editor.document.save();
			vscode.window.showInformationMessage(`💾 Saved ${fileName}`);
		}

		let conflictInfo: ConflictInfo | undefined;

		//Simulate deployment process
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Checking for conflicts...",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 30 });

			conflictInfo = await checkForConflicts(filePath);

			progress.report({ increment: 100});
		});

		//If conflicts found, show warning and abort deployment
		if (conflictInfo?.hasConflict) {
        	const choice = await vscode.window.showWarningMessage(
        		`⚠️ WARNING: Someone Else Modified This File!\n\n` +
        		`File: "${fileName}"\n` +
        		`Last modified by: ${conflictInfo.modifiedBy}\n` +
        		`Modified on: ${conflictInfo.modifiedDate}\n\n` +
        		`You are logged in as: ${conflictInfo.currentUser}\n\n` +
        		`Deploying will overwrite ${conflictInfo.modifiedBy}'s changes.\n` +
        		`Consider retrieving first to review their changes.`,
        		{ modal: true },
        		'🔄 Retrieve First',
        		'🚀 Deploy Anyway',
        		'❌ Cancel'
    		);

        	if (choice === '❌ Cancel' || !choice) {
            	vscode.window.showInformationMessage('Deployment cancelled.');
            	return;
        	}

        	if (choice === '🔄 Retrieve First') {
            	try {
                	vscode.window.showInformationMessage(`⬇️ Retrieving latest version of ${fileName}...`);
                	await vscode.commands.executeCommand('sf.retrieve.source.path',
                    	vscode.Uri.file(filePath)
                	);
                	vscode.window.showInformationMessage(`✅ Retrieved ${fileName} successfully! Please review changes before deploying.`);
            	} catch (error) {
                	vscode.window.showErrorMessage(`❌ Retrieve failed: ${error}`);
            	}
            	return;
        	}

        	// If "Deploy Anyway" was chosen, continue to deployment
        	vscode.window.showInformationMessage('⚠️ Proceeding with deployment despite conflict...');
    	}

		//For now doing directly deployed. Later will check if any conflicts found
		vscode.window.showInformationMessage(`🚀 Deploying ${fileName}...`);

		//Execute the deployment command from salesforce cli
		try {
			await vscode.commands.executeCommand('sf.deploy.source.path',
				vscode.Uri.file(filePath)
			);
			vscode.window.showInformationMessage(`✅ Deployment of ${fileName} succeeded!`);
		} catch (error) {
			vscode.window.showErrorMessage(`❌ Deployment of ${fileName} failed: ${error}`);
			return;
		}
	} );

	context.subscriptions.push(disposable, safeDeploy, testListCommands);
}

export function deactivate() {}
