import { AuthInfo, Connection, StateAggregator, ConfigAggregator, OrgConfigProperties } from '@salesforce/core';
import { sfGuardOutput } from './outputChannel';

class SalesforceService {
    private static instance: SalesforceService;
    private cachedConnection: Connection | null = null;
    private connectionExpiry: Date | null = null;
    private readonly CACHE_DURATION_MS = 30 * 60 * 1000;
    private cacheKey: { username: string; alias: string | null } | null = null;
    private cachedAggregator: ConfigAggregator | null = null;

    private constructor() {}

    public static getInstance(): SalesforceService {
        if (!SalesforceService.instance) {
            SalesforceService.instance = new SalesforceService();
        }
        return SalesforceService.instance;
    }

    public getCachedUsername(): string | null {
        return this.cacheKey?.username || null;
    }

    public getCachedAlias(): string | null {
        return this.cacheKey?.alias || null;
    }

    public async getCurrentAlias(): Promise<string | null> {
        const agg = await this.getAggregator();

        if (!agg) {
            sfGuardOutput.error('Failed to load Salesforce config aggregator.');
            return null;
        }

        const usernameOrAlias = (agg.getInfo(OrgConfigProperties.TARGET_ORG)?.value as string | undefined) ||
            process.env.SF_TARGET_ORG ||
            process.env.SFDX_DEFAULTUSERNAME;

        return usernameOrAlias || null;
    }

    public async getAggregator(): Promise<ConfigAggregator | null> {
        if (!this.cachedAggregator) {
            this.cachedAggregator = await ConfigAggregator.create();
        }
        await this.cachedAggregator.reload();

        return this.cachedAggregator;
    }

    public async getCurrentUsername(): Promise<{ username: string; alias: string | null } | null> {
        try {
            const usernameOrAlias = await this.getCurrentAlias();

            if (usernameOrAlias) {
                if (this.cacheKey && this.cacheKey.alias === usernameOrAlias) {
                    console.log(`Reusing cached username for alias ${usernameOrAlias}.`);
                    return { username: this.cacheKey.username, alias: usernameOrAlias };
                }

                const state = await StateAggregator.getInstance();
                const resolvedUsername = await state.aliases.getUsername(usernameOrAlias);

                if (resolvedUsername) {
                    return { username: resolvedUsername, alias: usernameOrAlias };
                }
                return { username: usernameOrAlias, alias: null };
            }

            sfGuardOutput.warn('No target org found in config. Falling back to first authorized org.');
            const authorizations = await AuthInfo.listAllAuthorizations();

            if (authorizations.length > 0) {
                sfGuardOutput.info(`Using first authorized org ${authorizations[0].username}.`);
                return { username: authorizations[0].username, alias: null };
            }

            sfGuardOutput.error('No Salesforce org authorizations were found.');
            return null;
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            sfGuardOutput.error(`Failed to determine current Salesforce user. ${errorText}`);
            return null;
        }
    }

    public async getConnection(): Promise<Connection | null> {
        try {
            const now = new Date();
            const current = await this.getCurrentUsername();

            if (!current) {
                sfGuardOutput.error('No current Salesforce username available.');
                this.clearCache();
                return null;
            }

            if (this.cachedConnection && this.connectionExpiry && now < this.connectionExpiry) {
                if (this.cacheKey && this.cacheKey.username === current.username && this.cacheKey.alias === current.alias) {
                    console.log(`Reusing cached Salesforce connection for ${current.username}.`);
                    return this.cachedConnection;
                }

                console.log('Salesforce org changed. Clearing cached connection.');
                this.clearCache('Org changed');
            }

            const authInfo = await AuthInfo.create({ username: current.username });
            this.cachedConnection = await Connection.create({ authInfo });
            this.connectionExpiry = new Date(now.getTime() + this.CACHE_DURATION_MS);
            this.cacheKey = { username: current.username, alias: current.alias };

            sfGuardOutput.info(`Connected to Salesforce as ${current.username}.`);
            return this.cachedConnection;
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            sfGuardOutput.error(`Failed to create Salesforce connection. ${errorText}`);
            this.clearCache();
            return null;
        }
    }

    public clearCache(reason?: string): void {
        if (reason) {
            console.log(`Clearing Salesforce connection cache. Reason: ${reason}.`);
        } else {
            console.log('Clearing Salesforce connection cache.');
        }
        this.cachedConnection = null;
        this.connectionExpiry = null;
        this.cacheKey = null;
        this.cachedAggregator = null;
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