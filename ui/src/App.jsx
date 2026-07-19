import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseDatabase, chooseFolder, databaseInfo as loadDatabaseInfo, isTauriRuntime } from './api/desktopDatabase.js';
import { requireTreePage } from './api/treePage.js';
import { useRpcConnection } from './api/useRpcConnection.js';
import AppModals from './components/AppModals.jsx';
import {
  DIRECTORY_TREE_PAGE_LIMIT,
  directoryAncestorPaths,
  directoryTreeScopeKey,
  mergeDirectoryTreePage
} from './components/directoryTree.js';
import { Icon } from './components/Icon.jsx';
import Shell from './components/Shell.jsx';
import { Button } from './components/ui/index.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DuplicatesPage from './pages/DuplicatesPage.jsx';
import LocationsPage from './pages/LocationsPage.jsx';
import OptionsPage from './pages/OptionsPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import { isUserVisibleEvent } from './utils/events.js';
import { isActiveStatus } from './utils/format.js';
import {
  addSearchFilter,
  buildFileSearchQuery,
  decodeSearchFilters,
  encodeSearchFilters,
  fileMatchesSearch,
  groupSearchFilters,
  removeSearchFilter
} from './utils/searchFilters.js';

const fileColumns = [
  ['name', 'Name'],
  ['size', 'Size'],
  ['file_count', 'Files'],
  ['duplicate_file_count', 'Dup'],
  ['original_file_count', 'Uniq'],
  ['same_scan_duplicate_file_count', 'Scan Dup'],
  ['blake3', 'BLAKE3'],
  ['ctime', 'CTime'],
  ['mtime', 'Modified'],
  ['mode', 'Mode'],
  ['sha256', 'SHA-256']
];

const defaultColumns = ['name', 'size', 'file_count', 'duplicate_file_count', 'original_file_count', 'same_scan_duplicate_file_count', 'blake3', 'ctime', 'mtime'];
const MAX_AUTO_DIRECTORY_TREE_DEPTH = 4;

async function refreshAuthoritativelyAfterEventLag(refresh, refreshPromiseRef) {
  const preLagRefresh = refreshPromiseRef.current;
  if (preLagRefresh) {
    try {
      await preLagRefresh;
    } catch {
      // A new refresh below is the authoritative recovery path.
    }
  }
  return refresh();
}

