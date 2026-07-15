import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { buttonBaseClasses, buttonSizeClasses, buttonVariantClasses } from './Button.jsx';
import { cn } from './cn.js';

const MenuContext = createContext(null);

const menuAlignClasses = {
  start: 'left-0',
  end: 'right-0',
  stretch: 'left-0 right-0'
};

const menuItemVariantClasses = {
  primary: 'text-accent hover:!bg-accent-soft hover:!text-accent',
  secondary: 'text-muted-strong hover:!bg-surface-muted hover:!text-text',
  danger: 'text-danger hover:!bg-danger-soft hover:!text-danger',
  warning: 'text-warning hover:!bg-warning-soft hover:!text-warning',
  ghost: 'text-muted-strong hover:!bg-surface-muted hover:!text-text'
};

export function Menu({ open, defaultOpen = false, onOpenChange, className, children, ...props }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  const triggerId = useId();
  const contentId = useId();
  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : uncontrolledOpen;

  const setOpen = useCallback(
    (nextOpen) => {
      const resolvedOpen = typeof nextOpen === 'function' ? nextOpen(currentOpen) : nextOpen;
      if (!isControlled) setUncontrolledOpen(resolvedOpen);
      onOpenChange?.(resolvedOpen);
    },
    [currentOpen, isControlled, onOpenChange]
  );

  useEffect(() => {
    if (!currentOpen) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [currentOpen, setOpen]);

  const context = useMemo(
    () => ({
      contentId,
      open: currentOpen,
      setOpen,
      triggerId
    }),
    [contentId, currentOpen, setOpen, triggerId]
  );

  return (
    <MenuContext.Provider value={context}>
      <div
        className={cn('relative inline-flex min-w-0', className)}
        data-open={currentOpen ? 'true' : 'false'}
        ref={rootRef}
        {...props}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export function MenuTrigger({
  variant = 'secondary',
  size = 'sm',
  icon,
  trailingIcon,
  className,
  children,
  type = 'button',
  onClick,
  ...props
}) {
  const { contentId, open, setOpen, triggerId } = useMenuContext('MenuTrigger');

  function handleClick(event) {
    onClick?.(event);
    if (!event.defaultPrevented) setOpen((value) => !value);
  }

  return (
    <button
      type={type}
      id={triggerId}
      aria-controls={open ? contentId : undefined}
      aria-expanded={open}
      aria-haspopup="menu"
      className={cn(
        buttonBaseClasses,
        buttonVariantClasses[variant] ?? buttonVariantClasses.secondary,
        buttonSizeClasses[size] ?? buttonSizeClasses.sm,
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      {children}
      {trailingIcon && <span className="inline-flex shrink-0 items-center">{trailingIcon}</span>}
    </button>
  );
}

export function MenuContent({ align = 'end', className, children, ...props }) {
  const { contentId, open, triggerId } = useMenuContext('MenuContent');
  if (!open) return null;

  return (
    <div
      id={contentId}
      role="menu"
      aria-labelledby={triggerId}
      className={cn(
        'absolute top-full z-50 mt-1.5 min-w-44 rounded-panel border border-border bg-surface p-1 shadow-md',
        menuAlignClasses[align] ?? menuAlignClasses.end,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  variant = 'ghost',
  icon,
  trailingIcon,
  closeOnSelect = true,
  className,
  children,
  type = 'button',
  onClick,
  ...props
}) {
  const menu = useOptionalMenuContext();

  function handleClick(event) {
    onClick?.(event);
    if (!event.defaultPrevented && closeOnSelect) menu?.setOpen(false);
  }

  return (
    <button
      type={type}
      role="menuitem"
      className={cn(
        'flex w-full items-center justify-start gap-2 rounded-ui border border-transparent bg-transparent px-2.5 py-2 text-left text-sm font-medium leading-5 shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        'disabled:pointer-events-none disabled:!cursor-not-allowed disabled:opacity-[0.55]',
        menuItemVariantClasses[variant] ?? menuItemVariantClasses.ghost,
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailingIcon && <span className="inline-flex shrink-0 items-center text-muted">{trailingIcon}</span>}
    </button>
  );
}

export function MenuSeparator({ className, ...props }) {
  return <div role="separator" className={cn('my-1 h-px bg-border', className)} {...props} />;
}

export function MenuLabel({ className, ...props }) {
  return <div className={cn('px-2.5 py-1.5 text-xs font-semibold uppercase tracking-normal text-muted', className)} {...props} />;
}

function useMenuContext(componentName) {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error(`${componentName} must be rendered inside Menu.`);
  }
  return context;
}

function useOptionalMenuContext() {
  return useContext(MenuContext);
}
