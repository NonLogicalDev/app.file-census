import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exifGridClassName,
  exifPanelClassName,
  exifStatusClassName,
  filePreviewImageClassName,
  filePreviewPanelClassName,
  filePreviewTextClassName,
  metadataGridClassName,
  metadataItemClassName,
  metadataValueClassName,
  occurrenceCardClassName,
  occurrenceHeaderClassName,
  occurrenceHeaderMetaClassName,
  occurrenceListClassName,
  occurrencePathRowClassName,
  occurrencePathTextClassName,
  occurrenceActionMenuClassName,
  occurrenceActionPanelClassName,
  occurrenceActionTriggerClassName
} from './detailClasses.js';

test('file preview helpers preserve centered thumbnail panel behavior', () => {
  assert.match(filePreviewPanelClassName, /grid/);
  assert.match(filePreviewPanelClassName, /place-items-center/);
  assert.match(filePreviewPanelClassName, /min-h-\[260px\]/);
  assert.match(filePreviewImageClassName, /max-h-\[520px\]/);
  assert.match(filePreviewImageClassName, /object-contain/);
  assert.match(filePreviewTextClassName, /text-muted/);
});

test('metadata and exif helpers keep responsive two-column cards', () => {
  assert.match(metadataGridClassName(), /grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\]/);
  assert.match(metadataGridClassName({ compact: true }), /grid-cols-\[repeat\(3,minmax\(0,1fr\)\)\]/);
  assert.match(metadataGridClassName({ compact: true }), /max-\[960px\]:grid-cols-1/);
  assert.match(metadataItemClassName({ compact: false }), /bg-surface-muted/);
  assert.match(metadataItemClassName({ compact: true }), /bg-surface/);
  assert.match(metadataValueClassName, /whitespace-normal/);
  assert.match(exifPanelClassName, /grid/);
  assert.match(exifStatusClassName, /justify-between/);
  assert.match(exifGridClassName, /grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\]/);
  assert.match(exifGridClassName, /\[&_code\]:whitespace-normal/);
});

test('occurrence helpers keep path rows readable on narrow screens', () => {
  assert.match(occurrenceListClassName, /grid/);
  assert.match(occurrenceCardClassName, /shadow-sm/);
  assert.match(occurrenceHeaderClassName, /justify-between/);
  assert.match(occurrenceHeaderClassName, /max-\[960px\]:flex-col/);
  assert.match(occurrenceHeaderMetaClassName, /whitespace-nowrap/);
  assert.match(occurrenceHeaderMetaClassName, /max-\[960px\]:whitespace-normal/);
  assert.match(occurrencePathRowClassName, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(occurrencePathRowClassName, /max-\[960px\]:grid-cols-1/);
  assert.match(occurrencePathTextClassName, /whitespace-normal/);
  assert.match(occurrenceActionMenuClassName, /justify-self-end/);
  assert.match(occurrenceActionMenuClassName, /max-\[960px\]:justify-self-start/);
  assert.match(occurrenceActionTriggerClassName, /!h-\[30px\]/);
  assert.match(occurrenceActionPanelClassName, /!min-w-\[188px\]/);
});
