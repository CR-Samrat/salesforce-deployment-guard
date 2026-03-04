import * as vscode from 'vscode';
import * as path from 'path';
import { salesforceService } from './salesforceService';
import { getMetadataInfo } from '../utils/metadataUtils';
import { sanitizeSOQL } from '../utils/sanitization';
import { getRetrieveMap } from '../storage/retrieveMapStorage';
import { ConflictInfo } from '../types/conflict';

export class ConflictService {
    constructor(private context: vscode.ExtensionContext) {}

    async checkForConflicts(filePath: string): Promise<ConflictInfo> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            
            if (!workspaceFolder) {
                return { hasConflict: false };
            }

            // Get current user
            const currentUser = await salesforceService.getCurrentUsername();
            if (!currentUser) {
                console.log('Could not determine current user');
                return { hasConflict: false };
            }

            const { username: currentUsername, alias: currentAlias } = currentUser;

            // Get metadata info
            const metadataInfo = getMetadataInfo(filePath);
            if (!metadataInfo) {
                console.log(`Unsupported file type: ${path.extname(filePath)}`);
                return { hasConflict: false };
            }

            const { type, name } = metadataInfo;

            // Query Salesforce
            let query: string;
            let records: any[];

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
            }else {
                query = `SELECT LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Username 
                         FROM ${type} WHERE Name='${sanitizeSOQL(name)}'`;
                records = await salesforceService.query(query);
            }
            
            if (!records || records.length === 0) {
                console.log('No record found in org');
                return { hasConflict: false };
            }

            const orgRecord = records[0];
            const modifiedByName = orgRecord.LastModifiedBy?.Name || 'Unknown';
            const modifiedByUsername = orgRecord.LastModifiedBy?.Username || '';
            const orgLastModified = new Date(orgRecord.LastModifiedDate);

            console.log(`Last modified in org: ${modifiedByName} (${orgLastModified.toISOString()})`);
            
            // Get retrieve map
            const retrieveMap = getRetrieveMap(this.context);
            const lastRetrieved = retrieveMap.get(`${currentUsername}:${name}`);

            if (!lastRetrieved) {
                // Check if current user was last to modify
                const isCurrentUser = modifiedByUsername.toLowerCase() === currentUsername.toLowerCase() ||
                                    modifiedByName.toLowerCase().includes(currentUsername.toLowerCase()) ||
                                    currentUsername.toLowerCase().includes(modifiedByUsername.toLowerCase());

                const hasConflict = !isCurrentUser;
                
                return {
                    hasConflict,
                    modifiedBy: modifiedByName,
                    modifiedDate: orgLastModified.toLocaleString(),
                    reason: hasConflict ? 'File modified in org after last retrieve' : undefined
                };
            }

            // Check if org was modified after last retrieve
            const hasConflict = orgLastModified > lastRetrieved;

            console.log(`📊 Conflict Check:`);
            console.log(`   Last Retrieved: ${lastRetrieved.toLocaleString()}`);
            console.log(`   Org Modified: ${orgLastModified.toLocaleString()}`);
            console.log(`   Conflict: ${hasConflict ? 'YES ⚠️' : 'NO ✅'}`);

            return {
                hasConflict,
                modifiedBy: modifiedByName,
                modifiedDate: orgLastModified.toLocaleString(),
                reason: hasConflict ? 'File modified in org after last retrieve' : undefined
            };

        } catch (error) {
            console.error('Error checking conflicts:', error);
            vscode.window.showErrorMessage(`Error checking conflicts: ${error}`);
            return { hasConflict: false };
        }
    }
}