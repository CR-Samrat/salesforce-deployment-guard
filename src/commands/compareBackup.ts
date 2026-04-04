import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMetadataInfo } from '../utils/metadataUtils';
import { salesforceService } from '../services/salesforceService';
import { BackupMetadataStorage } from '../storage/backupMetadata';

interface quickPickMetadata{
    alias: string;
    metadataInfo: any;
    folderName: string;
    backupDir: string;
    filePath: string;
}
export class CompareBackupCommand {
    private metadataStorage: BackupMetadataStorage;

    constructor(private context: vscode.ExtensionContext) {
        this.metadataStorage = new BackupMetadataStorage(context);
    }

    async execute(uri?: vscode.Uri): Promise<void> {
        try {
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

            const currentAlias = await salesforceService.getCurrentAlias();
            if (!currentAlias) {
                vscode.window.showErrorMessage('No active Salesforce org');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            // Get backup directory
            const backupDir = path.join(
                workspaceFolder,
                '.sfguard-backup',
                currentAlias,
                metadataInfo.type,
                metadataInfo.name
            );

            if (!fs.existsSync(backupDir)) {
                vscode.window.showInformationMessage('No backups found for this file');
                return;
            }

            // Show backup picker with rename and lock options
            await this.showBackupPicker(filePath, backupDir, currentAlias, metadataInfo);

        } catch (error) {
            console.error('Error comparing backup:', error);
            vscode.window.showErrorMessage(`Failed to compare backup: ${error}`);
        }
    }

    private async showBackupPicker(
        filePath: string,
        backupDir: string,
        alias: string,
        metadataInfo: any
    ): Promise<void> {
        // Get all backups with metadata
        const backups = this.metadataStorage.getSortedBackups(
            alias,
            metadataInfo.type,
            metadataInfo.name
        );

        if (backups.length === 0) {
            vscode.window.showInformationMessage('No backups found');
            return;
        }

        // Create QuickPick items
        const items: vscode.QuickPickItem[] = backups.map(backup => {
            const lockIcon = backup.isLocked ? '🔒 ' : '';
            const timeAgo = this.getTimeAgo(backup.createdAt);
            
            return {
                label: `${lockIcon}${backup.displayName}`,
                description: timeAgo,
                detail: backup.isLocked ? 'Locked from deletion' : '',
                buttons: [
                    {
                        iconPath: new vscode.ThemeIcon('edit'),
                        tooltip: 'Rename backup'
                    },
                    {
                        iconPath: new vscode.ThemeIcon(backup.isLocked ? 'unlock' : 'lock'),
                        tooltip: backup.isLocked ? 'Unlock backup' : 'Lock backup'
                    },
                    {
                        iconPath: new vscode.ThemeIcon('diff'),
                        tooltip: 'Compare with current'
                    },
                    {
                        iconPath: new vscode.ThemeIcon('trash'),
                        tooltip: 'Delete this backup'
                    }
                ]
            } as any; // We'll store folderName in a custom property
        });

        // Add folderName to items (not part of QuickPickItem interface)
        items.forEach((item, index) => {
            (item as any).folderName = backups[index].folderName;
        });

        const quickPick = vscode.window.createQuickPick();
        quickPick.items = items;
        quickPick.title = `Backups for ${metadataInfo.name}`;
        quickPick.placeholder = 'Select a backup to compare, rename, or lock';
        quickPick.canSelectMany = false;

        // Handle button clicks
        quickPick.onDidTriggerItemButton(async (event) => {
            const item = event.item as any;
            const quickPickInfo: quickPickMetadata = {
                alias: alias,
                metadataInfo: metadataInfo,
                folderName: item.folderName,
                backupDir: backupDir,
                filePath: filePath
            };
            const buttonIndex = (item.buttons || []).indexOf(event.button);

            switch (buttonIndex) {
                case 0: // Rename
                    await this.handleRename(quickPickInfo, quickPick);
                    break;
                case 1: // Lock/Unlock
                    await this.handleToggleLock(quickPickInfo, quickPick);
                    break;
                case 2: // Compare
                    await this.handleCompare(quickPickInfo);
                    quickPick.hide();
                    break;
                case 3: // Delete
                    await this.handleDelete(quickPickInfo);
                    quickPick.hide();
                    break;
            }
        });

        // Handle selection (default action: compare)
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0] as any;
            if (selected) {
                await this.handleCompare({alias, metadataInfo, folderName: selected.folderName, backupDir, filePath});
                quickPick.hide();
            }
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }

