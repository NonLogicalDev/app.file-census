import assert from 'node:assert/strict';
import test from 'node:test';

import {
  locationContentClassName,
  locationEmptyStateClassName,
  locationNotesBodyClassName,
  locationNotesPanelClassName,
  locationOverviewActionsClassName,
  locationShellClassName,
  locationSummaryGridClassName,
  locationSummaryItemClassName,
  locationSummaryLabelClassName,
  locationSummaryValueClassName,
  scanSummaryCardClassName,
  scanSummaryGridClassName,
  scanSummaryLabelClassName,
  scanSummaryValueClassName
} from './locationClasses.js';

test('location overview shell helpers keep a single dense content column', () => {
  assert.match(locationShellClassName, /grid/);
  assert.match(locationShellClassName, /gap-3\.5/);
  assert.match(locationContentClassName, /min-w-0/);
  assert.match(locationEmptyStateClassName, /max-w-\[520px\]/);
  assert.match(locationEmptyStateClassName, /justify-items-start/);
  assert.match(locationOverviewActionsClassName, /justify-start/);
});

test('location notes helper preserves accent callout and wrapped body text', () => {
  assert.match(locationNotesPanelClassName, /bg-accent-soft/);
  assert.match(locationNotesPanelClassName, /border-accent/);
  assert.match(locationNotesBodyClassName, /whitespace-pre-wrap/);
});

test('location summary helpers preserve responsive metric cards', () => {
  assert.match(locationSummaryGridClassName, /grid-cols-\[repeat\(4,minmax\(0,1fr\)\)\]/);
  assert.match(locationSummaryGridClassName, /max-\[960px\]:grid-cols-1/);
  assert.match(locationSummaryItemClassName({ emphasis: true }), /border-accent-line/);
  assert.match(locationSummaryItemClassName({ emphasis: false }), /border-border/);
  assert.match(locationSummaryValueClassName, /truncate/);
  assert.match(locationSummaryLabelClassName, /text-muted/);
});

test('scan summary helpers preserve three-card scan overview layout', () => {
  assert.match(scanSummaryGridClassName, /grid-cols-\[repeat\(3,minmax\(0,1fr\)\)\]/);
  assert.match(scanSummaryGridClassName, /max-\[960px\]:grid-cols-1/);
  assert.match(scanSummaryCardClassName, /shadow-sm/);
  assert.match(scanSummaryLabelClassName, /uppercase/);
  assert.match(scanSummaryValueClassName, /truncate/);
});
