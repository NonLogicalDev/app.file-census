import { cn } from './cn.js';

export function progressPoolsClassName({ compact = false, className } = {}) {
  return cn(
    'grid min-w-0',
    compact ? 'mt-1 grid-cols-1 gap-[5px]' : 'mt-2.5 grid-cols-1 gap-2',
    className
  );
}

export function progressPoolClassName({ compact = false, className } = {}) {
  return cn(
    'grid min-w-0',
    compact
      ? 'gap-[3px] rounded-ui border border-[rgb(255_255_255_/_0.14)] bg-[rgb(255_255_255_/_0.035)] px-1.5 py-[5px]'
      : 'gap-[5px] rounded-panel border border-[color:color-mix(in_srgb,var(--accent-line)_24%,var(--border))] bg-surface-subtle p-2',
    className
  );
}

export function progressPoolHeaderClassName({ compact = false, className } = {}) {
  return cn('flex min-w-0 items-center justify-between gap-2', compact ? 'text-[0.69rem] text-sidebar-text' : 'text-xs text-muted', className);
}

export function progressElapsedClassName({ compact = false, className } = {}) {
  return cn(
    'min-w-0 tabular-nums',
    compact ? 'text-[0.69rem] font-[650] text-sidebar-muted' : 'text-xs font-[650] text-muted',
    className
  );
}

export const progressPoolTitleClassName = 'min-w-0 truncate text-[0.78rem] font-bold text-current';

export const progressPoolCountClassName = 'shrink-0 whitespace-nowrap tabular-nums font-[650]';

export function progressBarClassName({ compact = false, className } = {}) {
  return cn(
    'flex overflow-hidden rounded-[2px] border',
    compact
      ? 'h-1.5 border-[rgb(255_255_255_/_0.14)] bg-[rgb(255_255_255_/_0.08)]'
      : 'h-2 border-[color:color-mix(in_srgb,var(--muted)_28%,var(--border))] bg-[color:color-mix(in_srgb,var(--surface-muted)_78%,var(--border))]',
    className
  );
}

export function progressSegmentClassName(kind, className) {
  return cn(
    'block h-full min-w-0 transition-[width] duration-150 ease-out',
    kind === 'done' && 'bg-accent-line',
    kind === 'queued' && 'bg-[color:color-mix(in_srgb,var(--muted)_38%,var(--surface-muted))]',
    kind === 'active' && 'bg-[color:color-mix(in_srgb,var(--accent-line)_62%,#ffffff)]',
    className
  );
}
