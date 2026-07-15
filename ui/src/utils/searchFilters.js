export const SEARCH_FILTER_TERMS = [
  { value: 'text', label: 'Name or path', type: 'string' },
  { value: 'name', label: 'Name', type: 'string' },
  { value: 'path', label: 'Relative path', type: 'string' },
  { value: 'extension', label: 'Extension', type: 'string' },
  { value: 'location_slug', label: 'Location slug', type: 'location' },
  { value: 'location_name', label: 'Location name', type: 'string' },
  { value: 'kind', label: 'Kind', type: 'kind' },
  { value: 'mtime', label: 'Modified', type: 'date' },
  { value: 'ctime', label: 'Created', type: 'date' }
];

export const SEARCH_FILTER_OPERATORS = {
  string: [
    { value: 'substring', label: 'contains' },
    { value: 'not_substring', label: 'does not contain' },
    { value: 'equal', label: 'is' },
    { value: 'not_equal', label: 'is not' },
    { value: 'fuzzy', label: 'fuzzy matches' },
    { value: 'not_fuzzy', label: 'does not fuzzy match' },
    { value: 'regex', label: 'matches regex' },
    { value: 'not_regex', label: 'does not match regex' }
  ],
  location: [
    { value: 'equal', label: 'is' },
    { value: 'not_equal', label: 'is not' },
    { value: 'substring', label: 'contains' },
    { value: 'not_substring', label: 'does not contain' },
    { value: 'regex', label: 'matches regex' },
    { value: 'not_regex', label: 'does not match regex' },
    { value: 'fuzzy', label: 'fuzzy matches' },
    { value: 'not_fuzzy', label: 'does not fuzzy match' }
  ],
  kind: [
    { value: 'equal', label: 'is' },
    { value: 'not_equal', label: 'is not' }
  ],
  date: [
    { value: 'after', label: 'after' },
    { value: 'before', label: 'before' },
    { value: 'between', label: 'between' }
  ]
};

const termDefinitions = new Map(SEARCH_FILTER_TERMS.map((term) => [term.value, term]));
const stringOperators = new Set(SEARCH_FILTER_OPERATORS.string.map((operator) => operator.value));
const locationOperators = new Set(SEARCH_FILTER_OPERATORS.location.map((operator) => operator.value));
const kindOperators = new Set(SEARCH_FILTER_OPERATORS.kind.map((operator) => operator.value));
const dateOperators = new Set(SEARCH_FILTER_OPERATORS.date.map((operator) => operator.value));
const filterOperators = new Set(['and', 'or', 'not']);

export function operatorsForSearchTerm(term) {
  const definition = termDefinitions.get(term) || SEARCH_FILTER_TERMS[0];
  return SEARCH_FILTER_OPERATORS[definition.type] || SEARCH_FILTER_OPERATORS.string;
}

export function defaultOperatorForSearchTerm(term) {
  return operatorsForSearchTerm(term)[0].value;
}

export function normalizeSearchFilter(filter) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return null;
  if (typeof filter.term !== 'string' || typeof filter.operator !== 'string') return null;

  if (filter.term === 'filter') {
    return normalizeComposedFilter(filter);
  }

  const definition = termDefinitions.get(filter.term);
  if (!definition) return null;

  if (definition.type === 'date') {
    return normalizeDateFilter(filter);
  }
  if (definition.type === 'kind') {
    return normalizeKindFilter(filter);
  }
  return normalizeStringFilter(filter, definition.type === 'location' ? locationOperators : stringOperators);
}

export function addSearchFilter(filters, filter) {
  const normalized = normalizeSearchFilter(filter);
  if (!normalized) return filters || [];
  const key = searchFilterKey(normalized);
  return [
    ...(filters || [])
      .map(normalizeSearchFilter)
      .filter(Boolean)
      .filter((item) => searchFilterKey(item) !== key),
    normalized
  ];
}

export function removeSearchFilter(filters, filterOrKey) {
  const key = typeof filterOrKey === 'string'
    ? filterOrKey
    : searchFilterKey(filterOrKey);
  return (filters || [])
    .map(normalizeSearchFilter)
    .filter(Boolean)
    .filter((item) => searchFilterKey(item) !== key);
}

export function groupSearchFilters(filters, filterKeys, operator) {
  if (!filterOperators.has(operator)) return normalizedFilterList(filters);
  const keys = new Set(filterKeys || []);
  const normalized = normalizedFilterList(filters);
  const selected = normalized.filter((item) => keys.has(searchFilterKey(item)));
  if (operator === 'not') {
    if (selected.length !== 1) return normalized;
  } else if (selected.length < 2) {
    return normalized;
  }
  const grouped = normalizeSearchFilter({
    term: 'filter',
    operator,
    expression: operator === 'not' ? selected[0] : selected
  });
  if (!grouped) return normalized;
  return [
    ...normalized.filter((item) => !keys.has(searchFilterKey(item))),
    grouped
  ];
}

