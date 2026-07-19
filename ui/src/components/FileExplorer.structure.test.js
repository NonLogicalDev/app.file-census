import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const fileExplorerSource = readFileSync(join(componentsDir, 'FileExplorer.jsx'), 'utf8');
const directoryTreeSource = readFileSync(join(componentsDir, 'DirectoryTree.jsx'), 'utf8');

test('delete check is a persistent backup filter over browsing, not a separate subview', () => {
  // The unified model: markers are always shown and the All/Unsafe/Warn/Safe
  // backup filter is the only "delete check" surface. The old explicit subview
  // (Check current folder / Safe-to-delete callout / staging list) is retired.
  assert.match(fileExplorerSource, /label="Unsafe"/);
  assert.match(fileExplorerSource, /label="Warn"/);
  assert.match(fileExplorerSource, /label="Safe"/);
  assert.match(fileExplorerSource, /setBackupFilter/);
  assert.doesNotMatch(fileExplorerSource, /Check current folder/);
  assert.doesNotMatch(fileExplorerSource, /Safe to delete/);
  assert.doesNotMatch(fileExplorerSource, /Delete Check list/);
  assert.doesNotMatch(fileExplorerSource, /StagedDeleteCheckRow/);
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
