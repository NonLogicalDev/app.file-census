import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const fileExplorerSource = readFileSync(join(componentsDir, 'FileExplorer.jsx'), 'utf8');
const directoryTreeSource = readFileSync(join(componentsDir, 'DirectoryTree.jsx'), 'utf8');

test('backup filter is always-on, and the Delete Check SET is a distinct staged surface', () => {
  // Markers are always shown; the All/Unsafe/Warn/Safe backup filter is the
  // ambient surface. The Delete Check SET (staged paths + validation panel) is a
  // separate mode, NOT the retired subview tabs / current-folder callout.
  assert.match(fileExplorerSource, /label="Unsafe"/);
  assert.match(fileExplorerSource, /label="Safe"/);
  assert.match(fileExplorerSource, /setBackupFilter/);
  // The retired explicit subview affordances are gone (the old current-folder
  // callout and the subview tab switch).
  assert.doesNotMatch(fileExplorerSource, /Check current folder/);
  assert.doesNotMatch(fileExplorerSource, /onSetScanSubview/);
  // Delete Check is a browsing MODE: App-owned toggle (server-side scoping), a
  // bar above the table (not a side panel hijacking the Inspector). The markers
  // ARE the validation (live survival classification) — no Validate button.
  assert.match(fileExplorerSource, /onSetDeleteCheckMode/);
  assert.match(fileExplorerSource, /deleteCheckBar/);
  assert.doesNotMatch(fileExplorerSource, /deleteCheckPanel/);
  assert.doesNotMatch(fileExplorerSource, /Validate deletion/);
  assert.match(fileExplorerSource, /dc_safe/);
  assert.match(fileExplorerSource, /would lose last copy/);
  assert.match(fileExplorerSource, /onAddDeleteCheck/);
  // The Inspector keeps its column even while the mode is on.
  assert.match(fileExplorerSource, /\{inspectorOpen && inspectorPane\}/);
});

test('clear set is an icon-only confirmed action beside Add to Delete Check', () => {
  // "Clear set" moved out of the Delete Check bar: icon-only button in nav
  // row 2, which asks for confirmation via the app-level ConfirmModal.
  assert.match(fileExplorerSource, /onRequestClearDeleteCheck/);
  assert.match(fileExplorerSource, /aria-label="Clear the Delete Check set"/);
  assert.doesNotMatch(fileExplorerSource, /Clear set/);
});

test('inspector has lazy collapsible Preview and EXIF sections', () => {
  // Sections are disclosure-style, persisted, and fetch via the lightweight
  // files.preview RPC only while the inspector + section are open.
  assert.match(fileExplorerSource, /function InspectorSection/);
  assert.match(fileExplorerSource, /label="Preview"/);
  assert.match(fileExplorerSource, /label="EXIF"/);
  assert.match(fileExplorerSource, /locations-inspector-preview-open/);
  assert.match(fileExplorerSource, /locations-inspector-exif-open/);
  assert.match(fileExplorerSource, /onLoadFilePreview/);
  // Lazy gate: no fetch unless the inspector is open and a section expanded.
  assert.match(fileExplorerSource, /!inspectorOpen \|\| \(!previewOpen && !exifOpen\)/);
});

test('browse table folders expand inline with lazy children', () => {
  // Dirs in the Browse table are expandable in place: lazy fetch per folder,
  // recursive subRows, backup-tier filter applied at every level, cleared on
  // navigation/mode changes.
  assert.match(fileExplorerSource, /handleToggleFolderExpand/);
  assert.match(fileExplorerSource, /gridRowsWithChildren/);
  assert.match(fileExplorerSource, /onLoadFolderChildren/);
  assert.match(fileExplorerSource, /expandableFolders/);
  assert.match(fileExplorerSource, /\[selectedPath, activeScan\?\.id, deleteCheckMode, query\]/);
  const fileGridSource = readFileSync(join(componentsDir, 'FileGrid.jsx'), 'utf8');
  assert.match(fileGridSource, /getExpandedRowModel/);
  assert.match(fileGridSource, /getSubRows: \(row\) => row\.subRows/);
  assert.match(fileGridSource, /autoResetExpanded: false/);
  assert.match(fileGridSource, /row\.toggleExpanded\(\)/);
});

test('file explorer does not advertise unavailable EXIF enrichment controls', () => {
  assert.doesNotMatch(fileExplorerSource, /onRequestScanExif/);
  assert.doesNotMatch(fileExplorerSource, /onRequestScanExifForEntry/);
  assert.doesNotMatch(fileExplorerSource, /Scan EXIF/);
});

test('scan browser is a single [Browse | Flat] surface with a directory-only tree', () => {
  assert.match(fileExplorerSource, /aria-label="Scan views"/);
  // The only view switch is Browse (tree table) vs Flat (path+file list).
  assert.match(fileExplorerSource, /label="Browse" active=\{viewMode === 'browse'\}/);
  assert.match(fileExplorerSource, /label="Flat" active=\{viewMode === 'flat'\}/);
  // The retired [Files | File tree | Delete Check] subview tabs are gone.
  assert.doesNotMatch(fileExplorerSource, /\['files', 'Files'/);
  assert.doesNotMatch(fileExplorerSource, /\['tree', 'File tree'/);
  assert.doesNotMatch(fileExplorerSource, /onSetScanSubview\(value\)/);
  assert.doesNotMatch(fileExplorerSource, /showingDeleteCheck/);
  // Browse keeps the separate directory-only tree beside the file workspace.
  assert.match(fileExplorerSource, /<DirectoryTree/);
  assert.match(fileExplorerSource, /onToggle=\{onToggleDirectoryTree\}/);
  assert.match(fileExplorerSource, /onLoadMore=\{onLoadMoreDirectoryTree\}/);
  assert.match(directoryTreeSource, /aria-label="Directory navigation"/);
  assert.match(directoryTreeSource, /page\?\.entries \|\| \[\]/);
});
