import * as vscode from 'vscode';
import * as path from 'path';

export class LinkCompletionProvider implements vscode.CompletionItemProvider {
    private workspaceFiles: vscode.Uri[] = [];
    private watcher: vscode.FileSystemWatcher | undefined;

    // Extensions to include in the cache
    private readonly globPattern = '**/*.{png,jpg,jpeg,svg,webp,js,ts,jsx,tsx,css,html,php,json}';

    constructor() {
        this.buildCache();

        // Watch for file changes to update cache
        this.watcher = vscode.workspace.createFileSystemWatcher(this.globPattern);
        this.watcher.onDidCreate(uri => this.workspaceFiles.push(uri));
        this.watcher.onDidDelete(uri => {
            this.workspaceFiles = this.workspaceFiles.filter(f => f.fsPath !== uri.fsPath);
        });
        // We don't strictly need onDidChange for simple existence check, but if we cached meta-data we would.
    }

    public async buildCache() {
        // Find all matching files in the workspace
        this.workspaceFiles = await vscode.workspace.findFiles(this.globPattern, '**/node_modules/**');
        console.log(`LinkMedic: Cached ${this.workspaceFiles.length} files for autocompletion.`);
    }

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[] | undefined> {

        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        // Regex to detect if we are inside a string value for src, href, import, etc.
        // Captures the content up to the cursor
        const match = linePrefix.match(/(?:src|href|import|from|include|require|include_once|require_once)\s*\(?=?\s*["']([^"']*)$/);

        if (!match) {
            return undefined;
        }

        const typedText = match[1];
        // We want matches that contain the typed text (fuzzy-ish) or start with it
        // If typedText is empty, we show everything (might be a lot, maybe limit?)

        // Filter files
        const matchedFiles = this.searchWorkspaceFiles(typedText);

        const completionItems: vscode.CompletionItem[] = [];

        for (const fileUri of matchedFiles) {
            // Calculate relative path from current document to the target file
            // path.relative needs fs paths. 
            // Note: vscode.Uri.fsPath handles OS specifics

            let relativePath = path.relative(path.dirname(document.uri.fsPath), fileUri.fsPath);

            // Normalize to forward slashes for web/import paths
            relativePath = relativePath.split(path.sep).join('/');

            // Ensure relative paths start with ./ if they are in the same or sub directory 
            // (Standard node/web convention often likes ./ for local imports, though clean relative paths work too)
            if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
                relativePath = './' + relativePath;
            }

            const fileName = path.basename(fileUri.fsPath);

            const item = new vscode.CompletionItem(fileName, vscode.CompletionItemKind.File);
            item.detail = relativePath;
            item.documentation = new vscode.MarkdownString(`Path: \`${relativePath}\`\n\nFull: \`${fileUri.fsPath}\``);
            item.insertText = relativePath;

            // Boost exact matches if needed, but VS Code usually handles sorting well based on the label/filterText
            // We can set filterText to matched input if we want custom filtering, 
            // but letting VS Code fuzzy match against label/detail is often enough if we provide the right set.
            // However, we are filtering *before* returning to be performant.

            completionItems.push(item);
        }

        return completionItems;
    }

    private searchWorkspaceFiles(query: string): vscode.Uri[] {
        if (!query) {
            // Return top 50 files if no query to avoid overwhelming
            return this.workspaceFiles.slice(0, 50);
        }

        const lowerQuery = query.toLowerCase();
        // Simple heuristic: match on filename or full path
        return this.workspaceFiles
            .filter(uri => {
                const parts = uri.path.split('/');
                const fileName = parts[parts.length - 1].toLowerCase();
                return fileName.includes(lowerQuery) || uri.path.toLowerCase().includes(lowerQuery);
            })
            .slice(0, 50); // Limit results for performance
    }

    public dispose() {
        this.watcher?.dispose();
    }
}
