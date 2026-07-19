import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(uiSrc, 'App.jsx'), 'utf8');

function lagRecoverySource() {
  const start = appSource.indexOf('function scheduleLagRecovery()');
  const end = appSource.indexOf('async function hydrateProgress', start);
  assert.notEqual(start, -1, 'lag recovery should remain App-owned');
  assert.notEqual(end, -1, 'lag recovery helper boundary should remain present');
  return appSource.slice(start, end);
}

function authoritativeLagRefresh() {
  const start = appSource.indexOf('async function refreshAuthoritativelyAfterEventLag(');
  const end = appSource.indexOf('\n\nexport default function App()', start);
  assert.notEqual(start, -1, 'authoritative lag refresh helper should remain App-owned');
  assert.notEqual(end, -1, 'authoritative lag refresh helper should remain before App');
  return new Function(`${appSource.slice(start, end)}; return refreshAuthoritativelyAfterEventLag;`)();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test('lag recovery invalidates stale file-facing state before authoritative reload', () => {
  const source = lagRecoverySource();

  assert.match(source, /void recoverFromEventLag\(\);/);
  assert.match(source, /function clearFileFacingStateAfterLag\(\) \{[\s\S]*?invalidateSearchRequest\(\);/);
  assert.match(source, /treeRequestId\.current \+= 1;/);
  assert.match(source, /treeAbortController\.current\?\.abort\(\);/);
  assert.match(source, /setTreeEntries\(\[\]\);/);
  assert.match(source, /clearDirectoryTree\(\);/);
  assert.match(source, /setDeleteCheck\(null\);/);
  assert.match(source, /setDeleteCheckPath\(''\);/);
  assert.match(source, /setSelectedGridPaths\(\[\]\);/);
  assert.match(source, /setFileInfo\(null\);/);
  assert.match(source, /setShowFileInfo\(false\);/);
  assert.match(source, /setShowBuildThumbnails\(false\);/);
  assert.match(source, /deleteCheck: null,[\s\S]*?deleteCheckPath: '',[\s\S]*?selectedGridPaths: \[\]/);
});

test('lag recovery reloads only the active search route with its live query and scope', () => {
  const source = lagRecoverySource();

  assert.match(source, /async function recoverFromEventLag\(\) \{[\s\S]*?clearFileFacingStateAfterLag\(\);[\s\S]*?await refreshAuthoritativelyAfterEventLag\(\(\) => refreshRef\.current\?\.\(\), refreshPromise\);/);
  assert.match(source, /state\.activeTab === 'search'[\s\S]*?String\(state\.query \?\? ''\)\.trim\(\)[\s\S]*?state\.searchFilters\?\.length/);
  assert.match(source, /searchRef\.current\?\.\(\{[\s\S]*?replaceRoute: true,[\s\S]*?query: state\.query,[\s\S]*?filters: state\.searchFilters,[\s\S]*?scanIds: state\.selectedSearchScanIds,[\s\S]*?allScans: state\.searchAllScans/);
});

test('lag recovery restores directory-only navigation for the visible file tree', () => {
  const source = lagRecoverySource();

  // The scan browser always shows the directory tree (Browse view), so lag
  // recovery reloads it whenever a locations scan is selected — no longer gated
  // on the retired 'tree' subview.
  assert.match(source, /state\.activeTab === 'locations' && state\.selectedScanId/);
  assert.match(source, /await ensureDirectoryTreePath\(state\.selectedPath\);/);
});

test('lag recovery starts a post-lag refresh after an in-flight pre-lag refresh settles', async () => {
  const refreshAfterLag = authoritativeLagRefresh();
  const preLagRefresh = deferred();
  const refreshPromiseRef = { current: null };
  const refreshStarts = [];

  const inFlightPreLagRefresh = preLagRefresh.promise.finally(() => {
    refreshPromiseRef.current = null;
  });
  refreshPromiseRef.current = inFlightPreLagRefresh;

  const refresh = () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const snapshot = { generation: refreshStarts.length + 1 };
    refreshStarts.push(snapshot);
    const nextRefresh = Promise.resolve(snapshot).finally(() => {
      refreshPromiseRef.current = null;
    });
    refreshPromiseRef.current = nextRefresh;
    return nextRefresh;
  };

  const recovery = refreshAfterLag(refresh, refreshPromiseRef);
  assert.deepEqual(refreshStarts, [], 'recovery waits for the pre-lag refresh instead of sharing it');

  preLagRefresh.resolve({ generation: 'stale' });
  assert.deepEqual(await recovery, { generation: 1 });
  assert.deepEqual(refreshStarts, [{ generation: 1 }], 'recovery starts a new authoritative refresh after the stale one');
});
