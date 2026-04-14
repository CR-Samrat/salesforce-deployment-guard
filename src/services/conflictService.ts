import * as vscode from 'vscode';
import * as path from 'path';
import { salesforceService } from './salesforceService';
import { getMetadataInfo } from '../utils/metadataUtils';
import { sanitizeSOQL } from '../utils/sanitization';
import { getRetrieveMap } from '../storage/retrieveMapStorage';
import { ConflictInfo } from '../types/conflict';
import { sfGuardOutput } from './outputChannel';

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
            const lastRetrieved = retrieveMap.get(`${currentUsername}:${name}`);

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
}
