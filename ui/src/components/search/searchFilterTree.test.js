import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addNodeToGroup,
  convertTermToGroup,
  createGroupNode,
  moveNodeToGroup,
  removeNode,
  setGroupOperator,
  simplifySingleChildGroup,
  toggleNodeExcluded
} from './searchFilterTree.js';

const jpgRule = { term: 'extension', operator: 'equal', expression: 'jpg' };
const pngRule = { term: 'extension', operator: 'equal', expression: 'png' };
const nameRule = { term: 'name', operator: 'substring', expression: 'invoice' };

test('adds rules and groups beneath the virtual root all group', () => {
  const filters = addNodeToGroup([], [], jpgRule);
  const grouped = addNodeToGroup(filters, [], createGroupNode('or', pngRule));
  const nested = addNodeToGroup(grouped, [1], nameRule);

  assert.deepEqual(nested, [
    jpgRule,
    {
      term: 'filter',
      operator: 'or',
      expression: [pngRule, nameRule]
    }
  ]);
});

test('toggles any node between match and exclude without changing the core node', () => {
  const excluded = toggleNodeExcluded([jpgRule], [0]);

  assert.deepEqual(excluded, [
    {
      term: 'filter',
      operator: 'not',
      expression: jpgRule
    }
  ]);
  assert.deepEqual(toggleNodeExcluded(excluded, [0]), [jpgRule]);
});

test('converts terms to groups and simplifies single-child groups while preserving exclusion', () => {
  const excluded = toggleNodeExcluded([jpgRule], [0]);
  const grouped = convertTermToGroup(excluded, [0]);
  const changedOperator = setGroupOperator(grouped, [0], 'or');

  assert.deepEqual(changedOperator, [
    {
      term: 'filter',
      operator: 'not',
      expression: {
        term: 'filter',
        operator: 'or',
        expression: [jpgRule]
      }
    }
  ]);
  assert.deepEqual(simplifySingleChildGroup(changedOperator, [0]), excluded);
});

test('removes and moves display-path nodes while keeping canonical filter arrays', () => {
  const filters = [
    jpgRule,
    createGroupNode('or', pngRule),
    nameRule
  ];

  assert.deepEqual(removeNode(filters, [1, 0]), [
    jpgRule,
    nameRule
  ]);
  assert.deepEqual(moveNodeToGroup(filters, [0], [1]), [
    {
      term: 'filter',
      operator: 'or',
      expression: [pngRule, jpgRule]
    },
    nameRule
  ]);
});
