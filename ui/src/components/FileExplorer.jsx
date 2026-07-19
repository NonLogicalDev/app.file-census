import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileGrid from './FileGrid.jsx';
import DirectoryTree from './DirectoryTree.jsx';
import { Icon } from './Icon.jsx';
import SearchFilterControls from './search/SearchFilterControls.jsx';
import ScanProgressPools from './ScanProgressPools.jsx';
import {
  Button,
  emptyTextClassName,
  logLineClassName,
  logPanelClassName,
  notesPanelBodyClassName,
  scanNotesPanelClassName
} from './ui/index.jsx';
import { bytes, isActiveStatus, statusLabel } from '../utils/format.js';

// Prototype (location.css) chrome, translated to the shared token palette.
const ctrlBtn =
  'inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 text-[11px] text-muted transition-colors hover:bg-surface hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-subtle disabled:hover:text-muted';
const navBtn =
  'grid h-[26px] w-[26px] place-items-center rounded text-muted transition-colors hover:text-text disabled:text-border-strong disabled:hover:text-border-strong';

export default function FileExplorer(props) {
  const {
    activeScan,
    busy,
    location,
    showScanActions = true,
    deleteCheck,
    deleteCheckPath,
    folderSummary = null,
    deleteCheckSummary = null,
    deleteCheckSet = [],
    onAddDeleteCheck,
    onRemoveDeleteCheck,
    selectedPath,
    pathHistoryIndex,
    pathHistory,
    showColumns,
    fileColumns,
    visibleColumns,
    gridVisibleColumns,
    visibleGridRows,
    filesLoading = false,
    directoryTreeNodes = {},
    directoryTreeExpandedPaths = [],
    directoryTreeLoadingPaths = [],
    query = '',
    setQuery,
    searchFilters = [],
    locations = [],
    onStopScan,
    onPauseScan,
    onResumeScan,
    onUpdateScan,
    onRepairScan,
    onSetRepresentative,
    onClearRepresentative,
    onRunDeleteCheck,
    deleteCheckStaged = [],
    onStageDeleteCheck,
    onRemoveDeleteCheckStage,
    onClearDeleteCheckStage,
    onRunStagedDeleteCheck,
    onOpenScanExcludes,
    onOpenScanNotes,
    onRequestDeleteScan,
    onCloseDeleteCheck,
    scanSubview = 'files',
    selectedGridPaths = [],
    selectedGridEntries = [],
    onGoBack,
    onGoForward,
    onGoParent,
    onBrowseCurrentFolder,
    onRequestBuildThumbnails,
    onRequestBuildThumbnailsForEntry,
    onToggleColumns,
    onToggleColumn,
    onCommitSearch,
    onAddSearchFilter,
    onRemoveSearchFilter,
    onGroupSearchFilters,
    onReplaceSearchFilterState,
    onToggleGridSelection,
    onSetGridSelection,
    onClearGridSelection,
    onLoadTree,
    onLoadFlat,
    onToggleDirectoryTree,
    onLoadMoreDirectoryTree,
    onOpenGridEntry,
    onInspectFile,
    onOpenFileSystem,
    onRevealFileSystem,
    onRequestExcludePath,
    onRequestDeletePath
  } = props;

  // Delete Check mode is App-owned (the server filters Browse/Flat to the
  // staged set when it is on); this component only toggles + renders it.
  const deleteCheckMode = Boolean(props.deleteCheckMode);
  const onSetDeleteCheckMode = props.onSetDeleteCheckMode;
  // The Inspector is an APP-LEVEL right rail now (docked like the sidebar);
  // this component only reads the inspected row for the highlight, forwards
  // row clicks, and hosts the toggle button. Folders stays local + persisted.
  const inspected = props.inspected || null;
  const inspectorOpen = Boolean(props.inspectorOpen);
  const onToggleInspector = props.onToggleInspector;
  const handleInspectRow = props.onInspectRow;
  const [foldersOpen, setFoldersOpen] = useState(
    () => globalThis.localStorage?.getItem('locations-folders-open') !== '0'
  );
  useEffect(() => {
    globalThis.localStorage?.setItem('locations-folders-open', foldersOpen ? '1' : '0');
  }, [foldersOpen]);
  // Exact staged member paths (for membership-aware row menus).
  const stagedMemberPaths = useMemo(() => new Set(deleteCheckSet.map((m) => m.path)), [deleteCheckSet]);
  // Backup safety filter over the current listing. This is "Delete Check" in the
  // unified model: markers are always shown; the filter narrows to a tier.
  const [backupFilter, setBackupFilter] = useState('all');
  // Backup scope: 'external' = backed up on ANOTHER location; 'internal' = a
  // duplicate exists on THIS same disk.
  const [scope, setScope] = useState('external');
  // Browse (immediate-children tree, default) vs Flat (paginated all-descendants).
  const [viewMode, setViewMode] = useState(props.defaultViewMode || 'browse');
  // User-resizable Folders (directory-tree) pane width, persisted.
  const FOLDERS_MIN = 160;
  const FOLDERS_MAX = 520;
  const [foldersWidth, setFoldersWidth] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem('locations-folders-width'));
    return Number.isFinite(stored) && stored >= FOLDERS_MIN ? Math.min(stored, FOLDERS_MAX) : 224;
  });
  useEffect(() => {
    globalThis.localStorage?.setItem('locations-folders-width', String(foldersWidth));
  }, [foldersWidth]);
  const startFoldersResize = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = foldersWidth;
    const onMove = (moveEvent) => {
      const next = Math.min(FOLDERS_MAX, Math.max(FOLDERS_MIN, startWidth + (moveEvent.clientX - startX)));
      setFoldersWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const [flatRows, setFlatRows] = useState([]);
  const [flatTotal, setFlatTotal] = useState(0);
  const [flatLoading, setFlatLoading] = useState(false);
  const [flatOffset, setFlatOffset] = useState(0);
  const FLAT_LIMIT = 500;
  const flatKey = `${activeScan?.id}|${selectedPath}|${backupFilter}|${scope}|${deleteCheckMode}`;

  // Reset paging whenever the flat query inputs change.
  useEffect(() => {
    setFlatOffset(0);
  }, [flatKey, viewMode]);

  useEffect(() => {
    if (viewMode !== 'flat' || typeof onLoadFlat !== 'function' || !activeScan) return undefined;
    let cancelled = false;
    setFlatLoading(true);
    onLoadFlat(selectedPath, backupFilter, flatOffset, FLAT_LIMIT, { scope, deleteCheck: deleteCheckMode })
      .then((page) => {
        if (cancelled) return;
        setFlatTotal(page.total || 0);
        setFlatRows((prev) => (flatOffset === 0 ? page.entries : [...prev, ...page.entries]));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFlatLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, flatKey, flatOffset, onLoadFlat, activeScan, selectedPath, backupFilter, scope, deleteCheckMode]);

  if (!activeScan) return <p className={emptyTextClassName}>Select or run a scan to browse this location.</p>;
  const selectedCount = selectedGridEntries.length;
  const canBuildThumbnails = Boolean(location?.connected && activeScan);
  const canStopScan = typeof onStopScan === 'function';
  const activeScanStatus = isActiveStatus(activeScan.status);
  const scanRole = activeScan.is_representative
    ? 'Representative scan'
    : activeScanStatus
      ? 'Live scan'
      : 'Historical scan';

  // Backup-tier totals for the current listing (files here + descendants of the
  // folders shown), used for the filter chip counts and gating.
  // Scope-aware tier readout for a row. Dir rows carry UNIQUE-content counts per
  // tier; file rows carry a one-hot status. External = backed up on another
  // location; Internal = a duplicate exists on this same disk.
  const rowTier = (row, tier) => {
    if (row.kind === 'dir') {
      if (scope === 'internal') {
        return tier === 'safe' ? row.int_safe_count || 0 : tier === 'warn' ? row.int_warn_count || 0 : row.int_unsafe_count || 0;
      }
      return tier === 'safe' ? row.safe_count || 0 : tier === 'warn' ? row.warn_count || 0 : row.unsafe_count || 0;
    }
    const status = scope === 'internal' ? row.internal_status : row.backup_status;
    return status === tier ? 1 : 0;
  };

  const backupTotals = useMemo(() => {
    // Delete Check mode: the strip shows the BROWSED FOLDER's staged files
    // classified by survival after deletion (file counts — they sum to the
    // staged files under this folder). Zeros until the background pass lands.
    if (deleteCheckMode && deleteCheckSummary) {
      return {
        safe: deleteCheckSummary.folder_dc_safe || 0,
        warn: deleteCheckSummary.folder_dc_warn || 0,
        unsafe: deleteCheckSummary.folder_dc_unsafe || 0
      };
    }
    // Prefer the browsed folder's OWN unique-content rollup (from the backend) so
    // the totals don't double-count content shared across sibling subfolders. It
    // is null at the scan root / when no cache is ready — then fall back to
    // summing the visible rows (best available at the root).
    if (folderSummary) {
      return scope === 'internal'
        ? { safe: folderSummary.int_safe_count || 0, warn: folderSummary.int_warn_count || 0, unsafe: folderSummary.int_unsafe_count || 0 }
        : { safe: folderSummary.safe_count || 0, warn: folderSummary.warn_count || 0, unsafe: folderSummary.unsafe_count || 0 };
    }
    const totals = { unsafe: 0, warn: 0, safe: 0 };
    for (const row of visibleGridRows) {
      if (row.kind === 'parent') continue;
      totals.safe += rowTier(row, 'safe');
      totals.warn += rowTier(row, 'warn');
      totals.unsafe += rowTier(row, 'unsafe');
    }
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGridRows, scope, folderSummary, deleteCheckMode, deleteCheckSummary]);
  const hasBackupData = backupTotals.unsafe + backupTotals.warn + backupTotals.safe > 0;

  // Delete Check mode shows the staged-set panel; it does NOT hide rows from the
  // browse (that stranded the view in non-staged folders and broke the paginated
  // Flat list). Staged rows are marked instead, and the panel is the set's
  // source of truth.
  const filteredGridRows = useMemo(() => {
    if (backupFilter === 'all') return visibleGridRows;
    return visibleGridRows.filter((row) => row.kind === 'parent' || rowTier(row, backupFilter) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGridRows, backupFilter, scope]);

  // Inline folder expansion (Browse table): lazily fetched children per dir
  // path. Cleared when the browsed folder / scan / mode / search changes so
  // stale children never render under a fresh listing.
  const [tableChildNodes, setTableChildNodes] = useState({});
  const tableChildNodesRef = useRef(tableChildNodes);
  tableChildNodesRef.current = tableChildNodes;
  const onLoadFolderChildrenRef = useRef(props.onLoadFolderChildren);
  onLoadFolderChildrenRef.current = props.onLoadFolderChildren;
  useEffect(() => {
    setTableChildNodes({});
  }, [selectedPath, activeScan?.id, deleteCheckMode, query]);
  const handleToggleFolderExpand = useCallback((path, expand) => {
    if (!expand) return;
    if (typeof onLoadFolderChildrenRef.current !== 'function') return;
    if (tableChildNodesRef.current[path]) return; // already loaded / in flight
    setTableChildNodes((nodes) => ({ ...nodes, [path]: { loading: true, entries: [] } }));
    onLoadFolderChildrenRef.current(path)
      .then((page) => {
        setTableChildNodes((nodes) => {
          if (!nodes[path]) return nodes; // cleared by navigation mid-flight
          if (!page) {
            const next = { ...nodes };
            delete next[path];
            return next;
          }
          return {
            ...nodes,
            [path]: {
              loading: false,
              entries: page.entries || [],
              hasMore: Boolean(page.has_more),
              total: page.total ?? null
            }
          };
        });
      })
      .catch(() => {
        // Drop the node so the next expand retries.
        setTableChildNodes((nodes) => {
          const next = { ...nodes };
          delete next[path];
          return next;
        });
      });
  }, []);
  // Attach children as TanStack subRows (recursively — expanded children can
  // expand their own folders). The backup-tier filter applies at every level.
  const gridRowsWithChildren = useMemo(() => {
    if (!Object.keys(tableChildNodes).length) return filteredGridRows;
    const tierFilter = (rows) =>
      backupFilter === 'all' ? rows : rows.filter((row) => rowTier(row, backupFilter) > 0);
    const attach = (rows) => rows.map((row) => {
      if (row.kind !== 'dir') return row;
      const node = tableChildNodes[row.path];
      if (!node) return row;
      if (node.loading) {
        return { ...row, subRows: [{ kind: 'placeholder', path: `${row.path}//loading`, name: 'Loading…' }] };
      }
      const children = attach(tierFilter(node.entries.filter((entry) => entry.kind !== 'parent')))
        .sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1));
      const more = node.hasMore
        ? [{ kind: 'placeholder', path: `${row.path}//more`, name: `Showing first ${node.entries.length} — open the folder for the rest` }]
        : [];
      return { ...row, subRows: [...children, ...more] };
    });
    return attach(filteredGridRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGridRows, tableChildNodes, backupFilter, scope]);

  const breadcrumbBar = (
    <nav className="flex min-h-8 flex-none items-center gap-1 overflow-x-auto border-b border-sidebar-border bg-sidebar-bg px-2" aria-label="Current path">
      <button type="button" className={navBtn} onClick={onGoBack} disabled={pathHistoryIndex <= 0} aria-label="Back">
        <Icon name="back" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={navBtn}
        onClick={onGoForward}
        disabled={pathHistoryIndex >= pathHistory.length - 1}
        aria-label="Forward"
      >
        <Icon name="forward" className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={navBtn} onClick={onGoParent} disabled={!selectedPath} aria-label="Parent">
        <Icon name="parent" className="h-3.5 w-3.5" />
      </button>
      <span className="mx-2 h-4 w-px flex-none bg-border" aria-hidden="true" />
      {breadcrumbs(selectedPath).map((crumb, index) => (
        <span className="inline-flex flex-none items-center" key={crumb.path}>
          {index > 0 && <Icon name="chevronRight" className="mx-0.5 h-3 w-3 text-border-strong" />}
          <button
            type="button"
            className="max-w-[240px] truncate px-1 text-[11px] text-muted transition-colors last:text-text hover:text-text"
            onClick={() => onLoadTree(crumb.path)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
      <div className="ml-auto flex flex-none items-center gap-2 pl-3">
        <span className="text-[10px] tabular-nums text-text-tertiary">
          {viewMode === 'flat'
            ? `${flatTotal.toLocaleString()} files`
            : `${filteredGridRows.length.toLocaleString()} items`}
        </span>
      </div>
    </nav>
  );

  // Flat view: reuse the FileGrid with full paths + a "load more" pager.
  const dcFolders = deleteCheckSet.filter((m) => m.kind === 'dir');
  const dcFiles = deleteCheckSet.filter((m) => m.kind === 'file');
  // Delete Check MODE bar: the markers themselves are the validation (each
  // staged file is classified by what SURVIVES deleting the set), so the bar
  // just carries the set totals — live, no Validate button.
  const dcReady = Boolean(deleteCheckSummary?.ready);
  const deleteCheckBar = (
    <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-danger/40 bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-1.5 text-[11px]" aria-label="Delete Check mode">
      <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.05em] text-danger">
        <Icon name="deleteCheck" className="h-3.5 w-3.5" /> Delete Check mode
      </span>
      <span className="text-muted-strong tabular-nums">
        {dcFolders.length} {dcFolders.length === 1 ? 'folder' : 'folders'} · {dcFiles.length} {dcFiles.length === 1 ? 'file' : 'files'} staged
        {dcReady ? ` · ${(deleteCheckSummary.file_count || 0).toLocaleString()} files in set` : ''}
      </span>
      {dcReady ? (
        <span className="inline-flex items-center gap-3 tabular-nums" title="Classified by what survives deleting the set: safe = exact copy survives (remain-set or another location); partial = only a light-hash survivor; last copy = nothing survives">
          <span className="text-success">{(deleteCheckSummary.dc_safe || 0).toLocaleString()} safe to delete</span>
          <span className="text-warning">{(deleteCheckSummary.dc_warn || 0).toLocaleString()} partial</span>
          <span className={deleteCheckSummary.dc_unsafe > 0 ? 'font-semibold text-danger' : 'text-muted'}>
            {(deleteCheckSummary.dc_unsafe || 0).toLocaleString()} would lose last copy
          </span>
        </span>
      ) : (
        deleteCheckSet.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-warning">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-warning" /> computing survival…
          </span>
        )
      )}
    </div>
  );

  const flatView = (
    <div className="mt-2 flex min-h-[620px] flex-col overflow-hidden border border-sidebar-border bg-bg">
      {breadcrumbBar}
      {deleteCheckMode && deleteCheckBar}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <FileGrid
          storageKey="locations-flat"
          rows={flatRows}
          visibleColumns={gridVisibleColumns}
          fullPathName
          selectable
          deleteCheck
          scope={scope}
          dcMode={deleteCheckMode}
          selectedPaths={selectedGridPaths}
          stagedPaths={stagedMemberPaths}
          onToggleSelection={onToggleGridSelection}
          onSetSelection={onSetGridSelection}
          onAddDeleteCheck={onAddDeleteCheck}
          onRemoveDeleteCheck={onRemoveDeleteCheck}
          onInspect={onInspectFile}
          onInspectRow={handleInspectRow}
          onOpenSystem={onOpenFileSystem}
          onRevealSystem={onRevealFileSystem}
        />
        {!flatRows.length && (
          <p className="pointer-events-none absolute inset-x-0 top-[52px] p-[18px] text-center text-[11px] text-muted">
            {flatLoading
              ? 'Loading files…'
              : deleteCheckMode
                ? 'No Delete Check paths under this folder. Toggle Delete Check off to browse everything.'
                : 'No files match this filter.'}
          </p>
        )}
      </div>
      {flatRows.length < flatTotal && (
        <div className="flex flex-none items-center justify-center gap-3 border-t border-sidebar-border bg-sidebar-bg px-3 py-2 text-[11px] text-muted">
          <span>Showing {flatRows.length.toLocaleString()} of {flatTotal.toLocaleString()}</span>
          <button
            type="button"
            className={ctrlBtn}
            disabled={flatLoading}
            onClick={() => setFlatOffset(flatRows.length)}
          >
            {flatLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );

  const resultsTable = (
    <div className="relative block min-h-[420px] flex-1 overflow-auto bg-bg">
      <FileGrid
        storageKey="locations-files"
        rows={gridRowsWithChildren}
        visibleColumns={gridVisibleColumns}
        selectable
        deleteCheck
        scope={scope}
        dcMode={deleteCheckMode}
        expandableFolders
        onToggleFolderExpand={handleToggleFolderExpand}
        selectedPaths={selectedGridPaths}
        inspectedPath={inspected?.path}
        canBuildThumbnails={canBuildThumbnails}
        onOpen={onOpenGridEntry}
        onInspect={onInspectFile}
        onInspectRow={handleInspectRow}
        onOpenSystem={onOpenFileSystem}
        onRevealSystem={onRevealFileSystem}
        onToggleSelection={onToggleGridSelection}
        onSetSelection={onSetGridSelection}
        onBuildThumbnails={onRequestBuildThumbnailsForEntry}
        onExclude={onRequestExcludePath}
        onDelete={onRequestDeletePath}
        onAddDeleteCheck={onAddDeleteCheck}
        onRemoveDeleteCheck={onRemoveDeleteCheck}
        stagedPaths={stagedMemberPaths}
      />
      {!filteredGridRows.length && (
        <p className="pointer-events-none absolute inset-x-0 top-[52px] z-[1] p-[18px] text-center text-[11px] text-muted">
          {filesLoading
            ? 'Loading files…'
            : deleteCheckMode
              ? 'No Delete Check paths under this folder. Toggle Delete Check off to browse everything.'
              : backupFilter !== 'all'
                ? `No ${backupFilter} files in this folder.`
                : activeScanStatus
                  ? 'Waiting for the first flushed files...'
                  : 'No files discovered at this path yet.'}
        </p>
      )}
    </div>
  );


  return (
    <div className="min-w-0 text-[13px]">
      {/* Route bar */}
      <header className="flex items-center justify-between gap-3 border-b border-sidebar-border px-1 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="locations" className="h-[15px] w-[15px] flex-none text-muted" />
          <strong className="truncate text-[13px] font-semibold text-text">{scanRole}</strong>
          <span
            className={`flex-none rounded-full border px-[7px] text-[10px] leading-[18px] ${
              activeScanStatus ? 'border-success/20 bg-success-soft text-success' : 'border-border bg-surface-subtle text-muted'
            }`}
          >
            {statusLabel(activeScan.status)}
          </span>
        </div>
        <div className="flex flex-none items-center gap-3 whitespace-nowrap text-[11px] text-text-tertiary max-[1040px]:hidden">
          <span>{Number(activeScan.file_count || 0).toLocaleString()} files</span>
          <span className="h-3.5 w-px bg-border" aria-hidden="true" />
          <span>{bytes(activeScan.total_bytes)}</span>
        </div>
      </header>

      {/* Nav row 1: view switch + command actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sidebar-border py-2">
        <div className="inline-flex h-[30px] flex-none items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5" role="tablist" aria-label="Scan views">
          <BackupFilterChip label="Browse" active={viewMode === 'browse'} onClick={() => setViewMode('browse')} />
          <BackupFilterChip label="Flat" active={viewMode === 'flat'} onClick={() => setViewMode('flat')} />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={ctrlBtn}
            onClick={() => onBrowseCurrentFolder(location)}
            disabled={busy || !location.connected}
          >
            <Icon name="folder" className="h-3.5 w-3.5" /> Browse Folder
          </button>
          <button
            type="button"
            className={ctrlBtn}
            onClick={() => onRequestBuildThumbnails(selectedGridEntries)}
            disabled={busy || !canBuildThumbnails}
            title={location.connected ? 'Build thumbnails for the current folder or selected rows' : 'Connect this location to build thumbnails'}
          >
            <Icon name="thumbnails" className="h-3.5 w-3.5" />
            {selectedCount ? `Build Thumbnails (${selectedCount})` : 'Build Thumbnails'}
          </button>
          <button
            type="button"
            className={ctrlBtn}
            onClick={() => props.onExportVerdicts?.({
              scanId: activeScan.id,
              path: selectedPath || '',
              backup: backupFilter,
              scope
            })}
            title={`Download a TSV of every file here with its ${scope} backup verdict and copy counts`}
          >
            <Icon name="download" className="h-3.5 w-3.5" /> Export TSV
          </button>
          <button type="button" className={`${ctrlBtn} ${showColumns ? 'bg-surface text-text' : ''}`} onClick={onToggleColumns} aria-expanded={showColumns}>
            <Icon name="columns" className="h-3.5 w-3.5" /> Columns
          </button>
          <button
            type="button"
            className={`${ctrlBtn} ${foldersOpen ? 'bg-surface text-text' : ''}`}
            onClick={() => setFoldersOpen((open) => !open)}
            aria-pressed={foldersOpen}
            title={foldersOpen ? 'Collapse the Folders pane' : 'Show the Folders pane'}
          >
            <Icon name="folder" className="h-3.5 w-3.5" /> Folders
          </button>
          <button
            type="button"
            className={`${ctrlBtn} ${inspectorOpen ? 'bg-surface text-text' : ''}`}
            onClick={() => onToggleInspector?.()}
            aria-pressed={inspectorOpen}
            title={inspectorOpen ? 'Collapse the Inspector panel' : 'Show the Inspector panel (details for the clicked row)'}
          >
            <Icon name="sidebarOpen" className="h-3.5 w-3.5" /> Inspector
          </button>
        </div>
      </div>

      {/* Nav row 2: analysis — backup filter + scope + Delete Check set */}
      <div className="flex flex-wrap items-center gap-3 border-b border-sidebar-border py-2" aria-label="Backup analysis">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Backup</span>
          <div className="inline-flex h-[30px] items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5">
            <BackupFilterChip label="All" active={backupFilter === 'all'} onClick={() => setBackupFilter('all')} />
            <BackupFilterChip label="Unsafe" count={hasBackupData ? backupTotals.unsafe : undefined} tone="danger" active={backupFilter === 'unsafe'} onClick={() => setBackupFilter('unsafe')} />
            <BackupFilterChip label="Warn" count={hasBackupData ? backupTotals.warn : undefined} tone="warn" active={backupFilter === 'warn'} onClick={() => setBackupFilter('warn')} />
            <BackupFilterChip label="Safe" count={hasBackupData ? backupTotals.safe : undefined} tone="success" active={backupFilter === 'safe'} onClick={() => setBackupFilter('safe')} />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Scope</span>
          <div className="inline-flex h-[30px] items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5">
            <BackupFilterChip label="External" active={scope === 'external'} onClick={() => setScope('external')} />
            <BackupFilterChip label="Internal" active={scope === 'internal'} onClick={() => setScope('internal')} />
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {typeof onAddDeleteCheck === 'function' && (
            <button
              type="button"
              className={ctrlBtn}
              onClick={() => onAddDeleteCheck(selectedGridEntries)}
              disabled={busy || !selectedCount}
              title={selectedCount ? 'Add the selected files/folders to the Delete Check set' : 'Select rows to add them to the Delete Check set'}
            >
              <Icon name="add" className="h-3.5 w-3.5" />
              {selectedCount ? `Add to Delete Check (${selectedCount})` : 'Add to Delete Check'}
            </button>
          )}
          {typeof props.onRequestClearDeleteCheck === 'function' && (
            <button
              type="button"
              className={`${ctrlBtn} w-[30px] justify-center px-0`}
              onClick={props.onRequestClearDeleteCheck}
              disabled={busy || !deleteCheckSet.length}
              aria-label="Clear the Delete Check set"
              title={deleteCheckSet.length
                ? `Clear all ${deleteCheckSet.length} staged ${deleteCheckSet.length === 1 ? 'path' : 'paths'} from the Delete Check set`
                : 'The Delete Check set is empty'}
            >
              <Icon name="clear" className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className={`${ctrlBtn} ${deleteCheckMode ? '!border-danger !bg-danger !text-white shadow-[0_0_0_1px_var(--danger)]' : ''}`}
            onClick={() => onSetDeleteCheckMode?.(!deleteCheckMode)}
            aria-pressed={deleteCheckMode}
            title={deleteCheckMode ? 'Delete Check mode is ON — browsing is scoped to the staged set. Click to exit.' : 'Enter Delete Check mode: scope Browse/Flat to the staged set and show deletion impact'}
          >
            <Icon name="deleteCheck" className="h-3.5 w-3.5" /> Delete Check
            <span className={`ml-1 rounded-full px-1.5 text-[10px] ${deleteCheckMode ? 'bg-white/25 text-white' : 'bg-surface-muted'}`}>{deleteCheckSet.length}</span>
          </button>
        </div>
      </div>

      {showScanActions && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sidebar-border py-2">
          {activeScanStatus && canStopScan && activeScan.status !== 'stopping' && (
            <Button variant="warning" size="sm" onClick={() => onStopScan(activeScan.id)} disabled={busy} icon={<Icon name="stop" />}>
              Stop
            </Button>
          )}
          {activeScan.status === 'paused' ? (
            typeof onResumeScan === 'function' && (
              <Button variant="secondary" size="sm" onClick={() => onResumeScan(activeScan.id)} disabled={busy} icon={<Icon name="refresh" />}>
                Resume
              </Button>
            )
          ) : (
            activeScanStatus && activeScan.status !== 'stopping' && typeof onPauseScan === 'function' && (
              <Button variant="secondary" size="sm" onClick={() => onPauseScan(activeScan.id)} disabled={busy} icon={<Icon name="pause" />}>
                Pause
              </Button>
            )
          )}
          {!activeScanStatus && (
            <Button variant="secondary" size="sm" onClick={() => onUpdateScan(activeScan.id)} disabled={busy} icon={<Icon name="update" />}>
              Update scan
            </Button>
          )}
          {!activeScanStatus && typeof onRepairScan === 'function' && (
            <Button variant="secondary" size="sm" onClick={() => onRepairScan(activeScan.id)} disabled={busy} icon={<Icon name="repair" />}>
              Repair scan
            </Button>
          )}
          {activeScan.is_representative ? (
            <Button variant="warning" size="sm" onClick={() => onClearRepresentative(activeScan.id)} disabled={busy} icon={<Icon name="representative" />}>
              Clear representative
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onSetRepresentative(activeScan.id)} disabled={busy} icon={<Icon name="representative" />}>
              Use for duplicates
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onOpenScanNotes(activeScan)} disabled={busy} icon={<Icon name="edit" />}>
            {activeScan.notes ? 'Edit notes' : 'Add notes'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onOpenScanExcludes(activeScan)} disabled={busy} icon={<Icon name="exclude" />}>
            Excludes
          </Button>
          {!activeScanStatus && (
            <Button variant="danger" size="sm" onClick={() => onRequestDeleteScan(activeScan.id)} disabled={busy} icon={<Icon name="delete" />}>
              Delete scan
            </Button>
          )}
        </div>
      )}

      {activeScan.status === 'interrupted' && (
        <div className="my-2.5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-warning bg-warning-soft px-3 py-2.5 text-warning">
          <div className="min-w-0">
            <strong>Scan was interrupted</strong>
            <span className="ml-2 text-muted-strong">Repair reprocesses only the missing or incomplete entries; a full update rescans everything.</span>
          </div>
          {typeof onRepairScan === 'function' && (
            <Button variant="secondary" size="sm" onClick={() => onRepairScan(activeScan.id)} disabled={busy} icon={<Icon name="repair" />}>
              Repair scan
            </Button>
          )}
        </div>
      )}

      {activeScan.status === 'paused' && (
        <div className="my-2.5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-warning bg-warning-soft px-3 py-2.5 text-warning">
          <div className="min-w-0">
            <strong>Scan paused</strong>
            <span className="ml-2 text-muted-strong">Workers are parked. Resume to continue indexing.</span>
          </div>
          {typeof onResumeScan === 'function' && (
            <Button variant="secondary" size="sm" onClick={() => onResumeScan(activeScan.id)} disabled={busy} icon={<Icon name="refresh" />}>
              Resume
            </Button>
          )}
        </div>
      )}

      {activeScan.notes && (
        <section className={scanNotesPanelClassName}>
          <h3>Scan notes</h3>
          <p className={notesPanelBodyClassName}>{activeScan.notes}</p>
        </section>
      )}

      <div className="py-2">
        <SearchFilterControls
          query={query}
          setQuery={setQuery}
          filters={searchFilters}
          locations={locations}
          busy={busy}
          placeholder="Search this scan folder"
          submitLabel="Filter"
          helperText="Filters the current folder view and follows the route."
          onSubmit={onCommitSearch}
          onAddFilter={onAddSearchFilter}
          onRemoveFilter={onRemoveSearchFilter}
          onGroupFilters={onGroupSearchFilters}
          onReplaceFilterState={onReplaceSearchFilterState}
        />
      </div>

      {selectedCount > 0 && (
        <div className="mb-2 flex min-h-9 items-center justify-between gap-3 border-y border-sidebar-border bg-surface-subtle px-3 py-1.5 text-[11px] text-muted-strong">
          <span className="font-semibold">{selectedCount} selected</span>
          <Button variant="ghost" size="sm" onClick={onClearGridSelection} disabled={busy} icon={<Icon name="close" />}>
            Clear selection
          </Button>
        </div>
      )}

      {showColumns && (
        <div className="mb-2.5 mt-1 flex flex-wrap gap-x-4 gap-y-2 border border-sidebar-border bg-sidebar-bg p-3 text-[11px]">
          {fileColumns.map(([column, label]) => (
            <label key={column} className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" className="h-3.5 w-3.5" checked={visibleColumns.includes(column)} disabled={column === 'name'} onChange={() => onToggleColumn(column)} /> {label}
            </label>
          ))}
        </div>
      )}

      {viewMode === 'flat' ? (
        flatView
      ) : (
        <div className="mt-2 flex min-h-[620px] flex-col overflow-hidden border border-sidebar-border bg-bg">
          {breadcrumbBar}
          <div
            className="grid min-h-0 flex-1"
            style={{
              // The Folders pane is optional; the Inspector lives in the
              // app-level right rail now: [folders?] table.
              gridTemplateColumns: [
                foldersOpen ? `${foldersWidth}px` : null,
                'minmax(0,1fr)'
              ]
                .filter(Boolean)
                .join(' ')
            }}
          >
            {foldersOpen && (
              <div className="relative flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar-bg">
                <DirectoryTree
                  nodes={directoryTreeNodes}
                  expandedPaths={directoryTreeExpandedPaths}
                  loadingPaths={directoryTreeLoadingPaths}
                  selectedPath={selectedPath}
                  deleteCheckMode={deleteCheckMode}
                  deleteCheckSet={deleteCheckSet}
                  onToggle={onToggleDirectoryTree}
                  onSelect={onLoadTree}
                  onLoadMore={onLoadMoreDirectoryTree}
                />
                {/* Drag handle to resize the Folders pane. */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize folders pane"
                  onMouseDown={startFoldersResize}
                  className="group absolute -right-1 top-0 z-[3] h-full w-2 cursor-col-resize select-none"
                >
                  <span className="absolute right-[3px] top-0 h-full w-px bg-border-strong transition-colors group-hover:w-[2px] group-hover:bg-accent" />
                </div>
              </div>
            )}
            <section className="flex min-w-0 flex-col">
              {deleteCheckMode && deleteCheckBar}
              {resultsTable}
            </section>
          </div>
        </div>
      )}

      <ScanProgressPools progress={activeScan} />

      <section className={logPanelClassName}>
        <h3>Work log</h3>
        {(activeScan.log || []).slice().reverse().map((line, index) => <code className={logLineClassName} key={`${index}-${line}`}>{line}</code>)}
        {!(activeScan.log || []).length && <span>No live log for this scan.</span>}
      </section>
    </div>
  );
}

function BackupFilterChip({ label, count, tone, active, onClick }) {
  const toneActive =
    tone === 'danger'
      ? 'bg-[color:color-mix(in_srgb,var(--danger)_16%,var(--surface))] text-danger shadow-sm'
      : tone === 'warn'
        ? 'bg-warning-soft text-warning shadow-sm'
        : tone === 'success'
          ? 'bg-[color:color-mix(in_srgb,var(--success)_14%,var(--surface))] text-success shadow-sm'
          : 'bg-surface-muted text-text shadow-sm';
  const dotColor = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warning' : tone === 'success' ? 'text-success' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition ${active ? toneActive : 'text-muted hover:text-text'}`}
    >
      {dotColor && <span className={dotColor}>●</span>}
      {label}
      {count != null && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  );
}

function breadcrumbs(selectedPath) {
  if (!selectedPath) return [{ label: 'root', path: '' }];
  const parts = selectedPath.split('/').filter(Boolean);
  const crumbs = [{ label: 'root', path: '' }];
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}
