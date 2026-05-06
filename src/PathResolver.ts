import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface ProjectNode {
  $path?: string;
  $className?: string;
  [key: string]: ProjectNode | string | undefined;
}

export interface RojoProject {
  name: string;
  tree: ProjectNode;
}

export async function FetchSourceMap() {
  return await vscode.workspace.findFiles('**/*.project.json');
}

function MakePathMap(sourcemap: RojoProject): Record<string, string> {
  const pathMap: Record<string, string> = {};

  function traverse(node: ProjectNode, rbxPath: string) {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$') || typeof value !== 'object' || value === null) continue;
      const childPath = rbxPath ? `${rbxPath}.${key}` : key;
      if (value.$path) {
        pathMap[childPath] = value.$path;
      }
      traverse(value, childPath);
    }
  }

  traverse(sourcemap.tree, '');
  return pathMap;
}

function ConvertPath(pathMap: Record<string, string>, filePath: string) {
  if (!pathMap || !filePath) {
    vscode.window.showErrorMessage("LuaPathGuard: Couldn't read .project.json.");
    return;
  }

  for (const [rbxPath, fsPath] of Object.entries(pathMap)) {
    let newFsPath = fsPath.replaceAll('/', '\\');

    if (newFsPath.lastIndexOf('dist') !== -1) {
      newFsPath = newFsPath.replace('dist', 'src');
    }

    const index = filePath.lastIndexOf(newFsPath);
    if (index === -1) continue;

    let convertedPath: string = filePath.slice(index);
    convertedPath = convertedPath.replace(newFsPath, rbxPath).replaceAll('\\', '.');

    const lastSlash = filePath.lastIndexOf('\\');
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot > lastSlash) {
      convertedPath = convertedPath.slice(0, convertedPath.lastIndexOf('.'));
    }

    return convertedPath;
  }
}

function getConfig() {
  return vscode.workspace.getConfiguration('luapathguard');
}

async function FetchRequires(key: string): Promise<Record<string, number[]>> {
  const output: Record<string, number[]> = {};

  const excludeFolders = getConfig().get<string[]>('excludeFolders', ['node_modules', '.git', 'dist', 'out']);
  const excludeGlob = `{${excludeFolders.join(',')}}/**`;

  const files = await vscode.workspace.findFiles('**/*.{lua,luau}', excludeGlob);

  await Promise.all(files.map(async (fileUri) => {
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === fileUri.fsPath);
    const text = openDoc
      ? openDoc.getText()
      : await fs.promises.readFile(fileUri.fsPath, 'utf8');
    const lines = text.split('\n');
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(key)) hits.push(i);
    }
    if (hits.length > 0) output[fileUri.fsPath] = hits;
  }));

  return output;
}

async function getLine(document: vscode.TextDocument, lineNumber: number): Promise<string> {
  return document.lineAt(lineNumber).text;
}

async function modifyLine(
  document: vscode.TextDocument,
  filePath: string,
  lineNumber: number,
  newText: string
): Promise<void> {
  const line = document.lineAt(lineNumber);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(vscode.Uri.file(filePath), line.range, newText);
  await vscode.workspace.applyEdit(edit);
}

async function searchKeywordInFile(
  document: vscode.TextDocument,
  keyword: string
): Promise<boolean> {
  for (let i = 0; i < document.lineCount; i++) {
    if (document.lineAt(i).text.includes(keyword)) return true;
  }
  return false;
}

async function addLineOnTop(filePath: string, newText: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(vscode.Uri.file(filePath), new vscode.Position(0, 0), newText + '\n');
  await vscode.workspace.applyEdit(edit);
}

async function renameSymbolInFile(
  document: vscode.TextDocument,
  filePath: string,
  oldName: string,
  newName: string
): Promise<void> {
  const regex = new RegExp(`\\b${oldName}\\b`, 'g');
  const edit = new vscode.WorkspaceEdit();

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const newText = line.text.replace(regex, newName);
    if (newText !== line.text) {
      edit.replace(vscode.Uri.file(filePath), line.range, newText);
    }
  }

  await vscode.workspace.applyEdit(edit);
}

export async function ProcessEdits(content: RojoProject, event: any) {
  const pathMap = MakePathMap(content);
  const renameVar = getConfig().get<boolean>('renameRequireVariable', true);
  const autoSave = getConfig().get<boolean>('autoSave', true);
  const openChangedFiles = getConfig().get<boolean>('openChangedFiles', false);

  for (const file of event.files) {
    const newFilePath = ConvertPath(pathMap, file.newUri.fsPath);
    const oldFilePath = ConvertPath(pathMap, file.oldUri.fsPath);
    if (!newFilePath || !oldFilePath) {
      vscode.window.showWarningMessage("LuaPathGuard: Couldn't convert file path — skipping.");
      continue;
    }

    const Fetched = await FetchRequires(oldFilePath);
    if (Object.keys(Fetched).length === 0) {
      vscode.window.showInformationMessage(`LuaPathGuard: No requires found for ${oldFilePath}.`);
      continue;
    }

    const oldName = oldFilePath.split('.').pop()!;
    const newName = newFilePath.split('.').pop()!;

    for (const [filePath, lineNumbers] of Object.entries(Fetched)) {
      const srcFilePath = filePath.replace(
        `${path.sep}dist${path.sep}`,
        `${path.sep}src${path.sep}`
      );

      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(srcFilePath));

      for (const lineNumber of lineNumbers) {
        const lineText = await getLine(document, lineNumber);
        if (!lineText) continue;

        const newLine = lineText.replace(oldFilePath, newFilePath);

        for (const service in content.tree) {
          if (newFilePath.includes(service) && !(await searchKeywordInFile(document, service))) {
            await addLineOnTop(srcFilePath, `local ${service} = game:GetService("${service}")`);
          }
        }

        await modifyLine(document, srcFilePath, lineNumber, newLine);
      }

      if (renameVar && oldName !== newName) {
        await renameSymbolInFile(document, srcFilePath, oldName, newName);
      }

      if (autoSave) {
        await document.save();
      }

      if (openChangedFiles) {
        await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
      }
    }
  }
}
