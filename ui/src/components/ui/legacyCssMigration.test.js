import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiSrc = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const styleCss = readFileSync(join(uiSrc, 'style.css'), 'utf8');

function collectSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    return /\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.endsWith('.test.js') ? [fullPath] : [];
  });
}

test('legacy global nav tab selectors are removed', () => {
  assert.doesNotMatch(styleCss, /^nav\b/m);
  assert.doesNotMatch(styleCss, /^nav button\b/m);
});

test('legacy icon and status indicator selectors are removed', () => {
  for (const selector of [
    /^\.icon\b/m,
    /^\.traffic-dot\b/m,
    /^\.nav-icon\b/m,
    /^\.nav-icon-svg\b/m,
    /^\.connection-led\b/m,
    /^\.location-led\b/m
  ]) {
    assert.doesNotMatch(styleCss, selector);
  }

  const offenders = collectSourceFiles(uiSrc)
    .filter((file) => !file.endsWith('/components/Icon.jsx'))
    .filter((file) => /(?:icon trailing|traffic-dot|nav-icon|nav-icon-svg|connection-led|location-led)/.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});

test('legacy panel empty notes and log selectors are removed', () => {
  for (const selector of [
    /^\.empty\b/m,
    /^\.panel-title\b/m,
    /^\.detail-actions\b/m,
    /^\.log\b/m,
    /^\.notes-panel\b/m,
    /^\.scan-notes-panel\b/m
  ]) {
    assert.doesNotMatch(styleCss, selector);
  }

  const legacyClassToken = /className=(?:"[^"]*(?<![\w-])(?:empty|panel-title|detail-actions|log|notes-panel|scan-notes-panel)(?![\w-])[^"]*"|\{[^}\n]*['"][^'"]*(?<![\w-])(?:empty|panel-title|detail-actions|log|notes-panel|scan-notes-panel)(?![\w-])[^'"]*['"][^}\n]*\})/;
  const offenders = collectSourceFiles(uiSrc)
    .filter((file) => legacyClassToken.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});

test('legacy FileExplorer chrome selectors are removed', () => {
  for (const selector of [
    /^\.explorer\b/m,
    /^\.explorer-header\b/m,
    /^\.finder-toolbar\b/m,
    /^\.column-picker\b/m,
    /^\.breadcrumbs\b/m,
    /^\.delete-check-callout\b/m,
    /^\.delete-check-empty\b/m,
    /^\.tree\b/m,
    /^\.tree-empty\b/m
  ]) {
    assert.doesNotMatch(styleCss, selector);
  }

  const legacyClassToken = /className=(?:"[^"]*(?<![\w-])(?:explorer|explorer-header|finder-toolbar|column-picker|breadcrumbs|delete-check-callout|delete-check-empty|tree|tree-empty)(?![\w-])[^"]*"|\{[^}\n]*['"][^'"]*(?<![\w-])(?:explorer|explorer-header|finder-toolbar|column-picker|breadcrumbs|delete-check-callout|delete-check-empty|tree|tree-empty)(?![\w-])[^'"]*['"][^}\n]*\})/;
  const offenders = collectSourceFiles(uiSrc)
    .filter((file) => legacyClassToken.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});

test('legacy FileGrid table selectors are removed', () => {
  for (const selector of [
    /^\.file-grid\b/m,
    /^\.file-grid-table\b/m,
    /^\.file-grid-header\b/m,
    /^\.file-grid-row\b/m,
    /^\.file-grid-cell-content\b/m,
    /^\.file-grid-sort\b/m,
    /^\.file-grid-resizer\b/m,
    /^\.file-name-cell\b/m,
    /^\.file-kind-icon\b/m,
    /^\.file-row-action-menu\b/m,
    /^\.file-row-action-trigger\b/m,
    /^\.file-row-action-panel\b/m,
    /^\.row-actions\b/m,
    /^\.row-select\b/m
  ]) {
    assert.doesNotMatch(styleCss, selector);
  }

  const legacyClassToken = /className=(?:"[^"]*(?<![\w-])(?:file-grid|file-grid-table|file-grid-header|file-grid-row|file-grid-cell-content|file-grid-sort|file-grid-resizer|file-name-cell|file-kind-icon|file-row-action-menu|file-row-action-trigger|file-row-action-panel|row-actions|row-select|numeric|sortable|folder-row|is-actionable|is-selected)(?![\w-])[^"]*"|\{[^}\n]*['"][^'"]*(?<![\w-])(?:file-grid|file-grid-table|file-grid-header|file-grid-row|file-grid-cell-content|file-grid-sort|file-grid-resizer|file-name-cell|file-kind-icon|file-row-action-menu|file-row-action-trigger|file-row-action-panel|row-actions|row-select|numeric|sortable|folder-row|is-actionable|is-selected)(?![\w-])[^'"]*['"][^}\n]*\})/;
  const offenders = collectSourceFiles(uiSrc)
    .filter((file) => legacyClassToken.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});

test('legacy Shell topbar and menu chrome selectors are removed', () => {
  for (const selector of [
    /^\s*\.app-main\b/m,
    /^\s*\.workspace-header\b/m,
    /^\s*\.topbar-title\b/m,
    /^\s*\.topbar-sidebar-toggle\b/m,
    /^\s*\.header-actions\b/m,
    /^\s*\.page-actions-menu\b/m,
    /^\s*\.page-actions-panel\b/m,
    /^\s*\.page-actions-panel-title\b/m,
    /^\s*\.page-actions-list\b/m,
    /^\s*\.options-menu\b/m,
    /^\s*\.options-panel\b/m,
    /^\s*\.options-section\b/m,
    /^\s*\.sidebar-footer\s+\.options-menu\b/m,
    /^\s*\.sidebar-footer\s+\.options-panel\b/m
  ]) {
    assert.doesNotMatch(styleCss, selector);
  }

  const legacyClassToken = /className=(?:"[^"]*(?<![\w-])(?:app-main|workspace-header|topbar-title|topbar-sidebar-toggle|header-actions|page-actions-menu|page-actions-panel|page-actions-panel-title|page-actions-list|options-menu|options-panel|options-section)(?![\w-])[^"]*"|\{[^}\n]*['"][^'"]*(?<![\w-])(?:app-main|workspace-header|topbar-title|topbar-sidebar-toggle|header-actions|page-actions-menu|page-actions-panel|page-actions-panel-title|page-actions-list|options-menu|options-panel|options-section)(?![\w-])[^'"]*['"][^}\n]*\})/;
  const offenders = collectSourceFiles(uiSrc)
    .filter((file) => legacyClassToken.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});
