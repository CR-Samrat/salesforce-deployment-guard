import * as vscode from 'vscode';

export class BackupPreferences {
    private readonly STORAGE_KEY = 'sfguard_backup_enabled_files';
    
    constructor(private context: vscode.ExtensionContext) {}

    isBackupEnabled(orgId: string, metadataType: string, componentName: string, legacyAlias?: string): boolean {
        const enabledFiles = this.getEnabledFiles();
        const key = this.getKey(orgId, metadataType, componentName);

        if (enabledFiles[key] === true) {
            return true;
        }

        if (legacyAlias) {
            const legacyKey = this.getLegacyKey(legacyAlias, componentName);
            if (enabledFiles[legacyKey] === true) {
                enabledFiles[key] = true;
                delete enabledFiles[legacyKey];
                this.saveEnabledFiles(enabledFiles);
                return true;
            }
        }

        return false;
    }

    enableBackup(orgId: string, metadataType: string, componentName: string, legacyAlias?: string): void {
        const enabledFiles = this.getEnabledFiles();
        const key = this.getKey(orgId, metadataType, componentName);
        enabledFiles[key] = true;

        if (legacyAlias) {
            delete enabledFiles[this.getLegacyKey(legacyAlias, componentName)];
        }

        this.saveEnabledFiles(enabledFiles);
    }

    disableBackup(orgId: string, metadataType: string, componentName: string, legacyAlias?: string): void {
        const enabledFiles = this.getEnabledFiles();
        const key = this.getKey(orgId, metadataType, componentName);
        enabledFiles[key] = false;

        if (legacyAlias) {
            delete enabledFiles[this.getLegacyKey(legacyAlias, componentName)];
        }

        this.saveEnabledFiles(enabledFiles);
    }

    toggleBackup(orgId: string, metadataType: string, componentName: string, legacyAlias?: string): boolean {
        const currentState = this.isBackupEnabled(orgId, metadataType, componentName, legacyAlias);
        const newState = !currentState;
        
        if (newState) {
            this.enableBackup(orgId, metadataType, componentName, legacyAlias);
        } else {
            this.disableBackup(orgId, metadataType, componentName, legacyAlias);
        }
        
        return newState;
    }

    private getKey(orgId: string, metadataType: string, componentName: string): string {
        return `${orgId}:${metadataType}:${componentName}`;
    }

    private getLegacyKey(alias: string, componentName: string): string {
        return `${alias}:${componentName}`;
    }

    private getEnabledFiles(): Record<string, boolean> {
        return this.context.workspaceState.get<Record<string, boolean>>(
            this.STORAGE_KEY,
            {}
        );
    }

    private saveEnabledFiles(files: Record<string, boolean>): void {
        this.context.workspaceState.update(this.STORAGE_KEY, files);
    }
}
