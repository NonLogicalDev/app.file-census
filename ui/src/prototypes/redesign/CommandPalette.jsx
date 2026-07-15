import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  Check,
  CheckSquare2,
  CircleHelp,
  CircleStop,
  Columns3,
  Copy,
  Database,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  Hash,
  Layers3,
  List,
  ListChecks,
  PanelRight,
  Pause,
  ScanSearch,
  Search,
  Settings2,
  SlidersHorizontal,
  UnfoldVertical,
} from 'lucide-react';

import { buildCommandGroups, filterCommandGroups } from './commandPaletteModel.js';
import './commandPalette.css';

const icons = {
  activity: Activity,
  archive: Archive,
  check: Check,
  'check-square': CheckSquare2,
  'circle-stop': CircleStop,
  columns: Columns3,
  copy: Copy,
  database: Database,
  folder: Folder,
  'folder-open': FolderOpen,
  'folder-tree': FolderTree,
  'hard-drive': HardDrive,
  hash: Hash,
  help: CircleHelp,
  layers: Layers3,
  list: List,
  'list-checks': ListChecks,
  'panel-right': PanelRight,
  pause: Pause,
  'scan-search': ScanSearch,
  settings: Settings2,
  sliders: SlidersHorizontal,
  unfold: UnfoldVertical,
};

function enabledResultIndices(commands) {
  return commands.reduce((indices, command, index) => (
    command.disabled ? indices : [...indices, index]
  ), []);
}

function nextEnabledIndex(commands, current, direction) {
  const enabled = enabledResultIndices(commands);
  if (!enabled.length) return -1;
  const position = enabled.indexOf(current);
  if (position === -1) return direction > 0 ? enabled[0] : enabled.at(-1);
  return enabled[(position + direction + enabled.length) % enabled.length];
}

export default function CommandPalette({ context, open, onOpenChange, onNotice, screen }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const commandGroups = useMemo(() => buildCommandGroups(screen, context), [context, screen]);
  const visibleGroups = useMemo(() => filterCommandGroups(commandGroups, query), [commandGroups, query]);
  const visibleCommands = useMemo(() => visibleGroups.flatMap((group) => group.commands), [visibleGroups]);
  const activeCommand = visibleCommands[activeIndex] || null;

  function closePalette() {
    onOpenChange(false);
  }

  function execute(command) {
    if (!command || command.disabled) return;
    if (command.action) {
      window.dispatchEvent(new CustomEvent('redesign:prototype-command', { detail: command.action }));
    }
    if (command.href) {
      window.location.hash = command.href;
    }
    onNotice(command.action?.notice || (command.href ? `Navigated to ${command.label}.` : command.action?.value || `${command.label} complete.`));
    if (command.action?.type === 'open-location') window.location.hash = '#/redesign/location-scan-browser';
    closePalette();
  }

  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;
    setQuery('');
    setActiveIndex(enabledResultIndices(commandGroups.flatMap((group) => group.commands))[0] ?? -1);
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [commandGroups, open]);

  useEffect(() => {
    if (open) return;
    previouslyFocusedRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    setActiveIndex(enabledResultIndices(visibleCommands)[0] ?? -1);
  }, [query, visibleCommands]);

  useEffect(() => {
    if (!open || !activeCommand) return;
    document.getElementById(`rd-command-option-${activeCommand.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeCommand, open]);

  if (!open) return null;

  function onDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => nextEnabledIndex(visibleCommands, current, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const enabled = enabledResultIndices(visibleCommands);
      setActiveIndex(event.key === 'Home' ? (enabled[0] ?? -1) : (enabled.at(-1) ?? -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      execute(activeCommand);
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...dialogRef.current.querySelectorAll('input, button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  let resultIndex = -1;
  return (
    <div
      className="rd-command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <div
        aria-labelledby="rd-command-title"
        aria-modal="true"
        className="rd-command-dialog"
        onKeyDown={onDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="rd-sr-only" id="rd-command-title">Command menu</h2>
        <div className="rd-command-search">
          <Search aria-hidden="true" size={17} />
          <input
            aria-activedescendant={activeCommand ? `rd-command-option-${activeCommand.id}` : undefined}
            aria-autocomplete="list"
            aria-controls="rd-command-listbox"
            aria-expanded="true"
            aria-label="Search locations, menus, and file actions"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search locations, menus, and file actions…"
            ref={inputRef}
            role="combobox"
            value={query}
          />
          <kbd>esc</kbd>
        </div>

        <div aria-label="Available commands" className="rd-command-results" id="rd-command-listbox" role="listbox">
          {visibleGroups.map((group) => (
            <div aria-labelledby={`rd-command-group-${group.label.replaceAll(' ', '-').toLocaleLowerCase()}`} className="rd-command-group" key={group.label} role="group">
              <div className="rd-command-group__label" id={`rd-command-group-${group.label.replaceAll(' ', '-').toLocaleLowerCase()}`}>{group.label}</div>
              {group.commands.map((command) => {
                resultIndex += 1;
                const index = resultIndex;
                const Icon = icons[command.icon] || Search;
                return (
                  <button
                    aria-disabled={command.disabled || undefined}
                    aria-selected={index === activeIndex}
                    className={`rd-command-row${index === activeIndex ? ' is-active' : ''}${command.disabled ? ' is-disabled' : ''}`}
                    disabled={command.disabled}
                    id={`rd-command-option-${command.id}`}
                    key={command.id}
                    onClick={() => execute(command)}
                    onMouseMove={() => {
                      if (!command.disabled) setActiveIndex(index);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="rd-command-row__icon"><Icon aria-hidden="true" size={15} /></span>
                    <span className="rd-command-row__copy">
                      <strong>{command.label}</strong>
                      <small>{command.detail}</small>
                    </span>
                    {command.disabled ? <span className="rd-command-row__meta">Unavailable</span> : <span className="rd-command-row__enter">↵</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {!visibleCommands.length ? (
            <div className="rd-command-empty">
              <Search aria-hidden="true" size={16} />
              <span>No commands match “{query}”</span>
            </div>
          ) : null}
        </div>

        <div className="rd-command-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Run</span>
          <span><kbd>esc</kbd> Close</span>
          <span className="rd-command-footer__count">{visibleCommands.length} {visibleCommands.length === 1 ? 'command' : 'commands'}</span>
        </div>
      </div>
    </div>
  );
}
