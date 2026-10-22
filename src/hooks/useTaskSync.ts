import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeTasks, type Task } from '../utils/tasks';
import { parseStoredJson } from '../utils/storage';
import { normalizeFocusStats, type FocusStats } from '../utils/stats';
import { newerSettings, type SyncedSettings } from '../utils/settings';
import {
  applyPendingTasks, decryptDocument, documentChanged, encryptDocument, isDeviceId, isLegacyKey, isLegacySecureKey,
  isValidSyncKey, mergeTasks, normalizeSyncKey, publishDocument, syncCredential, type SyncDocument,
} from '../utils/sync';

interface LocalTasks { key: string; tasks: Task[]; pending: Task[] }
const STORAGE_KEY = 'pomodoro_sync_v2';

/** What this device shares besides tasks, and where newer shared settings from the room go. */
export interface SyncOptions {
  deviceId: string;
  ownStats: FocusStats;
  settings: SyncedSettings | null;
  onRemoteSettings: (settings: SyncedSettings) => void;
}

// The other devices' stats from the room's last copy, kept for display offline
interface PeerStats { key: string; stats: Record<string, FocusStats> }
const PEERS_KEY = 'pomodoro_peer_stats';
const NO_PEERS: Record<string, FocusStats> = {};

function readPeers(): PeerStats {
  const saved = parseStoredJson(localStorage.getItem(PEERS_KEY)) as Partial<PeerStats> | null;
  if (!saved || typeof saved.key !== 'string' || !saved.stats || typeof saved.stats !== 'object') return { key: '', stats: {} };
  const stats: Record<string, FocusStats> = {};
  for (const [device, deviceStats] of Object.entries(saved.stats)) {
    if (isDeviceId(device)) stats[device] = normalizeFocusStats(deviceStats);
  }
  return { key: saved.key, stats };
}

function initialState(): LocalTasks {
  const saved = parseStoredJson(localStorage.getItem(STORAGE_KEY)) as Partial<LocalTasks> | null;
  if (saved && typeof saved.key === 'string' && Array.isArray(saved.tasks) && Array.isArray(saved.pending)) {
    const key = normalizeSyncKey(saved.key);
    return { key: isLegacyKey(key) || isValidSyncKey(key) ? key : '', tasks: normalizeTasks(saved.tasks), pending: normalizeTasks(saved.pending) };
  }
  const key = normalizeSyncKey(localStorage.getItem('pomodoro_sync_key') || '');
  return { key: isLegacyKey(key) || isValidSyncKey(key) ? key : '',
    tasks: normalizeTasks(parseStoredJson(localStorage.getItem('pomodoro_tasks'))), pending: [] };
}

async function responseData(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not sync tasks.');
  return body;
}

