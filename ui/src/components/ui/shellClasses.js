import { cn } from './cn.js';

export const SIDEBAR_MIN_WIDTH = 232;
export const SIDEBAR_DEFAULT_WIDTH = 292;
export const SIDEBAR_MAX_WIDTH = 440;

export function clampSidebarWidth(value) {
  const width = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export const metricsClassName = 'mb-3 flex flex-wrap gap-2';

export const metricItemClassName = 'flex min-w-0 items-baseline gap-[7px] border-transparent bg-transparent p-[0_8px_0_0] shadow-none';

export const metricValueClassName = 'block truncate text-[0.92rem] font-bold';

export const metricLabelClassName = 'text-muted';

export const notificationLayerClassName = cn(
  'pointer-events-none fixed right-5 top-5 z-[90] grid w-[min(380px,calc(100vw-32px))] gap-2.5',
  'max-[720px]:left-4 max-[720px]:right-4 max-[720px]:top-4 max-[720px]:w-auto'
);

const notificationToastVariantClasses = {
  info: 'border-accent/25 border-l-accent bg-surface text-text',
  success: 'border-accent/25 border-l-accent bg-accent-soft text-accent',
  warning: 'border-warning/35 border-l-warning bg-warning-soft text-warning',
  error: 'border-danger/30 border-l-danger bg-danger-soft text-danger'
};

export function notificationToastClassName({ variant = 'info', className } = {}) {
  return cn(
    'pointer-events-auto grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 rounded-ui border border-l-2 px-3 py-2.5 shadow-none',
    notificationToastVariantClasses[variant] ?? notificationToastVariantClasses.info,
    className
  );
}

export const notificationTextClassName = 'min-w-0 text-sm font-medium leading-5';

export const notificationCloseClassName = cn(
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-ui border border-transparent bg-transparent p-0 text-current opacity-70 shadow-none',
  'hover:!border-current/20 hover:!bg-surface-muted hover:!text-current hover:!opacity-100 hover:!shadow-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line'
);

export const shellMessageClassName = cn(
  'mb-3.5 rounded-panel border border-accent/25 border-l-[3px] border-l-accent bg-accent-soft px-3 py-2.5'
);

export const eventStripClassName = 'mb-3.5 flex items-center gap-2.5 text-muted';

export function eventStripStatusClassName({ live = false, className } = {}) {
  return cn(
    'rounded-full px-[0.55rem] py-1 font-semibold',
    live ? 'bg-accent-soft text-accent' : 'bg-surface-muted',
    className
  );
}

const trafficDotColorClasses = {
  green: 'bg-[#28c840]',
  red: 'bg-[#ff5f57]',
  yellow: 'bg-[#febc2e]'
};

export function trafficDotClassName(color = 'red') {
  return cn('h-3 w-3 rounded-full', trafficDotColorClasses[color] ?? trafficDotColorClasses.red);
}

export function connectionLedClassName({ live = false, className } = {}) {
  return cn(
    'h-[0.55rem] w-[0.55rem] shrink-0 rounded-full bg-[#7a746c]',
    live && 'bg-accent-line shadow-[0_0_0_3px_rgb(54_179_126_/_0.16)]',
    className
  );
}

export function locationLedClassName({ connected = false, compact = false, className } = {}) {
  return cn(
    'inline-block shrink-0 rounded-full border border-[#9a9286] bg-[#b8b0a5]',
    compact ? 'h-[0.56rem] w-[0.56rem]' : 'h-[0.62rem] w-[0.62rem]',
    connected && 'border-accent bg-accent-line shadow-[0_0_0_3px_rgb(54_179_126_/_0.15)]',
    className
  );
}

export const navIconClassName = cn(
  'grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--sidebar-border)]',
  'bg-[var(--sidebar-surface)] text-[color:var(--sidebar-muted)] text-[0.78rem] font-extrabold'
);

export const navIconSvgClassName = 'h-[15px] w-[15px] stroke-current';

export function appShellClassName({ sidebarHidden = false, compactSidebar = false, rightRail = false, className } = {}) {
  const peekLeft = sidebarHidden || compactSidebar;
  return cn(
    'grid min-h-screen bg-bg',
    peekLeft
      ? rightRail
        ? 'grid-cols-[var(--sidebar-peek-width)_minmax(0,1fr)_var(--inspector-width)]'
        : 'grid-cols-[var(--sidebar-peek-width)_minmax(0,1fr)]'
      : rightRail
        ? 'grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--inspector-width)]'
        : 'grid-cols-[var(--sidebar-width)_minmax(0,1fr)]',
    className
  );
}

// The Inspector right rail: docked full-height column mirroring the sidebar's
// chrome, with its own left-edge resize handle.
export const appRightRailClassName = cn(
  'sticky top-0 z-30 flex h-screen min-w-0 flex-col overflow-hidden',
  'border-l border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]'
);

// Collapsed-rail hover mode: a thin right-edge zone peeks the rail as a fixed
// overlay (mirror of the sidebar's hidden/peek pattern).
export function railHoverZoneClassName({ visible = false, peeking = false, className } = {}) {
  return cn(
    visible ? '!fixed !right-0 !top-0 !z-[45] !block !h-screen !w-[var(--sidebar-peek-width)]' : '!hidden',
    '!rounded-none !border-0 !bg-transparent !p-0 !shadow-none',
    'hover:!bg-[rgb(25_26_24_/_0.08)] hover:!shadow-none focus-visible:!bg-[rgb(25_26_24_/_0.08)] focus-visible:!outline-none',
    peeking && 'pointer-events-none',
    className
  );
}

export function appRightRailOverlayClassName({ peeking = false, className } = {}) {
  return cn(
    'fixed right-0 top-0 z-40 flex h-screen w-[var(--inspector-width)] min-w-0 flex-col overflow-hidden',
    'border-l border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-lg',
    'transition-transform duration-150 ease-out',
    peeking ? 'translate-x-0' : 'translate-x-[calc(100%-var(--sidebar-peek-width))]',
    className
  );
}

export function appSidebarClassName({ sidebarHidden = false, sidebarPeeking = false, compactSidebar = false, className } = {}) {
  const overlayMode = sidebarHidden || compactSidebar;

  return cn(
    'top-0 z-40 flex min-w-0 flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]',
    'px-2.5 py-[13px] text-[color:var(--sidebar-text)] transition-[box-shadow,transform] duration-150 ease-out',
    'after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-[var(--sidebar-peek-width)]',
    'after:border-r after:border-[var(--sidebar-border)] after:bg-[var(--sidebar-bg)] after:content-[\'\']',
    overlayMode
      ? cn(
        // Purely JS-state driven (mouse enter/leave -> sidebarPeeking), like the
        // Inspector rail. No CSS :hover, which otherwise fought the state and
        // made hover-out feel abrupt/inconsistent. focus-within still opens it
        // for keyboard users.
        'fixed left-0 shadow-lg focus-within:translate-x-0 focus-within:after:opacity-0',
        compactSidebar ? 'h-[100dvh] w-[min(var(--sidebar-width),calc(100vw-44px))]' : 'h-screen w-[var(--sidebar-width)]',
        sidebarPeeking ? 'translate-x-0 after:opacity-0' : 'translate-x-[calc(-100%+var(--sidebar-peek-width))] after:opacity-100'
      )
      : 'sticky h-screen w-[var(--sidebar-width)] after:opacity-0',
    className
  );
}

export function sidebarResizeHandleClassName({ disabled = false, resizing = false, className } = {}) {
  return cn(
    'absolute bottom-0 right-[-4px] top-0 z-[3] hidden w-2 cursor-col-resize touch-none',
    'after:absolute after:bottom-3 after:left-1/2 after:top-3 after:w-px after:-translate-x-1/2 after:rounded-full',
    'after:bg-transparent after:transition-colors after:duration-150 hover:after:bg-accent-line focus-visible:after:bg-accent-line',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-0',
    !disabled && 'min-[961px]:block',
    resizing && 'after:bg-accent-line',
    className
  );
}

export function sidebarHoverZoneClassName({ visible = false, peeking = false, className } = {}) {
  return cn(
    visible ? '!fixed !left-0 !top-0 !z-[45] !block !h-screen !w-[var(--sidebar-peek-width)]' : '!hidden',
    '!rounded-none !border-0 !bg-transparent !p-0 !shadow-none',
    'hover:!bg-[rgb(25_26_24_/_0.08)] hover:!shadow-none focus-visible:!bg-[rgb(25_26_24_/_0.08)] focus-visible:!outline-none',
    peeking && 'pointer-events-none',
    className
  );
}

export function sidebarWindowControlsClassName({ compactSidebar = false, className } = {}) {
  return cn(compactSidebar ? 'hidden' : 'mb-3 ml-1 flex h-[18px] items-center gap-2', className);
}

export function sidebarOverlayCloseClassName({ visible = false, className } = {}) {
  return cn(
    '!absolute !right-2.5 !top-[11px] !h-[30px] !w-[30px] !border-[var(--sidebar-border)] !bg-[var(--sidebar-surface)]',
    '!p-0 !text-[color:var(--sidebar-muted)] !shadow-none hover:!border-[#5b6058] hover:!bg-[var(--sidebar-surface-hover)]',
    'hover:!text-[color:var(--sidebar-text)] hover:!shadow-none',
    visible ? '!inline-flex' : '!hidden',
    className
  );
}

export const sidebarBrandClassName = 'grid gap-0.5 px-2 pb-3.5 pt-2 [&_strong]:text-[0.98rem]';

export const sidebarBrandSubtitleClassName = 'text-[color:var(--sidebar-muted)]';

export const sidebarNavClassName = 'mb-[18px] grid gap-0.5 border-0';

export function sidebarNavButtonClassName({ active = false, className } = {}) {
  return cn(
    'grid min-h-[46px] w-full min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center justify-start gap-[9px]',
    'rounded-[7px] border-0 bg-transparent px-2 py-[7px] text-left text-[color:var(--sidebar-text)] shadow-none',
    'hover:!border-transparent hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none',
    '[&_span:last-child]:min-w-0 [&_strong]:block [&_strong]:truncate [&_small]:block [&_small]:truncate [&_small]:text-[color:var(--sidebar-muted)]',
    active && 'bg-[var(--sidebar-active)] hover:!bg-[var(--sidebar-active)]',
    className
  );
}

export const sidebarSectionClassName = 'mb-4 grid min-h-0 gap-[7px] max-[960px]:mb-2.5';

export const sidebarSectionTitleClassName = cn(
  'flex items-center justify-between gap-2 px-1.5 text-[0.72rem] font-[760] uppercase tracking-[0.02em] text-[color:var(--sidebar-muted)]',
  '[&_small]:text-[0.72rem] [&_small]:font-[650] [&_small]:normal-case [&_small]:tracking-normal [&_small]:text-[color:var(--sidebar-muted)]'
);

export const sidebarIconButtonClassName = cn(
  '!h-[25px] !w-[25px] !border-[var(--sidebar-border)] !bg-[var(--sidebar-surface)] !p-0 !text-[color:var(--sidebar-text)]',
  'hover:!border-[#5b6058] hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none'
);

export const sidebarLocationListClassName = 'grid min-h-0 gap-[5px] overflow-auto pr-0.5 [scrollbar-color:#4a4d47_transparent] max-[960px]:pb-0';

export function sidebarLocationGroupClassName({ disabled = false, className } = {}) {
  return cn(
    'grid min-w-0 gap-0.5',
    disabled && 'opacity-[0.62] grayscale',
    className
  );
}

export const sidebarLocationRowClassName = 'grid min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-[3px]';

export const sidebarDisclosureClassName = cn(
  'grid h-[34px] w-6 place-items-center rounded-ui border-0 bg-transparent p-0 text-[color:var(--sidebar-muted)] shadow-none',
  'hover:!border-transparent hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none',
  'disabled:cursor-default disabled:opacity-[0.28]'
);

export function sidebarLocationClassName({ selected = false, hasSelectedScan = false, disabled = false, className } = {}) {
  return cn(
    'grid w-full min-w-0 grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] border-0 bg-transparent p-2 text-left',
    'text-[color:var(--sidebar-text)] shadow-none hover:!border-transparent hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none',
    hasSelectedScan && 'bg-[rgb(255_255_255_/_0.035)]',
    selected && '!bg-[var(--sidebar-active)] hover:!bg-[var(--sidebar-active)]',
    disabled && 'opacity-50 grayscale',
    className
  );
}

export const sidebarLocationBodyClassName = cn(
  'min-w-0',
  '[&_strong]:block [&_strong]:truncate [&_small]:block [&_small]:truncate [&_small]:text-[color:var(--sidebar-muted)]'
);

export const sidebarLocationMetaClassName = cn(
  'grid min-w-0 justify-items-end gap-px',
  '[&_strong]:block [&_strong]:truncate [&_strong]:text-[0.78rem] [&_small]:block [&_small]:truncate [&_small]:text-[color:var(--sidebar-muted)]'
);

export const sidebarScanListClassName = 'ml-[27px] grid gap-0.5 border-l border-[var(--sidebar-border)] py-1 pl-2';

export function sidebarScanClassName({ selected = false, active = false, className } = {}) {
  return cn(
    'grid w-full min-w-0 grid-cols-[34px_minmax(0,1fr)] items-center gap-[7px] rounded-[7px] border-0 bg-transparent px-2 py-[7px] text-left',
    'text-[color:var(--sidebar-text)] shadow-none',
    !selected && 'hover:!border-transparent hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none',
    selected && '!bg-[var(--sidebar-active)]',
    active && 'shadow-[inset_3px_0_0_var(--accent-line)]',
    className
  );
}

export function sidebarScanStatusClassName({ selected = false, active = false, className } = {}) {
  return cn(
    'inline-flex min-w-0 justify-center rounded-full border border-[var(--sidebar-border)] px-[5px] py-px text-[0.64rem] font-[780] leading-[1.45] text-[color:var(--sidebar-muted)]',
    active && 'border-[color:color-mix(in_srgb,var(--accent-line)_52%,var(--sidebar-border))] bg-[rgb(54_179_126_/_0.14)] text-[#95e5c3]',
    selected && 'border-[color:color-mix(in_srgb,var(--accent-line)_44%,var(--sidebar-border))] text-[color:var(--sidebar-text)]',
    className
  );
}

export const sidebarScanBodyClassName = cn(
  'grid min-w-0 gap-px',
  '[&_strong]:block [&_strong]:truncate [&_strong]:text-[0.78rem] [&_small]:block [&_small]:truncate [&_small]:text-[0.72rem] [&_small]:text-[color:var(--sidebar-muted)]'
);

export const sidebarEmptyClassName = 'px-1.5 py-2 text-[0.82rem] text-[color:var(--sidebar-muted)]';

export const sidebarActivityClassName = 'flex-none';

export const sidebarProgressClassName = cn(
  'grid min-w-0 gap-[3px] overflow-hidden rounded-[7px] border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] p-2',
  '[&_strong]:block [&_strong]:truncate [&_span]:text-[color:var(--sidebar-muted)]'
);

export const sidebarProgressPathClassName = 'block min-h-5 min-w-0 max-w-full truncate text-[color:var(--sidebar-muted)]';

export const sidebarSpacerClassName = 'min-h-3 flex-1';

export const sidebarFooterClassName = 'grid gap-2 border-t border-[var(--sidebar-border)] pt-2.5 max-[960px]:grid-cols-1';

export const sidebarConnectionPillClassName = '!inline-flex !min-h-0 !items-center !gap-[7px] !rounded-none !border-0 !bg-transparent !p-0 !text-[0.84rem] !font-[650] !leading-normal !text-[color:var(--sidebar-muted)]';

export function sidebarOptionsButtonClassName({ active = false, className } = {}) {
  return cn(
    'inline-flex min-h-9 w-full cursor-pointer items-center justify-start gap-2.5',
    'rounded-ui border border-transparent bg-transparent px-2.5 py-1.5',
    'text-sm font-[560] text-[color:var(--sidebar-text)] shadow-none transition-[background-color] duration-150 ease-out',
    'hover:bg-[var(--sidebar-surface-hover)] hover:text-[color:var(--sidebar-text)] hover:shadow-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    active && '!bg-[var(--sidebar-active)] hover:!bg-[var(--sidebar-active)]',
    className
  );
}

export const appMainClassName = cn(
  'col-start-2 mx-auto min-w-0 w-[min(100%,1560px)] px-[22px] pb-14 pt-[18px]',
  'max-[960px]:w-[min(100vw_-_20px,1380px)] max-[960px]:px-0 max-[960px]:pb-11'
);

export const workspaceHeaderClassName = cn(
  'mb-3.5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6 border-b border-border pb-4',
  'max-[960px]:gap-2.5'
);

export const topbarTitleClassName = 'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5';

export const topbarTitleCopyClassName = 'min-w-0';

export const topbarTitleHeadingClassName = 'truncate';

export const topbarDescriptionClassName = 'mt-[7px] truncate text-muted';

export const topbarSidebarToggleClassName = '!h-[34px] !w-[34px] !p-0 !shadow-none';

export const headerActionsClassName = cn(
  '!relative !flex !min-w-max !flex-nowrap !items-center !justify-end !justify-self-end !gap-[10px]',
  '!rounded-none !border-0 !bg-transparent !p-0 !shadow-none max-[960px]:!gap-2'
);

export const pageActionsMenuClassName = 'static';

export function pageActionsTriggerClassName({ open = false } = {}) {
  return cn(
    '!h-[38px] !w-[38px] !rounded-[9px] !p-0',
    open && '!border-[var(--sidebar-border)] !bg-[var(--sidebar-surface)] !text-[color:var(--sidebar-text)] !shadow-[var(--shadow-sm)]'
  );
}

export const pageActionsPanelClassName = cn(
  '!right-0 !top-[calc(100%+9px)] !z-[55] !mt-0 !grid !w-[min(300px,calc(100vw-28px))]',
  '!gap-2.5 !rounded-[12px] !border-[var(--sidebar-border)] !bg-[var(--sidebar-surface)]',
  '!p-3 !text-[color:var(--sidebar-text)] !shadow-[var(--shadow-lg)]'
);

export const pageActionsPanelTitleClassName = cn(
  '!p-0 !text-[0.72rem] !font-[760] !uppercase !tracking-[0.02em] !text-[color:var(--sidebar-muted)]'
);

export const pageActionsListClassName = 'grid gap-1.5';

export const optionsMenuClassName = 'relative';

export const optionsSummaryClassName = cn(
  'inline-flex min-h-[38px] w-full cursor-pointer list-none items-center justify-start gap-1.5',
  'rounded-ui border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] px-[0.78rem] py-[0.55rem]',
  'font-[650] text-[color:var(--sidebar-text)] transition-[background-color,border-color,box-shadow] duration-150 ease-out',
  '[&::-webkit-details-marker]:hidden hover:border-[#5b6058] hover:bg-[var(--sidebar-surface-hover)] hover:text-[color:var(--sidebar-text)] hover:shadow-sm'
);

export const optionsPanelClassName = cn(
  'absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(420px,calc(100vw-32px))]',
  'rounded-panel border border-border bg-surface p-2.5 shadow-md'
);

export const optionsSectionClassName = 'grid min-w-0 gap-2';

export const optionsSectionLabelClassName = 'text-[0.78rem] font-[750] uppercase text-muted';

export const optionsSectionCodeClassName = 'text-muted-strong';

export const topProgressBandClassName = 'mb-4 grid gap-2';

export const topProgressCardClassName = cn(
  'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 overflow-hidden rounded-panel border border-accent-line/40 border-l-4 border-l-accent-line bg-surface p-3 shadow-sm'
);

export const topProgressCardMainClassName = 'grid w-full min-w-0 gap-1';

export const topProgressTitleClassName = 'block min-w-0 truncate';

export const topProgressLocationNameClassName = 'text-muted font-medium';

export const topProgressMetaClassName = 'block min-w-0 truncate';

export const topProgressPathClassName = 'block min-h-[1.35rem] min-w-0 truncate text-muted';

export const topProgressStatusClassName = 'rounded-full bg-accent-soft px-[0.55rem] py-1 font-bold whitespace-nowrap text-accent';
