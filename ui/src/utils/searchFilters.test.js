import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addSearchFilter,
  addSearchFilterNode,
  buildFileSearchQuery,
  chipLabel,
  convertSearchFilterTermToGroup,
  decodeSearchFilters,
  defaultOperatorForSearchTerm,
  encodeSearchFilters,
  exportSearchFilterState,
  fileMatchesSearch,
  filtersFromSearchFilterRoot,
  groupSearchFilters,
  importSearchFilterState,
  moveSearchFilterNode,
  normalizeSearchFilter,
  removeSearchFilter,
  removeSearchFilterNode,
  searchFilterKey
  , searchFilterRoot,
  setSearchFilterGroupOperator,
  simplifySearchFilterGroup,
  toggleSearchFilterNegation
} from './searchFilters.js';

test('builds files.search payload from quick query and canonical filters', () => {
  const payload = buildFileSearchQuery('invoice', [
    { term: 'extension', operator: 'equal', expression: '.jpg' },
    { term: 'location_slug', operator: 'equal', expression: 'photos' },
    { term: 'kind', operator: 'equal', expression: 'file' }
  ]);

  assert.deepEqual(payload, {
    filter: {
      term: 'filter',
      operator: 'and',
      expression: [
        { term: 'text', operator: 'substring', expression: 'invoice' },
        { term: 'extension', operator: 'equal', expression: 'jpg' },
        { term: 'location_slug', operator: 'equal', expression: 'photos' },
        { term: 'kind', operator: 'equal', expression: 'file' }
      ]
    },
    limit: 200,
    offset: 0
  });
});

test('normalizes date filters to canonical RFC3339 expressions', () => {
  assert.deepEqual(normalizeSearchFilter({ term: 'mtime', operator: 'after', expression: '2026-06-12' }), {
    term: 'mtime',
    operator: 'after',
    expression: '2026-06-12T00:00:00.000Z'
  });
  assert.deepEqual(normalizeSearchFilter({
    term: 'mtime',
    operator: 'between',
    expression: { from: '2026-06-12', to: '2026-06-13' }
  }), {
    term: 'mtime',
    operator: 'between',
    expression: {
      from: '2026-06-12T00:00:00.000Z',
      to: '2026-06-13T23:59:59.999Z'
    }
  });
});

test('encodes and decodes canonical URL filter state defensively', () => {
  const filters = [
    { term: 'extension', operator: 'equal', expression: 'png' },
    { term: 'location_slug', operator: 'equal', expression: 'nl-media-01' }
  ];
  const encoded = encodeSearchFilters(filters);

  assert.deepEqual(decodeSearchFilters(encoded), filters);
  assert.deepEqual(decodeSearchFilters('not-json'), []);
  assert.deepEqual(decodeSearchFilters(JSON.stringify([{ field: 'extension', value: 'png' }])), []);
  assert.deepEqual(decodeSearchFilters(JSON.stringify([{ field: 'text', op: 'contains', value: 'x' }])), []);
});

test('exports and imports full search filter state as clipboard JSON', () => {
  const json = exportSearchFilterState('beach', [
    { term: 'extension', operator: 'equal', expression: '.jpg' },
    {
      term: 'filter',
      operator: 'or',
      expression: [
        { term: 'location_slug', operator: 'equal', expression: 'photos' },
        { term: 'location_slug', operator: 'equal', expression: 'archive' }
      ]
    }
  ]);

  assert.deepEqual(JSON.parse(json), {
    query: 'beach',
    filters: [
      { term: 'extension', operator: 'equal', expression: 'jpg' },
      {
        term: 'filter',
        operator: 'or',
        expression: [
          { term: 'location_slug', operator: 'equal', expression: 'photos' },
          { term: 'location_slug', operator: 'equal', expression: 'archive' }
        ]
      }
    ]
  });
  assert.deepEqual(importSearchFilterState(json), {
    query: 'beach',
    filters: [
      { term: 'extension', operator: 'equal', expression: 'jpg' },
      {
        term: 'filter',
        operator: 'or',
        expression: [
          { term: 'location_slug', operator: 'equal', expression: 'photos' },
          { term: 'location_slug', operator: 'equal', expression: 'archive' }
        ]
      }
    ]
  });
});

test('importing clipboard filter JSON rejects malformed or non-canonical state', () => {
  assert.equal(importSearchFilterState('not json'), null);
  assert.equal(importSearchFilterState(JSON.stringify([{ term: 'extension', operator: 'equal', expression: 'jpg' }])), null);
  assert.equal(importSearchFilterState(JSON.stringify({ query: 12, filters: [] })), null);
  assert.deepEqual(importSearchFilterState(JSON.stringify({
    query: 'ok',
    filters: [
      { field: 'extension', value: 'png' },
      { term: 'kind', operator: 'equal', expression: 'file' }
    ]
  })), {
    query: 'ok',
    filters: [{ term: 'kind', operator: 'equal', expression: 'file' }]
  });
});

