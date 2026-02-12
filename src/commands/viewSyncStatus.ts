import * as vscode from 'vscode';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { getTimeAgo } from '../utils/dateUtils';

export class ViewSyncStatusCommand {
    constructor(private context: vscode.ExtensionContext) {}

    async execute(): Promise<void> {
        const retrieveMap = getRetrieveMap(this.context);
        
        if (retrieveMap.size === 0) {
            vscode.window.showInformationMessage(
                '📋 No files have been tracked yet.\n\nUse "SF Guard: Tracked Retrieve" to start tracking files.'
            );
            return;
        }
        
        // Convert map to array and sort by date
        const entries = Array.from(retrieveMap.entries())
            .map(([fileName, timestamp]) => ({
                fileName,
                timestamp,
                timeAgo: getTimeAgo(timestamp),
                dateString: timestamp.toLocaleString()
            }))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        // Create quick pick items
        const items: vscode.QuickPickItem[] = entries.map(entry => ({
            label: `📄 ${entry.fileName}`,
            description: entry.timeAgo,
            detail: `Last synced: ${entry.dateString}`,
            fileName: entry.fileName
        } as any));
        
        // Add header item
        const headerItem: vscode.QuickPickItem = {
            label: `📊 Sync Status - ${entries.length} file${entries.length !== 1 ? 's' : ''} tracked`,
            kind: vscode.QuickPickItemKind.Separator
        };
        
        // Add action items at the bottom
        const clearAllItem: vscode.QuickPickItem = {
            label: '🗑️ Clear All Tracked Files',
            description: 'Remove all sync timestamps',
            detail: 'This will not delete files, only remove tracking data'
        };
        
        const separatorItem: vscode.QuickPickItem = {
            label: 'Actions',
            kind: vscode.QuickPickItemKind.Separator
        };
        
        // Show quick pick
        const selected = await vscode.window.showQuickPick(
            [headerItem, ...items, separatorItem, clearAllItem],
            {
                placeHolder: 'Select a file to clear its sync status, or choose an action',
                title: 'SF Guard: Sync Status'
            }
        );
        
        if (!selected) {
            return;
        }
        
        // Handle clear all
        if (selected === clearAllItem) {
            const confirm = await vscode.window.showWarningMessage(
                '⚠️ Clear all sync timestamps?\n\nThis will remove tracking for all files. Files will not be deleted.',
                { modal: true },
                'Clear All',
                'Cancel'
            );
            
            if (confirm === 'Clear All') {
                saveRetrieveMap(this.context, new Map());
                vscode.window.showInformationMessage('✅ All sync timestamps cleared');
            }
            return;
        }
        
        // Handle individual file
        const selectedFileName = (selected as any).fileName;
        if (selectedFileName) {
            const confirm = await vscode.window.showWarningMessage(
                `Clear sync status for "${selectedFileName}"?`,
                'Clear',
                'Cancel'
            );
            
            if (confirm === 'Clear') {
                retrieveMap.delete(selectedFileName);
                saveRetrieveMap(this.context, retrieveMap);
                vscode.window.showInformationMessage(`✅ Sync status cleared for ${selectedFileName}`);
            }
        }
    }
}