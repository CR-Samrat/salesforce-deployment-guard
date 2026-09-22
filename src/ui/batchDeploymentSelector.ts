import * as vscode from 'vscode';
import type { BatchDeploymentItem } from '../utils/batchDeployment';

export function showBatchDeploymentSelector(
    availableItems: BatchDeploymentItem[],
    initiallySelectedPath?: string
): Promise<string[] | undefined> {
    return new Promise((resolve) => {
        const panel = vscode.window.createWebviewPanel(
            'sfGuardBatchDeploymentSelector',
            'SF Guard: Select Components to Deploy',
            vscode.ViewColumn.Active,
            { enableScripts: true }
        );
        let settled = false;

        const finish = (selection?: string[]) => {
            if (settled) {
                return;
            }
            settled = true;
            panel.dispose();
            resolve(selection);
        };

        panel.onDidDispose(() => finish());
        panel.webview.onDidReceiveMessage((message: { command?: string; paths?: string[] }) => {
            if (message.command === 'deploy' && message.paths) {
                finish(message.paths);
            } else if (message.command === 'cancel') {
                finish();
            }
        });

        panel.webview.html = renderSelector(availableItems, initiallySelectedPath);
    });
}

function renderSelector(items: BatchDeploymentItem[], initiallySelectedPath?: string): string {
    const serializedItems = JSON.stringify(items)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    const initialSelection = initiallySelectedPath ? JSON.stringify([initiallySelectedPath]) : '[]';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-selector'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { color-scheme: light dark; }
        html, body { height: 100%; min-height: 0; }
        body { box-sizing: border-box; height: 100vh; font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 18px; margin: 0; display: flex; flex-direction: column; overflow: hidden; }
        h1 { font-size: 20px; margin: 0 0 6px; }
        .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
        .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 92px minmax(0, 1fr); gap: 12px; min-height: 0; flex: 1 1 0; }
        .column { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
        .column h2 { font-size: 13px; margin: 0 0 8px; }
        .list { box-sizing: border-box; border: 1px solid var(--vscode-panel-border); overflow-x: hidden; overflow-y: auto; min-height: 0; height: auto; flex: 1 1 0; padding: 6px; }
        .component { display: block; width: 100%; border: 0; border-bottom: 1px solid var(--vscode-panel-border); background: transparent; color: var(--vscode-foreground); text-align: left; padding: 9px 8px; cursor: pointer; }
        .component:hover { background: var(--vscode-list-hoverBackground); }
        .component:last-child { border-bottom: 0; }
        .component-name { display: block; font-weight: 600; }
        .component-meta { display: block; color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 3px; overflow-wrap: anywhere; }
        button { font: inherit; }
        .icon-button { min-width: 34px; height: 30px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
        .icon-button:hover, .primary:hover { background: var(--vscode-button-hoverBackground); }
        .transfer { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 8px; }
        .actions { display: flex; justify-content: space-between; margin-top: 14px; flex: 0 0 auto; }
        .action-group { display: flex; gap: 8px; }
        .primary, .secondary { border: 0; padding: 8px 14px; cursor: pointer; }
        .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .empty { color: var(--vscode-descriptionForeground); padding: 12px 8px; }
        .group { border: 1px solid var(--vscode-panel-border); margin-bottom: 6px; }
        .group summary { cursor: pointer; padding: 7px 8px; font-weight: 600; background: var(--vscode-editor-inactiveSelectionBackground); }
        .group-items { padding: 0 6px; }
        .dragging { opacity: 0.45; }
        .drop-target { border-top: 2px solid var(--vscode-focusBorder); }
        @media (max-width: 700px) { body { overflow: auto; } .workspace { grid-template-columns: 1fr; height: auto; min-height: 600px; } .transfer { flex-direction: row; } }
    </style>
</head>
<body>
    <h1>Select components to deploy</h1>
    <div class="subtitle">Choose components on the left, then arrange the deployment order on the right.</div>
    <main class="workspace">
        <section class="column"><h2>Available components (<span id="available-count">0</span>)</h2><div id="available" class="list"></div></section>
        <div class="transfer">
            <button id="add" class="icon-button" title="Add selected component">Add &gt;</button>
            <button id="remove" class="icon-button" title="Remove selected component">Remove &lt;</button>
        </div>
        <section class="column"><h2>Deployment order (<span id="selected-count">0</span>)</h2><div id="selected" class="list"></div></section>
    </main>
    <footer class="actions">
        <button id="cancel" class="secondary">Cancel</button>
        <div class="action-group"><button id="deploy" class="primary">Deploy selected</button></div>
    </footer>
    <script nonce="selector">
        const vscode = acquireVsCodeApi();
        const items = ${serializedItems};
        let selectedPaths = ${initialSelection};
        let focusedAvailablePath = null;
        let focusedSelectedPath = null;

        function itemFor(path) { return items.find((item) => item.filePath === path); }
        function componentMarkup(item) {
            return '<span class="component-name">' + escapeHtml(item.metadataInfo.name) + '</span>' +
                '<span class="component-meta">' + escapeHtml(item.metadataInfo.type) + ' | ' + escapeHtml(item.filePath) + '</span>';
        }
        function escapeHtml(value) {
            return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
        }
        function groupLabel(type) {
            return { ApexClass: 'Apex Classes', ApexTrigger: 'Apex Triggers', ApexPage: 'Visualforce Pages', ApexComponent: 'Visualforce Components', LightningComponentBundle: 'Lightning Web Components', AuraDefinitionBundle: 'Aura Components' }[type] || type;
        }
        function render() {
            const available = items.filter((item) => !selectedPaths.includes(item.filePath));
            document.getElementById('available-count').textContent = available.length;
            document.getElementById('selected-count').textContent = selectedPaths.length;
            const groups = available.reduce((result, item) => { const key = item.metadataInfo.type; (result[key] ||= []).push(item); return result; }, {});
            const groupOrder = ['ApexClass', 'ApexTrigger', 'ApexPage', 'ApexComponent', 'LightningComponentBundle', 'AuraDefinitionBundle'];
            document.getElementById('available').innerHTML = available.length ? groupOrder.filter((type) => groups[type]).map((type) => { const groupItems = groups[type].sort((left, right) => left.metadataInfo.name.localeCompare(right.metadataInfo.name)); return '<details class="group" open><summary>' + groupLabel(type) + ' (' + groupItems.length + ')</summary><div class="group-items">' + groupItems.map((item) => '<button class="component" data-available="' + escapeHtml(item.filePath) + '">' + componentMarkup(item) + '</button>').join('') + '</div></details>'; }).join('') : '<div class="empty">All available components are selected.</div>';
            document.getElementById('selected').innerHTML = selectedPaths.length ? selectedPaths.map((filePath, index) => { const item = itemFor(filePath); return '<button draggable="true" class="component" data-selected="' + escapeHtml(filePath) + '"><span class="component-name">' + (index + 1) + '. ' + componentMarkup(item) + '</span></button>'; }).join('') : '<div class="empty">No components selected.</div>';
            document.querySelectorAll('[data-available]').forEach((element) => element.addEventListener('click', () => { focusedAvailablePath = element.getAttribute('data-available'); focusedSelectedPath = null; highlight(); }));
            document.querySelectorAll('[data-available]').forEach((element) => element.addEventListener('dblclick', addFocused));
            document.querySelectorAll('[data-selected]').forEach((element) => element.addEventListener('click', () => { focusedSelectedPath = element.getAttribute('data-selected'); focusedAvailablePath = null; highlight(); }));
            document.querySelectorAll('[data-selected]').forEach((element) => element.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/plain', element.getAttribute('data-selected')); element.classList.add('dragging'); }));
            document.querySelectorAll('[data-selected]').forEach((element) => element.addEventListener('dragend', () => element.classList.remove('dragging')));
            document.querySelectorAll('[data-selected]').forEach((element) => element.addEventListener('dragover', (event) => { event.preventDefault(); element.classList.add('drop-target'); }));
            document.querySelectorAll('[data-selected]').forEach((element) => element.addEventListener('dragleave', () => element.classList.remove('drop-target')));
            document.querySelectorAll('[data-selected]').forEach((element) => element.addEventListener('drop', (event) => { event.preventDefault(); element.classList.remove('drop-target'); moveDragged(event.dataTransfer.getData('text/plain'), element.getAttribute('data-selected')); }));
            highlight();
        }
        function highlight() {
            document.querySelectorAll('[data-available]').forEach((element) => element.style.outline = element.getAttribute('data-available') === focusedAvailablePath ? '1px solid var(--vscode-focusBorder)' : '');
            document.querySelectorAll('[data-selected]').forEach((element) => element.style.outline = element.getAttribute('data-selected') === focusedSelectedPath ? '1px solid var(--vscode-focusBorder)' : '');
        }
        function addFocused() { if (focusedAvailablePath && !selectedPaths.includes(focusedAvailablePath)) { selectedPaths.push(focusedAvailablePath); focusedAvailablePath = null; render(); } }
        function removeFocused() { if (focusedSelectedPath) { selectedPaths = selectedPaths.filter((path) => path !== focusedSelectedPath); focusedSelectedPath = null; render(); } }
        function moveDragged(draggedPath, targetPath) { const from = selectedPaths.indexOf(draggedPath); const target = selectedPaths.indexOf(targetPath); if (from < 0 || target < 0 || from === target) return; const item = selectedPaths.splice(from, 1)[0]; selectedPaths.splice(selectedPaths.indexOf(targetPath), 0, item); focusedSelectedPath = draggedPath; render(); }
        document.getElementById('add').addEventListener('click', addFocused);
        document.getElementById('remove').addEventListener('click', removeFocused);
        document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));
        document.getElementById('deploy').addEventListener('click', () => { if (selectedPaths.length) vscode.postMessage({ command: 'deploy', paths: selectedPaths }); });
        render();
    </script>
</body>
</html>`;
}