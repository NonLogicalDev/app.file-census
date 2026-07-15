import assert from 'node:assert/strict';
import test from 'node:test';

import { poolProgressView } from './progress.js';

test('labels pool counters as work items instead of file totals', () => {
  const view = poolProgressView('Metadata', {
    queued: 3,
    active: 2,
    completed: 12,
    failed: 1,
    current_path: 'very/long/path/file.mov'
  });

  assert.equal(view.countLabel, 'Done 13 | Queued 3 | Active 2');
  assert.equal(view.statusLabel, 'Done 13 | Queued 3 | Active 2');
  assert.equal(view.ariaValueText, '12 completed work items, 1 failed, 3 queued, 2 active');
  assert.equal(view.title, 'Metadata: Done 13 | Queued 3 | Active 2');
  assert.deepEqual(view.segments.map((segment) => segment.id), ['done', 'queued', 'active']);
});

test('keeps empty pools quiet and bounded', () => {
  const view = poolProgressView('Hashing', {});

  assert.equal(view.countLabel, 'Done 0 | Queued 0 | Active 0');
  assert.equal(view.statusLabel, 'idle');
  assert.equal(view.percent, 0);
  assert.equal(view.ariaValueText, 'idle');
  assert.equal(view.title, 'Hashing');
});

test('uses a visible minimum fill only while work is active', () => {
  const active = poolProgressView('Discovery', { queued: 4, active: 1 });
  const empty = poolProgressView('Discovery', {});

  assert.equal(active.percent, 8);
  assert.equal(empty.percent, 0);
});
