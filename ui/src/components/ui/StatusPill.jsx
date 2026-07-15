import { cn } from './cn.js';

const statusPillVariantClasses = {
  primary: 'border-accent bg-accent-soft text-accent',
  secondary: 'border-border bg-surface-muted text-muted-strong',
  danger: 'border-danger bg-danger-soft text-danger',
  warning: 'border-warning bg-warning-soft text-warning',
  ghost: 'border-transparent bg-transparent text-muted',
  success: 'border-accent-line bg-accent-soft text-accent'
};

const statusPillDotClasses = {
  primary: 'bg-accent',
  secondary: 'bg-muted',
  danger: 'bg-danger',
  warning: 'bg-warning',
  ghost: 'bg-muted',
  success: 'bg-accent-line'
};

export function StatusPill({
  variant = 'secondary',
  icon,
  dot = false,
  className,
  children,
  ...props
}) {
  const resolvedVariant = statusPillVariantClasses[variant] ? variant : 'secondary';

  return (
    <span
      className={cn(
        'inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold leading-5',
        statusPillVariantClasses[resolvedVariant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusPillDotClasses[resolvedVariant])} />}
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export { statusPillDotClasses, statusPillVariantClasses };
