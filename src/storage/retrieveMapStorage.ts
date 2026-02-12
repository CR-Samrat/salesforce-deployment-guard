import * as vscode from 'vscode';

const RETRIEVE_MAP_KEY = 'sfGuard.retrieveTimestamps';

export function getRetrieveMap(context: vscode.ExtensionContext): Map<string, Date> {
    const stored = context.workspaceState.get<Record<string, string>>(RETRIEVE_MAP_KEY, {});
    const map = new Map<string, Date>();
    
    for (const [key, value] of Object.entries(stored)) {
        map.set(key, new Date(value));
    }
    
    return map;
}

export function saveRetrieveMap(context: vscode.ExtensionContext, map: Map<string, Date>): void {
    const obj: Record<string, string> = {};
    
    map.forEach((date, key) => {
        obj[key] = date.toISOString();
    });
    
    context.workspaceState.update(RETRIEVE_MAP_KEY, obj);
}

export function clearRetrieveMap(context: vscode.ExtensionContext): void {
    context.workspaceState.update(RETRIEVE_MAP_KEY, {});
}