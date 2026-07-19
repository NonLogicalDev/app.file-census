import { useEffect, useMemo, useRef, useState } from 'react';
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

// Control columns stay pinned to the left and never participate in reordering.
const CONTROL_COLUMN_IDS = ['actions', 'select'];

function isReorderableColumn(columnId) {
  return !CONTROL_COLUMN_IDS.includes(columnId);
}

// Folders (and the `../` parent entry) always sort ahead of files, regardless
// of the active column or direction.
function kindRank(entry) {
  if (entry?.kind === 'parent') return 0;
  if (entry?.kind === 'dir') return 1;
  return 2;
}

// Delete Check status: 'unsafe' (no copy anywhere), 'warn' (light-hash match
// only — probably the same file but unproven), 'safe' (exact full-hash copy
// elsewhere). Ranked riskiest-first for sorting.
function deleteCheckRank(status) {
  if (status === 'unsafe') return 0;
  if (status === 'warn') return 1;
  return 2;
}

const deleteCheckBadgeBase =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.03em] whitespace-nowrap';

// `here` = surviving copies of this content in the same location/scan (outside
// the deletion selection); `away` = exact copies in other locations'
// representative scans. Together they explain the status via the refcount model.
// Total exact copies of this content that exist (this file + its copies). Shown
// so a "backed up" file also states how many copies exist, and a same-location
// duplicate that has no off-disk backup does not read as a true "last copy".
function CopiesExist({ here = 0, away = 0 }) {
  const total = 1 + here + away;
  if (total <= 1) return null;
  return (
    <span className="ml-1.5 text-[10px] text-muted tabular-nums" title={`${here} more on this disk, ${away} on other locations`}>
      [{total.toLocaleString()} copies exist]
    </span>
  );
}

const badgeRed = `${deleteCheckBadgeBase} border-danger/50 bg-[color:color-mix(in_srgb,var(--danger)_14%,var(--surface))] text-danger`;
const badgeAmber = `${deleteCheckBadgeBase} border-warning/50 bg-warning-soft text-warning`;
const badgeGreen = `${deleteCheckBadgeBase} border-success/40 bg-[color:color-mix(in_srgb,var(--success)_12%,var(--surface))] text-success`;