export function searchFilterKey(filter) {
  const normalized = normalizeSearchFilter(filter);
  return normalized ? JSON.stringify(normalized) : '';
}

function normalizedFilterList(filters) {
  return (filters || []).map(normalizeSearchFilter).filter(Boolean);
}

export function encodeSearchFilters(filters) {
  const normalized = (filters || []).map(normalizeSearchFilter).filter(Boolean);
  return normalized.length ? JSON.stringify(normalized) : '';
}

export function decodeSearchFilters(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSearchFilter).filter(Boolean);
  } catch {
    return [];
  }
}

export function exportSearchFilterState(query, filters) {
  return JSON.stringify({
    query: String(query || ''),
    filters: normalizedFilterList(filters)
  }, null, 2);
}

export function importSearchFilterState(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.query !== 'string' || !Array.isArray(parsed.filters)) return null;
    return {
      query: parsed.query,
      filters: normalizedFilterList(parsed.filters)
    };
  } catch {
    return null;
  }
}

export function buildFileSearchQuery(query, filters, options = {}) {
  const expression = [];
  const text = String(query || '').trim();
  if (text) {
    expression.push({ term: 'text', operator: 'substring', expression: text });
  }
  for (const filter of (filters || []).map(normalizeSearchFilter).filter(Boolean)) {
    expression.push(filter);
  }
  const searchQuery = {
    filter: expression.length ? { term: 'filter', operator: 'and', expression } : null,
    limit: options.limit || 200,
    offset: options.offset || 0
  };

  const scanIds = [...new Set((options.scanIds || []).filter(Boolean))];
  if (scanIds.length) {
    searchQuery.scan_ids = scanIds;
  } else if (typeof options.allScans === 'boolean') {
    searchQuery.representative_only = !options.allScans;
  }

  return searchQuery;
}

export function fileMatchesSearch(file, query = '', filters = []) {
  const text = String(query || '').trim();
  if (text && !textFilterMatches(file, text)) return false;
  return (filters || [])
    .map(normalizeSearchFilter)
    .filter(Boolean)
    .every((filter) => fileMatchesFilter(file, filter));
}

export function chipLabel(filter) {
  const normalized = normalizeSearchFilter(filter);
  if (!normalized) return '';
  if (normalized.term === 'filter') {
    return composedFilterLabel(normalized);
  }
  const term = termDefinitions.get(normalized.term)?.label || normalized.term;
  if (normalized.operator === 'between' && typeof normalized.expression === 'object') {
    return `${term} between ${displayExpression(normalized.expression.from)} and ${displayExpression(normalized.expression.to)}`;
  }
  const operator = operatorLabel(normalized.term, normalized.operator);
  return `${term} ${operator} ${displayExpression(normalized.expression)}`;
}

function fileMatchesFilter(file, filter) {
  if (filter.term === 'filter') {
    if (filter.operator === 'and') {
      return filter.expression.every((item) => fileMatchesFilter(file, item));
    }
    if (filter.operator === 'or') {
      return filter.expression.some((item) => fileMatchesFilter(file, item));
    }
    if (filter.operator === 'not') {
      return !fileMatchesFilter(file, filter.expression);
    }
    return false;
  }

  if (filter.term === 'ctime' || filter.term === 'mtime') {
    return dateFilterMatches(file, filter);
  }

  return stringFilterMatches(file, filter);
}

function textFilterMatches(file, query) {
  return stringValuesForTerm(file, 'text')
    .some((value) => containsCaseInsensitive(value, query));
}

function stringFilterMatches(file, filter) {
  const values = stringValuesForTerm(file, filter.term);
  const expression = filter.term === 'extension'
    ? normalizeExtensionExpression(filter.expression)
    : String(filter.expression || '');

  switch (filter.operator) {
    case 'equal':
      return values.some((value) => value === expression);
    case 'not_equal':
      return values.every((value) => value !== expression);
    case 'substring':
      return values.some((value) => containsCaseInsensitive(value, expression));
    case 'not_substring':
      return values.every((value) => !containsCaseInsensitive(value, expression));
    case 'regex':
      return regexMatches(values, expression, false);
    case 'not_regex':
      return regexMatches(values, expression, true);
    case 'fuzzy':
      return values.some((value) => fuzzyMatches(value, expression));
    case 'not_fuzzy':
      return values.every((value) => !fuzzyMatches(value, expression));
    default:
      return false;
  }
}

