import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = dirname(dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');
const fileGridSource = readFileSync(join(uiSrc, 'components', 'FileGrid.jsx'), 'utf8');
const fileExplorerSource = readFileSync(join(uiSrc, 'components', 'FileExplorer.jsx'), 'utf8');
const directoryTreeUtilitiesSource = readFileSync(join(uiSrc, 'components', 'directoryTree.js'), 'utf8');

test('scan file browser exposes folder descendant file counts as a default Files column', () => {
  assert.match(appSource, /\['file_count', 'Files'\]/);
  assert.match(appSource, /const defaultColumns = \[[^\]]*'size', 'file_count'/);
  assert.match(fileGridSource, /accessorKey: 'file_count'/);
  assert.match(fileGridSource, /header: 'Files'/);
  assert.match(fileGridSource, /row\.original\.kind === 'parent' \? '' : getValue\(\) \?\? 0/);
});

test('file grid numeric columns align headers with numeric cell values', () => {
  assert.match(fileGridSource, /const numericColumnMeta = \{ align: 'right', className: fileGridNumericClassName \}/);
  for (const column of ['size', 'file_count', 'duplicate_file_count', 'original_file_count', 'same_scan_duplicate_file_count']) {
    assert.match(fileGridSource, new RegExp(`accessorKey: '${column}'[\\s\\S]*?meta: numericColumnMeta`));
  }
  assert.match(fileGridSource, /fileGridHeaderButtonClassName\(\{ align: headerAlign \}\)/);
});

test('file grid keeps normal scan actions out of the explicit Delete Check workflow', () => {
  assert.match(fileGridSource, /if \(onDelete \|\| onBuildThumbnails \|\| onExclude\)/);
  assert.match(fileGridSource, /columns\.push\(\{\s*id: 'actions'/);
  assert.match(fileGridSource, /Build thumbnails/);
  assert.match(fileGridSource, /Remove from scan/);
  assert.match(fileGridSource, /Exclude from scan/);
  assert.match(fileGridSource, /<MenuContent align="start"/);
  assert.doesNotMatch(fileGridSource, /Include in Delete Check|Exclude from Delete Check|deleteCheckPathStateByPath/);
  assert.match(fileExplorerSource, /onBuildThumbnails=\{showingDeleteCheck \? null : onRequestBuildThumbnailsForEntry\}/);
  assert.match(fileExplorerSource, /onExclude=\{showingDeleteCheck \? null : onRequestExcludePath\}/);
  assert.match(fileExplorerSource, /onDelete=\{showingDeleteCheck \? null : onRequestDeletePath\}/);
});

test('file grid remains a flat main workspace beside the directory-only navigation tree', () => {
  assert.match(fileGridSource, /data: rows/);
  assert.match(fileGridSource, /getCoreRowModel: getCoreRowModel\(\)/);
  assert.doesNotMatch(fileGridSource, /getExpandedRowModel|getSubRows|hierarchical/);
  assert.match(fileExplorerSource, /<DirectoryTree/);
  assert.match(fileExplorerSource, /\{resultsTable\}/);
  assert.match(directoryTreeUtilitiesSource, /entry\.kind !== 'dir'/);
});

test('file grid uses stable path identities and routes file inspection separately from folder navigation', () => {
  assert.match(fileGridSource, /getRowId: \(row\) => row\.path \|\| row\.name/);
  assert.match(fileGridSource, /selectedSet\.has\(row\.original\.path\)/);
  assert.match(fileGridSource, /if \(row\.original\.kind === 'file'\) onInspect\?\.\(row\.original\)/);
  assert.match(fileGridSource, /if \(row\.original\.kind === 'dir' \|\| row\.original\.kind === 'parent'\) onOpen\?\.\(row\.original\)/);
});

test('column picker visibility leaves the identity and action columns available', () => {
  assert.match(fileGridSource, /visibleColumns = \[\]/);
  assert.match(fileGridSource, /visibleColumns\.includes\(id\)/);
  assert.match(fileGridSource, /id === 'select' \|\| id === 'name' \|\| id === 'actions'/);
});
