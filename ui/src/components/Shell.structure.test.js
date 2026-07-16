import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const shellSource = readFileSync(join(componentsDir, 'Shell.jsx'), 'utf8');

test('shell owns the visible top-bar command trigger while preserving the sidebar toggle', () => {
  assert.match(shellSource, /import \{ CommandPalette \} from '\.\/command-palette\/index\.js';/);
  assert.match(shellSource, /commandGroups = \[\]/);
  assert.match(shellSource, /<CommandPalette[\s\S]*?groups=\{commandGroups\}/);
  assert.match(shellSource, /shortcutLabel="⌘K"/);
  assert.match(shellSource, /onClick=\{toggleSidebar\}/);
});

test('shell keeps the route title stable while rendering compact active location context', () => {
  assert.match(shellSource, /topbarDescriptionClassName/);
  assert.match(shellSource, /function headerContext\(activeTab, location, selectedScanId\)/);
  assert.match(shellSource, /return `\$\{locationLabel\} · \$\{scanLabel\(selectedScan\)\}`/);
  assert.match(shellSource, /return locationLabel/);
  assert.doesNotMatch(shellSource, /if \(activeTab === 'locations' && location\) return location\.name \|\| location\.slug/);
});

test('sidebar is an identity-and-selection tree rather than a duplicate scan inspector', () => {
  // Location nodes select scans through the real callback and render scans as a
  // compact identity tree (label + status dot), not duplicate-inspector detail.
  assert.match(shellSource, /onSelectScan\(scanId, location\.slug\)/);
  assert.match(shellSource, /location\.scans\.map\(\(scan\) =>/);
  assert.match(shellSource, /scanLabel\(scan\)/);
  assert.match(shellSource, /SidebarLocationNode/);
  assert.doesNotMatch(shellSource, /scanDetail\(scan\)/);
});
