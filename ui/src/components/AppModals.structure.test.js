import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const uiSrc = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');
const modalSource = readFileSync(join(uiSrc, 'components', 'AppModals.jsx'), 'utf8');

test('file details modal pages high-cardinality occurrence lists', () => {
  assert.match(appSource, /function loadMoreFileOccurrences/);
  assert.match(appSource, /rpc\('files\.occurrences'/);
  assert.match(appSource, /onLoadMoreFileOccurrences=\{loadMoreFileOccurrences\}/);
  assert.match(modalSource, /occurrence_count/);
  assert.match(modalSource, /occurrence_next_offset/);
  assert.match(modalSource, /Load more/);
});

test('file details occurrence rows expose direct compact actions', () => {
  assert.match(modalSource, /onOpenOccurrence\(occurrence\)[\s\S]*?>Open File<\/Button>/);
  assert.match(modalSource, /onRevealOccurrence\(occurrence\)[\s\S]*?>Reveal File<\/Button>/);
  assert.match(modalSource, /Reveal in scan/);
  assert.doesNotMatch(modalSource, /function OccurrenceActionMenu/);
});

test('file details metadata and EXIF use the current compact data primitives', () => {
  assert.match(modalSource, /<section className=\{metadataGridClassName\(\)\}>/);
  assert.match(modalSource, /metadataGridClassName\(\{ compact: true \}\)/);
  assert.match(modalSource, /metadataItemClassName\(\{ compact: true \}\)/);
  assert.match(modalSource, /exifPanelClassName/);
  assert.match(modalSource, /exifGridClassName/);
  assert.doesNotMatch(modalSource, /metadataRows\.map/);
});

test('scan notes modal uses the supported notes RPC', () => {
  assert.match(modalSource, /<h2>Scan notes<\/h2>/);
  assert.match(modalSource, /scanNotesForm\.notes/);
  assert.match(modalSource, /Save notes/);
  assert.match(appSource, /scans\.update_notes/);
  assert.doesNotMatch(appSource, /scans\.update_metadata/);
});
