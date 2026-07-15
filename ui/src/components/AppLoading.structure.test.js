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

test('scan tree rows are keyed to the current scan, path, query, filters, depth, and page', () => {
  assert.match(appSource, /const treeRequestKeyRef = useRef\(''\)/);
  assert.match(appSource, /function treeRequestKey\(/);
  assert.match(appSource, /scan_id: scanId \|\| ''/);
  assert.match(appSource, /filters: canonicalTreeFilterKey\(filters\)/);
  assert.match(appSource, /const requestedTreeKey = treeRequestKey\(\{/);
  assert.match(appSource, /if \(previousTreeKey !== requestedTreeKey\) \{\s*setTreeEntries\(\[\]\);/s);
  assert.match(appSource, /treeRequestKeyRef\.current !== requestedTreeKey/);
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
  assert.match(appSource, /function stopScan\(scanId\)/);
  assert.match(appSource, /markScanControlStatus\(scanId, 'stopping', 'Stop requested'\)/);
  assert.match(appSource, /appEvent\.kind === 'scan_stop_requested'/);
  assert.match(appSource, /appEvent\.payload\?\.stop_requested/);
  assert.match(fileExplorerSource, /activeScan\.status === 'stopping' \? 'Stopping' : 'Stop'/);
});

test('file extra info events are tracked as background tasks', () => {
  assert.match(appSource, /file_extra_info_/);
  assert.match(appSource, /updateFileExtraInfoTask/);
  assert.match(appSource, /file_extra_info\.scan/);
});
