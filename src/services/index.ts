import * as vscode from 'vscode';
import { salesforceService } from './salesforceService';

export function initializeServices(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            console.log('📂 Workspace changed - clearing SF connection cache');
            salesforceService.clearCache();
        })
    );

    console.log('✅ Services initialized');
}

// Export services
export { salesforceService } from './salesforceService';
export { ConflictService } from './conflictService';