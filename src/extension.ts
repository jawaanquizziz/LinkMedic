import * as vscode from 'vscode';
import { LinkCompletionProvider } from './LinkCompletionProvider';

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

        // UPDATED REGEX: Now catches PHP includes/requires with key fix for parentheses
        const htmlRegex = /(?:src|href|include|require|include_once|require_once)\s*=?\s*\(?\s*["']([^"']+)["']/g;
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
            const originalPath = match[1];
            // Normalize path separators
            let normalizedPath = originalPath.replace(/\\/g, '/');

            // Decode URI components (e.g. %20 -> space)
            try {
                normalizedPath = decodeURIComponent(normalizedPath);
            } catch (e) {
                // Keep as is if decode fails
            }

            if (normalizedPath.startsWith('http') || normalizedPath.startsWith('//') || normalizedPath.startsWith('mailto:') || normalizedPath.startsWith('data:') || normalizedPath.startsWith('#')) return null;

            let fileUri: vscode.Uri;
            let isAlias = false;

            if (isMernFile && !normalizedPath.startsWith('.') && !normalizedPath.startsWith('/')) {
                // Try to resolve alias
                let resolved = false;
                if (pathsConfig.paths) {
                    for (const pattern in pathsConfig.paths) {
                        const cleanPattern = pattern.replace('/*', '');
                        if (normalizedPath.startsWith(cleanPattern)) {
                            const target = pathsConfig.paths[pattern][0].replace('/*', '');
                            // Replace alias prefix with target path
                            const relativePath = normalizedPath.replace(cleanPattern, target);

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
                if (normalizedPath.startsWith('/')) {
                    // Check against workspace root for absolute paths (e.g. /css/style.css)
                    if (workspaceFolder) {
                        // Correct Logic: Treat "/" as "Workspace Root" not "Filesystem Root"
                        // Remove leading slash to make it relative to workspace folder
                        const relativePath = normalizedPath.slice(1);

                        // Try resolving against standard web roots
                        const possibleRoots = ['', 'public', 'static', 'dist', 'build', 'docs', 'public_html', 'www'];

                        // Heuristic: If the path starts with the workspace folder name, try stripping it
                        // e.g. path is "/LinkMedic/images/Icon.png" and workspace is "LinkMedic"
                        // we want to check "images/Icon.png"
                        if (workspaceFolder) {
                            const wsName = workspaceFolder.name;
                            const wsPathPrefix = `${wsName}/`;
                            if (relativePath.startsWith(wsPathPrefix)) {
                                possibleRoots.push(relativePath.substring(wsPathPrefix.length)); // Add stripped path as a "root" relative candidate
                                // Check stripped path against all roots too? 
                                // Actually, simpler: just add the stripped version as a candidate URI directly later or handle here.
                                // Let's simplify: we will construct candidates.
                            }
                        }

                        let foundUri: vscode.Uri | undefined;

                        for (const root of possibleRoots) {
                            let candidate = root ? `${root}/${relativePath}` : relativePath;

                            // Check regular candidate
                            let uri = vscode.Uri.joinPath(workspaceFolder.uri, candidate);
                            try {
                                // @ts-ignore
                                await vscode.workspace.fs.stat(uri);
                                foundUri = uri;
                                console.log(`LinkMedic Debug: Found '${normalizedPath}' at '${uri.fsPath}'`);
                                break;
                            } catch { }

                            // If we didn't find it, and we haven't stripped the workspace name yet...
                            // Actually, let's treat the stripping as just another candidate transformation
                            if (workspaceFolder && relativePath.startsWith(`${workspaceFolder.name}/`)) {
                                const stripped = relativePath.substring(workspaceFolder.name.length + 1);
                                candidate = root ? `${root}/${stripped}` : stripped;
                                uri = vscode.Uri.joinPath(workspaceFolder.uri, candidate);
                                try {
                                    // @ts-ignore
                                    await vscode.workspace.fs.stat(uri);
                                    foundUri = uri;
                                    console.log(`LinkMedic Debug: Found '${normalizedPath}' (stripped ws name) at '${uri.fsPath}'`);
                                    break;
                                } catch { }
                            }
                        }

                        if (foundUri) {
                            fileUri = foundUri;
                        } else {
                            // Default to strict root if none found, to let the error logic downstream handle it (or use the first one)
                            fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
                            console.log(`LinkMedic Debug: Root path '${normalizedPath}' NOT found in [${possibleRoots.join(', ')}]. Defaulting to '${fileUri.fsPath}'`);
                        }
                    } else {
                        // Fallback: If no workspace, treat / as relative to drive root (unlikely useful) or just ignore?
                        // Better: attempt relative to current file's drive root using fsPath logic
                        fileUri = vscode.Uri.file(normalizedPath);
                    }
                } else {
                    // Relative to current file
                    fileUri = vscode.Uri.joinPath(document.uri, '..', normalizedPath);
                }
            }

            // Logic to check file existence (same as before)
            let fileExists = false;

            try {
                // @ts-ignore
                await vscode.workspace.fs.stat(fileUri);
                fileExists = true;
            } catch {
                if (isMernFile || document.languageId === 'html' || document.languageId === 'php') {
                    // Also check for extensions in HTML/PHP (some frameworks omit them)
                    const extensions = isMernFile
                        ? ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.tsx']
                        : ['.html', '.php', '.css', '.js'];

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

            // 1. Comment Check
            const matchIndex = match.index;
            const line = document.lineAt(document.positionAt(matchIndex).line).text;
            // Simple Line Comment Check (Improvement: could specific to lang)
            if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('*')) {
                return null; // Ignore comments
            }
            // Check HTML comments <!-- --> (Same line only for simplicity)
            const preceding = line.substring(0, document.positionAt(matchIndex).character);
            if (preceding.includes('<!--') && !preceding.includes('-->')) {
                return null;
            }

            if (!fileExists) {
                // FUZZY SAFETY NET
                console.log(`LinkMedic Debug: Strict check failed for '${normalizedPath}'. Trying fuzzy search...`);

                // Extract filename
                const fileName = normalizedPath.split('/').pop();
                if (fileName) {
                    // We can't access LinkCompletionProvider's private cache easily here without refactoring.
                    // But we can use workspace.findFiles for a targeted check.
                    // Limit to 1 to be fast.
                    const fuzzyMatches = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 1);

                    if (fuzzyMatches.length > 0) {
                        // Found it somewhere else!
                        const foundPath = vscode.workspace.asRelativePath(fuzzyMatches[0]);
                        console.log(`LinkMedic Debug: Fuzzy found '${fileName}' at '${foundPath}'`);

                        const start = document.positionAt(match.index + match[0].indexOf(originalPath));
                        const end = document.positionAt(match.index + match[0].indexOf(originalPath) + originalPath.length);

                        // Return WARNING instead of Error
                        // User Request: Silence if found anywhere.
                        console.log(`LinkMedic: Silencing error for ${fileName} because it exists at ${foundPath}`);
                        return null;
                    }
                }

                console.log(`LinkMedic Debug: FAILED to find '${normalizedPath}' at '${fileUri!.fsPath}' and fuzzy search failed.`);
                const start = document.positionAt(match.index + match[0].indexOf(originalPath));
                const end = document.positionAt(match.index + match[0].indexOf(originalPath) + originalPath.length);
                return new vscode.Diagnostic(
                    new vscode.Range(start, end),
                    `LinkMedic: File not found -> ${normalizedPath}`,
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


    const linkProvider = new LinkCompletionProvider();

    // Register the custom completion provider
    const pathCompletionProvider = vscode.languages.registerCompletionItemProvider(
        supportedLangs,
        linkProvider,
        '/', '.', '@', '"', "'", '='
    );

    // Ensure we dispose of the provider's resources (file watcher)
    context.subscriptions.push(linkProvider);

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