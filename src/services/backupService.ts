import * as vscode from 'vscode';
import * as path from "path";
import * as fs from "fs";
import { MetadataInfo } from '../types';

export class BackupService {
    private readonly MAX_BACKUPS = 5;

    constructor() {}

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
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
            
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

                // Write backup file (clean filename!)
                fs.writeFileSync(backupFilePath, fileContent, 'utf-8');
                console.log(`✅ Backed up: ${fileName}`);
                backupCount++;
            }

            if (backupCount > 0) {
                this.cleanupOldBackups(componentBackupDir);
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

    private cleanupOldBackups(componentBackupDir: string): void {
        try {
            if (!fs.existsSync(componentBackupDir)) {
                return;
            }

            // Get all backup folders (timestamps)
            const backupFolders = fs.readdirSync(componentBackupDir)
                .filter(item => {
                    const fullPath = path.join(componentBackupDir, item);
                    return fs.statSync(fullPath).isDirectory();
                })
                .map(folder => ({
                    name: folder,
                    path: path.join(componentBackupDir, folder),
                    timestamp: fs.statSync(path.join(componentBackupDir, folder)).mtime
                }))
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Newest first

            // Keep only MAX_BACKUPS, delete the rest
            if (backupFolders.length > this.MAX_BACKUPS) {
                const foldersToDelete = backupFolders.slice(this.MAX_BACKUPS);
                
                for (const folder of foldersToDelete) {
                    this.deleteFolder(folder.path);
                    console.log(`🗑️ Deleted old backup: ${folder.name}`);
                }

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
}

export const backupService = new BackupService();