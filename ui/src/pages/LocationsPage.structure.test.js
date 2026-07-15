import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pageSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'LocationsPage.jsx'), 'utf8');

test('location overview keeps scan selection and scan start actions out of the page body', () => {
  assert.doesNotMatch(pageSource, /onStartScan/);
  assert.doesNotMatch(pageSource, /onSelect\(scan\.id\)/);
  assert.doesNotMatch(pageSource, />\s*Scan now\s*</);
});

test('location overview exposes root, connection, and distinct scan facts', () => {
  assert.match(pageSource, /Root path/);
  assert.match(pageSource, /Location is/);
  assert.match(pageSource, /Representative scan/);
  assert.match(pageSource, /Last successful scan/);
  assert.match(pageSource, /showScanActions=\{false\}/);
});
