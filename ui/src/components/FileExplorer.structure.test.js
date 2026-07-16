import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const fileExplorerSource = readFileSync(join(componentsDir, 'FileExplorer.jsx'), 'utf8');
const directoryTreeSource = readFileSync(join(componentsDir, 'DirectoryTree.jsx'), 'utf8');

test('delete check remains an explicit scan workflow rather than a folder mutation affordance', () => {
  assert.match(fileExplorerSource, /Delete Check/);
  assert.match(fileExplorerSource, /Check current folder/);
  assert.match(fileExplorerSource, /Safe to delete/);
  assert.match(fileExplorerSource, /Unsafe to delete/);
  assert.doesNotMatch(fileExplorerSource, /Include folder/);
  assert.doesNotMatch(fileExplorerSource, /Exclude folder/);
});

test('file explorer does not advertise unavailable EXIF enrichment controls', () => {
  assert.doesNotMatch(fileExplorerSource, /onRequestScanExif/);
  assert.doesNotMatch(fileExplorerSource, /onRequestScanExifForEntry/);
  assert.doesNotMatch(fileExplorerSource, /Scan EXIF/);
});

test('file explorer uses a separate directory-only tree beside the file workspace', () => {
  assert.match(fileExplorerSource, /aria-label="Scan views"/);
  // Mode selector exposes the three scan views, each wired to onSetScanSubview.
  assert.match(fileExplorerSource, /\['files', 'Files'/);
  assert.match(fileExplorerSource, /\['tree', 'File tree'/);
  assert.match(fileExplorerSource, /\['delete-check', 'Delete Check'/);
  assert.match(fileExplorerSource, /onClick=\{\(\) => onSetScanSubview\(value\)\}/);
  assert.match(fileExplorerSource, /const showingFileTree = scanSubview === 'tree'/);
  assert.match(fileExplorerSource, /<DirectoryTree/);
  assert.match(fileExplorerSource, /onToggle=\{onToggleDirectoryTree\}/);
  assert.match(fileExplorerSource, /onLoadMore=\{onLoadMoreDirectoryTree\}/);
  assert.doesNotMatch(fileExplorerSource, /hierarchical=\{showingFileTree\}/);
  assert.match(directoryTreeSource, /aria-label="Directory navigation"/);
  assert.match(directoryTreeSource, /page\?\.entries \|\| \[\]/);
});
