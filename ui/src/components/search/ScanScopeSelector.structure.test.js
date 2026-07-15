import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(componentDir, 'ScanScopeSelector.jsx'), 'utf8');
const previewSource = readFileSync(join(dirname(dirname(componentDir)), 'preview.jsx'), 'utf8');

test('scan scope selector supports representative, all, and explicit scan scope states', () => {
  assert.match(componentSource, /scope === 'representative'/);
  assert.match(componentSource, /scope === 'all'/);
  assert.match(componentSource, /scope === 'explicit'/);
  assert.match(componentSource, /allowAll/);
  assert.match(componentSource, /onSetSelectedScanIds/);
});

test('scan scope selector exposes representative quick select and representative scan styling', () => {
  assert.match(componentSource, /selectRepresentative/);
  assert.match(componentSource, /scan\.is_representative/);
  assert.match(componentSource, /Rep\s*<\/span>/);
  assert.match(componentSource, /Use representative/);
});

test('scan scope selector has dedicated preview routes', () => {
  assert.match(previewSource, /path: '\/scan-scope\/search'/);
  assert.match(previewSource, /path: '\/scan-scope\/duplicates'/);
});
