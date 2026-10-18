/**
 * Pure task list operations
 */

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export function createTask(title: string, now: number = Date.now()): Task {
  return {
    id: `task-${now}-${Math.random().toString(36).substring(2, 7)}`,
    title: title.trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function toggleTask(tasks: Task[], id: string, now: number = Date.now()): Task[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed, updatedAt: now } : task
  );
}

export function updateTaskTitle(tasks: Task[], id: string, newTitle: string, now: number = Date.now()): Task[] {
  const trimmed = newTitle.trim();
  if (!trimmed) return tasks;
  return tasks.map((task) =>
    task.id === id ? { ...task, title: trimmed, updatedAt: now } : task
  );
}

export function deleteTask(tasks: Task[], id: string, now: number = Date.now()): Task[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, title: '', updatedAt: now, deletedAt: now } : task
  );
}

export function normalizeTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): Task[] => {
    if (!item || typeof item !== 'object') return [];
    const task = item as Partial<Task>;
    if (
      typeof task.id !== 'string'
      || !task.id
      || typeof task.title !== 'string'
      || (!task.title.trim() && typeof task.deletedAt !== 'number')
      || typeof task.completed !== 'boolean'
      || typeof task.createdAt !== 'number'
      || !Number.isFinite(task.createdAt)
    ) return [];

    const updatedAt = typeof task.updatedAt === 'number' && Number.isFinite(task.updatedAt)
      ? task.updatedAt
      : task.createdAt;
    const deletedAt = typeof task.deletedAt === 'number' && Number.isFinite(task.deletedAt)
      ? task.deletedAt
      : undefined;

    return [{
      id: task.id,
      title: task.title.trim(),
      completed: task.completed,
      createdAt: task.createdAt,
      updatedAt,
      ...(deletedAt === undefined ? {} : { deletedAt }),
    }];
  });
}

export function partitionTasks(tasks: Task[]): { pending: Task[]; completed: Task[] } {
  const pending: Task[] = [];
  const completed: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt !== undefined) continue;
    if (t.completed) {
      completed.push(t);
    } else {
      pending.push(t);
    }
  }
  return { pending, completed };
}
