import { cn } from './cn.js';

export const locationShellClassName = 'grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3.5';

export const locationContentClassName = 'min-w-0 border-0 bg-transparent p-0 shadow-none';

export const locationEmptyStateClassName = cn(
  'grid max-w-[520px] justify-items-start gap-[9px] rounded-panel border border-border bg-surface p-5 shadow-sm',
  '[&_h2]:m-0 [&_h2]:text-base [&_h2]:normal-case [&_h2]:text-text'
);

export const locationDetailClassName = 'grid min-w-0 gap-3';

export const locationNotesPanelClassName = cn(
  'mb-3 mt-[-2px] grid gap-[5px] rounded-panel border border-accent/20 bg-accent-soft px-3 py-2.5',
  '[&_h3]:m-0 [&_h3]:text-[0.78rem] [&_h3]:uppercase [&_h3]:text-accent'
);

export const locationNotesBodyClassName = 'whitespace-pre-wrap text-muted-strong';

export const locationOverviewActionsClassName = 'mb-3 flex justify-start [&_button]:min-h-10 [&_button]:px-4';

export const locationSummaryGridClassName = 'mb-3 grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2.5 max-[960px]:grid-cols-1';

export function locationSummaryItemClassName({ emphasis = false, className } = {}) {
  return cn(
    'rounded-panel border bg-surface p-3 shadow-sm',
    emphasis ? 'border-accent-line' : 'border-border',
    className
  );
}

export const locationSummaryValueClassName = 'block truncate text-[1.2rem] font-bold';

export const locationSummaryLabelClassName = 'text-muted';

export const locationOverviewClassName = 'grid min-w-0 gap-3';

export const scanSummaryGridClassName = 'grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2.5 max-[960px]:grid-cols-1';

export const scanSummaryCardClassName = 'grid min-w-0 content-start gap-2 rounded-panel border border-border bg-surface p-3 shadow-sm';

export const scanSummaryLabelClassName = 'text-[0.72rem] font-[760] uppercase text-muted';

export const scanSummaryValueClassName = 'block min-w-0 truncate';

export const scanSummaryMutedClassName = 'block min-w-0 truncate text-muted';

export const scanSummaryCodeClassName = 'block min-w-0 truncate';
