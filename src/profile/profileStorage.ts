/**
 * Persistence of the player profile in `localStorage` (ADR-0018).
 *
 * The only impure part of the progression: everything it touches is validated
 * on the way in, because the stored JSON is user-editable and a corrupt level
 * would otherwise reach the Classic tables and throw during a fight.
 *
 * Every entry point takes the storage as an argument (defaulting to
 * `window.localStorage`) so the tests can drive it with a plain object in the
 * `node` environment, with no DOM and no mock of a global.
 */

import { MAX_LEVEL, STARTING_LEVEL, ENEMY_ORDER } from '../config/gameConfig';
import { xpToNextLevel } from '../config/classicData';
import type { EnemyId } from '../simulation/types';
import { createEmptyProfile, type BossRecord, type PlayerProfile } from './playerProfile';

/** Bumping the suffix abandons an incompatible save instead of migrating it. */
export const PROFILE_STORAGE_KEY = 'healing-simulator.profile.v1';

/** The subset of the `Storage` API this module needs. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `localStorage`, or `null` when it cannot be used — server-side rendering,
 * but also Safari in private mode and browsers with storage disabled, where
 * merely reading the property throws.
 */
export function defaultProfileStorage(): ProfileStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function sanitizeRecords(value: unknown): Record<EnemyId, BossRecord> {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const records = {} as Record<EnemyId, BossRecord>;
  for (const enemyId of ENEMY_ORDER) {
    const entry = (
      typeof source[enemyId] === 'object' && source[enemyId] !== null ? source[enemyId] : {}
    ) as Record<string, unknown>;
    records[enemyId] = { wins: sanitizeCount(entry.wins), losses: sanitizeCount(entry.losses) };
  }
  return records;
}

/**
 * Rebuilds a usable profile from whatever was stored: an out-of-range level is
 * clamped, and experience beyond the current level's requirement is clipped
 * rather than replayed as a level-up, so an edited save cannot grant levels it
 * did not earn.
 */
export function sanitizeProfile(value: unknown): PlayerProfile {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;

  const rawLevel = typeof source.level === 'number' ? Math.floor(source.level) : STARTING_LEVEL;
  const level = Number.isFinite(rawLevel)
    ? Math.min(MAX_LEVEL, Math.max(STARTING_LEVEL, rawLevel))
    : STARTING_LEVEL;

  const required = xpToNextLevel(level);
  const rawXp = sanitizeCount(source.xp);
  const xp = required === null ? 0 : Math.min(rawXp, required - 1);

  return { level, xp, records: sanitizeRecords(source.records) };
}

/** Reads the saved profile, or a fresh one when there is nothing usable. */
export function loadProfile(
  storage: ProfileStorage | null = defaultProfileStorage(),
): PlayerProfile {
  if (!storage) return createEmptyProfile();
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (raw === null) return createEmptyProfile();
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    // Unreadable or invalid JSON: start over rather than crash on load.
    return createEmptyProfile();
  }
}

/** Writes the profile. A storage failure (quota, private mode) is not fatal. */
export function saveProfile(
  profile: PlayerProfile,
  storage: ProfileStorage | null = defaultProfileStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, ...profile }));
  } catch {
    // Nothing to do: the game keeps running on the in-memory profile.
  }
}

/** Deletes the save — the "Delete saved game" button of the options menu. */
export function clearProfile(storage: ProfileStorage | null = defaultProfileStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // Same as above: a failed delete must not break the screen.
  }
}
