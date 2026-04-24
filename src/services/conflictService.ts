import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { salesforceService } from './salesforceService';
import { getMetadataInfo } from '../utils/metadataUtils';
import { sanitizeSOQL } from '../utils/sanitization';
import { getRetrieveMap, saveRetrieveMap } from '../storage/retrieveMapStorage';
import { ConflictInfo } from '../types/conflict';
import { sfGuardOutput } from './outputChannel';

interface FileResponseHistory {
    timestamp?: string;
    operation?: string;
    components?: Array<{
        metadataType?: string;
        fullName?: string;
        lastModifiedDate?: string;
    }>;
}

export class ConflictService {
    constructor(private context: vscode.ExtensionContext) {}

    async checkForConflicts(filePath: string): Promise<ConflictInfo> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

            if (!workspaceFolder) {
                sfGuardOutput.warn('Conflict check skipped because no workspace folder was found.');
                return { hasConflict: false };
            }

            const currentUser = await salesforceService.getCurrentUsername();
            if (!currentUser) {
                sfGuardOutput.warn('Conflict check skipped because current Salesforce user could not be determined.');
                return { hasConflict: false };
            }

            const { username: currentUsername } = currentUser;

            const metadataInfo = getMetadataInfo(filePath);
            if (!metadataInfo) {
                sfGuardOutput.warn(`Conflict check skipped for unsupported file type: ${path.extname(filePath)}`);
                return { hasConflict: false };
            }

            const { type, name } = metadataInfo;
            sfGuardOutput.info(`Checking conflict state for ${type} ${name}.`);

            let query: string;
            let records: Array<Record<string, unknown>>;

            if (type === 'LightningComponentBundle') {
                query = `SELECT Id, DeveloperName, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username
                         FROM LightningComponentBundle WHERE DeveloperName='${sanitizeSOQL(name)}'`;
                records = await salesforceService.toolingQuery(query);
            } else if (type === 'AuraDefinitionBundle') {
                query = `SELECT Id, DeveloperName, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username
                        FROM AuraDefinitionBundle WHERE DeveloperName='${sanitizeSOQL(name)}'`;
                records = await salesforceService.toolingQuery(query);
            } else if (type === 'ApexPage') {
                query = `SELECT Id, Name, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username
                        FROM ApexPage WHERE Name='${sanitizeSOQL(name)}'`;
                records = await salesforceService.query(query);
            } else if (type === 'ApexComponent') {
                query = `SELECT Id, Name, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username
                        FROM ApexComponent WHERE Name='${sanitizeSOQL(name)}'`;
                records = await salesforceService.query(query);
            } else {
                query = `SELECT LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username
                         FROM ${type} WHERE Name='${sanitizeSOQL(name)}'`;
                records = await salesforceService.query(query);
            }

            if (!records || records.length === 0) {
                sfGuardOutput.info(`No org record found while checking conflicts for ${name}.`);
                return { hasConflict: false };
            }

            const orgRecord = records[0] as {
                LastModifiedDate: string;
                LastModifiedBy?: { Name?: string; Username?: string };
            };
            const modifiedByName = orgRecord.LastModifiedBy?.Name || 'Unknown';
            const modifiedByUsername = orgRecord.LastModifiedBy?.Username || '';
            const orgLastModified = new Date(orgRecord.LastModifiedDate);

            const retrieveMap = getRetrieveMap(this.context);
            const retrieveMapKey = `${currentUsername}:${name}`;
            const trackedSyncTime = retrieveMap.get(retrieveMapKey);
            const externalSyncTime = await this.getLatestSalesforceSyncTime(filePath, type, name);
            const lastRetrieved = this.getLatestDate(trackedSyncTime, externalSyncTime);

            if (lastRetrieved && (!trackedSyncTime || lastRetrieved > trackedSyncTime)) {
                retrieveMap.set(retrieveMapKey, lastRetrieved);
                saveRetrieveMap(this.context, retrieveMap);
                sfGuardOutput.info(
                    `Refreshed SF Guard sync baseline for ${name} from Salesforce local history: ${lastRetrieved.toLocaleString()}.`
                );
            }

            const isCurrentUser = modifiedByUsername.toLowerCase() === currentUsername.toLowerCase() ||
                modifiedByName.toLowerCase().includes(currentUsername.toLowerCase()) ||
                currentUsername.toLowerCase().includes(modifiedByUsername.toLowerCase());

            if (!lastRetrieved) {
                const hasConflict = !isCurrentUser;
                sfGuardOutput.info(
                    `Conflict check for ${name}: no retrieve timestamp found, org modified by ${modifiedByName}, conflict=${hasConflict}.`
                );

                return {
                    hasConflict,
                    conflictType: 'conflict',
                    modifiedBy: modifiedByName,
                    modifiedDate: orgLastModified.toLocaleString(),
                    reason: hasConflict ? 'File modified in org after last retrieve' : undefined
                };
            }

