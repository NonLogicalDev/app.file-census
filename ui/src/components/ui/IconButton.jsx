import { buttonBaseClasses, buttonSizeClasses, buttonVariantClasses } from './Button.jsx';
import { cn } from './cn.js';

const iconButtonSizeClasses = {
  sm: 'h-8 w-8 p-0 text-sm',
  md: 'h-9 w-9 p-0 text-base',
  lg: 'h-10 w-10 p-0 text-base'
};

export function IconButton({
  variant = 'ghost',
  size = 'md',
  icon,
  label,
  className,
  children,
  type = 'button',
  ...props
}) {
  const ariaLabel = props['aria-label'] ?? label;

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={cn(
        buttonBaseClasses,
        buttonVariantClasses[variant] ?? buttonVariantClasses.ghost,
        iconButtonSizeClasses[size] ?? iconButtonSizeClasses.md,
        className
      )}
      {...props}
    >
      {icon ?? children}
    </button>
  );
}

export { iconButtonSizeClasses };
