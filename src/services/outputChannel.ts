import * as vscode from 'vscode';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

class SfGuardOutputChannel {
    private channel: vscode.OutputChannel | null = null;

    public initialize(): void {
        if (!this.channel) {
            this.channel = vscode.window.createOutputChannel('SF Guard');
        }
    }

    public dispose(): void {
        this.channel?.dispose();
        this.channel = null;
    }

    public info(message: string): void {
        this.append('INFO', message);
    }

    public warn(message: string): void {
        this.append('WARN', message);
    }

    public error(message: string): void {
        this.append('ERROR', message);
    }

    public show(preserveFocus = true): void {
        this.initialize();
        this.channel?.show(preserveFocus);
    }

    private append(level: LogLevel, message: string): void {
        this.initialize();
        this.channel?.appendLine(`${new Date().toLocaleString()} [${level}] ${message}`);
    }
}

export const sfGuardOutput = new SfGuardOutputChannel();
