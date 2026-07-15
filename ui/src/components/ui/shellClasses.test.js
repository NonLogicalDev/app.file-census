import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appMainClassName,
  appShellClassName,
  appSidebarClassName,
  clampSidebarWidth,
  eventStripClassName,
  eventStripStatusClassName,
  headerActionsClassName,
  connectionLedClassName,
  locationLedClassName,
  metricItemClassName,
  metricLabelClassName,
  metricsClassName,
  metricValueClassName,
  navIconClassName,
  navIconSvgClassName,
  pageActionsListClassName,
  pageActionsMenuClassName,
  pageActionsPanelClassName,
  pageActionsPanelTitleClassName,
  pageActionsTriggerClassName,
  shellMessageClassName,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  sidebarActivityClassName,
  sidebarBrandClassName,
  sidebarBrandSubtitleClassName,
  sidebarConnectionPillClassName,
  sidebarDisclosureClassName,
  sidebarEmptyClassName,
  sidebarFooterClassName,
  sidebarHoverZoneClassName,
  sidebarIconButtonClassName,
  sidebarLocationBodyClassName,
  sidebarLocationClassName,
  sidebarLocationGroupClassName,
  sidebarLocationListClassName,
  sidebarLocationMetaClassName,
  sidebarLocationRowClassName,
  sidebarNavButtonClassName,
  sidebarNavClassName,
  sidebarOverlayCloseClassName,
  sidebarOptionsButtonClassName,
  sidebarProgressClassName,
  sidebarProgressPathClassName,
  sidebarResizeHandleClassName,
  sidebarScanBodyClassName,
  sidebarScanClassName,
  sidebarScanListClassName,
  sidebarScanStatusClassName,
  sidebarSectionClassName,
  sidebarSectionTitleClassName,
  sidebarSpacerClassName,
  sidebarWindowControlsClassName,
  topbarDescriptionClassName,
  topbarSidebarToggleClassName,
  topbarTitleClassName,
  topbarTitleCopyClassName,
  topbarTitleHeadingClassName,
  trafficDotClassName,
  topProgressBandClassName,
  topProgressCardClassName,
  topProgressCardMainClassName,
  topProgressLocationNameClassName,
  topProgressMetaClassName,
  topProgressPathClassName,
  topProgressStatusClassName,
  topProgressTitleClassName,
  workspaceHeaderClassName
} from './shellClasses.js';

test('overview metrics helpers preserve compact top metrics', () => {
  assert.match(metricsClassName, /flex/);
  assert.match(metricsClassName, /flex-wrap/);
  assert.match(metricItemClassName, /items-baseline/);
  assert.match(metricValueClassName, /truncate/);
  assert.match(metricValueClassName, /text-\[0\.92rem\]/);
  assert.match(metricLabelClassName, /text-muted/);
});

test('message and event strip helpers preserve status callouts', () => {
  assert.match(shellMessageClassName, /border-l-\[3px\]/);
  assert.match(shellMessageClassName, /bg-accent-soft/);
  assert.match(eventStripClassName, /text-muted/);
  assert.match(eventStripStatusClassName({ live: false }), /bg-surface-muted/);
  assert.match(eventStripStatusClassName({ live: true }), /bg-accent-soft/);
  assert.match(eventStripStatusClassName({ live: true }), /text-accent/);
});

