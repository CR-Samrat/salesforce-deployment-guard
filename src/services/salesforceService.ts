import { AuthInfo, Connection, StateAggregator, ConfigAggregator, OrgConfigProperties } from '@salesforce/core';

class SalesforceService {
    private static instance: SalesforceService;
    private cachedConnection: Connection | null = null;
    private connectionExpiry: Date | null = null;
    private readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
    private cacheKey: {username: string; alias: string | null} | null = null;

    private constructor() {

    }

    public static getInstance(): SalesforceService {
        if (!SalesforceService.instance) {
            SalesforceService.instance = new SalesforceService();
        }
        return SalesforceService.instance;
    }

    public getCachedUsername(): string | null {
        return this.cacheKey?.username || null;
    }

    public async getCurrentUsername(): Promise<{username: string; alias: string | null} | null> {
        try {
            // Step 1: Try to get username or alias
            const agg = await ConfigAggregator.create();
            await agg.reload();
            let usernameOrAlias = (agg.getInfo(OrgConfigProperties.TARGET_ORG)?.value as string | undefined) ||
                                    process.env.SF_TARGET_ORG ||
                                    process.env.SFDX_DEFAULTUSERNAME;
            
            // Step 2: If we got an alias, fetch username from it
            if (usernameOrAlias) {
                const state = await StateAggregator.getInstance();
                const resolvedUsername = await state.aliases.getUsername(usernameOrAlias);
                
                if (resolvedUsername) {
                    return {username: resolvedUsername, alias: usernameOrAlias};
                } else {
                    return {username: usernameOrAlias, alias: null};
                }
            }
            
            // Step 3: Fallback - get from AuthInfo (first authorized org)
            console.log('⚠️ No target-org found in config, using first authorized org');
            const authorizations = await AuthInfo.listAllAuthorizations();
            
            if (authorizations.length > 0) {
                console.log(`✅ Using first authorized org: "${authorizations[0].username}"`);
                return {username: authorizations[0].username, alias: null};
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
            const current = await this.getCurrentUsername();

            if(!current) {
                console.error('No current username available');
                this.clearCache();
                return null;
            }
            
            if (this.cachedConnection && this.connectionExpiry && now < this.connectionExpiry) {
                if(this.cacheKey && this.cacheKey.username === current.username && this.cacheKey.alias === current.alias) {
                    console.log('♻️ Reusing cached connection');
                    return this.cachedConnection;
                }else{
                    const oldOrg = this.cacheKey ? (this.cacheKey.alias || this.cacheKey.username) : 'unknown';
                    const newOrg = current.alias || current.username;
                    console.log('🔄 Org changed, clearing cache');
                    this.clearCache('Org Changed');
                }
            }

            const authInfo = await AuthInfo.create({ username: current.username });
            this.cachedConnection = await Connection.create({ authInfo });
            this.connectionExpiry = new Date(now.getTime() + this.CACHE_DURATION_MS);
            this.cacheKey = {username: current.username, alias: current.alias};
            
            console.log(`✅ Connected to Salesforce as ${current.username}`);
            return this.cachedConnection;
            
        } catch (error) {
            console.error('Error creating Salesforce connection:', error);
            this.clearCache();
            return null;
        }
    }

    public clearCache(reason?: string): void {
        console.log('🔄 Clearing connection cache');
        if (reason) {
            console.log(`Reason: ${reason}`);
        }
        this.cachedConnection = null;
        this.connectionExpiry = null;
        this.cacheKey = null;
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