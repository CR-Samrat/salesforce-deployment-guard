import { AuthInfo, Connection, StateAggregator, ConfigAggregator, OrgConfigProperties } from '@salesforce/core';

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
            // Step 1: Try to get username or alias
            const agg = await ConfigAggregator.create();
            let usernameOrAlias = (agg.getInfo(OrgConfigProperties.TARGET_ORG)?.value as string | undefined) ||
                                    process.env.SF_TARGET_ORG ||
                                    process.env.SFDX_DEFAULTUSERNAME;
            
            // Step 2: If we got an alias, fetch username from it
            if (usernameOrAlias) {
                const state = await StateAggregator.getInstance();
                const resolvedUsername = await state.aliases.getUsername(usernameOrAlias);
                
                if (resolvedUsername) {
                    return resolvedUsername;
                } else {
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