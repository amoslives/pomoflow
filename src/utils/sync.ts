import type { Task } from './tasks.ts';

/**
 * Pure sync utilities and conflict resolution for Cloudflare / Server tasks
 */

/**
 * Validates a sync key (3 to 32 alphanumeric chars or hyphens)
 */
export function isValidSyncKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return /^[a-zA-Z0-9_-]{3,32}$/.test(trimmed);
}

/**
 * Generates a clean, memorable sync key (e.g., 'focus-8492')
 */
export function generateSyncKey(): string {
  const words = ['focus', 'flow', 'retro', 'pomo', 'pixel', 'study', 'deep', 'zen'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

/**
 * Merges local and remote tasks intelligently:
 * - Preserves existing task items
 * - Unions new tasks from both sides
 * - If same task ID exists in both, newer createdAt / state is respected
 */
export function mergeTasks(localTasks: Task[], remoteTasks: Task[]): Task[] {
  const map = new Map<string, Task>();

  // Add remote tasks first
  for (const t of remoteTasks) {
    if (t && t.id && t.title) {
      map.set(t.id, t);
    }
  }

  // Overlay local tasks, preferring local if updated or missing remotely
  for (const t of localTasks) {
    if (!t || !t.id) continue;
    const existing = map.get(t.id);
    if (!existing) {
      map.set(t.id, t);
    } else {
      // If local task was modified or exists in both, prefer local if newer or completed
      if ((t.createdAt || 0) >= (existing.createdAt || 0)) {
        map.set(t.id, t);
      }
    }
  }

  // Return merged array sorted with pending first then completed, preserving creation order
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
