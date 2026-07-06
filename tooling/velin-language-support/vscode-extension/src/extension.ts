import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Bundled by esbuild into the extension's own dist/ folder.
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'html' }],
    synchronize: {
      // Only source files whose contents feed the TS type resolver need to
      // invalidate the program cache. HTML edits and JSON files don't.
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'),
      ],
      // Forward velin.* setting changes to the server via
      // `workspace/didChangeConfiguration`. No restart needed.
      configurationSection: 'velin',
    },
    initializationOptions: () => {
      const config = vscode.workspace.getConfiguration('velin');
      return {
        enable: config.get('enable', true),
        trace: config.get('trace.server', 'off'),
      };
    },
  };

  client = new LanguageClient(
    'velinLanguageServer',
    'Velin Language Server',
    serverOptions,
    clientOptions,
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'velin.restartServer';
  updateStatus(statusBarItem, 'starting');
  statusBarItem.show();

  client.onDidChangeState((e) => {
    if (e.newState === State.Running) updateStatus(statusBarItem, 'ready');
    else if (e.newState === State.Starting) updateStatus(statusBarItem, 'starting');
    else if (e.newState === State.Stopped) updateStatus(statusBarItem, 'stopped');
  });

  const restartCommand = vscode.commands.registerCommand(
    'velin.restartServer',
    async () => {
      if (!client) return;
      await client.stop();
      await client.start();
    },
  );

  context.subscriptions.push(restartCommand, statusBarItem);

  client.start().catch((err) => {
    updateStatus(statusBarItem, 'error');
    vscode.window.showErrorMessage(
      `Velin Language Server failed to start: ${err?.message ?? err}`,
    );
  });
}

function updateStatus(
  item: vscode.StatusBarItem,
  state: 'starting' | 'ready' | 'stopped' | 'error',
) {
  const icons: Record<typeof state, string> = {
    starting: '$(sync~spin)',
    ready: '$(check)',
    stopped: '$(debug-stop)',
    error: '$(error)',
  };
  item.text = `${icons[state]} Velin`;
  item.tooltip = `Velin Language Server: ${state}`;
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  // Cap shutdown at 5s. If the server hangs (e.g. inside a TS program dispose)
  // we don't want to block VS Code's reload indefinitely.
  return Promise.race([
    client.stop(),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);
}
