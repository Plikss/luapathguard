# Change Log

All notable changes to the "luapathguard" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.0.0] - 2026-05-06

### Added
- `luapathguard.autoSave` setting (default: `true`) — saves edited files automatically after updating require paths, no manual Ctrl+S needed.
- `luapathguard.openChangedFiles` setting (default: `false`) — optionally opens edited files in the editor after their require paths are updated.

### Fixed
- Files modified by require path updates are now saved to disk automatically instead of being left as unsaved dirty tabs.

## [0.0.1] - 2026-05-06

### Added
- Automatically updates `require()` paths in all Lua/Luau files when a file is renamed or moved in a Rojo project.
- Optionally renames the local variable holding the require to match the new file name (`luapathguard.renameRequireVariable`, default: `true`).
- Automatically inserts missing `game:GetService()` declarations when a require path moves into a new service scope.
- `luapathguard.excludeFolders` setting to skip specified directories when searching for require references.
- Commands: `LuaPathGuard: Enable`, `LuaPathGuard: Disable`, `LuaPathGuard: Reload Source Map`.
