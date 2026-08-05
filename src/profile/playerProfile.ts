/**
 * The player's profile: identity (name, class), level, experience, and the
 * record against each boss.
 *
 * Pure module — it holds no storage and reads no clock, so a fight result is
 * applied by a plain `(profile, outcome) => profile` function and the whole
 * progression is testable without a DOM. Reading and writing `localStorage`
 * happens one layer up, in `profileStorage.ts` (ADR-0018).
 *
 * `level` and `xp` track the *active* class only. Switching class (ADR-0020)
 * stashes that pair under the class being left, in `otherClassProgress`, and
 * restores whatever was stashed for the class being entered — level 1, no
 * experience, the first time that class is played. The per-boss record is
 * shared across every class: it is the same player under the hood.
 */

import { xpToNextLevel } from '../config/classicData';
import {
  DEFAULT_PLAYER_CLASS,
  DEFAULT_PLAYER_NAME,
  ENEMY_ORDER,
  MAX_LEVEL,
  PLAYER_NAME_MAX_LENGTH,
  STARTING_LEVEL,
  bossXpReward,
  type PlayableClassId,
} from '../config/gameConfig';
import type { EnemyId, GameOutcome } from '../simulation/types';

export interface BossRecord {
  wins: number;
  losses: number;
}

/** A class's level and experience while it is not the active one. */
export interface ClassProgress {
  level: number;
  xp: number;
}

export interface PlayerProfile {
  name: string;
  classId: PlayableClassId;
  /** Experience accumulated *inside* the current level, for `classId`. */
  level: number;
  xp: number;
  /** Stashed level/xp for every class other than the active one. */
  otherClassProgress: Partial<Record<PlayableClassId, ClassProgress>>;
  records: Record<EnemyId, BossRecord>;
}

/** What a finished fight did to the profile — the end screen reports it. */
export interface FightReward {
  profile: PlayerProfile;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
}

export interface XpProgress {
  xp: number;
  /** Experience needed to reach the next level, or `null` at the cap. */
  required: number | null;
  /** Fill of the experience bar, in [0, 1] — 1 at the cap. */
  ratio: number;
  atMaxLevel: boolean;
}

/**
 * Trims, collapses inner whitespace and caps a name at
 * `PLAYER_NAME_MAX_LENGTH`. Used both by `renameCharacter` and by
 * `profileStorage`'s `sanitizeProfile`, so a hand-edited save and the sheet's
 * own input field are held to the same rule. An empty or non-string result
 * falls back to the default name rather than leaving the character nameless.
 */
export function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PLAYER_NAME;
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_NAME;
}

export function createEmptyProfile(): PlayerProfile {
  const records = {} as Record<EnemyId, BossRecord>;
  for (const enemyId of ENEMY_ORDER) {
    records[enemyId] = { wins: 0, losses: 0 };
  }
  return {
    name: DEFAULT_PLAYER_NAME,
    classId: DEFAULT_PLAYER_CLASS,
    level: STARTING_LEVEL,
    xp: 0,
    otherClassProgress: {},
    records,
  };
}

export function cloneProfile(profile: PlayerProfile): PlayerProfile {
  const records = {} as Record<EnemyId, BossRecord>;
  for (const enemyId of ENEMY_ORDER) {
    const record = profile.records[enemyId] ?? { wins: 0, losses: 0 };
    records[enemyId] = { ...record };
  }
  const otherClassProgress: Partial<Record<PlayableClassId, ClassProgress>> = {};
  for (const classId of Object.keys(profile.otherClassProgress) as PlayableClassId[]) {
    const progress = profile.otherClassProgress[classId];
    if (progress) otherClassProgress[classId] = { ...progress };
  }
  return {
    name: profile.name,
    classId: profile.classId,
    level: profile.level,
    xp: profile.xp,
    otherClassProgress,
    records,
  };
}

/**
 * Adds experience, levelling up as many times as the amount allows.
 *
 * The loop matters: a reward larger than the current level's requirement
 * carries over into the next one instead of being clipped. At the cap the
 * experience is dropped rather than accumulated — a level 60 character has
 * nothing left to spend it on.
 */
export function grantXp(profile: PlayerProfile, amount: number): PlayerProfile {
  const next = cloneProfile(profile);
  if (amount <= 0) return next;

  next.xp += amount;
  let required = xpToNextLevel(next.level);
  while (required !== null && next.xp >= required) {
    next.xp -= required;
    next.level += 1;
    required = xpToNextLevel(next.level);
  }
  if (next.level >= MAX_LEVEL) {
    next.level = MAX_LEVEL;
    next.xp = 0;
  }
  return next;
}

/**
 * Records the outcome of a fight: one win or one loss against that boss, and
 * the experience a victory is worth at the current level.
 */
export function applyFightOutcome(
  profile: PlayerProfile,
  enemyId: EnemyId,
  outcome: GameOutcome,
): FightReward {
  const levelBefore = profile.level;
  const victory = outcome === 'victory';
  const xpGained = victory ? bossXpReward(levelBefore) : 0;

  const scored = cloneProfile(profile);
  const record = scored.records[enemyId];
  if (victory) {
    record.wins += 1;
  } else {
    record.losses += 1;
  }

  const next = grantXp(scored, xpGained);
  return { profile: next, xpGained, levelBefore, levelAfter: next.level };
}

/** Renames the character. The name is sanitized the same way a loaded save is. */
export function renameCharacter(profile: PlayerProfile, name: string): PlayerProfile {
  const next = cloneProfile(profile);
  next.name = sanitizeName(name);
  return next;
}

/**
 * Switches the active class (ADR-0020): the class being left has its current
 * level/xp stashed in `otherClassProgress`, under its own id, and the class
 * being entered restores whatever was stashed for it — level 1 with no
 * experience the first time it is played. The per-boss record is untouched:
 * it belongs to the player, not to one class. A no-op if `classId` is already
 * the active class, so callers do not need to guard the call themselves.
 */
export function switchClass(profile: PlayerProfile, classId: PlayableClassId): PlayerProfile {
  if (classId === profile.classId) return profile;

  const next = cloneProfile(profile);
  next.otherClassProgress[profile.classId] = { level: profile.level, xp: profile.xp };

  const saved = next.otherClassProgress[classId];
  delete next.otherClassProgress[classId];
  next.classId = classId;
  next.level = saved ? saved.level : STARTING_LEVEL;
  next.xp = saved ? saved.xp : 0;
  return next;
}

export function xpProgress(profile: PlayerProfile): XpProgress {
  const required = xpToNextLevel(profile.level);
  if (required === null) {
    return { xp: profile.xp, required: null, ratio: 1, atMaxLevel: true };
  }
  return {
    xp: profile.xp,
    required,
    ratio: Math.max(0, Math.min(1, profile.xp / required)),
    atMaxLevel: false,
  };
}

/** Wins and losses across every boss. */
export function totalRecord(profile: PlayerProfile): BossRecord {
  return ENEMY_ORDER.reduce(
    (total, enemyId) => {
      const record = profile.records[enemyId];
      return { wins: total.wins + record.wins, losses: total.losses + record.losses };
    },
    { wins: 0, losses: 0 },
  );
}
