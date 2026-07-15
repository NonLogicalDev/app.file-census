import { useMemo, useState } from 'react';

import FileGrid from '../components/FileGrid.jsx';
import { Icon } from '../components/Icon.jsx';
import SearchFilterControls from '../components/search/SearchFilterControls.jsx';
import ScanScopeSelector from '../components/search/ScanScopeSelector.jsx';
import { buildSearchTree } from '../utils/searchTree.js';
import { scanLabel } from '../utils/format.js';
import {
  Button,
  Menu,
  MenuContent,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  SegmentedTab,
  SegmentedTabs,
  emptyTextClassName,
  pageGridClassName,
  pageHeaderClassName
} from '../components/ui/index.jsx';

const defaultSearchColumns = ['name', 'location_slug', 'scan_nickname', 'scan_id', 'scan_started_at', 'size', 'file_count', 'blake3', 'ctime', 'mtime', 'mode', 'sha256', 'path'];

const searchColumnOptions = [
  ['name', 'Name'],
  ['location_slug', 'Location'],
  ['scan_nickname', 'Scan Name'],
  ['scan_id', 'Scan ID'],
  ['scan_started_at', 'Scan Created'],
  ['size', 'Size'],
  ['file_count', 'Files'],
  ['blake3', 'BLAKE3'],
  ['ctime', 'CTime'],
  ['mtime', 'Modified'],
  ['mode', 'Mode'],
  ['sha256', 'SHA-256'],
  ['path', 'Path']
];

