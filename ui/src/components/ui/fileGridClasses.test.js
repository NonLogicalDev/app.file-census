import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fileGridCellClassName,
  fileGridCellContentClassName,
  fileGridCheckboxClassName,
  fileGridClassName,
  fileGridHeaderButtonClassName,
  fileGridHeaderCellClassName,
  fileGridNumericClassName,
  fileGridResizableHeaderClassName,
  fileGridResizerClassName,
  fileGridRowActionContentClassName,
  fileGridRowActionMenuClassName,
  fileGridRowActionPanelClassName,
  fileGridRowActionTriggerClassName,
  fileGridRowClassName,
  fileGridSelectClassName,
  fileGridSortClassName,
  fileGridTableClassName,
  fileKindIconClassName,
  fileNameCellClassName
} from './fileGridClasses.js';

test('file grid frame and table helpers preserve dense scrollable layout', () => {
  assert.match(fileGridClassName, /h-\[min\(70vh,800px\)\]/);
  assert.match(fileGridClassName, /min-h-\[360px\]/);
  assert.match(fileGridClassName, /overflow-auto/);
  assert.match(fileGridClassName, /rounded-ui/);
  assert.match(fileGridClassName, /bg-surface/);

  assert.match(fileGridTableClassName, /w-max/);
  assert.match(fileGridTableClassName, /min-w-full/);
  assert.match(fileGridTableClassName, /table-fixed/);
  assert.match(fileGridTableClassName, /border-separate/);
  assert.match(fileGridTableClassName, /text-\[12\.5px\]/);
});

test('file grid header helpers preserve sticky sortable columns and resize affordance', () => {
  const sortable = fileGridHeaderCellClassName({ sortable: true, className: fileGridNumericClassName });
  const plain = fileGridHeaderCellClassName({ sortable: false });

  assert.match(sortable, /sticky/);
  assert.match(sortable, /top-0/);
  assert.match(sortable, /z-\[2\]/);
  assert.match(sortable, /cursor-pointer/);
  assert.match(sortable, /select-none/);
  assert.match(sortable, /text-right/);
  assert.doesNotMatch(plain, /cursor-pointer/);

  assert.match(fileGridHeaderButtonClassName(), /inline-flex/);
  assert.match(fileGridHeaderButtonClassName(), /justify-between/);
  assert.match(fileGridHeaderButtonClassName(), /text-left/);
  assert.match(fileGridHeaderButtonClassName({ align: 'right' }), /justify-end/);
  assert.match(fileGridHeaderButtonClassName({ align: 'right' }), /text-right/);
  assert.match(fileGridHeaderButtonClassName(), /hover:!text-accent/);
  assert.match(fileGridSortClassName, /text-\[0\.72rem\]/);
  assert.match(fileGridResizableHeaderClassName, /relative/);
  assert.match(fileGridResizerClassName({ resizing: false }), /cursor-col-resize/);
  // The divider bar is visible by default (discoverable) and accents while resizing.
  assert.match(fileGridResizerClassName({ resizing: false }), /after:bg-border-strong/);
  assert.match(fileGridResizerClassName({ resizing: true }), /after:!bg-accent/);
});

test('file grid cells and headers carry column dividers', () => {
  assert.match(fileGridHeaderCellClassName(), /border-r/);
  assert.match(fileGridCellClassName(), /border-r/);
});

test('file grid row helpers preserve alternating rows, actions, and selection', () => {
  assert.match(fileGridRowClassName({ index: 0, kind: 'file', actionable: true }), /bg-surface/);
  assert.match(fileGridRowClassName({ index: 1, kind: 'file', actionable: false }), /bg-surface-subtle/);
  assert.match(fileGridRowClassName({ index: 0, kind: 'dir', actionable: true }), /font-\[650\]/);
  assert.match(fileGridRowClassName({ index: 0, kind: 'file', actionable: true }), /cursor-pointer/);
  assert.match(fileGridRowClassName({ index: 0, kind: 'file', selected: true }), /color-mix/);
});

test('file grid cell helpers preserve truncation and control overflow', () => {
  assert.match(fileGridCellClassName({ className: fileGridNumericClassName }), /text-right/);
  assert.match(fileGridCellClassName({ className: fileGridSelectClassName }), /overflow-visible/);
  assert.match(fileGridCellContentClassName({ overflowVisible: false }), /overflow-hidden/);
  assert.match(fileGridCellContentClassName({ overflowVisible: false }), /text-ellipsis/);
  assert.match(fileGridCellContentClassName({ overflowVisible: true }), /overflow-visible/);
  assert.match(fileGridCheckboxClassName, /h-\[14px\]/);
  assert.match(fileGridCheckboxClassName, /w-\[14px\]/);
  assert.match(fileGridCheckboxClassName, /\[accent-color:var\(--accent\)\]/);
});

test('file name and row action helpers preserve compact finder-like controls', () => {
  assert.match(fileNameCellClassName({ kind: 'file' }), /inline-flex/);
  assert.match(fileNameCellClassName({ kind: 'file' }), /\[&_span:last-child\]:truncate/);
  assert.match(fileNameCellClassName({ kind: 'dir' }), /\[&_svg\]:text-accent/);
  assert.match(fileKindIconClassName, /h-\[15px\]/);
  assert.match(fileKindIconClassName, /w-\[15px\]/);

  assert.match(fileGridRowActionMenuClassName, /justify-center/);
  assert.match(fileGridRowActionTriggerClassName, /!h-\[26px\]/);
  assert.match(fileGridRowActionTriggerClassName, /hover:!bg-surface-muted/);
  assert.match(fileGridRowActionTriggerClassName, /group-data-\[open=true\]\/file-row-action:!bg-surface-muted/);
  assert.match(fileGridRowActionPanelClassName, /!min-w-\[172px\]/);
  assert.match(fileGridRowActionContentClassName, /overflow-visible/);
});
