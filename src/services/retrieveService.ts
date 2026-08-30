import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ComponentSet, RetrieveMessage } from '@salesforce/source-deploy-retrieve';
import { salesforceService } from './salesforceService';
import { getMetadataInfo, MetadataInfo } from '../utils/metadataUtils';
import { sanitizeSOQL, sanitizeFileName } from '../utils/sanitization';
import { sfGuardOutput } from './outputChannel';

export interface RetrieveResultSummary {
    success: boolean;
    message: string;
    details?: string[];
    retrievedComponents?: string[];
}

export async function retrieveOrgVersion(filePath: string): Promise<string | null> {
    try {
        const metadataInfo = getMetadataInfo(filePath);
        const metadataType = metadataInfo?.type || '';
        const fileName = metadataInfo?.name || '';
        const fileExt = path.extname(filePath).toLowerCase();
        const fileBaseName = path.basename(filePath, fileExt);

        if (!metadataInfo) {
            return null;
        }

        if (fileExt === '.xml') {
            return await retrieveService.retrieveMetadataFileForDiff(filePath, metadataInfo);
        }

        const tempDir = retrieveService.getBaseTempDir();
        const tempFilePath = retrieveService.buildTempFilePath(tempDir, filePath, metadataInfo);
        let orgContent = '';

        if (metadataType === 'LightningComponentBundle') {
            const query = `SELECT Source FROM LightningComponentResource
                          WHERE LightningComponentBundle.DeveloperName='${sanitizeSOQL(fileName)}'
                          AND FilePath LIKE '%${sanitizeSOQL(fileBaseName)}${fileExt}'`;

            const result = await salesforceService.toolingQuery(query);

            if (result.length > 0) {
                orgContent = (result[0] as { Source?: string }).Source || '';
            }
        } else if (metadataType === 'AuraDefinitionBundle') {
            const defType = retrieveService.getAuraDefType(filePath);
            if (!defType) {
                sfGuardOutput.warn(`Could not determine Aura DefType for ${filePath}.`);
                return null;
            }

            const query = `SELECT Source FROM AuraDefinition
                  WHERE AuraDefinitionBundle.DeveloperName='${sanitizeSOQL(fileName)}'
                  AND DefType='${defType}'`;

            const result = await salesforceService.toolingQuery(query);

            if (result.length > 0) {
                orgContent = (result[0] as { Source?: string }).Source || '';
            }
        } else if (metadataType === 'ApexPage') {
            const query = `SELECT Markup FROM ApexPage WHERE Name='${sanitizeSOQL(fileName)}'`;
            const result = await salesforceService.query(query);

            if (result.length > 0) {
                orgContent = (result[0] as { Markup?: string }).Markup || '';
            }
        } else if (metadataType === 'ApexComponent') {
            const query = `SELECT Markup FROM ApexComponent WHERE Name='${sanitizeSOQL(fileName)}'`;
            const result = await salesforceService.query(query);

            if (result.length > 0) {
                orgContent = (result[0] as { Markup?: string }).Markup || '';
            }
        } else {
            const query = `SELECT Body FROM ${metadataType} WHERE Name='${sanitizeSOQL(fileName)}'`;
            const result = await salesforceService.query(query);

            if (result.length > 0) {
                orgContent = (result[0] as { Body?: string }).Body || '';
            }
        }

        if (orgContent) {
            fs.writeFileSync(tempFilePath, orgContent, 'utf8');
            return tempFilePath;
        }

        return null;
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        sfGuardOutput.error(`Failed to fetch org version for diff on ${filePath}. ${errorText}`);
        return null;
    }
}

export function cleanupTempFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

export class RetrieveService {
    public async retrieve(filePath: string): Promise<RetrieveResultSummary> {
        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo) {
            return {
                success: false,
                message: `Unsupported Salesforce file type for retrieve: ${path.basename(filePath)}`
            };
        }

        const projectDirectory = this.findProjectRoot(filePath);
        if (!projectDirectory) {
            return {
                success: false,
                message: 'Could not find sfdx-project.json for this file. Open the Salesforce project workspace and try again.'
            };
        }

        const connection = await salesforceService.getConnection();
        if (!connection) {
            return {
                success: false,
                message: 'Failed to connect to the target Salesforce org.'
            };
        }

        const retrievePath = this.getRetrievePath(filePath, metadataInfo.type);
        const outputDirectory = metadataInfo.type === 'PackageManifest'
            ? this.getManifestOutputDirectory(projectDirectory)
            : projectDirectory;
        console.log(`Resolved retrieve path for ${metadataInfo.name}: ${retrievePath}`);