export function useTaskSync(options: SyncOptions) {
  const [state, setState] = useState(initialState);
  const current = useRef(state);
  const shared = useRef(options);
  shared.current = options;
  const [peers, setPeers] = useState(readPeers);
  const epoch = useRef(0);
  const busy = useRef<number | null>(null);
  const again = useRef(false);
  const halted = useRef(false);
  const rotating = useRef(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [pendingPairKey, setPendingPairKey] = useState('');
  const [pairingError, setPairingError] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);

  const commit = useCallback((value: LocalTasks) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    localStorage.setItem('pomodoro_tasks', JSON.stringify(value.tasks));
    if (value.key) localStorage.setItem('pomodoro_sync_key', value.key);
    else localStorage.removeItem('pomodoro_sync_key');
    if (value.key !== current.current.key) { epoch.current += 1; halted.current = false; }
    current.current = value;
    setState(value);
  }, []);

  const savePeers = useCallback((value: PeerStats) => {
    if (value.key) localStorage.setItem(PEERS_KEY, JSON.stringify(value));
    else localStorage.removeItem(PEERS_KEY);
    setPeers(value);
  }, []);

  // Keep the other devices' stats, and take the room's settings when they changed more recently
  const receive = useCallback((key: string, remote: SyncDocument) => {
    const { deviceId, settings, onRemoteSettings } = shared.current;
    savePeers({ key, stats: Object.fromEntries(Object.entries(remote.stats).filter(([device]) => device !== deviceId)) });
    if (remote.settings && newerSettings(settings, remote.settings) === remote.settings && remote.settings.updatedAt !== settings?.updatedAt) {
      onRemoteSettings(remote.settings);
    }
  }, [savePeers]);

  const publish = (remote: SyncDocument, tasks: Task[]) => {
    const { deviceId, ownStats, settings } = shared.current;
    return publishDocument(remote, tasks, deviceId, ownStats, settings);
  };

  const sync = useCallback(async () => {
    const key = current.current.key;
    if (!key || halted.current || rotating.current) return;
    if (!isValidSyncKey(key)) {
      setSyncStatus('error');
      setSyncError('Legacy sync is paused. Rotate to an encrypted key, then pair your other devices again.');
      return;
    }
    const generation = epoch.current;
    if (busy.current === generation) { again.current = true; return; }
    busy.current = generation;
    const active = () => epoch.current === generation && current.current.key === key;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const credential = await syncCredential(key);
      for (let attempt = 0; attempt < 4 && active(); attempt += 1) {
        again.current = false;
        const response = await fetch('/api/tasks', { headers: { Authorization: `Bearer ${credential}` } });
        if (!active()) return;
        if (response.status === 410) halted.current = true;
        const body = await responseData(response);
        const remote = await decryptDocument(key, body.encrypted);
        if (!active()) return;
        receive(key, remote);
        const pending = [...current.current.pending];
        const merged = applyPendingTasks(remote.tasks, pending);
        const { deviceId, ownStats, settings } = shared.current;
        if (pending.length || documentChanged(remote, deviceId, ownStats, settings)) {
          const encrypted = await encryptDocument(key, publish(remote, merged));
          if (!active()) return;
          const post = await fetch('/api/tasks', { method: 'POST', headers: {
            Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json',
          }, body: JSON.stringify({ encrypted, baseRevision: body.revision }) });
          if (!active()) return;
          if (post.status === 409) continue;
          if (post.status === 410) halted.current = true;
          await responseData(post);
          if (!active()) return;
          // Edits made during this request remain pending. Object identity is a
          // local acknowledgement token; timestamps alone can collide.
          const remaining = current.current.pending.filter(task => !pending.includes(task));
          commit({ key, tasks: applyPendingTasks(merged, remaining), pending: remaining });
        } else commit({ key, tasks: merged, pending: [] });
        if (!current.current.pending.length && !again.current) {
          setSyncStatus('synced'); setLastSynced(Date.now()); return;
        }
      }
      if (active()) throw new Error('Tasks changed during sync. Pending edits are saved and will retry shortly.');
    } catch (error) {
      if (active()) {
        setSyncStatus('error');
        setSyncError(error instanceof Error ? error.message : 'Network error syncing tasks.');
      }
    } finally { if (busy.current === generation) busy.current = null; }
  }, [commit, receive]);

  useEffect(() => {
    void sync();
    const refresh = () => { if (document.visibilityState === 'visible') void sync(); };
    const interval = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [state.key, sync]);

  const updateTasks = (next: Task[]) => {
    const value = current.current;
    const old = new Map(value.tasks.map(task => [task.id, task]));
    const edits = next.filter(task => task !== old.get(task.id));
    const pending = new Map(value.pending.map(task => [task.id, task]));
    for (const task of edits) pending.set(task.id, task);
    commit({ ...value, tasks: next.filter(task => task.deletedAt === undefined), pending: value.key ? [...pending.values()] : [] });
    void sync();
  };

  const requestPair = useCallback((input: string) => {
    const key = normalizeSyncKey(input);
    if (!isValidSyncKey(key) || key === current.current.key) return;
    setPairingError(''); setPendingPairKey(key);
  }, []);

  useEffect(() => {
    const importLink = () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      const key = hash.get('sync');
      // Strip obsolete query credentials from history, but never use them.
      url.searchParams.delete('sync'); hash.delete('sync'); url.hash = hash.toString();
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      if (key) requestPair(key);
    };
    importLink();
    window.addEventListener('hashchange', importLink);
    return () => window.removeEventListener('hashchange', importLink);
  }, [requestPair]);

  const confirmPair = async (shareLocal: boolean) => {
    if (!pendingPairKey || pairingBusy) return;
    setPairingBusy(true); setPairingError('');
    try {
      const key = pendingPairKey;
      const credential = await syncCredential(key);
      const body = await responseData(await fetch('/api/tasks', { headers: { Authorization: `Bearer ${credential}` } }));
      const remote = await decryptDocument(key, body.encrypted);
      const local = current.current;
      // Switching rooms never destroys the previous local list.
      localStorage.setItem(`pomodoro_pairing_backup_${Date.now()}`, JSON.stringify(local));
      const pending = shareLocal ? local.tasks.filter(t => t.deletedAt === undefined) : [];
      commit({ key, tasks: applyPendingTasks(remote.tasks, pending), pending });
      receive(key, remote);
      setPendingPairKey(''); setLastSynced(null);
      void sync();
    } catch (error) { setPairingError(error instanceof Error ? error.message : 'Could not pair.'); }
    finally { setPairingBusy(false); }
  };

  const rotateKey = async (newKey: string): Promise<boolean> => {
    if (rotating.current) return false;
    rotating.current = true;
    setPairingBusy(true); setSyncStatus('syncing'); setSyncError(null);
    // Invalidate in-flight responses before obtaining a fresh authoritative copy.
    epoch.current += 1;
    const old = current.current;
    try {
      let tasks = old.tasks;
      // The old room's stats and settings move to the new room with the tasks
      let previous: SyncDocument = { tasks: [], stats: {}, settings: null };
      let revision: number | null = null;
      if (old.key && (isValidSyncKey(old.key) || isLegacySecureKey(old.key))) {
        const credential = isValidSyncKey(old.key) ? await syncCredential(old.key) : old.key;
        const response = await fetch('/api/tasks', { headers: { Authorization: `Bearer ${credential}` } });
        if (response.status !== 410) {
          const body = await responseData(response);
          revision = body.revision;
          if (isValidSyncKey(old.key)) {
            previous = await decryptDocument(old.key, body.encrypted);
            tasks = applyPendingTasks(previous.tasks, current.current.pending);
          } else tasks = mergeTasks(current.current.tasks, normalizeTasks(body.tasks)).filter(t => t.deletedAt === undefined);
        }
      }
      const pendingAtCopy = [...current.current.pending];
      // Persist the complete recovered list before revocation, including tasks
      // that existed only remotely. An interrupted rotation is safely retryable.
      commit({ ...current.current, tasks });
      localStorage.setItem('pomodoro_rotation_draft', JSON.stringify({ key: newKey, tasks }));
      const credential = await syncCredential(newKey);
      await responseData(await fetch('/api/tasks', { method: 'POST', headers: {
        Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify({ encrypted: await encryptDocument(newKey, publish(previous, tasks)), baseRevision: 0 }) }));
      if (old.key) {
        await responseData(await fetch('/api/tasks', { method: 'DELETE', headers: {
          Authorization: `Bearer ${isValidSyncKey(old.key) ? await syncCredential(old.key) : old.key}`,
          ...(revision === null ? {} : { 'If-Match': String(revision) }),
        } }));
      }
      const pending = current.current.pending.filter(task => !pendingAtCopy.includes(task));
      commit({ key: newKey, tasks: applyPendingTasks(tasks, pending), pending });
      receive(newKey, previous);
      localStorage.removeItem('pomodoro_rotation_draft');
      setLastSynced(Date.now()); setSyncStatus('synced');
      return true;
    } catch (error) {
      setSyncStatus('error'); setSyncError(error instanceof Error ? error.message : 'Could not rotate the pairing key.');
      return false;
    } finally { rotating.current = false; setPairingBusy(false); }
  };

  const disconnect = () => {
    commit({ ...current.current, key: '', pending: [] });
    savePeers({ key: '', stats: {} });
    setSyncStatus('idle'); setSyncError(null); setLastSynced(null);
  };
  return { tasks: state.tasks, syncKey: state.key, syncStatus, syncError, lastSynced,
    peerStats: state.key && peers.key === state.key ? peers.stats : NO_PEERS,
    updateTasks, sync, requestPair, confirmPair, rotateKey, disconnect, pendingPairKey,
    pairingError, pairingBusy, cancelPair: () => { if (!pairingBusy) setPendingPairKey(''); } };
}
