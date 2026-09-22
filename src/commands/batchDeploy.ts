import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { deployService, sfGuardOutput } from '../services';
import { showBatchDeploymentResults, showBatchDeploymentSelector } from '../ui';
import {
    BatchDeploymentResult,
    createBatchResult,
    normalizeBatchSelections,
    orderBatchSelections
} from '../utils/batchDeployment';

export class BatchDeployCommand {
    async execute(uri?: vscode.Uri): Promise<void> {
        const availableUris = await this.findPackageSourceFiles();
        const availableItems = normalizeBatchSelections(availableUris.map((item) => item.fsPath));

        if (availableItems.length === 0) {
            vscode.window.showWarningMessage('No supported Salesforce components were found in the workspace.');
            sfGuardOutput.warn('Batch deployment stopped because no supported workspace components were found.');
            return;
        }

        const contextMetadata = uri ? normalizeBatchSelections([uri.fsPath])[0]?.metadataInfo : undefined;
        const initialItem = contextMetadata
            ? availableItems.find((item) => item.metadataInfo.type === contextMetadata.type && item.metadataInfo.name === contextMetadata.name)
            : undefined;
        const orderedPaths = await showBatchDeploymentSelector(availableItems, initialItem?.filePath);

        if (!orderedPaths) {
            sfGuardOutput.info('Batch deployment cancelled from the component selector.');
            return;
        }

        const items = orderBatchSelections(availableItems, orderedPaths);
        if (items.length === 0) {
            vscode.window.showWarningMessage('Select at least one component to deploy.');
            return;
        }

        const results: BatchDeploymentResult[] = [];
        let cancellationRequested = false;
        let cancelCurrentDeployment: (() => Promise<void>) | undefined;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Batch deploying to Salesforce...',
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                cancellationRequested = true;
                sfGuardOutput.warn('Batch deployment cancellation requested.');
                if (cancelCurrentDeployment) {
                    void cancelCurrentDeployment();
                }
            });

            for (let index = 0; index < items.length; index += 1) {
                const item = items[index];
                if (cancellationRequested) {
                    results.push({
                        filePath: item.filePath,
                        metadataType: item.metadataInfo.type,
                        componentName: item.metadataInfo.name,
                        status: 'cancelled',
                        message: 'Deployment was not started because the batch was cancelled.',
                        details: []
                    });
                    continue;
                }

                progress.report({
                    message: `${index + 1}/${items.length}: ${item.metadataInfo.name}`,
                    increment: 100 / items.length
                });

                const dirtyDocument = vscode.workspace.textDocuments.find(
                    (document) => document.fileName === item.filePath && document.isDirty
                );
                if (dirtyDocument && !(await dirtyDocument.save())) {
                    results.push({
                        filePath: item.filePath,
                        metadataType: item.metadataInfo.type,
                        componentName: item.metadataInfo.name,
                        status: 'failed',
                        message: `Could not save ${path.basename(item.filePath)} before deployment.`,
                        details: []
                    });
                    continue;
                }

                try {
                    const deployResult = await deployService.deploy(item.filePath, {
                        onCancelRequested: (cancel) => {
                            cancelCurrentDeployment = cancel;
                        }
                    });
                    cancelCurrentDeployment = undefined;
                    const batchResult = createBatchResult(item, deployResult);
                    results.push(batchResult);
                    sfGuardOutput.info(`${batchResult.status === 'success' ? 'Succeeded' : 'Failed'}: ${item.metadataInfo.name}`);
                } catch (error) {
                    cancelCurrentDeployment = undefined;
                    const message = error instanceof Error ? error.message : String(error);
                    results.push({
                        filePath: item.filePath,
                        metadataType: item.metadataInfo.type,
                        componentName: item.metadataInfo.name,
                        status: 'failed',
                        message,
                        details: []
                    });
                    sfGuardOutput.error(`Failed: ${item.metadataInfo.name}. ${message}`);
                }
            }
        });

        const successCount = results.filter((result) => result.status === 'success').length;
        const failedCount = results.filter((result) => result.status === 'failed').length;
        sfGuardOutput.section('Batch Deployment Summary');
        sfGuardOutput.info(`Successful: ${successCount}. Failed: ${failedCount}. Cancelled: ${results.length - successCount - failedCount}.`);
        showBatchDeploymentResults(results);
    }

    private async findPackageSourceFiles(): Promise<vscode.Uri[]> {
        const projectFiles = await vscode.workspace.findFiles('**/sfdx-project.json', '**/{node_modules,.git,out,coverage,.sfdx}/**');
        const packageDirectories = new Set<string>();

        for (const projectFile of projectFiles) {
            try {
                const projectConfig = JSON.parse(fs.readFileSync(projectFile.fsPath, 'utf8')) as {
                    packageDirectories?: Array<{ path?: string }>;
                };
                for (const packageDirectory of projectConfig.packageDirectories ?? []) {
                    if (packageDirectory.path) {
                        packageDirectories.add(path.resolve(path.dirname(projectFile.fsPath), packageDirectory.path));
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                sfGuardOutput.warn(`Could not read ${projectFile.fsPath} while finding batch components. ${message}`);
            }
        }

        const sourcePattern = '*.{cls,trigger,page,component,html,js,css,cmp,app,evt,intf,auradoc,design,svg,tokens,xml}';
        const files = await Promise.all([...packageDirectories].map((packageDirectory) => {
            const relativePattern = new vscode.RelativePattern(packageDirectory, `**/${sourcePattern}`);
            return vscode.workspace.findFiles(relativePattern, '**/{node_modules,.git,out,coverage,.sfdx}/**');
        }));

        return files.flat();
    }
}