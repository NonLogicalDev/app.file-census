import FileGrid from './FileGrid.jsx';
import DirectoryTree from './DirectoryTree.jsx';
import { Icon } from './Icon.jsx';
import SearchFilterControls from './search/SearchFilterControls.jsx';
import ScanProgressPools from './ScanProgressPools.jsx';
import {
  actionToolbarClassName,
  Button,
  breadcrumbsClassName,
  columnPickerClassName,
  deleteCheckCalloutClassName,
  deleteCheckEmptyClassName,
  emptyTextClassName,
  explorerClassName,
  explorerHeaderClassName,
  finderToolbarClassName,
  logLineClassName,
  logPanelClassName,
  notesPanelBodyClassName,
  scanNotesPanelClassName,
  SegmentedTab,
  SegmentedTabs,
  treeClassName,
  treeEmptyClassName,
  Toolbar
} from './ui/index.jsx';
import { bytes, isActiveStatus, statusLabel } from '../utils/format.js';

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
    onUpdateScan,
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

  if (!activeScan) return <p className={emptyTextClassName}>Select or run a scan to browse this location.</p>;
  const showingDeleteCheck = scanSubview === 'delete-check';
  const showingFileTree = scanSubview === 'tree';
  const selectedCount = selectedGridEntries.length;
  const canBuildThumbnails = Boolean(location?.connected && activeScan);
  const canStopScan = typeof onStopScan === 'function';
  const hasUnavailableScanControlStatus = activeScan.status === 'paused' || activeScan.status === 'repairing';
  const breadcrumbBar = (
    <div className={breadcrumbsClassName}>
      {breadcrumbs(selectedPath).map((crumb, index) => (
        <span className="inline-flex items-center gap-1.5" key={crumb.path}>
          {index > 0 && <span className="select-none text-muted" aria-hidden="true">-</span>}
          <button type="button" onClick={() => onLoadTree(crumb.path)}>{crumb.label}</button>
        </span>
      ))}
    </div>
  );
  const resultsTable = (
    <div className={treeClassName}>
      <FileGrid
        rows={visibleGridRows}
        visibleColumns={gridVisibleColumns}
        fullPathName={showingDeleteCheck}
        selectable={!showingDeleteCheck}
        selectedPaths={selectedGridPaths}
        canBuildThumbnails={canBuildThumbnails}
        onOpen={onOpenGridEntry}
        onInspect={onInspectFile}
        onToggleSelection={onToggleGridSelection}
        onSetSelection={onSetGridSelection}
        onBuildThumbnails={showingDeleteCheck ? null : onRequestBuildThumbnailsForEntry}
        onExclude={showingDeleteCheck ? null : onRequestExcludePath}
        onDelete={showingDeleteCheck ? null : onRequestDeletePath}
      />
      {!visibleGridRows.length && (
        <p className={treeEmptyClassName}>
          {filesLoading
            ? 'Loading files…'
            : showingDeleteCheck
              ? (deleteCheck ? 'No missing files.' : 'No Delete Check rows yet.')
              : isActiveStatus(activeScan.status)
                ? 'Waiting for the first flushed files...'
                : 'No files discovered at this path yet.'}
        </p>
      )}
    </div>
  );

  return (
    <div className={explorerClassName}>
      <SegmentedTabs className="mb-3" role="tablist" aria-label="Scan views">
        <SegmentedTab
          type="button"
          role="tab"
          aria-selected={scanSubview === 'files'}
          active={scanSubview === 'files'}
          onClick={() => onSetScanSubview('files')}
        >
          Files
        </SegmentedTab>
        <SegmentedTab
          type="button"
          role="tab"
          aria-selected={showingFileTree}
          active={showingFileTree}
          onClick={() => onSetScanSubview('tree')}
        >
          File tree
        </SegmentedTab>
        <SegmentedTab
          type="button"
          role="tab"
          aria-selected={scanSubview === 'delete-check'}
          active={scanSubview === 'delete-check'}
          onClick={() => onSetScanSubview('delete-check')}
        >
          Delete Check
        </SegmentedTab>
      </SegmentedTabs>

      <div className={explorerHeaderClassName}>
        <div>
          <h3>Files</h3>
          <span>{statusLabel(activeScan.status)} - {activeScan.file_count} indexed files - {bytes(activeScan.total_bytes)}</span>
        </div>
        {showScanActions && (
          <Toolbar className={actionToolbarClassName}>
            {isActiveStatus(activeScan.status) && canStopScan && activeScan.status !== 'stopping' && (
              <Button variant="warning" onClick={() => onStopScan(activeScan.id)} disabled={busy} icon={<Icon name="stop" />}>
                Stop
              </Button>
            )}
            {!isActiveStatus(activeScan.status) && (
              <Button variant="secondary" onClick={() => onUpdateScan(activeScan.id)} disabled={busy} icon={<Icon name="update" />}>
                Update scan
              </Button>
            )}
            {activeScan.is_representative ? (
              <Button
                variant="warning"
                onClick={() => onClearRepresentative(activeScan.id)}
                disabled={busy}
                icon={<Icon name="representative" />}
              >
                Clear representative
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onSetRepresentative(activeScan.id)}
                disabled={busy}
                icon={<Icon name="representative" />}
              >
                Use for duplicates
              </Button>
            )}
            <Button variant="secondary" onClick={() => onOpenScanNotes(activeScan)} disabled={busy} icon={<Icon name="edit" />}>
              {activeScan.notes ? 'Edit notes' : 'Add notes'}
            </Button>
            <Button variant="secondary" onClick={() => onOpenScanExcludes(activeScan)} disabled={busy} icon={<Icon name="exclude" />}>
              Excludes
            </Button>
            {!isActiveStatus(activeScan.status) && (
              <Button variant="danger" onClick={() => onRequestDeleteScan(activeScan.id)} disabled={busy} icon={<Icon name="delete" />}>
                Delete scan
              </Button>
            )}
          </Toolbar>
        )}
      </div>

      {activeScan.status === 'interrupted' && (
        <div className="my-2.5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-warning bg-warning-soft px-3 py-2.5 text-warning">
          <div className="min-w-0">
            <strong>Scan was interrupted</strong>
            <span className="ml-2 text-muted-strong">Repair is unavailable in this build. Use a new scan to create a complete index.</span>
          </div>
        </div>
      )}

      {hasUnavailableScanControlStatus && (
        <div className="my-2.5 rounded-panel border border-warning bg-warning-soft px-3 py-2.5 text-warning">
          <strong>{activeScan.status === 'paused' ? 'Pause and resume unavailable' : 'Repair unavailable'}</strong>
          <span className="ml-2 text-muted-strong">
            {activeScan.status === 'paused'
              ? 'Pause and resume are unavailable in this build. Use a new scan to refresh this location.'
              : 'Repair is unavailable in this build. Use a new scan to refresh this location.'}
          </span>
        </div>
      )}

      {activeScan.notes && (
        <section className={scanNotesPanelClassName}>
          <h3>Scan notes</h3>
          <p className={notesPanelBodyClassName}>{activeScan.notes}</p>
        </section>
      )}

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

      <Toolbar className={finderToolbarClassName}>
        {showingDeleteCheck ? (
          <>
            <Button variant="secondary" onClick={() => onSetScanSubview('files')} icon={<Icon name="browseFiles" />}>
              Files
            </Button>
            <Button variant="warning" onClick={() => onRunDeleteCheck(activeScan.id, [])} disabled={busy} icon={<Icon name="deleteCheck" />}>
              Check current folder
            </Button>
            {deleteCheck && (
              <Button variant="secondary" onClick={onCloseDeleteCheck} disabled={busy} icon={<Icon name="close" />}>
                Clear result
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onGoBack} disabled={pathHistoryIndex <= 0} icon={<Icon name="back" />}>
              Back
            </Button>
            <Button
              variant="secondary"
              onClick={onGoForward}
              disabled={pathHistoryIndex >= pathHistory.length - 1}
              trailingIcon={<Icon name="forward" className="-ml-[0.12rem] inline-block h-[1em] w-[1em] shrink-0 text-[0.95em] leading-none stroke-current" />}
            >
              Forward
            </Button>
            <Button variant="secondary" onClick={onGoParent} disabled={!selectedPath} icon={<Icon name="parent" />}>
              Parent
            </Button>
            <Button variant="warning" onClick={() => onRunDeleteCheck(activeScan.id, selectedGridEntries)} disabled={busy} icon={<Icon name="deleteCheck" />}>
              {selectedCount ? `Delete check (${selectedCount})` : 'Delete check'}
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          onClick={() => onBrowseCurrentFolder(location)}
          disabled={busy || !location.connected}
          icon={<Icon name="folder" />}
        >
          Browse Folder
        </Button>
        <Button
          variant="secondary"
          onClick={() => onRequestBuildThumbnails(showingDeleteCheck ? [] : selectedGridEntries)}
          disabled={busy || !canBuildThumbnails}
          icon={<Icon name="thumbnails" />}
          title={location.connected ? 'Build thumbnails for the current folder or selected rows' : 'Connect this location to build thumbnails'}
        >
          {selectedCount && !showingDeleteCheck ? `Build Thumbnails (${selectedCount})` : 'Build Thumbnails'}
        </Button>
        <Button variant="secondary" onClick={onToggleColumns} icon={<Icon name="columns" />}>
          Columns
        </Button>
      </Toolbar>

      {!showingDeleteCheck && selectedCount > 0 && (
        <div className="mb-2 flex min-h-9 items-center justify-between gap-3 rounded-ui border border-accent/25 bg-accent-soft px-3 py-1.5 text-sm text-accent">
          <span className="font-semibold">{selectedCount} selected</span>
          <Button variant="ghost" size="sm" onClick={onClearGridSelection} disabled={busy} icon={<Icon name="close" />}>
            Clear selection
          </Button>
        </div>
      )}

      {showColumns && (
        <div className={columnPickerClassName}>
          {fileColumns.map(([column, label]) => (
            <label key={column}>
              <input type="checkbox" checked={visibleColumns.includes(column)} disabled={column === 'name'} onChange={() => onToggleColumn(column)} /> {label}
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
        <div className="grid min-h-[620px] overflow-hidden rounded-panel border border-border bg-surface md:grid-cols-[minmax(190px,240px)_minmax(0,1fr)]">
          <DirectoryTree
            nodes={directoryTreeNodes}
            expandedPaths={directoryTreeExpandedPaths}
            loadingPaths={directoryTreeLoadingPaths}
            selectedPath={selectedPath}
            onToggle={onToggleDirectoryTree}
            onSelect={onLoadTree}
            onLoadMore={onLoadMoreDirectoryTree}
          />
          <section className="min-w-0 bg-bg p-[5px]">
            {breadcrumbBar}
            {resultsTable}
          </section>
        </div>
      ) : (
        <>
          {breadcrumbBar}
          {resultsTable}
        </>
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
