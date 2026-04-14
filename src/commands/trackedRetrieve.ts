import * as vscode from 'vscode';
import * as path from 'path';
import { getMetadataInfo } from '../utils/metadataUtils';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { retrieveService, salesforceService, sfGuardOutput } from '../services';

export class TrackedRetrieveCommand {
    constructor(private context: vscode.ExtensionContext) {}

    async execute(uri?: vscode.Uri): Promise<void> {
        try {
            if (!uri) {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No file is open');
                    sfGuardOutput.warn('Retrieve aborted because no active editor was found.');
                    return;
                }
                uri = editor.document.uri;
            }

            const filePath = uri.fsPath;
            const fileName = path.basename(filePath);

            const metadataInfo = getMetadataInfo(filePath);
            if (!metadataInfo) {
                vscode.window.showErrorMessage(`Unsupported Salesforce file type for retrieve: ${fileName}`);
                sfGuardOutput.warn(`Retrieve aborted for unsupported file type: ${filePath}`);
                return;
            }

            sfGuardOutput.info(`Starting retrieve for ${metadataInfo.type} ${metadataInfo.name} (${fileName}).`);

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

            vscode.window.showInformationMessage(`Retrieved successfully: ${fileName}`);
            sfGuardOutput.info(`Retrieve completed successfully for ${fileName}.`);
            console.log(`Updated sync timestamp after retrieve for ${metadataInfo.name}.`);
        } catch (error) {
            const failedFile = path.basename(uri?.fsPath ?? 'file');
            const errorText = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to retrieve ${failedFile}: ${errorText}`);
            sfGuardOutput.error(`Retrieve failed for ${failedFile}. ${errorText}`);
            sfGuardOutput.show();
        }
    }
}