export function sanitizeSOQL(value: string): string {
    return value.replace(/'/g, "\\'");
}

export function sanitizeFileName(fileName: string): string {
    return fileName
        .replace(/\.\./g, '')
        .replace(/[/\\]/g, '')
        .replace(/[<>:"|?*]/g, '');
}