test('adds and removes filters by canonical key and labels chips', () => {
  const initial = [{ term: 'extension', operator: 'equal', expression: 'jpg' }];
  const filters = addSearchFilter(initial, { term: 'extension', operator: 'equal', expression: '.png' });

  assert.deepEqual(filters, [
    { term: 'extension', operator: 'equal', expression: 'jpg' },
    { term: 'extension', operator: 'equal', expression: 'png' }
  ]);
  assert.equal(chipLabel(filters[1]), 'Extension is png');
  assert.equal(chipLabel({ term: 'location_slug', operator: 'not_equal', expression: 'photos' }), 'Location slug is not photos');
  assert.equal(chipLabel({ term: 'mtime', operator: 'after', expression: '2026-06-12' }), 'Modified after 2026-06-12');

  assert.deepEqual(removeSearchFilter(filters, searchFilterKey(filters[0])), [
    { term: 'extension', operator: 'equal', expression: 'png' }
  ]);
});

test('supports string inverse, fuzzy, and regex operators', () => {
  assert.deepEqual(normalizeSearchFilter({ term: 'path', operator: 'not_substring', expression: 'cache' }), {
    term: 'path',
    operator: 'not_substring',
    expression: 'cache'
  });
  assert.deepEqual(normalizeSearchFilter({ term: 'name', operator: 'fuzzy', expression: 'img123' }), {
    term: 'name',
    operator: 'fuzzy',
    expression: 'img123'
  });
  assert.deepEqual(normalizeSearchFilter({ term: 'location_name', operator: 'not_regex', expression: '^tmp' }), {
    term: 'location_name',
    operator: 'not_regex',
    expression: '^tmp'
  });
});

test('normalizes composed filters and rejects degenerate filters', () => {
  assert.deepEqual(normalizeSearchFilter({
    term: 'filter',
    operator: 'or',
    expression: [
      { term: 'extension', operator: 'equal', expression: 'jpg' },
      { term: 'extension', operator: 'equal', expression: 'png' }
    ]
  }), {
    term: 'filter',
    operator: 'or',
    expression: [
      { term: 'extension', operator: 'equal', expression: 'jpg' },
      { term: 'extension', operator: 'equal', expression: 'png' }
    ]
  });
  assert.deepEqual(normalizeSearchFilter({
    term: 'filter',
    operator: 'not',
    expression: { term: 'kind', operator: 'equal', expression: 'dir' }
  }), {
    term: 'filter',
    operator: 'not',
    expression: { term: 'kind', operator: 'equal', expression: 'dir' }
  });

  assert.equal(normalizeSearchFilter({ term: 'extension', operator: 'equal', expression: '.' }), null);
  assert.equal(normalizeSearchFilter({ term: 'text', operator: 'between', expression: 'x' }), null);
  assert.equal(normalizeSearchFilter({ field: 'extension', value: 'png' }), null);
  assert.equal(normalizeSearchFilter({ term: 'filter', operator: 'and', expression: [] }), null);
  assert.equal(defaultOperatorForSearchTerm('mtime'), 'after');
});

test('groups existing filters into canonical logical filters', () => {
  const filters = [
    { term: 'extension', operator: 'equal', expression: 'jpg' },
    { term: 'location_slug', operator: 'equal', expression: 'photos' },
    { term: 'name', operator: 'substring', expression: 'beach' }
  ];
  const grouped = groupSearchFilters(filters, [
    searchFilterKey(filters[0]),
    searchFilterKey(filters[2])
  ], 'or');

  assert.deepEqual(grouped, [
    { term: 'location_slug', operator: 'equal', expression: 'photos' },
    {
      term: 'filter',
      operator: 'or',
      expression: [
        { term: 'extension', operator: 'equal', expression: 'jpg' },
        { term: 'name', operator: 'substring', expression: 'beach' }
      ]
    }
  ]);
});

test('not groups require exactly one selected filter and and/or groups require two', () => {
  const filters = [
    { term: 'extension', operator: 'equal', expression: 'jpg' },
    { term: 'name', operator: 'substring', expression: 'beach' }
  ];
  assert.deepEqual(groupSearchFilters(filters, [searchFilterKey(filters[0])], 'and'), filters);
  assert.deepEqual(groupSearchFilters(filters, filters.map(searchFilterKey), 'not'), filters);
  assert.deepEqual(groupSearchFilters(filters, [searchFilterKey(filters[0])], 'not'), [
    { term: 'name', operator: 'substring', expression: 'beach' },
    {
      term: 'filter',
      operator: 'not',
      expression: { term: 'extension', operator: 'equal', expression: 'jpg' }
    }
  ]);
});

