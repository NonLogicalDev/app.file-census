import { cn } from './cn.js';

export const modalOverlayClassName = cn(
  'fixed inset-0 z-[90] grid place-items-center bg-[rgb(23_32_29_/_0.45)] p-5 backdrop-blur-md'
);

const modalSurfaceSizeClasses = {
  default: 'w-[min(520px,100%)]',
  wide: 'w-[min(980px,100%)] max-h-[min(82vh,900px)] overflow-auto'
};

export function modalSurfaceClassName({ size = 'default', className } = {}) {
  return cn(
    'grid gap-3.5 rounded-panel border border-border bg-surface p-[18px] shadow-lg',
    modalSurfaceSizeClasses[size] ?? modalSurfaceSizeClasses.default,
    className
  );
}

export const modalHelpClassName = 'm-0 text-muted-strong leading-[1.45]';

export const segmentedTabsClassName = cn(
  'relative flex min-h-[42px] w-full items-center gap-[3px] overflow-hidden rounded-full border border-border bg-surface-muted p-1 shadow-sm',
  'before:pointer-events-none before:absolute before:inset-x-1 before:top-0.5 before:h-px before:rounded-full before:bg-white/70 before:content-[\'\']'
);

export function segmentedTabClassName({ active = false, className } = {}) {
  return cn(
    'relative z-[1] min-h-8 min-w-0 flex-1 overflow-hidden truncate rounded-full border px-4 text-sm font-bold tracking-normal shadow-none',
    'transition-[background-color,border-color,box-shadow,color] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted',
    active
      ? 'border-accent-line bg-surface text-text shadow-sm hover:!border-accent-line hover:!bg-surface hover:!text-text'
      : 'border-transparent bg-transparent text-muted-strong hover:!border-accent-line hover:!bg-accent-soft hover:!text-accent hover:!shadow-none',
    className
  );
}
