import * as vscode from 'vscode';
import { FetchSourceMap, ProcesssEduts, RojoProject } from './PathMaker';

export function activate(context: vscode.ExtensionContext) {
  let content: RojoProject | undefined;

  const disposable = vscode.commands.registerCommand('luapathguard.helloWorld', async () => {
    const sourcemap = await FetchSourceMap();

    if (sourcemap.length > 0) {
      const bytes = await vscode.workspace.fs.readFile(sourcemap[0]);
      content = JSON.parse(new TextDecoder().decode(bytes));
    } else {
      console.log('Cannot find sourcemap!');
    }
  });

  context.subscriptions.push(
    vscode.workspace.onWillRenameFiles((event) => {
      if (!content) {
        console.log("couldn't parse sourcemap");
        return;
      }
      event.waitUntil(ProcesssEduts(content, event));
    })
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
