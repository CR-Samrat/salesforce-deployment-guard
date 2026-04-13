import * as vscode from 'vscode';
import * as path from 'path';
import { getMetadataInfo } from '../utils/metadataUtils';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { salesforceService } from '../services/salesforceService';

export class TrackedRetrieveCommand {
    constructor(private context: vscode.ExtensionContext) {}

    async execute(uri?: vscode.Uri): Promise<void> {
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

            const metadataInfo = getMetadataInfo(filePath);
            if (!metadataInfo) {
                vscode.window.showErrorMessage(`Unsupported Salesforce file type for retrieve: ${fileName}`);
                return;
            }

            vscode.window.showInformationMessage(`⬇️ Retrieving ${fileName}...`);

            if (metadataInfo.type === 'LightningComponentBundle') {
                const pathParts = filePath.split(/[/\\]/);
                const lwcIndex = pathParts.findIndex(part => part === 'lwc');
                const bundlePath = pathParts.slice(0, lwcIndex + 2).join(path.sep);

                await vscode.commands.executeCommand('sf.metadata.retrieve.source.path', vscode.Uri.file(bundlePath));
            } else {
                await vscode.commands.executeCommand('sf.metadata.retrieve.source.path', uri);
            }

            // Update retrieve timestamp
            const retrieveMap = getRetrieveMap(this.context);
            const currentUser = await salesforceService.getCurrentUsername();
            const key = `${currentUser?.username}:${metadataInfo.name}`;
            retrieveMap.set(key, new Date());
            saveRetrieveMap(this.context, retrieveMap);

            console.log(`✅ Tracked retrieve for ${metadataInfo.name} at ${new Date().toLocaleString()}`);
            vscode.window.showInformationMessage(`✅ Retrieved and synced: ${fileName}`);

        } catch (error) {
            vscode.window.showErrorMessage(`❌ Retrieve failed: ${error}`);
        }
    }
}