            const hasConflict = orgLastModified > lastRetrieved;
            const conflictType = hasConflict ? (!isCurrentUser ? 'conflict' : 'overwrite') : 'unknown';

            sfGuardOutput.info(
                `Conflict check for ${name}: lastRetrieved=${lastRetrieved.toLocaleString()}, orgModified=${orgLastModified.toLocaleString()}, conflict=${hasConflict}, type=${conflictType}.`
            );

            return {
                hasConflict,
                conflictType,
                modifiedBy: modifiedByName,
                modifiedDate: orgLastModified.toLocaleString(),
                reason: hasConflict
                    ? conflictType === 'conflict'
                        ? 'File modified in org after last retrieve'
                        : 'The version of this file in the salesforce org has been updated since your last sync.'
                    : undefined
            };
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            sfGuardOutput.error(`Error checking conflicts for ${filePath}. ${errorText}`);
            vscode.window.showErrorMessage(`Error checking conflicts: ${errorText}`);
            return { hasConflict: false };
        }
    }

    private async getLatestSalesforceSyncTime(
        filePath: string,
        metadataType: string,
        metadataName: string
    ): Promise<Date | null> {
        const projectRoot = this.findProjectRoot(filePath);
        if (!projectRoot) {
            return null;
        }

        const orgId = await salesforceService.getCurrentOrgId();
        if (!orgId) {
            return null;
        }

        const fileResponsesDir = path.join(projectRoot, '.sfdx', 'fileResponses', orgId);
        if (!fs.existsSync(fileResponsesDir)) {
            return null;
        }

        let latestSyncTime: Date | null = null;
        const historyFiles = fs.readdirSync(fileResponsesDir)
            .filter((entry) => entry.endsWith('.json') && (entry.startsWith('retrieve-') || entry.startsWith('deploy-')));

        for (const historyFile of historyFiles) {
            const historyPath = path.join(fileResponsesDir, historyFile);

            try {
                const history = JSON.parse(fs.readFileSync(historyPath, 'utf8')) as FileResponseHistory;
                const components = Array.isArray(history.components) ? history.components : [];
                const matchesComponent = components.some((component) =>
                    //component.metadataType === metadataType && component.fullName === metadataName
                    this.matchesHistoryComponent(component, metadataType, metadataName)
                );

                if (!matchesComponent) {
                    continue;
                }

                const syncTimestamp = this.parseSyncTimestamp(history, components);
                latestSyncTime = this.getLatestDate(latestSyncTime, syncTimestamp);
            } catch (error) {
                const errorText = error instanceof Error ? error.message : String(error);
                sfGuardOutput.warn(`Could not read Salesforce file response history ${historyFile}. ${errorText}`);
            }
        }

        if (latestSyncTime) {
            sfGuardOutput.info(
                `Salesforce local history found for ${metadataType} ${metadataName}: ${latestSyncTime.toLocaleString()}.`
            );
        }

        return latestSyncTime;
    }

    private parseSyncTimestamp(
        history: FileResponseHistory,
        components: Array<{ metadataType?: string; fullName?: string; lastModifiedDate?: string }>
    ): Date | null {
        const historyTimestamp = history.timestamp ? new Date(history.timestamp) : null;
        const validHistoryTimestamp = historyTimestamp && !Number.isNaN(historyTimestamp.getTime())
            ? historyTimestamp
            : null;

        let latestComponentTimestamp: Date | null = null;
        for (const component of components) {
            if (!component.lastModifiedDate) {
                continue;
            }

            const componentTimestamp = new Date(component.lastModifiedDate);
            if (Number.isNaN(componentTimestamp.getTime())) {
                continue;
            }

            latestComponentTimestamp = this.getLatestDate(latestComponentTimestamp, componentTimestamp);
        }

        return this.getLatestDate(validHistoryTimestamp, latestComponentTimestamp);
    }

    private matchesHistoryComponent(
        component: { metadataType?: string; fullName?: string },
        metadataType: string,
        metadataName: string
    ): boolean {
        if (component.metadataType !== metadataType || !component.fullName) {
            return false;
        }

        if (component.fullName === metadataName) {
            return true;
        }

        if (metadataType === 'LightningComponentBundle' || metadataType === 'AuraDefinitionBundle') {
            return component.fullName.startsWith(`${metadataName}/`);
        }

        return false;
    }

    private getLatestDate(first: Date | null | undefined, second: Date | null | undefined): Date | null {
        if (!first) {
            return second || null;
        }

        if (!second) {
            return first;
        }

        return first > second ? first : second;
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
}
