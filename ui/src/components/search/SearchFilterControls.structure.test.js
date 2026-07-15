import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const searchDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(searchDir, 'SearchFilterControls.jsx'), 'utf8');

test('search filter controls keep edits in draft state until explicit submit', () => {
  assert.match(source, /const \[draftQuery, setDraftQuery\] = useState/);
  assert.match(source, /const \[draftFilters, setDraftFilters\] = useState/);
  assert.match(source, /onSubmit\?\.\(\{ query: draftQuery, filters: draftFilters \}\)/);
  assert.match(source, /onChange=\{\(event\) => setDraftQuery\(event\.currentTarget\.value\)\}/);
  assert.match(source, /onKeyDown=\{submitSearchOnEnter\}/);
  assert.doesNotMatch(source, /onReplaceFilterState/);
});
