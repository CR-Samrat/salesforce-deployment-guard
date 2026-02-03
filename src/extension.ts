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
	const salesforceExtensions = ['.cls','.trigger','.apex','.js','.html','.css'];
	const fileExtension = path.extname(filePath).toLowerCase();

	if(['.js','.html','.css'].includes(fileExtension)) {
		return filePath.includes('/lwc/') || filePath.includes('\\lwc\\');
	}
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

async function retrieveOrgVersion(filePath: string): Promise<string | null>{
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		const metadataInfo = getMetadataInfo(filePath);
		const metadataType = metadataInfo?.type || '';
		const fileName = metadataInfo?.name || '';
		const fileExt = path.extname(filePath).toLowerCase();

		//create temp directory
		const tempDir = path.join(workspaceFolder || '', '.sfguard-temp');
		if(!fs.existsSync(tempDir)){
			fs.mkdirSync(tempDir, { recursive: true });
		}

		const tempFilePath = path.join(tempDir, `${metadataInfo?.name}_ORG${fileExt}`);
		let orgContent = '';

		if(metadataType === 'LightningComponentBundle'){
			const query = `SELECT Source FROM LightningComponentResource WHERE LightningComponentBundle.DeveloperName='${fileName}' and FilePath LIKE '%${fileExt}'`;

			const { stdout } = await execAsync(
				`sf data query --use-tooling-api --query "${query}" --json`,
				{ cwd: workspaceFolder }
			);

			const result = JSON.parse(stdout);

			if (result.status === 0 && result.result?.records?.length) {
				orgContent = result.result.records[0].Source || '';
			}
		}else{
			const query = `SELECT Body FROM ${metadataType} WHERE Name='${fileName}'`;

			const { stdout } = await execAsync(
				`sf data query --query "${query}" --json`,
				{ cwd: workspaceFolder }
			);

			const result = JSON.parse(stdout);

			if (result.status === 0 && result.result?.records?.length) {
				orgContent = result.result.records[0].Body || '';
			}
		}

		if(orgContent){
			//write to temp file
			fs.writeFileSync(tempFilePath, orgContent, 'utf8');
			return tempFilePath;
		}

		return null;
	} catch (error) {
		console.error('Error retrieving org version:', error);
		return null;
	}
}

function getMetadataInfo(filePath: string): {type: string, name: string} | null {
	const fileExt = path.extname(filePath).toLowerCase();
	const fileName = path.basename(filePath, fileExt);
	
	if(fileExt === '.cls'){
		return {type: 'ApexClass', name: fileName};
	}
	if(fileExt === '.trigger'){
		return {type: 'ApexTrigger', name: fileName};
	}
	if(fileExt === '.apex'){
		return {type: 'ApexPage', name: fileName};
	}

	if(['.html','.js','.css'].includes(fileExt)){
		const pathParts = filePath.split(/[/\\]/);
		const lwcIndex = pathParts.findIndex(part => part === 'lwc');

		if(lwcIndex !== -1 && lwcIndex < pathParts.length - 1){
			const componentName = pathParts[lwcIndex+1];

			return {type: 'LightningComponentBundle', name: componentName};
		}
	}

	return null;
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

        // Get file metadata name and type and Determine metadata type
		const fileExt = path.extname(filePath).toLowerCase();
		let metadataInfo = getMetadataInfo(filePath);

		if (!metadataInfo) {
			console.log(`Unsupported file type for conflict check: ${fileExt}`);
			return { hasConflict: false };
		}

		const {type, name} = metadataInfo;
		const metadataType = type;
		const fileName = name;
		let enableToolingApi = false;

        // Query Salesforce org for this file's info
		let query = '';
		if(type === 'LightningComponentBundle'){
			query = `SELECT Id, DeveloperName, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username FROM LightningComponentBundle WHERE DeveloperName='${fileName}'`;
			enableToolingApi = true;
		}else{
			query = `SELECT LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username FROM ${metadataType} WHERE Name='${fileName}'`;
		}
        
        const { stdout } = await execAsync(
            `sf data query ${enableToolingApi ? '--use-tooling-api' : ''} --query "${query}" --json`,
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
    	const errorMessage = error instanceof Error
			? error.message
        	: typeof error === 'object' && error !== null && 'message' in error
        	? (error as any).message
        	: String(error);

		vscode.window.showErrorMessage(`Error! while checking for conflicts. Reason : ${errorMessage}`);
        return { hasConflict: false };
    }
}

