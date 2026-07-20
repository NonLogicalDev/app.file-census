import { normalizeSearchFilter } from '../../utils/searchFilters.js';

const groupOperators = new Set(['and', 'or']);

export function normalizedRootFilters(filters) {
  return Array.isArray(filters)
    ? filters.map(normalizeSearchFilter).filter(Boolean)
    : [];
}

export function createGroupNode(operator = 'and', firstNode) {
  const normalizedOperator = groupOperators.has(operator) ? operator : 'and';
  const child = normalizeSearchFilter(firstNode);
  if (!child) return null;
  return normalizeSearchFilter({
    term: 'filter',
    operator: normalizedOperator,
    expression: [child]
  });
}

export function getDisplayNode(node) {
  const normalized = normalizeSearchFilter(node);
  if (!normalized) return null;
  const excluded = isNotNode(normalized);
  const core = excluded ? normalized.expression : normalized;
  return {
    node: core,
    excluded,
    isGroup: isMatchGroupNode(core),
    operator: isMatchGroupNode(core) ? core.operator : null,
    children: isMatchGroupNode(core) ? core.expression : []
  };
}

export function getNodeAtPath(filters, path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let children = normalizedRootFilters(filters);
  let current = null;

  for (let index = 0; index < path.length; index += 1) {
    const childIndex = path[index];
    if (!Number.isInteger(childIndex) || childIndex < 0 || childIndex >= children.length) return null;
    current = children[childIndex];
    if (index === path.length - 1) return current;

    const display = getDisplayNode(current);
    if (!display?.isGroup) return null;
    children = display.children;
  }

  return null;
}

export function addNodeToGroup(filters, groupPath, node) {
  const normalizedNode = normalizeSearchFilter(node);
  const root = normalizedRootFilters(filters);
  if (!normalizedNode) return root;

  if (!Array.isArray(groupPath) || groupPath.length === 0) {
    return [...root, normalizedNode];
  }

  return updateNodeAtPath(root, groupPath, (current) => mutateDisplayGroup(current, (group) => ({
    ...group,
    expression: [...group.expression, normalizedNode]
  })));
}

export function removeNode(filters, path) {
  if (!Array.isArray(path) || path.length === 0) return normalizedRootFilters(filters);
  return updateNodeAtPath(normalizedRootFilters(filters), path, () => null);
}

export function toggleNodeExcluded(filters, path) {
  if (!Array.isArray(path) || path.length === 0) return normalizedRootFilters(filters);
  return updateNodeAtPath(normalizedRootFilters(filters), path, (current) => {
    const normalized = normalizeSearchFilter(current);
    if (!normalized) return null;
    if (isNotNode(normalized)) return normalized.expression;
    return normalizeSearchFilter({
      term: 'filter',
      operator: 'not',
      expression: normalized
    });
  });
}

export function setGroupOperator(filters, path, operator) {
  if (!groupOperators.has(operator) || !Array.isArray(path) || path.length === 0) {
    return normalizedRootFilters(filters);
  }
  return updateNodeAtPath(normalizedRootFilters(filters), path, (current) => mutateDisplayGroup(current, (group) => ({
    ...group,
    operator
  })));
}

export function convertTermToGroup(filters, path, operator = 'and') {
  if (!Array.isArray(path) || path.length === 0) return normalizedRootFilters(filters);
  return updateNodeAtPath(normalizedRootFilters(filters), path, (current) => {
    const normalized = normalizeSearchFilter(current);
    const display = getDisplayNode(normalized);
    if (!display || display.isGroup) return normalized;

    const group = createGroupNode(operator, display.node);
    if (!group) return normalized;
    return display.excluded
      ? normalizeSearchFilter({ term: 'filter', operator: 'not', expression: group })
      : group;
  });
}

