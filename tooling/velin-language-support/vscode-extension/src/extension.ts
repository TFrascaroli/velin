import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  // Path to the language server module
  const serverModule = context.asAbsolutePath(
    path.join('..', 'lsp-server', 'dist', 'server.js')
  );

  // Server options - runs the server in Node.js
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009']
      }
    }
  };

  // Client options - configure which documents to send to the server
  const clientOptions: LanguageClientOptions = {
    // Register the server for HTML documents that might contain Velin directives
    documentSelector: [
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'html-velin' }
    ],
    synchronize: {
      // Notify the server about file changes to TypeScript/JavaScript files
      // that might contain schema definitions
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/*.{ts,js,json}'),
        vscode.workspace.createFileSystemWatcher('**/*.html')
      ]
    },
    // Pass configuration to the server
    initializationOptions: () => {
      const config = vscode.workspace.getConfiguration('velin');
      return {
        enable: config.get('enable', true),
        trace: config.get('trace.server', 'off')
      };
    }
  };

  // Create the language client
  client = new LanguageClient(
    'velinLanguageServer',
    'Velin Language Server',
    serverOptions,
    clientOptions
  );

  // Register commands
  const restartCommand = vscode.commands.registerCommand('velin.restartServer', async () => {
    await client.stop();
    await client.start();
    vscode.window.showInformationMessage('Velin Language Server restarted');
  });

  // Add status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(symbol-class) Velin';
  statusBarItem.tooltip = 'Velin Language Support is active';
  statusBarItem.command = 'velin.restartServer';
  statusBarItem.show();

  // Register configuration change listener
  const configListener = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('velin')) {
      // Restart the client when configuration changes
      vscode.commands.executeCommand('velin.restartServer');
    }
  });

  // Start the client and push disposables to context
  context.subscriptions.push(
    restartCommand,
    statusBarItem,
    configListener
  );
  
  // Start the client
  client.start().then(() => {
    vscode.window.showInformationMessage('Velin Language Support is now active!');
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}