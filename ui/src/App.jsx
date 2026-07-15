import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseDatabase, chooseFolder, databaseInfo as loadDatabaseInfo, isTauriRuntime } from './api/desktopDatabase.js';
import { useRpcConnection } from './api/useRpcConnection.js';
import AppModals from './components/AppModals.jsx';
import { Icon } from './components/Icon.jsx';
import Shell from './components/Shell.jsx';
import { Button } from './components/ui/index.jsx';
import DuplicatesPage from './pages/DuplicatesPage.jsx';
import LocationsPage from './pages/LocationsPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import { isActiveStatus } from './utils/format.js';

const fileColumns = [
  ['name', 'Name'],
  ['size', 'Size'],
  ['duplicate_file_count', 'Dup'],
  ['original_file_count', 'Uniq'],
  ['same_scan_duplicate_file_count', 'Scan Dup'],
  ['blake3', 'BLAKE3'],
  ['ctime', 'CTime'],
  ['mtime', 'Modified'],
  ['mode', 'Mode'],
  ['sha256', 'SHA-256']
];

const defaultColumns = ['name', 'size', 'duplicate_file_count', 'original_file_count', 'same_scan_duplicate_file_count', 'blake3', 'ctime', 'mtime'];

export default function App() {
  const [overview, setOverview] = useState(null);
  const [locations, setLocations] = useState([]);
  const [scans, setScans] = useState([]);
  const [dupes, setDupes] = useState([]);
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
  const [duplicateFilter, setDuplicateFilter] = useState('');
  const [activeTab, setActiveTab] = useState('locations');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [showScanNotes, setShowScanNotes] = useState(false);
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
  const [deleteCheckPath, setDeleteCheckPath] = useState('');
  const [buildThumbnailRequest, setBuildThumbnailRequest] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [desktopRuntime] = useState(() => isTauriRuntime());
  const [databaseInfo, setDatabaseInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const latest = useRef({});
  const refreshPromise = useRef(null);
  const treeRequestId = useRef(0);
  const treeReloadTimer = useRef(null);
  const hydratingProgress = useRef(new Set());
  const refreshRef = useRef(null);
  const loadTreeRef = useRef(null);

  Object.assign(latest.current, { locations, scans, scanProgress, selectedLocationSlug, selectedScanId, selectedPath, scanSubview, activeTab, query, duplicateFilter, pathHistory, pathHistoryIndex, deleteCheck, selectedGridPaths });

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
    setEventLog((current) => [appEvent, ...current].slice(0, 40));
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
    if (['database_changed', 'location_added', 'location_updated', 'location_deleted', 'scan_started', 'scan_update_started', 'scan_finished', 'scan_stopped', 'scan_failed', 'scan_deleted', 'scan_path_deleted', 'scan_representative_set', 'scan_notes_updated'].includes(appEvent.kind)) {
      refreshRef.current?.();
    }
  }, [mergeProgress]);

  const { rpc, status: wsStatus } = useRpcConnection({ onEvent: handleEvent, onOpen: () => refreshRef.current?.() });

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
  const visibleGridRows = showingDeleteCheck ? deleteCheckRows : fileGridRows;
  const selectedGridEntries = useMemo(() => {
    const selected = new Set(selectedGridPaths);
    return fileGridRows.filter((row) => row.kind !== 'parent' && selected.has(row.path));
  }, [fileGridRows, selectedGridPaths]);
  const gridVisibleColumns = useMemo(() => showingDeleteCheck ? visibleColumns.filter((column) => column !== 'path') : visibleColumns, [showingDeleteCheck, visibleColumns]);
  const runningProgress = useMemo(() => Object.values(scanProgress).filter((progress) => isActiveStatus(progress.status)), [scanProgress]);
  const filteredDupes = useMemo(() => {
    const needle = duplicateFilter.trim().toLowerCase();
    if (!needle) return dupes;
    return dupes.filter((group) => group.files.some((file) => `${file.location_slug} ${file.location_name} ${file.path}`.toLowerCase().includes(needle)));
  }, [dupes, duplicateFilter]);

  const routeTo = useCallback((replace = false) => {
    const state = latest.current;
    const params = new URLSearchParams();
    let path = '/locations';
    if (state.activeTab === 'duplicates') {
      path = '/duplicates';
      if (state.duplicateFilter.trim()) params.set('filter', state.duplicateFilter.trim());
    } else if (state.activeTab === 'search') {
      path = '/search';
      if (state.query.trim()) params.set('q', state.query.trim());
    } else if (state.selectedLocationSlug) {
      path = `/locations/${encodeURIComponent(state.selectedLocationSlug)}`;
      if (state.selectedScanId) {
        path += `/scans/${encodeURIComponent(state.selectedScanId)}`;
        if (state.selectedPath) params.set('path', state.selectedPath);
        if (state.scanSubview && state.scanSubview !== 'files') params.set('view', state.scanSubview);
      }
    }
    const next = `${path}${params.toString() ? `?${params}` : ''}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
  }, []);

  const parseRoute = useCallback(() => {
    const url = new URL(window.location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'duplicates') {
      setActiveTab('duplicates');
      const nextFilter = url.searchParams.get('filter') || '';
      setDuplicateFilter(nextFilter);
      Object.assign(latest.current, { activeTab: 'duplicates', duplicateFilter: nextFilter });
      return;
    }
    if (parts[0] === 'search') {
      setActiveTab('search');
      const nextQuery = url.searchParams.get('q') || '';
      setQuery(nextQuery);
      Object.assign(latest.current, { activeTab: 'search', query: nextQuery });
      return;
    }
    const nextLocationSlug = parts[0] === 'locations' && parts[1] ? decodeURIComponent(parts[1]) : null;
    const nextScanId = parts[2] === 'scans' && parts[3] ? decodeURIComponent(parts[3]) : null;
    const nextPath = nextScanId ? url.searchParams.get('path') || '' : '';
    const routeView = url.searchParams.get('view');
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
    const entries = await rpc('scans.tree', { scan_id: requestedScanId, path: requestedPath });
    if (requestId !== treeRequestId.current || latest.current.selectedScanId !== requestedScanId || latest.current.selectedPath !== requestedPath) return;
    setTreeEntries(entries);
  }, [rpc, routeTo]);
  loadTreeRef.current = loadTree;

  const doRefresh = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const [nextOverview, nextLocations, nextScans, nextDupes, running] = await Promise.all([
        rpc('overview.get'),
        rpc('locations.list'),
        rpc('scans.list'),
        rpc('dupes.list', { limit: 100 }),
        rpc('scans.running')
      ]);
      setOverview(nextOverview);
      setLocations(nextLocations);
      setScans(nextScans);
      setDupes(nextDupes);
      latest.current.locations = nextLocations;
      latest.current.scans = nextScans;
      mergeProgress(running);
      ensureSelection(nextLocations);
      routeTo(true);
      await loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, preserveDeleteCheck: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
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

  function scheduleTreeReload() {
    if (latest.current.deleteCheck || treeReloadTimer.current) return;
    treeReloadTimer.current = window.setTimeout(() => {
      treeReloadTimer.current = null;
      loadTreeRef.current?.(latest.current.selectedPath, { updateHistory: false, replaceRoute: false });
    }, 700);
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

  async function runDeleteCheck(scanId, entries = selectedGridEntries) {
    setBusy(true);
    try {
      const selectedEntries = (entries || []).filter((entry) => entry?.path && entry.kind !== 'parent');
      const payload = selectedEntries.length
        ? { scan_id: scanId, path: selectedPath, paths: selectedEntries.map((entry) => entry.path) }
        : { scan_id: scanId, path: selectedPath };
      const scopeLabel = selectedEntries.length
        ? `${selectedEntries.length} selected ${selectedEntries.length === 1 ? 'item' : 'items'}`
        : selectedPath || 'root';
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
      await rpc('locations.delete', { slug });
      const remainingLocations = latest.current.locations.filter((location) => location.slug !== slug);
      const nextSlug = selectedLocationSlug === slug ? remainingLocations[0]?.slug || null : selectedLocationSlug;
      setLocations((current) => current.filter((location) => location.slug !== slug));
      setScans((current) => current.filter((scan) => scan.location_slug !== slug));
      setConfirmDeleteLocationSlug(null);
      if (selectedLocationSlug === slug) {
        setSelectedLocationSlug(nextSlug);
        setSelectedScanId(null);
        setSelectedPath('');
        setScanSubviewState('files');
        setPathHistory(['']);
        setPathHistoryIndex(0);
        setTreeEntries([]);
        setSelectedGridPaths([]);
      }
      Object.assign(latest.current, {
        locations: remainingLocations,
        scans: latest.current.scans.filter((scan) => scan.location_slug !== slug),
        selectedLocationSlug: nextSlug,
        selectedScanId: selectedLocationSlug === slug ? null : latest.current.selectedScanId,
        selectedPath: selectedLocationSlug === slug ? '' : latest.current.selectedPath,
        scanSubview: selectedLocationSlug === slug ? 'files' : latest.current.scanSubview,
        pathHistory: selectedLocationSlug === slug ? [''] : latest.current.pathHistory,
        pathHistoryIndex: selectedLocationSlug === slug ? 0 : latest.current.pathHistoryIndex,
        selectedGridPaths: selectedLocationSlug === slug ? [] : latest.current.selectedGridPaths
      });
      routeTo(true);
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
      await rpc('scans.delete', { scan_id: scanId });
      const deletedScan = latest.current.scans.find((scan) => scan.id === scanId);
      const remainingScans = latest.current.scans.filter((scan) => scan.id !== scanId);
      const deletedSelectedScan = selectedScanId === scanId;
      setScans((current) => current.filter((scan) => scan.id !== scanId));
      setScanProgress((current) => {
        const next = { ...current };
        delete next[scanId];
        return next;
      });
      setConfirmDeleteScanId(null);
      if (deletedSelectedScan) {
        const nextSlug = deletedScan?.location_slug || selectedLocationSlug;
        setSelectedLocationSlug(nextSlug || null);
        setSelectedScanId(null);
        setSelectedPath('');
        setScanSubviewState('files');
        setPathHistory(['']);
        setPathHistoryIndex(0);
        setTreeEntries([]);
        setSelectedGridPaths([]);
      }
      Object.assign(latest.current, {
        scans: remainingScans,
        selectedLocationSlug: deletedSelectedScan ? deletedScan?.location_slug || selectedLocationSlug : latest.current.selectedLocationSlug,
        selectedScanId: deletedSelectedScan ? null : latest.current.selectedScanId,
        selectedPath: deletedSelectedScan ? '' : latest.current.selectedPath,
        scanSubview: deletedSelectedScan ? 'files' : latest.current.scanSubview,
        pathHistory: deletedSelectedScan ? [''] : latest.current.pathHistory,
        pathHistoryIndex: deletedSelectedScan ? 0 : latest.current.pathHistoryIndex,
        selectedGridPaths: deletedSelectedScan ? [] : latest.current.selectedGridPaths
      });
      routeTo(true);
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
    setConfirmDeletePath({
      scan_id: selectedScanId,
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      file_count: entry.file_count || 1
    });
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

  async function search() {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      setActiveTab('search');
      latest.current.activeTab = 'search';
      routeTo();
      setResults(await rpc('files.find', { q: query, limit: 200 }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function updateDuplicateFilter(value) {
    setDuplicateFilter(value);
    setActiveTab('duplicates');
    Object.assign(latest.current, { duplicateFilter: value, activeTab: 'duplicates' });
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
    selectedGridPaths,
    selectedGridEntries,
    onShowAddLocation: () => setShowAddLocation(true),
    onChooseLocation: chooseLocation,
    onOpenEditLocation: openEditLocation,
    onSetLocationDisabled: setLocationDisabled,
    onRequestDeleteLocation: setConfirmDeleteLocationSlug,
    onStartScan: startScan,
    onSelectScan: selectScan,
    onStopScan: stopScan,
    onUpdateScan: startUpdateScan,
    onSetRepresentative: setRepresentativeScan,
    onClearRepresentative: clearRepresentativeScan,
    onRunDeleteCheck: runDeleteCheck,
    onOpenScanNotes: openScanNotes,
    onRequestDeleteScan: setConfirmDeleteScanId,
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
    onToggleGridSelection: toggleGridSelection,
    onSetGridSelection: setGridSelection,
    onClearGridSelection: clearGridSelection,
    onLoadTree: loadTree,
    onOpenGridEntry: openGridEntry,
    onInspectFile: inspectFile,
    onRequestDeletePath: requestDeletePath
  };

  const topBarActions = activeTab === 'locations'
    ? selectedScanView
      ? (
        <>
          {isActiveStatus(selectedScanView.status) ? (
            <Button variant="warning" className="warning" onClick={() => stopScan(selectedScanView.id)} disabled={busy} icon={<Icon name="stop" />}>Stop</Button>
          ) : (
            <Button variant="secondary" className="secondary" onClick={() => startUpdateScan(selectedScanView.id)} disabled={busy} icon={<Icon name="update" />}>Update scan</Button>
          )}
          {selectedScanView.is_representative ? (
            <Button variant="warning" className="warning" onClick={() => clearRepresentativeScan(selectedScanView.id)} disabled={busy} icon={<Icon name="representative" />}>Clear representative</Button>
          ) : (
            <Button variant="secondary" className="secondary" onClick={() => setRepresentativeScan(selectedScanView.id)} disabled={busy} icon={<Icon name="representative" />}>Use for duplicates</Button>
          )}
          <Button variant="secondary" className="secondary" onClick={() => openScanNotes(selectedScanView)} disabled={busy} icon={<Icon name="edit" />}>{selectedScanView.notes ? 'Edit notes' : 'Add notes'}</Button>
          <Button variant="danger" className="danger" onClick={() => setConfirmDeleteScanId(selectedScanView.id)} disabled={busy} icon={<Icon name="delete" />}>Delete scan</Button>
        </>
      )
      : selectedLocationView
        ? (
          <>
            <Button variant="secondary" className="secondary" onClick={() => openEditLocation(selectedLocationView)} disabled={busy} icon={<Icon name="edit" />}>Edit</Button>
            <Button variant="warning" className="warning" onClick={() => setLocationDisabled(selectedLocationView, !selectedLocationView.disabled)} disabled={busy} icon={<Icon name={selectedLocationView.disabled ? 'enable' : 'disable'} />}>{selectedLocationView.disabled ? 'Enable dupes' : 'Disable dupes'}</Button>
            <Button variant="danger" className="danger" onClick={() => setConfirmDeleteLocationSlug(selectedLocationView.slug)} disabled={busy} icon={<Icon name="delete" />}>Delete location</Button>
            <Button onClick={() => startScan(selectedLocationView.slug)} disabled={busy} icon={<Icon name="scan" />}>Scan now</Button>
          </>
        )
        : <Button onClick={() => setShowAddLocation(true)} disabled={busy} icon={<Icon name="add" />}>Add location</Button>
    : null;

  return (
    <Shell
      overview={overview}
      message={message}
      wsStatus={wsStatus}
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
      topBarActions={topBarActions}
    >
      {activeTab === 'locations' && <LocationsPage {...commonLocationProps} />}
      {activeTab === 'duplicates' && <DuplicatesPage duplicateFilter={duplicateFilter} filteredDupes={filteredDupes} onUpdateDuplicateFilter={updateDuplicateFilter} onOpenDuplicate={openFileReference} />}
      {activeTab === 'search' && <SearchPage query={query} setQuery={setQuery} results={results} busy={busy} onSearch={search} onOpenResult={openFileReference} />}
      <AppModals
        showAddLocation={showAddLocation}
        setShowAddLocation={setShowAddLocation}
        showEditLocation={showEditLocation}
        setShowEditLocation={setShowEditLocation}
        showScanNotes={showScanNotes}
        setShowScanNotes={setShowScanNotes}
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
        fileInfo={fileInfo}
        buildThumbnailRequest={buildThumbnailRequest}
        busy={busy}
        onAddLocation={addLocation}
        onUpdateLocation={updateLocation}
        onUpdateScanNotes={updateScanNotes}
        onDeleteScan={deleteScan}
        onDeleteScanPath={deleteScanPath}
        onDeleteLocation={deleteLocation}
        onOpenOccurrence={openOccurrence}
        onRevealOccurrence={revealOccurrence}
        onBuildThumbnails={buildThumbnails}
      />
    </Shell>
  );
}

function gridRows(treeEntries, selectedPath) {
  const rows = selectedPath ? [{ name: '..', path: parentPath(selectedPath), kind: 'parent', size: 0, file_count: 0 }] : [];
  return [...rows, ...treeEntries];
}

function parentPath(selectedPath) {
  if (!selectedPath) return '';
  const parts = selectedPath.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}
