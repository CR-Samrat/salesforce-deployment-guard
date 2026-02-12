import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { initializeServices } from './services';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, "salesforce-deployment-guard" is now active!');

    // Initialize services
    initializeServices(context);

    // Register all commands
    registerCommands(context);

    console.log('✅ Salesforce Deployment Guard activated successfully');
}

export function deactivate() {
    console.log('Salesforce Deployment Guard is deactivating...');
}