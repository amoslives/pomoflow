import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, toggleTask, updateTaskTitle, deleteTask, partitionTasks, type Task } from './tasks.ts';

test('createTask creates valid task with title', () => {
  const task = createTask('Write documentation');
  assert.equal(task.title, 'Write documentation');
  assert.equal(task.completed, false);
  assert.ok(task.id.startsWith('task-'));
});

test('toggleTask toggles completion status', () => {
  const t1 = createTask('Task 1');
  const t2 = createTask('Task 2');
  const list = [t1, t2];

  const toggled = toggleTask(list, t1.id);
  assert.equal(toggled[0].completed, true);
  assert.equal(toggled[1].completed, false);

  const toggledBack = toggleTask(toggled, t1.id);
  assert.equal(toggledBack[0].completed, false);
});

test('updateTaskTitle updates title correctly', () => {
  const t1 = createTask('Old Title');
  const updated = updateTaskTitle([t1], t1.id, 'New Title');
  assert.equal(updated[0].title, 'New Title');

  // Ignored if blank
  const notUpdated = updateTaskTitle([t1], t1.id, '   ');
  assert.equal(notUpdated[0].title, 'Old Title');
});

test('deleteTask removes task by id', () => {
  const t1 = createTask('T1');
  const t2 = createTask('T2');
  const remaining = deleteTask([t1, t2], t1.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, t2.id);
});

test('partitionTasks splits pending and completed', () => {
  const t1 = createTask('T1');
  const t2 = { ...createTask('T2'), completed: true };
  const t3 = createTask('T3');

  const { pending, completed } = partitionTasks([t1, t2, t3]);
  assert.equal(pending.length, 2);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, t2.id);
});