async function showDiffAndResolve(localFilePath: string, context: vscode.ExtensionContext) : Promise<boolean> {
	try {
		//Get org version of the file
		const orgFilePath = await retrieveOrgVersion(localFilePath);

		if(!orgFilePath){
			vscode.window.showErrorMessage('Could not retrieve org version for diff.');
			return false;
		}

		const fileName = path.basename(localFilePath);

		//Open difference editor
		await vscode.commands.executeCommand(
			'vscode.diff',
			vscode.Uri.file(orgFilePath),
			vscode.Uri.file(localFilePath),
			`Difference: Org ⟷ Local - ${fileName}`
		);

		//Show instructions
		const choice = await vscode.window.showInformationMessage(
			`📊Compare your changes with the org version. \n\n` +
			`Right (You): Your local changes\n` +
			`Left (Org): Current org version\n\n` +
			`After reviewing, please choose how to proceed.`,
			{ modal: true },
			'⬅️ Use Org Version',
			'➡️ Keep Local Version',
			'✏️ Merge Manually'
		);

		if(choice === '⬅️ Use Org Version'){
			//Overwrite local file with org version
			const orgContent = fs.readFileSync(orgFilePath, 'utf8');
			fs.writeFileSync(localFilePath, orgContent, 'utf8');

			//update retrieve map
			const retrieveMap = getRetrieveMap(context);
			const fileBaseName = path.basename(localFilePath, path.extname(localFilePath));
			retrieveMap.set(fileBaseName, new Date());
			saveRetrieveMap(context, retrieveMap);

			vscode.window.showInformationMessage(`✅ Local file updated with org version: ${fileName}`);
			return true;
		}

		if(choice === '➡️ Keep Local Version'){
			vscode.window.showInformationMessage(`✅ Keeping your local changes for: ${fileName}`);
			return true;
		}

		if(choice === '✏️ Merge Manually'){
			vscode.window.showInformationMessage(`🔧 Please manually merge the changes for: ${fileName}`);

			// Update retrieve map since they're manually resolving
			const retrieveMap = getRetrieveMap(context);
			const fileBaseName = path.basename(localFilePath, path.extname(localFilePath));
			retrieveMap.set(fileBaseName, new Date());
			saveRetrieveMap(context, retrieveMap);

			return false;
		}

		//Cancelled
		return false;
	} catch (error) {
		console.error('Error showing diff:', error);
		vscode.window.showErrorMessage(`Failed to show difference view. Reason : ${error}`);
		return false;
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, "salesforce-deployment-guard" is now active!');

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

				const metadataInfo = getMetadataInfo(filePath);
				if(!metadataInfo){
					vscode.window.showErrorMessage(`Unsupported Salesforce file type for retrieve: ${fileName}`);
					return;
				}

				vscode.window.showInformationMessage(`⬇️ Retrieving ${fileName}...`);

				if(metadataInfo.type === 'LightningComponentBundle'){
					const pathParts = filePath.split(/[/\\]/);
					const lwcIndex = pathParts.findIndex(part => part === 'lwc');
					const bundlePath = pathParts.slice(0, lwcIndex + 2).join(path.sep);

					await vscode.commands.executeCommand('sf.retrieve.source.path', vscode.Uri.file(bundlePath));
				}else{
					await vscode.commands.executeCommand('sf.retrieve.source.path', uri);
				}

                // Update retrieve timestamp
                const retrieveMap = getRetrieveMap(context);
                retrieveMap.set(metadataInfo.name, new Date());
                saveRetrieveMap(context, retrieveMap);

                console.log(`✅ Tracked retrieve for ${metadataInfo.name} at ${new Date().toLocaleString()}`);
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

			const metadataInfo = getMetadataInfo(filePath);
			if(!metadataInfo){
				vscode.window.showErrorMessage(`Unsupported Salesforce file type for deploy: ${fileName}`);
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
                    `⚠️ WARNING: Conflict Detected! ${conflictInfo.reason}\n\n` +
                    `File: "${fileName}"\n` +
                    `Last modified by: ${conflictInfo.modifiedBy}\n` +
                    `Modified on: ${conflictInfo.modifiedDate}\n\n` +
                    `Please retrieve the file first to sync with Salesforce Guard.`,
                    { modal: true },
					'🔍 Resolve Conflict & Deploy',
                    '⬇️ Retrieve Now',
                    '🚀 Deploy Anyway'
                );

				if(choice === '🔍 Resolve Conflict & Deploy'){
					//Show difference and let user resolve
					const resolved = await showDiffAndResolve(filePath, context);
					if(resolved){
						vscode.window.showInformationMessage('✅ Conflict resolved. Proceeding to deploy...');
					} else {
						vscode.window.showInformationMessage('❌ Deployment cancelled due to unresolved conflict.');
						return;
					}
				}

                if (!choice) {
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
            }

            // Deploy the file
            vscode.window.showInformationMessage(`🚀 Deploying ${fileName}...`);

            try {
				if(metadataInfo.type === 'LightningComponentBundle'){
					const pathParts = filePath.split(/[/\\]/);
					const lwcIndex = pathParts.findIndex(part => part === 'lwc');
					const bundlePath = pathParts.slice(0, lwcIndex + 2).join(path.sep);

					await vscode.commands.executeCommand('sf.deploy.source.path', vscode.Uri.file(bundlePath));
				}else{
					await vscode.commands.executeCommand('sf.deploy.source.path', vscode.Uri.file(filePath));
				}

                // Update retrieve timestamp after successful deploy (sync)
                const retrieveMap = getRetrieveMap(context);
                retrieveMap.set(metadataInfo.name, new Date());
                saveRetrieveMap(context, retrieveMap);

                console.log(`✅ Updated sync timestamp for ${metadataInfo.name} after deployment`);
                vscode.window.showInformationMessage(`✅ ${fileName} deployed successfully!`);

            } catch (error) {
                vscode.window.showErrorMessage(`❌ Deployment failed: ${error}`);
            }
        }
    );

	context.subscriptions.push(safeDeploy, trackedRetrieve);
}

export function deactivate() {}
