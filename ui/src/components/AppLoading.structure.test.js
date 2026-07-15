import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');
const locationsSource = readFileSync(join(uiSrc, 'pages', 'LocationsPage.jsx'), 'utf8');
const fileExplorerSource = readFileSync(join(uiSrc, 'components', 'FileExplorer.jsx'), 'utf8');
const scanScopeSelectorSource = readFileSync(join(uiSrc, 'components', 'search', 'ScanScopeSelector.jsx'), 'utf8');
const searchSource = readFileSync(join(uiSrc, 'pages', 'SearchPage.jsx'), 'utf8');
const duplicatesSource = readFileSync(join(uiSrc, 'pages', 'DuplicatesPage.jsx'), 'utf8');

test('app tracks loading as data state for refresh, tree, search, and duplicate loads', () => {
  assert.match(appSource, /const \[refreshing, setRefreshing\] = useState\(false\)/);
  assert.match(appSource, /const \[treeLoading, setTreeLoading\] = useState\(false\)/);
  assert.match(appSource, /const \[searchLoading, setSearchLoading\] = useState\(false\)/);
  assert.match(appSource, /const \[duplicatesLoading, setDuplicatesLoading\] = useState\(false\)/);
  assert.match(appSource, /locationsLoading: refreshing && !locationList\.length/);
  assert.match(appSource, /filesLoading: treeLoading/);
  assert.match(appSource, /loading=\{duplicatesLoading \|\| \(refreshing && !scans\.length && !dupes\.length\)\}/);
  assert.match(appSource, /loading=\{searchLoading\}/);
});

test('pages render loading text instead of false empty states', () => {
  assert.match(locationsSource, /Loading locations/);
  assert.match(fileExplorerSource, /Loading files/);
  assert.match(searchSource, /Searching files/);
  assert.match(scanScopeSelectorSource, /Loading scans/);
  assert.match(duplicatesSource, /Loading duplicates/);
});

test('scan tree responses only adopt the current scan and path, and filter commits reload that scope', () => {
  assert.match(appSource, /const treeRequestId = useRef\(0\)/);
  assert.match(appSource, /const requestId = \+\+treeRequestId\.current;/);
  assert.match(appSource, /treeAbortController\.current\?\.abort\(\);/);
  assert.match(appSource, /query: buildFileSearchQuery\(latest\.current\.query, latest\.current\.searchFilters\)/);
  assert.match(appSource, /requestId !== treeRequestId\.current \|\| latest\.current\.selectedScanId !== requestedScanId \|\| latest\.current\.selectedPath !== requestedPath/);
  assert.match(appSource, /function commitSearchState[\s\S]*?latest\.current\.activeTab === 'locations'[\s\S]*?loadTreeRef\.current\?\.\(latest\.current\.selectedPath/);
  assert.match(appSource, /function addSearchFilterForCurrentView[\s\S]*?commitSearchState\(\{ filters: nextFilters \}\);/);
  assert.match(appSource, /function removeSearchFilterForCurrentView[\s\S]*?commitSearchState\(\{ filters: nextFilters \}\);/);
  assert.match(appSource, /function groupSearchFiltersForCurrentView[\s\S]*?commitSearchState\(\{ filters: nextFilters \}\);/);
});

test('destructive scan and location requests are guarded against active scans', () => {
  assert.match(appSource, /function requestDeleteScan\(scanId\)/);
  assert.match(appSource, /function requestDeleteLocation\(slug\)/);
  assert.match(appSource, /isActiveStatus\(scanView\(scan\)\.status\)/);
  assert.match(appSource, /locationView\(location\)\.activeScan/);
  assert.doesNotMatch(appSource, /onRequestDeleteLocation: setConfirmDeleteLocationSlug/);
  assert.doesNotMatch(appSource, /onRequestDeleteScan: setConfirmDeleteScanId/);
});

test('stop scan acknowledgements immediately mark scans as stopping', () => {
  assert.match(appSource, /const markScanControlStatus = useCallback\(/);
  assert.match(appSource, /function stopScan\(scanId\)/);
  assert.match(appSource, /const result = await rpc\('scans\.stop', \{ scan_id: scanId \}\);/);
  assert.match(appSource, /markScanControlStatus\(scanId, 'stopping', 'Stop requested'\)/);
  assert.match(appSource, /appEvent\.kind === 'scan_stop_requested' && appEvent\.payload\?\.scan_id && appEvent\.payload\?\.stop_requested/);
  assert.match(fileExplorerSource, /statusLabel\(activeScan\.status\)/);
});

test('folder browsing is scan-scoped rather than location-root-relative', () => {
  assert.match(appSource, /async function browseCurrentFolder\(location\) \{[\s\S]*?const scanId = latest\.current\.selectedScanId/);
  assert.match(appSource, /rpc\('scans\.open_folder', \{[\s\S]*?scan_id: scanId,[\s\S]*?path: latest\.current\.selectedPath \|\| null/);
  assert.doesNotMatch(appSource, /rpc\('locations\.open_folder'/);
});

test('recovery UI does not invent an unsupported file-extra-info transport', () => {
  // The recovered backend has no file-extra-info RPC; exposing one would lie about its progress.
  assert.doesNotMatch(appSource, /file_extra_info\.scan/);
  assert.doesNotMatch(appSource, /updateFileExtraInfoTask/);
});
