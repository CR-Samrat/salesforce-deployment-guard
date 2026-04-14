import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { initializeServices, sfGuardOutput } from './services';

export function activate(context: vscode.ExtensionContext) {
    initializeServices(context);
    registerCommands(context);
    sfGuardOutput.info('Salesforce Deployment Guard activated successfully.');
}

export function deactivate() {
    sfGuardOutput.info('Salesforce Deployment Guard is deactivating.');
}
