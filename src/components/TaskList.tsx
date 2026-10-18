import React, { useRef, useState } from 'react';
import { Check, SquarePen, Trash2, Cloud, CloudOff, RefreshCw, X } from 'lucide-react';
import { Task, partitionTasks } from '../utils/tasks';
import { MAX_TASK_TITLE_LENGTH } from '../utils/sync';

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
  const listRef = useRef<HTMLDivElement>(null);

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
    // New tasks go to the top, so bring them into view
    listRef.current?.scrollTo({ top: 0 });
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
    <section className="groupbox w-full mt-8">
      <h2 className="groupbox-label">Tasks</h2>
      <div className="groupbox-tools">
        <button
          type="button"
          onClick={onOpenSyncModal}
          aria-label={`Open sync settings: ${syncLabel}`}
          title="Manage cross-device task sync"
          className="btn btn-sm"
        >
          {syncStatus === 'error' ? (
            <CloudOff className="w-4 h-4" strokeWidth={2.5} />
          ) : syncStatus === 'syncing' ? (
            <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={2.5} />
          ) : (
            <Cloud className="w-4 h-4" strokeWidth={2.5} />
          )}
          <span>{syncLabel}</span>
        </button>
      </div>

      {/* New task */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 mb-2">
        <input
          type="text"
          name="new-task"
          maxLength={MAX_TASK_TITLE_LENGTH}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task..."
          className="field"
        />
        <button type="submit" aria-label="Add task" className="btn">
          Add
        </button>
      </form>

      {/* Fixed height so a long list scrolls instead of stretching the window */}
      <div ref={listRef} className="task-scroll">
        {/* Pending */}
        <div>
          {pending.length === 0 ? (
            <p className="dim text-lg py-3 text-center">Nothing to do yet. Type a task above and press Return.</p>
          ) : (
            pending.map((task) => (
              <div key={task.id} className="list-row">
                {editingId === task.id ? (
                  <>
                    <input
                      type="text"
                      name="edit-task-title"
                      maxLength={MAX_TASK_TITLE_LENGTH}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(task.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="field field-sm"
                      aria-label="Edit task title"
                    />
                    <button type="button" onClick={() => handleSaveEdit(task.id)} className="btn btn-sm" aria-label="Save task edit">
                      <Check className="w-4 h-4" strokeWidth={3} />
                      <span>Save</span>
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn btn-sm btn-icon" aria-label="Cancel edit">
                      <X strokeWidth={3} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={false}
                      aria-label={`Mark "${task.title}" as completed`}
                      onClick={() => onToggleTask(task.id)}
                      className="checkbox"
                    />
                    <span
                      onClick={() => onToggleTask(task.id)}
                      className="list-title flex-1 min-w-0 break-words text-xl cursor-pointer select-none"
                    >
                      {task.title}
                    </span>
                    <div className="row-tools flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(task)}
                        aria-label={`Edit "${task.title}"`}
                        className="btn btn-icon btn-ghost"
                      >
                        <SquarePen strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        aria-label={`Delete "${task.title}"`}
                        className="btn btn-icon btn-ghost"
                      >
                        <Trash2 strokeWidth={2.5} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Completed */}
        {completed.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold">Done</h3>
              <span className="font-data text-lg dim">({completed.length})</span>
            </div>
            <div>
              {completed.map((task) => (
                <div key={task.id} className="list-row is-done">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={true}
                    aria-label={`Mark "${task.title}" as incomplete`}
                    onClick={() => onToggleTask(task.id)}
                    className="checkbox"
                  >
                    <X />
                  </button>
                  <span
                    onClick={() => onToggleTask(task.id)}
                    className="list-title flex-1 min-w-0 break-words text-xl cursor-pointer select-none"
                  >
                    {task.title}
                  </span>
                  <div className="row-tools flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      aria-label={`Delete "${task.title}"`}
                      className="btn btn-icon btn-ghost"
                    >
                      <Trash2 strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
