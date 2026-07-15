import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const shellSource = readFileSync(join(componentsDir, 'Shell.jsx'), 'utf8');

test('shell keeps the route title stable while rendering compact active location context', () => {
  assert.match(shellSource, /topbarDescriptionClassName/);
  assert.match(shellSource, /function headerContext\(activeTab, location, selectedScanId\)/);
  assert.match(shellSource, /return `\$\{locationLabel\} · \$\{scanLabel\(selectedScan\)\}`/);
  assert.match(shellSource, /return locationLabel/);
  assert.doesNotMatch(shellSource, /if \(activeTab === 'locations' && location\) return location\.name \|\| location\.slug/);
});

test('sidebar is an identity-and-selection tree rather than a duplicate scan inspector', () => {
  assert.match(shellSource, /onSelectScan\(scanId, location\.slug\)/);
  assert.match(shellSource, /location\.scans\.map\(\(scan\) => \(/);
  assert.match(shellSource, /<strong>\{scanLabel\(scan\)\}<\/strong>/);
  assert.doesNotMatch(shellSource, /scanDetail\(scan\) - \{bytes\(scan\.total_bytes\)\}/);
  assert.match(shellSource, /location\.scanCount === 1 \? 'scan' : 'scans'/);
});
