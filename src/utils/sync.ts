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
 * Canonicalizes keys so the same passphrase works regardless of letter case.
 */
export function normalizeSyncKey(key: string): string {
  return typeof key === 'string' ? key.trim().toLowerCase() : '';
}

export function isSecureSyncKey(key: string): boolean {
  return /^pf-[a-z2-7]{26}$/.test(normalizeSyncKey(key));
}

/**
 * Generates a clean, memorable sync key (e.g., 'focus-8492')
 */
export function generateSyncKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let encoded = '';
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    encoded += alphabet[(value << (5 - bits)) & 31];
  }

  return `pf-${encoded}`;
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
