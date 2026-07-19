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
  assert.match(fileGridSource, /kind === 'parent' \|\| row\.original\.kind === 'placeholder'\) \? '' : getValue\(\) \?\? 0/);
});

test('file grid numeric columns align headers with numeric cell values', () => {
  assert.match(fileGridSource, /const numericColumnMeta = \{ align: 'right', className: fileGridNumericClassName \}/);
  for (const column of ['size', 'file_count']) {
    assert.match(fileGridSource, new RegExp(`accessorKey: '${column}'[\\s\\S]*?meta: numericColumnMeta`));
  }
  // Uniq (distinct_count) is numeric too, via a spread of numericColumnMeta.
  assert.match(fileGridSource, /accessorKey: 'distinct_count'[\s\S]*?\.\.\.numericColumnMeta/);
  // The retired Dup / Scan Dup columns are gone.
  assert.doesNotMatch(fileGridSource, /accessorKey: 'duplicate_file_count'/);
  assert.doesNotMatch(fileGridSource, /accessorKey: 'same_scan_duplicate_file_count'/);
  assert.match(fileGridSource, /fileGridHeaderButtonClassName\(\{\s*align: headerAlign/);
});

test('file grid row actions live in a right-click context menu (no trigger column)', () => {
  // The old per-row "..." actions column is retired; actions open via
  // onContextMenu at the cursor, close on outside click/Escape/scroll.
  assert.doesNotMatch(fileGridSource, /id: 'actions'/);
  assert.doesNotMatch(fileGridSource, /MenuTrigger/);
  assert.match(fileGridSource, /onContextMenu=\{\(event\) => \{/);
  assert.match(fileGridSource, /setContextMenu\(\{ x: event\.clientX, y: event\.clientY, entry: row\.original \}\)/);
  assert.match(fileGridSource, /event\.key === 'Escape'/);
  assert.match(fileGridSource, /Build thumbnails/);
  assert.match(fileGridSource, /Remove from scan/);
  assert.match(fileGridSource, /Exclude from scan/);
  assert.match(fileGridSource, /Add to Delete Check/);
  assert.match(fileGridSource, /Remove from Delete Check/);
  assert.doesNotMatch(fileGridSource, /Include in Delete Check|Exclude from Delete Check|deleteCheckPathStateByPath/);
  // Row actions are wired directly now that the browse grid is the only surface
  // (the delete-check subview that suppressed them is retired).
  assert.match(fileExplorerSource, /onBuildThumbnails=\{onRequestBuildThumbnailsForEntry\}/);
  assert.match(fileExplorerSource, /onExclude=\{onRequestExcludePath\}/);
  assert.match(fileExplorerSource, /onDelete=\{onRequestDeletePath\}/);
  assert.doesNotMatch(fileExplorerSource, /showingDeleteCheck/);
});

test('file grid supports inline folder expansion beside the directory-only navigation tree', () => {
  // Rows are pre-ordered folders-first (parent → dirs → files); Browse-mode
  // dirs additionally expand IN PLACE via lazily-loaded TanStack subRows
  // (user request 2026-07-19: "make Browse mode more like tree mode").
  assert.match(fileGridSource, /data: orderedRows/);
  assert.match(fileGridSource, /\[\.\.\.rows\]\.sort\(\(a, b\) => kindRank\(a\) - kindRank\(b\)\)/);
  assert.match(fileGridSource, /getCoreRowModel: getCoreRowModel\(\)/);
  assert.match(fileGridSource, /getSubRows: \(row\) => row\.subRows/);
  assert.match(fileGridSource, /getExpandedRowModel: getExpandedRowModel\(\)/);
  // Expansion is opt-in (Browse table only; the Flat list stays flat).
  assert.match(fileGridSource, /expandableFolders = false/);
  assert.match(fileExplorerSource, /<DirectoryTree/);
  assert.match(fileExplorerSource, /\{resultsTable\}/);
  assert.match(directoryTreeUtilitiesSource, /entry\.kind !== 'dir'/);
});

test('rows are keyboard-navigable and folders are inspectable', () => {
  // ArrowUp/ArrowDown move the inspected row through the visible order
  // (sorted + expanded), scrolling it into view; single click inspects files
  // AND folders (dbl-click still opens folders).
  assert.match(fileGridSource, /function handleGridKeyDown/);
  assert.match(fileGridSource, /event\.key !== 'ArrowDown' && event\.key !== 'ArrowUp'/);
  assert.match(fileGridSource, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(fileGridSource, /data-path=\{row\.original\.path\}/);
  assert.match(fileGridSource, /if \(isSelectableRow\(row\.original\)\) onInspectRow\?\.\(row\.original\)/);
  // Nested rows indent 22px/level so each child's chevron centers under its
  // parent's icon (user steering after 16px too subtle / 48px too much).
  assert.match(fileGridSource, /row\.depth \* 22/);
});

test('file grid uses stable path identities and routes file inspection separately from folder navigation', () => {
  assert.match(fileGridSource, /getRowId: \(row\) => row\.path \|\| row\.name/);
  assert.match(fileGridSource, /selectedSet\.has\(row\.original\.path\)/);
  assert.match(fileGridSource, /if \(row\.original\.kind === 'file'\) onInspect\?\.\(row\.original\)/);
  assert.match(fileGridSource, /if \(row\.original\.kind === 'dir' \|\| row\.original\.kind === 'parent'\) onOpen\?\.\(row\.original\)/);
});

test('column picker visibility leaves the identity columns available', () => {
  assert.match(fileGridSource, /visibleColumns = \[\]/);
  assert.match(fileGridSource, /visibleColumns\.includes\(id\)/);
  assert.match(fileGridSource, /id === 'select' \|\| id === 'name' \|\| id === 'backup'/);
});
