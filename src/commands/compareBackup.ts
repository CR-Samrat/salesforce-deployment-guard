import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMetadataInfo } from '../utils/metadataUtils';
import { salesforceService } from '../services/salesforceService';

export class CompareBackupCommand {
    constructor(private context: vscode.ExtensionContext) {}

    async execute(uri?: vscode.Uri): Promise<void> {
        try {
            // Get current file path
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

            // Get current alias
            const currentAlias = await salesforceService.getCurrentAlias();
            if (!currentAlias) {
                vscode.window.showErrorMessage('No active Salesforce org');
                return;
            }

            // Get backups
            const backups = this.getBackupList(metadataInfo.type, metadataInfo.name, currentAlias);

            if (backups.length === 0) {
                vscode.window.showInformationMessage(
                    `📋 No backups found for ${metadataInfo.name}\n\n` +
                    `Backups are created automatically after each deployment.`,
                    { modal: false }
                );
                return;
            }

            // Show backup options to user
            const selectedBackup = await this.showBackupPicker(backups, metadataInfo.name);

            if (!selectedBackup) {
                return; // User cancelled
            }

            // Show diff for the selected backup
            await this.showBackupDiff(filePath, selectedBackup, metadataInfo.name);

        } catch (error) {
            console.error('Error comparing backup:', error);
            vscode.window.showErrorMessage(`Failed to compare backup: ${error}`);
        }
    }

    private getBackupList(
        metadataType: string,
        metadataName: string,
        alias: string
    ): Array<{ timestamp: string; path: string; date: Date }> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceFolder) {
                return [];
            }

            const backupDir = path.join(
                workspaceFolder,
                '.sfguard-backup',
                alias,
                metadataType,
                metadataName
            );

            if (!fs.existsSync(backupDir)) {
                return [];
            }

            // Get all timestamp folders
            const backups = fs.readdirSync(backupDir)
                .filter(item => {
                    const fullPath = path.join(backupDir, item);
                    return fs.statSync(fullPath).isDirectory();
                })
                .map(timestamp => ({
                    timestamp,
                    path: path.join(backupDir, timestamp),
                    date: this.parseTimestampToDate(timestamp)
                }))
                .sort((a, b) => b.date.getTime() - a.date.getTime()); // Newest first

            return backups;

        } catch (error) {
            console.error('Error getting backup list:', error);
            return [];
        }
    }

    private parseTimestampToDate(timestamp: string): Date {
        try {
            const isoString = timestamp
                .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
            return new Date(isoString);
        } catch {
            return new Date(0);
        }
    }

    private formatLabel(index: number, filePath: string): string {
        const fileName = filePath.split(path.sep).pop() || 'unknown_file';
        return index === 0
            ? `$(history) Latest Backup - ${fileName}`
            : `$(history) Backup ${index + 1} - ${fileName}`;
    }

    private async showBackupPicker(
        backups: Array<{ timestamp: string; path: string; date: Date }>,
        fileName: string
    ): Promise<{ timestamp: string; path: string } | undefined> {

        return new Promise((resolve) => {

            const quickPick = vscode.window.createQuickPick();

            const items = backups.map((backup, index) => ({
                label: this.formatLabel(index, backup.path),
                description: this.formatDate(backup.date),
                detail: `Created: ${backup.date.toLocaleString()}`,
                timestamp: backup.timestamp,
                path: backup.path,
                buttons: [
                    {
                        iconPath: new vscode.ThemeIcon("edit"),
                        tooltip: "Rename Backup"
                    },
                    {
                        iconPath: new vscode.ThemeIcon("lock"),
                        tooltip: "Lock Backup"
                    }
                ]
            }));

            quickPick.items = items;
            quickPick.placeholder = `Select a backup to compare with ${fileName}`;
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;

            // Handle item selection
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0] as any;
                quickPick.hide();

                if (!selected) {
                    resolve(undefined);
                    return;
                }

                resolve({
                    timestamp: selected.timestamp,
                    path: selected.path
                });
            });

            // Handle button clicks (🔥 important part)
            quickPick.onDidTriggerItemButton(e => {
                const item = e.item as any;
                const button = e.button as vscode.QuickInputButton;

                const iconId = (button.iconPath as vscode.ThemeIcon).id;

                if (iconId === "edit") {
                    vscode.window.showInformationMessage(`Rename clicked for ${item.label}`);
                    // 👉 Add rename logic here
                }

                if (iconId === "lock") {
                    vscode.window.showInformationMessage(`Lock clicked for ${item.label}`);
                    // 👉 Add lock logic here
                }
            });

            quickPick.onDidHide(() => {
                resolve(undefined);
            });

            quickPick.show();
        });
    }

    private formatDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    private async showBackupDiff(
        currentFilePath: string,
        backup: { timestamp: string; path: string },
        fileName: string
    ): Promise<void> {
        
        const currentFileName = path.basename(currentFilePath);
        const backupFilePath = path.join(backup.path, currentFileName);

        if (!fs.existsSync(backupFilePath)) {
            vscode.window.showErrorMessage(
                `Backup file not found: ${currentFileName}\n\n` +
                `The backup folder exists but doesn't contain this file.`
            );
            return;
        }

        // Open diff editor
        await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.file(backupFilePath),
            vscode.Uri.file(currentFilePath),
            `Backup ⟷ Current - ${fileName}`,
            { preview: false }
        );

        // Show action options
        const action = await vscode.window.showInformationMessage(
            `📊 Comparing backup with current file\n\n` +
            `Left (Backup): ${this.formatDate(this.parseTimestampToDate(backup.timestamp))}\n` +
            `Right (Current): Your latest changes\n\n` +
            `Would you like to restore the backup?`,
            { modal: false },
            '⬅️ Restore Backup',
            'Keep Current'
        );

        if (action === '⬅️ Restore Backup') {
            await this.restoreBackup(currentFilePath, backupFilePath, fileName);
        }
    }

    private async restoreBackup(
        currentFilePath: string,
        backupFilePath: string,
        fileName: string
    ): Promise<void> {
        
        const confirm = await vscode.window.showWarningMessage(
            `⚠️ Restore backup for ${fileName}?\n\n` +
            `This will overwrite your current file with the backup version.\n` +
            `Your current changes will be lost!`,
            { modal: true },
            'Restore Backup',
            'Cancel'
        );

        if (confirm !== 'Restore Backup') {
            return;
        }

        try {
            // Read backup content
            const backupContent = fs.readFileSync(backupFilePath, 'utf-8');
            
            // Write to current file
            fs.writeFileSync(currentFilePath, backupContent, 'utf-8');

            vscode.window.showInformationMessage(
                `✅ Backup restored for ${fileName}\n\n` +
                `The file has been restored. You can now deploy it to the org if needed.`
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restore backup: ${error}`);
        }
    }
}
