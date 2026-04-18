import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMetadataInfo, getFileExtensionsForType } from '../utils/metadataUtils';
import { retrieveOrgVersion } from '../services/retrieveService';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { salesforceService } from '../services/salesforceService';
import { cleanupTempFile } from '../services/retrieveService';

interface DiffFileInfo{
    localFilePath: string;
    componentName: string;
    componentType: string;
    currentUser: string;
}

export async function showLWCDiffAndResolve(
    diffFileInfo: DiffFileInfo,
    context: vscode.ExtensionContext
): Promise<boolean> {
    const tempFilesToCleanup: string[] = [];

    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return false;
        }
        
        // Get the LWC bundle path
        const pathParts = diffFileInfo.localFilePath.split(/[/\\]/);
        const parentIndex = diffFileInfo.componentType === 'LightningComponentBundle' ? pathParts.findIndex(part => part === 'lwc') : pathParts.findIndex(part => part === 'aura');
        const bundlePath = pathParts.slice(0, parentIndex + 2).join(path.sep);
        const bundleFileExts = getFileExtensionsForType(diffFileInfo.componentType);
        
        console.log(`Bundle Path: ${bundlePath}`);
        console.log(`Expected Bundle File extensions:`, bundleFileExts);
        
        // Get all files in the bundle
        const bundleFiles = fs.readdirSync(bundlePath);
        const relevantFiles = bundleFiles.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return bundleFileExts.includes(ext);
        });

        console.log(`Bundle Files:`, relevantFiles);
        
        // Retrieve org versions for all files and check which have changes
        const filesWithChanges: Array<{
            localPath: string;
            orgPath: string;
            fileName: string;
            extension: string;
        }> = [];
        
        vscode.window.showInformationMessage('🔍 Comparing bundle files with org...');
        
        for (const file of relevantFiles) {
            const localPath = path.join(bundlePath, file);
            const orgPath = await retrieveOrgVersion(localPath);
            console.log('Retrieved org version for', file, 'Org Path:', orgPath);
            
            if (orgPath) {
                // Check if files are different
                const localContent = fs.readFileSync(localPath, 'utf8');
                const orgContent = fs.readFileSync(orgPath, 'utf8');
                
                if (localContent !== orgContent) {
                    filesWithChanges.push({
                        localPath,
                        orgPath,
                        fileName: file,
                        extension: path.extname(file)
                    });
                }

                tempFilesToCleanup.push(orgPath);
            }
        }
        
        if (filesWithChanges.length === 0) {
            const deployOnNoDiff = await vscode.window.showInformationMessage(
                `✅ No differences found in ${diffFileInfo.componentName} bundle`,
                {modal : false},
                'Deploy Anyway',
                'Cancel'
            );

            if(deployOnNoDiff && deployOnNoDiff === 'Deploy Anyway') {
                return true;
            }

            if(!deployOnNoDiff || deployOnNoDiff === 'Cancel') {
                return false;
            }
        }
        
        // Show message about which files changed
        const changedFilesList = filesWithChanges.map(f => f.fileName).join(', ');
        vscode.window.showInformationMessage(
            `📊 ${filesWithChanges.length} file(s) changed in ${diffFileInfo.componentName}: ${changedFilesList}`
        );
        
        // Open diff for all changed files
        for (const file of filesWithChanges) {
            await vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(file.orgPath),
                vscode.Uri.file(file.localPath),
                `Difference: Org ⟷ Local - ${diffFileInfo.componentName}/${file.fileName}`,
                { preview: false }
            );
        }
        
        // Show resolution dialog
        const choice = await vscode.window.showInformationMessage(
            `📊 Reviewed ${filesWithChanges.length} changed file(s) in ${diffFileInfo.componentName}.\n\n` +
            `Files with changes:\n${filesWithChanges.map(f => '  • ' + f.fileName).join('\n')}\n\n` +
            `How would you like to proceed?`,
            { modal: true },
            '✏️ Merge Manually',
            '⬅️ Use Org Version (All)',
            '➡️ Keep Local (All)'
        );
        
        if (choice === '⬅️ Use Org Version (All)') {
            // Overwrite all local files with org version
            for (const file of filesWithChanges) {
                const orgContent = fs.readFileSync(file.orgPath, 'utf8');
                fs.writeFileSync(file.localPath, orgContent, 'utf8');
            }
            
            // Update retrieve map
            const retrieveMap = getRetrieveMap(context);
            retrieveMap.set(`${diffFileInfo.currentUser}:${diffFileInfo.componentName}`, new Date());
            saveRetrieveMap(context, retrieveMap);
            
            vscode.window.showInformationMessage(
                `✅ All ${filesWithChanges.length} file(s) updated with org version`
            );
            return true;
        }
        
        if (choice === '➡️ Keep Local (All)') {
            vscode.window.showInformationMessage(
                `✅ Keeping your local changes for all files in ${diffFileInfo.componentName}`
            );
            return true;
        }
        
        if (choice === '✏️ Merge Manually') {
            vscode.window.showInformationMessage(
                `🔧 Please manually merge the changes. ` +
                `Diff views are open for ${filesWithChanges.length} file(s).`
            );
            
            // Update retrieve map since they're manually resolving
            const retrieveMap = getRetrieveMap(context);
            retrieveMap.set(`${diffFileInfo.currentUser}:${diffFileInfo.componentName}`, new Date());
            saveRetrieveMap(context, retrieveMap);
            
            return false;
        }
        
        return false;
    } catch (error) {
        console.error('Error showing LWC diff:', error);
        vscode.window.showErrorMessage(`Failed to show LWC difference view. Reason: ${error}`);
        return false;
    } finally {
        for (const tempFile of tempFilesToCleanup) {
            cleanupTempFile(tempFile);
        }
    }
}

