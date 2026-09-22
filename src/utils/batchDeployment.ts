import type { DeployResultSummary } from '../services/deployService';
import { getMetadataInfo, MetadataInfo } from './metadataUtils';

const deployableMetadataTypes = new Set([
    'ApexClass',
    'ApexTrigger',
    'ApexPage',
    'ApexComponent',
    'LightningComponentBundle',
    'AuraDefinitionBundle'
]);

export interface BatchDeploymentItem {
    filePath: string;
    metadataInfo: MetadataInfo;
}

export type BatchDeploymentStatus = 'success' | 'failed' | 'cancelled';

export interface BatchDeploymentResult {
    filePath: string;
    metadataType: string;
    componentName: string;
    status: BatchDeploymentStatus;
    message: string;
    details: string[];
}

export function normalizeBatchSelections(filePaths: string[]): BatchDeploymentItem[] {
    const items: BatchDeploymentItem[] = [];
    const seen = new Set<string>();

    for (const filePath of filePaths) {
        const metadataInfo = getMetadataInfo(filePath);
        if (!metadataInfo || !deployableMetadataTypes.has(metadataInfo.type)) {
            continue;
        }

        const identity = `${metadataInfo.type}:${metadataInfo.name}`;
        if (seen.has(identity)) {
            continue;
        }

        seen.add(identity);
        items.push({ filePath, metadataInfo });
    }

    return items;
}

export function orderBatchSelections(
    availableItems: BatchDeploymentItem[],
    orderedPaths: string[]
): BatchDeploymentItem[] {
    const itemsByPath = new Map(availableItems.map((item) => [item.filePath, item]));
    return orderedPaths
        .map((filePath) => itemsByPath.get(filePath))
        .filter((item): item is BatchDeploymentItem => item !== undefined);
}

export function createBatchResult(
    item: BatchDeploymentItem,
    result: DeployResultSummary
): BatchDeploymentResult {
    return {
        filePath: item.filePath,
        metadataType: item.metadataInfo.type,
        componentName: item.metadataInfo.name,
        status: result.success ? 'success' : 'failed',
        message: result.message,
        details: result.details ?? []
    };
}