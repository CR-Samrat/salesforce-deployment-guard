import * as vscode from 'vscode';
import { salesforceService } from './salesforceService';
import { BackupService } from './backupService';
import { deployService } from './deployService';
import { retrieveService } from './retrieveService';
import { sfGuardOutput } from './outputChannel';

let backupServiceInstance: BackupService | null = null;

export function initializeServices(context: vscode.ExtensionContext): void {
    sfGuardOutput.initialize();
    context.subscriptions.push({ dispose: () => sfGuardOutput.dispose() });

    backupServiceInstance = new BackupService(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            sfGuardOutput.info('Workspace changed. Clearing Salesforce connection cache.');
            salesforceService.clearCache();
        })
    );

    sfGuardOutput.info('Services initialized.');
}

export function getBackupService(): BackupService {
    if (!backupServiceInstance) {
        throw new Error('BackupService not initialized');
    }
    return backupServiceInstance;
}

export { salesforceService } from './salesforceService';
export { ConflictService } from './conflictService';
export { BackupService } from './backupService';
export { deployService } from './deployService';
export { retrieveService } from './retrieveService';
export { sfGuardOutput } from './outputChannel';
