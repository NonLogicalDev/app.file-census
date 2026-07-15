import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon.jsx';
import { Button, cn } from '../ui/index.jsx';
import {
  adjacentEnabledCommandKey,
  boundaryEnabledCommandKey,
  commandOptionId,
  enabledCommandEntries,
  filterCommandGroups,
  flattenCommandGroups
} from './commandPaletteModel.js';

const triggerClassName = cn(
  '!min-h-[38px] !gap-2 !rounded-ui !border-border !bg-surface !px-3 !py-1.5 !font-medium !text-muted-strong',
  'hover:!border-border-strong hover:!bg-surface-muted hover:!text-text',
  '[&_kbd]:ml-1 [&_kbd]:rounded-[4px] [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-surface-subtle [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:text-[0.7rem] [&_kbd]:font-medium [&_kbd]:text-muted'
);

const dialogClassName = cn(
  'flex w-[min(620px,calc(100vw-48px))] flex-col overflow-hidden rounded-ui border border-border-strong bg-surface-subtle shadow-none',
  'max-h-[min(690px,calc(100dvh-144px))]'
);

function isFocusableElement(value) {
  return Boolean(value?.isConnected && typeof value.focus === 'function');
}

function commandIcon(command) {
  if (typeof command?.icon === 'string') return <Icon name={command.icon} />;
  if (command?.icon) return command.icon;
  if (command?.iconName) return <Icon name={command.iconName} />;
  return null;
}

/**
 * A presentation-only command menu. The caller owns every command action via
 * `onCommand(command, group)` or an individual `command.onSelect` callback.
 */