export default function SearchPage({
  query,
  setQuery,
  filters,
  locations,
  scans,
  results,
  busy,
  loading = false,
  searchView,
  searchAllScans,
  selectedScanIds = [],
  onSearch,
  onSetSearchView,
  onSetSearchAllScans,
  onSetSelectedScanIds,
  onAddFilter,
  onRemoveFilter,
  onGroupFilters,
  onReplaceFilterState,
  onInspectResult,
  initialShowColumnControls = false
}) {
  const scanById = useMemo(() => new Map((scans || []).map((scan) => [scan.id, scan])), [scans]);
  const [showColumnControls, setShowColumnControls] = useState(initialShowColumnControls);
  const [searchColumns, setSearchColumns] = useState(defaultSearchColumns);
  const rows = useMemo(() => enrichSearchRows(results, scanById), [results, scanById]);
  const tree = useMemo(() => buildSearchTree(rows, scans), [rows, scans]);

  function onToggleSearchColumn(column) {
    if (column === 'name') return;
    setSearchColumns((current) => current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column]);
  }

  function onMoveSearchColumn(column, direction) {
    setSearchColumns((current) => {
      const index = current.indexOf(column);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function onResetSearchColumns() {
    setSearchColumns(defaultSearchColumns);
  }

  return (
    <section className={pageGridClassName}>
      <div className={pageHeaderClassName}>
        <div>
          <h2>Find files</h2>
        </div>
      </div>
      <SearchFilterControls
        query={query}
        setQuery={setQuery}
        filters={filters}
        locations={locations}
        busy={busy}
        placeholder="filename or path"
        submitLabel="Search"
        onSubmit={onSearch}
        onAddFilter={onAddFilter}
        onRemoveFilter={onRemoveFilter}
        onGroupFilters={onGroupFilters}
        onReplaceFilterState={onReplaceFilterState}
      />
      <ScanScopeSelector
        scope={selectedScanIds.length ? 'explicit' : searchAllScans ? 'all' : 'representative'}
        allowAll
        locations={locations}
        scans={scans}
        selectedScanIds={selectedScanIds}
        busy={busy}
        loading={loading}
        onScopeChange={(nextScope) => {
          if (nextScope === 'all') onSetSearchAllScans(true);
          else if (nextScope === 'representative') onSetSearchAllScans(false);
        }}
        onSetSelectedScanIds={onSetSelectedScanIds}
      />
      <SegmentedTabs role="tablist" aria-label="Search result views">
        <SegmentedTab role="tab" aria-selected={searchView === 'flat'} active={searchView === 'flat'} onClick={() => onSetSearchView('flat')}>Flat</SegmentedTab>
        <SegmentedTab role="tab" aria-selected={searchView === 'tree'} active={searchView === 'tree'} onClick={() => onSetSearchView('tree')}>File tree</SegmentedTab>
      </SegmentedTabs>
      <SearchColumnControls
        open={showColumnControls}
        onOpenChange={setShowColumnControls}
        columns={searchColumns}
        options={searchColumnOptions}
        onResetSearchColumns={onResetSearchColumns}
        onToggleSearchColumn={onToggleSearchColumn}
        onMoveSearchColumn={onMoveSearchColumn}
      />
      {loading ? (
        <p className={emptyTextClassName}>Searching files...</p>
      ) : results.length ? (
        searchView === 'flat' ? (
          <FileGrid
            rows={rows}
            columnOrder={searchColumns}
            visibleColumns={searchColumns}
            fullPathName={false}
            showLocationColumns
            onInspect={onInspectResult}
          />
        ) : (
          <FileGrid
            rows={tree}
            columnOrder={searchColumns}
            visibleColumns={searchColumns}
            fullPathName={false}
            showLocationColumns
            hierarchical
            onInspect={onInspectResult}
          />
        )
      ) : (
        <p className={emptyTextClassName}>Search by filename, extension, or path fragment.</p>
      )}
    </section>
  );
}

function SearchColumnControls({
  open,
  onOpenChange,
  columns,
  options,
  onResetSearchColumns,
  onToggleSearchColumn,
  onMoveSearchColumn
}) {
  return (
    <div className="flex justify-end">
      <Menu open={open} onOpenChange={onOpenChange}>
        <MenuTrigger variant="secondary" size="sm" icon={<Icon name="columns" />}>
          Columns
        </MenuTrigger>
        <MenuContent
          align="end"
          className="max-h-[min(520px,calc(100vh-220px))] w-[min(380px,calc(100vw-48px))] overflow-y-auto p-2"
        >
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <MenuLabel className="px-0 py-0">Columns</MenuLabel>
            <Button variant="ghost" size="sm" className="!min-h-7 !px-2" onClick={onResetSearchColumns}>
              Reset
            </Button>
          </div>
          <MenuSeparator />
          <div className="grid gap-1" aria-label="Search result columns">
            {options.map(([column, label]) => {
              const visible = columns.includes(column);
              const orderIndex = columns.indexOf(column);
              return (
                <div
                  key={column}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-ui px-2 py-1.5 hover:bg-surface-muted"
                >
                  <label
                    className="flex min-w-0 items-center gap-2 text-sm font-medium text-text"
                    title={column === 'name' ? 'Name is always visible' : `Show ${label}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={visible}
                      disabled={column === 'name'}
                      onChange={() => onToggleSearchColumn(column)}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-border bg-surface text-muted-strong hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-40"
                    disabled={!visible || orderIndex <= 0}
                    title={`Move ${label} left`}
                    onClick={() => onMoveSearchColumn(column, -1)}
                  >
                    <Icon name="back" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-border bg-surface text-muted-strong hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-40"
                    disabled={!visible || orderIndex < 0 || orderIndex >= columns.length - 1}
                    title={`Move ${label} right`}
                    onClick={() => onMoveSearchColumn(column, 1)}
                  >
                    <Icon name="forward" />
                  </button>
                </div>
              );
            })}
          </div>
        </MenuContent>
      </Menu>
    </div>
  );
}

function enrichSearchRows(results, scanById) {
  return (results || []).map((row) => {
    const scan = scanById.get(row.scan_id);
    return {
      ...row,
      scan_nickname: scan ? scanLabel(scan) : row.scan_nickname || '',
      scan_started_at: scan?.started_at || row.scan_started_at || null
    };
  });
}
