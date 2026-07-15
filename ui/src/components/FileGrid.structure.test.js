import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = dirname(dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');
const fileGridSource = readFileSync(join(uiSrc, 'components', 'FileGrid.jsx'), 'utf8');
const previewSource = readFileSync(join(uiSrc, 'preview.jsx'), 'utf8');

test('scan file browser exposes folder descendant file counts as a default Files column', () => {
  assert.match(appSource, /\['file_count', 'Files'\]/);
  assert.match(appSource, /const defaultColumns = \[[^\]]*'size', 'file_count'/);
  assert.match(fileGridSource, /accessorKey: 'file_count'/);
  assert.match(fileGridSource, /header: 'Files'/);
});

test('file grid numeric columns align headers with numeric cell values', () => {
  assert.match(fileGridSource, /const numericColumnMeta = \{ align: 'right', className: fileGridNumericClassName \}/);
  for (const column of ['size', 'file_count', 'duplicate_file_count', 'original_file_count', 'same_scan_duplicate_file_count']) {
    assert.match(fileGridSource, new RegExp(`accessorKey: '${column}'[\\s\\S]*?meta: numericColumnMeta`));
  }
  assert.match(fileGridSource, /fileGridHeaderButtonClassName\(\{ align: headerAlign \}\)/);
  assert.match(previewSource, /path: '\/file-grid\/numeric-alignment'/);
  assert.match(previewSource, /path: '\/file-grid\/numeric-tree-alignment'/);
});

test('file grid row actions expose Delete Check include and exclude actions', () => {
  assert.match(fileGridSource, /Include in Delete Check/);
  assert.match(fileGridSource, /Exclude from Delete Check/);
});

test('file grid marks rows in the persistent Delete Check path set', () => {
  assert.match(fileGridSource, /deleteCheckPathStateByPath/);
  assert.match(fileGridSource, /fileGridDeleteCheckBadgeClassName/);
  assert.match(fileGridSource, /Included/);
  assert.match(fileGridSource, /Excluded/);
  assert.match(previewSource, /path: '\/file-grid\/delete-check-marks'/);
});

test('file grid rows expose native titles for file and folder interactions', () => {
  assert.match(fileGridSource, /title=\{fileGridRowTitle\(row\.original, row\.getCanExpand\(\), Boolean\(onInspect\)\)\}/);
  assert.match(fileGridSource, /Double-click to open file details/);
  assert.match(fileGridSource, /Double-click to open folder/);
  assert.match(previewSource, /path: '\/file-grid\/click-affordance'/);
});

test('file grid keeps row actions at the left edge before file identity and metadata', () => {
  assert.match(fileGridSource, /const actionColumns = \[\]/);
  assert.match(fileGridSource, /columns\.push\(\.\.\.actionColumns\)/);
  assert.match(fileGridSource, /columns\.push\(\s*\.\.\.actionColumns[\s\S]*accessorKey: 'name'/);
  assert.match(fileGridSource, /<MenuContent align="start"/);
  assert.doesNotMatch(fileGridSource, /columns\.push\(\{\s*id: 'actions'[\s\S]*return columns;/);
  assert.match(previewSource, /path: '\/file-grid\/actions-left'/);
});

test('file grid supports TanStack expandable hierarchical rows', () => {
  assert.match(fileGridSource, /getExpandedRowModel/);
  assert.match(fileGridSource, /getSubRows: hierarchical/);
  assert.match(fileGridSource, /row\.getCanExpand\(\)/);
});

test('file grid accepts caller-provided column order', () => {
  assert.match(fileGridSource, /columnOrder = \[\]/);
  assert.match(fileGridSource, /const resolvedColumnOrder = useMemo/);
  assert.match(fileGridSource, /columnOrder: resolvedColumnOrder/);
});

test('file grid preserves active scan interaction state by stable row ids', () => {
  assert.match(fileGridSource, /const \[openActionRowId, setOpenActionRowId\] = useState\(null\)/);
  assert.match(fileGridSource, /collectStableRowIds\(rows\)/);
  assert.doesNotMatch(fileGridSource, /if \(hierarchical\) setExpanded\(\{\}\);[\s\S]*?\[hierarchical, rows\]/);
  assert.match(fileGridSource, /const nextEntries = currentEntries\.filter\(\(\[rowId\]\) => stableRowIds\.has\(rowId\)\)/);
  assert.match(fileGridSource, /if \(nextEntries\.length === currentEntries\.length\) return current/);
  assert.match(fileGridSource, /open=\{openActionRowId === row\.id\}/);
  assert.match(fileGridSource, /onOpenChange=\{\(open\) => setOpenActionRowId\(open \? row\.id : null\)\}/);
  assert.match(fileGridSource, /getRowId: stableFileGridRowId/);
  assert.match(previewSource, /path: '\/file-grid\/active-refresh-stability'/);
  assert.match(previewSource, /function FileGridActiveRefreshStabilityPreview/);
  assert.match(previewSource, /window\.setInterval/);
});
