import { cn } from './cn.js';

const baseFieldClassName = cn(
  'w-full rounded-ui border border-border bg-surface px-[0.62rem] py-[0.52rem] text-text',
  'focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgb(15_107_82_/_0.12)]'
);

export const formStackClassName = 'grid !gap-2.5';

export const fieldLabelClassName = 'grid gap-[5px] text-muted-strong';

export function fieldClassName({ className } = {}) {
  return cn(baseFieldClassName, className);
}

export function selectClassName({ className } = {}) {
  return cn(baseFieldClassName, className);
}

export function textAreaClassName({ className } = {}) {
  return cn(baseFieldClassName, 'min-h-[84px] resize-y', className);
}

export const pathInputRowClassName = 'grid grid-cols-[minmax(0,1fr)_auto] gap-2 [&_button]:whitespace-nowrap';
