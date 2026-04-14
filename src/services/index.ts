import * as vscode from 'vscode';
import { salesforceService } from './salesforceService';
import { BackupService } from './backupService';
import { deployService } from './deployService';
import { retrieveService } from './retrieveService';

let backupServiceInstance: BackupService | null = null;

export function initializeServices(context: vscode.ExtensionContext): void {
    // Initialize BackupService with context
    backupServiceInstance = new BackupService(context);

    // Workspace change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            console.log('📂 Workspace changed - clearing SF connection cache');
            salesforceService.clearCache();
        })
    );

    console.log('✅ Services initialized');
}

export function getBackupService(): BackupService {
    if (!backupServiceInstance) {
        throw new Error('BackupService not initialized');
    }
    return backupServiceInstance;
}

// Export services
export { salesforceService } from './salesforceService';
export { ConflictService } from './conflictService';
export { BackupService } from './backupService';
export { deployService } from './deployService';
export { retrieveService } from './retrieveService';