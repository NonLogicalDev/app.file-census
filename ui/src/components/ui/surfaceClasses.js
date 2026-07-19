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

// The app-wide segmented control form (matches the Browse|Flat / backup-filter /
// scope chip groups): compact bordered group with chip buttons.
export const segmentedTabsClassName = cn(
  'inline-flex h-[30px] w-fit items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5'
);

export function segmentedTabClassName({ active = false, className } = {}) {
  return cn(
    'rounded px-2.5 py-1 text-[11px] font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line',
    active ? 'bg-surface-muted text-text shadow-sm' : 'text-muted hover:text-text',
    className
  );
}
