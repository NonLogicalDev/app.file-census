import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Icon } from './Icon.jsx';
import {
  fileGridActionsClassName,
  fileGridCellClassName,
  fileGridCellContentClassName,
  fileGridCheckboxClassName,
  fileGridClassName,
  fileGridHeaderButtonClassName,
  fileGridHeaderCellClassName,
  fileGridNumericClassName,
  fileGridResizerClassName,
  fileGridRowActionMenuClassName,
  fileGridRowActionPanelClassName,
  fileGridRowActionTriggerClassName,
  fileGridRowClassName,
  fileGridSelectClassName,
  fileGridSortClassName,
  fileGridTableClassName,
  fileKindIconClassName,
  fileNameCellClassName,
  fileNameLabelClassName,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger
} from './ui/index.jsx';
import { bytes, shortHash } from '../utils/format.js';

const numericColumnMeta = { align: 'right', className: fileGridNumericClassName };
const centeredControlColumnMeta = {
  align: 'center',
  contentOverflowVisible: true,
  className: fileGridSelectClassName
};

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
    <div className={fileGridClassName}>
      <table className={fileGridTableClassName} style={{ width: table.getTotalSize() }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const headerAlign = header.column.columnDef.meta?.align;

                return (
                  <th
                    key={header.id}
                    className={fileGridHeaderCellClassName({
                      sortable,
                      className: header.column.columnDef.meta?.className
                    })}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={fileGridHeaderButtonClassName({ align: headerAlign })}
                        disabled={!sortable}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className={fileGridSortClassName}>{sortIndicator(header.column.getIsSorted())}</span>
                      </button>
                    )}
                    {header.column.getCanResize() && (
                      <span
                        className={fileGridResizerClassName({ resizing: header.column.getIsResizing() })}
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
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => (
            <tr
              key={row.id}
              className={fileGridRowClassName({
                index,
                kind: row.original.kind,
                actionable: isActionableRow(row.original),
                selected: selectedSet.has(row.original.path)
              })}
              onDoubleClick={() => {
                if (row.original.kind === 'file') onInspect?.(row.original);
                if (row.original.kind === 'dir' || row.original.kind === 'parent') onOpen?.(row.original);
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={fileGridCellClassName({ className: cell.column.columnDef.meta?.className })}
                  style={{ width: cell.column.getSize() }}
                >
                  <span className={fileGridCellContentClassName({ overflowVisible: cell.column.columnDef.meta?.contentOverflowVisible })}>
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
          className={fileGridCheckboxClassName}
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
      meta: centeredControlColumnMeta,
      cell: ({ row }) => {
        if (!isSelectableRow(row.original)) return '';
        return (
          <input
            aria-label={`Select ${row.original.name}`}
            checked={selectedSet.has(row.original.path)}
            className={fileGridCheckboxClassName}
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
      meta: numericColumnMeta,
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : bytes(getValue())
    },
    {
      accessorKey: 'duplicate_file_count',
      header: 'Dup',
      size: 68,
      minSize: 56,
      meta: numericColumnMeta,
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : getValue() ?? 0
    },
    {
      accessorKey: 'original_file_count',
      header: 'Uniq',
      size: 68,
      minSize: 56,
      meta: numericColumnMeta,
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : getValue() ?? 0
    },
    {
      accessorKey: 'same_scan_duplicate_file_count',
      header: 'Scan Dup',
      size: 94,
      minSize: 74,
      meta: numericColumnMeta,
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
      meta: {
        ...centeredControlColumnMeta,
        className: fileGridActionsClassName
      },
      cell: ({ row }) => {
        if (!row.original || row.original.kind === 'parent') return '';
        return (
          <Menu className={fileGridRowActionMenuClassName} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
            <MenuTrigger
              aria-label={`Actions for ${row.original.name}`}
              title="Row actions"
              variant="ghost"
              size="sm"
              className={fileGridRowActionTriggerClassName}
              icon={<Icon name="rowActions" />}
            />
            <MenuContent align="end" className={fileGridRowActionPanelClassName}>
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
    <span className={fileNameCellClassName({ kind: entry.kind })}>
      <Icon name={iconName} className={fileKindIconClassName} />
      <span className={fileNameLabelClassName}>{label}</span>
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