// File Backup cell. External scope: is this content backed up on ANOTHER disk?
// Internal scope: is there another copy of it on THIS disk?
function DeleteCheckStatusBadge({ status, here = 0, away = 0, scope = 'external' }) {
  if (!status) {
    return <span className="text-[10px] text-text-tertiary">—</span>;
  }
  if (scope === 'internal') {
    if (status === 'safe') {
      return (
        <span className="inline-flex items-center">
          <span className={badgeGreen} title="Another exact copy of this content exists on this same disk."><Icon name="copy" className="h-3 w-3" /> Duplicated here</span>
          <CopiesExist here={here} away={away} />
        </span>
      );
    }
    if (status === 'warn') {
      return (
        <span className="inline-flex items-center">
          <span className={badgeAmber} title="A light-hash (same size) match exists on this disk — probably a duplicate."><Icon name="warning" className="h-3 w-3" /> Similar here</span>
          <CopiesExist here={here} away={away} />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center">
        <span className={badgeRed} title="No duplicate of this content on this disk."><Icon name="warning" className="h-3 w-3" /> Unique here</span>
        {away > 0 && <span className="ml-1.5 text-[10px] text-muted tabular-nums" title={`${away} copies on other locations`}>[{away} off-disk]</span>}
      </span>
    );
  }
  if (status === 'unsafe') {
    // External: no copy on another location. If there are same-disk copies, say
    // so rather than "last copy" (deleting one still leaves others).
    if (here > 0) {
      return (
        <span className="inline-flex items-center">
          <span className={badgeRed} title="No copy on another location. Duplicated on this disk only."><Icon name="warning" className="h-3 w-3" /> No off-disk backup</span>
          <CopiesExist here={here} away={away} />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center">
        <span className={badgeRed} title="The only copy anywhere in scope. Deleting it loses the content."><Icon name="warning" className="h-3 w-3" /> Last copy</span>
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span className="inline-flex items-center">
        <span className={badgeAmber} title="Only a light-hash (same size) match on another location: probably the same file, but not proven by full hash."><Icon name="warning" className="h-3 w-3" /> Partial</span>
        <CopiesExist here={here} away={away} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center">
      <span className={badgeGreen} title="An exact full-hash copy exists on another location."><Icon name="check" className="h-3 w-3" /> Safe</span>
      <CopiesExist here={here} away={away} />
    </span>
  );
}

// Folder Backup cell: how many UNIQUE contents in the folder fall in each tier.
function FolderRollupBadge({ safe = 0, warn = 0, unsafe = 0 }) {
  if (!safe && !warn && !unsafe) {
    return <span className="text-[10px] text-text-tertiary">—</span>;
  }
  const chip = 'inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-bold tabular-nums';
  return (
    <span className="inline-flex flex-wrap items-center gap-1" title="Unique contents in this folder, by backup status">
      {safe > 0 && <span className={`${chip} border-success/45 text-success`}>{safe.toLocaleString()} safe</span>}
      {warn > 0 && <span className={`${chip} border-warning/50 text-warning`}>{warn.toLocaleString()} partial</span>}
      {unsafe > 0 && <span className={`${chip} border-danger/50 text-danger`}>{unsafe.toLocaleString()} unsafe</span>}
    </span>
  );
}

function compareCellValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Keep control columns first (in their canonical order) regardless of any
// stored/dragged ordering, so a reorder can never bury the checkbox/actions.
function pinControlColumns(order) {
  const controls = order
    .filter((id) => CONTROL_COLUMN_IDS.includes(id))
    .sort((a, b) => CONTROL_COLUMN_IDS.indexOf(a) - CONTROL_COLUMN_IDS.indexOf(b));
  const rest = order.filter((id) => !CONTROL_COLUMN_IDS.includes(id));
  return [...controls, ...rest];
}

// Merge a persisted/previous order with the current natural order: keep the
// user's order for columns that still exist, append any new columns, drop any
// that disappeared (e.g. when `selectable` toggles the select column off).
function reconcileColumnOrder(previous, natural) {
  const naturalSet = new Set(natural);
  const kept = previous.filter((id) => naturalSet.has(id));
  const keptSet = new Set(kept);
  const merged = [...kept];
  natural.forEach((id) => {
    if (!keptSet.has(id)) merged.push(id);
  });
  return pinControlColumns(merged);
}

// Drop `sourceId` immediately before `targetId`.
function moveColumnBefore(order, sourceId, targetId) {
  if (sourceId === targetId) return order;
  const next = order.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex === -1) return order;
  next.splice(targetIndex, 0, sourceId);
  return pinControlColumns(next);
}

function layoutStorageKey(storageKey) {
  return `fileGrid.layout:${storageKey}`;
}

function loadStoredLayout(storageKey) {
  try {
    const raw = window.localStorage.getItem(layoutStorageKey(storageKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      columnOrder: Array.isArray(parsed?.columnOrder) ? parsed.columnOrder : undefined,
      columnSizing:
        parsed?.columnSizing && typeof parsed.columnSizing === 'object'
          ? parsed.columnSizing
          : undefined
    };
  } catch {
    return {};
  }
}

export default function FileGrid({
  rows = [],
  visibleColumns = [],
  fullPathName = false,
  selectable = false,
  selectedPaths = [],
  inspectedPath = null,
  canBuildThumbnails = true,
  storageKey = 'file-grid',
  deleteCheck = false,
  scope = 'external',
  onOpen,
  onInspect,
  onInspectRow,
  onToggleSelection,
  onSetSelection,
  onBuildThumbnails,
  onExclude,
  onDelete,
  onAddDeleteCheck
}) {
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectableRows = useMemo(() => rows.filter(isSelectableRow), [rows]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedSet.has(row.path));
  const columns = useMemo(
    () => baseColumns({ fullPathName, selectable, selectedSet, allSelected, selectableRows, canBuildThumbnails, deleteCheck, scope, onToggleSelection, onSetSelection, onBuildThumbnails, onExclude, onDelete, onAddDeleteCheck }),
    [allSelected, canBuildThumbnails, deleteCheck, scope, fullPathName, onAddDeleteCheck, onBuildThumbnails, onDelete, onExclude, onSetSelection, onToggleSelection, selectable, selectableRows, selectedSet]
  );
  const columnVisibility = useMemo(() => {
    return Object.fromEntries(columns.map((column) => {
      const id = column.id || column.accessorKey;
      return [id, id === 'select' || id === 'name' || id === 'actions' || id === 'backup' || visibleColumns.includes(id)];
    }));
  }, [columns, visibleColumns]);
  const naturalColumnOrder = useMemo(
    () => columns.map((column) => column.id || column.accessorKey),
    [columns]
  );

  // Baseline (unsorted) order: parent → dirs → files. Array.sort is stable, so
  // within-group order from the source is preserved.
  const orderedRows = useMemo(() => {
    return [...rows].sort((a, b) => kindRank(a) - kindRank(b));
  }, [rows]);

  // Live sort direction, read by the folders-first sorting fn to cancel
  // TanStack's descending negation so folders stay on top in both directions.
  const sortingStateRef = useRef([]);
  const foldersFirstSortingFn = useMemo(
    () => (rowA, rowB, columnId) => {
      const rankDelta = kindRank(rowA.original) - kindRank(rowB.original);
      if (rankDelta !== 0) {
        const desc = sortingStateRef.current?.some((sort) => sort.id === columnId && sort.desc);
        return rankDelta * (desc ? -1 : 1);
      }
      return compareCellValues(rowA.getValue(columnId), rowB.getValue(columnId));
    },
    []
  );

  const [columnSizing, setColumnSizing] = useState(() => loadStoredLayout(storageKey).columnSizing || {});
  const [columnOrder, setColumnOrder] = useState(() =>
    reconcileColumnOrder(loadStoredLayout(storageKey).columnOrder || [], naturalColumnOrder)
  );
  // { dragging: columnId | null, over: columnId | null } for drag feedback.
  const [dragState, setDragState] = useState({ dragging: null, over: null });

  // Keep the order in sync when the column set changes (selectable toggling the
  // checkbox column, path/name header swap, etc.) while preserving user order.
  useEffect(() => {
    setColumnOrder((previous) => {
      const next = reconcileColumnOrder(previous, naturalColumnOrder);
      if (next.length === previous.length && next.every((id, index) => id === previous[index])) {
        return previous;
      }
      return next;
    });
  }, [naturalColumnOrder]);

  // Persist order + sizing so a user's layout survives navigation/reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        layoutStorageKey(storageKey),
        JSON.stringify({ columnOrder, columnSizing })
      );
    } catch {
      /* storage unavailable (private mode, quota) — layout is best-effort */
    }
  }, [storageKey, columnOrder, columnSizing]);

  const table = useReactTable({
    data: orderedRows,
    columns,
    state: { columnVisibility, columnSizing, columnOrder },
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 56,
      size: 120,
      maxSize: 900,
      sortingFn: foldersFirstSortingFn
    },
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.path || row.name
  });
  // Keep the ref current so the folders-first sort can read the live direction.
  sortingStateRef.current = table.getState().sorting;

  function handleHeaderDragStart(event, columnId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
    setDragState({ dragging: columnId, over: null });
  }

  function handleHeaderDragOver(event, columnId) {
    if (!dragState.dragging || dragState.dragging === columnId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragState.over !== columnId) {
      setDragState((state) => ({ ...state, over: columnId }));
    }
  }

  function handleHeaderDrop(event, targetId) {
    event.preventDefault();
    const sourceId = dragState.dragging || event.dataTransfer.getData('text/plain');
    setDragState({ dragging: null, over: null });
    if (!sourceId || sourceId === targetId || !isReorderableColumn(sourceId)) return;
    setColumnOrder((previous) => moveColumnBefore(previous, sourceId, targetId));
  }

  function handleHeaderDragEnd() {
    setDragState({ dragging: null, over: null });
  }

  return (
    <div className={fileGridClassName}>
      <table className={fileGridTableClassName} style={{ width: table.getTotalSize() }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const headerAlign = header.column.columnDef.meta?.align;
                const columnId = header.column.id;
                const reorderable = !header.isPlaceholder && isReorderableColumn(columnId);
                const isDragging = dragState.dragging === columnId;
                const isDragOver =
                  reorderable &&
                  dragState.over === columnId &&
                  dragState.dragging &&
                  dragState.dragging !== columnId;
                const dragClasses = `${isDragging ? ' opacity-40' : ''}${
                  isDragOver ? ' !bg-accent-soft [box-shadow:inset_2px_0_0_0_var(--accent)]' : ''
                }`;

                return (
                  <th
                    key={header.id}
                    className={
                      fileGridHeaderCellClassName({
                        sortable,
                        className: header.column.columnDef.meta?.className
                      }) + dragClasses
                    }
                    style={{ width: header.getSize() }}
                    onDragOver={reorderable ? (event) => handleHeaderDragOver(event, columnId) : undefined}
                    onDrop={reorderable ? (event) => handleHeaderDrop(event, columnId) : undefined}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={fileGridHeaderButtonClassName({
                          align: headerAlign,
                          className: reorderable ? 'cursor-grab active:cursor-grabbing' : undefined
                        })}
                        disabled={!sortable}
                        draggable={reorderable}
                        onDragStart={reorderable ? (event) => handleHeaderDragStart(event, columnId) : undefined}
                        onDragEnd={reorderable ? handleHeaderDragEnd : undefined}
                        onClick={header.column.getToggleSortingHandler()}
                        title={reorderable ? 'Drag to reorder · click to sort' : undefined}
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
              className={`${fileGridRowClassName({
                index,
                kind: row.original.kind,
                actionable: isActionableRow(row.original),
                selected: selectedSet.has(row.original.path)
              })}${inspectedPath && row.original.path === inspectedPath ? ' !bg-surface-muted' : ''}`}
              onClick={() => {
                if (row.original.kind === 'file') onInspectRow?.(row.original);
              }}
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
    deleteCheck,
    scope = 'external',
    onToggleSelection,
    onSetSelection,
    onBuildThumbnails,
    onExclude,
    onDelete,
    onAddDeleteCheck
  } = options;
  const columns = [];

  // Row actions sit at the far left, before the select checkbox.
  if (onDelete || onBuildThumbnails || onExclude || onAddDeleteCheck) {
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
            <MenuContent align="start" className={fileGridRowActionPanelClassName}>
              {onAddDeleteCheck && isSelectableRow(row.original) && (
                <MenuItem
                  icon={<Icon name="add" />}
                  onClick={() => onAddDeleteCheck([row.original])}
                >
                  Add to Delete Check
                </MenuItem>
              )}
              {onBuildThumbnails && (
                <MenuItem
                  disabled={!canBuildThumbnails}
                  icon={<Icon name="thumbnails" />}
                  onClick={() => onBuildThumbnails(row.original)}
                >
                  Build thumbnails
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
              {onDelete && (
                <MenuItem
                  variant="danger"
                  icon={<Icon name="delete" />}
                  onClick={() => onDelete(row.original)}
                >
                  Remove from scan
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        );
      }
    });
  }

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
    }
  );

  // Delete Check "Backup" status column: whether this file has a copy in another
  // location. Sorts riskiest-first (unsafe < warn < safe) so blockers surface.
  if (deleteCheck) {
    columns.push({
      id: 'backup',
      header: 'Backup',
      size: 200,
      minSize: 130,
      meta: { contentOverflowVisible: true },
      accessorFn: (row) => deleteCheckRank(scope === 'internal' ? row.internal_status : row.backup_status),
      sortingFn: 'basic',
      cell: ({ row }) =>
        row.original.kind === 'file' ? (
          <DeleteCheckStatusBadge
            status={scope === 'internal' ? row.original.internal_status : row.original.backup_status}
            here={row.original.copies_here}
            away={row.original.copies_away}
            scope={scope}
          />
        ) : (
          <FolderRollupBadge
            safe={scope === 'internal' ? row.original.int_safe_count : row.original.safe_count}
            warn={scope === 'internal' ? row.original.int_warn_count : row.original.warn_count}
            unsafe={scope === 'internal' ? row.original.int_unsafe_count : row.original.unsafe_count}
          />
        )
    });
  }

  columns.push(
    {
      accessorKey: 'size',
      header: 'Size',
      size: 96,
      minSize: 72,
      meta: numericColumnMeta,
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : bytes(getValue())
    },
    {
      accessorKey: 'file_count',
      header: 'Files',
      size: 76,
      minSize: 60,
      meta: numericColumnMeta,
      cell: ({ row, getValue }) => row.original.kind === 'parent' ? '' : getValue() ?? 0
    },
    {
      accessorKey: 'distinct_count',
      header: 'Uniq',
      size: 72,
      minSize: 56,
      meta: { ...numericColumnMeta, tooltip: 'Distinct contents (unique hashes) in this folder' },
      cell: ({ row, getValue }) => (row.original.kind === 'file' || row.original.kind === 'parent') ? '' : (getValue() ?? 0).toLocaleString()
    },
    { accessorKey: 'blake3', header: 'BLAKE3', size: 126, minSize: 90, cell: ({ getValue }) => shortHash(getValue()) },
    { accessorKey: 'ctime', header: 'CTime', size: 168, minSize: 120, cell: ({ getValue }) => formatDate(getValue()) },
    { accessorKey: 'mtime', header: 'Modified', size: 168, minSize: 120, cell: ({ getValue }) => formatDate(getValue()) },
    { accessorKey: 'mode', header: 'Mode', size: 88, minSize: 68 },
    { accessorKey: 'sha256', header: 'SHA-256', size: 126, minSize: 90, cell: ({ getValue }) => shortHash(getValue()) },
    { accessorKey: 'path', header: 'Path', size: 340, minSize: 180 }
  );

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