export function CommandPalette({
  groups = [],
  onCommand,
  open,
  defaultOpen = false,
  onOpenChange,
  query,
  defaultQuery = '',
  onQueryChange,
  shortcutEnabled = true,
  showTrigger = true,
  triggerLabel = 'Command',
  shortcutLabel = '⌘K',
  title = 'Command menu',
  placeholder = 'Search commands…',
  emptyMessage = 'No commands found.',
  triggerClassName: triggerClassNameOverride,
  className
}) {
  const generatedId = useId();
  const dialogId = `${generatedId}-dialog`;
  const titleId = `${generatedId}-title`;
  const inputId = `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const isOpenControlled = open !== undefined;
  const isQueryControlled = query !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [uncontrolledQuery, setUncontrolledQuery] = useState(defaultQuery);
  const [activeKey, setActiveKey] = useState(null);
  const inputRef = useRef(null);
  const optionRefs = useRef(new Map());
  const previousFocusRef = useRef(null);
  const didOpenRef = useRef(false);

  const isOpen = isOpenControlled ? Boolean(open) : uncontrolledOpen;
  const currentQuery = isQueryControlled ? String(query ?? '') : uncontrolledQuery;
  const filteredGroups = useMemo(
    () => filterCommandGroups(groups, currentQuery),
    [groups, currentQuery]
  );
  const entries = useMemo(() => flattenCommandGroups(filteredGroups), [filteredGroups]);
  const enabledEntries = useMemo(() => enabledCommandEntries(entries), [entries]);
  const enabledKeySignature = enabledEntries.map((entry) => entry.key).join('|');
  const activeEntry = enabledEntries.find((entry) => entry.key === activeKey) ?? null;

  const setSearchQuery = useCallback((nextQuery) => {
    if (!isQueryControlled) setUncontrolledQuery(nextQuery);
    onQueryChange?.(nextQuery);
  }, [isQueryControlled, onQueryChange]);

  const setPaletteOpen = useCallback((nextValue) => {
    const nextOpen = Boolean(typeof nextValue === 'function' ? nextValue(isOpen) : nextValue);
    if (!isOpen && nextOpen) {
      setSearchQuery('');
      setActiveKey(null);
    }
    if (!isOpenControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [isOpen, isOpenControlled, onOpenChange, setSearchQuery]);

  const executeCommand = useCallback((entry) => {
    if (!entry || entry.command?.disabled) return;
    setPaletteOpen(false);
    if (onCommand) {
      onCommand(entry.command, entry.group);
      return;
    }
    entry.command?.onSelect?.(entry.command, entry.group);
  }, [onCommand, setPaletteOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!enabledEntries.some((entry) => entry.key === activeKey)) {
      setActiveKey(enabledEntries[0]?.key ?? null);
    }
  }, [activeKey, enabledEntries, enabledKeySignature, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeKey) return;
    optionRefs.current.get(activeKey)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeKey, isOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    if (isOpen) {
      didOpenRef.current = true;
      if (!previousFocusRef.current) previousFocusRef.current = document.activeElement;
      const scheduleFocus = window.requestAnimationFrame ?? ((callback) => window.setTimeout(callback, 0));
      const cancelFocus = window.cancelAnimationFrame ?? window.clearTimeout;
      const focusFrame = scheduleFocus(() => inputRef.current?.focus());
      return () => cancelFocus(focusFrame);
    }

    if (!didOpenRef.current) return undefined;
    didOpenRef.current = false;
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (isFocusableElement(previousFocus)) previousFocus.focus({ preventScroll: true });
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function onWindowKeyDown(event) {
      if (event.defaultPrevented) return;
      const isCommandShortcut = shortcutEnabled
        && (event.metaKey || event.ctrlKey)
        && !event.altKey
        && String(event.key).toLocaleLowerCase() === 'k';

      if (isCommandShortcut) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        setPaletteOpen(false);
      }
    }

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [isOpen, setPaletteOpen, shortcutEnabled]);

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveKey(adjacentEnabledCommandKey(entries, activeKey, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveKey(boundaryEnabledCommandKey(entries, event.key === 'End' ? 'end' : 'start'));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      executeCommand(activeEntry);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setPaletteOpen(false);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {showTrigger && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-controls={isOpen ? dialogId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(triggerClassName, triggerClassNameOverride)}
          onClick={() => setPaletteOpen(true)}
          icon={<Icon name="search" />}
        >
          <span>{triggerLabel}</span>
          <kbd>{shortcutLabel}</kbd>
        </Button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-[rgb(0_0_0_/_0.62)] px-6 pt-[104px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaletteOpen(false);
          }}
        >
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className={cn(dialogClassName, className)}
            id={dialogId}
            role="dialog"
          >
            <h2 className="sr-only" id={titleId}>{title}</h2>
            <div className="flex min-h-[50px] items-center gap-2 border-b border-border px-3">
              <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
              <input
                aria-activedescendant={activeEntry ? commandOptionId(generatedId, activeEntry) : undefined}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-expanded="true"
                aria-label={title}
                className="min-w-0 flex-1 border-0 bg-transparent px-0 py-3 text-sm text-text outline-none placeholder:text-muted"
                id={inputId}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={placeholder}
                ref={inputRef}
                role="combobox"
                value={currentQuery}
              />
              <kbd className="rounded-[4px] border border-border bg-surface-subtle px-1.5 py-0.5 text-[0.7rem] font-medium text-muted">Esc</kbd>
            </div>

            <div aria-label="Commands" className="min-h-0 overflow-y-auto p-1.5" id={listboxId} role="listbox">
              {filteredGroups.map((group, groupIndex) => {
                const groupEntries = entries.filter((entry) => entry.group === group);
                return (
                  <div className="border-b border-border py-1.5 first:border-t-0 last:border-b-0" key={`${group.id ?? group.label ?? groupIndex}-${groupIndex}`} role="group" aria-label={group.label}>
                    {group.label && <div className="px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{group.label}</div>}
                    <div className="grid gap-0.5">
                      {groupEntries.map((entry) => {
                        const selected = entry.key === activeKey;
                        const disabled = Boolean(entry.command?.disabled);
                        const optionId = commandOptionId(generatedId, entry);
                        const icon = commandIcon(entry.command);

                        return (
                          <button
                            aria-disabled={disabled || undefined}
                            aria-selected={selected}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-ui border border-transparent px-2.5 py-2 text-left text-sm transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                              selected ? 'border-border-strong bg-surface-muted text-text' : 'text-muted-strong hover:bg-surface-muted hover:text-text',
                              disabled && 'cursor-not-allowed opacity-50'
                            )}
                            disabled={disabled}
                            id={optionId}
                            key={entry.key}
                            onClick={() => executeCommand(entry)}
                            onMouseMove={() => {
                              if (!disabled) setActiveKey(entry.key);
                            }}
                            ref={(element) => {
                              if (element) optionRefs.current.set(entry.key, element);
                              else optionRefs.current.delete(entry.key);
                            }}
                            role="option"
                            tabIndex={-1}
                            type="button"
                          >
                            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-[5px] border border-border bg-surface-subtle text-muted">
                              {icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{entry.command?.label}</span>
                              {entry.command?.detail && <span className="block truncate pt-0.5 text-xs text-muted">{entry.command.detail}</span>}
                            </span>
                            {entry.command?.shortcut && <kbd className="shrink-0 rounded-[4px] border border-border bg-surface-subtle px-1.5 py-0.5 text-[0.68rem] font-medium text-muted">{entry.command.shortcut}</kbd>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!filteredGroups.length && (
                <p className="px-2.5 py-8 text-center text-sm text-muted">{emptyMessage}</p>
              )}
            </div>

            <footer className="flex items-center gap-3 border-t border-border px-3 py-2 text-[0.7rem] text-muted">
              <span><kbd className="font-medium text-muted-strong">↑↓</kbd> Navigate</span>
              <span><kbd className="font-medium text-muted-strong">↵</kbd> Run</span>
              <span><kbd className="font-medium text-muted-strong">Esc</kbd> Close</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

export default CommandPalette;
