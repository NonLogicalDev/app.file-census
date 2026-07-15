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

test('button variants no longer depend on legacy CSS class shims', () => {
  assert.doesNotMatch(styleCss, /button\.(secondary|warning|danger)\b/);
  assert.doesNotMatch(styleCss, /\.(secondary|warning|danger)\b/);

  const offenders = collectSourceFiles(uiSrc)
    .filter((file) => !file.endsWith('/components/ui/Button.jsx'))
    .filter((file) => /className=["'](?:secondary|warning|danger)["']/.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});
