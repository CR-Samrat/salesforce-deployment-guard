import * as vscode from 'vscode';
import * as path from 'path';
import { isSalesforceFile, getMetadataInfo } from '../utils/metadataUtils';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { showDiffAndResolve } from '../ui/diffViewer';
import { ConflictInfo } from '../types/conflict';
import { salesforceService, ConflictService, getBackupService } from '../services';
import { BackupPreferences } from '../storage/backupPreferences';

export class SafeDeployCommand {
    private conflictService: ConflictService;
    private backupPrefs: BackupPreferences;

    constructor(private context: vscode.ExtensionContext) {
        this.conflictService = new ConflictService(context);
        this.backupPrefs = new BackupPreferences(context);
    }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("No file is open");
            return;
        }

        const filePath = editor.document.fileName;
        const fileName = path.basename(filePath);

        if (!isSalesforceFile(filePath)) {
            vscode.window.showErrorMessage(`${fileName} is not a Salesforce file`);
            return;
        }

        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo) {
            vscode.window.showErrorMessage(`Unsupported Salesforce file type for deploy: ${fileName}`);
            return;
        }

        // Save if dirty
        if (editor.document.isDirty) {
            await editor.document.save();
        }

        // Check for conflicts
        let conflictInfo: ConflictInfo | undefined;
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "🔍 Checking for conflicts...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 30 });
            conflictInfo = await this.conflictService.checkForConflicts(filePath);
            progress.report({ increment: 100 });
        });

        if (conflictInfo?.hasConflict) {
            const conflictMessage = `⚠️ WARNING: Conflict Detected! ${conflictInfo.reason}\n\n` +
                `File: "${fileName}"\n` +
                `Last modified by: ${conflictInfo.modifiedBy}\n` +
                `Modified on: ${conflictInfo.modifiedDate}\n\n` +
                `Please retrieve the file first to sync with Salesforce Guard.`;

            const overwriteMessage = `⚠️ WARNING: Your local file is outdated! \n\n`+
                `${conflictInfo.reason}\n` +
                `Deploying now may overwrite changes in the org.\n\n` +
                `File: "${fileName}"\n` +
                `Modified on: ${conflictInfo.modifiedDate}\n\n` +
                `Please review your changes before proceeding.`;

            const diffCheckBtnLabel = conflictInfo.conflictType === 'conflict' ? '🔍 Resolve Conflict' : '🔎 Review Changes';

            const choice = await vscode.window.showWarningMessage(
                conflictInfo.conflictType === 'conflict' ? conflictMessage : overwriteMessage,
                { modal: true },
                diffCheckBtnLabel,
                '⬇️ Retrieve Now',
                '🚀 Deploy Anyway'
            );

            if (choice === diffCheckBtnLabel) {
                const resolved = await showDiffAndResolve(filePath, this.context);
                if (resolved) {
                    vscode.window.showInformationMessage('✅ Conflict resolved. Proceeding to deploy...');
                } else {
                    vscode.window.showInformationMessage('❌ Deployment cancelled due to unresolved conflict.');
                    return;
                }
            }

            if (!choice) {
                vscode.window.showInformationMessage('Deployment cancelled');
                return;
            }

            if (choice === '⬇️ Retrieve Now') {
                await vscode.commands.executeCommand(
                    'salesforce-deployment-guard.retrieve',
                    vscode.Uri.file(filePath)
                );
                vscode.window.showInformationMessage('✅ File retrieved. You can now deploy safely.');
                return;
            }
        }

        // Deploy the file
        vscode.window.showInformationMessage(`🚀 Deploying ${fileName}...`);

        try {
            if (metadataInfo.type === 'LightningComponentBundle') {
                const pathParts = filePath.split(/[/\\]/);
                const lwcIndex = pathParts.findIndex(part => part === 'lwc');
                const bundlePath = pathParts.slice(0, lwcIndex + 2).join(path.sep);

                await vscode.commands.executeCommand('sf.deploy.source.path', vscode.Uri.file(bundlePath));
            } else {
                await vscode.commands.executeCommand('sf.deploy.source.path', vscode.Uri.file(filePath));
            }

            // Update retrieve timestamp after successful deploy
            const retrieveMap = getRetrieveMap(this.context);
            const currentUsername = salesforceService.getCachedUsername() || 'unknown_user';
            retrieveMap.set(`${currentUsername}:${metadataInfo.name}`, new Date());
            saveRetrieveMap(this.context, retrieveMap);

            // Backup deployed file
            const currentAlias = salesforceService.getCachedAlias() || 'unknown_alias';
            if(currentAlias !== 'unknown_alias' && metadataInfo) {
                const backupEnabled = this.backupPrefs.isBackupEnabled(
                    currentAlias,
                    metadataInfo.name
                );

                if(backupEnabled) {
                    const backupService = getBackupService();
                    const backupCreated = backupService.backupDeployedFile(filePath, metadataInfo, currentAlias);
                    if (backupCreated) {
                        console.log(`📁 Backed up deployed file: ${metadataInfo.name}`);
                    } else {
                        console.warn(`❌ Failed to back up deployed file: ${metadataInfo.name}`);
                    }
                }else {
                    console.log(`⚠️ Backup not enabled for ${metadataInfo.name} under alias ${currentAlias} - skipping backup`);
                }
            }

            console.log(`✅ Updated sync timestamp for ${metadataInfo.name} after deployment`);

        } catch (error) {
            vscode.window.showErrorMessage(`❌ Deployment failed: ${error}`);
        }
    }
}