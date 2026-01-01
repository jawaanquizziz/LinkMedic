import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('LinkMedic is now Active');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('link-medic');
    context.subscriptions.push(diagnosticCollection);

    const supportedLangs = ['html', 'php', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

    const createFileCommand = vscode.commands.registerCommand('linkmedic.createFile', async (fileUri: vscode.Uri) => {
        try {
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`LinkMedic: Created ${vscode.workspace.asRelativePath(fileUri)}`);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to create file: ${err}`);
        }
    });

    const quickFixProvider = vscode.languages.registerCodeActionsProvider(supportedLangs, {
        provideCodeActions(document, range, context) {
            const diagnostics = context.diagnostics.filter(d => d.message.includes('LinkMedic'));
            if (diagnostics.length === 0) return [];

            return diagnostics.map(diagnostic => {
                const parts = diagnostic.message.split('-> ');
                const linkPath = parts[parts.length - 1];
                const fileUri = vscode.Uri.joinPath(document.uri, '..', linkPath);

                const action = new vscode.CodeAction(`Create missing file: ${linkPath}`, vscode.CodeActionKind.QuickFix);
                action.command = {
                    command: 'linkmedic.createFile',
                    title: 'Create File',
                    arguments: [fileUri]
                };
                action.diagnostics = [diagnostic];
                action.isPreferred = true;
                return action;
            });
        }
    });

    // Cache for tsconfig paths to avoid constant disk reads
    let cachedPaths: { [key: string]: any } | null = null;
    let cachedBaseUrl: string | undefined;

    // Helper to strip comments from JSON (tsconfig allows comments)
    function stripJsonComments(json: string) {
        return json.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
    }

    async function loadPathsConfig(workspaceFolder: vscode.WorkspaceFolder) {
        if (cachedPaths) return { paths: cachedPaths, baseUrl: cachedBaseUrl };

        const configFiles = ['tsconfig.json', 'jsconfig.json'];
        for (const file of configFiles) {
            try {
                const uri = vscode.Uri.joinPath(workspaceFolder.uri, file);
                const data = await vscode.workspace.fs.readFile(uri);
                const json = stripJsonComments(data.toString());
                const config = JSON.parse(json);
                if (config.compilerOptions && config.compilerOptions.paths) {
                    cachedPaths = config.compilerOptions.paths;
                    cachedBaseUrl = config.compilerOptions.baseUrl || '.';
                    return { paths: cachedPaths, baseUrl: cachedBaseUrl };
                }
            } catch { continue; }
        }
        return { paths: null, baseUrl: undefined };
    }

    async function checkLinks(document: vscode.TextDocument) {
        if (!supportedLangs.includes(document.languageId)) return;

        const text = document.getText();

        // UPDATED REGEX: Now catches PHP includes/requires
        const htmlRegex = /(?:src|href|include|require|include_once|require_once)\s*=?\s*["']([^"']+)["']/g;
        const mernRegex = /(?:import|from|require)\s*\(?["']([^"']+)["']\)?/g;

        const isMernFile = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId);
        const regex = isMernFile ? mernRegex : htmlRegex;

        const matches = [];
        let match;
        while ((match = regex.exec(text))) {
            matches.push(match);
        }

        // Pre-load paths if in a workspace
        let pathsConfig: any = { paths: null, baseUrl: undefined };
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (isMernFile && workspaceFolder) {
            pathsConfig = await loadPathsConfig(workspaceFolder);
        }

        const checks = matches.map(async (match) => {
            let linkPath = match[1];
            if (linkPath.startsWith('http') || linkPath.startsWith('//') || linkPath.startsWith('mailto:') || linkPath.startsWith('data:')) return null;

            let fileUri: vscode.Uri;
            let isAlias = false;

            if (isMernFile && !linkPath.startsWith('.') && !linkPath.startsWith('/')) {
                // Try to resolve alias
                let resolved = false;
                if (pathsConfig.paths) {
                    for (const pattern in pathsConfig.paths) {
                        const cleanPattern = pattern.replace('/*', '');
                        if (linkPath.startsWith(cleanPattern)) {
                            const target = pathsConfig.paths[pattern][0].replace('/*', '');
                            // Replace alias prefix with target path
                            const relativePath = linkPath.replace(cleanPattern, target);

                            // Construct full path: WorkspaceRoot + BaseUrl + TargetPath
                            // BaseUrl is usually relative to the tsconfig file location (WorkspaceRoot)
                            const base = pathsConfig.baseUrl || '.';
                            fileUri = vscode.Uri.joinPath(workspaceFolder!.uri, base, relativePath);
                            resolved = true;
                            isAlias = true;
                            break;
                        }
                    }
                }

                // If not an alias and not relative, it's a node_module => ignore
                if (!resolved) return null;
            } else {
                fileUri = vscode.Uri.joinPath(document.uri, '..', linkPath);
            }

            // Logic to check file existence (same as before)
            let fileExists = false;

            try {
                // If it was an alias, we already constructed the final URI.
                // However, TS aliases might handle extensions automatically too.
                // If it's a standard path (not initialized above), TS might complain, but logic flow ensures fileUri is set if we get here.

                // Note: fileUri is assigned in both branches above.
                // TypeScript workaround: logic guarantees fileUri is assigned
                // @ts-ignore
                await vscode.workspace.fs.stat(fileUri);
                fileExists = true;
            } catch {
                if (isMernFile) {
                    const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.tsx'];
                    // We can also parallelize these extension checks if we want, but sequential here is probably okay since it's local to one "logical" file check.
                    // However, for maximum speed, let's parallelize them too.
                    const extensionChecks = extensions.map(async (ext) => {
                        try {
                            // @ts-ignore
                            await vscode.workspace.fs.stat(vscode.Uri.parse(fileUri.toString() + ext));
                            return true;
                        } catch {
                            return false;
                        }
                    });
                    const results = await Promise.all(extensionChecks);
                    if (results.some(exists => exists)) {
                        fileExists = true;
                    }
                }
            }

            if (!fileExists) {
                const start = document.positionAt(match.index + match[0].indexOf(linkPath));
                const end = document.positionAt(match.index + match[0].indexOf(linkPath) + linkPath.length);
                return new vscode.Diagnostic(
                    new vscode.Range(start, end),
                    `LinkMedic: File not found -> ${linkPath}`,
                    vscode.DiagnosticSeverity.Error
                );
            }
            return null;
        });

        const results = await Promise.all(checks);
        const diagnostics = results.filter((d): d is vscode.Diagnostic => d !== null);
        diagnosticCollection.set(document.uri, diagnostics);
    }

    // Clear cache when config changes
    const configWatcher = vscode.workspace.createFileSystemWatcher('**/{tsconfig,jsconfig}.json');
    configWatcher.onDidChange(() => { cachedPaths = null; });
    configWatcher.onDidCreate(() => { cachedPaths = null; });
    configWatcher.onDidDelete(() => { cachedPaths = null; });
    context.subscriptions.push(configWatcher);


    const pathCompletionProvider = vscode.languages.registerCompletionItemProvider(
        supportedLangs,
        {
            async provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);
                // Regex to capture the content inside quotes up to the cursor
                const match = linePrefix.match(/(?:src|href|import|from|include|require|include_once|require_once)\s*\(?=?\s*["']([^"']*)$/);
                if (!match) return undefined;

                const typedPath = match[1];
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                if (!workspaceFolder) return undefined;

                // Determine the directory we want to list content from
                let searchUri: vscode.Uri;

                // Case 1: Alias (e.g. @/components/)
                let isAlias = false;
                if ((typedPath.startsWith('@') || typedPath.match(/^[a-zA-Z0-9_-]/)) && workspaceFolder) {
                    const config = await loadPathsConfig(workspaceFolder);
                    if (config.paths) {
                        for (const pattern in config.paths) {
                            const cleanPattern = pattern.replace('/*', '');
                            if (typedPath.startsWith(cleanPattern)) {
                                const target = config.paths[pattern][0].replace('/*', '');
                                const relativeTyped = typedPath.replace(cleanPattern, target);

                                // We want the directory of what is typed. 
                                // valid: @/comp -> list @/ (which maps to src/) filtering by "comp"
                                // valid: @/components/B -> list @/components/ filtering by "B"

                                const base = config.baseUrl || '.';
                                const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, base, relativeTyped);

                                // If typedPath ends with /, we search that dir. If not, we search parent.
                                if (typedPath.endsWith('/')) {
                                    searchUri = fullPath;
                                } else {
                                    searchUri = vscode.Uri.joinPath(fullPath, '..');
                                }
                                isAlias = true;
                                break;
                            }
                        }
                    }
                }

                // Case 2: Relative path (e.g. ./ or ../ or just typing a subfolder)
                if (!isAlias) {
                    if (typedPath.startsWith('/')) {
                        // Absolute from workspace root? Or OS root? 
                        // Usually in web projects / means root. Let's assume workspace root.
                        searchUri = workspaceFolder.uri;
                        if (typedPath.length > 1) {
                            const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, typedPath);
                            if (typedPath.endsWith('/')) {
                                searchUri = fullPath;
                            } else {
                                searchUri = vscode.Uri.joinPath(fullPath, '..');
                            }
                        }
                    } else {
                        // Relative to document
                        const currentDir = vscode.Uri.joinPath(document.uri, '..');
                        if (typedPath === '') {
                            searchUri = currentDir;
                        } else {
                            const fullPath = vscode.Uri.joinPath(currentDir, typedPath);
                            if (typedPath.endsWith('/')) {
                                searchUri = fullPath;
                            } else {
                                searchUri = vscode.Uri.joinPath(fullPath, '..');
                            }
                        }
                    }
                }

                try {
                    // @ts-ignore
                    const files = await vscode.workspace.fs.readDirectory(searchUri);
                    const lastSegment = typedPath.split('/').pop() || "";

                    return files.map(([name, type]) => {
                        // Filter based on what user already typed? VS Code handles fuzzy filtering, 
                        // but if we are providing a specific list based on dir, we usually give everything.

                        // We must define what text is inserted.
                        // If typed ./comp, and we suggest 'components', insertText should be 'components'.

                        const item = new vscode.CompletionItem(name,
                            type === vscode.FileType.Directory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
                        );

                        if (type === vscode.FileType.Directory) {
                            item.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger' };
                            // Add trailing slash for convenience? 
                            // VS Code might double it if user types it. Let's stick to name.
                        }
                        return item;
                    });
                } catch { return undefined; }
            }
        },
        '/', '.', '@', '"', "'"
    );

    // Debounce the live checking to avoid performance issues while typing
    let timeout: NodeJS.Timeout | undefined = undefined;
    const triggerCheck = (doc: vscode.TextDocument) => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
        }
        timeout = setTimeout(() => checkLinks(doc), 500);
    };

    context.subscriptions.push(
        createFileCommand,
        quickFixProvider,
        pathCompletionProvider,
        // Check immediately on open
        vscode.workspace.onDidOpenTextDocument(doc => checkLinks(doc)),
        // Check with delay on change
        vscode.workspace.onDidChangeTextDocument(e => triggerCheck(e.document))
    );

    if (vscode.window.activeTextEditor) {
        checkLinks(vscode.window.activeTextEditor.document);
    }
}