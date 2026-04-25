import * as vscode from 'vscode';
import * as path from "path";
import * as fs from "fs";
import { MetadataInfo } from '../types';
import { BackupMetadataStorage, BackupMetadata } from '../storage/backupMetadata';
import { fetchRetrieveableFiles } from '../utils/metadataUtils';

export class BackupService {
    private readonly MAX_BACKUPS = 5;
    private metadataStorage: BackupMetadataStorage;

    constructor(context: vscode.ExtensionContext) {
        this.metadataStorage = new BackupMetadataStorage(context);
    }

    backupDeployedFile(filePath: string, metadataInfo: MetadataInfo, currentAlias: string, orgId: string): boolean {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            
            if (!workspaceFolder) {
                console.log('📂 No workspace folder found - skipping backup');
                return false;
            }

            if (!fs.existsSync(filePath)) {
                console.log('📂 File not found - skipping backup');
                return false;
            }

            const filesToBackup = fetchRetrieveableFiles(metadataInfo, filePath);
            
            if (filesToBackup.length === 0) {
                console.log('📂 No files to backup - skipping');
                return false;
            }

            // Create timestamp folder
            const currentTimestamp = new Date();
            const timestamp = currentTimestamp.toISOString().replace(/:/g, '-').replace(/\./g, '-');
            const displayTimestamp = this.formatTimestampForDisplay(currentTimestamp);
            
            // Base backup directory for this component
            const componentBackupDir = path.join(
                workspaceFolder,
                '.sfguard-backup',
                currentAlias,
                metadataInfo.type,
                metadataInfo.name
            );

            // Timestamp-specific backup folder
            const timestampBackupDir = path.join(componentBackupDir, timestamp);

            // Create timestamp directory
            if (!fs.existsSync(timestampBackupDir)) {
                fs.mkdirSync(timestampBackupDir, { recursive: true });
            }

            // Backup each file
            let backupCount = 0;
            for (const fileName of filesToBackup) {
                const sourceFilePath = path.join(path.dirname(filePath), fileName);
                
                if (!fs.existsSync(sourceFilePath)) {
                    console.log(`⚠️ File not found, skipping: ${fileName}`);
                    continue;
                }

                const fileContent = fs.readFileSync(sourceFilePath, 'utf-8');
                const backupFilePath = path.join(timestampBackupDir, fileName);

                // Write backup file
                fs.writeFileSync(backupFilePath, fileContent, 'utf-8');
                console.log(`✅ Backed up: ${fileName}`);
                backupCount++;
            }

            if (backupCount > 0) {
                // Save metadata for this backup
                const backupMetadata: BackupMetadata = {
                    timestamp: timestamp,
                    displayName: displayTimestamp,
                    isLocked: false,
                    createdAt: new Date(),
                    folderName: timestamp
                };
                
                this.metadataStorage.saveBackupMetadata(
                    orgId,
                    metadataInfo.type,
                    metadataInfo.name,
                    timestamp,
                    backupMetadata,
                    currentAlias
                );

                // Cleanup old backups (respecting locks)
                this.cleanupOldBackups(componentBackupDir, orgId, currentAlias, metadataInfo.type, metadataInfo.name);
                
                console.log(`✅ Backup created: ${timestampBackupDir}`);
                return true;
            } else {
                console.log('⚠️ No files were backed up');
                return false;
            }

        } catch (error) {
            console.error("❌ Error occurred while backing up deployed file:", error);
            return false;
        }
    }

    private cleanupOldBackups(
        componentBackupDir: string,
        orgId: string,
        alias: string,
        metadataType: string,
        componentName: string
    ): void {
        try {
            if (!fs.existsSync(componentBackupDir)) {
                return;
            }

            // Get folders to delete (respecting locks)
            const foldersToDelete = this.metadataStorage.getBackupsToDelete(
                orgId,
                metadataType,
                componentName,
                this.MAX_BACKUPS,
                alias
            );

            // Delete the folders
            for (const folderName of foldersToDelete) {
                const folderPath = path.join(componentBackupDir, folderName);
                this.deleteFolder(folderPath);
                
                // Delete metadata
                this.metadataStorage.deleteBackupMetadata(
                    orgId,
                    metadataType,
                    componentName,
                    folderName,
                    alias
                );
                
                console.log(`🗑️ Deleted old backup: ${folderName}`);
            }

            if (foldersToDelete.length > 0) {
                console.log(`✅ Cleaned up ${foldersToDelete.length} old backup(s)`);
            }

        } catch (error) {
            console.error('⚠️ Error cleaning up old backups:', error);
        }
    }

    private deleteFolder(folderPath: string): void {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach(file => {
                const filePath = path.join(folderPath, file);
                if (fs.statSync(filePath).isDirectory()) {
                    this.deleteFolder(filePath);  // Recursive
                } else {
                    fs.unlinkSync(filePath);
                }
            });
            fs.rmdirSync(folderPath);
        }
    }

    private formatTimestampForDisplay(date: Date): string {
        // Parse the timestamp
        const options: Intl.DateTimeFormatOptions = {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };

        return date.toLocaleString('en-US', options);
    }

    getMetadataStorage(): BackupMetadataStorage {
        return this.metadataStorage;
    }
}
