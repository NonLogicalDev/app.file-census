import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDirectoryNavigationTree,
  buildWorkspaceFileTreeRows,
  directoryPathAncestors,
  filesInDirectory
} from './directoryTree.js'

const files = [
  { id: 'root', name: 'root-note.txt', path: 'root-note.txt' },
  { id: 'one', name: 'one.mov', path: 'Projects/Alpha/one.mov' },
  { id: 'two', name: 'two.jpg', path: 'Projects/Alpha/assets/two.jpg' },
  { id: 'three', name: 'three.txt', path: 'Reference/three.txt' }
]

test('directory navigation tree never turns root or nested files into side-pane nodes', () => {
  const tree = buildDirectoryNavigationTree(files)

  assert.equal(tree.kind, 'dir')
  assert.equal(tree.name, 'Scan root')
  assert.equal(tree.fileCount, 4)
  assert.deepEqual(tree.children.map((node) => node.name), ['Projects', 'Reference'])
  assert.deepEqual(tree.children[0].children.map((node) => node.name), ['Alpha'])
  assert.deepEqual(tree.children[0].children[0].children.map((node) => node.name), ['assets'])
  assert.doesNotMatch(JSON.stringify(tree), /root-note\.txt|one\.mov|two\.jpg|three\.txt|Root files/)
  assert.deepEqual(directoryPathAncestors('Projects/Alpha/assets'), ['', 'Projects', 'Projects/Alpha', 'Projects/Alpha/assets'])
})

test('main workspace tree keeps file leaves while directory navigation remains file-free', () => {
  const tree = buildDirectoryNavigationTree(files)
  const rows = buildWorkspaceFileTreeRows(tree, files, ['', 'Projects', 'Projects/Alpha', 'Projects/Alpha/assets'])

  assert.deepEqual(rows.filter((row) => row.kind === 'dir').map((row) => row.node.path), ['', 'Projects', 'Projects/Alpha', 'Projects/Alpha/assets', 'Reference'])
  assert.deepEqual(rows.filter((row) => row.kind === 'file').map((row) => row.file.name), ['two.jpg', 'one.mov', 'root-note.txt'])
  assert.deepEqual(filesInDirectory(files, 'Projects/Alpha').map((file) => file.name), ['one.mov', 'two.jpg'])
})
