import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    // This will pop up a message so you KNOW the extension started
    vscode.window.showInformationMessage('LinkMedic is now Active!');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('link-medic');
    context.subscriptions.push(diagnosticCollection);

    function checkLinks(document: vscode.TextDocument) {
        if (document.languageId !== 'html' && document.languageId !== 'php') return;

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const regex = /(?:src|href)=["']([^"']+)["']/g;
        let match;

        while ((match = regex.exec(text))) {
            const linkPath = match[1];
            if (linkPath.startsWith('http') || linkPath.startsWith('//') || linkPath.startsWith('mailto:')) continue;

            const currentFolder = path.dirname(document.uri.fsPath);
            const absolutePath = path.resolve(currentFolder, linkPath);

            if (!fs.existsSync(absolutePath)) {
                const start = document.positionAt(match.index + match[0].indexOf(linkPath));
                const end = document.positionAt(match.index + match[0].indexOf(linkPath) + linkPath.length);
                const range = new vscode.Range(start, end);

                diagnostics.push(new vscode.Diagnostic(
                    range, 
                    `LinkMedic: File not found -> ${linkPath}`, 
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
        diagnosticCollection.set(document.uri, diagnostics);
    }

    // Trigger check on open, on save, and on change
    vscode.workspace.onDidOpenTextDocument(doc => checkLinks(doc), null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(e => checkLinks(e.document), null, context.subscriptions);
    
    if (vscode.window.activeTextEditor) {
        checkLinks(vscode.window.activeTextEditor.document);
    }
}