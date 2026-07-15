import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDuplicateTree } from './duplicateTree.js';

test('builds duplicate tree grouped by location, scan, folders, and file leaves', () => {
  const tree = buildDuplicateTree([
    {
      blake3: 'hash-a',
      size: 10,
      file_kind: 'image',
      count: 2,
      files: [
        { scan_id: 'scan-a', location_slug: 'photos', location_name: 'Photos', path: '2024/beach/a.jpg', name: 'a.jpg', size: 10, blake3: 'hash-a', file_kind: 'image' },
        { scan_id: 'scan-b', location_slug: 'backup', location_name: 'Backup', path: 'beach/a-copy.jpg', name: 'a-copy.jpg', size: 10, blake3: 'hash-a', file_kind: 'image' }
      ]
    },
    {
      blake3: 'hash-b',
      size: 20,
      file_kind: 'text',
      count: 2,
      files: [
        { scan_id: 'scan-a', location_slug: 'photos', location_name: 'Photos', path: '2024/b.jpg', name: 'b.jpg', size: 20, blake3: 'hash-b', file_kind: 'text' },
        { scan_id: 'scan-c', location_slug: 'archive', location_name: 'Archive', path: 'b.jpg', name: 'b.jpg', size: 20, blake3: 'hash-b', file_kind: 'text' }
      ]
    }
  ], [
    { id: 'scan-a', nickname: 'Vacation baseline', status: 'complete', file_count: 2 },
    { id: 'scan-b', nickname: 'Backup import', status: 'complete', file_count: 1 },
    { id: 'scan-c', nickname: 'Archive import', status: 'stopped', file_count: 1 }
  ]);

  assert.deepEqual(tree.map((node) => node.name), ['Archive', 'Backup', 'Photos']);
  const photos = tree.find((node) => node.location_slug === 'photos');
  assert.equal(photos.children[0].type, 'scan');
  assert.equal(photos.children[0].name, 'Vacation baseline');
  assert.deepEqual(photos.children[0].children.map((node) => [node.type, node.name]), [
    ['folder', '2024']
  ]);
  assert.deepEqual(photos.children[0].children[0].children.map((node) => [node.type, node.name]), [
    ['folder', 'beach'],
    ['file', 'b.jpg']
  ]);
  assert.equal(photos.children[0].children[0].children[0].children[0].path, '2024/beach/a.jpg');
  assert.equal(photos.children[0].children[0].children[0].children[0].file_kind, 'image');
  assert.equal(photos.children[0].children[0].children[1].file_kind, 'text');
});
