import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const fileExplorerSource = readFileSync(join(componentsDir, 'FileExplorer.jsx'), 'utf8');
const previewSource = readFileSync(join(dirname(componentsDir), 'preview.jsx'), 'utf8');

test('delete check explorer shows include and exclude set summary controls', () => {
  assert.match(fileExplorerSource, /Delete Check set/);
  assert.match(fileExplorerSource, /Included/);
  assert.match(fileExplorerSource, /Excluded/);
  assert.match(fileExplorerSource, /Clear includes/);
  assert.match(fileExplorerSource, /Clear excludes/);
  assert.match(fileExplorerSource, /hasDeleteCheckPathSet/);
  assert.doesNotMatch(fileExplorerSource, /Include folder/);
  assert.doesNotMatch(fileExplorerSource, /Exclude folder/);
});

test('file explorer exposes an EXIF enrichment action beside file tools', () => {
  assert.match(fileExplorerSource, /onRequestScanExif/);
  assert.match(fileExplorerSource, /onRequestScanExifForEntry/);
  assert.match(fileExplorerSource, /Scan EXIF/);
  assert.match(fileExplorerSource, /canScanExif/);
});

test('file explorer exposes list and file tree views for scan listings', () => {
  assert.match(fileExplorerSource, /aria-label="Scan views"/);
  assert.doesNotMatch(fileExplorerSource, /aria-label="File listing views"/);
  assert.doesNotMatch(fileExplorerSource, /const \[fileView, setFileView\]/);
  assert.match(fileExplorerSource, /Files\s*<\/SegmentedTab>/);
  assert.match(fileExplorerSource, /File tree\s*<\/SegmentedTab>/);
  assert.match(fileExplorerSource, /Delete Check\s*<\/SegmentedTab>/);
  assert.match(fileExplorerSource, /const showingFileTree = scanSubview === 'tree'/);
  assert.match(fileExplorerSource, /hierarchical=\{showingFileTree\}/);
  assert.match(previewSource, /path: '\/file-explorer\/file-tree-tab'/);
  assert.match(previewSource, /scanSubview="tree"/);
});
