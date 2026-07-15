import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const uiSrc = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');
const modalSource = readFileSync(join(uiSrc, 'components', 'AppModals.jsx'), 'utf8');
const previewSource = readFileSync(join(uiSrc, 'preview.jsx'), 'utf8');

test('file details modal pages high-cardinality occurrence lists', () => {
  assert.match(appSource, /function loadMoreFileOccurrences/);
  assert.match(appSource, /rpc\('files\.occurrences'/);
  assert.match(appSource, /onLoadMoreFileOccurrences=\{loadMoreFileOccurrences\}/);
  assert.match(modalSource, /occurrence_count/);
  assert.match(modalSource, /occurrence_next_offset/);
  assert.match(modalSource, /Load more/);
});

test('file details occurrence rows use a compact action menu', () => {
  assert.match(modalSource, /function OccurrenceActionMenu/);
  assert.match(modalSource, /Occurrence actions/);
  assert.match(modalSource, /Open File/);
  assert.match(modalSource, /Reveal File/);
  assert.match(modalSource, /Reveal in Scan/);
  assert.doesNotMatch(modalSource, /<Button type="button" variant="secondary" onClick=\{\(\) => props\.onOpenOccurrence/);
});

test('file details occurrence actions have a preview route', () => {
  assert.match(previewSource, /\/file-info\/occurrence-actions/);
  assert.match(previewSource, /fileInfoInitialTab="locations"/);
});

test('file details metadata and exif tabs use compact row previews', () => {
  assert.match(modalSource, /metadataRows\.map/);
  assert.match(modalSource, /metadataListClassName/);
  assert.match(modalSource, /metadataRowClassName/);
  assert.match(modalSource, /exifGridClassName/);
  assert.doesNotMatch(modalSource, /<section className=\{metadataGridClassName\(\)\}>/);
  assert.match(previewSource, /path: '\/file-info\/metadata-compact'/);
  assert.match(previewSource, /path: '\/file-info\/exif-compact'/);
  assert.match(previewSource, /fileInfoInitialTab="metadata"/);
  assert.match(previewSource, /fileInfoInitialTab="exif"/);
});

test('scan details modal edits nickname and notes together', () => {
  assert.match(modalSource, /Scan details/);
  assert.match(modalSource, /scanNotesForm\.nickname/);
  assert.match(modalSource, /Save details/);
  assert.match(appSource, /scans\.update_metadata/);
});
