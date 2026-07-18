import { useState } from 'react';

import FileGrid from '../components/FileGrid.jsx';
import { Icon } from '../components/Icon.jsx';
import SearchFilterControls from '../components/search/SearchFilterControls.jsx';
import ScanScopeSelector from '../components/search/ScanScopeSelector.jsx';
import {
  Button,
  Menu,
  MenuContent,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  emptyTextClassName,
  pageGridClassName,
  pageHeaderClassName
} from '../components/ui/index.jsx';

const defaultSearchColumns = ['name', 'size', 'file_count', 'duplicate_file_count', 'original_file_count', 'same_scan_duplicate_file_count', 'blake3', 'ctime', 'mtime', 'mode', 'sha256', 'path'];

const searchColumnOptions = [
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
  ['sha256', 'SHA-256'],
  ['path', 'Path']
];

export default function SearchPage({
  query,
  setQuery,
  filters,
  locations = [],
  scans = [],
  results = [],
  busy,
  loading = false,
  searchAllScans,
  selectedScanIds = [],
  onSearch,
  onSetSearchAllScans,
  onSetSelectedScanIds,
  onReplaceFilterState,
  onInspectResult,
  initialShowColumnControls = false
}) {
  const [showColumnControls, setShowColumnControls] = useState(initialShowColumnControls);
  const [searchColumns, setSearchColumns] = useState(defaultSearchColumns);
  const rows = results || [];

  function onToggleSearchColumn(column) {
    if (column === 'name') return;
    setSearchColumns((current) => current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column]);
  }

  function onResetSearchColumns() {
    setSearchColumns(defaultSearchColumns);
  }

  return (
    <section className={pageGridClassName}>
      <div className={pageHeaderClassName}>
        <div>
          <h2>Find files</h2>
          <p className="m-0 text-sm text-muted">Flat results across the selected scan scope. Use Locations to browse a scan’s directory tree.</p>
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
      <SearchColumnControls
        open={showColumnControls}
        onOpenChange={setShowColumnControls}
        columns={searchColumns}
        options={searchColumnOptions}
        onResetSearchColumns={onResetSearchColumns}
        onToggleSearchColumn={onToggleSearchColumn}
      />
      {loading ? (
        <p className={emptyTextClassName}>Searching files...</p>
      ) : rows.length ? (
        <FileGrid
          storageKey="search-results"
          rows={rows}
          visibleColumns={searchColumns}
          fullPathName={false}
          onInspect={onInspectResult}
        />
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
  onToggleSearchColumn
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
              return (
                <div
                  key={column}
                  className="rounded-ui px-2 py-1.5 hover:bg-surface-muted"
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
                </div>
              );
            })}
          </div>
        </MenuContent>
      </Menu>
    </div>
  );
}
