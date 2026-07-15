import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./CommandPalette.jsx', import.meta.url), 'utf8');

test('command palette keeps its accessible modal and keyboard contract', () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  assert.match(source, /event\.key === 'Home' \|\| event\.key === 'End'/);
  assert.match(source, /event\.key === 'Tab'/);
  assert.match(source, /onCommand\(entry\.command, entry\.group\)/);
});
