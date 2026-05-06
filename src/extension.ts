import * as vscode from 'vscode';
import { FetchSourceMap, ProcessEdits, RojoProject } from './PathMaker';

async function loadSourcemap(): Promise<RojoProject | undefined> {
  const sourcemap = await FetchSourceMap();
  if (sourcemap.length === 0) {
    console.log('Cannot find sourcemap!');
    return undefined;
  }
  const bytes = await vscode.workspace.fs.readFile(sourcemap[0]);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function activate(context: vscode.ExtensionContext) {
  let content: RojoProject | undefined = await loadSourcemap();

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.project.json');
  watcher.onDidChange(async () => {
    content = await loadSourcemap();
  });
  watcher.onDidCreate(async () => {
    content = await loadSourcemap();
  });
  watcher.onDidDelete(async () => {
    content = await loadSourcemap();
  });
  context.subscriptions.push(watcher);

  const disposable = vscode.commands.registerCommand('luapathguard.helloWorld', async () => {
    content = await loadSourcemap();
  });

  context.subscriptions.push(
    vscode.workspace.onWillRenameFiles((event) => {
      if (!vscode.workspace.getConfiguration('luapathguard').get<boolean>('autoUpdate', true)) return;
      if (!content) {
        console.log("couldn't parse sourcemap");
        return;
      }
      event.waitUntil(ProcessEdits(content, event));
    })
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
