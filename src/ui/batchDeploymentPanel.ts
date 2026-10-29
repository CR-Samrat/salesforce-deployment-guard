import * as vscode from 'vscode';
import type { BatchDeploymentResult } from '../utils/batchDeployment';

let panel: vscode.WebviewPanel | undefined;

export function showBatchDeploymentResults(results: BatchDeploymentResult[]): void {
    if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
    } else {
        panel = vscode.window.createWebviewPanel(
            'sfGuardBatchDeployment',
            'SF Guard: Batch Deployment Results',
            vscode.ViewColumn.Beside,
            { enableScripts: false }
        );
        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    panel.webview.html = renderResults(results);
}

function renderResults(results: BatchDeploymentResult[]): string {
    const successCount = results.filter((result) => result.status === 'success').length;
    const failedCount = results.filter((result) => result.status === 'failed').length;
    const conflictCount = results.filter((result) => result.status === 'conflict').length;
    const cancelledCount = results.filter((result) => result.status === 'cancelled').length;

    const rows = results.map((result) => `
        <tr>
            <td><strong>${escapeHtml(result.componentName)}</strong><br><small>${escapeHtml(result.filePath)}</small></td>
            <td>${escapeHtml(result.metadataType)}</td>
            <td><span class="status ${result.status}">${escapeHtml(result.status)}</span></td>
            <td>${escapeHtml(result.message)}${renderDetails(result.details)}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { color-scheme: light dark; }
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
        h1 { font-size: 20px; margin: 0 0 8px; }
        .summary { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid var(--vscode-panel-border); padding: 8px; text-align: left; vertical-align: top; }
        th { background: var(--vscode-editor-inactiveSelectionBackground); }
        small { color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
        .status { font-weight: 600; text-transform: capitalize; }
        .success { color: var(--vscode-testing-iconPassed); }
        .failed { color: var(--vscode-testing-iconFailed); }
        .conflict { color: var(--vscode-editorWarning-foreground); }
        .cancelled { color: var(--vscode-descriptionForeground); }
        details { margin-top: 6px; }
        pre { white-space: pre-wrap; margin: 6px 0 0; font-family: var(--vscode-editor-font-family); }
    </style>
</head>
<body>
    <h1>Batch Deployment Results</h1>
    <div class="summary">${successCount} successful, ${failedCount} failed, ${conflictCount} conflicts skipped, ${cancelledCount} cancelled</div>
    <table>
        <thead><tr><th>Component / File</th><th>Metadata Type</th><th>Status</th><th>Result</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
</body>
</html>`;
}

function renderDetails(details: string[]): string {
    if (details.length === 0) {
        return '';
    }

    return `<details><summary>Details (${details.length})</summary><pre>${escapeHtml(details.join('\n'))}</pre></details>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}