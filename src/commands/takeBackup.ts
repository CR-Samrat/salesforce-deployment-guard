import * as vscode from 'vscode';
import { salesforceService, getBackupService } from '../services';
import { getMetadataInfo } from '../utils/metadataUtils';

export class TakeBackupCommand {

    constructor(private context: vscode.ExtensionContext) {}

    async execute(uri?: vscode.Uri): Promise<void> {
        const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
        
        if (!filePath) {
            vscode.window.showErrorMessage('No file selected');
            return;
        }
        
        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo) {
            vscode.window.showErrorMessage('Not a Salesforce file');
            return;
        }

        try {
            const currentAlias = await salesforceService.getCurrentAlias() || 'unknown_alias';
            
            if (currentAlias !== 'unknown_alias' && metadataInfo) {
                const backupService = getBackupService();
                
                const backupCreated = backupService.backupDeployedFile(
                    filePath,
                    metadataInfo,
                    currentAlias
                );
                
                if (backupCreated) {
                    vscode.window.showInformationMessage(
                        `✅ Backup taken for ${metadataInfo.name} in org ${currentAlias}`
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `Failed to take backup for ${metadataInfo.name}`
                    );
                }
            }
        } catch (error) {
            console.error('Error taking backup:', error);
            vscode.window.showErrorMessage(`Failed to take backup: ${error}`);
        }
    }
}