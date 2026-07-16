import { useState } from 'react';
import FileGrid from './FileGrid.jsx';
import DirectoryTree from './DirectoryTree.jsx';
import { Icon } from './Icon.jsx';
import SearchFilterControls from './search/SearchFilterControls.jsx';
import ScanProgressPools from './ScanProgressPools.jsx';
import {
  Button,
  deleteCheckCalloutClassName,
  deleteCheckEmptyClassName,
  emptyTextClassName,
  logLineClassName,
  logPanelClassName,
  notesPanelBodyClassName,
  scanNotesPanelClassName
} from './ui/index.jsx';
import { bytes, isActiveStatus, statusLabel } from '../utils/format.js';

// Prototype (location.css) chrome, translated to the shared token palette.
const modePill = (active) =>
  `inline-flex h-6 items-center gap-1.5 rounded px-2 text-[11px] transition-colors ${
    active ? 'bg-surface-muted text-text' : 'text-muted hover:text-text'
  }`;
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
    onSetScanSubview,
    onLoadTree,
    onToggleDirectoryTree,
    onLoadMoreDirectoryTree,
    onOpenGridEntry,
    onInspectFile,
    onRequestExcludePath,
    onRequestDeletePath
  } = props;

  const [inspected, setInspected] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  if (!activeScan) return <p className={emptyTextClassName}>Select or run a scan to browse this location.</p>;
  const showingDeleteCheck = scanSubview === 'delete-check';
  const showingFileTree = scanSubview === 'tree';
  const selectedCount = selectedGridEntries.length;
  const canBuildThumbnails = Boolean(location?.connected && activeScan);
  const canStopScan = typeof onStopScan === 'function';
  const activeScanStatus = isActiveStatus(activeScan.status);
  const scanRole = activeScan.is_representative
    ? 'Representative scan'
    : activeScanStatus
      ? 'Live scan'
      : 'Historical scan';

  const modes = [
    ['files', 'Files', 'browseFiles'],
    ['tree', 'File tree', 'folder'],
    ['delete-check', 'Delete Check', 'deleteCheck']
  ];

  const breadcrumbBar = (
    <nav className="flex min-h-8 items-center gap-1 overflow-x-auto border-y border-sidebar-border bg-sidebar-bg px-2" aria-label="Current path">
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
      <span className="ml-auto flex-none pl-3 text-[10px] tabular-nums text-text-tertiary">{visibleGridRows.length} items</span>
    </nav>
  );

  const resultsTable = (
    <div className="relative block min-h-[420px] overflow-auto border border-sidebar-border bg-bg">
      <FileGrid
        rows={visibleGridRows}
        visibleColumns={gridVisibleColumns}
        fullPathName={showingDeleteCheck}
        selectable={!showingDeleteCheck}
        selectedPaths={selectedGridPaths}
        inspectedPath={inspected?.path}
        canBuildThumbnails={canBuildThumbnails}
        onOpen={onOpenGridEntry}
        onInspect={onInspectFile}
        onInspectRow={(entry) => { setInspected(entry); setInspectorOpen(true); }}
        onToggleSelection={onToggleGridSelection}
        onSetSelection={onSetGridSelection}
        onBuildThumbnails={showingDeleteCheck ? null : onRequestBuildThumbnailsForEntry}
        onExclude={showingDeleteCheck ? null : onRequestExcludePath}
        onDelete={showingDeleteCheck ? null : onRequestDeletePath}
      />
      {!visibleGridRows.length && (
        <p className="pointer-events-none absolute inset-x-0 top-[52px] z-[1] p-[18px] text-center text-[11px] text-muted">
          {filesLoading
            ? 'Loading files…'
            : showingDeleteCheck
              ? (deleteCheck ? 'No missing files.' : 'No Delete Check rows yet.')
              : activeScanStatus
                ? 'Waiting for the first flushed files...'
                : 'No files discovered at this path yet.'}
        </p>
      )}
    </div>
  );

  const inspectorPane = (
    <aside className="flex min-h-0 min-w-0 flex-col border border-sidebar-border bg-sidebar-bg" aria-label="File inspector">
      <div className="flex h-8 flex-none items-center justify-between border-b border-sidebar-border px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        <span>Inspector</span>
        <button
          type="button"
          onClick={() => setInspectorOpen(false)}
          className="grid h-5 w-5 place-items-center rounded text-text-tertiary transition-colors hover:text-text"
          aria-label="Close inspector"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      {inspected ? (
        <div className="min-h-0 overflow-auto p-3">
          <div className="mb-3 flex items-start gap-2">
            <Icon name="file" className="mt-0.5 h-[18px] w-[18px] flex-none text-text-tertiary" />
            <div className="min-w-0">
              <strong className="block truncate text-[12px] font-medium text-text">{inspected.name}</strong>
              <span className="text-[11px] text-text-tertiary">{inspected.file_kind || 'File'}</span>
            </div>
          </div>
          <dl className="grid gap-2.5 text-[11px]">
            <InspectorField label="Path" value={inspected.path} />
            <InspectorField label="Size" value={bytes(inspected.size)} />
            <InspectorField label="Modified" value={formatInspectorDate(inspected.mtime)} />
            <InspectorField label="Scan" value={activeScan.nickname || activeScan.id} />
          </dl>
          {typeof onInspectFile === 'function' && (
            <button
              type="button"
              onClick={() => onInspectFile(inspected)}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-text"
            >
              <Icon name="rowActions" className="h-3.5 w-3.5" /> Full details
            </button>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-4 text-center text-[11px] leading-relaxed text-text-tertiary">
          Select a row to keep its file context visible while you work in this scan.
        </div>
      )}
    </aside>
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

      {/* Workspace row: mode selector + view/command actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sidebar-border py-2">
        <div className="inline-flex h-[30px] flex-none items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5" role="tablist" aria-label="Scan views">
          {modes.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scanSubview === value}
              className={modePill(scanSubview === value)}
              onClick={() => onSetScanSubview(value)}
            >
              {value === 'delete-check' && <Icon name={icon} className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {showingDeleteCheck ? (
            <>
              <button type="button" className={ctrlBtn} onClick={() => onRunDeleteCheck(activeScan.id, [])} disabled={busy}>
                <Icon name="deleteCheck" className="h-3.5 w-3.5" /> Check current folder
              </button>
              {deleteCheck && (
                <button type="button" className={ctrlBtn} onClick={onCloseDeleteCheck} disabled={busy}>
                  <Icon name="close" className="h-3.5 w-3.5" /> Clear result
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className={ctrlBtn}
                onClick={() => onRunDeleteCheck(activeScan.id, selectedGridEntries)}
                disabled={busy}
              >
                <Icon name="deleteCheck" className="h-3.5 w-3.5" />
                {selectedCount ? `Delete check (${selectedCount})` : 'Delete check'}
              </button>
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
                onClick={() => onRequestBuildThumbnails(showingDeleteCheck ? [] : selectedGridEntries)}
                disabled={busy || !canBuildThumbnails}
                title={location.connected ? 'Build thumbnails for the current folder or selected rows' : 'Connect this location to build thumbnails'}
              >
                <Icon name="thumbnails" className="h-3.5 w-3.5" />
                {selectedCount ? `Build Thumbnails (${selectedCount})` : 'Build Thumbnails'}
              </button>
            </>
          )}
          <button type="button" className={`${ctrlBtn} ${showColumns ? 'bg-surface text-text' : ''}`} onClick={onToggleColumns} aria-expanded={showColumns}>
            <Icon name="columns" className="h-3.5 w-3.5" /> Columns
          </button>
          <button
            type="button"
            className={`${ctrlBtn} ${inspectorOpen ? 'bg-surface text-text' : ''}`}
            onClick={() => setInspectorOpen((open) => !open)}
            aria-pressed={inspectorOpen}
          >
            <Icon name="sidebarOpen" className="h-3.5 w-3.5" /> Inspector
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

      {!showingDeleteCheck && selectedCount > 0 && (
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

      {showingDeleteCheck ? (
        <>
          {deleteCheck ? (
            <section className={deleteCheckCalloutClassName({ safe: deleteCheck.safe })}>
              <div>
                <strong>{deleteCheck.safe ? 'Safe to delete' : 'Unsafe to delete'}</strong>
                <span>
                  {deleteCheck.safe
                    ? `All ${deleteCheck.total_count} files in ${deleteCheckPath || 'root'} are present in at least one other location.`
                    : `${deleteCheck.missing_count} of ${deleteCheck.total_count} files in ${deleteCheckPath || 'root'} are not present in another location.`}
                </span>
              </div>
              <Button variant="secondary" onClick={() => onSetScanSubview('files')} icon={<Icon name="browseFiles" />}>
                Back to files
              </Button>
            </section>
          ) : (
            <section className={deleteCheckEmptyClassName}>
              <strong>No Delete Check result yet</strong>
              <span>Run Delete Check from the Files tab to check the current folder or selected rows.</span>
              <Button variant="warning" onClick={() => onRunDeleteCheck(activeScan.id, [])} disabled={busy} icon={<Icon name="deleteCheck" />}>
                Check current folder
              </Button>
            </section>
          )}
          {resultsTable}
        </>
      ) : showingFileTree ? (
        <div
          className="mt-2 grid min-h-[620px] overflow-hidden border border-sidebar-border bg-bg"
          style={{ gridTemplateColumns: inspectorOpen ? 'minmax(190px,240px) minmax(0,1fr) 320px' : 'minmax(190px,240px) minmax(0,1fr)' }}
        >
          <div className="flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar-bg">
            <div className="flex flex-none items-center justify-between border-b border-sidebar-border px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              <span>Folders</span>
            </div>
            <DirectoryTree
              nodes={directoryTreeNodes}
              expandedPaths={directoryTreeExpandedPaths}
              loadingPaths={directoryTreeLoadingPaths}
              selectedPath={selectedPath}
              onToggle={onToggleDirectoryTree}
              onSelect={onLoadTree}
              onLoadMore={onLoadMoreDirectoryTree}
            />
          </div>
          <section className="flex min-w-0 flex-col border-r border-sidebar-border">
            {breadcrumbBar}
            {resultsTable}
          </section>
          {inspectorOpen && inspectorPane}
        </div>
      ) : (
        <div
          className="mt-2 grid overflow-hidden"
          style={{ gridTemplateColumns: inspectorOpen ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)' }}
        >
          <div className="min-w-0">
            {breadcrumbBar}
            {resultsTable}
          </div>
          {inspectorOpen && inspectorPane}
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

function InspectorField({ label, value }) {
  return (
    <div>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 m-0 break-words text-muted-strong">{value || '—'}</dd>
    </div>
  );
}

function formatInspectorDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
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
