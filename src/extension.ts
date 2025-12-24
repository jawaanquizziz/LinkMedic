import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    // This will pop up a message so you KNOW the extension started
    vscode.window.showInformationMessage('LinkMedic is now Active');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('link-medic');
    context.subscriptions.push(diagnosticCollection);

    function checkLinks(document: vscode.TextDocument) {
        // Define all languages we want to support
        const supportedLangs = [
            'html', 'php', 
            'javascript', 'javascriptreact', 
            'typescript', 'typescriptreact'
        ];

        if (!supportedLangs.includes(document.languageId)){
             return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // Pattern A: For HTML/PHP tags (src, href)
        const htmlRegex = /(?:src|href)=["']([^"']+)["']/g;

        // Pattern B: For MERN/JS imports (import, require)
        const mernRegex = /(?:import|from|require)\s*\(?["']([^"']+)["']\)?/g;

        // Determine if we are in a MERN file or standard HTML
        const isMernFile = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId);
        const regex = isMernFile ? mernRegex : htmlRegex;

        let match;
        while ((match = regex.exec(text))) {
            const linkPath = match[1];

            // 1. Skip external URLs, icons, and mail links
            if (linkPath.startsWith('http') || linkPath.startsWith('//') || linkPath.startsWith('mailto:') || linkPath.startsWith('data:')) continue;

            // 2. Skip node_modules (MERN specific: ignore imports like 'react' or 'express')
            if (isMernFile && !linkPath.startsWith('.') && !linkPath.startsWith('/')) continue;

            const currentFolder = path.dirname(document.uri.fsPath);
            const absolutePath = path.resolve(currentFolder, linkPath);

            // 3. Smart Existence Check
            let fileExists = fs.existsSync(absolutePath);

            // If file not found and it's a MERN file, try adding common extensions (.js, .jsx, etc)
            if (!fileExists && isMernFile) {
                const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.tsx'];
                for (const ext of extensions) {
                    if (fs.existsSync(absolutePath + ext)) {
                        fileExists = true;
                        break;
                    }
                }
            }

            // 4. If still not found, show error
            if (!fileExists) {
                const start = document.positionAt(match.index + match[0].indexOf(linkPath));
                const end = document.positionAt(match.index + match[0].indexOf(linkPath) + linkPath.length);
                const range = new vscode.Range(start, end);

                diagnostics.push(new vscode.Diagnostic(
                    range, 
                    `LinkMedic (MERN): File not found -> ${linkPath}`, 
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