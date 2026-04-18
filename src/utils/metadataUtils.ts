import * as path from 'path';
import * as fs from "fs";

export interface MetadataInfo {
    type: string;
    name: string;
}

export function getMetadataInfo(filePath: string): MetadataInfo | null {
    const fileExt = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath, fileExt);

    if (fileExt === ".xml") {
        return handleXmlMetadata(filePath);
    }
    
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
    if (['.html', '.js', '.css'].includes(fileExt)) {
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

function handleXmlMetadata(filePath: string): MetadataInfo | null {
    const fileName = path.basename(filePath);
    let metadataType = '';
    let componentName = '';

    if (filePath.includes('/classes/') || filePath.includes('\\classes\\')) {
        metadataType = 'ApexClass';
        componentName = fileName.replace('.cls-meta.xml', '');
    }else if(filePath.includes('/triggers/') || filePath.includes('\\triggers\\')) {
        metadataType = 'ApexTrigger';
        componentName = fileName.replace('.trigger-meta.xml', '');
    }else if(filePath.includes('/pages/') || filePath.includes('\\pages\\')) {
        metadataType = 'ApexPage';
        componentName = fileName.replace('.page-meta.xml', '');
    }else if(filePath.includes('/components/') || filePath.includes('\\components\\')) {
        metadataType = 'ApexComponent';
        componentName = fileName.replace('.component-meta.xml', '');
    }else if(filePath.includes('/lwc/') || filePath.includes('\\lwc\\')) {
        metadataType = 'LightningComponentBundle';
        const pathParts = filePath.split(/[/\\]/);
        const lwcIndex = pathParts.findIndex(part => part === 'lwc');

        if (lwcIndex !== -1 && lwcIndex < pathParts.length - 1) {
            componentName = pathParts[lwcIndex + 1];
        }
    }else if(filePath.includes('/aura/') || filePath.includes('\\aura\\')) {
        metadataType = 'AuraDefinitionBundle';
        const pathParts = filePath.split(/[/\\]/);
        const auraIndex = pathParts.findIndex(part => part === 'aura');

        if (auraIndex !== -1 && auraIndex < pathParts.length - 1) {
            componentName = pathParts[auraIndex + 1];
        }
    }

    return metadataType && componentName ? { type: metadataType, name: componentName } : null;
}

export function fetchRetrieveableFiles(metadataInfo: MetadataInfo, filePath: string): string[] {
    if (!metadataInfo) {
        console.log('📂 No metadata info available - skipping backup');
        return [];
    }

    switch (metadataInfo.type) {
        case "ApexClass":
            return [
                metadataInfo.name + '.cls',
                metadataInfo.name + '.cls-meta.xml'
            ];

        case "ApexTrigger":
            return [
                metadataInfo.name + '.trigger',
                metadataInfo.name + '.trigger-meta.xml'
            ];

        case "ApexPage":
            return [
                metadataInfo.name + '.page',
                metadataInfo.name + '.page-meta.xml'
            ];

        case "ApexComponent":
            return [
                metadataInfo.name + '.component',
                metadataInfo.name + '.component-meta.xml'
            ];

        case "LightningComponentBundle":
            return getBundleFiles(filePath, 'LWC');

        case "AuraDefinitionBundle":
            return getBundleFiles(filePath, 'Aura');

        default:
            console.log(`📂 Unsupported metadata type: ${metadataInfo.type} - skipping backup`);
            return [];
    }
}

function getBundleFiles(filePath: string, bundleType: 'LWC' | 'Aura'): string[] {
    try {
        const bundleDirPath = path.dirname(filePath);
    
        if (!fs.existsSync(bundleDirPath)) {
            console.log(`⚠️ Bundle directory not found: ${bundleDirPath}`);
            return [];
        }

        const allFiles = fs.readdirSync(bundleDirPath);
        
        // Filter out unwanted files
        const filteredFiles = allFiles.filter(file => {
            // Skip hidden files (.DS_Store, .git, etc.)
            if (file.startsWith('.')) {
                return false;
            }
            
            // Skip node_modules
            if (file === 'node_modules') {
                return false;
            }
            
            // For LWC: only .js, .html, .css, .xml, .svg files
            if (bundleType === 'LWC') {
                const ext = path.extname(file).toLowerCase();
                return ['.js', '.html', '.css', '.xml', '.svg'].includes(ext);
            }
            
            // For Aura: only Aura-specific extensions
            if (bundleType === 'Aura') {
                const ext = path.extname(file).toLowerCase();
                return [
                    '.cmp', '.app', '.evt', '.intf',
                    '.js', '.css', '.design', '.svg',
                    '.auradoc', '.tokens', '.xml'
                ].includes(ext);
            }
            
            return true;
        });

        console.log(`📂 Found ${filteredFiles.length} ${bundleType} file(s) for backup: ${filteredFiles.join(', ')}`);
        return filteredFiles;

    } catch (error) {
        console.error(`❌ Error reading ${bundleType} bundle directory:`, error);
        return [];
    }
}

export function getFileExtensionsForType(metadataType: string): string[] {
    switch (metadataType) {
        case 'LightningComponentBundle':
            return ['.html', '.js', '.css', '.xml', '.svg'];
        
        case 'AuraDefinitionBundle':
            return ['.cmp', '.app', '.evt', '.intf', '.auradoc', '.css', '.js', '.design', '.svg', '.tokens', '.xml'];
        
        default:
            return [];
    }
}