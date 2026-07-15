import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const redesignDir = dirname(fileURLToPath(import.meta.url));
const uiSrc = dirname(dirname(redesignDir));
const previewSource = readFileSync(join(uiSrc, 'preview.jsx'), 'utf8');

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(?:js|jsx|css)$/.test(path) && !path.endsWith('.test.js'));
}

const prototypeSource = sourceFiles(redesignDir)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

test('redesign prototypes are exposed only as full-screen component previews', () => {
  assert.match(previewSource, /path: '\/redesign\/location-scan-browser'/);
  assert.match(previewSource, /path: '\/redesign\/duplicates'/);
  assert.match(previewSource, /path: '\/redesign\/tasks'/);
  assert.equal((previewSource.match(/fullScreen: true/g) || []).length, 3);
  assert.match(previewSource, /if \(activePreview\.fullScreen\)/);
  assert.match(previewSource, /replace\(\/\^#\/, ''\) \|\| '\/scan-progress\/expanded'/);
  assert.match(previewSource, /preview\.path === '\/scan-progress\/expanded'/);
});

test('redesign prototypes stay backend-free and avoid forbidden visual shortcuts', () => {
  assert.doesNotMatch(prototypeSource, /from ['"][^'"]*(?:App\.jsx|\/pages\/|\/api\/|\/hooks\/|transport)/);
  assert.doesNotMatch(prototypeSource, /(?:linear|radial)-gradient/);
  assert.doesNotMatch(prototypeSource, /box-shadow/);
  assert.doesNotMatch(prototypeSource, /<svg/);
  assert.doesNotMatch(prototypeSource, /Date\.now\(/);
  assert.doesNotMatch(prototypeSource, /fetch\(|WebSocket|rpc\.|invoke\(|Math\.random\(|new Date\(/);
});

test('prototype preserves the approval-stage interaction contract', () => {
  const locationSource = readFileSync(join(redesignDir, 'screens', 'LocationScreen.jsx'), 'utf8');
  const locationStyles = readFileSync(join(redesignDir, 'screens', 'location.css'), 'utf8');
  const commandSource = readFileSync(join(redesignDir, 'CommandPalette.jsx'), 'utf8');
  const commandStyles = readFileSync(join(redesignDir, 'commandPalette.css'), 'utf8');
  const tasksSource = readFileSync(join(redesignDir, 'screens', 'TasksScreen.jsx'), 'utf8');

  assert.match(locationSource, /Files/);
  assert.match(locationSource, /File tree/);
  assert.match(locationSource, /Delete Check/);
  assert.match(locationSource, /Advanced filters/);
  assert.match(locationSource, /locations\.filter\(\(item\) => item\.id === scan\.locationId\)\.slice\(0, 1\)/);
  assert.match(locationSource, /const locationRows = \[scanLocation\]/);
  assert.match(locationSource, /aria-label="Scan location"/);
  assert.match(locationStyles, /\.loc-tree-label\s*\{[\s\S]*?justify-content:\s*flex-start/);
  assert.match(commandSource, /role="dialog"/);
  assert.match(commandSource, /role="combobox"/);
  assert.match(commandSource, /role="listbox"/);
  assert.match(commandSource, /role="option"/);
  assert.match(commandSource, /aria-activedescendant/);
  assert.match(commandSource, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(commandSource, /event\.key === 'Escape'/);
  assert.match(commandSource, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  assert.match(commandSource, /event\.key === 'Home' \|\| event\.key === 'End'/);
  assert.match(commandSource, /event\.key === 'Tab'/);
  assert.match(commandStyles, /\.rd-command-row\s*\{[\s\S]*?justify-content:\s*flex-start/);
  assert.match(tasksSource, /stopping/);
});
