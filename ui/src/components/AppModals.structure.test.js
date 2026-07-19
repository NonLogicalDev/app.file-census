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

test('file details occurrences are grouped by location/scan with compact actions', () => {
  // Grouped rendering: location -> scan (with a representative badge) -> paths.
  assert.match(modalSource, /function groupOccurrences/);
  assert.match(modalSource, /representative/);
  assert.match(modalSource, /onOpenOccurrence\(occurrence\)[\s\S]*?>Open<\/Button>/);
  assert.match(modalSource, /onRevealOccurrence\(occurrence\)[\s\S]*?>Reveal<\/Button>/);
  assert.match(modalSource, /Reveal in scan/);
  // Scope toggle: representative scans only (default) vs all scans.
  assert.match(modalSource, /onSetFileOccurrenceScope/);
  assert.match(modalSource, /All scans/);
  assert.doesNotMatch(modalSource, /function OccurrenceActionMenu/);
});

test('file details metadata and EXIF use the current compact data primitives', () => {
  assert.match(modalSource, /<section className=\{metadataGridClassName\(\)\}>/);
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
