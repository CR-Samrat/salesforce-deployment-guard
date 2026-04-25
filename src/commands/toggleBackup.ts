import * as vscode from 'vscode';
import { getMetadataInfo } from '../utils/metadataUtils';
import { salesforceService } from '../services/salesforceService';
import { BackupPreferences } from '../storage/backupPreferences';

export class ToggleBackupCommand {
    private backupPrefs: BackupPreferences;

    constructor(private context: vscode.ExtensionContext) {
        this.backupPrefs = new BackupPreferences(context);
    }

    async execute(uri?: vscode.Uri): Promise<void> {
        try {
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

            // Get current user
            const currentAlias = await salesforceService.getCurrentAlias();
            const currentOrgId = await salesforceService.getCurrentOrgId();
            if (!currentAlias || !currentOrgId) {
                vscode.window.showErrorMessage('No active Salesforce org');
                return;
            }

            // Toggle backup
            const newState = this.backupPrefs.toggleBackup(
                currentOrgId,
                metadataInfo.type,
                metadataInfo.name,
                currentAlias
            );

            // Show confirmation
            vscode.window.showInformationMessage(
                `${newState ? '✅' : '❌'} Backup ${newState ? 'enabled' : 'disabled'} for ${metadataInfo.name}`
            );

        } catch (error) {
            console.error('Error toggling backup:', error);
            vscode.window.showErrorMessage(`Failed to toggle backup: ${error}`);
        }
    }
}
