import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ComponentSet, RetrieveMessage } from '@salesforce/source-deploy-retrieve';
import { salesforceService } from './salesforceService';
import { getMetadataInfo } from '../utils/metadataUtils';
import { sanitizeSOQL, sanitizeFileName } from '../utils/sanitization';

export interface RetrieveResultSummary {
    success: boolean;
    message: string;
    details?: string[];
}

export async function retrieveOrgVersion(filePath: string): Promise<string | null> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const metadataInfo = getMetadataInfo(filePath);
        const metadataType = metadataInfo?.type || '';
        const fileName = metadataInfo?.name || '';
        const fileExt = path.extname(filePath).toLowerCase();
        const fileBaseName = path.basename(filePath, fileExt);

        const tempDir = path.join(workspaceFolder || '', '.sfguard-temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        let tempFilePath: string;
        let orgContent = '';

        const safeName = sanitizeFileName(fileName);
        const safeBaseName = sanitizeFileName(fileBaseName);

        if (metadataType === 'LightningComponentBundle' || metadataType === 'AuraDefinitionBundle') {
            tempFilePath = path.join(tempDir, `${safeName}_${safeBaseName}_ORG${fileExt}`);
        } else {
            tempFilePath = path.join(tempDir, `${safeName}_ORG${fileExt}`);
        }

        if (metadataType === 'LightningComponentBundle') {
            const query = `SELECT Source FROM LightningComponentResource
                          WHERE LightningComponentBundle.DeveloperName='${sanitizeSOQL(fileName)}'
                          AND FilePath LIKE '%${sanitizeSOQL(fileBaseName)}${fileExt}'`;

            const result = await salesforceService.toolingQuery(query);

            if (result.length > 0) {
                orgContent = (result[0] as { Source?: string }).Source || '';
            }
        } else if (metadataType === 'AuraDefinitionBundle') {
            let defType = 'COMPONENT';
            if (fileExt === '.js') {
                if (fileBaseName.endsWith('Controller')) {
                    defType = 'CONTROLLER';
                } else if (fileBaseName.endsWith('Helper')) {
                    defType = 'HELPER';
                } else if (fileBaseName.endsWith('Renderer')) {
                    defType = 'RENDERER';
                }
            } else if (fileExt === '.css') {
                defType = 'STYLE';
            } else if (fileExt === '.design') {
                defType = 'DESIGN';
            } else if (fileExt === '.svg') {
                defType = 'SVG';
            } else if (fileExt === '.auradoc') {
                defType = 'DOCUMENTATION';
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
        console.error('Error retrieving org version:', error);
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
        const componentSet = ComponentSet.fromSource([retrievePath]);
        componentSet.projectDirectory = projectDirectory;

        const retrieve = await componentSet.retrieve({
            usernameOrConnection: connection,
            merge: true,
            output: projectDirectory
        });

        const result = await retrieve.pollStatus();
        if (result.response.success) {
            return {
                success: true,
                message: `Successfully retrieved ${metadataInfo.name}.`
            };
        }

        return {
            success: false,
            message: `Retrieve failed for ${metadataInfo.name}.`,
            details: this.collectFailureDetails(result.response.messages)
        };
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

    private collectFailureDetails(messages?: RetrieveMessage | RetrieveMessage[]): string[] {
        if (!messages) {
            return [];
        }

        const messageList = Array.isArray(messages) ? messages : [messages];
        return messageList.map((message) => `${message.fileName} - ${message.problem}`);
    }
}

export const retrieveService = new RetrieveService();
