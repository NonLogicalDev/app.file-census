import assert from 'node:assert/strict';
import test from 'node:test';

import { requireTreePage } from './treePage.js';

test('accepts paged tree responses', () => {
  const page = {
    entries: [{ path: 'photos', kind: 'dir' }],
    limit: 500,
    offset: 0,
    total: 1,
    has_more: false,
    next_offset: null,
    duplicate_cache: {
      fingerprint: 'abc',
      status: 'ready',
      run_id: 'run-1',
      total_files: 2,
      processed_files: 2,
      scan_count: 2,
      started_at: '2026-06-14T00:00:00Z',
      ready_at: '2026-06-14T00:00:01Z',
      error: null
    }
  };

  assert.equal(requireTreePage(page), page);
});

test('rejects legacy bare tree arrays', () => {
  assert.throws(
    () => requireTreePage([{ path: 'photos', kind: 'dir' }]),
    /scans.tree returned an invalid page/
  );
});
