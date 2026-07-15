import assert from 'node:assert/strict';
import test from 'node:test';

import {
  directoryAncestorPaths,
  directoryOnlyEntries,
  directoryTreeScopeKey,
  mergeDirectoryTreePage
} from './directoryTree.js';

test('directory navigation never turns file entries into tree nodes', () => {
  const entries = directoryOnlyEntries([
    { kind: 'file', path: 'root.mov' },
    { kind: 'dir', path: 'Camera01', name: 'Camera01' },
    { kind: 'dir', path: 'Camera01', name: 'duplicate' },
    { kind: 'parent', path: '' }
  ]);

  assert.deepEqual(entries, [{ kind: 'dir', path: 'Camera01', name: 'Camera01' }]);
});

test('directory page merging retains only directory entries while preserving pagination truth', () => {
  const first = mergeDirectoryTreePage(null, {
    entries: [{ kind: 'dir', path: 'A' }, { kind: 'file', path: 'a.txt' }],
    total: 4,
    has_more: true,
    next_offset: 2
  });
  const merged = mergeDirectoryTreePage(first, {
    entries: [{ kind: 'file', path: 'b.txt' }, { kind: 'dir', path: 'B' }],
    total: 4,
    has_more: false,
    next_offset: null
  }, { append: true });

  assert.deepEqual(merged.entries.map((entry) => entry.path), ['A', 'B']);
  assert.equal(merged.total, 4);
  assert.equal(merged.hasMore, false);
  assert.equal(merged.nextOffset, null);
  assert.equal(merged.scannedEntries, 4);
});

test('directory scopes and ancestors stay scan-specific and bounded', () => {
  assert.notEqual(
    directoryTreeScopeKey({ scanId: 'scan-a', query: 'raw' }),
    directoryTreeScopeKey({ scanId: 'scan-b', query: 'raw' })
  );
  assert.deepEqual(directoryAncestorPaths('Camera01/day-one/clips'), ['', 'Camera01', 'Camera01/day-one']);
  assert.deepEqual(directoryAncestorPaths('Camera01/day-one/clips', { includePath: true, maxDepth: 2 }), ['', 'Camera01', 'Camera01/day-one']);
});
