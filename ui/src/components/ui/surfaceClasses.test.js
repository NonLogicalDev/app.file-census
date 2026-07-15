import assert from 'node:assert/strict';
import test from 'node:test';

import {
  modalHelpClassName,
  modalOverlayClassName,
  modalSurfaceClassName,
  segmentedTabClassName,
  segmentedTabsClassName
} from './surfaceClasses.js';

test('modal surface classes encode default and wide dialog geometry', () => {
  assert.match(modalOverlayClassName, /fixed/);
  assert.match(modalOverlayClassName, /backdrop-blur/);
  assert.match(modalSurfaceClassName(), /w-\[min\(520px,100%\)\]/);
  assert.match(modalSurfaceClassName({ size: 'wide' }), /w-\[min\(980px,100%\)\]/);
  assert.match(modalSurfaceClassName({ size: 'wide' }), /overflow-auto/);
  assert.match(modalSurfaceClassName({ className: 'custom-surface' }), /custom-surface/);
});

test('segmented tabs keep equal-width rounded tab behavior in utilities', () => {
  assert.match(segmentedTabsClassName, /rounded-full/);
  assert.match(segmentedTabsClassName, /before:content-\[''\]/);
  assert.match(segmentedTabClassName({ active: false }), /flex-1/);
  assert.match(segmentedTabClassName({ active: false }), /text-muted-strong/);
  assert.match(segmentedTabClassName({ active: true }), /bg-surface/);
  assert.match(segmentedTabClassName({ active: true }), /text-text/);
});

test('modal helper text remains a muted readable paragraph utility', () => {
  assert.match(modalHelpClassName, /text-muted-strong/);
  assert.match(modalHelpClassName, /leading-\[1\.45\]/);
});
