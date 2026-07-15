import assert from 'node:assert/strict';
import test from 'node:test';

import { formatUserEvent, isUserVisibleEvent } from './events.js';

test('hides transport-only live update events from recent activity', () => {
  for (const kind of ['connected', 'events_lagged', 'scan_progress', 'scan_progress_snapshot', 'scan_log', 'scan_log_batch']) {
    assert.equal(isUserVisibleEvent({ kind, payload: {} }), false, kind);
  }

  assert.equal(isUserVisibleEvent({ kind: 'scan_started', payload: {} }), true);
  assert.equal(isUserVisibleEvent({ kind: 'location_added', payload: {} }), true);
});

test('formats scan lifecycle events without exposing raw scan ids as primary text', () => {
  const formatted = formatUserEvent({
    kind: 'scan_finished',
    payload: {
      scan_id: '99ebbd57-8d1b-4768-a0fe-9dea3b9fda3b',
      location_slug: 'disk-nlbackup',
      file_count: 2433,
      total_bytes: 6300000000,
      finished_at: '2026-06-13T20:34:00Z'
    }
  });

  assert.equal(formatted.title, 'Scan complete');
  assert.match(formatted.detail, /disk-nlbackup/);
  assert.match(formatted.detail, /2,433 files/);
  assert.doesNotMatch(formatted.detail, /99ebbd57/);
});
