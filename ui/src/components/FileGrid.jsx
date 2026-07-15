import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Icon } from './Icon.jsx';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './ui/index.jsx';
import { bytes, shortHash } from '../utils/format.js';

export default function FileGrid({
  rows = [],
  visibleColumns = [],
  fullPathName = false,
  selectable = false,
  selectedPaths = [],
  canBuildThumbnails = true,
  onOpen,
  onInspect,
  onToggleSelection,
  onSetSelection,
  onBuildThumbnails,
  onExclude,
  onDelete
}) {
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectableRows = useMemo(() => rows.filter(isSelectableRow), [rows]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedSet.has(row.path));
  const columns = useMemo(
    () => baseColumns({ fullPathName, selectable, selectedSet, allSelected, selectableRows, canBuildThumbnails, onToggleSelection, onSetSelection, onBuildThumbnails, onExclude, onDelete }),
    [allSelected, canBuildThumbnails, fullPathName, onBuildThumbnails, onDelete, onExclude, onSetSelection, onToggleSelection, selectable, selectableRows, selectedSet]
  );
  const columnVisibility = useMemo(() => {
    return Object.fromEntries(columns.map((column) => {
      const id = column.id || column.accessorKey;
      return [id, id === 'select' || id === 'name' || id === 'actions' || visibleColumns.includes(id)];
    }));
  }, [columns, visibleColumns]);
  const [columnSizing, setColumnSizing] = useState({});

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility, columnSizing },
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 56,
      size: 120,
      maxSize: 900
    },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.path || row.name
  });

  return (
    <div className="file-grid">
      <table className="file-grid-table" style={{ width: table.getTotalSize() }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={[
                    header.column.getCanSort() ? 'sortable' : '',
                    header.column.columnDef.meta?.className || ''
                  ].filter(Boolean).join(' ')}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className="file-grid-header"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="file-grid-sort">{sortIndicator(header.column.getIsSorted())}</span>
                    </button>
                  )}
                  {header.column.getCanResize() && (
                    <span
                      className={`file-grid-resizer${header.column.getIsResizing() ? ' resizing' : ''}`}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        header.column.resetSize();
                      }}
                      role="separator"
                      aria-label={`Resize ${header.column.columnDef.header || header.id}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => (
            <tr
              key={row.id}
              className={[
                'file-grid-row',
                index % 2 === 1 ? 'file-grid-row-odd' : 'file-grid-row-even',
                row.original.kind === 'dir' || row.original.kind === 'parent' ? 'folder-row' : '',
                isActionableRow(row.original) ? 'is-actionable' : '',
                selectedSet.has(row.original.path) ? 'is-selected' : ''
              ].filter(Boolean).join(' ')}
              onDoubleClick={() => {
                if (row.original.kind === 'file') onInspect?.(row.original);
                if (row.original.kind === 'dir' || row.original.kind === 'parent') onOpen?.(row.original);
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className}
                  style={{ width: cell.column.getSize() }}
                >
                  <span className="file-grid-cell-content">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function baseColumns(options) {
  const {
    fullPathName,
    selectable,
    selectedSet,
    allSelected,
    selectableRows,
    canBuildThumbnails,
    onToggleSelection,
    onSetSelection,
    onBuildThumbnails,
    onExclude,
    onDelete
  } = options;
  const columns = [];

  if (selectable) {
    columns.push({
      id: 'select',
      header: () => (
        <input
          aria-label="Select all visible rows"
          checked={allSelected}
          disabled={!selectableRows.length}
          type="checkbox"
          onChange={() => onSetSelection?.(allSelected ? [] : selectableRows)}
        />
      ),
      size: 42,
      minSize: 42,
      maxSize: 42,
      enableSorting: false,
      enableResizing: false,
      meta: { className: 'row-select' },
      cell: ({ row }) => {
        if (!isSelectableRow(row.original)) return '';
        return (
          <input
            aria-label={`Select ${row.original.name}`}
            checked={selectedSet.has(row.original.path)}
            type="checkbox"
            onChange={() => onToggleSelection?.(row.original)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        );
      }
    });
  }

  columns.push(
    {
      accessorKey: 'name',
      header: fullPathName ? 'Path + Name' : 'Name',
      size: fullPathName ? 520 : 360,
      minSize: 220,
      cell: ({ row, getValue }) => <NameCell fullPathName={fullPathName} row={row} value={getValue()} />
    },
    {
      accessorKey: 'size',
      header: 'Size',
      size: 96,
      minSize: 72,
      meta: { className: 'numeric' },
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : bytes(getValue())
    },
    {
      accessorKey: 'duplicate_file_count',
      header: 'Dup',
      size: 68,
      minSize: 56,
      meta: { className: 'numeric' },
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : getValue() ?? 0
    },
    {
      accessorKey: 'original_file_count',
      header: 'Uniq',
      size: 68,
      minSize: 56,
      meta: { className: 'numeric' },
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : getValue() ?? 0
    },
    {
      accessorKey: 'same_scan_duplicate_file_count',
      header: 'Scan Dup',
      size: 94,
      minSize: 74,
      meta: { className: 'numeric' },
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : getValue() ?? 0
    },
    { accessorKey: 'blake3', header: 'BLAKE3', size: 126, minSize: 90, cell: ({ getValue }) => shortHash(getValue()) },
    { accessorKey: 'ctime', header: 'CTime', size: 168, minSize: 120, cell: ({ getValue }) => formatDate(getValue()) },
    { accessorKey: 'mtime', header: 'Modified', size: 168, minSize: 120, cell: ({ getValue }) => formatDate(getValue()) },
    { accessorKey: 'mode', header: 'Mode', size: 88, minSize: 68 },
    { accessorKey: 'sha256', header: 'SHA-256', size: 126, minSize: 90, cell: ({ getValue }) => shortHash(getValue()) },
    { accessorKey: 'path', header: 'Path', size: 340, minSize: 180 }
  );

  if (onDelete || onBuildThumbnails || onExclude) {
    columns.push({
      id: 'actions',
      header: '',
      size: 44,
      minSize: 44,
      maxSize: 54,
      enableSorting: false,
      enableResizing: false,
      meta: { className: 'row-actions' },
      cell: ({ row }) => {
        if (!row.original || row.original.kind === 'parent') return '';
        return (
          <Menu className="file-row-action-menu" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
            <MenuTrigger
              aria-label={`Actions for ${row.original.name}`}
              title="Row actions"
              variant="ghost"
              size="sm"
              className="file-row-action-trigger"
              icon={<Icon name="rowActions" />}
            />
            <MenuContent align="end" className="file-row-action-panel">
              {onBuildThumbnails && (
                <MenuItem
                  disabled={!canBuildThumbnails}
                  icon={<Icon name="thumbnails" />}
                  onClick={() => onBuildThumbnails(row.original)}
                >
                  Build thumbnails
                </MenuItem>
              )}
              {onDelete && (
                <MenuItem
                  variant="danger"
                  icon={<Icon name="delete" />}
                  onClick={() => onDelete(row.original)}
                >
                  Remove from scan
                </MenuItem>
              )}
              {onExclude && (
                <MenuItem
                  variant="warning"
                  icon={<Icon name="exclude" />}
                  onClick={() => onExclude(row.original)}
                >
                  Exclude from scan
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        );
      }
    });
  }
  return columns;
}

function NameCell({ fullPathName, row, value }) {
  const entry = row.original;
  const label = entry.kind === 'parent'
    ? '../'
    : fullPathName && entry.path
      ? entry.path
      : entry.kind === 'dir'
        ? `${value}/`
        : value;
  const iconName = entry.kind === 'file' ? 'file' : entry.kind === 'parent' ? 'parent' : 'folder';
  return (
    <span className={`file-name-cell ${entry.kind}`}>
      <Icon name={iconName} className="file-kind-icon" />
      <span>{label}</span>
    </span>
  );
}

function isSelectableRow(row) {
  return Boolean(row?.path && row.kind !== 'parent');
}

function isActionableRow(row) {
  return row?.kind === 'file' || row?.kind === 'dir' || row?.kind === 'parent';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '';
}

function sortIndicator(sortState) {
  if (sortState === 'asc') return '▲';
  if (sortState === 'desc') return '▼';
  return '';
}