export default function App() {
  const [overview, setOverview] = useState(null);
  const [locations, setLocations] = useState([]);
  const [scans, setScans] = useState([]);
  const [dupes, setDupes] = useState([]);
  const [selectedDuplicateScanIds, setSelectedDuplicateScanIds] = useState([]);
  const [duplicateView, setDuplicateViewState] = useState('flat');
  const [searchAllScans, setSearchAllScans] = useState(false);
  const [selectedSearchScanIds, setSelectedSearchScanIds] = useState([]);
  const [results, setResults] = useState([]);
  const [scanProgress, setScanProgress] = useState({});
  const [treeEntries, setTreeEntries] = useState([]);
  const [directoryTreeNodes, setDirectoryTreeNodes] = useState({});
  const [directoryTreeScope, setDirectoryTreeScope] = useState('');
  const [directoryTreeExpandedPaths, setDirectoryTreeExpandedPaths] = useState(['']);
  const [directoryTreeLoadingPaths, setDirectoryTreeLoadingPaths] = useState([]);
  const [deleteCheck, setDeleteCheck] = useState(null);
  const [selectedGridPaths, setSelectedGridPaths] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState(null);
  const [selectedScanId, setSelectedScanId] = useState(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [scanSubview, setScanSubviewState] = useState('files');
  const [pathHistory, setPathHistory] = useState(['']);
  const [pathHistoryIndex, setPathHistoryIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [showScanNotes, setShowScanNotes] = useState(false);
  const [showScanExcludes, setShowScanExcludes] = useState(false);
  const [showFileInfo, setShowFileInfo] = useState(false);
  const [showBuildThumbnails, setShowBuildThumbnails] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const [confirmDeleteScanId, setConfirmDeleteScanId] = useState(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState(null);
  const [confirmDeleteLocationSlug, setConfirmDeleteLocationSlug] = useState(null);
  const [form, setForm] = useState({ kind: 'local', name: '', slug: '', root_path: '', notes: '' });
  const [editForm, setEditForm] = useState({ slug: '', kind: 'local', name: '', root_path: '', notes: '' });
  const [scanNotesForm, setScanNotesForm] = useState({ scan_id: '', notes: '' });
  const [scanExcludesForm, setScanExcludesForm] = useState({ scan_id: '', patterns: '' });
  const [deleteCheckPath, setDeleteCheckPath] = useState('');
  const [deleteCheckStaged, setDeleteCheckStaged] = useState([]);
  const [scanStartForm, setScanStartForm] = useState(null);
  const [buildThumbnailRequest, setBuildThumbnailRequest] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [desktopRuntime] = useState(() => isTauriRuntime());
  const [databaseInfo, setDatabaseInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [message, setMessage] = useState('');

  const latest = useRef({});
  const refreshPromise = useRef(null);
  const treeRequestId = useRef(0);
  const searchRequestId = useRef(0);
  const directoryTreeGeneration = useRef(0);
  const directoryTreeNodesRef = useRef({});
  const directoryTreeScopeRef = useRef('');
  const directoryTreeExpandedPathsRef = useRef(['']);
  const directoryTreeRequests = useRef(new Map());
  const directoryTreeControllers = useRef(new Map());
  const treeReloadTimer = useRef(null);
  const lagRecoveryTimer = useRef(null);
  const lagRecoveryPromise = useRef(null);
  const hydratingProgress = useRef(new Set());
  const refreshRef = useRef(null);
  const loadTreeRef = useRef(null);
  const treeAbortController = useRef(null);
  const rpcRef = useRef(null);
  const searchRef = useRef(null);
  const pendingRouteSearch = useRef(false);
  const scanExcludeRefreshes = useRef(new Map());
  const reconcilingExcludeTrees = useRef(new Set());

  Object.assign(latest.current, { locations, scans, dupes, selectedDuplicateScanIds, duplicateView, searchAllScans, selectedSearchScanIds, scanProgress, selectedLocationSlug, selectedScanId, selectedPath, scanSubview, activeTab, query, searchFilters, pathHistory, pathHistoryIndex, deleteCheck, deleteCheckPath, selectedGridPaths, buildThumbnailRequest, confirmDeletePath, fileInfo });

  const mergeProgress = useCallback((items) => {
    const validItems = (items || []).filter(Boolean);
    if (!validItems.length) return;
    setScanProgress((current) => {
      const next = { ...current };
      for (const item of validItems) next[item.scan_id] = item;
      return next;
    });
    const byId = new Map(validItems.map((item) => [item.scan_id, item]));
    setScans((current) => current.map((scan) => {
      const live = byId.get(scan.id);
      return live ? { ...scan, status: live.status, file_count: live.file_count, dir_count: live.dir_count, error_count: live.error_count, total_bytes: live.total_bytes, finished_at: live.finished_at || scan.finished_at } : scan;
    }));
  }, []);

  const markScanControlStatus = useCallback((scanId, status, message) => {
    const scan = latest.current.scans.find((item) => item.id === scanId);
    const existing = latest.current.scanProgress[scanId];
    const progress = {
      ...existing,
      scan_id: scanId,
      location_slug: existing?.location_slug || scan?.location_slug || '',
      location_name: existing?.location_name || scan?.location_name || scan?.location_slug || '',
      status,
      message,
      file_count: existing?.file_count ?? scan?.file_count ?? 0,
      dir_count: existing?.dir_count ?? scan?.dir_count ?? 0,
      error_count: existing?.error_count ?? scan?.error_count ?? 0,
      total_bytes: existing?.total_bytes ?? scan?.total_bytes ?? 0,
      current_path: existing?.current_path ?? null,
      log: existing?.log || []
    };
    latest.current.scanProgress = { ...latest.current.scanProgress, [scanId]: progress };
    latest.current.scans = latest.current.scans.map((item) => item.id === scanId ? { ...item, status } : item);
    mergeProgress([progress]);
  }, [mergeProgress]);

  const handleEvent = useCallback((appEvent) => {
    if (isUserVisibleEvent(appEvent)) {
      setEventLog((current) => [appEvent, ...current].slice(0, 40));
    }
    if (appEvent.kind === 'events_lagged') {
      scheduleLagRecovery();
    }
    if (appEvent.kind === 'scan_stop_requested' && appEvent.payload?.scan_id && appEvent.payload?.stop_requested) {
      markScanControlStatus(appEvent.payload.scan_id, 'stopping', 'Stop requested');
    }
    if (appEvent.kind === 'scan_log_batch' && appEvent.payload?.scan_id) {
      const payload = appEvent.payload;
      const lines = Array.isArray(payload.lines) ? payload.lines.filter(Boolean) : [];
      if (lines.length) {
        setScanProgress((current) => {
          const existing = current[payload.scan_id];
          const scan = latest.current.scans.find((item) => item.id === payload.scan_id);
          return {
            ...current,
            [payload.scan_id]: existing
              ? { ...existing, log: [...(existing.log || []), ...lines].slice(-200) }
              : { scan_id: payload.scan_id, location_slug: payload.location_slug || scan?.location_slug || '', location_name: scan?.location_name || payload.location_slug || '', status: scan?.status || 'running', file_count: scan?.file_count || 0, dir_count: scan?.dir_count || 0, error_count: scan?.error_count || 0, total_bytes: scan?.total_bytes || 0, current_path: null, log: lines.slice(-200) }
          };
        });
      }
      hydrateProgress(payload.scan_id);
    }
    if (appEvent.kind === 'scan_deleted' && appEvent.payload?.scan_id) {
      setScans((current) => current.filter((scan) => scan.id !== appEvent.payload.scan_id));
      setScanProgress((current) => {
        const next = { ...current };
        delete next[appEvent.payload.scan_id];
        return next;
      });
    }
    if (appEvent.kind === 'scan_log' && appEvent.payload?.scan_id) {
      const payload = appEvent.payload;
      setScanProgress((current) => {
        const existing = current[payload.scan_id];
        const scan = latest.current.scans.find((item) => item.id === payload.scan_id);
        return {
          ...current,
          [payload.scan_id]: existing
            ? { ...existing, log: [...(existing.log || []), payload.line].slice(-200) }
            : { scan_id: payload.scan_id, location_slug: payload.location_slug || scan?.location_slug || '', location_name: scan?.location_name || payload.location_slug || '', status: scan?.status || 'running', file_count: scan?.file_count || 0, dir_count: scan?.dir_count || 0, error_count: scan?.error_count || 0, total_bytes: scan?.total_bytes || 0, current_path: null, log: [payload.line] }
        };
      });
      hydrateProgress(payload.scan_id);
    }
    if (appEvent.kind.startsWith('scan_') && appEvent.payload?.scan_id && appEvent.payload?.status) {
      mergeProgress([appEvent.payload]);
      if (appEvent.payload.scan_id === latest.current.selectedScanId) scheduleTreeReload();
    }
    if (appEvent.kind === 'scan_path_deleted' && appEvent.payload?.scan_id === latest.current.selectedScanId) {
      scheduleTreeReload();
    }
    if (appEvent.kind === 'scan_excludes_updated') {
      void refreshAfterScanExcludesUpdate(appEvent.payload?.scan_id);
    }
    if (appEvent.kind === 'database_changed') {
      setDatabaseInfo(appEvent.payload || null);
      setSelectedLocationSlug(null);
      setSelectedScanId(null);
      setSelectedPath('');
      setScanSubviewState('files');
      setPathHistory(['']);
      setPathHistoryIndex(0);
      setTreeEntries([]);
      setDeleteCheck(null);
      setSelectedGridPaths([]);
      setScanProgress({});
      setTreeLoading(false);
      setSearchLoading(false);
      setDuplicatesLoading(false);
      Object.assign(latest.current, {
        selectedLocationSlug: null,
        selectedScanId: null,
        selectedPath: '',
        scanSubview: 'files',
        pathHistory: [''],
        pathHistoryIndex: 0,
        deleteCheck: null,
        selectedGridPaths: []
      });
    }
    if (['database_changed', 'location_added', 'location_updated', 'location_deleted', 'scan_started', 'scan_update_started', 'scan_repair_started', 'scan_finished', 'scan_stopped', 'scan_failed', 'scan_paused', 'scan_resumed', 'scan_deleted', 'scan_path_deleted', 'scan_representative_set', 'scan_notes_updated', 'scan_recovery_completed'].includes(appEvent.kind)) {
      refreshRef.current?.();
    }
  }, [markScanControlStatus, mergeProgress]);

  const { rpc, status: wsStatus, statusDetail } = useRpcConnection({ onEvent: handleEvent, onOpen: () => refreshRef.current?.() });
  rpcRef.current = rpc;

  useEffect(() => {
    if (!desktopRuntime) return;
    loadDatabaseInfo()
      .then((info) => setDatabaseInfo(info))
      .catch((error) => setMessage(error.message));
  }, [desktopRuntime]);

  const locationBySlug = useCallback((slug) => latest.current.locations.find((location) => location.slug === slug), []);

  const progressFor = useCallback((scanId) => latest.current.scanProgress[scanId], []);

  const scanView = useCallback((scan) => {
    const live = progressFor(scan.id);
    return {
      ...scan,
      ...(live ? live : {}),
      status: live ? live.status : scan.status,
      file_count: live ? live.file_count : scan.file_count,
      dir_count: live ? live.dir_count : scan.dir_count,
      error_count: live ? live.error_count : scan.error_count,
      total_bytes: live ? live.total_bytes : scan.total_bytes,
      current_path: live ? live.current_path || null : null,
      log: live?.log || []
    };
  }, [progressFor]);

  const scansForLocation = useCallback((slug) => latest.current.scans
    .filter((scan) => scan.location_slug === slug)
    .map(scanView)
    .sort((a, b) => {
      const rank = (scan) => (isActiveStatus(scan.status) ? 0 : scan.status === 'complete' ? 1 : 2);
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.started_at || 0) - new Date(a.started_at || 0);
    }), [scanView]);

  const locationView = useCallback((location) => {
    const locationScans = scansForLocation(location.slug);
    const active = locationScans.find((scan) => isActiveStatus(scan.status));
    const representative = locationScans.find((scan) => scan.is_representative);
    const successful = locationScans.find((scan) => scan.status === 'complete');
    return { ...location, scans: locationScans, scanCount: locationScans.length, activeScan: active || null, representativeScan: representative || null, bestScan: active || representative || successful || locationScans[0] || null, lastSuccessfulScan: successful || null };
  }, [scansForLocation]);

  const locationList = useMemo(() => locations.map(locationView).sort((a, b) => a.slug.localeCompare(b.slug)), [locations, scans, scanProgress, locationView]);
  const selectedLocationValue = useMemo(() => locations.find((location) => location.slug === selectedLocationSlug) || null, [locations, selectedLocationSlug]);
  const selectedLocationView = useMemo(() => selectedLocationValue ? locationView(selectedLocationValue) : null, [selectedLocationValue, locationView, scans, scanProgress]);
  const selectedScanView = useMemo(() => {
    const scan = scans.find((item) => item.id === selectedScanId);
    if (!scan || scan.location_slug !== selectedLocationSlug) return null;
    return scanView(scan);
  }, [scans, selectedLocationSlug, selectedScanId, scanProgress, scanView]);
  const activeDirectoryTreeScope = useMemo(() => directoryTreeScopeKey({
    scanId: selectedScanId,
    query,
    filters: searchFilters
  }), [selectedScanId, query, searchFilters]);
  const visibleDirectoryTreeNodes = directoryTreeScope === activeDirectoryTreeScope ? directoryTreeNodes : {};
  const visibleDirectoryTreeLoadingPaths = directoryTreeScope === activeDirectoryTreeScope ? directoryTreeLoadingPaths : [];
  // The scan browser is now a single [Browse | Flat] surface with an always-on
  // backup filter; the old "delete-check" subview (which substituted a whole
  // presence-check result set for the grid rows and hung the app on large
  // scans) is retired. Rows are always the current folder's tree entries.
  const fileGridRows = useMemo(() => gridRows(treeEntries, selectedPath), [treeEntries, selectedPath]);
  const hasSearchParams = useMemo(() => Boolean(query.trim() || searchFilters.length), [query, searchFilters]);
  const visibleGridRows = fileGridRows;
  const selectedGridEntries = useMemo(() => {
    const selected = new Set(selectedGridPaths);
    return fileGridRows.filter((row) => row.kind !== 'parent' && selected.has(row.path));
  }, [fileGridRows, selectedGridPaths]);
  const gridVisibleColumns = visibleColumns;
  // True whenever the locations scan browser is active; the Browse view always
  // shows the directory tree, so tree data loads independent of any subview.
  const browsingScan = activeTab === 'locations' && Boolean(selectedScanId);
  const runningProgress = useMemo(() => Object.values(scanProgress).filter((progress) => isActiveStatus(progress.status)), [scanProgress]);
  const filteredDupes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dupes.filter((group) => {
      const textMatches = !needle || group.files.some((file) => duplicateText(file, group).includes(needle));
      const searchFilterMatches = !searchFilters.length || group.files.some((file) => fileMatchesSearch(file, '', searchFilters));
      return textMatches && searchFilterMatches;
    });
  }, [dupes, query, searchFilters]);

  const routeTo = useCallback((replace = false) => {
    const state = latest.current;
    const params = new URLSearchParams();
    let path = '/dashboard';
    if (state.activeTab === 'duplicates') {
      path = '/duplicates';
      if (state.selectedDuplicateScanIds?.length) params.set('scans', state.selectedDuplicateScanIds.join(','));
      if (state.duplicateView && state.duplicateView !== 'flat') params.set('view', state.duplicateView);
      if (state.query.trim()) params.set('q', state.query.trim());
      const encodedFilters = encodeSearchFilters(state.searchFilters);
      if (encodedFilters) params.set('filters', encodedFilters);
    } else if (state.activeTab === 'search') {
      path = '/search';
      if (state.selectedSearchScanIds?.length) {
        params.set('scope', 'explicit');
        params.set('scans', state.selectedSearchScanIds.join(','));
      } else if (state.searchAllScans) {
        params.set('scope', 'all');
      }
      if (state.query.trim()) params.set('q', state.query.trim());
      const encodedFilters = encodeSearchFilters(state.searchFilters);
      if (encodedFilters) params.set('filters', encodedFilters);
    } else if (state.activeTab === 'tasks') {
      path = '/tasks';
    } else if (state.activeTab === 'options') {
      path = '/options';
    } else if (state.activeTab === 'locations') {
      if (state.selectedLocationSlug) {
        path = `/locations/${encodeURIComponent(state.selectedLocationSlug)}`;
        if (state.selectedScanId) {
          path += `/scans/${encodeURIComponent(state.selectedScanId)}`;
          if (state.selectedPath) params.set('path', state.selectedPath);
          if (state.scanSubview && state.scanSubview !== 'files') params.set('view', state.scanSubview);
          if (state.query.trim()) params.set('q', state.query.trim());
          const encodedFilters = encodeSearchFilters(state.searchFilters);
          if (encodedFilters) params.set('filters', encodedFilters);
        }
      } else {
        path = '/locations';
      }
    }
    const next = `${path}${params.toString() ? `?${params}` : ''}`;
    const current = desktopRuntime
      ? (window.location.hash.replace(/^#/, '') || '/dashboard')
      : `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
    const target = desktopRuntime ? `${window.location.pathname}${window.location.search}#${next}` : next;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
  }, [desktopRuntime]);

  const parseRoute = useCallback(() => {
    const url = desktopRuntime && window.location.hash
      ? new URL(window.location.hash.replace(/^#/, ''), window.location.origin)
      : new URL(window.location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length || parts[0] === 'dashboard') {
      setActiveTab('dashboard');
      Object.assign(latest.current, { activeTab: 'dashboard' });
      return;
    }
    if (parts[0] === 'tasks') {
      setActiveTab('tasks');
      Object.assign(latest.current, { activeTab: 'tasks' });
      return;
    }
    if (parts[0] === 'options') {
      setActiveTab('options');
      Object.assign(latest.current, { activeTab: 'options' });
      return;
    }
    if (parts[0] === 'duplicates') {
      setActiveTab('duplicates');
      const nextQuery = url.searchParams.get('q') || '';
      const nextSearchFilters = decodeSearchFilters(url.searchParams.get('filters'));
      const nextDuplicateScanIds = parseScanIds(url.searchParams.get('scans'));
      const nextDuplicateView = url.searchParams.get('view') === 'tree' ? 'tree' : 'flat';
      setQuery(nextQuery);
      setSearchFilters(nextSearchFilters);
      setSelectedDuplicateScanIds(nextDuplicateScanIds);
      setDuplicateViewState(nextDuplicateView);
      Object.assign(latest.current, { activeTab: 'duplicates', query: nextQuery, searchFilters: nextSearchFilters, selectedDuplicateScanIds: nextDuplicateScanIds, duplicateView: nextDuplicateView });
      return;
    }
    if (parts[0] === 'search') {
      setActiveTab('search');
      const nextQuery = url.searchParams.get('q') || '';
      const nextSearchFilters = decodeSearchFilters(url.searchParams.get('filters'));
      const nextSearchScope = url.searchParams.get('scope');
      const requestedSearchScanIds = parseScanIds(url.searchParams.get('scans'));
      const nextSearchScanIds = nextSearchScope === 'explicit' || (!nextSearchScope && requestedSearchScanIds.length)
        ? requestedSearchScanIds
        : [];
      const nextSearchAllScans = !nextSearchScanIds.length && nextSearchScope === 'all';
      setQuery(nextQuery);
      setSearchFilters(nextSearchFilters);
      setSearchAllScans(nextSearchAllScans);
      setSelectedSearchScanIds(nextSearchScanIds);
      Object.assign(latest.current, { activeTab: 'search', query: nextQuery, searchFilters: nextSearchFilters, searchAllScans: nextSearchAllScans, selectedSearchScanIds: nextSearchScanIds });
      pendingRouteSearch.current = Boolean(nextQuery.trim() || nextSearchFilters.length);
      return;
    }
    const nextLocationSlug = parts[0] === 'locations' && parts[1] ? decodeURIComponent(parts[1]) : null;
    const nextScanId = parts[2] === 'scans' && parts[3] ? decodeURIComponent(parts[3]) : null;
    const nextPath = nextScanId ? url.searchParams.get('path') || '' : '';
    const routeView = url.searchParams.get('view');
    const nextQuery = url.searchParams.get('q') || '';
    const nextSearchFilters = decodeSearchFilters(url.searchParams.get('filters'));
    const nextScanSubview = nextScanId && (routeView === 'delete-check' || routeView === 'tree')
      ? routeView
      : 'files';
    const nextDeleteCheck = nextScanId && nextScanId === latest.current.selectedScanId ? latest.current.deleteCheck : null;
    setActiveTab('locations');
    setSelectedLocationSlug(nextLocationSlug);
    setSelectedScanId(nextScanId);
    setSelectedPath(nextPath);
    setScanSubviewState(nextScanSubview);
    setPathHistory([nextPath]);
    setPathHistoryIndex(0);
    setDeleteCheck(nextDeleteCheck);
    setQuery(nextQuery);
    setSearchFilters(nextSearchFilters);
    setSelectedGridPaths([]);
    if (!nextScanId) {
      setTreeEntries([]);
      setDeleteCheckPath('');
    }
    Object.assign(latest.current, {
      activeTab: 'locations',
      selectedLocationSlug: nextLocationSlug,
      selectedScanId: nextScanId,
      selectedPath: nextPath,
      scanSubview: nextScanSubview,
      pathHistory: [nextPath],
      pathHistoryIndex: 0,
      deleteCheck: nextDeleteCheck,
      query: nextQuery,
      searchFilters: nextSearchFilters,
      selectedGridPaths: []
    });
  }, []);

  const ensureSelection = useCallback((nextLocations = latest.current.locations) => {
    if (latest.current.activeTab !== 'locations') return;
    const currentSlug = latest.current.selectedLocationSlug;
    let nextSlug = currentSlug || nextLocations[0]?.slug || null;
    const location = nextLocations.find((item) => item.slug === nextSlug);
    if (!location) {
      setSelectedLocationSlug(nextLocations[0]?.slug || null);
      setSelectedScanId(null);
      setSelectedPath('');
      setSelectedGridPaths([]);
      Object.assign(latest.current, {
        selectedLocationSlug: nextLocations[0]?.slug || null,
        selectedScanId: null,
        selectedPath: '',
        scanSubview: 'files',
        selectedGridPaths: []
      });
      return;
    }
    const view = locationView(location);
    const nextScanId = latest.current.selectedScanId && view.scans.some((scan) => scan.id === latest.current.selectedScanId)
      ? latest.current.selectedScanId
      : null;
    setSelectedLocationSlug(nextSlug);
    setSelectedScanId(nextScanId);
    if (!nextScanId) {
      setSelectedPath('');
      setScanSubviewState('files');
      setPathHistory(['']);
      setPathHistoryIndex(0);
      setTreeEntries([]);
      setDeleteCheck(null);
      setDeleteCheckPath('');
      setSelectedGridPaths([]);
    }
    Object.assign(latest.current, {
      selectedLocationSlug: nextSlug,
      selectedScanId: nextScanId,
      selectedPath: nextScanId ? latest.current.selectedPath : '',
      scanSubview: nextScanId ? latest.current.scanSubview : 'files',
      pathHistory: nextScanId ? latest.current.pathHistory : [''],
      pathHistoryIndex: nextScanId ? latest.current.pathHistoryIndex : 0,
      deleteCheck: nextScanId ? latest.current.deleteCheck : null,
      selectedGridPaths: nextScanId ? latest.current.selectedGridPaths : []
    });
  }, [locationView]);

  const loadTree = useCallback(async (path = latest.current.selectedPath, options = {}) => {
    const { updateHistory = true, replaceRoute = true, preserveDeleteCheck = false } = options;
    if (latest.current.deleteCheck && !preserveDeleteCheck) {
      setDeleteCheck(null);
      latest.current.deleteCheck = null;
    }
    if (!latest.current.selectedScanId) {
      setTreeEntries([]);
      setSelectedGridPaths([]);
      latest.current.selectedGridPaths = [];
      setTreeLoading(false);
      return;
    }
    const requestId = ++treeRequestId.current;
    const requestedScanId = latest.current.selectedScanId;
    const requestedPath = path || '';
    const previousPath = latest.current.selectedPath || '';
    setSelectedPath(requestedPath);
    latest.current.selectedPath = requestedPath;
    if (previousPath !== requestedPath) {
      setSelectedGridPaths([]);
      latest.current.selectedGridPaths = [];
    }
    if (latest.current.deleteCheck) setDeleteCheckPath(requestedPath);
    if (updateHistory && latest.current.pathHistory[latest.current.pathHistoryIndex] !== requestedPath) {
      const nextHistory = [...latest.current.pathHistory.slice(0, latest.current.pathHistoryIndex + 1), requestedPath];
      setPathHistory(nextHistory);
      setPathHistoryIndex(nextHistory.length - 1);
      latest.current.pathHistory = nextHistory;
      latest.current.pathHistoryIndex = nextHistory.length - 1;
    }
    if (replaceRoute) routeTo(true);
    treeAbortController.current?.abort();
    const controller = new AbortController();
    treeAbortController.current = controller;
    let treePage;
    setTreeLoading(true);
    try {
      treePage = requireTreePage(await rpc('scans.tree', {
        scan_id: requestedScanId,
        path: requestedPath,
        depth: 1,
        limit: 500,
        offset: 0,
        ...(latest.current.query?.trim() || latest.current.searchFilters?.length
          ? { query: buildFileSearchQuery(latest.current.query, latest.current.searchFilters) }
          : {})
      }, { signal: controller.signal }));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      throw error;
    } finally {
      if (treeAbortController.current === controller) {
        treeAbortController.current = null;
        setTreeLoading(false);
      }
    }
    if (requestId !== treeRequestId.current || latest.current.selectedScanId !== requestedScanId || latest.current.selectedPath !== requestedPath) return;
    setTreeEntries(treePage.entries);
  }, [rpc, routeTo]);
  loadTreeRef.current = loadTree;

  const clearDirectoryTree = useCallback(() => {
    directoryTreeGeneration.current += 1;
    directoryTreeControllers.current.forEach((controller) => controller.abort());
    directoryTreeControllers.current.clear();
    directoryTreeRequests.current.clear();
    directoryTreeScopeRef.current = '';
    directoryTreeNodesRef.current = {};
    directoryTreeExpandedPathsRef.current = [''];
    setDirectoryTreeScope('');
    setDirectoryTreeNodes({});
    setDirectoryTreeExpandedPaths(['']);
    setDirectoryTreeLoadingPaths([]);
  }, []);

  const resetDirectoryTreeScope = useCallback((scope) => {
    if (directoryTreeScopeRef.current === scope) return false;
    clearDirectoryTree();
    directoryTreeScopeRef.current = scope;
    setDirectoryTreeScope(scope);
    return true;
  }, [clearDirectoryTree]);

  const loadDirectoryTreePage = useCallback(async (path = '', { append = false } = {}) => {
    const state = latest.current;
    const scanId = state.selectedScanId;
    if (!scanId) return null;

    const scope = directoryTreeScopeKey({
      scanId,
      query: state.query,
      filters: state.searchFilters
    });
    const scopeChanged = resetDirectoryTreeScope(scope);
    const normalizedPath = path || '';
    const existing = scopeChanged ? null : directoryTreeNodesRef.current[normalizedPath];
    if (!append && existing) return existing;
    const offset = append ? existing?.nextOffset : 0;
    if (append && offset == null) return existing || null;

    const requestKey = `${scope}:${normalizedPath}:${offset}`;
    const pending = directoryTreeRequests.current.get(requestKey);
    if (pending) return pending;

    const generation = directoryTreeGeneration.current;
    const controller = new AbortController();
    directoryTreeControllers.current.set(requestKey, controller);
    setDirectoryTreeLoadingPaths((current) => current.includes(normalizedPath) ? current : [...current, normalizedPath]);

    const shouldFilter = Boolean(state.query?.trim() || state.searchFilters?.length);
    const request = rpc('scans.tree', {
      scan_id: scanId,
      path: normalizedPath,
      depth: 1,
      limit: DIRECTORY_TREE_PAGE_LIMIT,
      offset,
      ...(shouldFilter ? { query: buildFileSearchQuery(state.query, state.searchFilters) } : {})
    }, { signal: controller.signal });
    directoryTreeRequests.current.set(requestKey, request);

    try {
      const page = requireTreePage(await request);
      if (
        generation !== directoryTreeGeneration.current
        || directoryTreeScopeRef.current !== scope
        || latest.current.selectedScanId !== scanId
      ) return null;

      const nextNode = mergeDirectoryTreePage(directoryTreeNodesRef.current[normalizedPath], page, { append });
      const nextNodes = { ...directoryTreeNodesRef.current, [normalizedPath]: nextNode };
      directoryTreeNodesRef.current = nextNodes;
      setDirectoryTreeNodes(nextNodes);
      return nextNode;
    } catch (error) {
      if (error?.name !== 'AbortError') setMessage(error?.message || String(error));
      return null;
    } finally {
      if (directoryTreeRequests.current.get(requestKey) === request) directoryTreeRequests.current.delete(requestKey);
      if (directoryTreeControllers.current.get(requestKey) === controller) directoryTreeControllers.current.delete(requestKey);
      if (generation === directoryTreeGeneration.current) {
        setDirectoryTreeLoadingPaths((current) => current.filter((item) => item !== normalizedPath));
      }
    }
  }, [resetDirectoryTreeScope, rpc]);

  const ensureDirectoryTreePath = useCallback(async (path = '') => {
    await loadDirectoryTreePage('');
    const ancestorPaths = directoryAncestorPaths(path, {
      maxDepth: MAX_AUTO_DIRECTORY_TREE_DEPTH
    });
    const nextExpanded = [...new Set([...directoryTreeExpandedPathsRef.current, ...ancestorPaths])];
    directoryTreeExpandedPathsRef.current = nextExpanded;
    setDirectoryTreeExpandedPaths(nextExpanded);

    for (const ancestorPath of ancestorPaths.slice(1)) {
      await loadDirectoryTreePage(ancestorPath);
    }
  }, [loadDirectoryTreePage]);

  const toggleDirectoryTree = useCallback((path = '') => {
    const current = directoryTreeExpandedPathsRef.current;
    const isExpanded = current.includes(path);
    const next = isExpanded ? current.filter((item) => item !== path) : [...current, path];
    directoryTreeExpandedPathsRef.current = next;
    setDirectoryTreeExpandedPaths(next);
    if (!isExpanded) void loadDirectoryTreePage(path);
  }, [loadDirectoryTreePage]);

  const loadMoreDirectoryTree = useCallback((path = '') => {
    void loadDirectoryTreePage(path, { append: true });
  }, [loadDirectoryTreePage]);

  useEffect(() => {
    if (!browsingScan) return;
    void ensureDirectoryTreePath(selectedPath);
  }, [ensureDirectoryTreePath, query, browsingScan, searchFilters, selectedPath, selectedScanId]);

  const loadDuplicateGroups = useCallback(async (scanIds = latest.current.selectedDuplicateScanIds || []) => {
    setDuplicatesLoading(true);
    try {
      const nextDupes = await rpc('dupes.list', { limit: 100, scan_ids: scanIds });
      setDupes(nextDupes);
      latest.current.dupes = nextDupes;
      return nextDupes;
    } finally {
      setDuplicatesLoading(false);
    }
  }, [rpc]);

  const doRefresh = useCallback(async () => {
    setBusy(true);
    setRefreshing(true);
    setMessage('');
    try {
      const [nextOverview, nextLocations, nextScans, running] = await Promise.all([
        rpc('overview.get'),
        rpc('locations.list'),
        rpc('scans.list'),
        rpc('scans.running')
      ]);
      const knownScanIds = new Set(nextScans.map((scan) => scan.id));
      const nextSelectedDuplicateScanIds = (latest.current.selectedDuplicateScanIds || []).filter((scanId) => knownScanIds.has(scanId));
      const nextSelectedSearchScanIds = (latest.current.selectedSearchScanIds || []).filter((scanId) => knownScanIds.has(scanId));
      const nextDupes = await rpc('dupes.list', { limit: 100, scan_ids: nextSelectedDuplicateScanIds });
      setOverview(nextOverview);
      setLocations(nextLocations);
      setScans(nextScans);
      setDupes(nextDupes);
      if (nextSelectedDuplicateScanIds.length !== (latest.current.selectedDuplicateScanIds || []).length) {
        setSelectedDuplicateScanIds(nextSelectedDuplicateScanIds);
        latest.current.selectedDuplicateScanIds = nextSelectedDuplicateScanIds;
      }
      if (nextSelectedSearchScanIds.length !== (latest.current.selectedSearchScanIds || []).length) {
        setSelectedSearchScanIds(nextSelectedSearchScanIds);
        latest.current.selectedSearchScanIds = nextSelectedSearchScanIds;
      }
      latest.current.locations = nextLocations;
      latest.current.scans = nextScans;
      latest.current.dupes = nextDupes;
      mergeProgress(running);
      ensureSelection(nextLocations);
      routeTo(true);
      if (!reconcilingExcludeTrees.current.has(latest.current.selectedScanId)) {
        await loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, preserveDeleteCheck: true });
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, [rpc, mergeProgress, ensureSelection, routeTo]);

  const refresh = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = doRefresh().finally(() => {
      refreshPromise.current = null;
    });
    return refreshPromise.current;
  }, [doRefresh]);
  refreshRef.current = refresh;

  useEffect(() => {
    parseRoute();
    const onPopstate = () => {
      parseRoute();
      refreshRef.current?.();
    };
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [parseRoute]);

  useEffect(() => {
    if (wsStatus !== 'live' || !pendingRouteSearch.current || activeTab !== 'search') return;
    pendingRouteSearch.current = false;
    searchRef.current?.({ replaceRoute: true });
  }, [wsStatus, activeTab, query, searchFilters, searchAllScans, selectedSearchScanIds]);

  function scheduleTreeReload() {
    if (latest.current.deleteCheck || treeReloadTimer.current) return;
    treeReloadTimer.current = window.setTimeout(() => {
      treeReloadTimer.current = null;
      loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, replaceRoute: false });
    }, 700);
  }

  function refreshAfterScanExcludesUpdate(scanId) {
    const key = scanId || '*';
    const existing = scanExcludeRefreshes.current.get(key);
    if (existing) return existing;

    let refresh;
    refresh = reconcileAndRefreshAfterScanExcludesUpdate(scanId)
      .catch((error) => {
        setMessage(error?.message || String(error));
      })
      .finally(() => {
        if (scanExcludeRefreshes.current.get(key) === refresh) {
          scanExcludeRefreshes.current.delete(key);
        }
      });
    scanExcludeRefreshes.current.set(key, refresh);
    return refresh;
  }

  async function reconcileAndRefreshAfterScanExcludesUpdate(scanId) {
    const state = latest.current;
    const selectedScanId = state.selectedScanId;
    const affectsSelectedScan = !scanId || scanId === selectedScanId;
    const fileInfoAffected = !scanId
      || state.fileInfo?.file?.scan_id === scanId
      || (Array.isArray(state.fileInfo?.occurrences) && state.fileInfo.occurrences.some((occurrence) => occurrence.scan_id === scanId));

    if (fileInfoAffected) {
      setFileInfo(null);
      setShowFileInfo(false);
      state.fileInfo = null;
    }

    if (!scanId || state.confirmDeletePath?.scan_id === scanId) {
      setConfirmDeletePath(null);
      state.confirmDeletePath = null;
    }
    if (!scanId || state.buildThumbnailRequest?.scan_id === scanId) {
      setBuildThumbnailRequest(null);
      setShowBuildThumbnails(false);
      state.buildThumbnailRequest = null;
    }

    if (affectsSelectedScan) {
      setDeleteCheck(null);
      setDeleteCheckPath('');
      setSelectedGridPaths([]);
      Object.assign(state, { deleteCheck: null, deleteCheckPath: '', selectedGridPaths: [] });
    }

    const shouldReconcileTree = Boolean(affectsSelectedScan && selectedScanId);
    let reconciliationError = null;
    if (shouldReconcileTree) {
      reconcilingExcludeTrees.current.add(selectedScanId);
      invalidateSelectedScanTree();
    }

    try {
      const inFlightRefresh = refreshPromise.current;
      if (inFlightRefresh) await inFlightRefresh;
      if (shouldReconcileTree) {
        reconciliationError = await reconcileSelectedScanPathAfterExcludes(selectedScanId);
      }
    } finally {
      if (shouldReconcileTree) reconcilingExcludeTrees.current.delete(selectedScanId);
    }

    const skippedTreeRefresh = refreshPromise.current;
    if (skippedTreeRefresh) await skippedTreeRefresh;
    await refreshRef.current?.();

    if (latest.current.activeTab === 'search') {
      await searchRef.current?.({ replaceRoute: true });
    }

    if (reconciliationError) setMessage(reconciliationError.message);
  }

  async function reconcileSelectedScanPathAfterExcludes(scanId) {
    const state = latest.current;
    const originalPath = state.selectedPath || '';
    if (state.selectedScanId !== scanId) return null;

    let nextPath = originalPath;
    let reconciliationError = null;
    try {
      nextPath = await nearestVisibleScanPath(scanId, originalPath);
    } catch (error) {
      nextPath = '';
      reconciliationError = new Error(`Could not reconcile the excluded folder: ${error?.message || String(error)}`);
    }

    if (latest.current.selectedScanId !== scanId || latest.current.selectedPath !== originalPath) return null;
    if (nextPath === originalPath) return reconciliationError;

    const nextHistory = pathHistoryFor(nextPath);
    setSelectedPath(nextPath);
    setPathHistory(nextHistory);
    setPathHistoryIndex(nextHistory.length - 1);
    Object.assign(latest.current, {
      selectedPath: nextPath,
      pathHistory: nextHistory,
      pathHistoryIndex: nextHistory.length - 1
    });
    routeTo(true);
    return reconciliationError;
  }

  function invalidateSelectedScanTree() {
    treeRequestId.current += 1;
    treeAbortController.current?.abort();
    treeAbortController.current = null;
    setTreeEntries([]);
    setTreeLoading(true);
    clearDirectoryTree();
    if (latest.current.activeTab === 'locations' && latest.current.selectedScanId) {
      void ensureDirectoryTreePath(latest.current.selectedPath);
    }
  }

  async function nearestVisibleScanPath(scanId, path) {
    let candidate = path || '';
    if (!candidate) return '';
    const rpcCall = rpcRef.current;
    if (!rpcCall) throw new Error('The connection is not ready.');

    while (candidate) {
      const parent = parentPath(candidate);
      const page = requireTreePage(await rpcCall('scans.tree', {
        scan_id: scanId,
        path: parent,
        depth: 1,
        limit: 500,
        offset: 0
      }));
      if (page.entries.some((entry) => entry.kind === 'dir' && entry.path === candidate)) {
        return candidate;
      }
      candidate = parent;
    }
    return '';
  }

  function scheduleLagRecovery() {
    if (lagRecoveryTimer.current || lagRecoveryPromise.current) return;
    lagRecoveryTimer.current = window.setTimeout(() => {
      lagRecoveryTimer.current = null;
      void recoverFromEventLag();
    }, 1000);
  }

  function clearFileFacingStateAfterLag() {
    invalidateSearchRequest();
    treeRequestId.current += 1;
    treeAbortController.current?.abort();
    treeAbortController.current = null;
    if (treeReloadTimer.current) {
      window.clearTimeout(treeReloadTimer.current);
      treeReloadTimer.current = null;
    }
    setTreeEntries([]);
    setTreeLoading(false);
    clearDirectoryTree();
    setDeleteCheck(null);
    setDeleteCheckPath('');
    setSelectedGridPaths([]);
    setConfirmDeletePath(null);
    setFileInfo(null);
    setShowFileInfo(false);
    setBuildThumbnailRequest(null);
    setShowBuildThumbnails(false);
    Object.assign(latest.current, {
      deleteCheck: null,
      deleteCheckPath: '',
      selectedGridPaths: [],
      confirmDeletePath: null,
      fileInfo: null,
      buildThumbnailRequest: null
    });
  }

  async function recoverFromEventLag() {
    if (lagRecoveryPromise.current) return lagRecoveryPromise.current;
    clearFileFacingStateAfterLag();
    const recovery = (async () => {
      await refreshAuthoritativelyAfterEventLag(() => refreshRef.current?.(), refreshPromise);
      const state = latest.current;
      if (state.activeTab === 'locations' && state.selectedScanId) {
        await ensureDirectoryTreePath(state.selectedPath);
      }
      if (state.activeTab === 'search' && (String(state.query ?? '').trim() || state.searchFilters?.length)) {
        await searchRef.current?.({
          replaceRoute: true,
          query: state.query,
          filters: state.searchFilters,
          scanIds: state.selectedSearchScanIds,
          allScans: state.searchAllScans
        });
      }
    })()
      .catch((error) => {
        setMessage(error?.message || String(error));
      })
      .finally(() => {
        lagRecoveryPromise.current = null;
      });
    lagRecoveryPromise.current = recovery;
    return recovery;
  }

  async function hydrateProgress(scanId) {
    if (hydratingProgress.current.has(scanId)) return;
    hydratingProgress.current.add(scanId);
    try {
      const progress = await rpc('scans.progress', { scan_id: scanId });
      if (progress) mergeProgress([progress]);
    } catch {
      // The next scan event or refresh will reconcile this.
    } finally {
      hydratingProgress.current.delete(scanId);
    }
  }

  function setTab(tab) {
    setActiveTab(tab);
    latest.current.activeTab = tab;
    routeTo();
  }

  function setScanSubview(view, replace = false) {
    const nextView = view === 'delete-check' || view === 'tree' ? view : 'files';
    setScanSubviewState(nextView);
    latest.current.scanSubview = nextView;
    routeTo(replace);
  }

  function requestDeleteScan(scanId) {
    const scan = latest.current.scans.find((item) => item.id === scanId);
    if (scan && isActiveStatus(scanView(scan).status)) {
      setMessage('Stop the scan before deleting it.');
      return;
    }
    setConfirmDeleteScanId(scanId);
  }

  function requestDeleteLocation(slug) {
    const location = latest.current.locations.find((item) => item.slug === slug);
    if (location && locationView(location).activeScan) {
      setMessage('Stop active scans before deleting this location.');
      return;
    }
    setConfirmDeleteLocationSlug(slug);
  }

  async function addLocation() {
    setBusy(true);
    try {
      await rpc('locations.add', { kind: form.kind, name: form.name, slug: form.slug, root_path: form.root_path, notes: form.notes || null });
      setSelectedLocationSlug(form.slug);
      latest.current.selectedLocationSlug = form.slug;
      setForm({ kind: 'local', name: '', slug: '', root_path: '', notes: '' });
      setShowAddLocation(false);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openEditLocation(location) {
    setEditForm({ slug: location.slug, kind: location.kind, name: location.name, root_path: location.root_path, notes: location.notes || '' });
    setShowEditLocation(true);
  }

  async function updateLocation() {
    setBusy(true);
    try {
      const location = await rpc('locations.update', { slug: editForm.slug, kind: editForm.kind, name: editForm.name, root_path: editForm.root_path, notes: editForm.notes || null });
      setLocations((current) => current.map((item) => item.slug === location.slug ? location : item));
      setShowEditLocation(false);
      await refresh();
      setMessage(`Updated ${location.slug}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseDatabaseLocation() {
    if (!desktopRuntime) return;
    setBusy(true);
    setMessage('');
    try {
      const info = await chooseDatabase();
      if (!info) return;
      setDatabaseInfo(info);
      setSelectedLocationSlug(null);
      setSelectedScanId(null);
      setSelectedPath('');
      setScanSubviewState('files');
      setPathHistory(['']);
      setPathHistoryIndex(0);
      setTreeEntries([]);
      setDeleteCheck(null);
      setSelectedGridPaths([]);
      setScanProgress({});
      Object.assign(latest.current, {
        selectedLocationSlug: null,
        selectedScanId: null,
        selectedPath: '',
        scanSubview: 'files',
        pathHistory: [''],
        pathHistoryIndex: 0,
        deleteCheck: null,
        selectedGridPaths: []
      });
      await refresh();
      setMessage(`Using database ${info.path}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocationFolder(currentPath) {
    if (!desktopRuntime) return null;
    try {
      return await chooseFolder(currentPath || '');
    } catch (error) {
      setMessage(error.message);
      return null;
    }
  }

  async function browseCurrentFolder(location) {
    const scanId = latest.current.selectedScanId;
    if (!location?.connected || !scanId) return;
    setBusy(true);
    try {
      await rpc('scans.open_folder', {
        scan_id: scanId,
        path: latest.current.selectedPath || null
      });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function setLocationDisabled(location, disabled) {
    setBusy(true);
    try {
      const updated = await rpc('locations.set_disabled', { slug: location.slug, disabled });
      setLocations((current) => current.map((item) => item.slug === updated.slug ? updated : item));
      await refresh();
      setMessage(disabled ? `${location.slug} disabled for duplicate detection.` : `${location.slug} enabled for duplicate detection.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openScanStart(slug) {
    const location = latest.current.locations?.find?.((item) => item.slug === slug);
    if (location && location.connected === false) {
      setMessage(`Cannot scan ${location.name || slug}: its path is disconnected or missing. Reconnect the drive or edit the location.`);
      return;
    }
    setScanStartForm({ slug, offset: '/', hash_policy: 'full' });
  }

  function confirmScanStart() {
    const form = scanStartForm;
    if (!form) return;
    setScanStartForm(null);
    void startScan(form.slug, { offset: (form.offset || '/').trim() || '/', hash_policy: form.hash_policy || 'full' });
  }

  async function startScan(slug, options = {}) {
    setBusy(true);
    try {
      setDeleteCheck(null);
      const offset = options.offset || '/';
      const result = await rpc('scans.start', { slug, offset, hash_policy: options.hash_policy || 'full' });
      const location = locationBySlug(slug);
      setActiveTab('locations');
      setSelectedLocationSlug(slug);
      setSelectedScanId(result.scan_id);
      setSelectedPath('');
      setScanSubviewState('files');
      setSelectedGridPaths([]);
      Object.assign(latest.current, { activeTab: 'locations', selectedLocationSlug: slug, selectedScanId: result.scan_id, selectedPath: '', scanSubview: 'files', selectedGridPaths: [] });
      routeTo();
      setScanProgress((current) => ({ ...current, [result.scan_id]: { scan_id: result.scan_id, location_slug: slug, location_name: location?.name || slug, status: 'running', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, current_path: null, log: ['Scan queued'] } }));
      setScans((current) => [{ id: result.scan_id, location_slug: slug, location_name: location?.name || slug, is_representative: false, status: 'running', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, offset_path: '/', started_at: new Date().toISOString(), finished_at: null, notes: null }, ...current]);
      setMessage(`Scan started for ${slug}.`);
      hydrateProgress(result.scan_id);
      scheduleTreeReload();
      await loadTree('', { updateHistory: false });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startUpdateScan(sourceScanId) {
    setBusy(true);
    try {
      setDeleteCheck(null);
      const sourceScan = latest.current.scans.find((scan) => scan.id === sourceScanId);
      const result = await rpc('scans.update', { scan_id: sourceScanId });
      const slug = sourceScan?.location_slug || selectedLocationSlug;
      const location = slug ? locationBySlug(slug) : selectedLocationValue;
      setActiveTab('locations');
      if (slug) setSelectedLocationSlug(slug);
      setSelectedScanId(result.scan_id);
      setSelectedPath('');
      setScanSubviewState('files');
      setSelectedGridPaths([]);
      Object.assign(latest.current, { activeTab: 'locations', selectedLocationSlug: slug, selectedScanId: result.scan_id, selectedPath: '', scanSubview: 'files', selectedGridPaths: [] });
      routeTo();
      setScanProgress((current) => ({ ...current, [result.scan_id]: { scan_id: result.scan_id, location_slug: slug || '', location_name: location?.name || slug || '', status: 'running', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, current_path: null, log: [`Update scan queued from ${sourceScanId}`] } }));
      setScans((current) => [{ id: result.scan_id, location_slug: slug || '', location_name: location?.name || slug || '', is_representative: false, status: 'running', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, offset_path: sourceScan?.offset_path || '/', started_at: new Date().toISOString(), finished_at: null, notes: null }, ...current]);
      setMessage('Update scan started.');
      hydrateProgress(result.scan_id);
      scheduleTreeReload();
      await loadTree('', { updateHistory: false });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startRepairScan(sourceScanId) {
    setBusy(true);
    try {
      setDeleteCheck(null);
      const sourceScan = latest.current.scans.find((scan) => scan.id === sourceScanId);
      const result = await rpc('scans.repair', { scan_id: sourceScanId });
      const slug = sourceScan?.location_slug || selectedLocationSlug;
      const location = slug ? locationBySlug(slug) : selectedLocationValue;
      setActiveTab('locations');
      if (slug) setSelectedLocationSlug(slug);
      setSelectedScanId(result.scan_id);
      setSelectedPath('');
      setScanSubviewState('files');
      setSelectedGridPaths([]);
      Object.assign(latest.current, { activeTab: 'locations', selectedLocationSlug: slug, selectedScanId: result.scan_id, selectedPath: '', scanSubview: 'files', selectedGridPaths: [] });
      routeTo();
      setScanProgress((current) => ({ ...current, [result.scan_id]: { scan_id: result.scan_id, location_slug: slug || '', location_name: location?.name || slug || '', status: 'running', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, current_path: null, log: [`Repair scan queued from ${sourceScanId}`] } }));
      setScans((current) => [{ id: result.scan_id, location_slug: slug || '', location_name: location?.name || slug || '', is_representative: false, status: 'running', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, offset_path: sourceScan?.offset_path || '/', started_at: new Date().toISOString(), finished_at: null, notes: null }, ...current]);
      setMessage('Repair scan started.');
      hydrateProgress(result.scan_id);
      scheduleTreeReload();
      await loadTree('', { updateHistory: false });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function chooseLocation(slug) {
    setDeleteCheck(null);
    setSelectedLocationSlug(slug);
    setSelectedScanId(null);
    setSelectedPath('');
    setScanSubviewState('files');
    setPathHistory(['']);
    setPathHistoryIndex(0);
    setTreeEntries([]);
    setSelectedGridPaths([]);
    setActiveTab('locations');
    Object.assign(latest.current, {
      selectedLocationSlug: slug,
      selectedScanId: null,
      selectedPath: '',
      scanSubview: 'files',
      pathHistory: [''],
      pathHistoryIndex: 0,
      activeTab: 'locations',
      deleteCheck: null,
      selectedGridPaths: []
    });
    routeTo();
  }

  async function selectScan(scanId, slug = null) {
    setDeleteCheck(null);
    const scan = latest.current.scans.find((item) => item.id === scanId);
    const nextSlug = slug || scan?.location_slug || latest.current.selectedLocationSlug;
    if (nextSlug) setSelectedLocationSlug(nextSlug);
    setSelectedScanId(scanId);
    setSelectedPath('');
    setScanSubviewState('files');
    setPathHistory(['']);
    setPathHistoryIndex(0);
    setSelectedGridPaths([]);
    setActiveTab('locations');
    Object.assign(latest.current, {
      selectedLocationSlug: nextSlug,
      selectedScanId: scanId,
      selectedPath: '',
      scanSubview: 'files',
      pathHistory: [''],
      pathHistoryIndex: 0,
      activeTab: 'locations',
      deleteCheck: null,
      selectedGridPaths: []
    });
    routeTo();
    await loadTree('', { updateHistory: false });
  }

  function goBack() {
    if (pathHistoryIndex <= 0) return;
    const nextIndex = pathHistoryIndex - 1;
    setPathHistoryIndex(nextIndex);
    latest.current.pathHistoryIndex = nextIndex;
    loadTree(pathHistory[nextIndex], { updateHistory: false });
  }

  function goForward() {
    if (pathHistoryIndex >= pathHistory.length - 1) return;
    const nextIndex = pathHistoryIndex + 1;
    setPathHistoryIndex(nextIndex);
    latest.current.pathHistoryIndex = nextIndex;
    loadTree(pathHistory[nextIndex], { updateHistory: false });
  }

  function goParent() {
    if (!selectedPath) return;
    const parts = selectedPath.split('/').filter(Boolean);
    parts.pop();
    loadTree(parts.join('/'));
  }

  async function stopScan(scanId) {
    setBusy(true);
    try {
      const result = await rpc('scans.stop', { scan_id: scanId });
      if (result?.stop_requested) {
        markScanControlStatus(scanId, 'stopping', 'Stop requested');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function pauseScan(scanId) {
    setBusy(true);
    try {
      const result = await rpc('scans.pause', { scan_id: scanId });
      if (result?.paused) {
        markScanControlStatus(scanId, 'paused', 'Paused');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resumeScan(scanId) {
    setBusy(true);
    try {
      const result = await rpc('scans.resume', { scan_id: scanId });
      if (result?.resumed) {
        markScanControlStatus(scanId, 'running', 'Resumed');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function setRepresentativeScan(scanId) {
    setBusy(true);
    try {
      const representative = await rpc('scans.set_representative', { scan_id: scanId });
      setScans((current) => current.map((scan) => scan.location_id === representative.location_id ? { ...scan, is_representative: scan.id === representative.id } : scan));
      await refresh();
      setMessage(`Representative scan set for ${representative.location_slug}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearRepresentativeScan(scanId) {
    setBusy(true);
    try {
      const cleared = await rpc('scans.clear_representative', { scan_id: scanId });
      setScans((current) => current.map((scan) => scan.location_id === cleared.location_id ? { ...scan, is_representative: false } : scan));
      await refresh();
      setMessage(`Representative scan cleared for ${cleared.location_slug}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openScanNotes(scan) {
    setScanNotesForm({ scan_id: scan.id, notes: scan.notes || '' });
    setShowScanNotes(true);
  }

  async function openScanExcludes(scan) {
    if (!scan?.id) return;
    setBusy(true);
    try {
      const excludes = await rpc('scans.excludes.get', { scan_id: scan.id });
      setScanExcludesForm({ scan_id: scan.id, patterns: (excludes || []).map((exclude) => exclude.pattern).join('\n') });
      setShowScanExcludes(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateScanNotes() {
    setBusy(true);
    try {
      const scan = await rpc('scans.update_notes', { scan_id: scanNotesForm.scan_id, notes: scanNotesForm.notes.trim() ? scanNotesForm.notes : null });
      setScans((current) => current.map((item) => item.id === scan.id ? scan : item));
      setShowScanNotes(false);
      await refresh();
      setMessage('Scan notes saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateScanExcludes() {
    setBusy(true);
    try {
      const patterns = scanExcludesForm.patterns
        .split(/\r?\n/)
        .map((pattern) => pattern.trim())
        .filter(Boolean);
      const excludes = await rpc('scans.excludes.set', { scan_id: scanExcludesForm.scan_id, patterns });
      setShowScanExcludes(false);
      await refreshAfterScanExcludesUpdate(scanExcludesForm.scan_id);
      setMessage(`Saved ${excludes.length} scan ${excludes.length === 1 ? 'exclude' : 'excludes'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function stageForDeleteCheck(entries = selectedGridEntries) {
    const items = (entries || []).filter((entry) => entry?.path && entry.kind !== 'parent');
    if (!items.length) {
      setMessage('Select files or folders to add to Delete Check.');
      return;
    }
    setDeleteCheckStaged((current) => {
      const seen = new Set(current.map((item) => item.path));
      const added = items
        .filter((item) => !seen.has(item.path))
        .map((item) => ({ path: item.path, kind: item.kind, name: item.name }));
      if (added.length) setMessage(`Added ${added.length} ${added.length === 1 ? 'item' : 'items'} to Delete Check.`);
      return added.length ? [...current, ...added] : current;
    });
    setSelectedGridPaths([]);
  }

  function removeFromDeleteCheckStage(path) {
    setDeleteCheckStaged((current) => current.filter((item) => item.path !== path));
  }

  function clearDeleteCheckStage() {
    setDeleteCheckStaged([]);
  }

  function runStagedDeleteCheck(scanId) {
    if (!deleteCheckStaged.length) return;
    void runDeleteCheck(scanId, deleteCheckStaged);
  }

  async function runDeleteCheck(scanId, entries = selectedGridEntries) {
    setBusy(true);
    try {
      const selectedEntries = (entries || []).filter((entry) => entry?.path && entry.kind !== 'parent');
      const payload = selectedEntries.length
        ? { scan_id: scanId, path: selectedPath, paths: selectedEntries.map((entry) => entry.path) }
        : {
            scan_id: scanId,
            path: selectedPath,
            ...(hasSearchParams ? { query: buildFileSearchQuery(query, searchFilters) } : {})
          };
      const scopeLabel = selectedEntries.length
        ? `${selectedEntries.length} selected ${selectedEntries.length === 1 ? 'item' : 'items'}`
        : `${selectedPath || 'root'}${hasSearchParams ? ' filtered' : ''}`;
      const result = await rpc('scans.delete_check', payload);
      setDeleteCheckPath(scopeLabel);
      setDeleteCheck(result);
      setScanSubviewState('delete-check');
      latest.current.scanSubview = 'delete-check';
      latest.current.deleteCheck = result;
      routeTo(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function closeDeleteCheck() {
    setDeleteCheck(null);
    setDeleteCheckPath('');
    latest.current.deleteCheck = null;
    setScanSubview('files', true);
    loadTree(selectedPath, { updateHistory: false });
  }

  async function deleteLocation(slug) {
    setBusy(true);
    try {
      const location = latest.current.locations.find((item) => item.slug === slug);
      if (location && locationView(location).activeScan) {
        setMessage('Stop active scans before deleting this location.');
        setConfirmDeleteLocationSlug(null);
        return;
      }
      treeAbortController.current?.abort();
      await rpc('locations.delete', { slug });
      setConfirmDeleteLocationSlug(null);
      if (latest.current.selectedLocationSlug === slug) {
        setSelectedLocationSlug(null);
        setSelectedScanId(null);
        setSelectedPath('');
        setScanSubviewState('files');
        setPathHistory(['']);
        setPathHistoryIndex(0);
        setTreeEntries([]);
        setDeleteCheck(null);
        setSelectedGridPaths([]);
        Object.assign(latest.current, {
          selectedLocationSlug: null,
          selectedScanId: null,
          selectedPath: '',
          scanSubview: 'files',
          pathHistory: [''],
          pathHistoryIndex: 0,
          deleteCheck: null,
          selectedGridPaths: []
        });
        routeTo(true);
      }
      await refresh();
      setMessage(`Location ${slug} deleted.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteScan(scanId) {
    setBusy(true);
    try {
      const scan = latest.current.scans.find((item) => item.id === scanId);
      if (scan && isActiveStatus(scanView(scan).status)) {
        setMessage('Stop the scan before deleting it.');
        setConfirmDeleteScanId(null);
        return;
      }
      treeAbortController.current?.abort();
      await rpc('scans.delete', { scan_id: scanId });
      setConfirmDeleteScanId(null);
      if (latest.current.selectedScanId === scanId) {
        setSelectedScanId(null);
        setSelectedPath('');
        setScanSubviewState('files');
        setPathHistory(['']);
        setPathHistoryIndex(0);
        setTreeEntries([]);
        setDeleteCheck(null);
        setSelectedGridPaths([]);
        Object.assign(latest.current, {
          selectedScanId: null,
          selectedPath: '',
          scanSubview: 'files',
          pathHistory: [''],
          pathHistoryIndex: 0,
          deleteCheck: null,
          selectedGridPaths: []
        });
        routeTo(true);
      }
      await refresh();
      setMessage('Scan deleted.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function requestDeletePath(entry) {
    if (!entry?.path || !selectedScanId) return;
    if (selectedScanView && isActiveStatus(selectedScanView.status)) {
      setMessage('Stop the scan before removing indexed paths.');
      return;
    }
    setConfirmDeletePath({
      scan_id: selectedScanId,
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      file_count: entry.file_count || 1
    });
  }

  async function requestExcludePath(entry) {
    if (!entry?.path || !selectedScanId || entry.kind === 'parent') return;
    setBusy(true);
    try {
      const excludes = await rpc('scans.excludes.append_exact_path', { scan_id: selectedScanId, path: entry.path, kind: entry.kind });
      await refreshAfterScanExcludesUpdate(selectedScanId);
      setMessage(`Excluded ${entry.path}. Scan now has ${excludes.length} ${excludes.length === 1 ? 'pattern' : 'patterns'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteScanPath(request) {
    setBusy(true);
    try {
      const result = await rpc('scans.delete_path', { scan_id: request.scan_id, path: request.path });
      setConfirmDeletePath(null);
      await loadTree(selectedPath, { updateHistory: false });
      await refresh();
      setMessage(`Removed ${result.deleted} indexed ${result.deleted === 1 ? 'row' : 'rows'} from this scan.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function search(options = {}) {
    const requestId = ++searchRequestId.current;
    const activeQuery = String(options.query ?? latest.current.query ?? query).trim();
    const activeFilters = options.filters ?? latest.current.searchFilters ?? searchFilters;
    const activeSearchScanIds = uniqueScanIds(
      options.scanIds ?? latest.current.selectedSearchScanIds ?? selectedSearchScanIds
    );
    const activeSearchAllScans = activeSearchScanIds.length
      ? false
      : Boolean(options.allScans ?? latest.current.searchAllScans ?? searchAllScans);
    if (!activeQuery && !activeFilters.length) {
      setActiveTab('search');
      setQuery('');
      setSearchFilters([]);
      setSearchAllScans(activeSearchAllScans);
      setSelectedSearchScanIds(activeSearchScanIds);
      Object.assign(latest.current, {
        activeTab: 'search',
        query: '',
        searchFilters: [],
        searchAllScans: activeSearchAllScans,
        selectedSearchScanIds: activeSearchScanIds
      });
      setResults([]);
      setSearchLoading(false);
      routeTo(true);
      return;
    }
    setBusy(true);
    setSearchLoading(true);
    try {
      setActiveTab('search');
      setSearchAllScans(activeSearchAllScans);
      setSelectedSearchScanIds(activeSearchScanIds);
      Object.assign(latest.current, {
        activeTab: 'search',
        query: activeQuery,
        searchFilters: activeFilters,
        searchAllScans: activeSearchAllScans,
        selectedSearchScanIds: activeSearchScanIds
      });
      routeTo(options.replaceRoute);
      const nextResults = await rpc('files.search', buildFileSearchQuery(activeQuery, activeFilters, {
        limit: 200,
        scanIds: activeSearchScanIds,
        allScans: activeSearchAllScans
      }));
      if (requestId !== searchRequestId.current) return;
      setResults(nextResults);
    } catch (error) {
      if (requestId === searchRequestId.current) setMessage(error.message);
    } finally {
      setBusy(false);
      if (requestId === searchRequestId.current) setSearchLoading(false);
    }
  }
  searchRef.current = search;

  function invalidateSearchRequest() {
    searchRequestId.current += 1;
    setResults([]);
    setSearchLoading(false);
  }

  function setSearchAllScanScope(nextAllScans) {
    const allScans = Boolean(nextAllScans);
    const scanIds = [];
    setSearchAllScans(allScans);
    setSelectedSearchScanIds(scanIds);
    Object.assign(latest.current, { searchAllScans: allScans, selectedSearchScanIds: scanIds });
    if (latest.current.activeTab === 'search') {
      searchRef.current?.({ replaceRoute: true, scanIds, allScans });
    } else {
      routeTo(true);
    }
  }

  function setSearchScanSelection(nextScanIds) {
    const scanIds = uniqueScanIds(nextScanIds);
    const allScans = scanIds.length ? false : Boolean(latest.current.searchAllScans);
    setSearchAllScans(allScans);
    setSelectedSearchScanIds(scanIds);
    Object.assign(latest.current, { searchAllScans: allScans, selectedSearchScanIds: scanIds });
    if (latest.current.activeTab === 'search') {
      searchRef.current?.({ replaceRoute: true, scanIds, allScans });
    } else {
      routeTo(true);
    }
  }

  function updateSearchQuery(value) {
    setQuery(value);
    latest.current.query = value;
  }

  function commitSearchState(nextState = {}) {
    const nextQuery = String(nextState.query ?? latest.current.query ?? '').trim();
    const nextFilters = nextState.filters ?? latest.current.searchFilters ?? [];
    setQuery(nextQuery);
    setSearchFilters(nextFilters);
    Object.assign(latest.current, { query: nextQuery, searchFilters: nextFilters });
    if (latest.current.activeTab === 'search') {
      searchRef.current?.({ replaceRoute: true, query: nextQuery, filters: nextFilters });
      return;
    }
    routeTo(true);
    if (latest.current.activeTab === 'locations') {
      setDeleteCheck(null);
      latest.current.deleteCheck = null;
      loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, replaceRoute: false });
    }
  }

  function addSearchFilterForCurrentView(filter) {
    const nextFilters = addSearchFilter(latest.current.searchFilters, filter);
    commitSearchState({ filters: nextFilters });
  }

  function removeSearchFilterForCurrentView(filterKey) {
    const nextFilters = removeSearchFilter(latest.current.searchFilters, filterKey);
    commitSearchState({ filters: nextFilters });
  }

  function groupSearchFiltersForCurrentView(filterKeys, operator) {
    const nextFilters = groupSearchFilters(latest.current.searchFilters, filterKeys, operator);
    commitSearchState({ filters: nextFilters });
  }

  function replaceSearchFilterStateForCurrentView(nextQuery, nextFilters) {
    commitSearchState({ query: nextQuery, filters: nextFilters });
  }

  async function setDuplicateScanSelection(nextScanIds) {
    const uniqueScanIds = [...new Set((nextScanIds || []).filter(Boolean))];
    setSelectedDuplicateScanIds(uniqueScanIds);
    latest.current.selectedDuplicateScanIds = uniqueScanIds;
    routeTo(true);
    setBusy(true);
    try {
      await loadDuplicateGroups(uniqueScanIds);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function setDuplicateView(view) {
    const nextView = view === 'tree' ? 'tree' : 'flat';
    setDuplicateViewState(nextView);
    latest.current.duplicateView = nextView;
    routeTo(true);
  }

  function toggleColumn(column) {
    if (column === 'name') return;
    setVisibleColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column]);
  }

  function toggleGridSelection(entry) {
    if (!entry?.path || entry.kind === 'parent') return;
    setSelectedGridPaths((current) => {
      const next = current.includes(entry.path)
        ? current.filter((path) => path !== entry.path)
        : [...current, entry.path];
      latest.current.selectedGridPaths = next;
      return next;
    });
  }

  function setGridSelection(entries) {
    const next = (entries || [])
      .filter((entry) => entry?.path && entry.kind !== 'parent')
      .map((entry) => entry.path);
    setSelectedGridPaths(next);
    latest.current.selectedGridPaths = next;
  }

  function clearGridSelection() {
    setSelectedGridPaths([]);
    latest.current.selectedGridPaths = [];
  }

  function openGridEntry(entry) {
    if (entry.kind === 'parent' || entry.kind === 'dir') loadTree(entry.path);
  }

  async function inspectFile(entry) {
    const scanId = entry?.scan_id || latest.current.selectedScanId;
    if (!scanId || !entry?.path || entry.kind !== 'file' || !entry.blake3 || entry.size == null) return;
    setBusy(true);
    try {
      const details = await rpc('files.details', {
        scan_id: scanId,
        path: entry.path,
        blake3: entry.blake3,
        size: entry.size
      });
      const nextFileInfo = { ...details, file: { ...entry, scan_id: scanId } };
      setFileInfo(nextFileInfo);
      latest.current.fileInfo = nextFileInfo;
      setShowFileInfo(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreFileOccurrences() {
    const current = fileInfo;
    const scanId = current?.file?.scan_id;
    const path = current?.file?.path;
    const blake3 = current?.file?.blake3;
    const size = current?.file?.size;
    if (!scanId || !path || !blake3 || size == null || current.occurrence_next_offset == null) return;
    setBusy(true);
    try {
      const page = await rpc('files.occurrences', {
        scan_id: scanId,
        path,
        blake3,
        size,
        limit: current.occurrence_limit || 100,
        offset: current.occurrence_next_offset
      });
      setFileInfo((latestInfo) => {
        if (!latestInfo || latestInfo.file.scan_id !== scanId || latestInfo.file.path !== path || latestInfo.file.blake3 !== blake3 || latestInfo.file.size !== size) {
          return latestInfo;
        }
        const nextFileInfo = {
          ...latestInfo,
          occurrences: [...(latestInfo.occurrences || []), ...(page.occurrences || [])],
          occurrence_count: page.total,
          occurrence_limit: page.limit,
          occurrence_offset: page.offset,
          occurrences_truncated: page.has_more,
          occurrence_next_offset: page.next_offset ?? null
        };
        latest.current.fileInfo = nextFileInfo;
        return nextFileInfo;
      });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function requestBuildThumbnails(entries = selectedGridEntries) {
    if (!selectedScanId) return;
    const selectedEntries = (entries || []).filter((entry) => entry?.path && entry.kind !== 'parent');
    setBuildThumbnailRequest(selectedEntries.length
      ? {
          scan_id: selectedScanId,
          path: selectedPath,
          paths: selectedEntries.map((entry) => entry.path),
          label: `${selectedEntries.length} selected ${selectedEntries.length === 1 ? 'item' : 'items'}`
        }
      : { scan_id: selectedScanId, path: selectedPath, label: selectedPath || 'root' });
    setShowBuildThumbnails(true);
  }

  function requestBuildThumbnailsForEntry(entry) {
    if (!entry?.path || entry.kind === 'parent') return;
    requestBuildThumbnails([entry]);
  }

  async function buildThumbnails(recursive) {
    if (!buildThumbnailRequest) return;
    setBusy(true);
    try {
      const result = await rpc('thumbnails.build', { ...buildThumbnailRequest, recursive });
      setShowBuildThumbnails(false);
      setBuildThumbnailRequest(null);
      setMessage(`Built ${result.built} thumbnails. Skipped ${result.skipped} of ${result.considered} candidates.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openOccurrence(occurrence) {
    if (!occurrence?.scan_id || !occurrence?.path) return;
    setBusy(true);
    try {
      await rpc('files.open', { scan_id: occurrence.scan_id, path: occurrence.path });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function revealOccurrence(occurrence) {
    if (!occurrence?.scan_id || !occurrence?.path) return;
    setBusy(true);
    try {
      await rpc('files.reveal', { scan_id: occurrence.scan_id, path: occurrence.path });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const loadFlatPage = useCallback(
    async (path, backup, offset, limit = 500) =>
      requireTreePage(
        await rpc('scans.tree', {
          scan_id: latest.current.selectedScanId,
          path: path || '',
          flat: true,
          backup: backup || 'all',
          limit,
          offset: offset || 0
        })
      ),
    [rpc]
  );

  const commonLocationProps = {
    onLoadFlat: loadFlatPage,
    locationList,
    selectedLocationSlug,
    selectedLocationView,
    selectedScanView,
    selectedScanId,
    busy,
    deleteCheck,
    deleteCheckPath,
    scanSubview,
    selectedPath,
    pathHistoryIndex,
    pathHistory,
    showColumns,
    fileColumns,
    visibleColumns,
    gridVisibleColumns,
    visibleGridRows,
    directoryTreeNodes: visibleDirectoryTreeNodes,
    directoryTreeExpandedPaths,
    directoryTreeLoadingPaths: visibleDirectoryTreeLoadingPaths,
    query,
    setQuery: updateSearchQuery,
    searchFilters,
    locations: locationList,
    selectedGridPaths,
    selectedGridEntries,
    locationsLoading: refreshing && !locationList.length,
    scansLoading: refreshing,
    filesLoading: treeLoading,
    onShowAddLocation: () => setShowAddLocation(true),
    onChooseLocation: chooseLocation,
    onOpenEditLocation: openEditLocation,
    onSetLocationDisabled: setLocationDisabled,
    onRequestDeleteLocation: requestDeleteLocation,
    onStartScan: openScanStart,
    onSelectScan: selectScan,
    onStopScan: stopScan,
    onPauseScan: pauseScan,
    onResumeScan: resumeScan,
    onUpdateScan: startUpdateScan,
    onRepairScan: startRepairScan,
    onSetRepresentative: setRepresentativeScan,
    onClearRepresentative: clearRepresentativeScan,
    onRunDeleteCheck: runDeleteCheck,
    deleteCheckStaged,
    onStageDeleteCheck: stageForDeleteCheck,
    onRemoveDeleteCheckStage: removeFromDeleteCheckStage,
    onClearDeleteCheckStage: clearDeleteCheckStage,
    onRunStagedDeleteCheck: runStagedDeleteCheck,
    onOpenScanExcludes: openScanExcludes,
    onOpenScanNotes: openScanNotes,
    onRequestDeleteScan: requestDeleteScan,
    onCloseDeleteCheck: closeDeleteCheck,
    onSetScanSubview: setScanSubview,
    onGoBack: goBack,
    onGoForward: goForward,
    onGoParent: goParent,
    onBrowseCurrentFolder: browseCurrentFolder,
    onRequestBuildThumbnails: requestBuildThumbnails,
    onRequestBuildThumbnailsForEntry: requestBuildThumbnailsForEntry,
    onToggleColumns: () => setShowColumns((value) => !value),
    onToggleColumn: toggleColumn,
    onCommitSearch: commitSearchState,
    onAddSearchFilter: addSearchFilterForCurrentView,
    onRemoveSearchFilter: removeSearchFilterForCurrentView,
    onGroupSearchFilters: groupSearchFiltersForCurrentView,
    onReplaceSearchFilterState: replaceSearchFilterStateForCurrentView,
    onToggleGridSelection: toggleGridSelection,
    onSetGridSelection: setGridSelection,
    onClearGridSelection: clearGridSelection,
    onLoadTree: loadTree,
    onToggleDirectoryTree: toggleDirectoryTree,
    onLoadMoreDirectoryTree: loadMoreDirectoryTree,
    onOpenGridEntry: openGridEntry,
    onInspectFile: inspectFile,
    onRequestExcludePath: requestExcludePath,
    onRequestDeletePath: requestDeletePath
  };

  const currentViewCommands = [];
  if (activeTab === 'locations' && selectedScanView) {
    if (isActiveStatus(selectedScanView.status) && selectedScanView.status !== 'stopping') {
      currentViewCommands.push({
        id: 'stop-scan',
        label: 'Stop scan',
        detail: `Stop the active scan for ${selectedScanView.location_slug}.`,
        keywords: 'cancel running scan',
        iconName: 'stop',
        disabled: busy,
        onSelect: () => void stopScan(selectedScanView.id)
      });
    }
    if (!isActiveStatus(selectedScanView.status)) {
      currentViewCommands.push({
        id: 'update-scan',
        label: 'Update scan',
        detail: `Create an update scan from ${selectedScanView.id}.`,
        keywords: 'rescan refresh scan',
        iconName: 'update',
        disabled: busy,
        onSelect: () => void startUpdateScan(selectedScanView.id)
      });
    }

    currentViewCommands.push(
      {
        id: 'open-scan-excludes',
        label: 'Edit scan excludes',
        detail: 'Set the non-destructive filters used by this scan.',
        keywords: 'filter ignore exclude patterns',
        iconName: 'exclude',
        disabled: busy,
        onSelect: () => void openScanExcludes(selectedScanView)
      },
      {
        id: 'edit-scan-notes',
        label: selectedScanView.notes ? 'Edit scan notes' : 'Add scan notes',
        detail: 'Keep a note attached to this scan.',
        keywords: 'annotation comment notes',
        iconName: 'edit',
        disabled: busy,
        onSelect: () => openScanNotes(selectedScanView)
      },
      {
        id: 'run-delete-check',
        label: 'Run delete check',
        detail: 'Check the selected scan contents before any destructive action.',
        keywords: 'missing files verify safety',
        iconName: 'deleteCheck',
        disabled: busy,
        onSelect: () => void runDeleteCheck(selectedScanView.id)
      },
      {
        id: 'build-thumbnails',
        label: selectedGridEntries.length ? 'Build thumbnails for selected items' : 'Build thumbnails for this folder',
        detail: selectedGridEntries.length
          ? `${selectedGridEntries.length} selected ${selectedGridEntries.length === 1 ? 'item' : 'items'}.`
          : `Current folder: ${selectedPath || 'scan root'}.`,
        keywords: 'preview image media thumbnails',
        iconName: 'thumbnails',
        disabled: busy,
        onSelect: () => requestBuildThumbnails()
      }
    );

    if (selectedScanView.is_representative) {
      currentViewCommands.push({
        id: 'clear-representative',
        label: 'Clear representative scan',
        detail: 'Remove this scan from duplicate-detection defaults.',
        keywords: 'duplicates representative default',
        iconName: 'representative',
        disabled: busy,
        onSelect: () => void clearRepresentativeScan(selectedScanView.id)
      });
    } else {
      currentViewCommands.push({
        id: 'set-representative',
        label: 'Use for duplicates',
        detail: 'Use this scan as the duplicate-detection representative.',
        keywords: 'duplicates representative default',
        iconName: 'representative',
        disabled: busy,
        onSelect: () => void setRepresentativeScan(selectedScanView.id)
      });
    }

    if (!isActiveStatus(selectedScanView.status)) {
      currentViewCommands.push({
        id: 'delete-scan',
        label: 'Delete scan',
        detail: 'Open a confirmation before removing this scan record.',
        keywords: 'remove scan destructive confirm',
        iconName: 'delete',
        disabled: busy,
        onSelect: () => requestDeleteScan(selectedScanView.id)
      });
    }

    if (selectedPath) {
      currentViewCommands.push({
        id: 'go-parent-folder',
        label: 'Go to parent folder',
        detail: `Parent of ${selectedPath}.`,
        keywords: 'up folder tree navigation',
        iconName: 'parent',
        disabled: busy,
        onSelect: goParent
      });
    }
    if (pathHistoryIndex > 0) {
      currentViewCommands.push({
        id: 'go-back',
        label: 'Go back',
        detail: 'Return to the previous folder in this scan.',
        keywords: 'folder history navigation',
        iconName: 'back',
        disabled: busy,
        onSelect: goBack
      });
    }
    if (pathHistoryIndex < pathHistory.length - 1) {
      currentViewCommands.push({
        id: 'go-forward',
        label: 'Go forward',
        detail: 'Return to the next folder in this scan.',
        keywords: 'folder history navigation',
        iconName: 'forward',
        disabled: busy,
        onSelect: goForward
      });
    }
    if (selectedGridEntries.length) {
      currentViewCommands.push({
        id: 'clear-file-selection',
        label: 'Clear file selection',
        detail: `Clear ${selectedGridEntries.length} selected ${selectedGridEntries.length === 1 ? 'item' : 'items'}.`,
        keywords: 'files selection clear',
        iconName: 'close',
        onSelect: clearGridSelection
      });
    }

    const selectedFile = selectedGridEntries.length === 1 && selectedGridEntries[0].kind === 'file'
      ? selectedGridEntries[0]
      : null;
    if (selectedFile) {
      const occurrence = { ...selectedFile, scan_id: selectedScanView.id };
      currentViewCommands.push(
        {
          id: 'inspect-selected-file',
          label: 'Inspect selected file',
          detail: selectedFile.path,
          keywords: 'file details metadata occurrences',
          iconName: 'preview',
          disabled: busy,
          onSelect: () => void inspectFile(selectedFile)
        },
        {
          id: 'open-selected-file',
          label: 'Open selected file',
          detail: selectedFile.path,
          keywords: 'launch file default application',
          iconName: 'openFile',
          disabled: busy,
          onSelect: () => void openOccurrence(occurrence)
        },
        {
          id: 'reveal-selected-file',
          label: 'Reveal selected file',
          detail: selectedFile.path,
          keywords: 'finder explorer folder reveal',
          iconName: 'revealFile',
          disabled: busy,
          onSelect: () => void revealOccurrence(occurrence)
        }
      );
    }
  } else if (activeTab === 'locations' && selectedLocationView) {
    currentViewCommands.push(
      {
        id: 'edit-location',
        label: 'Edit location',
        detail: selectedLocationView.root_path,
        keywords: 'source location settings path',
        iconName: 'edit',
        disabled: busy,
        onSelect: () => openEditLocation(selectedLocationView)
      },
      {
        id: selectedLocationView.disabled ? 'enable-location-duplicates' : 'disable-location-duplicates',
        label: selectedLocationView.disabled ? 'Enable duplicate detection' : 'Disable duplicate detection',
        detail: selectedLocationView.disabled
          ? 'Include this location in duplicate detection again.'
          : 'Exclude this location from duplicate detection without deleting scans.',
        keywords: 'duplicates location enable disable',
        iconName: selectedLocationView.disabled ? 'enable' : 'disable',
        disabled: busy,
        onSelect: () => void setLocationDisabled(selectedLocationView, !selectedLocationView.disabled)
      }
    );

    if (selectedLocationView.connected && !selectedLocationView.activeScan) {
      currentViewCommands.push({
        id: 'start-location-scan',
        label: 'Scan location now',
        detail: `Start a new scan for ${selectedLocationView.slug}.`,
        keywords: 'scan start index files',
        iconName: 'scan',
        disabled: busy,
        onSelect: () => openScanStart(selectedLocationView.slug)
      });
    }
    if (selectedLocationView.connected) {
      currentViewCommands.push({
        id: 'browse-location-folder',
        label: 'Open location folder',
        detail: selectedLocationView.root_path,
        keywords: 'open finder explorer source folder',
        iconName: 'currentFolder',
        disabled: busy,
        onSelect: () => void browseCurrentFolder(selectedLocationView)
      });
    }
    if (!selectedLocationView.activeScan) {
      currentViewCommands.push({
        id: 'delete-location',
        label: 'Delete location',
        detail: 'Open a confirmation before removing this location and its scans.',
        keywords: 'remove source destructive confirm',
        iconName: 'delete',
        disabled: busy,
        onSelect: () => requestDeleteLocation(selectedLocationView.slug)
      });
    }
  }

  const commandGroups = [
    {
      id: 'navigation',
      label: 'Navigation',
      commands: [
        { id: 'dashboard', label: 'Dashboard', detail: 'Overview and active work.', keywords: 'home activity', iconName: 'dashboard', onSelect: () => setTab('dashboard') },
        { id: 'locations', label: 'Locations', detail: 'Browse source locations and scans.', keywords: 'sources folders scans', iconName: 'locations', onSelect: () => setTab('locations') },
        { id: 'duplicates', label: 'Duplicates', detail: 'Review exact-content matches.', keywords: 'copies hashes matches', iconName: 'duplicates', onSelect: () => setTab('duplicates') },
        { id: 'search', label: 'Search', detail: 'Find indexed files.', keywords: 'files paths names', iconName: 'searchFiles', onSelect: () => setTab('search') },
        { id: 'tasks', label: 'Tasks', detail: 'Monitor active scanner work.', keywords: 'progress running jobs', iconName: 'tasks', onSelect: () => setTab('tasks') },
        { id: 'options', label: 'Options', detail: 'Choose the active database.', keywords: 'settings database', iconName: 'options', onSelect: () => setTab('options') }
      ]
    },
    {
      id: 'locations',
      label: 'Locations',
      commands: locationList.map((location) => ({
        id: `location-${location.slug}`,
        label: `Open ${location.name || location.slug}`,
        detail: `${location.slug} · ${location.scanCount} ${location.scanCount === 1 ? 'scan' : 'scans'}`,
        keywords: `${location.slug} ${location.root_path || ''} source location`,
        iconName: 'locations',
        onSelect: () => chooseLocation(location.slug)
      }))
    },
    {
      id: 'scans',
      label: 'Scans',
      commands: scans.map((scan) => {
        const location = locationList.find((item) => item.slug === scan.location_slug);
        const locationName = location?.name || scan.location_name || scan.location_slug;
        return {
          id: `scan-${scan.id}`,
          label: `Open ${locationName} scan`,
          detail: `${scan.status} · ${Number(scan.file_count || 0).toLocaleString()} files · ${scan.id}`,
          keywords: `${scan.id} ${scan.location_slug} ${locationName} scan ${scan.status}`,
          iconName: 'file',
          onSelect: () => void selectScan(scan.id, scan.location_slug)
        };
      })
    },
    ...(currentViewCommands.length ? [{ id: 'current-view', label: 'Current view', commands: currentViewCommands }] : []),
    {
      id: 'actions',
      label: 'Actions',
      commands: [
        {
          id: 'refresh',
          label: 'Refresh',
          detail: 'Reload locations, scans, and active work.',
          keywords: 'reload sync data',
          iconName: 'refresh',
          disabled: busy,
          onSelect: () => void refresh()
        },
        {
          id: 'add-location',
          label: 'Add location',
          detail: 'Register a new source location.',
          keywords: 'new source folder volume',
          iconName: 'add',
          disabled: busy,
          onSelect: () => setShowAddLocation(true)
        }
      ]
    }
  ];

  const dashboardActivityState = wsStatus === 'live'
    ? 'live'
    : wsStatus === 'connecting'
      ? 'initial-loading'
      : 'disconnected';

  const topBarActions = activeTab === 'locations'
    ? selectedScanView
      ? (
        <>
          {isActiveStatus(selectedScanView.status) && selectedScanView.status !== 'stopping' && (
            <Button variant="warning" onClick={() => stopScan(selectedScanView.id)} disabled={busy} icon={<Icon name="stop" />}>Stop</Button>
          )}
          {!isActiveStatus(selectedScanView.status) && (
            <Button variant="secondary" onClick={() => startUpdateScan(selectedScanView.id)} disabled={busy} icon={<Icon name="update" />}>Update scan</Button>
          )}
          {selectedScanView.is_representative ? (
            <Button variant="warning" onClick={() => clearRepresentativeScan(selectedScanView.id)} disabled={busy} icon={<Icon name="representative" />}>Clear representative</Button>
          ) : (
            <Button variant="secondary" onClick={() => setRepresentativeScan(selectedScanView.id)} disabled={busy} icon={<Icon name="representative" />}>Use for duplicates</Button>
          )}
          <Button variant="secondary" onClick={() => openScanExcludes(selectedScanView)} disabled={busy} icon={<Icon name="exclude" />}>Excludes</Button>
          <Button variant="secondary" onClick={() => openScanNotes(selectedScanView)} disabled={busy} icon={<Icon name="edit" />}>{selectedScanView.notes ? 'Edit notes' : 'Add notes'}</Button>
          {!isActiveStatus(selectedScanView.status) && (
            <Button variant="danger" onClick={() => requestDeleteScan(selectedScanView.id)} disabled={busy} icon={<Icon name="delete" />}>Delete scan</Button>
          )}
        </>
      )
      : selectedLocationView
        ? (
          <>
            <Button variant="secondary" onClick={() => openEditLocation(selectedLocationView)} disabled={busy} icon={<Icon name="edit" />}>Edit</Button>
            <Button variant="warning" onClick={() => setLocationDisabled(selectedLocationView, !selectedLocationView.disabled)} disabled={busy} icon={<Icon name={selectedLocationView.disabled ? 'enable' : 'disable'} />}>{selectedLocationView.disabled ? 'Enable dupes' : 'Disable dupes'}</Button>
            {!selectedLocationView.activeScan && (
              <Button variant="danger" onClick={() => requestDeleteLocation(selectedLocationView.slug)} disabled={busy} icon={<Icon name="delete" />}>Delete location</Button>
            )}
            <Button
              onClick={() => openScanStart(selectedLocationView.slug)}
              disabled={busy || !selectedLocationView.connected}
              title={selectedLocationView.connected ? undefined : 'This location is disconnected — reconnect the drive or edit the location to scan.'}
              icon={<Icon name="scan" />}
            >Scan now</Button>
          </>
        )
        : <Button onClick={() => setShowAddLocation(true)} disabled={busy} icon={<Icon name="add" />}>Add location</Button>
    : null;

  return (
    <Shell
      message={message}
      wsStatus={wsStatus}
      statusDetail={statusDetail}
      eventLog={eventLog}
      runningProgress={runningProgress}
      activeTab={activeTab}
      setTab={setTab}
      refresh={refresh}
      busy={busy}
      databaseInfo={databaseInfo}
      canChooseDatabase={desktopRuntime}
      onChooseDatabase={chooseDatabaseLocation}
      locationList={locationList}
      selectedLocationSlug={selectedLocationSlug}
      selectedScanId={selectedScanId}
      onChooseLocation={chooseLocation}
      onSelectScan={selectScan}
      onShowAddLocation={() => setShowAddLocation(true)}
      commandGroups={commandGroups}
      topBarActions={topBarActions}
    >
      {activeTab === 'dashboard' && (
        <DashboardPage
          overview={overview}
          liveScans={runningProgress}
          backgroundTasks={[]}
          eventLog={eventLog}
          activityState={dashboardActivityState}
          activityDetail={statusDetail}
        />
      )}
      {activeTab === 'tasks' && (
        <TasksPage
          runningProgress={runningProgress}
          backgroundTasks={[]}
          eventLog={eventLog}
          busy={busy}
          onStopScan={stopScan}
          onPauseScan={pauseScan}
          onResumeScan={resumeScan}
        />
      )}
      {activeTab === 'locations' && <LocationsPage {...commonLocationProps} />}
      {activeTab === 'options' && (
        <OptionsPage
          databaseInfo={databaseInfo}
          canChooseDatabase={desktopRuntime}
          busy={busy}
          onChooseDatabase={chooseDatabaseLocation}
        />
      )}
      {activeTab === 'duplicates' && (
        <DuplicatesPage
          query={query}
          setQuery={updateSearchQuery}
          filters={searchFilters}
          locations={locationList}
          scans={scans}
          busy={busy}
          filteredDupes={filteredDupes}
          selectedScanIds={selectedDuplicateScanIds}
          duplicateView={duplicateView}
          loading={duplicatesLoading || (refreshing && !scans.length && !dupes.length)}
          onCommitSearch={commitSearchState}
          onAddFilter={addSearchFilterForCurrentView}
          onRemoveFilter={removeSearchFilterForCurrentView}
          onGroupFilters={groupSearchFiltersForCurrentView}
          onReplaceFilterState={replaceSearchFilterStateForCurrentView}
          onSetSelectedScanIds={setDuplicateScanSelection}
          onSetDuplicateView={setDuplicateView}
          onOpenDuplicate={inspectFile}
        />
      )}
      {activeTab === 'search' && (
        <SearchPage
          query={query}
          setQuery={updateSearchQuery}
          filters={searchFilters}
          locations={locationList}
          scans={scans}
          results={results}
          busy={busy}
          loading={searchLoading}
          searchAllScans={searchAllScans}
          selectedScanIds={selectedSearchScanIds}
          onSearch={search}
          onSetSearchAllScans={setSearchAllScanScope}
          onSetSelectedScanIds={setSearchScanSelection}
          onAddFilter={addSearchFilterForCurrentView}
          onRemoveFilter={removeSearchFilterForCurrentView}
          onGroupFilters={groupSearchFiltersForCurrentView}
          onReplaceFilterState={replaceSearchFilterStateForCurrentView}
          onInspectResult={inspectFile}
        />
      )}
      <AppModals
        showAddLocation={showAddLocation}
        setShowAddLocation={setShowAddLocation}
        showEditLocation={showEditLocation}
        setShowEditLocation={setShowEditLocation}
        showScanNotes={showScanNotes}
        setShowScanNotes={setShowScanNotes}
        showScanExcludes={showScanExcludes}
        setShowScanExcludes={setShowScanExcludes}
        showFileInfo={showFileInfo}
        setShowFileInfo={setShowFileInfo}
        showBuildThumbnails={showBuildThumbnails}
        setShowBuildThumbnails={setShowBuildThumbnails}
        confirmDeleteScanId={confirmDeleteScanId}
        setConfirmDeleteScanId={setConfirmDeleteScanId}
        confirmDeletePath={confirmDeletePath}
        setConfirmDeletePath={setConfirmDeletePath}
        confirmDeleteLocationSlug={confirmDeleteLocationSlug}
        setConfirmDeleteLocationSlug={setConfirmDeleteLocationSlug}
        form={form}
        setForm={setForm}
        editForm={editForm}
        setEditForm={setEditForm}
        canChooseNativeFolder={desktopRuntime}
        onChooseLocationFolder={chooseLocationFolder}
        scanNotesForm={scanNotesForm}
        setScanNotesForm={setScanNotesForm}
        scanExcludesForm={scanExcludesForm}
        setScanExcludesForm={setScanExcludesForm}
        scanStartForm={scanStartForm}
        setScanStartForm={setScanStartForm}
        onConfirmScanStart={confirmScanStart}
        fileInfo={fileInfo}
        buildThumbnailRequest={buildThumbnailRequest}
        busy={busy}
        onAddLocation={addLocation}
        onUpdateLocation={updateLocation}
        onUpdateScanNotes={updateScanNotes}
        onUpdateScanExcludes={updateScanExcludes}
        onDeleteScan={deleteScan}
        onDeleteScanPath={deleteScanPath}
        onDeleteLocation={deleteLocation}
        onOpenOccurrence={openOccurrence}
        onRevealOccurrence={revealOccurrence}
        onRevealFileInScan={revealOccurrence}
        onLoadMoreFileOccurrences={loadMoreFileOccurrences}
        onBuildThumbnails={buildThumbnails}
      />
    </Shell>
  );
}

function gridRows(treeEntries, selectedPath) {
  const rows = selectedPath ? [{ name: '..', path: parentPath(selectedPath), kind: 'parent', size: 0, file_count: 0 }] : [];
  return [...rows, ...treeEntries];
}

function duplicateText(file, group) {
  return [
    file?.location_slug,
    file?.location_name,
    file?.path,
    file?.name,
    file?.blake3,
    file?.sha256,
    group?.blake3,
    group?.size == null ? '' : String(group.size)
  ].join(' ').toLowerCase();
}

function parseScanIds(value) {
  if (!value) return [];
  return [...new Set(value.split(',').map((scanId) => scanId.trim()).filter(Boolean))];
}

function uniqueScanIds(scanIds) {
  return [...new Set((scanIds || []).filter(Boolean))];
}

function parentPath(selectedPath) {
  if (!selectedPath) return '';
  const parts = selectedPath.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function pathHistoryFor(path) {
  const history = [''];
  let current = '';
  for (const segment of path.split('/').filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    history.push(current);
  }
  return history;
}
