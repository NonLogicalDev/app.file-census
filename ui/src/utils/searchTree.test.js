import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSearchTree } from './searchTree.js';

test('builds search result tree grouped by location, scan, folders, and files', () => {
  const tree = buildSearchTree([
    { scan_id: 'scan-a', location_slug: 'photos', location_name: 'Photos', path: '2024/beach/a.jpg', name: 'a.jpg', size: 10, blake3: 'hash-a' },
    { scan_id: 'scan-a', location_slug: 'photos', location_name: 'Photos', path: '2024/b.jpg', name: 'b.jpg', size: 20, blake3: 'hash-b' },
    { scan_id: 'scan-b', location_slug: 'backup', location_name: 'Backup', path: 'beach/a-copy.jpg', name: 'a-copy.jpg', size: 10, blake3: 'hash-a' }
  ], [
    { id: 'scan-a', nickname: 'Vacation baseline', status: 'complete', file_count: 2 },
    { id: 'scan-b', nickname: 'Backup import', status: 'stopped', file_count: 1 }
  ]);

  assert.deepEqual(tree.map((node) => node.name), ['Backup', 'Photos']);
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
  assert.equal(photos.children[0].children[0].children[0].children[0].file.path, '2024/beach/a.jpg');
});