function dateFilterMatches(file, filter) {
  const value = typeof file?.[filter.term] === 'string' ? file[filter.term] : '';
  if (!value) return false;
  if (filter.operator === 'between') {
    return value >= filter.expression.from && value <= filter.expression.to;
  }
  if (filter.operator === 'after') return value >= filter.expression;
  if (filter.operator === 'before') return value <= filter.expression;
  return false;
}

function stringValuesForTerm(file, term) {
  switch (term) {
    case 'text':
      return [file?.path, file?.name].map(stringValue);
    case 'name':
      return [stringValue(file?.name)];
    case 'path':
      return [stringValue(file?.path)];
    case 'extension':
      return [fileExtension(file?.name || file?.path || '')];
    case 'location_slug':
      return [stringValue(file?.location_slug)];
    case 'location_name':
      return [stringValue(file?.location_name)];
    case 'kind':
      return [stringValue(file?.kind)];
    default:
      return [];
  }
}

function regexMatches(values, expression, invert) {
  let regex;
  try {
    regex = new RegExp(expression);
  } catch {
    return false;
  }
  const matched = values.some((value) => regex.test(value));
  return invert ? !matched : matched;
}

function containsCaseInsensitive(value, needle) {
  return String(value || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function fuzzyMatches(value, pattern) {
  let index = 0;
  const haystack = String(value || '').toLowerCase();
  for (const character of String(pattern || '').toLowerCase()) {
    index = haystack.indexOf(character, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

function fileExtension(name) {
  const filename = String(name || '').split('/').pop() || '';
  const index = filename.lastIndexOf('.');
  return index >= 0 && index < filename.length - 1
    ? filename.slice(index + 1).toLowerCase()
    : '';
}

function normalizeExtensionExpression(value) {
  return String(value || '').trim().replace(/^\.+/, '').toLowerCase();
}

function stringValue(value) {
  return value == null ? '' : String(value);
}

function normalizeComposedFilter(filter) {
  if (!filterOperators.has(filter.operator)) return null;
  if (filter.operator === 'not') {
    const expression = normalizeSearchFilter(filter.expression);
    return expression ? { term: 'filter', operator: 'not', expression } : null;
  }
  if (!Array.isArray(filter.expression)) return null;
  const expression = filter.expression.map(normalizeSearchFilter).filter(Boolean);
  if (!expression.length) return null;
  return { term: 'filter', operator: filter.operator, expression };
}

function normalizeStringFilter(filter, validOperators) {
  if (!validOperators.has(filter.operator)) return null;
  const value = stringExpression(filter.expression);
  if (!value) return null;
  const expression = filter.term === 'extension'
    ? value.replace(/^\.+/, '').toLowerCase()
    : value;
  return expression ? { term: filter.term, operator: filter.operator, expression } : null;
}

function normalizeKindFilter(filter) {
  if (!kindOperators.has(filter.operator)) return null;
  const expression = stringExpression(filter.expression).toLowerCase();
  if (expression !== 'file' && expression !== 'dir') return null;
  return { term: 'kind', operator: filter.operator, expression };
}

function normalizeDateFilter(filter) {
  if (!dateOperators.has(filter.operator)) return null;
  if (filter.operator === 'between') {
    const expression = rangeExpression(filter.expression);
    if (!expression) return null;
    return {
      term: filter.term,
      operator: 'between',
      expression: {
        from: dateBoundary(expression.from, false),
        to: dateBoundary(expression.to, true)
      }
    };
  }
  const value = stringExpression(filter.expression);
  if (!value) return null;
  return {
    term: filter.term,
    operator: filter.operator,
    expression: dateBoundary(value, filter.operator === 'before')
  };
}

function stringExpression(expression) {
  return typeof expression === 'string' ? expression.trim() : '';
}

function rangeExpression(expression) {
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) return null;
  const from = stringExpression(expression.from);
  const to = stringExpression(expression.to);
  return from && to ? { from, to } : null;
}

function dateBoundary(value, endOfDay) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function operatorLabel(term, operator) {
  const operators = operatorsForSearchTerm(term);
  return operators.find((item) => item.value === operator)?.label || operator.replaceAll('_', ' ');
}

function composedFilterLabel(filter) {
  if (filter.operator === 'not') return `Not (${chipLabel(filter.expression)})`;
  const joiner = filter.operator === 'or' ? 'any' : 'all';
  const count = Array.isArray(filter.expression) ? filter.expression.length : 0;
  return `${joiner} of ${count} ${count === 1 ? 'rule' : 'rules'}`;
}

function displayExpression(expression) {
  if (typeof expression !== 'string') return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(expression)) return expression.slice(0, 10);
  if (expression === 'dir') return 'folder';
  return expression;
}