test('top progress helpers keep cards bounded for long paths', () => {
  assert.match(topProgressBandClassName, /grid/);
  assert.match(topProgressCardClassName, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(topProgressCardClassName, /border-l-4/);
  assert.match(topProgressCardMainClassName, /min-w-0/);
  assert.match(topProgressTitleClassName, /truncate/);
  assert.match(topProgressLocationNameClassName, /text-muted/);
  assert.match(topProgressMetaClassName, /truncate/);
  assert.match(topProgressPathClassName, /min-h-\[1\.35rem\]/);
  assert.match(topProgressPathClassName, /truncate/);
  assert.match(topProgressStatusClassName, /rounded-full/);
});

test('shell icon and status helpers preserve compact indicator styling', () => {
  assert.match(trafficDotClassName('red'), /h-3/);
  assert.match(trafficDotClassName('red'), /bg-\[#ff5f57\]/);
  assert.match(trafficDotClassName('yellow'), /bg-\[#febc2e\]/);
  assert.match(trafficDotClassName('green'), /bg-\[#28c840\]/);

  assert.match(connectionLedClassName({ live: false }), /h-\[0\.55rem\]/);
  assert.match(connectionLedClassName({ live: false }), /bg-\[#7a746c\]/);
  assert.match(connectionLedClassName({ live: true }), /bg-accent-line/);
  assert.match(connectionLedClassName({ live: true }), /shadow-\[0_0_0_3px/);

  assert.match(locationLedClassName({ connected: false }), /h-\[0\.62rem\]/);
  assert.match(locationLedClassName({ connected: true }), /bg-accent-line/);
  assert.match(locationLedClassName({ connected: true }), /shadow-\[0_0_0_3px/);
  assert.match(locationLedClassName({ connected: true, compact: true }), /h-\[0\.56rem\]/);

  assert.match(navIconClassName, /h-6/);
  assert.match(navIconClassName, /w-6/);
  assert.match(navIconSvgClassName, /h-\[15px\]/);
  assert.match(navIconSvgClassName, /w-\[15px\]/);
});

test('shell topbar helpers preserve responsive page chrome', () => {
  assert.match(appMainClassName, /col-start-2/);
  assert.match(appMainClassName, /w-\[min\(100%,1560px\)\]/);
  assert.match(appMainClassName, /max-\[960px\]:w-\[min\(100vw_-_20px,1380px\)\]/);
  assert.match(workspaceHeaderClassName, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(workspaceHeaderClassName, /border-b/);
  assert.match(workspaceHeaderClassName, /max-\[960px\]:gap-2\.5/);
  assert.match(topbarTitleClassName, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(topbarTitleCopyClassName, /min-w-0/);
  assert.match(topbarTitleHeadingClassName, /truncate/);
  assert.match(topbarDescriptionClassName, /mt-\[7px\]/);
  assert.match(topbarDescriptionClassName, /text-muted/);
  assert.match(topbarSidebarToggleClassName, /!\w-\[34px\]/);
  assert.match(headerActionsClassName, /!relative/);
  assert.match(headerActionsClassName, /!justify-self-end/);
  assert.match(headerActionsClassName, /max-\[960px\]:!gap-2/);

  assert.match(pageActionsMenuClassName, /static/);
  assert.match(pageActionsTriggerClassName({ open: false }), /!h-\[38px\]/);
  assert.match(pageActionsTriggerClassName({ open: true }), /!bg-\[var\(--sidebar-surface\)\]/);
  assert.match(pageActionsPanelClassName, /!w-\[min\(300px,calc\(100vw-28px\)\)\]/);
  assert.match(pageActionsPanelClassName, /!right-0/);
  assert.match(pageActionsPanelTitleClassName, /!uppercase/);
  assert.match(pageActionsListClassName, /grid/);
});

test('sidebar shell helpers preserve desktop, hidden, and compact layout states', () => {
  assert.match(appShellClassName({ sidebarHidden: false, compactSidebar: false }), /grid-cols-\[var\(--sidebar-width\)_minmax\(0,1fr\)\]/);
  assert.match(appShellClassName({ sidebarHidden: true, compactSidebar: false }), /grid-cols-\[var\(--sidebar-peek-width\)_minmax\(0,1fr\)\]/);
  assert.match(appShellClassName({ sidebarHidden: false, compactSidebar: true }), /grid-cols-\[var\(--sidebar-peek-width\)_minmax\(0,1fr\)\]/);

  assert.match(appSidebarClassName({ sidebarHidden: false, sidebarPeeking: false, compactSidebar: false }), /sticky/);
  assert.match(appSidebarClassName({ sidebarHidden: false, sidebarPeeking: false, compactSidebar: false }), /w-\[var\(--sidebar-width\)\]/);
  assert.match(appSidebarClassName({ sidebarHidden: true, sidebarPeeking: false, compactSidebar: false }), /fixed/);
  assert.match(appSidebarClassName({ sidebarHidden: true, sidebarPeeking: false, compactSidebar: false }), /translate-x-\[calc\(-100%\+var\(--sidebar-peek-width\)\)\]/);
  assert.match(appSidebarClassName({ sidebarHidden: true, sidebarPeeking: true, compactSidebar: false }), /translate-x-0/);
  assert.match(appSidebarClassName({ sidebarHidden: false, sidebarPeeking: false, compactSidebar: true }), /w-\[min\(var\(--sidebar-width\),calc\(100vw-44px\)\)\]/);
  assert.match(sidebarResizeHandleClassName({ disabled: false }), /cursor-col-resize/);
  assert.match(sidebarResizeHandleClassName({ disabled: false }), /min-\[961px\]:block/);
  assert.doesNotMatch(sidebarResizeHandleClassName({ disabled: true }), /min-\[961px\]:block/);
  assert.match(sidebarResizeHandleClassName({ resizing: true }), /after:bg-accent-line/);

  assert.match(sidebarHoverZoneClassName({ visible: false }), /hidden/);
  assert.match(sidebarHoverZoneClassName({ visible: true, peeking: false }), /fixed/);
  assert.match(sidebarHoverZoneClassName({ visible: true, peeking: true }), /pointer-events-none/);
  assert.match(sidebarWindowControlsClassName({ compactSidebar: true }), /hidden/);
  assert.match(sidebarOverlayCloseClassName({ visible: true }), /!inline-flex/);
});

test('sidebar width helper retains a stable default and clamps pointer or keyboard values', () => {
  assert.equal(SIDEBAR_MIN_WIDTH, 232);
  assert.equal(SIDEBAR_DEFAULT_WIDTH, 292);
  assert.equal(SIDEBAR_MAX_WIDTH, 440);
  assert.equal(clampSidebarWidth('invalid'), SIDEBAR_DEFAULT_WIDTH);
  assert.equal(clampSidebarWidth(1), SIDEBAR_MIN_WIDTH);
  assert.equal(clampSidebarWidth(999), SIDEBAR_MAX_WIDTH);
  assert.equal(clampSidebarWidth(300.6), 301);
});

test('sidebar navigation helpers preserve compact Codex-like navigation', () => {
  assert.match(sidebarBrandClassName, /grid/);
  assert.match(sidebarBrandSubtitleClassName, /text-\[color:var\(--sidebar-muted\)\]/);
  assert.match(sidebarNavClassName, /grid/);
  assert.match(sidebarNavButtonClassName({ active: false }), /grid-cols-\[24px_minmax\(0,1fr\)\]/);
  assert.match(sidebarNavButtonClassName({ active: true }), /bg-\[var\(--sidebar-active\)\]/);
  assert.match(sidebarSectionClassName, /min-h-0/);
  assert.match(sidebarSectionTitleClassName, /uppercase/);
  assert.match(sidebarIconButtonClassName, /!h-\[25px\]/);
  assert.match(sidebarLocationListClassName, /overflow-auto/);
  assert.match(sidebarEmptyClassName, /text-\[color:var\(--sidebar-muted\)\]/);
});

test('sidebar location and scan helpers preserve selected, disabled, and active states', () => {
  assert.match(sidebarLocationGroupClassName({ disabled: true }), /grayscale/);
  assert.match(sidebarLocationRowClassName, /grid-cols-\[24px_minmax\(0,1fr\)\]/);
  assert.match(sidebarDisclosureClassName, /place-items-center/);
  assert.match(sidebarLocationClassName({ selected: true }), /bg-\[var\(--sidebar-active\)\]/);
  assert.match(sidebarLocationClassName({ hasSelectedScan: true }), /bg-\[rgb\(255_255_255_\/_0\.035\)\]/);
  assert.match(sidebarLocationClassName({ disabled: true }), /grayscale/);
  assert.match(sidebarLocationBodyClassName, /\[&_strong\]:truncate/);
  assert.match(sidebarLocationMetaClassName, /justify-items-end/);

  assert.match(sidebarScanListClassName, /border-l/);
  const selectedActiveScan = sidebarScanClassName({ selected: true, active: true });
  assert.match(selectedActiveScan, /!bg-\[var\(--sidebar-active\)\]/);
  assert.match(selectedActiveScan, /inset_3px_0_0_var\(--accent-line\)/);
  assert.doesNotMatch(selectedActiveScan, /hover:!bg-\[var\(--sidebar-surface-hover\)\]/);
  assert.doesNotMatch(selectedActiveScan, /data-\[active=true\]:bg-transparent/);
  assert.match(sidebarScanStatusClassName({ active: true }), /bg-\[rgb\(54_179_126_\/_0\.14\)\]/);
  assert.match(sidebarScanStatusClassName({ selected: true }), /text-\[color:var\(--sidebar-text\)\]/);
  assert.match(sidebarScanBodyClassName, /\[&_small\]:text-\[color:var\(--sidebar-muted\)\]/);
});

test('sidebar activity and footer helpers preserve bounded progress and options area', () => {
  assert.match(sidebarActivityClassName, /flex-none/);
  assert.match(sidebarProgressClassName, /overflow-hidden/);
  assert.match(sidebarProgressPathClassName, /truncate/);
  assert.match(sidebarSpacerClassName, /flex-1/);
  assert.match(sidebarFooterClassName, /border-t/);
  assert.match(sidebarConnectionPillClassName, /!text-\[color:var\(--sidebar-muted\)\]/);
  assert.match(sidebarOptionsButtonClassName({ active: false }), /w-full/);
  assert.match(sidebarOptionsButtonClassName({ active: true }), /bg-\[var\(--sidebar-active\)\]/);
});
