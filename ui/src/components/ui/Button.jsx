import { cn } from './cn.js';

export const buttonBaseClasses = [
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-ui border',
  'text-sm font-semibold leading-none shadow-none',
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  'disabled:pointer-events-none disabled:!cursor-not-allowed disabled:opacity-[0.55]'
];

export const buttonVariantClasses = {
  primary: [
    // The accent is a light color on this dark theme, so the primary button
    // uses dark text on the light fill (matches the redesign).
    'border-accent bg-accent text-bg shadow-sm',
    'hover:!border-accent-hover hover:!bg-accent-hover hover:!text-bg'
  ],
  secondary: [
    'border-border bg-surface text-muted-strong',
    'hover:!border-accent hover:!bg-accent-soft hover:!text-accent'
  ],
  danger: [
    'border-danger bg-danger text-white',
    'hover:!border-[#8f1d14] hover:!bg-[#8f1d14] hover:!text-white'
  ],
  warning: [
    'border-warning bg-warning-soft text-warning',
    'hover:!border-warning hover:!bg-[#ffe9b8] hover:!text-[#6f3d00]'
  ],
  ghost: [
    'border-transparent bg-transparent text-muted-strong shadow-none',
    'hover:!border-border hover:!bg-surface-muted hover:!text-text hover:!shadow-none'
  ]
};

export const buttonSizeClasses = {
  sm: 'min-h-8 px-2.5 py-1.5 text-xs',
  md: 'min-h-9 px-3 py-2 text-sm',
  lg: 'min-h-10 px-3.5 py-2.5 text-sm'
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  leadingIcon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...props
}) {
  const startIcon = leadingIcon ?? icon;

  return (
    <button
      type={type}
      className={cn(
        buttonBaseClasses,
        buttonVariantClasses[variant] ?? buttonVariantClasses.primary,
        buttonSizeClasses[size] ?? buttonSizeClasses.md,
        className
      )}
      {...props}
    >
      {startIcon && <span className="inline-flex shrink-0 items-center">{startIcon}</span>}
      {children}
      {trailingIcon && <span className="inline-flex shrink-0 items-center">{trailingIcon}</span>}
    </button>
  );
}
