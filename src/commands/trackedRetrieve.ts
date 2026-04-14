import * as vscode from 'vscode';
import * as path from 'path';
import { getMetadataInfo } from '../utils/metadataUtils';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { retrieveService, salesforceService } from '../services';

export class TrackedRetrieveCommand {
    constructor(private context: vscode.ExtensionContext) {}

    async execute(uri?: vscode.Uri): Promise<void> {
        try {
            if (!uri) {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No file is open');
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

            const retrieveResult = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Retrieving ${fileName} from Salesforce...`,
                cancellable: false
            }, async () => retrieveService.retrieve(filePath));

            if (!retrieveResult.success) {
                const details = retrieveResult.details?.slice(0, 5).join('\n');
                const errorMessage = details
                    ? `${retrieveResult.message}\n${details}`
                    : retrieveResult.message;

                throw new Error(errorMessage);
            }

            const retrieveMap = getRetrieveMap(this.context);
            const currentUser = await salesforceService.getCurrentUsername();
            const key = `${currentUser?.username}:${metadataInfo.name}`;
            retrieveMap.set(key, new Date());
            saveRetrieveMap(this.context, retrieveMap);

            console.log(`Retrieved and synced ${metadataInfo.name} at ${new Date().toLocaleString()}`);
            vscode.window.showInformationMessage(`Retrieved successfully: ${fileName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to retrieve ${path.basename(uri?.fsPath ?? 'file')}: ${error}`);
        }
    }
}