import { cn } from './cn.js';

const toolbarOrientationClasses = {
  horizontal: 'flex-row items-center',
  vertical: 'flex-col items-stretch'
};

export function Toolbar({
  orientation = 'horizontal',
  className,
  children,
  ...props
}) {
  return (
    <div
      role="toolbar"
      aria-orientation={orientation}
      className={cn(
        'flex min-w-0 gap-1 rounded-panel border border-border bg-surface p-1 shadow-sm',
        toolbarOrientationClasses[orientation] ?? toolbarOrientationClasses.horizontal,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({ className, children, ...props }) {
  return (
    <div role="group" className={cn('flex min-w-0 items-center gap-1', className)} {...props}>
      {children}
    </div>
  );
}

export function ToolbarSeparator({ orientation = 'vertical', className, ...props }) {
  const separatorClassName =
    orientation === 'horizontal' ? 'my-1 h-px w-full bg-border' : 'mx-1 h-5 w-px bg-border';

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0', separatorClassName, className)}
      {...props}
    />
  );
}

export { toolbarOrientationClasses };
