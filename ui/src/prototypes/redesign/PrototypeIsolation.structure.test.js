import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const redesignDir = dirname(fileURLToPath(import.meta.url));
const uiSrc = dirname(dirname(redesignDir));
const previewSource = readFileSync(join(uiSrc, 'preview.jsx'), 'utf8');

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(?:js|jsx|css)$/.test(path) && !path.endsWith('.test.js'));
}

const prototypeSource = sourceFiles(redesignDir)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

test('redesign prototypes are exposed only as full-screen component previews', () => {
  assert.match(previewSource, /path: '\/redesign\/location-scan-browser'/);
  assert.match(previewSource, /path: '\/redesign\/duplicates'/);
  assert.match(previewSource, /path: '\/redesign\/tasks'/);
  // 3 redesign prototypes + TasksPage overflow fixture + 2 live FileExplorer
  // previews + 2 delete-check design prototypes, all screenshot fixtures.
  assert.equal((previewSource.match(/fullScreen: true/g) || []).length, 8);
  assert.match(previewSource, /if \(activePreview\.fullScreen\)/);
  assert.match(previewSource, /replace\(\/\^#\/, ''\) \|\| '\/scan-progress\/expanded'/);
  assert.match(previewSource, /preview\.path === '\/scan-progress\/expanded'/);
});

test('redesign prototypes stay backend-free and avoid forbidden visual shortcuts', () => {
  assert.doesNotMatch(prototypeSource, /from ['"][^'"]*(?:App\.jsx|\/pages\/|\/api\/|\/hooks\/|transport)/);
  assert.doesNotMatch(prototypeSource, /(?:linear|radial)-gradient/);
  assert.doesNotMatch(prototypeSource, /box-shadow/);
  assert.doesNotMatch(prototypeSource, /<svg/);
  assert.doesNotMatch(prototypeSource, /Date\.now\(/);
  assert.doesNotMatch(prototypeSource, /fetch\(|WebSocket|rpc\.|invoke\(|Math\.random\(|new Date\(/);
});

test('prototype preserves the approval-stage interaction contract', () => {
  const locationSource = readFileSync(join(redesignDir, 'screens', 'LocationScreen.jsx'), 'utf8');
  const locationStyles = readFileSync(join(redesignDir, 'screens', 'location.css'), 'utf8');
  const commandSource = readFileSync(join(redesignDir, 'CommandPalette.jsx'), 'utf8');
  const commandStyles = readFileSync(join(redesignDir, 'commandPalette.css'), 'utf8');
  const appSource = readFileSync(join(redesignDir, 'PrototypeApp.jsx'), 'utf8');
  const duplicatesSource = readFileSync(join(redesignDir, 'screens', 'DuplicatesScreen.jsx'), 'utf8');
  const tasksSource = readFileSync(join(redesignDir, 'screens', 'TasksScreen.jsx'), 'utf8');

  assert.match(locationSource, /Files/);
  assert.match(locationSource, /File tree/);
  assert.match(locationSource, /Delete Check/);
  assert.match(locationSource, /Advanced filters/);
  assert.match(locationSource, /aria-label="Folder tree"/);
  assert.match(locationSource, /<span>Folders<\/span>/);
  assert.match(locationSource, /root folder/);
  assert.doesNotMatch(locationSource, /label=\{scan\.name/);
  assert.doesNotMatch(locationSource, /Scan snapshot/);
  assert.doesNotMatch(locationSource, /locationRows\.map/);
  assert.match(locationSource, /buildDirectoryNavigationTree/);
  assert.match(locationSource, /<DirectoryNavigationItem/);
  assert.match(locationSource, /buildWorkspaceFileTreeRows/);
  assert.match(locationSource, /<WorkspaceFileTree/);
  assert.match(locationSource, /'--tree-indent': `\$\{row\.depth \* 14\}px`/);
  assert.match(locationSource, /'--tree-indent': `\$\{depth \* 14\}px`/);
  assert.doesNotMatch(locationSource, /folderRows/);
  assert.doesNotMatch(locationSource, /Root files/);
  assert.match(locationSource, /scanFiles\[scan\.id\] \|\| \[\]/);
  assert.match(locationSource, /const history = selectedFolderPath \? \['Root', `Root\/\$\{selectedFolderPath\}`\] : \['Root'\]/);
  assert.match(locationSource, /const selectFolder = useCallback\(\(path\) =>/);
  assert.match(locationSource, /const firstFile = filesInDirectory/);
  assert.match(locationSource, /setSelectedFile\(firstFile\)/);
  assert.match(locationSource, /directoryPathAncestors/);
  assert.match(locationSource, /Files in current workspace/);
  assert.match(locationSource, /selectedFile: visibleSelectedFile/);
  assert.match(locationSource, /pathIndex === 0[\s\S]*?filesInDirectory\(normalizedFiles, selectedFolderPath\)/);
  assert.match(locationSource, /scan\.isRepresentative \? 'Representative scan'/);
  assert.match(locationSource, /setStagedDeleteCheckIds\(new Set\(\)\)/);
  assert.match(locationSource, /command\.type === 'open-location' && command\.locationId/);
  assert.match(locationSource, /command\.type === 'location-stage-delete-check'/);
  assert.match(locationSource, /stagedDeleteCheckIds\.size/);
  assert.match(locationStyles, /\.loc-tree-label\s*\{[\s\S]*?justify-content:\s*flex-start/);
  assert.match(locationStyles, /\.loc-tree-item\s*\{[\s\S]*?padding-left:\s*var\(--tree-indent, 0px\)/);
  assert.match(locationStyles, /\.loc-file-tree-row\s*\{[\s\S]*?grid-template-columns:\s*16px 16px minmax\(0, 1fr\) auto/);
  assert.match(locationStyles, /\.loc-file-tree-row\s*\{[\s\S]*?padding-left:\s*calc\(8px \+ var\(--tree-indent, 0px\)\)/);
  assert.match(locationStyles, /\.loc-file-tree-toggle:focus-visible\s*\{[\s\S]*?outline-offset:\s*-1px/);
  assert.match(appSource, /onCommandContextChange=\{setCommandContext\}/);
  assert.match(appSource, /commandLocationId=\{commandLocationId\}/);
  assert.match(appSource, /commandScanId=\{commandScanId\}/);
  assert.match(appSource, /onSelectScan=\{\(scan\) =>/);
  assert.match(appSource, /event\.detail\?\.type === 'find-exact-duplicates'/);
  assert.match(appSource, /duplicateIntent=\{duplicateIntent\}/);
  assert.match(appSource, /onClearDuplicateIntent=\{\(\) => setDuplicateIntent\(null\)\}/);
  assert.equal((appSource.match(/role="status"/g) || []).length, 1);
  assert.match(commandSource, /role="dialog"/);
  assert.match(commandSource, /role="combobox"/);
  assert.match(commandSource, /role="listbox"/);
  assert.match(commandSource, /role="option"/);
  assert.match(commandSource, /aria-activedescendant/);
  assert.match(commandSource, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(commandSource, /event\.key === 'Escape'/);
  assert.match(commandSource, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  assert.match(commandSource, /event\.key === 'Home' \|\| event\.key === 'End'/);
  assert.match(commandSource, /event\.key === 'Tab'/);
  assert.ok(
    commandSource.indexOf('if (command.action)') < commandSource.indexOf('if (command.href)'),
    'commands with both an action and href must dispatch context before navigating',
  );
  assert.match(commandStyles, /\.rd-command-row\s*\{[\s\S]*?justify-content:\s*flex-start/);
  assert.match(commandStyles, /\.rd-command-search:focus-within[\s\S]*?outline:\s*1px/);
  assert.match(commandStyles, /\.rd-command-search input:focus-visible[\s\S]*?outline:\s*none/);
  assert.match(commandStyles, /\.rd-command-row\[aria-selected="true"\]/);
  assert.match(commandSource, /visibleCommands\.length === 1 \? 'command' : 'commands'/);
  assert.match(duplicatesSource, /command\.type === 'duplicate-expand'/);
  assert.match(duplicatesSource, /command\.type === 'duplicate-stage-delete-check'/);
  assert.match(duplicatesSource, /if \(!duplicateIntent\) return/);
  assert.match(duplicatesSource, /group\.hash === duplicateIntent\.hash/);
  assert.match(duplicatesSource, /if \(duplicateIntent && nextQuery !== intentQuery\) onClearDuplicateIntent\?\.\(\)/);
  assert.match(duplicatesSource, /function clearDuplicateIntent\(\)/);
  assert.match(duplicatesSource, /Clear exact match filter for/);
  assert.match(duplicatesSource, /setSelectedFiles/);
  assert.match(tasksSource, /onCommandContextChange/);
  assert.match(tasksSource, /stopping/);
});
