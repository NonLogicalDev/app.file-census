import { cn } from './cn.js';

export const pageGridClassName = 'grid min-w-0 gap-3.5';

export const pageHeaderClassName = cn(
  'flex items-start justify-between gap-3',
  'max-[960px]:flex-col max-[960px]:items-start'
);

export const pageHeaderCopyClassName = 'mt-[7px] text-muted';

export const stackedListClassName = 'grid gap-2';

export const interactiveRowClassName = cn(
  'grid w-full min-w-0 gap-1.5 rounded-ui border border-border bg-surface p-[9px] text-left text-text shadow-none',
  'hover:!border-accent-line hover:!bg-surface-muted hover:!text-text hover:!shadow-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
);

export const cardClassName = 'grid gap-2 rounded-panel border border-border bg-surface p-3 shadow-sm';

export const mutedInlineClassName = 'text-muted';

export const emptyTextClassName = 'text-muted';

export const panelTitleClassName = cn(
  'mb-2.5 flex items-center justify-between gap-3',
  'max-[960px]:flex-col max-[960px]:items-stretch'
);

export const panelTitleTextClassName = 'min-w-0 [&_h2]:m-0';

export const panelTitleSubtextClassName = 'mt-1 text-muted';

export const actionToolbarClassName = cn(
  '!flex !flex-wrap !items-start !justify-start !gap-3 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none'
);

export const notesPanelClassName = 'mt-3.5 grid gap-[6px] rounded-ui border border-border bg-surface p-2.5';

export const scanNotesPanelClassName = cn(notesPanelClassName, 'mb-0 mt-2.5');

export const notesPanelBodyClassName = 'whitespace-pre-wrap text-muted-strong';

export const logPanelClassName = cn(notesPanelClassName, 'max-h-[220px] overflow-auto');

export const logLineClassName = 'block';
