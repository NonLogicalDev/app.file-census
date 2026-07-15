import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCommandGroups, filterCommandGroups } from './commandPaletteModel.js';

test('location command palette preserves group order and global location coverage', () => {
  const groups = buildCommandGroups('location', {
    location: { id: 'nl-backup', name: 'NLBackup', mountPath: '/Volumes/NLBackup' },
    selectedFile: { id: 'file-custom', name: 'Current_Edit_v42.mov', path: 'Edits/Current_Edit_v42.mov', hash: 'b3:custom-current-hash' },
  });
  assert.deepEqual(groups.map((group) => group.label), [
    'Current file · Current_Edit_v42.mov',
    'Locations',
    'Navigation',
    'View & menu',
  ]);
  assert.deepEqual(groups[1].commands.map((command) => command.label), [
    'NLMedia 01',
    'NLBackup',
    'Archive Cold 02',
  ]);
  assert.equal(groups[0].commands.find((command) => command.id === 'file-reveal').disabled, true);
  assert.equal(groups[0].commands.find((command) => command.id === 'file-open-folder').disabled, true);
  assert.equal(groups[0].commands.find((command) => command.id === 'file-copy-path').detail, '/Volumes/NLBackup/Edits/Current_Edit_v42.mov');
  assert.equal(groups[0].commands.find((command) => command.id === 'file-delete-check').action.fileId, 'file-custom');
  assert.deepEqual(groups[0].commands.find((command) => command.id === 'file-find-duplicates').action, {
    type: 'find-exact-duplicates',
    fileId: 'file-custom',
    name: 'Current_Edit_v42.mov',
    hash: 'b3:custom-current-hash',
    notice: 'Finding exact duplicates of Current_Edit_v42.mov.',
  });
  assert.deepEqual(groups[1].commands.map((command) => command.action.locationId), ['nl-media-01', 'nl-backup', 'archive-cold-02']);
  assert.match(groups[1].commands[0].detail, /representative scan Jul 8/);
});

test('palette token filtering ranks exact, prefix, and multi-token matches', () => {
  const groups = buildCommandGroups('location');
  const labelsFor = (query) => filterCommandGroups(groups, query).flatMap((group) => group.commands.map((command) => command.label));
  assert.deepEqual(labelsFor('nlbackup'), ['NLBackup']);
  assert.deepEqual(labelsFor('nl backup'), ['NLBackup']);
  assert.ok(labelsFor('tasks').includes('Tasks'));
  assert.ok(labelsFor('hash').includes('Copy BLAKE3 hash'));
  assert.ok(labelsFor('columns').includes('Choose visible columns'));
  assert.equal(labelsFor('copy path')[0], 'Copy full path');
  assert.equal(labelsFor('column')[0], 'Choose visible columns');
});

test('duplicate commands use the actual selected group and stage visible state actions', () => {
  const groups = buildCommandGroups('duplicates', {
    selectedGroup: { id: 'group-current', label: 'Current.psb', hash: 'b3:group-current', files: [{ path: 'Design/Current.psb' }, { path: 'Mirror/Current.psb' }] },
  });
  assert.equal(groups[0].label, 'Current duplicate group · Current.psb');
  assert.equal(groups[0].commands.find((command) => command.id === 'duplicate-expand').action.groupId, 'group-current');
  assert.equal(groups[0].commands.find((command) => command.id === 'duplicate-delete-check').action.path, 'Design/Current.psb');
  assert.equal(groups.at(-1).commands.some((command) => command.id === 'view-duplicates-tree'), true);
});

test('task commands use actual selection and gate transitions by status', () => {
  const running = buildCommandGroups('tasks', { selectedTask: { id: 'run-1', title: 'Running now', status: 'running', cancellable: true } })[0];
  assert.equal(running.label, 'Current task · Running now');
  assert.equal(running.commands.find((command) => command.id === 'task-pause').action.taskId, 'run-1');
  assert.equal(running.commands.find((command) => command.id === 'task-stop').disabled, false);

  const paused = buildCommandGroups('tasks', { selectedTask: { id: 'pause-1', title: 'Paused now', status: 'paused' } })[0];
  assert.equal(paused.commands.some((command) => command.id === 'task-resume'), true);
  assert.equal(paused.commands.find((command) => command.id === 'task-stop').disabled, false);

  const completed = buildCommandGroups('tasks', { selectedTask: { id: 'done-1', title: 'Done', status: 'completed' } })[0];
  assert.equal(completed.commands.find((command) => command.id === 'task-pause').disabled, true);
  assert.equal(completed.commands.find((command) => command.id === 'task-stop').disabled, true);

  const fixed = buildCommandGroups('tasks', { selectedTask: { id: 'fixed-1', title: 'Fixed', status: 'running', cancellable: false } })[0];
  assert.equal(fixed.commands.find((command) => command.id === 'task-stop').disabled, true);
  assert.equal(buildCommandGroups('tasks').at(-1).commands.some((command) => command.id === 'view-tasks-finished'), true);
});
