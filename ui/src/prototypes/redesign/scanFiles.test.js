import assert from 'node:assert/strict';
import test from 'node:test';

import { scanFiles, scans } from './mockData.js';

test('every prototype scan has a deterministic scan-specific file inventory', () => {
  scans.forEach((scan) => {
    assert.ok(Array.isArray(scanFiles[scan.id]), `missing file inventory for ${scan.id}`);
    assert.ok(scanFiles[scan.id].length > 0, `empty file inventory for ${scan.id}`);
    scanFiles[scan.id].forEach((file) => {
      assert.equal(file.scanId, scan.id);
      assert.equal(file.locationId, scan.locationId);
    });
  });
});

test('switching scans cannot reuse NLMedia representative rows', () => {
  const representativeIds = new Set(scanFiles['scan-media-representative'].map((file) => file.id));
  ['scan-media-live', 'scan-media-jul-02', 'scan-backup-representative', 'scan-archive-representative'].forEach((scanId) => {
    assert.equal(scanFiles[scanId].some((file) => representativeIds.has(file.id)), false, `${scanId} leaked representative rows`);
  });
  assert.match(scanFiles['scan-backup-representative'][0].path, /^Media Mirror\//);
  assert.match(scanFiles['scan-archive-representative'][0].path, /^Production Archive\//);
});
