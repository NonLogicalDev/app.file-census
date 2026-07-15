import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pagesDir = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(pagesDir, '..');
const tasksPageSource = readFileSync(join(pagesDir, 'TasksPage.jsx'), 'utf8');
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');

test('background tasks expose stoppable controls through task ids', () => {
  assert.match(tasksPageSource, /onStopBackgroundTask/);
  assert.match(tasksPageSource, /task\.cancellable/);
  assert.match(tasksPageSource, /onStopBackgroundTask\?\.\(task\)/);
  assert.match(appSource, /function stopBackgroundTask\(task\)/);
  assert.match(appSource, /file_extra_info\.stop/);
});
