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

test('production wires the real pause, resume, and repair scan control RPCs', () => {
  // These were restored in plan-068; the actions now call real backend RPCs.
  assert.match(appSource, /rpc\('scans\.pause'/);
  assert.match(appSource, /rpc\('scans\.resume'/);
  assert.match(appSource, /rpc\('scans\.repair'/);
  assert.match(appSource, /async function pauseScan\(/);
  assert.match(appSource, /async function resumeScan\(/);
  assert.match(appSource, /async function startRepairScan\(/);
});

test('dashboard and task pages receive live parent state and a real stop callback', () => {
  assert.match(appSource, /liveScans=\{runningProgress\}/);
  assert.match(appSource, /activityState=\{dashboardActivityState\}/);
  assert.match(appSource, /onStopScan=\{stopScan\}/);
});
