# LuaPathGuard

**Automatic Lua require path fixer for Rojo projects.**

When you move or rename a Lua/Luau file, LuaPathGuard instantly updates every `require()` statement that referenced it — no broken paths, no manual find-and-replace.

---

## How It Works

LuaPathGuard reads your Rojo `*.project.json` file to build a map of your project's module structure. When you rename or move a file in VS Code, it:

1. Detects the move using the Rojo source map
2. Converts the filesystem path to the Rojo module path
3. Finds every `.lua` / `.luau` file that `require()`s the moved module
4. Rewrites all matching require statements to the new path
5. Optionally renames the local variable that holds the require to match the new filename

Everything happens before the rename completes, so your workspace never enters a broken state.

---

## Features

- **Automatic path updates** — require paths are fixed the moment you rename or move a file
- **Variable renaming** — `local OldName = require(...)` becomes `local NewName = require(...)` automatically
- **Rojo-aware path resolution** — understands Rojo project trees and converts between filesystem and ModuleScript paths correctly
- **Status bar indicator** — shows extension state at a glance and lets you toggle it with one click
- **Configurable folder exclusions** — skip folders you don't want scanned

---

## Requirements

- A Rojo project file (`*.project.json`) must exist somewhere in your workspace. LuaPathGuard will not activate without one.
- VS Code **1.118.0** or newer.

---

## Extension Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `luapathguard.autoUpdate` | `boolean` | `true` | Automatically update require paths on rename/move |
| `luapathguard.renameRequireVariable` | `boolean` | `true` | Also rename the local variable holding the require |
| `luapathguard.autoSave` | `boolean` | `true` | Automatically save files after updating require paths |
| `luapathguard.openChangedFiles` | `boolean` | `false` | Open updated files in the editor after path changes |
| `luapathguard.excludeFolders` | `string[]` | `["node_modules", ".git", "dist", "out"]` | Folders to skip when searching for require statements |

---

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and search for:

| Command | Description |
|---|---|
| `LuaPathGuard: Enable` | Enable automatic path updating |
| `LuaPathGuard: Disable` | Disable automatic path updating |
| `LuaPathGuard: Reload Source Map` | Manually reload the Rojo project file |

---

## Status Bar

The status bar item in the bottom-right corner shows the current state:

| Icon | Meaning |
|---|---|
| `✔ LuaPathGuard` | Active and ready — click to disable |
| `⚠ LuaPathGuard` | No Rojo project file found — click to reload |
| `⊘ LuaPathGuard` | Disabled — click to enable |

---

## Release Notes

### 2.0.0

Added `autoSave` and `openChangedFiles` settings. Require-path updates now save files automatically and can optionally open them in the editor.

### 0.0.1

Initial release — automatic require path updates, variable renaming, Rojo source map integration, and status bar controls.

---

## License

MIT
