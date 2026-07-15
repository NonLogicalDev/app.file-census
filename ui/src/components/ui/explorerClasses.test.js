import assert from 'node:assert/strict';
import test from 'node:test';

import {
  breadcrumbsClassName,
  columnPickerClassName,
  deleteCheckCalloutClassName,
  deleteCheckEmptyClassName,
  explorerClassName,
  explorerHeaderClassName,
  finderToolbarClassName,
  treeClassName,
  treeEmptyClassName
} from './explorerClasses.js';

test('explorer shell helpers preserve the framed file browser layout', () => {
  assert.match(explorerClassName, /min-w-0/);
  assert.match(explorerClassName, /border-t/);
  assert.match(explorerClassName, /border-border/);
  assert.match(explorerClassName, /pt-3/);

  assert.match(explorerHeaderClassName, /flex/);
  assert.match(explorerHeaderClassName, /items-center/);
  assert.match(explorerHeaderClassName, /justify-between/);
  assert.match(explorerHeaderClassName, /gap-3/);
  assert.match(explorerHeaderClassName, /max-\[960px\]:flex-col/);
  assert.match(explorerHeaderClassName, /max-\[960px\]:items-stretch/);
  assert.match(explorerHeaderClassName, /\[&_h3\]:mb-\[2px\]/);
  assert.match(explorerHeaderClassName, /\[&_span\]:text-muted/);
});

test('toolbar and column picker helpers keep responsive wrapped controls', () => {
  assert.match(finderToolbarClassName, /!flex/);
  assert.match(finderToolbarClassName, /!flex-wrap/);
  assert.match(finderToolbarClassName, /!items-center/);
  assert.match(finderToolbarClassName, /!gap-2/);
  assert.match(finderToolbarClassName, /my-2\.5/);
  assert.match(finderToolbarClassName, /!rounded-panel/);
  assert.match(finderToolbarClassName, /!bg-surface-muted/);
  assert.match(finderToolbarClassName, /\[&_button\]:!shadow-none/);

  assert.match(columnPickerClassName, /flex/);
  assert.match(columnPickerClassName, /flex-wrap/);
  assert.match(columnPickerClassName, /gap-2\.5/);
  assert.match(columnPickerClassName, /rounded-panel/);
  assert.match(columnPickerClassName, /border-border/);
  assert.match(columnPickerClassName, /bg-surface/);
  assert.match(columnPickerClassName, /\[&_label\]:flex/);
  assert.match(columnPickerClassName, /\[&_label\]:items-center/);
  assert.match(columnPickerClassName, /\[&_input\]:w-auto/);
});

test('breadcrumb helper keeps buttons readable and no-wrap', () => {
  assert.match(breadcrumbsClassName, /flex/);
  assert.match(breadcrumbsClassName, /gap-1\.5/);
  assert.match(breadcrumbsClassName, /my-\[9px\]/);
  assert.match(breadcrumbsClassName, /overflow-x-auto/);
  assert.match(breadcrumbsClassName, /\[&_button\]:border-border/);
  assert.match(breadcrumbsClassName, /\[&_button\]:bg-surface/);
  assert.match(breadcrumbsClassName, /\[&_button\]:text-accent/);
  assert.match(breadcrumbsClassName, /\[&_button\]:whitespace-nowrap/);
});

test('delete check helpers preserve callout and empty states', () => {
  const safe = deleteCheckCalloutClassName({ safe: true });
  const unsafe = deleteCheckCalloutClassName({ safe: false });

  assert.match(safe, /flex/);
  assert.match(safe, /items-center/);
  assert.match(safe, /justify-between/);
  assert.match(safe, /gap-3/);
  assert.match(safe, /rounded-panel/);
  assert.match(safe, /\[&_div\]:grid/);
  assert.match(safe, /\[&_span\]:text-inherit/);
  assert.match(safe, /bg-accent-soft/);
  assert.match(safe, /text-accent/);
  assert.match(safe, /border-\[color:color-mix\(in_srgb,var\(--accent-line\)_45%,var\(--border\)\)\]/);

  assert.match(unsafe, /bg-danger-soft/);
  assert.match(unsafe, /text-danger/);
  assert.match(unsafe, /border-\[color:color-mix\(in_srgb,var\(--danger\)_34%,var\(--border\)\)\]/);

  assert.match(deleteCheckEmptyClassName, /flex/);
  assert.match(deleteCheckEmptyClassName, /flex-wrap/);
  assert.match(deleteCheckEmptyClassName, /items-center/);
  assert.match(deleteCheckEmptyClassName, /gap-2\.5/);
  assert.match(deleteCheckEmptyClassName, /rounded-panel/);
  assert.match(deleteCheckEmptyClassName, /border-border/);
  assert.match(deleteCheckEmptyClassName, /bg-surface/);
  assert.match(deleteCheckEmptyClassName, /\[&_strong\]:text-text/);
  assert.match(deleteCheckEmptyClassName, /\[&_span\]:text-muted/);
});

test('tree helpers preserve the table frame and empty overlay', () => {
  assert.match(treeClassName, /relative/);
  assert.match(treeClassName, /block/);
  assert.match(treeClassName, /min-h-\[620px\]/);
  assert.match(treeClassName, /overflow-hidden/);
  assert.match(treeClassName, /rounded-panel/);
  assert.match(treeClassName, /border-border/);
  assert.match(treeClassName, /bg-surface/);
  assert.match(treeClassName, /shadow-sm/);
  assert.match(treeClassName, /p-\[5px\]/);

  assert.match(treeEmptyClassName, /absolute/);
  assert.match(treeEmptyClassName, /inset-x-0/);
  assert.match(treeEmptyClassName, /top-\[52px\]/);
  assert.match(treeEmptyClassName, /z-\[1\]/);
  assert.match(treeEmptyClassName, /p-\[18px\]/);
  assert.match(treeEmptyClassName, /text-center/);
  assert.match(treeEmptyClassName, /text-muted/);
  assert.match(treeEmptyClassName, /pointer-events-none/);
});
