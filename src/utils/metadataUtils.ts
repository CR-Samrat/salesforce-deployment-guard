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

    if (['.html', '.js', '.css'].includes(fileExt)) {
        const pathParts = filePath.split(/[/\\]/);
        const lwcIndex = pathParts.findIndex(part => part === 'lwc');

        if (lwcIndex !== -1 && lwcIndex < pathParts.length - 1) {
            const componentName = pathParts[lwcIndex + 1];
            return { type: 'LightningComponentBundle', name: componentName };
        }
    }

    return null;
}

export function isSalesforceFile(filePath: string): boolean {
    const salesforceExtensions = ['.cls', '.trigger', '.apex', '.js', '.html', '.css'];
    const fileExtension = path.extname(filePath).toLowerCase();

    if (['.js', '.html', '.css'].includes(fileExtension)) {
        return filePath.includes('/lwc/') || filePath.includes('\\lwc\\');
    }
    
    return salesforceExtensions.includes(fileExtension);
}