        const componentSet = metadataInfo.type === 'PackageManifest'
            ? await ComponentSet.fromManifest(filePath)
            : ComponentSet.fromSource([retrievePath]);
        componentSet.projectDirectory = projectDirectory;

        const retrieve = await componentSet.retrieve({
            usernameOrConnection: connection,
            merge: true,
            output: outputDirectory
        });

        const result = await retrieve.pollStatus();
        if (result.response.success) {
            const fileProps = Array.isArray(result.response.fileProperties)
                ? result.response.fileProperties.length
                : 1;
            sfGuardOutput.info(`Retrieve succeeded for ${metadataInfo.name}. Retrieved file entries: ${fileProps}.`);
            const retrievedComponents = this.collectRetrievedComponents(result.response.fileProperties);
            return {
                success: true,
                message: `Successfully retrieved ${metadataInfo.name}.`,
                retrievedComponents
            };
        }

        const details = this.collectFailureDetails(result.response.messages);
        sfGuardOutput.error(`Retrieve failed for ${metadataInfo.name}.`);
        for (const detail of details) {
            sfGuardOutput.error(`  ${detail}`);
        }

        return {
            success: false,
            message: `Retrieve failed for ${metadataInfo.name}.`,
            details
        };
    }

    public async retrieveMetadataFileForDiff(filePath: string, metadataInfo: MetadataInfo): Promise<string | null> {
        let tempRetrieveDir: string | null = null;

        try {
            const projectDirectory = this.findProjectRoot(filePath);
            if (!projectDirectory) {
                sfGuardOutput.warn(`Could not find project root while retrieving metadata XML for diff: ${filePath}`);
                return null;
            }

            const connection = await salesforceService.getConnection();
            if (!connection) {
                sfGuardOutput.warn(`Could not connect to Salesforce while retrieving metadata XML for diff: ${filePath}`);
                return null;
            }

            const tempDir = this.getBaseTempDir();
            tempRetrieveDir = fs.mkdtempSync(path.join(tempDir, 'retrieve-'));

            const retrievePath = this.getRetrievePath(filePath, metadataInfo.type);
            const componentSet = ComponentSet.fromSource([retrievePath]);
            componentSet.projectDirectory = projectDirectory;

            const retrieve = await componentSet.retrieve({
                usernameOrConnection: connection,
                format: 'metadata',
                output: tempRetrieveDir,
                unzip: true,
                zipFileName: 'metadata.zip'
            });

            const result = await retrieve.pollStatus();
            if (!result.response.success) {
                const details = this.collectFailureDetails(result.response.messages);
                sfGuardOutput.error(`Metadata diff retrieve failed for ${filePath}.`);
                for (const detail of details) {
                    sfGuardOutput.error(`  ${detail}`);
                }
                return null;
            }

            const targetFileName = path.basename(filePath);
            const retrievedFilePath = this.findFileRecursively(tempRetrieveDir, targetFileName);

            if (!retrievedFilePath) {
                sfGuardOutput.warn(`Metadata diff retrieve succeeded but ${targetFileName} was not found in temp output.`);
                return null;
            }

            const flattenedTempFilePath = this.buildTempFilePath(this.getBaseTempDir(), filePath, metadataInfo);
            fs.copyFileSync(retrievedFilePath, flattenedTempFilePath);
            return flattenedTempFilePath;
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            sfGuardOutput.error(`Failed to retrieve metadata XML for diff on ${filePath}. ${errorText}`);
            return null;
        } finally {
            if (tempRetrieveDir && fs.existsSync(tempRetrieveDir)) {
                this.tryCleanupTempDir(tempRetrieveDir);
            }
        }
    }

    public getBaseTempDir(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const tempDir = path.join(workspaceFolder || '', '.sfguard-temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        return tempDir;
    }

    public buildTempFilePath(tempDir: string, filePath: string, metadataInfo: MetadataInfo): string {
        const fileExt = path.extname(filePath).toLowerCase();
        const fileBaseName = path.basename(filePath, fileExt);
        const safeName = sanitizeFileName(metadataInfo.name);
        const safeBaseName = sanitizeFileName(fileBaseName);

        if (metadataInfo.type === 'LightningComponentBundle' || metadataInfo.type === 'AuraDefinitionBundle') {
            return path.join(tempDir, `${safeName}_${safeBaseName}_ORG${fileExt}`);
        }

        return path.join(tempDir, `${safeName}_ORG${fileExt}`);
    }

    public getAuraDefType(filePath: string): string | null {
        const fileExt = path.extname(filePath).toLowerCase();
        const fileBaseName = path.basename(filePath, fileExt);

        switch (fileExt) {
            case '.cmp':
                return 'COMPONENT';
            case '.app':
                return 'APPLICATION';
            case '.evt':
                return 'EVENT';
            case '.intf':
                return 'INTERFACE';
            case '.auradoc':
                return 'DOCUMENTATION';
            case '.design':
                return 'DESIGN';
            case '.svg':
                return 'SVG';
            case '.tokens':
                return 'TOKENS';
            case '.css':
                return 'STYLE';
            case '.js':
                if (fileBaseName.endsWith('Controller')) {
                    return 'CONTROLLER';
                }
                if (fileBaseName.endsWith('Helper')) {
                    return 'HELPER';
                }
                if (fileBaseName.endsWith('Renderer')) {
                    return 'RENDERER';
                }
                return null;
            default:
                return null;
        }
    }

    private getRetrievePath(filePath: string, metadataType: string): string {
        if (metadataType !== 'LightningComponentBundle' && metadataType !== 'AuraDefinitionBundle') {
            return filePath;
        }

        const pathParts = filePath.split(/[/\\]/);
        const containerDirectory = metadataType === 'LightningComponentBundle' ? 'lwc' : 'aura';
        const containerIndex = pathParts.findIndex((part) => part === containerDirectory);

        if (containerIndex === -1 || containerIndex >= pathParts.length - 1) {
            return filePath;
        }

        return pathParts.slice(0, containerIndex + 2).join(path.sep);
    }

    private findProjectRoot(filePath: string): string | null {
        let currentPath = path.dirname(filePath);

        while (true) {
            const projectFile = path.join(currentPath, 'sfdx-project.json');
            if (fs.existsSync(projectFile)) {
                return currentPath;
            }

            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) {
                return null;
            }

            currentPath = parentPath;
        }
    }

    private findFileRecursively(rootDir: string, targetFileName: string): string | null {
        for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
            const fullPath = path.join(rootDir, entry.name);
            if (entry.isDirectory()) {
                const found = this.findFileRecursively(fullPath, targetFileName);
                if (found) {
                    return found;
                }
                continue;
            }

            if (entry.isFile() && entry.name === targetFileName) {
                return fullPath;
            }
        }

        return null;
    }

    private getManifestOutputDirectory(projectDirectory: string): string {
        try {
            const projectConfigPath = path.join(projectDirectory, 'sfdx-project.json');
            const rawConfig = fs.readFileSync(projectConfigPath, 'utf8');
            const projectConfig = JSON.parse(rawConfig) as {
                packageDirectories?: Array<{ path?: string; default?: boolean }>;
            };

            const defaultPackageDirectory = projectConfig.packageDirectories?.find((entry) => entry.default)
                ?? projectConfig.packageDirectories?.[0];

            if (defaultPackageDirectory?.path) {
                return path.join(projectDirectory, defaultPackageDirectory.path);
            }
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            sfGuardOutput.warn(`Could not resolve default package directory from sfdx-project.json. ${errorText}`);
        }

        return projectDirectory;
    }

    private tryCleanupTempDir(tempDir: string): void {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            sfGuardOutput.warn(`Temporary diff retrieve folder could not be cleaned up immediately: ${tempDir}. ${errorText}`);
        }
    }

    private collectFailureDetails(messages?: RetrieveMessage | RetrieveMessage[]): string[] {
        if (!messages) {
            return [];
        }

        const messageList = Array.isArray(messages) ? messages : [messages];
        return messageList.map((message) => `${message.fileName} - ${message.problem}`);
    }

    private collectRetrievedComponents(fileProperties: unknown): string[] {
        if (!Array.isArray(fileProperties)) {
            return [];
        }

        const componentLines = new Set<string>();

        for (const entry of fileProperties) {
            const fileProperty = entry as {
                type?: string;
                fullName?: string;
                fileName?: string;
            };

            if (!fileProperty.type) {
                continue;
            }

            const componentName = fileProperty.fullName || fileProperty.fileName || 'Unknown';
            componentLines.add(`${fileProperty.type}: ${componentName}`);
        }

        return Array.from(componentLines);
    }
}

export const retrieveService = new RetrieveService();
