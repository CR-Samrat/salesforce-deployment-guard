import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMetadataInfo, fetchRetrieveableFiles } from '../utils/metadataUtils';
import { retrieveOrgVersion, cleanupTempFile } from '../services/retrieveService';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { salesforceService } from '../services/salesforceService';

export async function showDiffAndResolve(
    localFilePath: string,
    context: vscode.ExtensionContext
): Promise<boolean> {
    const tempFilesToCleanup: string[] = [];
    const currentUser = salesforceService.getCachedUsername() || 'unknown_user';

    try {
        const metadataInfo = getMetadataInfo(localFilePath);

        if (!localFilePath || !metadataInfo) {
            throw new Error('Diff viewer requires a supported Salesforce file.');
        }

        const relevantFiles = fetchRetrieveableFiles(metadataInfo, localFilePath);
        if (relevantFiles.length === 0) {
            throw new Error(`No retrievable files were found for ${metadataInfo.name}.`);
        }

        const filesWithChanges: Array<{
            localPath: string;
            orgPath: string;
            fileName: string;
        }> = [];

        vscode.window.showInformationMessage('Comparing component files with org...');

        for (const file of relevantFiles) {
            const localPath = path.join(path.dirname(localFilePath), file);
            if (!fs.existsSync(localPath)) {
                continue;
            }

            const orgPath = await retrieveOrgVersion(localPath);
            if (!orgPath) {
                continue;
            }

            const localContent = fs.readFileSync(localPath, 'utf8');
            const orgContent = fs.readFileSync(orgPath, 'utf8');

            if (localContent !== orgContent) {
                filesWithChanges.push({
                    localPath,
                    orgPath,
                    fileName: file
                });
            }

            tempFilesToCleanup.push(orgPath);
        }

        if (filesWithChanges.length === 0) {
            const deployOnNoDiff = await vscode.window.showInformationMessage(
                `No differences found in ${metadataInfo.name}.`,
                { modal: false },
                'Deploy Anyway',
                'Cancel'
            );

            return deployOnNoDiff === 'Deploy Anyway';
        }

        const changedFilesList = filesWithChanges.map((f) => f.fileName).join(', ');
        vscode.window.showInformationMessage(
            `${filesWithChanges.length} file(s) changed in ${metadataInfo.name}: ${changedFilesList}`
        );

        // Open difference editor
        for(const file of filesWithChanges) {
            await vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(file.orgPath),
                vscode.Uri.file(file.localPath),
                `Difference: Org vs Local - ${metadataInfo.name}/${file.fileName}`,
                { preview: false }
            );
        }

        const choice = await vscode.window.showInformationMessage(
            `Reviewed ${filesWithChanges.length} changed file(s) in ${metadataInfo.name}.\n\n` +
            `Files with changes:\n${filesWithChanges.map((f) => `  - ${f.fileName}`).join('\n')}\n\n` +
            `Right: Your local changes\n` +
            `Left: Current org version\n\n` +
            'How would you like to proceed?',
            { modal: true },
            'Merge Manually',
            'Use Org Version',
            'Keep Local Version'
        );

        if (choice === 'Use Org Version') {
            for (const file of filesWithChanges) {
                const orgContent = fs.readFileSync(file.orgPath, 'utf8');
                fs.writeFileSync(file.localPath, orgContent, 'utf8');
            }

            const retrieveMap = getRetrieveMap(context);
            retrieveMap.set(`${currentUser}:${metadataInfo.name}`, new Date());
            saveRetrieveMap(context, retrieveMap);

            vscode.window.showInformationMessage(`Local files updated with org version: ${metadataInfo.name}`);
            return true;
        }

        if (choice === 'Keep Local Version') {
            vscode.window.showInformationMessage(`Keeping your local changes for: ${metadataInfo.name}`);
            return true;
        }

        if (choice === 'Merge Manually') {
            vscode.window.showInformationMessage(
                `Please manually merge the changes. Diff views are open for ${filesWithChanges.length} file(s).`
            );

            const retrieveMap = getRetrieveMap(context);
            retrieveMap.set(`${currentUser}:${metadataInfo.name}`, new Date());
            saveRetrieveMap(context, retrieveMap);

            return false;
        }

        return false;
    } catch (error) {
        console.error('Error showing diff:', error);
        vscode.window.showErrorMessage(`Failed to show difference view. Reason: ${error}`);
        return false;
    } finally {
        for (const tempFilePath of tempFilesToCleanup) {
            cleanupTempFile(tempFilePath);
        }
    }
}