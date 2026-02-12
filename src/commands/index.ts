import * as vscode from 'vscode';
import { SafeDeployCommand } from './safeDeploy';
import { TrackedRetrieveCommand } from './trackedRetrieve';
import { ViewSyncStatusCommand } from './viewSyncStatus';

export function registerCommands(context: vscode.ExtensionContext): void {
    const safeDeploy = new SafeDeployCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.safeDeploy',
            () => safeDeploy.execute()
        )
    );

    const trackedRetrieve = new TrackedRetrieveCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.retrieve',
            (uri?: vscode.Uri) => trackedRetrieve.execute(uri)
        )
    );

    const viewSyncStatus = new ViewSyncStatusCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.viewSyncStatus',
            () => viewSyncStatus.execute()
        )
    );

    console.log('✅ All commands registered');
}