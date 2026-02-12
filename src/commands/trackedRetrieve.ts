import * as vscode from 'vscode';
import * as path from 'path';
import { isSalesforceFile, getMetadataInfo } from '../utils/metadataUtils';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';

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

            if (!isSalesforceFile(filePath)) {
                vscode.window.showErrorMessage(`${fileName} is not a Salesforce file`);
                return;
            }

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

                await vscode.commands.executeCommand('sf.retrieve.source.path', vscode.Uri.file(bundlePath));
            } else {
                await vscode.commands.executeCommand('sf.retrieve.source.path', uri);
            }

            // Update retrieve timestamp
            const retrieveMap = getRetrieveMap(this.context);
            retrieveMap.set(metadataInfo.name, new Date());
            saveRetrieveMap(this.context, retrieveMap);

            console.log(`✅ Tracked retrieve for ${metadataInfo.name} at ${new Date().toLocaleString()}`);
            vscode.window.showInformationMessage(`✅ Retrieved and synced: ${fileName}`);

        } catch (error) {
            vscode.window.showErrorMessage(`❌ Retrieve failed: ${error}`);
        }
    }
}