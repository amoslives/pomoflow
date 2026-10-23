/**
 * Settings that paired devices share. Theme and "Keep screen on" stay per device.
 */

export const SETTING_LIMITS = {
  workMinutes: [1, 90],
  breakMinutes: [1, 45],
  longBreakMinutes: [5, 45],
  dailyGoal: [1, 24],
} as const;

export type SettingName = keyof typeof SETTING_LIMITS;

/** The shared settings and when they last changed. The newest change wins across devices. */
export type SyncedSettings = Record<SettingName, number> & { updatedAt: number };

export function normalizeSettings(value: unknown): SyncedSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.updatedAt) || (record.updatedAt as number) <= 0) return null;
  const settings = { updatedAt: record.updatedAt as number } as SyncedSettings;
  for (const [name, [min, max]] of Object.entries(SETTING_LIMITS) as [SettingName, readonly [number, number]][]) {
    const setting = record[name];
    if (!Number.isInteger(setting) || (setting as number) < min || (setting as number) > max) return null;
    settings[name] = setting as number;
  }
  return settings;
}

/** The settings to keep: the one changed most recently. A tie keeps `remote`. */
export function newerSettings(local: SyncedSettings | null, remote: SyncedSettings | null): SyncedSettings | null {
  if (!local) return remote;
  if (!remote) return local;
  return local.updatedAt > remote.updatedAt ? local : remote;
}
