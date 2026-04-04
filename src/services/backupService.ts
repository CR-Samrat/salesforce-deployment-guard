import * as vscode from 'vscode';
import * as path from "path";
import * as fs from "fs";
import { MetadataInfo } from '../types';
import { BackupMetadataStorage, BackupMetadata } from '../storage/backupMetadata';

export class BackupService {
    private readonly MAX_BACKUPS = 5;
    private metadataStorage: BackupMetadataStorage;

    constructor(context: vscode.ExtensionContext) {
        this.metadataStorage = new BackupMetadataStorage(context);
    }

    fetchRetrieveableFiles(metadataInfo: MetadataInfo, filePath: string): string[] {
        if (!metadataInfo) {
            console.log('📂 No metadata info available - skipping backup');
            return [];
        }

        switch (metadataInfo.type) {
            case "ApexClass":
                return [
                    metadataInfo.name + '.cls',
                    metadataInfo.name + '.cls-meta.xml'
                ];

            case "ApexTrigger":
                return [
                    metadataInfo.name + '.trigger',
                    metadataInfo.name + '.trigger-meta.xml'
                ];

            case "ApexPage":
                return [
                    metadataInfo.name + '.page',
                    metadataInfo.name + '.page-meta.xml'
                ];

            case "ApexComponent":
                return [
                    metadataInfo.name + '.component',
                    metadataInfo.name + '.component-meta.xml'
                ];

            case "LightningComponentBundle":
                return this.getBundleFiles(filePath, 'LWC');

            case "AuraDefinitionBundle":
                return this.getBundleFiles(filePath, 'Aura');

            default:
                console.log(`📂 Unsupported metadata type: ${metadataInfo.type} - skipping backup`);
                return [];
        }
    }

    private getBundleFiles(filePath: string, bundleType: 'LWC' | 'Aura'): string[] {
        try {
            const bundleDirPath = path.dirname(filePath);
        
            if (!fs.existsSync(bundleDirPath)) {
                console.log(`⚠️ Bundle directory not found: ${bundleDirPath}`);
                return [];
            }

            const allFiles = fs.readdirSync(bundleDirPath);
        
            // Filter out unwanted files
            const filteredFiles = allFiles.filter(file => {
                // Skip hidden files (.DS_Store, .git, etc.)
                if (file.startsWith('.')) {
                    return false;
                }
            
                // Skip node_modules
                if (file === 'node_modules') {
                    return false;
                }
            
                // For LWC: only .js, .html, .css, .xml, .svg files
                if (bundleType === 'LWC') {
                    const ext = path.extname(file).toLowerCase();
                    return ['.js', '.html', '.css', '.xml', '.svg'].includes(ext);
                }
            
                // For Aura: only Aura-specific extensions
                if (bundleType === 'Aura') {
                    const ext = path.extname(file).toLowerCase();
                    return [
                        '.cmp', '.app', '.evt', '.intf',
                        '.js', '.css', '.design', '.svg',
                        '.auradoc', '.tokens', '.xml'
                    ].includes(ext);
                }
            
                return true;
            });

            console.log(`📂 Found ${filteredFiles.length} ${bundleType} file(s) for backup: ${filteredFiles.join(', ')}`);
            return filteredFiles;

        } catch (error) {
            console.error(`❌ Error reading ${bundleType} bundle directory:`, error);
            return [];
        }
    }

    backupDeployedFile(filePath: string, metadataInfo: MetadataInfo, currentAlias: string): boolean {
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

            const filesToBackup = this.fetchRetrieveableFiles(metadataInfo, filePath);
            
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
                    currentAlias,
                    metadataInfo.type,
                    metadataInfo.name,
                    timestamp,
                    backupMetadata
                );

                // Cleanup old backups (respecting locks)
                this.cleanupOldBackups(componentBackupDir, currentAlias, metadataInfo.type, metadataInfo.name);
                
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
                alias,
                metadataType,
                componentName,
                this.MAX_BACKUPS
            );

            // Delete the folders
            for (const folderName of foldersToDelete) {
                const folderPath = path.join(componentBackupDir, folderName);
                this.deleteFolder(folderPath);
                
                // Delete metadata
                this.metadataStorage.deleteBackupMetadata(
                    alias,
                    metadataType,
                    componentName,
                    folderName
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