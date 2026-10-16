/**
 * Pure task list operations
 */

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export function createTask(title: string): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: title.trim(),
    completed: false,
    createdAt: Date.now(),
  };
}

export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
}

export function updateTaskTitle(tasks: Task[], id: string, newTitle: string): Task[] {
  const trimmed = newTitle.trim();
  if (!trimmed) return tasks;
  return tasks.map((task) =>
    task.id === id ? { ...task, title: trimmed } : task
  );
}

export function deleteTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id);
}

export function partitionTasks(tasks: Task[]): { pending: Task[]; completed: Task[] } {
  const pending: Task[] = [];
  const completed: Task[] = [];
  for (const t of tasks) {
    if (t.completed) {
      completed.push(t);
    } else {
      pending.push(t);
    }
  }
  return { pending, completed };
}
