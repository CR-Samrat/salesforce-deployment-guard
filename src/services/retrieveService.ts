import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { salesforceService } from './salesforceService';
import { getMetadataInfo } from '../utils/metadataUtils';
import { sanitizeSOQL, sanitizeFileName } from '../utils/sanitization';

export async function retrieveOrgVersion(filePath: string): Promise<string | null> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const metadataInfo = getMetadataInfo(filePath);
        const metadataType = metadataInfo?.type || '';
        const fileName = metadataInfo?.name || '';
        const fileExt = path.extname(filePath).toLowerCase();
        const fileBaseName = path.basename(filePath, fileExt);

        // Create temp directory
        const tempDir = path.join(workspaceFolder || '', '.sfguard-temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        let tempFilePath: string;
        let orgContent = '';
        
        // Sanitize names to prevent path traversal
        const safeName = sanitizeFileName(fileName);
        const safeBaseName = sanitizeFileName(fileBaseName);
        
        if (metadataType === 'LightningComponentBundle') {
            tempFilePath = path.join(tempDir, `${safeName}_${safeBaseName}_ORG${fileExt}`);
        } else {
            tempFilePath = path.join(tempDir, `${safeName}_ORG${fileExt}`);
        }

        if (metadataType === 'LightningComponentBundle') {
            const query = `SELECT Source FROM LightningComponentResource 
                          WHERE LightningComponentBundle.DeveloperName='${sanitizeSOQL(fileName)}' 
                          AND FilePath LIKE '%${sanitizeSOQL(fileBaseName)}${fileExt}'`;
            
            console.log("Tooling API Query for LWC Resource:", query);

            const result = await salesforceService.toolingQuery(query);

            if (result.length > 0) {
                orgContent = (result[0] as any).Source || '';
            }
        } else {
            const query = `SELECT Body FROM ${metadataType} WHERE Name='${sanitizeSOQL(fileName)}'`;

            const result = await salesforceService.query(query);

            if (result.length > 0) {
                orgContent = (result[0] as any).Body || '';
            }
        }

        if (orgContent) {
            // Write to temp file
            fs.writeFileSync(tempFilePath, orgContent, 'utf8');
            return tempFilePath;
        }

        return null;
    } catch (error) {
        console.error('Error retrieving org version:', error);
        return null;
    }
}