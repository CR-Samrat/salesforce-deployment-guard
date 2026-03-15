import * as vscode from 'vscode';

export class BackupPreferences {
    private readonly STORAGE_KEY = 'sfguard_backup_enabled_files';
    
    constructor(private context: vscode.ExtensionContext) {}

    isBackupEnabled(alias: string, fileName: string): boolean {
        const enabledFiles = this.getEnabledFiles();
        const key = `${alias}:${fileName}`;
        return enabledFiles[key] === true;
    }

    enableBackup(alias: string, fileName: string): void {
        const enabledFiles = this.getEnabledFiles();
        const key = `${alias}:${fileName}`;
        enabledFiles[key] = true;
        this.saveEnabledFiles(enabledFiles);
    }

    disableBackup(alias: string, fileName: string): void {
        const enabledFiles = this.getEnabledFiles();
        const key = `${alias}:${fileName}`;
        enabledFiles[key] = false;
        this.saveEnabledFiles(enabledFiles);
    }

    toggleBackup(alias: string, fileName: string): boolean {
        const currentState = this.isBackupEnabled(alias, fileName);
        const newState = !currentState;
        
        if (newState) {
            this.enableBackup(alias, fileName);
        } else {
            this.disableBackup(alias, fileName);
        }
        
        return newState;
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