    private async handleRename(
        quickPickInfo: quickPickMetadata,
        quickPick: vscode.QuickPick<vscode.QuickPickItem>
    ): Promise<void> {
        // Get current name
        const metadata = this.metadataStorage.getBackupMetadata(
            quickPickInfo.alias,
            quickPickInfo.metadataInfo.type,
            quickPickInfo.metadataInfo.name
        );
        const currentName = metadata[quickPickInfo.folderName]?.displayName || quickPickInfo.folderName;

        // Show input box
        const newName = await vscode.window.showInputBox({
            title: 'Rename Backup',
            prompt: 'Enter a new name for this backup',
            //value: metadata[quickPickInfo.folderName]?.customName || '',
            value: currentName,
            placeHolder: 'e.g., GR02-Bug Fixes Backup',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Name cannot be empty';
                }
                if (value.length > 100) {
                    return 'Name too long (max 100 characters)';
                }
                return undefined;
            }
        });

        if (newName) {
            // Save new name
            const success = this.metadataStorage.renameBackup(
                quickPickInfo.alias,
                quickPickInfo.metadataInfo.type,
                quickPickInfo.metadataInfo.name,
                quickPickInfo.folderName,
                newName
            );

            if (success) {
                vscode.window.showInformationMessage(`✅ Backup renamed to "${newName}"`);
                
                // Refresh the quick pick
                quickPick.hide();
                // Re-open with updated names
                await this.showBackupPicker(
                    quickPickInfo.filePath,
                    quickPickInfo.backupDir,
                    quickPickInfo.alias,
                    quickPickInfo.metadataInfo
                );
            } else {
                vscode.window.showErrorMessage('Failed to rename backup');
            }
        }
    }

    private async handleToggleLock(
        quickPickInfo: quickPickMetadata,
        quickPick: vscode.QuickPick<vscode.QuickPickItem>
    ): Promise<void> {
        const newLockStatus = this.metadataStorage.toggleLock(
            quickPickInfo.alias,
            quickPickInfo.metadataInfo.type,
            quickPickInfo.metadataInfo.name,
            quickPickInfo.folderName
        );

        const statusText = newLockStatus ? 'locked' : 'unlocked';
        const icon = newLockStatus ? '🔒' : '🔓';
        
        vscode.window.showInformationMessage(
            `${icon} Backup ${statusText}${newLockStatus ? ' - Protected from deletion' : ''}`
        );

        // Refresh the quick pick
        quickPick.hide();
        // Re-open with updated lock status
        await this.showBackupPicker(
            quickPickInfo.filePath,
            quickPickInfo.backupDir,
            quickPickInfo.alias,
            quickPickInfo.metadataInfo
        );
    }

    private async handleCompare(
        quickPickInfo: quickPickMetadata
    ): Promise<void> {
        const backupFolderPath = path.join(quickPickInfo.backupDir, quickPickInfo.folderName);
        const fileName = path.basename(quickPickInfo.filePath);
        const backupFilePath = path.join(backupFolderPath, fileName);

        if (!fs.existsSync(backupFilePath)) {
            vscode.window.showErrorMessage('Backup file not found');
            return;
        }

        // Open diff viewer
        const currentUri = vscode.Uri.file(quickPickInfo.filePath);
        const backupUri = vscode.Uri.file(backupFilePath);

        await vscode.commands.executeCommand(
            'vscode.diff',
            backupUri,
            currentUri,
            `${fileName} ← Backup vs Current`
        );
    }

    private async handleDelete(
        quickPickInfo: quickPickMetadata
    ): Promise<void> {
        // Confirm delete
        const confirm = await vscode.window.showWarningMessage(
            'Delete this backup? This action cannot be undone.',
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            const backupFolderPath = path.join(quickPickInfo.backupDir, quickPickInfo.folderName);
            const backupFilePart = quickPickInfo.backupDir.split(path.sep);
            const componentName = backupFilePart[backupFilePart.length - 1];
            const metadataType = backupFilePart[backupFilePart.length - 2];
            const currentAlias = backupFilePart[backupFilePart.length - 3];

            if (!fs.existsSync(backupFolderPath)) {
                vscode.window.showErrorMessage('Backup file not found. It may have already been deleted.');
                this.metadataStorage.deleteBackupMetadata(currentAlias, metadataType, componentName, quickPickInfo.folderName);

                vscode.window.showInformationMessage('✅ Backup Deleted successfully');
                return;
            }

        
            this.deleteFolder(backupFolderPath);
            this.metadataStorage.deleteBackupMetadata(currentAlias, metadataType, componentName, quickPickInfo.folderName);
            vscode.window.showInformationMessage('✅ Backup Deleted successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete backup: ${error}`);
        }
    }

    private deleteFolder(folderPath: string): void {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach(file => {
                const filePath = path.join(folderPath, file);
                if (fs.statSync(filePath).isDirectory()) {
                    this.deleteFolder(filePath);
                } else {
                    fs.unlinkSync(filePath);
                }
            });
            fs.rmdirSync(folderPath);
        }
    }

    private getTimeAgo(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {return 'Just now';}
        if (diffMins < 60) {return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;}
        if (diffHours < 24) {return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;}
        if (diffDays < 7) {return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;}
        if (diffDays < 30) {return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;}
        
        return date.toLocaleDateString();
    }
}