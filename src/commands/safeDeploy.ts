import * as vscode from 'vscode';
import * as path from 'path';
import { fetchRetrieveableFiles, getMetadataInfo } from '../utils/metadataUtils';
import { buildLegacyRetrieveMapKey, buildRetrieveMapKey, getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { showDiffAndResolve } from '../ui/diffViewer';
import { ConflictInfo } from '../types/conflict';
import { salesforceService, ConflictService, getBackupService, deployService, sfGuardOutput } from '../services';
import { BackupPreferences } from '../storage/backupPreferences';

export class SafeDeployCommand {
    private conflictService: ConflictService;
    private backupPrefs: BackupPreferences;

    constructor(private context: vscode.ExtensionContext) {
        this.conflictService = new ConflictService(context);
        this.backupPrefs = new BackupPreferences(context);
    }

    async execute(uri?: vscode.Uri): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const filePath = uri?.fsPath || editor?.document.fileName;

        if (!filePath) {
            vscode.window.showErrorMessage('No file is open');
            sfGuardOutput.warn('Deploy aborted because no active editor or resource was found.');
            return;
        }

        const fileName = path.basename(filePath);

        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo) {
            vscode.window.showErrorMessage(`Unsupported Salesforce file type for deploy: ${fileName}`);
            sfGuardOutput.warn(`Deploy aborted for unsupported file type: ${filePath}`);
            return;
        }

        sfGuardOutput.info(`Starting safe deploy for ${metadataInfo.type} ${metadataInfo.name} (${fileName}).`);

        if (editor && editor.document.fileName === filePath && editor.document.isDirty) {
            await editor.document.save();
            sfGuardOutput.info(`Saved dirty editor before deploy: ${fileName}`);
        }

        let conflictInfo: ConflictInfo | undefined;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Checking for conflicts...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 30 });
            conflictInfo = await this.conflictService.checkForConflicts(filePath);
            progress.report({ increment: 100 });
        });

        if (conflictInfo?.hasConflict) {
            sfGuardOutput.warn(
                `Conflict detected for ${metadataInfo.name}. Type: ${conflictInfo.conflictType}. Modified by: ${conflictInfo.modifiedBy}.`
            );

            const conflictMessage = `WARNING: Conflict Detected! ${conflictInfo.reason}\n\n` +
                `File: "${metadataInfo.name}"\n` +
                `Last modified by: ${conflictInfo.modifiedBy}\n` +
                `Modified on: ${conflictInfo.modifiedDate}\n\n` +
                'Please retrieve the file first to sync with Salesforce Guard.';

            const overwriteMessage = 'WARNING: Your local file is outdated!\n\n' +
                `${conflictInfo.reason}\n` +
                'Deploying now may overwrite changes in the org.\n\n' +
                `File: "${metadataInfo.name}"\n` +
                `Modified on: ${conflictInfo.modifiedDate}\n\n` +
                'Please review your changes before proceeding.';

            const diffCheckBtnLabel = conflictInfo.conflictType === 'conflict' ? 'Resolve Conflict' : 'Review Changes';

            const choice = await vscode.window.showWarningMessage(
                conflictInfo.conflictType === 'conflict' ? conflictMessage : overwriteMessage,
                { modal: true },
                diffCheckBtnLabel,
                'Retrieve Now',
                'Deploy Anyway'
            );

            if (choice === diffCheckBtnLabel) {
                sfGuardOutput.info(`User opened diff resolution for ${fileName}.`);
                const resolved = await showDiffAndResolve(filePath, this.context);
                if (resolved) {
                    vscode.window.showInformationMessage('Conflict resolved. Proceeding to deploy...');
                    sfGuardOutput.info(`Conflict resolved for ${fileName}. Continuing deploy.`);
                } else {
                    vscode.window.showInformationMessage('Deployment cancelled due to unresolved conflict.');
                    sfGuardOutput.warn(`Deploy cancelled because conflict remained unresolved for ${fileName}.`);
                    return;
                }
            }

            if (!choice) {
                vscode.window.showInformationMessage('Deployment cancelled');
                sfGuardOutput.info(`Deploy cancelled by user for ${fileName}.`);
                return;
            }

            if (choice === 'Retrieve Now') {
                sfGuardOutput.info(`User chose retrieve-before-deploy for ${fileName}.`);
                await vscode.commands.executeCommand(
                    'salesforce-deployment-guard.retrieve',
                    vscode.Uri.file(filePath)
                );
                vscode.window.showInformationMessage('File retrieved. You can now deploy safely.');
                return;
            }
        }

        try {
            const deployResult = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deploying ${metadataInfo.name} to Salesforce...`,
                cancellable: true
            }, async (_progress, token) => {
                let cancelRequested = false;

                token.onCancellationRequested(() => {
                    cancelRequested = true;
                    sfGuardOutput.warn(`Deployment cancel requested for ${metadataInfo.name}.`);
                });

                const result = await deployService.deploy(filePath, {
                    onCancelRequested: (cancel) => {
                        token.onCancellationRequested(() => {
                            void cancel();
                        });
                    }
                });

                if (cancelRequested && !result.success) {
                    throw new Error('Deployment was cancelled.');
                }

                return result;
            });

            if (!deployResult.success) {
                const details = deployResult.details?.slice(0, 5).join('\n');
                const errorMessage = details
                    ? `${deployResult.message}\n${details}`
                    : deployResult.message;

                throw new Error(errorMessage);
            }

            const retrieveMap = getRetrieveMap(this.context);
            const currentUsername = salesforceService.getCachedUsername() || 'unknown_user';
            const currentOrgId = await salesforceService.getCurrentOrgId();
            if (currentOrgId) {
                const retrieveKey = buildRetrieveMapKey(currentOrgId, metadataInfo.type, metadataInfo.name);
                retrieveMap.set(retrieveKey, new Date());
                retrieveMap.delete(buildLegacyRetrieveMapKey(currentUsername, metadataInfo.name));
            }
            saveRetrieveMap(this.context, retrieveMap);
            console.log(`Updated sync timestamp after deploy for ${metadataInfo.name}.`);

            const currentAlias = salesforceService.getCachedAlias() || 'unknown_alias';
            if (currentAlias !== 'unknown_alias' && currentOrgId) {
                const backupEnabled = this.backupPrefs.isBackupEnabled(
                    currentOrgId,
                    metadataInfo.type,
                    metadataInfo.name,
                    currentAlias
                );

                if (backupEnabled) {
                    const backupService = getBackupService();
                    const backupCreated = backupService.backupDeployedFile(filePath, metadataInfo, currentAlias, currentOrgId);
                    if (backupCreated) {
                        sfGuardOutput.info(`Created backup for deployed component ${metadataInfo.name} (${currentAlias}).`);
                    } else {
                        sfGuardOutput.warn(`Backup creation failed for deployed component ${metadataInfo.name} (${currentAlias}).`);
                    }
                } else {
                    sfGuardOutput.info(`Backup skipped because it is disabled for ${metadataInfo.name} (${currentAlias}).`);
                }
            }

            const deployedFiles = fetchRetrieveableFiles(metadataInfo, filePath);
            sfGuardOutput.section(`Deploy Summary - ${metadataInfo.name}`);
            sfGuardOutput.info(`Component type: ${metadataInfo.type}`);
            sfGuardOutput.info('Files deployed:');
            for (const deployedFile of deployedFiles) {
                sfGuardOutput.info(`  - ${deployedFile}`);
            }

            vscode.window.showInformationMessage(`Deployed successfully: ${metadataInfo.name}`);
            sfGuardOutput.info(`Deploy completed successfully for ${metadataInfo.name}.`);
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to deploy ${metadataInfo.name}: ${errorText}`);
            sfGuardOutput.error(`Deploy failed for ${metadataInfo.name}. ${errorText}`);
            sfGuardOutput.show();
        }
    }
}
