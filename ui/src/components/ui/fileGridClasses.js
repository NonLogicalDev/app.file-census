import { cn } from './cn.js';

export const fileGridClassName = 'h-[min(70vh,800px)] min-h-[600px] w-full overflow-auto rounded-ui bg-surface';

export const fileGridTableClassName = 'w-max min-w-full table-fixed border-separate border-spacing-0 text-[12.5px] text-text';

export const fileGridNumericClassName = 'text-right';

export const fileGridSelectClassName = 'overflow-visible text-center';

export const fileGridActionsClassName = fileGridSelectClassName;

export const fileGridResizableHeaderClassName = 'relative';

export function fileGridHeaderCellClassName({ sortable = false, className } = {}) {
  return cn(
    'sticky top-0 z-[2] border-b border-border bg-[#f0f2ee] px-[9px] py-1.5 text-left text-[0.76rem] font-[760] text-muted-strong whitespace-nowrap',
    fileGridResizableHeaderClassName,
    sortable && 'cursor-pointer select-none',
    className
  );
}

export const fileGridHeaderButtonClassName = cn(
  'inline-flex min-h-0 w-full items-center justify-between gap-1 rounded-[4px] border-0 bg-transparent p-0 text-left font-[inherit] text-inherit shadow-none',
  'hover:!border-transparent hover:!bg-transparent hover:!text-accent hover:!shadow-none',
  'disabled:cursor-default disabled:opacity-100'
);

export const fileGridSortClassName = 'text-[0.72rem] text-muted';

export function fileGridResizerClassName({ resizing = false } = {}) {
  return cn(
    'absolute -right-1 top-0 z-[3] block h-full w-2 cursor-col-resize select-none touch-none',
    'after:absolute after:right-[3px] after:top-[20%] after:h-[60%] after:w-px after:rounded-full after:bg-transparent',
    'hover:after:bg-accent',
    resizing && 'after:bg-accent'
  );
}

export function fileGridRowClassName({ index = 0, kind, actionable = false, selected = false } = {}) {
  return cn(
    'transition-[background-color] duration-100 ease-out hover:bg-[#eef7f4]',
    index % 2 === 1 ? 'bg-[#fafbf8]' : 'bg-surface',
    actionable ? 'cursor-pointer' : 'cursor-default',
    (kind === 'dir' || kind === 'parent') && 'font-[650]',
    selected && '!bg-[color:color-mix(in_srgb,var(--accent-soft)_74%,var(--surface))]'
  );
}

export function fileGridCellClassName({ className } = {}) {
  return cn(
    'border-b border-[#eef0ec] px-[9px] py-1 align-middle whitespace-nowrap',
    className
  );
}

export function fileGridCellContentClassName({ overflowVisible = false } = {}) {
  return cn(
    'block',
    overflowVisible ? 'overflow-visible' : 'overflow-hidden text-ellipsis'
  );
}

export const fileGridCheckboxClassName = 'm-0 h-[14px] w-[14px] cursor-pointer [accent-color:var(--accent)] disabled:cursor-not-allowed';

export function fileNameCellClassName({ kind } = {}) {
  return cn(
    'inline-flex max-w-full min-w-0 items-center gap-[7px]',
    '[&_span:last-child]:min-w-0 [&_span:last-child]:truncate',
    (kind === 'dir' || kind === 'parent') && '[&_svg]:text-accent'
  );
}

export const fileKindIconClassName = 'h-[15px] w-[15px] shrink-0 text-muted';

export const fileGridRowActionMenuClassName = 'group/file-row-action justify-center';

export const fileGridRowActionTriggerClassName = cn(
  '!h-[26px] !min-h-[26px] !w-[26px] !min-w-[26px] !border-transparent !bg-transparent !p-0 !text-muted !shadow-none',
  'hover:!border-border hover:!bg-surface-muted hover:!text-text hover:!shadow-none',
  'group-data-[open=true]/file-row-action:!border-border group-data-[open=true]/file-row-action:!bg-surface-muted group-data-[open=true]/file-row-action:!text-text'
);

export const fileGridRowActionPanelClassName = '!min-w-[172px]';

export const fileGridRowActionContentClassName = 'overflow-visible';
