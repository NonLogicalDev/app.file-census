import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = dirname(dirname(fileURLToPath(import.meta.url)));
const searchSource = readFileSync(join(uiSrc, 'pages', 'SearchPage.jsx'), 'utf8');
const previewSource = readFileSync(join(uiSrc, 'preview.jsx'), 'utf8');
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');

test('search page uses one shared flat FileGrid workspace', () => {
  assert.match(searchSource, /<FileGrid[\s\S]*rows=\{rows\}/);
  assert.match(searchSource, /Flat results across the selected scan scope/);
  assert.match(searchSource, /Use Locations to browse a scan/);
  assert.doesNotMatch(searchSource, /buildSearchTree|hierarchical|columnOrder|showLocationColumns|<SegmentedTabs/);
});

test('search flat results keep file name and full path as separate columns', () => {
  assert.match(searchSource, /const defaultSearchColumns = \[[^\]]*'path'[^\]]*\]/);
  assert.match(searchSource, /rows=\{rows\}[\s\S]*fullPathName=\{false\}/);
  assert.match(previewSource, /path: '\/file-grid\/search-flat-results'/);
});

test('search page inspects files and exposes representative scan scope control', () => {
  assert.match(searchSource, /onInspectResult/);
  assert.match(searchSource, /ScanScopeSelector/);
  assert.match(searchSource, /allowAll/);
  assert.match(searchSource, /onSetSelectedScanIds/);
  assert.match(appSource, /selectedSearchScanIds/);
  assert.match(appSource, /scanIds: activeSearchScanIds/);
  assert.match(appSource, /scope', 'all'/);
  assert.match(appSource, /scope', 'explicit'/);
});

test('search page exposes supported FileGrid column visibility controls', () => {
  assert.match(searchSource, /const defaultSearchColumns = \[/);
  assert.match(searchSource, /useState\(defaultSearchColumns\)/);
  assert.match(searchSource, /function SearchColumnControls/);
  assert.match(searchSource, /function onToggleSearchColumn/);
  assert.match(searchSource, /visibleColumns=\{searchColumns\}/);
  assert.doesNotMatch(searchSource, /onMoveSearchColumn|columnOrder=\{searchColumns\}/);
  assert.match(previewSource, /path: '\/search\/column-controls'/);
});
