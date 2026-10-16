import React, { useState } from 'react';
import { Plus, Check, SquarePen, Trash2, Cloud, RefreshCw } from 'lucide-react';
import { Task, partitionTasks } from '../utils/tasks';

interface TaskListProps {
  tasks: Task[];
  onAddTask: (title: string) => void;
  onToggleTask: (id: string) => void;
  onUpdateTask: (id: string, newTitle: string) => void;
  onDeleteTask: (id: string) => void;
  syncKey: string;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  onOpenSyncModal: () => void;
}

export function TaskList({
  tasks,
  onAddTask,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  syncKey,
  syncStatus,
  onOpenSyncModal,
}: TaskListProps) {
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const { pending, completed } = partitionTasks(tasks);
  const syncLabel = !syncKey
    ? 'Set up sync'
    : syncStatus === 'syncing'
      ? 'Syncing'
      : syncStatus === 'error'
        ? 'Sync error'
        : syncStatus === 'synced'
          ? 'Synced'
          : 'Sync on';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask(newTitle);
    setNewTitle('');
  };

  const handleStartEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      onUpdateTask(id, editTitle);
    }
    setEditingId(null);
  };

  return (
    <section className="w-full mt-4 pt-4 border-t border-neutral-300 dark:border-neutral-700 font-pixel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
          Tasks
        </h2>
        <button
          type="button"
          onClick={onOpenSyncModal}
          aria-label={`Open sync settings: ${syncLabel}`}
          title="Manage cross-device task sync"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs sm:text-sm uppercase font-mono-tech border border-neutral-400 dark:border-neutral-600 bg-white/70 dark:bg-neutral-800/70 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 cursor-pointer shadow-[1px_1px_0px_rgba(0,0,0,0.15)] active:translate-y-0.5 transition-all"
        >
          <Cloud className={`w-3.5 h-3.5 ${
            syncStatus === 'error' ? 'text-red-500' : syncKey ? 'text-orange-500' : 'text-neutral-400'
          }`} />
          <span>{syncLabel}</span>
          {syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin text-orange-500" />}
        </button>
      </div>

      {/* Task Creation Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 px-3 py-2 bg-transparent border border-neutral-400 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 text-lg placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-800 dark:focus:border-neutral-200 transition-colors"
        />
        <button
          type="submit"
          aria-label="Add task"
          className="p-2.5 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors cursor-pointer border border-neutral-900 dark:border-neutral-100 active:translate-y-0.5"
        >
          <Plus className="w-5 h-5" />
        </button>
      </form>

      {/* Pending Tasks List */}
      <div className="space-y-2 mb-4">
        {pending.length === 0 ? (
          <p className="text-center py-4 text-neutral-500 dark:text-neutral-400 italic text-lg sm:text-xl">
            No pending tasks. Add one above!
          </p>
        ) : (
          pending.map((task) => (
            <div
              key={task.id}
              className="group flex items-center justify-between p-2.5 border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 bg-neutral-100/50 dark:bg-neutral-800/40 transition-colors"
            >
              {editingId === task.id ? (
                <div className="flex items-center gap-2 flex-1 mr-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(task.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 text-lg bg-white dark:bg-neutral-900 border border-neutral-500 dark:border-neutral-400 text-neutral-900 dark:text-neutral-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(task.id)}
                    className="p-1.5 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 text-sm cursor-pointer"
                    aria-label="Save task edit"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Mark "${task.title}" as completed`}
                    onClick={() => onToggleTask(task.id)}
                    className="w-5 h-5 flex-shrink-0 border-2 border-neutral-600 dark:border-neutral-400 bg-transparent flex items-center justify-center cursor-pointer hover:border-neutral-900 dark:hover:border-neutral-200 transition-colors"
                  >
                    {/* Unchecked */}
                  </button>
                  <span
                    onClick={() => onToggleTask(task.id)}
                    className="text-xl sm:text-2xl text-neutral-800 dark:text-neutral-200 truncate cursor-pointer select-none"
                  >
                    {task.title}
                  </span>
                </div>
              )}

              {/* Action buttons (always visible on mobile, reveal on hover on desktop) */}
              <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStartEdit(task)}
                  aria-label={`Edit "${task.title}"`}
                  className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                >
                  <SquarePen className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Delete "${task.title}"`}
                  className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Completed Tasks List */}
      {completed.length > 0 && (
        <div className="mt-4 pt-3 border-t border-neutral-300 dark:border-neutral-700">
          <h3 className="text-xl sm:text-2xl uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
            Completed ({completed.length})
          </h3>
          <div className="space-y-2">
            {completed.map((task) => (
              <div
                key={task.id}
                className="group flex items-center justify-between p-2.5 border border-neutral-300/80 dark:border-neutral-700/80 bg-neutral-200/40 dark:bg-neutral-900/40"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={true}
                    aria-label={`Mark "${task.title}" as incomplete`}
                    onClick={() => onToggleTask(task.id)}
                    className="w-5 h-5 flex-shrink-0 border-2 border-neutral-700 dark:border-neutral-300 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 flex items-center justify-center cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <span
                    onClick={() => onToggleTask(task.id)}
                    className="text-xl sm:text-2xl text-neutral-500 dark:text-neutral-500 line-through truncate cursor-pointer select-none"
                  >
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Delete "${task.title}"`}
                    className="p-1.5 text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