export async function showDiffAndResolve(
    localFilePath: string,
    context: vscode.ExtensionContext
): Promise<boolean> {
    let tempFilePath: string | null = null;
    const currentUser = salesforceService.getCachedUsername() || 'unknown_user';

    try {
        const metadataInfo = getMetadataInfo(localFilePath);

        if (!localFilePath || !metadataInfo) {
            throw new Error('DiffFileInfo: All parameters except currentUser are required');
        }
        
        if (metadataInfo?.type === 'LightningComponentBundle' || metadataInfo?.type === 'AuraDefinitionBundle') {
            return await showLWCDiffAndResolve(
                { localFilePath, componentName: metadataInfo.name, componentType: metadataInfo.type, currentUser },
                context
            );
        }

        // Get org version of the file
        const orgFilePath = await retrieveOrgVersion(localFilePath);

        if (!orgFilePath) {
            vscode.window.showErrorMessage('Could not retrieve org version for diff.');
            return false;
        }

        tempFilePath = orgFilePath;
        const fileName = path.basename(localFilePath);

        // Open difference editor
        await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.file(orgFilePath),
            vscode.Uri.file(localFilePath),
            `Difference: Org ⟷ Local - ${fileName}`
        );

        const choice = await vscode.window.showInformationMessage(
            `📊 Compare your changes with the org version.\n\n` +
            `Right (You): Your local changes\n` +
            `Left (Org): Current org version\n\n` +
            `After reviewing, please choose how to proceed.`,
            { modal: true },
            '✏️ Merge Manually',
            '⬅️ Use Org Version',
            '➡️ Keep Local Version'
        );

        if (choice === '⬅️ Use Org Version') {
            // Overwrite local file with org version
            const orgContent = fs.readFileSync(orgFilePath, 'utf8');
            fs.writeFileSync(localFilePath, orgContent, 'utf8');

            // Update retrieve map
            const retrieveMap = getRetrieveMap(context);
            const fileBaseName = metadataInfo.name;
            retrieveMap.set(`${currentUser}:${fileBaseName}`, new Date());
            saveRetrieveMap(context, retrieveMap);

            vscode.window.showInformationMessage(`✅ Local file updated with org version: ${fileName}`);
            return true;
        }

        if (choice === '➡️ Keep Local Version') {
            vscode.window.showInformationMessage(`✅ Keeping your local changes for: ${fileName}`);
            return true;
        }

        if (choice === '✏️ Merge Manually') {
            vscode.window.showInformationMessage(`🔧 Please manually merge the changes for: ${fileName}`);

            // Update retrieve map since they're manually resolving
            const retrieveMap = getRetrieveMap(context);
            const fileBaseName = metadataInfo.name;
            retrieveMap.set(`${currentUser}:${fileBaseName}`, new Date());
            saveRetrieveMap(context, retrieveMap);

            return false;
        }

        return false;
    } catch (error) {
        console.error('Error showing diff:', error);
        vscode.window.showErrorMessage(`Failed to show difference view. Reason: ${error}`);
        return false;
    } finally {
        if (tempFilePath) {
            cleanupTempFile(tempFilePath);
        }
    }
}