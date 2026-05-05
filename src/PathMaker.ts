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

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
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
  //console.log(pathMap);

  return pathMap;
}

function ConvertPath(sourcemap: RojoProject, path: string) {
  const pathMap = MakePathMap(sourcemap);

  if (!pathMap || !path) {
    console.log("Couldn't Map .project.json; ConvertPath");
    return;
  }

  for (const [rbxPath, fsPath] of Object.entries(pathMap)) {
    let newFsPath: string = fsPath;
    let convertedPath: string, undefined;

    newFsPath = newFsPath.replaceAll('/', '\\');

    const distIndex = newFsPath.lastIndexOf('dist');
    if (distIndex !== -1) {
      newFsPath = newFsPath.replace('dist', 'src');
    }

    const index = path.lastIndexOf(newFsPath);
    if (index !== -1) {
      convertedPath = path.slice(index);
      convertedPath = convertedPath.replace(newFsPath, rbxPath);
      convertedPath = convertedPath.replaceAll('\\', '.');

      const lastSlash = path.lastIndexOf('\\');
      const lastDot = path.lastIndexOf('.');
      if (lastDot > lastSlash) {
        convertedPath = convertedPath.slice(0, convertedPath.lastIndexOf('.'));
      }

      return convertedPath;
    } else {
      continue;
    }
  }
}

function buildHierarchy(
  dirPath: string,
  exclude = ['node_modules', '.git', 'dist', 'out']
): FileNode[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  return entries
    .filter((e: any) => !exclude.includes(e.name))
    .map((entry: any) => {
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          type: 'folder' as const,
          children: buildHierarchy(path.join(dirPath, entry.name), exclude),
        };
      }
      return { name: entry.name, type: 'file' as const };
    });
}

async function FechtRequires(key: string) {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders) {
    vscode.window.showWarningMessage('No workspace open.');
    return;
  }

  const hierarchy = folders.map((folder) => ({
    workspace: folder.name,
    path: folder.uri.fsPath,
    children: buildHierarchy(folder.uri.fsPath),
  }));

  const files = await vscode.workspace.findFiles('**/*', '{node_modules,.git,dist,out}/**');
  const output: Record<string, number[]> = {};

  for (const fileUri of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const lines: number[] = [];
      for (let i = 0; i < doc.lineCount; i++) {
        if (doc.lineAt(i).text.includes(key)) {
          lines.push(i);
        }
      }
      if (lines.length > 0) {
        output[fileUri.fsPath] = lines;
      }
    } catch {
      // skip unreadable files (binaries, etc.)
    }
  }

  return output;
}

async function getLine(filePath: string, lineNumber: number): Promise<string> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  return document.lineAt(lineNumber).text;
}

async function modifyLine(filePath: string, lineNumber: number, newText: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const line = document.lineAt(lineNumber);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, line.range, newText);

  await vscode.workspace.applyEdit(edit);
  console.log('applied edit at line:', lineNumber, ' ', filePath);
}

async function searchKeywordInFile(filePath: string, keyword: string) {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    if (line.text.includes(keyword)) {
      console.log(`Found "${keyword}" at line ${i + 1}: ${line.text}`);
      return true;
    }
  }
  return false;
}

async function addLineOnTop(filePath: string, newText: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);

  const edit = new vscode.WorkspaceEdit();
  const topPosition = new vscode.Position(0, 0); // line 0, character 0

  edit.insert(uri, topPosition, newText + '\n');
  await vscode.workspace.applyEdit(edit);
  console.log('edit applied ', filePath);
}

export async function ProcesssEduts(content: RojoProject, event: any) {
  for (const file of event.files) {
    const newFilePath = ConvertPath(content!, file.newUri.fsPath);
    const oldFilePath = ConvertPath(content!, file.oldUri.fsPath);
    if (!newFilePath || !oldFilePath) {
      console.log("Couldn't convert paths; workspace.onWillRenameFiles");
      continue;
    }
    const Fetched = await FechtRequires(oldFilePath);
    if (!Fetched) {
      console.log('Fetch results failed');
      continue;
    }

    for (const [filePath, lineNumbers] of Object.entries(Fetched)) {
      const srcFilePath = filePath.replace(
        `${path.sep}dist${path.sep}`,
        `${path.sep}src${path.sep}`
      );
      for (const lineNumber of lineNumbers) {
        const lineText = await getLine(srcFilePath, lineNumber);
        if (!lineText) {
          continue;
        }
        let newLine = lineText;
        newLine = newLine.replace(oldFilePath, newFilePath);
        for (const service in content.tree) {
          const serviceIndex = newFilePath.indexOf(service);
          if (serviceIndex !== -1) {
            const serviceFinded = await searchKeywordInFile(srcFilePath, service);
            if (!serviceFinded) {
              console.log('service not found, adding line on top!');
              await addLineOnTop(srcFilePath, 'local ${service} = game:GetService("${service}")');
            }
            await modifyLine(srcFilePath, lineNumber, newLine);
          }
        }
      }
    }
  }
}
