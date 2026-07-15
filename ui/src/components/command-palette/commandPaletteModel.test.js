import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjacentEnabledCommandKey,
  boundaryEnabledCommandKey,
  filterCommandGroups,
  flattenCommandGroups
} from './commandPaletteModel.js';

const groups = [
  {
    id: 'navigation',
    label: 'Navigation',
    commands: [
      { id: 'locations', label: 'Locations', detail: 'Browse scans and files', keywords: 'go sources' },
      { id: 'duplicates', label: 'Duplicates', detail: 'Inspect matching content', keywords: 'copies hashes' }
    ]
  },
  {
    id: 'actions',
    label: 'Current file',
    commands: [
      { id: 'reveal', label: 'Reveal in Finder', keywords: 'file folder', disabled: true },
      { id: 'copy-path', label: 'Copy full path', keywords: 'clipboard' }
    ]
  }
];

test('filters labels, details, and caller-provided keywords without mutating caller groups', () => {
  const filtered = filterCommandGroups(groups, 'hashes');

  assert.deepEqual(filtered.map((group) => group.id), ['navigation']);
  assert.deepEqual(filtered[0].commands.map((command) => command.id), ['duplicates']);
  assert.equal(groups[0].commands.length, 2);
});

test('keyboard navigation skips disabled commands and wraps at each boundary', () => {
  const entries = flattenCommandGroups(groups);

  assert.equal(adjacentEnabledCommandKey(entries, 'navigation:locations', 1), 'navigation:duplicates');
  assert.equal(adjacentEnabledCommandKey(entries, 'actions:copy-path', 1), 'navigation:locations');
  assert.equal(adjacentEnabledCommandKey(entries, 'navigation:locations', -1), 'actions:copy-path');
  assert.equal(boundaryEnabledCommandKey(entries, 'start'), 'navigation:locations');
  assert.equal(boundaryEnabledCommandKey(entries, 'end'), 'actions:copy-path');
});