test('matches canonical search state against file-like rows', () => {
  const file = {
    kind: 'file',
    name: 'Beach Final.JPG',
    path: 'photos/Beach Final.JPG',
    location_slug: 'nl-media-01',
    location_name: 'NL Media 01',
    mtime: '2026-06-12T12:00:00Z',
    ctime: '2026-06-01T12:00:00Z'
  };

  assert.equal(fileMatchesSearch(file, 'beach', [
    { term: 'extension', operator: 'equal', expression: 'jpg' },
    { term: 'location_slug', operator: 'equal', expression: 'nl-media-01' },
    { term: 'mtime', operator: 'between', expression: { from: '2026-06-01', to: '2026-06-13' } }
  ]), true);

  assert.equal(fileMatchesSearch(file, 'beach', [
    { term: 'filter', operator: 'not', expression: { term: 'path', operator: 'substring', expression: 'photos' } }
  ]), false);

  assert.equal(fileMatchesSearch(file, '', [
    {
      term: 'filter',
      operator: 'or',
      expression: [
        { term: 'name', operator: 'regex', expression: '^draft' },
        { term: 'name', operator: 'fuzzy', expression: 'bfnj' }
      ]
    }
  ]), true);
});

test('wraps filters in a synthetic root all group and unwraps for persistence', () => {
  const filters = [
    { term: 'extension', operator: 'equal', expression: 'jpg' },
    { term: 'location_slug', operator: 'equal', expression: 'photos' }
  ];

  assert.deepEqual(searchFilterRoot(filters), {
    term: 'filter',
    operator: 'and',
    expression: filters
  });
  assert.deepEqual(filtersFromSearchFilterRoot(searchFilterRoot(filters)), filters);
});

test('tree helpers add, remove, move, and update nested nodes by path', () => {
  const initial = [
    { term: 'extension', operator: 'equal', expression: 'jpg' }
  ];
  const withGroup = addSearchFilterNode(initial, [], {
    term: 'filter',
    operator: 'or',
    expression: [
      { term: 'location_slug', operator: 'equal', expression: 'photos' }
    ]
  });
  assert.deepEqual(withGroup, [
    { term: 'extension', operator: 'equal', expression: 'jpg' },
    {
      term: 'filter',
      operator: 'or',
      expression: [
        { term: 'location_slug', operator: 'equal', expression: 'photos' }
      ]
    }
  ]);

  const withNested = addSearchFilterNode(withGroup, [1], { term: 'name', operator: 'substring', expression: 'beach' });
  assert.deepEqual(withNested[1].expression, [
    { term: 'location_slug', operator: 'equal', expression: 'photos' },
    { term: 'name', operator: 'substring', expression: 'beach' }
  ]);

  const moved = moveSearchFilterNode(withNested, [0], [1], 1);
  assert.deepEqual(moved, [
    {
      term: 'filter',
      operator: 'or',
      expression: [
        { term: 'location_slug', operator: 'equal', expression: 'photos' },
        { term: 'extension', operator: 'equal', expression: 'jpg' },
        { term: 'name', operator: 'substring', expression: 'beach' }
      ]
    }
  ]);

  assert.deepEqual(removeSearchFilterNode(moved, [0, 1]), [
    {
      term: 'filter',
      operator: 'or',
      expression: [
        { term: 'location_slug', operator: 'equal', expression: 'photos' },
        { term: 'name', operator: 'substring', expression: 'beach' }
      ]
    }
  ]);
});

test('tree helpers preserve semantics when negating and converting groups', () => {
  const filters = [
    { term: 'extension', operator: 'equal', expression: 'tmp' }
  ];

  const negated = toggleSearchFilterNegation(filters, [0]);
  assert.deepEqual(negated, [
    {
      term: 'filter',
      operator: 'not',
      expression: { term: 'extension', operator: 'equal', expression: 'tmp' }
    }
  ]);

  const grouped = convertSearchFilterTermToGroup(negated, [0]);
  assert.deepEqual(grouped, [
    {
      term: 'filter',
      operator: 'not',
      expression: {
        term: 'filter',
        operator: 'and',
        expression: [{ term: 'extension', operator: 'equal', expression: 'tmp' }]
      }
    }
  ]);

  const asAny = setSearchFilterGroupOperator(grouped, [0], 'or');
  assert.deepEqual(asAny[0].expression.operator, 'or');

  const simplified = simplifySearchFilterGroup(asAny, [0]);
  assert.deepEqual(simplified, negated);

  const matchedAgain = toggleSearchFilterNegation(simplified, [0]);
  assert.deepEqual(matchedAgain, filters);
});
