import * as fs from 'fs';
import * as path from 'path';
import { ComponentSet, DeployMessage } from '@salesforce/source-deploy-retrieve';
import { getMetadataInfo } from '../utils/metadataUtils';
import { salesforceService } from './salesforceService';
import { sfGuardOutput } from './outputChannel';

export interface DeployResultSummary {
    success: boolean;
    message: string;
    details?: string[];
}

export interface DeployExecutionOptions {
    onCancelRequested?: (cancel: () => Promise<void>) => void;
}

export class DeployService {
    public async deploy(filePath: string, options?: DeployExecutionOptions): Promise<DeployResultSummary> {
        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo) {
            return {
                success: false,
                message: `Unsupported Salesforce file type for deploy: ${path.basename(filePath)}`
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

        const deployPath = this.getDeployPath(filePath, metadataInfo.type);
        console.log(`Resolved deploy path for ${metadataInfo.name}: ${deployPath}`);

        const componentSet = ComponentSet.fromSource([deployPath]);
        componentSet.projectDirectory = projectDirectory;

        const deploy = await componentSet.deploy({
            usernameOrConnection: connection,
            apiOptions: {
                rollbackOnError: true
            }
        });

        options?.onCancelRequested?.(() => deploy.cancel());

        const result = await deploy.pollStatus();
        if (result.response.success) {
            sfGuardOutput.info(
                `Deployment succeeded for ${metadataInfo.name}. Components deployed: ${result.response.numberComponentsDeployed}/${result.response.numberComponentsTotal}.`
            );
            return {
                success: true,
                message: `Successfully deployed ${metadataInfo.name}.`
            };
        }

        const details = this.collectFailureDetails(result.response.details.componentFailures);
        const testFailures = result.response.details.runTestResult?.failures;

        if (testFailures) {
            const failures = Array.isArray(testFailures) ? testFailures : [testFailures];
            details.push(
                ...failures.map((failure) => `Test failure in ${failure.name}.${failure.methodName}: ${failure.message}`)
            );
        }

        if (result.response.errorMessage) {
            details.unshift(result.response.errorMessage);
        } else if (result.response.stateDetail) {
            details.unshift(result.response.stateDetail);
        }

        sfGuardOutput.error(`Deployment failed for ${metadataInfo.name}.`);
        for (const detail of details) {
            sfGuardOutput.error(`  ${detail}`);
        }

        return {
            success: false,
            message: `Deployment failed for ${metadataInfo.name}.`,
            details
        };
    }

    private getDeployPath(filePath: string, metadataType: string): string {
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

    private collectFailureDetails(failures?: DeployMessage | DeployMessage[]): string[] {
        if (!failures) {
            return [];
        }

        const failureList = Array.isArray(failures) ? failures : [failures];

        return failureList.map((failure) => {
            const location = failure.fileName || `${failure.componentType ?? 'Component'}:${failure.fullName}`;
            const lineInfo = failure.lineNumber ? `:${failure.lineNumber}` : '';
            const problem = failure.problem || 'Unknown deployment error';
            return `${location}${lineInfo} - ${problem}`;
        });
    }
}

export const deployService = new DeployService();
