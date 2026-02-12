import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuthInfo, Connection, StateAggregator } from '@salesforce/core';

class SalesforceService {
    private static instance: SalesforceService;
    private cachedConnection: Connection | null = null;
    private connectionExpiry: Date | null = null;
    private readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

    private constructor() {

    }

    public static getInstance(): SalesforceService {
        if (!SalesforceService.instance) {
            SalesforceService.instance = new SalesforceService();
        }
        return SalesforceService.instance;
    }

    public async getCurrentUsername(): Promise<string | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            
            let usernameOrAlias: string | null = null;
            const state = await StateAggregator.getInstance();
            
            // Step 1: Try to get username or alias
            if (workspaceFolder) {
                const workspaceConfig = path.join(workspaceFolder, '.sf', 'config.json');
                usernameOrAlias = this.readTargetOrgFromConfig(workspaceConfig);
            }
            
            if (!usernameOrAlias) {
                const homeDir = os.homedir();
                const globalConfig = path.join(homeDir, '.sf', 'config.json');
                usernameOrAlias = this.readTargetOrgFromConfig(globalConfig);
            }
            
            if (!usernameOrAlias) {
                const homeDir = os.homedir();
                const legacyConfig = path.join(homeDir, '.sfdx', 'sfdx-config.json');
                usernameOrAlias = this.readTargetOrgFromConfig(legacyConfig);
            }
            
            // Step 2: If we got an alias, fetch username from it
            if (usernameOrAlias) {
                const resolvedUsername = await state.aliases.getUsername(usernameOrAlias);
                
                if (resolvedUsername) {
                    console.log(`✅ Resolved alias "${usernameOrAlias}" → "${resolvedUsername}"`);
                    return resolvedUsername;
                } else {
                    console.log(`✅ Using username directly: "${usernameOrAlias}"`);
                    return usernameOrAlias;
                }
            }
            
            // Step 3: Fallback - get from AuthInfo (first authorized org)
            console.log('⚠️ No target-org found in config, using first authorized org');
            const authorizations = await AuthInfo.listAllAuthorizations();
            
            if (authorizations.length > 0) {
                console.log(`✅ Using first authorized org: "${authorizations[0].username}"`);
                return authorizations[0].username;
            }
            
            console.error('❌ No Salesforce orgs found');
            return null;
            
        } catch (error) {
            console.error('Error getting current username:', error);
            return null;
        }
    }

    private readTargetOrgFromConfig(configPath: string): string | null {
        try {
            if (!fs.existsSync(configPath)) {
                return null;
            }
            
            const content = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(content);
            
            // New SF CLI format
            if (config['target-org']) {
                return config['target-org'];
            }
            
            // Legacy SFDX format
            if (config['defaultusername']) {
                return config['defaultusername'];
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    public async getConnection(): Promise<Connection | null> {
        try {
            const now = new Date();
            
            if (this.cachedConnection && this.connectionExpiry && now < this.connectionExpiry) {
                console.log('♻️ Reusing cached connection');
                return this.cachedConnection;
            }

            const username = await this.getCurrentUsername();
            
            if (!username) {
                console.error('No username found');
                this.clearCache();
                return null;
            }

            const authInfo = await AuthInfo.create({ username });
            this.cachedConnection = await Connection.create({ authInfo });
            this.connectionExpiry = new Date(now.getTime() + this.CACHE_DURATION_MS);
            
            console.log(`✅ Connected to Salesforce as ${username}`);
            return this.cachedConnection;
            
        } catch (error) {
            console.error('Error creating Salesforce connection:', error);
            this.clearCache();
            return null;
        }
    }

    public clearCache(): void {
        console.log('🔄 Clearing connection cache');
        this.cachedConnection = null;
        this.connectionExpiry = null;
    }

    public async query<T>(soql: string): Promise<T[]> {
        const conn = await this.getConnection();
        if (!conn) {
            throw new Error('Failed to get Salesforce connection');
        }

        const result = await conn.query(soql);
        return result.records as T[];
    }

    public async toolingQuery<T>(soql: string): Promise<T[]> {
        const conn = await this.getConnection();
        if (!conn) {
            throw new Error('Failed to get Salesforce connection');
        }

        const result = await conn.tooling.query(soql);
        return result.records as T[];
    }
}

export const salesforceService = SalesforceService.getInstance();