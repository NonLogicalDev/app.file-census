import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const shellSource = readFileSync(join(componentsDir, 'Shell.jsx'), 'utf8');

test('sidebar persists its collapsed state and bounded width without assuming storage is available', () => {
  assert.match(shellSource, /SIDEBAR_HIDDEN_STORAGE_KEY = 'file-census\.sidebar\.hidden'/);
  assert.match(shellSource, /SIDEBAR_WIDTH_STORAGE_KEY = 'file-census\.sidebar\.width'/);
  assert.match(shellSource, /try \{[\s\S]*?window\.localStorage\.getItem\(key\)/);
  assert.match(shellSource, /try \{[\s\S]*?window\.localStorage\.setItem\(key, value\)/);
  assert.match(shellSource, /useState\(readStoredSidebarHidden\)/);
  assert.match(shellSource, /useState\(readStoredSidebarWidth\)/);
  assert.match(shellSource, /writeSidebarPreference\(SIDEBAR_HIDDEN_STORAGE_KEY, String\(sidebarHidden\)\)/);
  assert.match(shellSource, /writeSidebarPreference\(SIDEBAR_WIDTH_STORAGE_KEY, String\(sidebarWidth\)\)/);
});

test('sidebar uses an accessible pointer and keyboard resize separator whenever the sidebar is visible (incl. hover peek)', () => {
  // Resize works in the hover/peek overlay too; the peek is held open while a
  // drag is in flight (user request 2026-07-19).
  assert.match(shellSource, /const sidebarResizeDisabled = !sidebarVisuallyOpen && !sidebarPeeking/);
  assert.match(shellSource, /if \(!sidebarResizeSession\.current\) setSidebarPeeking\(false\)/);
  assert.match(shellSource, /role="separator"/);
  assert.match(shellSource, /aria-valuemin=\{SIDEBAR_MIN_WIDTH\}/);
  assert.match(shellSource, /aria-valuemax=\{SIDEBAR_MAX_WIDTH\}/);
  assert.match(shellSource, /aria-valuenow=\{sidebarWidth\}/);
  assert.match(shellSource, /onPointerDown=\{startSidebarResize\}/);
  assert.match(shellSource, /onPointerMove=\{moveSidebarResize\}/);
  assert.match(shellSource, /onPointerUp=\{finishSidebarResize\}/);
  assert.match(shellSource, /event\.key === 'ArrowLeft'/);
  assert.match(shellSource, /event\.key === 'ArrowRight'/);
  assert.match(shellSource, /event\.key === 'Home'/);
  assert.match(shellSource, /event\.key !== 'End'/);
  assert.match(shellSource, /'--sidebar-width': `\$\{sidebarWidth\}px`/);
});

test('inspector right rail is a resizable shell column', () => {
  assert.match(shellSource, /RAIL_WIDTH_STORAGE_KEY/);
  assert.match(shellSource, /clampRailWidth/);
  assert.match(shellSource, /'--inspector-width': `\$\{railWidth\}px`/);
  assert.match(shellSource, /onPointerDown=\{startRailResize\}/);
  assert.match(shellSource, /aria-label="Resize inspector"/);
  assert.match(shellSource, /aria-label="Inspector rail"/);
});

test('collapsed inspector peeks from the right edge with resize held open', () => {
  // Mirror of the sidebar's hidden/peek pattern, on the right edge.
  assert.match(shellSource, /railHoverZoneClassName/);
  assert.match(shellSource, /appRightRailOverlayClassName/);
  assert.match(shellSource, /aria-label="Show inspector"/);
  assert.match(shellSource, /setRailPeeking\(true\)/);
  assert.match(shellSource, /if \(!railResizeSession\.current\) setRailPeeking\(false\)/);
  assert.match(shellSource, /rightRail && !rightRailOpen/);
});
