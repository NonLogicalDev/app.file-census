import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');

test('production Cmd-K groups are derived from live routes, locations, scans, and current-view callbacks', () => {
  assert.match(appSource, /const currentViewCommands = \[\]/);
  assert.match(appSource, /id: 'navigation'/);
  assert.match(appSource, /onSelect: \(\) => setTab\('dashboard'\)/);
  assert.match(appSource, /commands: locationList\.map\(\(location\)/);
  assert.match(appSource, /commands: scans\.map\(\(scan\)/);
  assert.match(appSource, /id: 'current-view'/);
  assert.match(appSource, /onSelect: \(\) => void refresh\(\)/);
  assert.match(appSource, /onSelect: \(\) => setShowAddLocation\(true\)/);
});

test('production actions do not call the unavailable pause, resume, or repair RPCs', () => {
  assert.doesNotMatch(appSource, /scans\.(?:pause|resume|repair)/);
  assert.doesNotMatch(appSource, /function (?:pauseScan|resumeScan|startRepairScan)/);
});

test('dashboard and task pages receive live parent state and a real stop callback', () => {
  assert.match(appSource, /liveScans=\{runningProgress\}/);
  assert.match(appSource, /activityState=\{dashboardActivityState\}/);
  assert.match(appSource, /onStopScan=\{stopScan\}/);
});
