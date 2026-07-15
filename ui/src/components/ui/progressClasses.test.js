import assert from 'node:assert/strict';
import test from 'node:test';

import {
  progressBarClassName,
  progressMetaClassName,
  progressPoolClassName,
  progressPoolHeaderClassName,
  progressPoolsClassName,
  progressSegmentClassName
} from './progressClasses.js';

test('progress pool helpers preserve expanded stacked layout', () => {
  assert.match(progressPoolsClassName({ compact: false }), /grid-cols-1/);
  assert.match(progressPoolsClassName({ compact: false }), /mt-2\.5/);
  assert.match(progressPoolClassName({ compact: false }), /bg-surface-subtle/);
  assert.match(progressBarClassName({ compact: false }), /h-2/);
});

test('progress pool helpers preserve compact sidebar layout', () => {
  assert.match(progressPoolsClassName({ compact: true }), /grid-cols-1/);
  assert.match(progressPoolClassName({ compact: true }), /bg-\[rgb\(255_255_255_\/_0\.035\)\]/);
  assert.match(progressBarClassName({ compact: true }), /h-1\.5/);
  assert.match(progressPoolHeaderClassName({ compact: true }), /text-\[0\.69rem\]/);
});

test('progress meta helpers keep counter labels layout-safe', () => {
  assert.match(progressMetaClassName, /min-h-\[1\.2rem\]/);
  assert.match(progressSegmentClassName('done'), /bg-accent-line/);
  assert.match(progressSegmentClassName('queued'), /surface-muted/);
  assert.match(progressSegmentClassName('active'), /accent-line/);
});
