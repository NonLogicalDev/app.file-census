import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseDatabase, chooseFolder, databaseInfo as loadDatabaseInfo, isTauriRuntime } from './api/desktopDatabase.js';
import { requireTreePage } from './api/treePage.js';
import { useRpcConnection } from './api/useRpcConnection.js';
import AppModals from './components/AppModals.jsx';
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

export default function App() {
  const [overview, setOverview] = useState(null);
  const [locations, setLocations] = useState([]);
  const [scans, setScans] = useState([]);
  const [dupes, setDupes] = useState([]);
  const [selectedDuplicateScanIds, setSelectedDuplicateScanIds] = useState([]);
  const [duplicateView, setDuplicateViewState] = useState('flat');
  const [searchView, setSearchViewState] = useState('flat');
  const [results, setResults] = useState([]);
  const [scanProgress, setScanProgress] = useState({});
  const [treeEntries, setTreeEntries] = useState([]);
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
  const treeReloadTimer = useRef(null);
  const lagRecoveryTimer = useRef(null);
  const hydratingProgress = useRef(new Set());
  const refreshRef = useRef(null);
  const loadTreeRef = useRef(null);
  const treeAbortController = useRef(null);
  const searchRef = useRef(null);
  const pendingRouteSearch = useRef(false);

  Object.assign(latest.current, { locations, scans, dupes, selectedDuplicateScanIds, duplicateView, searchView, scanProgress, selectedLocationSlug, selectedScanId, selectedPath, scanSubview, activeTab, query, searchFilters, pathHistory, pathHistoryIndex, deleteCheck, selectedGridPaths });

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

  const handleEvent = useCallback((appEvent) => {
    if (isUserVisibleEvent(appEvent)) {
      setEventLog((current) => [appEvent, ...current].slice(0, 40));
    }
    if (appEvent.kind === 'events_lagged') {
      scheduleLagRecovery();
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
    if (appEvent.kind === 'scan_excludes_updated' && appEvent.payload?.scan_id === latest.current.selectedScanId) {
      scheduleTreeReload();
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
    if (['database_changed', 'location_added', 'location_updated', 'location_deleted', 'scan_started', 'scan_update_started', 'scan_repair_started', 'scan_finished', 'scan_stopped', 'scan_failed', 'scan_paused', 'scan_resumed', 'scan_deleted', 'scan_path_deleted', 'scan_representative_set', 'scan_notes_updated', 'scan_excludes_updated', 'scan_recovery_completed'].includes(appEvent.kind)) {
      refreshRef.current?.();
    }
  }, [mergeProgress]);

  const { rpc, status: wsStatus, statusDetail } = useRpcConnection({ onEvent: handleEvent, onOpen: () => refreshRef.current?.() });

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
  const showingDeleteCheck = scanSubview === 'delete-check';
  const fileGridRows = useMemo(() => gridRows(treeEntries, selectedPath), [treeEntries, selectedPath]);
  const deleteCheckRows = useMemo(() => deleteCheck ? (deleteCheck.safe ? deleteCheck.checked_files : deleteCheck.missing_files) : [], [deleteCheck]);
  const hasSearchParams = useMemo(() => Boolean(query.trim() || searchFilters.length), [query, searchFilters]);
  const visibleGridRows = showingDeleteCheck ? deleteCheckRows : fileGridRows;
  const selectedGridEntries = useMemo(() => {
    const selected = new Set(selectedGridPaths);
    return fileGridRows.filter((row) => row.kind !== 'parent' && selected.has(row.path));
  }, [fileGridRows, selectedGridPaths]);
  const gridVisibleColumns = useMemo(() => showingDeleteCheck ? visibleColumns.filter((column) => column !== 'path') : visibleColumns, [showingDeleteCheck, visibleColumns]);
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
      if (state.searchView && state.searchView !== 'flat') params.set('view', state.searchView);
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
      const nextDuplicateScanIds = parseDuplicateScanIds(url.searchParams.get('scans'));
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
      const nextSearchView = url.searchParams.get('view') === 'tree' ? 'tree' : 'flat';
      setQuery(nextQuery);
      setSearchFilters(nextSearchFilters);
      setSearchViewState(nextSearchView);
      Object.assign(latest.current, { activeTab: 'search', query: nextQuery, searchFilters: nextSearchFilters, searchView: nextSearchView });
      pendingRouteSearch.current = Boolean(nextQuery.trim() || nextSearchFilters.length);
      return;
    }
    const nextLocationSlug = parts[0] === 'locations' && parts[1] ? decodeURIComponent(parts[1]) : null;
    const nextScanId = parts[2] === 'scans' && parts[3] ? decodeURIComponent(parts[3]) : null;
    const nextPath = nextScanId ? url.searchParams.get('path') || '' : '';
    const routeView = url.searchParams.get('view');
    const nextQuery = url.searchParams.get('q') || '';
    const nextSearchFilters = decodeSearchFilters(url.searchParams.get('filters'));
    const nextScanSubview = nextScanId && routeView === 'delete-check' ? 'delete-check' : 'files';
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
      const nextDupes = await rpc('dupes.list', { limit: 100, scan_ids: nextSelectedDuplicateScanIds });
      setOverview(nextOverview);
      setLocations(nextLocations);
      setScans(nextScans);
      setDupes(nextDupes);
      if (nextSelectedDuplicateScanIds.length !== (latest.current.selectedDuplicateScanIds || []).length) {
        setSelectedDuplicateScanIds(nextSelectedDuplicateScanIds);
        latest.current.selectedDuplicateScanIds = nextSelectedDuplicateScanIds;
      }
      latest.current.locations = nextLocations;
      latest.current.scans = nextScans;
      latest.current.dupes = nextDupes;
      mergeProgress(running);
      ensureSelection(nextLocations);
      routeTo(true);
      await loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, preserveDeleteCheck: true });
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
  }, [wsStatus, activeTab, query, searchFilters]);

  function scheduleTreeReload() {
    if (latest.current.deleteCheck || treeReloadTimer.current) return;
    treeReloadTimer.current = window.setTimeout(() => {
      treeReloadTimer.current = null;
      loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, replaceRoute: false });
    }, 700);
  }

  function scheduleLagRecovery() {
    if (lagRecoveryTimer.current) return;
    lagRecoveryTimer.current = window.setTimeout(() => {
      lagRecoveryTimer.current = null;
      refreshRef.current?.();
    }, 1000);
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
    const nextView = view === 'delete-check' ? 'delete-check' : 'files';
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
    if (!location?.connected) return;
    setBusy(true);
    try {
      await rpc('locations.open_folder', { slug: location.slug, path: latest.current.selectedPath });
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

  async function startScan(slug) {
    setBusy(true);
    try {
      setDeleteCheck(null);
      const result = await rpc('scans.start', { slug, offset: '/' });
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
      setScanProgress((current) => ({ ...current, [result.scan_id]: { scan_id: result.scan_id, location_slug: slug || '', location_name: location?.name || slug || '', status: 'repairing', file_count: 0, dir_count: 0, error_count: 0, total_bytes: 0, current_path: null, log: [`Repair scan queued from ${sourceScanId}`] } }));
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
      await rpc('scans.stop', { scan_id: scanId });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function pauseScan(scanId) {
    setBusy(true);
    try {
      await rpc('scans.pause', { scan_id: scanId });
      hydrateProgress(scanId);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resumeScan(scanId) {
    setBusy(true);
    try {
      await rpc('scans.resume', { scan_id: scanId });
      hydrateProgress(scanId);
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
      await loadTree(selectedPath, { updateHistory: false });
      await refresh();
      setMessage(`Saved ${excludes.length} scan ${excludes.length === 1 ? 'exclude' : 'excludes'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
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
      setSelectedGridPaths((current) => current.filter((path) => path !== entry.path));
      latest.current.selectedGridPaths = latest.current.selectedGridPaths.filter((path) => path !== entry.path);
      await loadTree(selectedPath, { updateHistory: false });
      await refresh();
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
    const activeQuery = String(options.query ?? latest.current.query ?? query).trim();
    const activeFilters = options.filters ?? latest.current.searchFilters ?? searchFilters;
    if (!activeQuery && !activeFilters.length) {
      setActiveTab('search');
      setQuery('');
      setSearchFilters([]);
      Object.assign(latest.current, { activeTab: 'search', query: '', searchFilters: [] });
      setResults([]);
      setSearchLoading(false);
      routeTo(true);
      return;
    }
    setBusy(true);
    setSearchLoading(true);
    try {
      setActiveTab('search');
      Object.assign(latest.current, { activeTab: 'search', query: activeQuery, searchFilters: activeFilters });
      routeTo(options.replaceRoute);
      setResults(await rpc('files.search', buildFileSearchQuery(activeQuery, activeFilters, { limit: 200 })));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
      setSearchLoading(false);
    }
  }
  searchRef.current = search;

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
    setSearchFilters(nextFilters);
    latest.current.searchFilters = nextFilters;
    routeTo(true);
    if (latest.current.activeTab === 'search') {
      searchRef.current?.({ replaceRoute: true, filters: nextFilters });
    }
  }

  function removeSearchFilterForCurrentView(filterKey) {
    const nextFilters = removeSearchFilter(latest.current.searchFilters, filterKey);
    setSearchFilters(nextFilters);
    latest.current.searchFilters = nextFilters;
    routeTo(true);
    if (latest.current.activeTab === 'search') {
      searchRef.current?.({ replaceRoute: true, filters: nextFilters });
    }
  }

  function groupSearchFiltersForCurrentView(filterKeys, operator) {
    const nextFilters = groupSearchFilters(latest.current.searchFilters, filterKeys, operator);
    setSearchFilters(nextFilters);
    latest.current.searchFilters = nextFilters;
    routeTo(true);
    if (latest.current.activeTab === 'search') {
      searchRef.current?.({ replaceRoute: true, filters: nextFilters });
    }
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

  function setSearchView(view) {
    const nextView = view === 'tree' ? 'tree' : 'flat';
    setSearchViewState(nextView);
    latest.current.searchView = nextView;
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
    if (!entry?.blake3 || !entry?.size) return;
    setBusy(true);
    try {
      const details = await rpc('files.details', { blake3: entry.blake3, size: entry.size });
      setFileInfo({ file: entry, ...details });
      setShowFileInfo(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreFileOccurrences() {
    const current = fileInfo;
    if (!current?.file?.blake3 || !current?.file?.size || current.occurrence_next_offset == null) return;
    setBusy(true);
    try {
      const page = await rpc('files.occurrences', {
        blake3: current.file.blake3,
        size: current.file.size,
        limit: current.occurrence_limit || 100,
        offset: current.occurrence_next_offset
      });
      setFileInfo((latestInfo) => {
        if (!latestInfo || latestInfo.file.blake3 !== current.file.blake3 || latestInfo.file.size !== current.file.size) {
          return latestInfo;
        }
        return {
          ...latestInfo,
          occurrences: [...(latestInfo.occurrences || []), ...(page.occurrences || [])],
          occurrence_count: page.total,
          occurrence_limit: page.limit,
          occurrence_offset: page.offset,
          occurrences_truncated: page.has_more,
          occurrence_next_offset: page.next_offset ?? null
        };
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
    setBusy(true);
    try {
      await rpc('files.open', { location_slug: occurrence.location_slug, path: occurrence.path });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function revealOccurrence(occurrence) {
    setBusy(true);
    try {
      await rpc('files.reveal', { location_slug: occurrence.location_slug, path: occurrence.path });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openFileReference(file) {
    setActiveTab('locations');
    setSelectedLocationSlug(file.location_slug);
    Object.assign(latest.current, { activeTab: 'locations', selectedLocationSlug: file.location_slug });
    selectScan(file.scan_id);
  }

  const commonLocationProps = {
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
    onStartScan: startScan,
    onSelectScan: selectScan,
    onStopScan: stopScan,
    onPauseScan: pauseScan,
    onResumeScan: resumeScan,
    onUpdateScan: startUpdateScan,
    onRepairScan: startRepairScan,
    onSetRepresentative: setRepresentativeScan,
    onClearRepresentative: clearRepresentativeScan,
    onRunDeleteCheck: runDeleteCheck,
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
    onOpenGridEntry: openGridEntry,
    onInspectFile: inspectFile,
    onRequestExcludePath: requestExcludePath,
    onRequestDeletePath: requestDeletePath
  };

  const topBarActions = activeTab === 'locations'
    ? selectedScanView
      ? (
        <>
          {isActiveStatus(selectedScanView.status) ? (
            <>
              {selectedScanView.status === 'paused' ? (
                <Button variant="secondary" onClick={() => resumeScan(selectedScanView.id)} disabled={busy} icon={<Icon name="resume" />}>Resume</Button>
              ) : selectedScanView.status !== 'stopping' ? (
                <Button variant="secondary" onClick={() => pauseScan(selectedScanView.id)} disabled={busy} icon={<Icon name="pause" />}>Pause</Button>
              ) : null}
              <Button variant="warning" onClick={() => stopScan(selectedScanView.id)} disabled={busy} icon={<Icon name="stop" />}>Stop</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => startUpdateScan(selectedScanView.id)} disabled={busy} icon={<Icon name="update" />}>Update scan</Button>
              <Button variant="secondary" onClick={() => startRepairScan(selectedScanView.id)} disabled={busy} icon={<Icon name="repair" />}>Repair scan</Button>
            </>
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
            <Button onClick={() => startScan(selectedLocationView.slug)} disabled={busy} icon={<Icon name="scan" />}>Scan now</Button>
          </>
        )
        : <Button onClick={() => setShowAddLocation(true)} disabled={busy} icon={<Icon name="add" />}>Add location</Button>
    : null;

  return (
    <Shell
      message={message}
      wsStatus={wsStatus}
      statusDetail={statusDetail}
      runningProgress={runningProgress}
      activeTab={activeTab}
      setTab={setTab}
      refresh={refresh}
      busy={busy}
      locationList={locationList}
      selectedLocationSlug={selectedLocationSlug}
      selectedScanId={selectedScanId}
      onChooseLocation={chooseLocation}
      onSelectScan={selectScan}
      onShowAddLocation={() => setShowAddLocation(true)}
      topBarActions={topBarActions}
    >
      {activeTab === 'dashboard' && (
        <DashboardPage
          overview={overview}
          locationList={locationList}
          scans={scans}
          eventLog={eventLog}
        />
      )}
      {activeTab === 'tasks' && (
        <TasksPage
          runningProgress={runningProgress}
          eventLog={eventLog}
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
          onOpenDuplicate={openFileReference}
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
          searchView={searchView}
          onSearch={search}
          onSetSearchView={setSearchView}
          onAddFilter={addSearchFilterForCurrentView}
          onRemoveFilter={removeSearchFilterForCurrentView}
          onGroupFilters={groupSearchFiltersForCurrentView}
          onReplaceFilterState={replaceSearchFilterStateForCurrentView}
          onOpenResult={openFileReference}
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

function parseDuplicateScanIds(value) {
  if (!value) return [];
  return [...new Set(value.split(',').map((scanId) => scanId.trim()).filter(Boolean))];
}

function parentPath(selectedPath) {
  if (!selectedPath) return '';
  const parts = selectedPath.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}
