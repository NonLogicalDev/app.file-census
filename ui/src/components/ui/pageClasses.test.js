import assert from 'node:assert/strict';
import test from 'node:test';

import {
  emptyTextClassName,
  interactiveRowClassName,
  pageGridClassName,
  pageHeaderClassName,
  stackedListClassName
} from './pageClasses.js';
import * as pageClasses from './pageClasses.js';

test('page surface helpers cover dense tool pages and headers', () => {
  assert.match(pageGridClassName, /grid/);
  assert.match(pageGridClassName, /gap-3\.5/);
  assert.match(pageHeaderClassName, /justify-between/);
  assert.match(pageHeaderClassName, /max-\[960px\]:items-start/);
});

test('interactive rows preserve full-width compact card behavior', () => {
  assert.match(stackedListClassName, /grid/);
  assert.match(interactiveRowClassName, /w-full/);
  assert.match(interactiveRowClassName, /text-left/);
  assert.match(interactiveRowClassName, /hover:!bg-surface-muted/);
});

test('empty text helper keeps muted lightweight empty states', () => {
  assert.match(emptyTextClassName, /text-muted/);
});

test('panel title and action helpers preserve responsive toolbar layout', () => {
  for (const helperName of [
    'panelTitleClassName',
    'panelTitleTextClassName',
    'panelTitleSubtextClassName',
    'actionToolbarClassName'
  ]) {
    assert.equal(typeof pageClasses[helperName], 'string', `${helperName} should be exported`);
  }

  assert.match(pageClasses.panelTitleClassName, /flex/);
  assert.match(pageClasses.panelTitleClassName, /items-center/);
  assert.match(pageClasses.panelTitleClassName, /justify-between/);
  assert.match(pageClasses.panelTitleClassName, /gap-3/);
  assert.match(pageClasses.panelTitleClassName, /max-\[960px\]:flex-col/);
  assert.match(pageClasses.panelTitleClassName, /max-\[960px\]:items-stretch/);
  assert.match(pageClasses.panelTitleTextClassName, /\[&_h2\]:m-0/);
  assert.match(pageClasses.panelTitleSubtextClassName, /mt-1/);
  assert.match(pageClasses.panelTitleSubtextClassName, /text-muted/);
  assert.match(pageClasses.actionToolbarClassName, /flex-wrap/);
  assert.match(pageClasses.actionToolbarClassName, /justify-start/);
  assert.match(pageClasses.actionToolbarClassName, /border-0/);
  assert.match(pageClasses.actionToolbarClassName, /bg-transparent/);
});

test('notes and log helpers preserve bordered panel behavior', () => {
  for (const helperName of [
    'notesPanelClassName',
    'scanNotesPanelClassName',
    'notesPanelBodyClassName',
    'logPanelClassName',
    'logLineClassName'
  ]) {
    assert.equal(typeof pageClasses[helperName], 'string', `${helperName} should be exported`);
  }

  assert.match(pageClasses.notesPanelClassName, /grid/);
  assert.match(pageClasses.notesPanelClassName, /gap-\[6px\]/);
  assert.match(pageClasses.notesPanelClassName, /mt-3\.5/);
  assert.match(pageClasses.notesPanelClassName, /rounded-ui/);
  assert.match(pageClasses.notesPanelClassName, /border-border/);
  assert.match(pageClasses.scanNotesPanelClassName, /mt-2\.5/);
  assert.match(pageClasses.scanNotesPanelClassName, /mb-0/);
  assert.match(pageClasses.notesPanelBodyClassName, /whitespace-pre-wrap/);
  assert.match(pageClasses.notesPanelBodyClassName, /text-muted-strong/);
  assert.match(pageClasses.logPanelClassName, /max-h-\[220px\]/);
  assert.match(pageClasses.logPanelClassName, /overflow-auto/);
  assert.match(pageClasses.logLineClassName, /block/);
});
