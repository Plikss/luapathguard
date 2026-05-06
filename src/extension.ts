import * as vscode from 'vscode';
import { FetchSourceMap, ProcessEdits, RojoProject } from './PathResolver';

let statusBarItem: vscode.StatusBarItem;
let content: RojoProject | undefined;

function getAutoUpdate(): boolean {
  return vscode.workspace.getConfiguration('luapathguard').get<boolean>('autoUpdate', true);
}

async function loadSourcemap(): Promise<RojoProject | undefined> {
  const sourcemap = await FetchSourceMap();
  if (sourcemap.length === 0) {
    vscode.window.showWarningMessage('LuaPathGuard: No Rojo project file found.');
    return undefined;
  }
  const bytes = await vscode.workspace.fs.readFile(sourcemap[0]);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function updateStatusBar() {
  if (!getAutoUpdate()) {
    statusBarItem.text = '$(circle-slash) LuaPathGuard';
    statusBarItem.tooltip = 'LuaPathGuard is disabled. Click to enable.';
    statusBarItem.command = 'luapathguard.enable';
  } else if (!content) {
    statusBarItem.text = '$(warning) LuaPathGuard';
    statusBarItem.tooltip = 'No Rojo project file found. Click to reload.';
    statusBarItem.command = 'luapathguard.reloadSourceMap';
  } else {
    statusBarItem.text = '$(pass) LuaPathGuard';
    statusBarItem.tooltip = 'LuaPathGuard is active. Click to disable.';
    statusBarItem.command = 'luapathguard.disable';
  }
}

export async function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  content = await loadSourcemap();
  updateStatusBar();

  const reloadAndUpdate = async () => {
    content = await loadSourcemap();
    updateStatusBar();
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.project.json');
  watcher.onDidChange(reloadAndUpdate);
  watcher.onDidCreate(reloadAndUpdate);
  watcher.onDidDelete(reloadAndUpdate);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(reloadAndUpdate)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('luapathguard.autoUpdate')) {
        updateStatusBar();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('luapathguard.reloadSourceMap', async () => {
      content = await loadSourcemap();
      updateStatusBar();
      vscode.window.showInformationMessage(
        content ? 'LuaPathGuard: Source map loaded.' : 'LuaPathGuard: No project file found.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('luapathguard.enable', async () => {
      await vscode.workspace.getConfiguration('luapathguard').update(
        'autoUpdate', true, vscode.ConfigurationTarget.Workspace
      );
      updateStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('luapathguard.disable', async () => {
      await vscode.workspace.getConfiguration('luapathguard').update(
        'autoUpdate', false, vscode.ConfigurationTarget.Workspace
      );
      updateStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onWillRenameFiles((event) => {
      if (!getAutoUpdate()) return;
      if (!content) {
        vscode.window.showWarningMessage("LuaPathGuard: Couldn't parse source map.");
        return;
      }
      event.waitUntil(ProcessEdits(content, event));
    })
  );
}

export function deactivate() {}
