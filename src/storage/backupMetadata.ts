import * as vscode from 'vscode';

export interface BackupMetadata {
    timestamp: string;           // Original timestamp (2026-03-15T04-48-07-695Z)
    customName?: string;         // User-defined name (GR02-Bug Fixes Backup)
    displayName: string;         // What to show in UI
    isLocked: boolean;          // Locked from deletion
    createdAt: Date;            // Actual creation date
    folderName: string;         // Folder name on disk
}

export class BackupMetadataStorage {
    private readonly STORAGE_KEY = 'sfguard_backup_metadata';
    
    constructor(private context: vscode.ExtensionContext) {}

    getBackupMetadata(alias: string, metadataType: string, componentName: string): Record<string, BackupMetadata> {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(alias, metadataType, componentName);
        return allMetadata[key] || {};
    }

    saveBackupMetadata(
        alias: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        metadata: BackupMetadata
    ): void {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(alias, metadataType, componentName);
        
        if (!allMetadata[key]) {
            allMetadata[key] = {};
        }
        
        allMetadata[key][folderName] = metadata;
        this.saveAllMetadata(allMetadata);
    }

    renameBackup(
        alias: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        newName: string
    ): boolean {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(alias, metadataType, componentName);
        
        if (!allMetadata[key] || !allMetadata[key][folderName]) {
            return false;
        }
        
        allMetadata[key][folderName].customName = newName;
        allMetadata[key][folderName].displayName = newName;
        
        this.saveAllMetadata(allMetadata);
        return true;
    }

    toggleLock(
        alias: string,
        metadataType: string,
        componentName: string,
        folderName: string
    ): boolean {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(alias, metadataType, componentName);
        
        if (!allMetadata[key] || !allMetadata[key][folderName]) {
            return false;
        }
        
        const currentLockStatus = allMetadata[key][folderName].isLocked;
        allMetadata[key][folderName].isLocked = !currentLockStatus;
        
        this.saveAllMetadata(allMetadata);
        return !currentLockStatus; // Return new status
    }

    isLocked(
        alias: string,
        metadataType: string,
        componentName: string,
        folderName: string
    ): boolean {
        const metadata = this.getBackupMetadata(alias, metadataType, componentName);
        return metadata[folderName]?.isLocked || false;
    }

    deleteBackupMetadata(
        alias: string,
        metadataType: string,
        componentName: string,
        folderName: string
    ): void {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(alias, metadataType, componentName);
        
        if (allMetadata[key]) {
            delete allMetadata[key][folderName];
            this.saveAllMetadata(allMetadata);
        }
    }

    getSortedBackups(
        alias: string,
        metadataType: string,
        componentName: string
    ): BackupMetadata[] {
        const metadata = this.getBackupMetadata(alias, metadataType, componentName);
        
        return Object.values(metadata).sort((a, b) => {
            // Locked backups first
            if (a.isLocked && !b.isLocked) {return -1;}
            if (!a.isLocked && b.isLocked) {return 1;}
            
            // Then by creation date (newest first)
            return b.createdAt.getTime() - a.createdAt.getTime();
        });
    }

    getBackupsToDelete(
        alias: string,
        metadataType: string,
        componentName: string,
        maxBackups: number
    ): string[] {
        const metadata = this.getBackupMetadata(alias, metadataType, componentName);
        const backups = Object.entries(metadata);
        
        // Separate locked and unlocked
        const locked = backups.filter(([_, meta]) => meta.isLocked);
        const unlocked = backups.filter(([_, meta]) => !meta.isLocked);
        
        // Sort unlocked by date (oldest first for deletion)
        unlocked.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
        
        // Calculate how many to delete
        const totalBackups = locked.length + unlocked.length;
        const backupsToDelete = totalBackups - maxBackups;
        
        if (backupsToDelete <= 0) {
            return [];
        }
        
        // Delete oldest unlocked backups
        return unlocked.slice(0, backupsToDelete).map(([folderName, _]) => folderName);
    }

    private getKey(alias: string, metadataType: string, componentName: string): string {
        return `${alias}:${metadataType}:${componentName}`;
    }

    private getAllMetadata(): Record<string, Record<string, BackupMetadata>> {
        const data = this.context.workspaceState.get<Record<string, Record<string, BackupMetadata>>>(
            this.STORAGE_KEY,
            {}
        );

        // Convert createdAt back to Date
        for (const key in data) {
            for (const folder in data[key]) {
                const meta = data[key][folder];
                meta.createdAt = new Date(meta.createdAt as any);
            }
        }

        return data;
    }

    private saveAllMetadata(metadata: Record<string, Record<string, BackupMetadata>>): void {
        this.context.workspaceState.update(this.STORAGE_KEY, metadata);
    }
}