/// Replaces the term rule at `path` with a new {term, operator, expression},
/// preserving its Match/Exclude wrapper. Groups are left untouched.
export function replaceTermRule(filters, path, rule) {
  if (!Array.isArray(path) || path.length === 0) return normalizedRootFilters(filters);
  return updateNodeAtPath(normalizedRootFilters(filters), path, (current) => {
    const normalized = normalizeSearchFilter(current);
    const display = getDisplayNode(normalized);
    if (!display || display.isGroup) return normalized;
    const nextRule = normalizeSearchFilter(rule);
    if (!nextRule) return normalized;
    return display.excluded
      ? normalizeSearchFilter({ term: 'filter', operator: 'not', expression: nextRule })
      : nextRule;
  });
}

export function simplifySingleChildGroup(filters, path) {
  if (!Array.isArray(path) || path.length === 0) return normalizedRootFilters(filters);
  return updateNodeAtPath(normalizedRootFilters(filters), path, (current) => {
    const normalized = normalizeSearchFilter(current);
    const display = getDisplayNode(normalized);
    if (!display?.isGroup || display.children.length !== 1) return normalized;

    const child = display.children[0];
    return display.excluded
      ? normalizeSearchFilter({ term: 'filter', operator: 'not', expression: child })
      : child;
  });
}

export function moveNodeToGroup(filters, sourcePath, targetGroupPath) {
  const root = normalizedRootFilters(filters);
  if (!Array.isArray(sourcePath) || sourcePath.length === 0 || !Array.isArray(targetGroupPath)) return root;
  if (isPathPrefix(sourcePath, targetGroupPath)) return root;

  const node = getNodeAtPath(root, sourcePath);
  if (!node) return root;

  const adjustedTargetPath = adjustPathAfterRemoval(sourcePath, targetGroupPath);
  if (!adjustedTargetPath) return root;

  const withoutNode = removeNode(root, sourcePath);
  return addNodeToGroup(withoutNode, adjustedTargetPath, node);
}

function updateNodeAtPath(root, path, updater) {
  return updateAtPathInList(root, path, updater);
}

function updateAtPathInList(list, path, updater) {
  const [index, ...rest] = path;
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;

  const nextList = [...list];
  const current = nextList[index];
  const nextNode = rest.length === 0
    ? updater(current)
    : updateDescendant(current, rest, updater);

  const normalizedNextNode = normalizeSearchFilter(nextNode);
  if (!normalizedNextNode) {
    nextList.splice(index, 1);
  } else {
    nextList[index] = normalizedNextNode;
  }
  return nextList;
}

function updateDescendant(node, path, updater) {
  return mutateDisplayGroup(node, (group) => {
    const expression = updateAtPathInList(group.expression, path, updater);
    if (!expression.length) return null;
    return { ...group, expression };
  });
}

function mutateDisplayGroup(node, mutator) {
  const normalized = normalizeSearchFilter(node);
  const display = getDisplayNode(normalized);
  if (!display?.isGroup) return normalized;

  const nextGroup = normalizeSearchFilter(mutator(display.node));
  if (!nextGroup) return null;

  return display.excluded
    ? normalizeSearchFilter({ term: 'filter', operator: 'not', expression: nextGroup })
    : nextGroup;
}

function isNotNode(node) {
  return node?.term === 'filter' && node.operator === 'not';
}

function isMatchGroupNode(node) {
  return node?.term === 'filter' && groupOperators.has(node.operator) && Array.isArray(node.expression);
}

function adjustPathAfterRemoval(sourcePath, targetPath) {
  if (isPathPrefix(sourcePath, targetPath)) return null;
  const adjusted = [...targetPath];
  const parentDepth = sourcePath.length - 1;

  if (
    adjusted.length > parentDepth
    && pathsEqual(sourcePath.slice(0, parentDepth), adjusted.slice(0, parentDepth))
    && sourcePath[parentDepth] < adjusted[parentDepth]
  ) {
    adjusted[parentDepth] -= 1;
  }

  return adjusted;
}

function isPathPrefix(prefix, path) {
  return prefix.length <= path.length && prefix.every((part, index) => part === path[index]);
}

function pathsEqual(left, right) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}
