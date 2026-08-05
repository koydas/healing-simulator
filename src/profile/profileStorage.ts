/**
 * Persistence of the player profile in `localStorage` (ADR-0018, ADR-0020).
 *
 * The only impure part of the progression: everything it touches is validated
 * on the way in, because the stored JSON is user-editable and a corrupt level
 * or class would otherwise reach the Classic tables and throw during a fight.
 *
 * Every entry point takes the storage as an argument (defaulting to
 * `window.localStorage`) so the tests can drive it with a plain object in the
 * `node` environment, with no DOM and no mock of a global.
 */

import { xpToNextLevel } from '../config/classicData';
import {
  DEFAULT_PLAYER_CLASS,
  ENEMY_ORDER,
  MAX_LEVEL,
  PLAYABLE_CLASSES,
  STARTING_LEVEL,
  isPlayableClass,
  type PlayableClassId,
} from '../config/gameConfig';
import type { EnemyId } from '../simulation/types';
import {
  createEmptyProfile,
  sanitizeName,
  type BossRecord,
  type ClassProgress,
  type PlayerProfile,
} from './playerProfile';

/**
 * Bumping the suffix abandons an incompatible save instead of migrating it.
 * v2 adds `name`, `classId` and `otherClassProgress` (ADR-0020) — a v1 save
 * (`{ level, xp, records }`) has no `name` or `classId` to migrate from, so a
 * browser upgrading from v1 simply starts a fresh v2 profile, same as the
 * "no storage at all" case. That is a deliberate, documented consequence, not
 * an oversight — see ADR-0018's note on future incompatible shapes.
 */
export const PROFILE_STORAGE_KEY = 'healing-simulator.profile.v2';

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

function sanitizeLevel(value: unknown): number {
  const raw = typeof value === 'number' ? Math.floor(value) : STARTING_LEVEL;
  return Number.isFinite(raw) ? Math.min(MAX_LEVEL, Math.max(STARTING_LEVEL, raw)) : STARTING_LEVEL;
}

/**
 * Clips experience below the given level's requirement rather than trusting
 * it, so a hand-edited save cannot grant a level-up it did not earn.
 */
function sanitizeXp(level: number, value: unknown): number {
  const required = xpToNextLevel(level);
  const raw = sanitizeCount(value);
  return required === null ? 0 : Math.min(raw, required - 1);
}

function sanitizeClassId(value: unknown): PlayableClassId {
  return isPlayableClass(value) ? value : DEFAULT_PLAYER_CLASS;
}

/**
 * Stashed progress for every class other than the active one. Corrupt or
 * out-of-range entries are clamped the same way the active class is; an
 * unplayable class id (a stray `warrior`, a typo) is dropped rather than
 * guessed at, and an entry for the active class itself is dropped too — that
 * class's level/xp live at the top level, never duplicated here.
 */
function sanitizeOtherClassProgress(
  value: unknown,
  activeClassId: PlayableClassId,
): Partial<Record<PlayableClassId, ClassProgress>> {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const progress: Partial<Record<PlayableClassId, ClassProgress>> = {};
  for (const classId of PLAYABLE_CLASSES) {
    if (classId === activeClassId) continue;
    const entry = source[classId];
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const level = sanitizeLevel(record.level);
    progress[classId] = { level, xp: sanitizeXp(level, record.xp) };
  }
  return progress;
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
 * Rebuilds a usable profile from whatever was stored: an out-of-range level
 * is clamped, an unplayable class falls back to the default, and experience
 * beyond the current level's requirement is clipped rather than replayed as a
 * level-up, so an edited save cannot grant levels it did not earn.
 */
export function sanitizeProfile(value: unknown): PlayerProfile {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;

  const classId = sanitizeClassId(source.classId);
  const level = sanitizeLevel(source.level);
  const xp = sanitizeXp(level, source.xp);

  return {
    name: sanitizeName(source.name),
    classId,
    level,
    xp,
    otherClassProgress: sanitizeOtherClassProgress(source.otherClassProgress, classId),
    records: sanitizeRecords(source.records),
  };
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
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 2, ...profile }));
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
