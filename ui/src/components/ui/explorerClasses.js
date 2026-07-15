import { cn } from './cn.js';

export const explorerClassName = 'min-w-0 border-t border-border pt-3';

export const explorerHeaderClassName = cn(
  'flex items-center justify-between gap-3',
  'max-[960px]:flex-col max-[960px]:items-stretch',
  '[&_h3]:mb-[2px] [&_span]:text-muted'
);

export const finderToolbarClassName = cn(
  'my-2.5 !flex !flex-wrap !items-center !gap-2 !rounded-panel !border !border-border !bg-surface-muted !p-[7px] !shadow-none',
  '[&_button]:!shadow-none'
);

export const columnPickerClassName = cn(
  'mb-2.5 mt-2 flex flex-wrap gap-2.5 rounded-panel border border-border bg-surface p-2.5',
  '[&_label]:flex [&_label]:items-center [&_label]:gap-1.5 [&_label]:text-text',
  '[&_input]:w-auto'
);

export const breadcrumbsClassName = cn(
  'my-[9px] flex items-center gap-1.5 overflow-x-auto',
  '[&_button]:min-h-9 [&_button]:whitespace-nowrap [&_button]:rounded-[10px] [&_button]:border [&_button]:border-border',
  '[&_button]:bg-surface [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-sm [&_button]:font-bold [&_button]:text-accent',
  '[&_button]:shadow-none hover:[&_button]:!border-accent hover:[&_button]:!bg-accent-soft hover:[&_button]:!text-accent hover:[&_button]:!shadow-none',
  '[&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent-line'
);

export function deleteCheckCalloutClassName({ safe, className } = {}) {
  return cn(
    'my-2.5 flex items-center justify-between gap-3 rounded-panel border p-3',
    '[&_div]:grid [&_div]:gap-1 [&_span]:text-inherit',
    safe
      ? 'border-[color:color-mix(in_srgb,var(--accent-line)_45%,var(--border))] bg-accent-soft text-accent'
      : 'border-[color:color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-danger-soft text-danger',
    className
  );
}

export const deleteCheckEmptyClassName = cn(
  'my-2.5 flex flex-wrap items-center gap-2.5 rounded-panel border border-border bg-surface p-3',
  '[&_strong]:text-text [&_span]:text-muted'
);

export const treeClassName = 'relative block min-h-[620px] overflow-hidden rounded-panel border border-border bg-surface p-[5px] shadow-sm';

export const treeEmptyClassName = 'pointer-events-none absolute inset-x-0 top-[52px] z-[1] p-[18px] text-center text-muted';
