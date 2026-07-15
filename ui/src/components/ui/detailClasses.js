import { cn } from './cn.js';

export const filePreviewPanelClassName = cn(
  'grid min-h-[260px] place-items-center gap-2.5 rounded-panel border border-border bg-surface-muted p-3.5'
);

export const filePreviewImageClassName = cn(
  'block max-h-[520px] max-w-full rounded-ui object-contain shadow-md'
);

export const filePreviewTextClassName = 'text-muted';

export const exifPanelClassName = 'grid gap-2.5';

export const exifStatusClassName = cn(
  'flex items-center justify-between gap-2.5 rounded-panel border border-border bg-surface-muted p-2.5',
  '[&_strong]:uppercase'
);

export const exifGridClassName = cn(
  'grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 max-[960px]:grid-cols-1',
  '[&_code]:mt-[3px] [&_code]:block [&_code]:break-words [&_code]:whitespace-normal',
  '[&_div]:min-w-0 [&_div]:rounded-ui [&_div]:border [&_div]:border-border [&_div]:bg-surface [&_div]:p-[9px]',
  '[&_span]:block [&_span]:text-[0.72rem] [&_span]:font-bold [&_span]:uppercase [&_span]:text-muted',
  '[&_strong]:mt-[3px] [&_strong]:block [&_strong]:break-words'
);

export function metadataGridClassName({ compact = false, className } = {}) {
  return cn(
    'grid gap-2 max-[960px]:grid-cols-1',
    compact ? 'grid-cols-[repeat(3,minmax(0,1fr))]' : 'grid-cols-[repeat(2,minmax(0,1fr))]',
    className
  );
}

export function metadataItemClassName({ compact = false, className } = {}) {
  return cn(
    'min-w-0 rounded-ui border border-border p-[9px]',
    compact ? 'bg-surface p-2' : 'bg-surface-muted',
    className
  );
}

export const metadataLabelClassName = 'mb-1 block text-[0.72rem] font-bold uppercase text-muted';

export const metadataValueClassName = 'block min-w-0 break-words whitespace-normal';

export const occurrenceListClassName = 'grid gap-2.5';

export const occurrenceCardClassName = 'grid gap-[9px] rounded-panel border border-border bg-surface p-3 shadow-sm';

export const occurrenceHeaderClassName = cn(
  'flex items-baseline justify-between gap-3 max-[960px]:flex-col max-[960px]:items-stretch'
);

export const occurrenceHeaderMetaClassName = 'whitespace-nowrap text-muted max-[960px]:whitespace-normal';

export const occurrenceLocationNameClassName = 'text-muted font-medium';

export const occurrencePathRowClassName = cn(
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[960px]:grid-cols-1'
);

export const occurrencePathTextClassName = 'break-words whitespace-normal';

export const occurrenceActionMenuClassName = 'group/occurrence-action justify-self-end max-[960px]:justify-self-start';

export const occurrenceActionTriggerClassName = cn(
  '!h-[30px] !min-h-[30px] !w-[34px] !px-0',
  'hover:!bg-surface-muted group-data-[open=true]/occurrence-action:!bg-surface-muted'
);

export const occurrenceActionPanelClassName = '!min-w-[188px]';
