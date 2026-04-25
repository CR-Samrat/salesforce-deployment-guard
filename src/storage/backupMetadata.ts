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

    getBackupMetadata(
        orgId: string,
        metadataType: string,
        componentName: string,
        legacyAlias?: string
    ): Record<string, BackupMetadata> {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(orgId, metadataType, componentName);

        if (allMetadata[key]) {
            return allMetadata[key];
        }

        if (legacyAlias) {
            const legacyKey = this.getLegacyKey(legacyAlias, metadataType, componentName);
            if (allMetadata[legacyKey]) {
                allMetadata[key] = allMetadata[legacyKey];
                delete allMetadata[legacyKey];
                this.saveAllMetadata(allMetadata);
                return allMetadata[key];
            }
        }

        return {};
    }

    saveBackupMetadata(
        orgId: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        metadata: BackupMetadata,
        legacyAlias?: string
    ): void {
        const allMetadata = this.getAllMetadata();
        const key = this.getKey(orgId, metadataType, componentName);
        
        if (!allMetadata[key]) {
            allMetadata[key] = {};
        }
        
        allMetadata[key][folderName] = metadata;

        if (legacyAlias) {
            delete allMetadata[this.getLegacyKey(legacyAlias, metadataType, componentName)];
        }

        this.saveAllMetadata(allMetadata);
    }

    renameBackup(
        orgId: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        newName: string,
        legacyAlias?: string
    ): boolean {
        const allMetadata = this.getAllMetadata();
        const key = this.getResolvedKey(allMetadata, orgId, metadataType, componentName, legacyAlias);
        
        if (!allMetadata[key] || !allMetadata[key][folderName]) {
            return false;
        }
        
        allMetadata[key][folderName].customName = newName;
        allMetadata[key][folderName].displayName = newName;
        
        this.saveAllMetadata(allMetadata);
        return true;
    }

    toggleLock(
        orgId: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        legacyAlias?: string
    ): boolean {
        const allMetadata = this.getAllMetadata();
        const key = this.getResolvedKey(allMetadata, orgId, metadataType, componentName, legacyAlias);
        
        if (!allMetadata[key] || !allMetadata[key][folderName]) {
            return false;
        }
        
        const currentLockStatus = allMetadata[key][folderName].isLocked;
        allMetadata[key][folderName].isLocked = !currentLockStatus;
        
        this.saveAllMetadata(allMetadata);
        return !currentLockStatus; // Return new status
    }

    isLocked(
        orgId: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        legacyAlias?: string
    ): boolean {
        const metadata = this.getBackupMetadata(orgId, metadataType, componentName, legacyAlias);
        return metadata[folderName]?.isLocked || false;
    }

    deleteBackupMetadata(
        orgId: string,
        metadataType: string,
        componentName: string,
        folderName: string,
        legacyAlias?: string
    ): void {
        const allMetadata = this.getAllMetadata();
        const key = this.getResolvedKey(allMetadata, orgId, metadataType, componentName, legacyAlias);
        
        if (allMetadata[key]) {
            delete allMetadata[key][folderName];
            this.saveAllMetadata(allMetadata);
        }
    }

    getSortedBackups(
        orgId: string,
        metadataType: string,
        componentName: string,
        legacyAlias?: string
    ): BackupMetadata[] {
        const metadata = this.getBackupMetadata(orgId, metadataType, componentName, legacyAlias);
        
        return Object.values(metadata).sort((a, b) => {
            // Locked backups first
            if (a.isLocked && !b.isLocked) {return -1;}
            if (!a.isLocked && b.isLocked) {return 1;}
            
            // Then by creation date (newest first)
            return b.createdAt.getTime() - a.createdAt.getTime();
        });
    }

    getBackupsToDelete(
        orgId: string,
        metadataType: string,
        componentName: string,
        maxBackups: number,
        legacyAlias?: string
    ): string[] {
        const metadata = this.getBackupMetadata(orgId, metadataType, componentName, legacyAlias);
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

    private getKey(orgId: string, metadataType: string, componentName: string): string {
        return `${orgId}:${metadataType}:${componentName}`;
    }

    private getLegacyKey(alias: string, metadataType: string, componentName: string): string {
        return `${alias}:${metadataType}:${componentName}`;
    }

    private getResolvedKey(
        allMetadata: Record<string, Record<string, BackupMetadata>>,
        orgId: string,
        metadataType: string,
        componentName: string,
        legacyAlias?: string
    ): string {
        const key = this.getKey(orgId, metadataType, componentName);
        if (allMetadata[key]) {
            return key;
        }

        if (legacyAlias) {
            const legacyKey = this.getLegacyKey(legacyAlias, metadataType, componentName);
            if (allMetadata[legacyKey]) {
                allMetadata[key] = allMetadata[legacyKey];
                delete allMetadata[legacyKey];
                this.saveAllMetadata(allMetadata);
                return key;
            }
        }

        return key;
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
