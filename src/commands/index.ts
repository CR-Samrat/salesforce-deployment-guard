import * as vscode from 'vscode';
import { SafeDeployCommand } from './safeDeploy';
import { TrackedRetrieveCommand } from './trackedRetrieve';
import { ViewSyncStatusCommand } from './viewSyncStatus';
import { CompareBackupCommand } from './compareBackup';
import { ToggleBackupCommand } from './toggleBackup';
import { TakeBackupCommand } from './takeBackup';
import { sfGuardOutput } from '../services';

export function registerCommands(context: vscode.ExtensionContext): void {
    const safeDeploy = new SafeDeployCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.safeDeploy',
            (uri?: vscode.Uri) => {
                sfGuardOutput.show(false);
                return safeDeploy.execute(uri);
            }
        )
    );

    const trackedRetrieve = new TrackedRetrieveCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.retrieve',
            (uri?: vscode.Uri) => {
                sfGuardOutput.show(false);
                return trackedRetrieve.execute(uri);
            }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.retrieveManifest',
            (uri?: vscode.Uri) => {
                sfGuardOutput.show(false);
                return trackedRetrieve.execute(uri);
            }
        )
    );

    const viewSyncStatus = new ViewSyncStatusCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.viewSyncStatus',
            () => {
                sfGuardOutput.show(false);
                return viewSyncStatus.execute();
            }
        )
    );

    const compareBackup = new CompareBackupCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.compareBackup',
            (uri?: vscode.Uri) => {
                sfGuardOutput.show(false);
                return compareBackup.execute(uri);
            }
        )
    );

    const toggleBackup = new ToggleBackupCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.toggleBackup',
            (uri?: vscode.Uri) => {
                sfGuardOutput.show(false);
                return toggleBackup.execute(uri);
            }
        )
    );

    const takeBackup = new TakeBackupCommand(context);
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'salesforce-deployment-guard.takeBackup',
            (uri?: vscode.Uri) => {
                sfGuardOutput.show(false);
                return takeBackup.execute(uri);
            }
        )
    );

    console.log('✅ All commands registered');
}
