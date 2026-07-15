import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const searchDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(searchDir, 'SearchFilterControls.jsx'), 'utf8');

test('search filter controls delegate controlled query and filter changes to the real parent callbacks', () => {
  assert.match(source, /query,\s*setQuery,[\s\S]*onSubmit,\s*onReplaceFilterState/);
  assert.match(source, /value=\{query\} onChange=\{\(event\) => setQuery\(event\.currentTarget\.value\)\}/);
  assert.match(source, /function submitSearch\(event\)[\s\S]*onSubmit\?\.\(\)/);
  assert.match(source, /function replaceFilters\(nextFilters\)[\s\S]*onReplaceFilterState\?\.\(query, nextFilters\)/);
  assert.match(source, /onReplaceFilterState\?\.\(imported\.query, imported\.filters\)/);
  assert.doesNotMatch(source, /draftQuery|draftFilters|submitSearchOnEnter/);
});
