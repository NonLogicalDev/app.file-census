import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pagesDir = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(pagesDir, '..');
const tasksPageSource = readFileSync(join(pagesDir, 'TasksPage.jsx'), 'utf8');
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');

test('tasks expose the real scan Stop callback without inventing background-task RPCs', () => {
  assert.match(tasksPageSource, /onStopScan/);
  assert.match(tasksPageSource, /const canStopScan = typeof onStopScan === 'function'/);
  // Stop is offered only for scan tasks and delegates to the real scan Stop
  // callback (the unified task id is the scan_id for scan rows).
  assert.match(tasksPageSource, /selectedTask\.isScan && canStopScan/);
  assert.match(tasksPageSource, /onClick=\{\(\) => onStopScan\(selectedTask\.id\)\}/);
  assert.doesNotMatch(tasksPageSource, /onStopBackgroundTask|task\.cancellable|file_extra_info/);
  assert.match(appSource, /<TasksPage[\s\S]*onStopScan=\{stopScan\}/);
  assert.doesNotMatch(appSource, /function stopBackgroundTask|file_extra_info\.(?:scan|stop)/);
});
