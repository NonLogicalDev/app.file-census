import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = dirname(dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');
const duplicatesSource = readFileSync(join(uiSrc, 'pages', 'DuplicatesPage.jsx'), 'utf8');
const previewSource = readFileSync(join(uiSrc, 'preview.jsx'), 'utf8');

test('duplicate file rows open file details instead of navigating away', () => {
  assert.match(appSource, /onOpenDuplicate=\{inspectFile\}/);
  assert.doesNotMatch(appSource, /function openFileReference/);
  assert.match(duplicatesSource, /title="Open file details"/);
  assert.match(duplicatesSource, /onClick=\{\(\) => onOpenDuplicate\(file\)\}/);
  assert.match(duplicatesSource, /node\.type === 'file' \? onOpenDuplicate\(node\.file\)/);
  assert.match(previewSource, /path: '\/duplicates\/click-affordance'/);
});

test('duplicates page uses shared scan scope selector for explicit scan selection', () => {
  assert.match(duplicatesSource, /ScanScopeSelector/);
  assert.match(duplicatesSource, /selectedScanIds\.length \? 'explicit' : 'representative'/);
  assert.match(duplicatesSource, /onSetSelectedScanIds=\{onSetSelectedScanIds\}/);
});

test('duplicate groups render content kind separately from filesystem row kind', () => {
  assert.match(duplicatesSource, /group\.file_kind/);
  assert.match(duplicatesSource, /kindLabel\(group\.file_kind\)/);
  assert.match(duplicatesSource, /`\$\{group\.blake3\}-\$\{group\.size\}-\$\{group\.file_kind\}`/);
  assert.match(appSource, /file\?\.file_kind/);
  assert.match(appSource, /group\?\.file_kind/);
  assert.match(previewSource, /file_kind: 'image'/);
  assert.match(previewSource, /file_kind: 'video'/);
  assert.match(previewSource, /path: '\/duplicates\/kind-grouping-flat'/);
  assert.match(previewSource, /path: '\/duplicates\/kind-grouping-tree'/);
});
