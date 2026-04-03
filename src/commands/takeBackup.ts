import * as vscode from 'vscode';
import { salesforceService } from '../services/salesforceService';
import { getMetadataInfo } from '../utils/metadataUtils';
import { backupService } from '../services/backupService';

export class TakeBackupCommand {

    constructor(private context: vscode.ExtensionContext) {
    }

    async execute(uri?: vscode.Uri): Promise<void> {
        // Get current file
        const filePath = uri?.fsPath || vscode.window.activeTextEditor?.document.uri.fsPath;
        
        if (!filePath) {
            vscode.window.showErrorMessage('No file selected');
            return;
        }
        
        // Get metadata info
        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo) {
            vscode.window.showErrorMessage('Not a Salesforce file');
            return;
        }

        try {
            const currentAlias = await salesforceService.getCurrentAlias() || 'unknown_alias';
            if(currentAlias !== 'unknown_alias' && metadataInfo) {
                const backupCreated = backupService.backupDeployedFile(filePath, metadataInfo, currentAlias);
                if (backupCreated) {
                    vscode.window.showInformationMessage(`✅ Backup taken for ${metadataInfo.name} in org ${currentAlias}`);
                } else {
                    vscode.window.showErrorMessage(`Failed to take backup for ${metadataInfo.name}`);
                }
            }
        } catch (error) {
            console.error('Error taking backup:', error);
            vscode.window.showErrorMessage(`Failed to take backup: ${error}`);
        }
    }
}