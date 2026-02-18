import * as path from 'path';

export interface MetadataInfo {
    type: string;
    name: string;
}

export function getMetadataInfo(filePath: string): MetadataInfo | null {
    const fileExt = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath, fileExt);
    
    if (fileExt === '.cls') {
        return { type: 'ApexClass', name: fileName };
    }
    
    if (fileExt === '.trigger') {
        return { type: 'ApexTrigger', name: fileName };
    }
    
    if (fileExt === '.apex') {
        return { type: 'ApexPage', name: fileName };
    }

    // Visualforce Page
    if (fileExt === '.page') {
        return { type: 'ApexPage', name: fileName };
    }

    // Visualforce Component
    if (fileExt === '.component') {
        return { type: 'ApexComponent', name: fileName };
    }

    // Lightning Web Components
    if (['.html', '.js', '.css','.xml'].includes(fileExt)) {
        const pathParts = filePath.split(/[/\\]/);
        const lwcIndex = pathParts.findIndex(part => part === 'lwc');

        if (lwcIndex !== -1 && lwcIndex < pathParts.length - 1) {
            const componentName = pathParts[lwcIndex + 1];
            return { type: 'LightningComponentBundle', name: componentName };
        }
    }

    // Aura Components
    if (['.cmp', '.app', '.evt', '.intf', '.auradoc', '.design', '.svg', '.tokens','.js', '.css'].includes(fileExt)) {
        const pathParts = filePath.split(/[/\\]/);
        const auraIndex = pathParts.findIndex(part => part === 'aura');

        if (auraIndex !== -1 && auraIndex < pathParts.length - 1) {
            const componentName = pathParts[auraIndex + 1];
            return { type: 'AuraDefinitionBundle', name: componentName };
        }
    }

    return null;
}

export function isSalesforceFile(filePath: string): boolean {
    const salesforceExtensions = [
        // Apex
        '.cls', '.trigger', '.apex',
        // Visualforce
        '.page', '.component',
        // LWC
        '.html', '.js', '.css', '.xml',
        // Aura
        '.cmp', '.app', '.evt', '.intf', '.auradoc', '.design', '.svg', '.tokens'
    ];
    
    const fileExtension = path.extname(filePath).toLowerCase();

    // For extensions that could be LWC, Aura, or regular files, check path
    if (['.js', '.html', '.css', '.xml'].includes(fileExtension)) {
        return filePath.includes('/lwc/') || filePath.includes('\\lwc\\') ||
               filePath.includes('/aura/') || filePath.includes('\\aura\\');
    }
    
    return salesforceExtensions.includes(fileExtension);
}

export function getFileExtensionsForType(metadataType: string): string[] {
    switch (metadataType) {
        case 'LightningComponentBundle':
            return ['.html', '.js', '.css', '.xml', '.svg'];
        
        case 'AuraDefinitionBundle':
            return ['.cmp', '.app', '.evt', '.intf', '.auradoc', '.css', '.js', '.design', '.svg', '.tokens'];
        
        default:
            return [];
    }
}