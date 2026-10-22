import { normalizeTasks, type Task } from './tasks.ts';
import { normalizeFocusStats, sameStats, type FocusStats } from './stats.ts';
import { newerSettings, normalizeSettings, type SyncedSettings } from './settings.ts';

export const MAX_TASK_TITLE_LENGTH = 500;
// Leave room for row metadata under D1's 2 MB string/row limit.
export const MAX_SYNC_BYTES = 1_800_000;

export function normalizeSyncKey(key: string): string {
  return typeof key === 'string' ? key.trim().toLowerCase() : '';
}

export function isValidSyncKey(key: string): boolean {
  return /^pf2-[a-z2-7]{26}$/.test(normalizeSyncKey(key));
}

export const isSecureSyncKey = isValidSyncKey;

export function isLegacyKey(key: string): boolean {
  return /^[a-z0-9_-]{3,32}$/.test(key) && !key.startsWith('pf2-');
}

export function isLegacySecureKey(key: string): boolean {
  return /^pf-[a-z2-7]{26}$/.test(key);
}

export function extractSyncKey(input: string): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value.includes('#')) return value;
  return new URLSearchParams(value.slice(value.indexOf('#') + 1)).get('sync') || value;
}

export function generateSyncKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let encoded = '', value = 0, bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { encoded += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) encoded += alphabet[(value << (5 - bits)) & 31];
  return `pf2-${encoded}`;
}

/** Used only for an explicit legacy migration; normal sync rebases pending edits. */
export function mergeTasks(local: Task[], remote: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const task of [...remote, ...local]) {
    const previous = map.get(task.id);
    const signature = (t: Task) => `${t.deletedAt === undefined ? '0' : '1'}\0${t.completed}\0${t.title}`;
    if (!previous || task.updatedAt > previous.updatedAt
      || (task.updatedAt === previous.updatedAt && signature(task) > signature(previous))) map.set(task.id, task);
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Remote snapshots are authoritative. Only unacknowledged local edits are replayed. */
export function applyPendingTasks(remote: Task[], pending: Task[]): Task[] {
  const map = new Map(remote.filter(t => t.deletedAt === undefined).map(t => [t.id, t]));
  for (const task of pending) {
    if (task.deletedAt !== undefined) map.delete(task.id);
    else map.set(task.id, task);
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

const encoder = new TextEncoder();
export async function hashCredential(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function syncCredential(key: string): Promise<string> {
  if (!isValidSyncKey(key)) throw new Error('Use a generated encrypted pairing key.');
  // Domain separation: the server credential cannot derive the encryption key.
  return `v2-${await hashCredential(`pomoflow:auth:v2:${normalizeSyncKey(key)}`)}`;
}

async function encryptionKey(key: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`pomoflow:encryption:v2:${normalizeSyncKey(key)}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export interface EncryptedTasks { version: 2; iv: string; data: string }
function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}

export function validEncryptedTasks(value: unknown): value is EncryptedTasks {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedTasks>;
  return envelope.version === 2 && typeof envelope.iv === 'string' && /^[A-Za-z0-9+/]{16}$/.test(envelope.iv)
    && typeof envelope.data === 'string' && envelope.data.length >= 24
    && /^[A-Za-z0-9+/]+={0,2}$/.test(envelope.data) && envelope.data.length % 4 === 0
    && encoder.encode(JSON.stringify(value)).byteLength <= MAX_SYNC_BYTES;
}

/**
 * What a room holds, encrypted: the tasks, each device's own focus stats keyed by its
 * device ID, and the shared settings. Each device writes only its own stats entry.
 */
export interface SyncDocument {
  tasks: Task[];
  stats: Record<string, FocusStats>;
  settings: SyncedSettings | null;
}

export function isDeviceId(value: string): boolean {
  return /^[a-z2-7]{26}$/.test(value);
}

export function generateDeviceId(): string {
  return generateSyncKey().slice(4);
}

/** Whether this device has something to publish: its own stats, or settings changed more recently. */
export function documentChanged(remote: SyncDocument, deviceId: string, ownStats: FocusStats, settings: SyncedSettings | null): boolean {
  return (Object.keys(ownStats).length > 0 && !sameStats(remote.stats[deviceId], ownStats))
    || (settings !== null && settings.updatedAt > (remote.settings?.updatedAt ?? 0));
}

/** The document this device publishes: its own stats replace its entry, and the newer settings win. */
export function publishDocument(
  remote: SyncDocument, tasks: Task[], deviceId: string, ownStats: FocusStats, settings: SyncedSettings | null,
): SyncDocument {
  const stats = { ...remote.stats };
  if (Object.keys(ownStats).length) stats[deviceId] = ownStats;
  return { tasks, stats, settings: newerSettings(settings, remote.settings) };
}

export async function encryptDocument(key: string, document: SyncDocument): Promise<EncryptedTasks> {
  const live = document.tasks.filter(t => t.deletedAt === undefined);
  if (live.some(t => t.title.length > MAX_TASK_TITLE_LENGTH)) throw new Error('Shorten task titles to 500 characters or delete the oversized task, then sync again.');
  const plaintext = JSON.stringify({ version: 3, tasks: live, stats: document.stats, settings: document.settings });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('pomoflow:tasks:v2') }, await encryptionKey(key), encoder.encode(plaintext));
  const envelope: EncryptedTasks = { version: 2, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
  if (!validEncryptedTasks(envelope)) throw new Error('Sync storage is full. Delete some tasks and sync again. Your tasks remain on this device.');
  return envelope;
}

export async function decryptDocument(key: string, value: unknown): Promise<SyncDocument> {
  if (value === null) return { tasks: [], stats: {}, settings: null };
  if (!validEncryptedTasks(value)) throw new Error('Invalid encrypted task data.');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(value.iv), additionalData: encoder.encode('pomoflow:tasks:v2') }, await encryptionKey(key), fromBase64(value.data));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  // Rooms written before stats and settings synced hold only the task array
  const document = (Array.isArray(parsed) ? { tasks: parsed } : parsed) as Partial<Record<keyof SyncDocument, unknown>> | null;
  if (!document || typeof document !== 'object' || !Array.isArray(document.tasks)) throw new Error('Invalid decrypted task data.');
  const tasks = normalizeTasks(document.tasks);
  if (tasks.length !== document.tasks.length) throw new Error('Invalid decrypted task data.');
  const stats: Record<string, FocusStats> = {};
  if (document.stats && typeof document.stats === 'object' && !Array.isArray(document.stats)) {
    for (const [device, deviceStats] of Object.entries(document.stats)) {
      if (isDeviceId(device)) stats[device] = normalizeFocusStats(deviceStats);
    }
  }
  return { tasks: tasks.filter(t => t.deletedAt === undefined), stats, settings: normalizeSettings(document.settings) };
}

export async function decryptTasks(key: string, value: unknown): Promise<Task[]> {
  return (await decryptDocument(key, value)).tasks;
}
