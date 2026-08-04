/**
 * The player's profile: level, experience, and the record against each boss.
 *
 * Pure module — it holds no storage and reads no clock, so a fight result is
 * applied by a plain `(profile, outcome) => profile` function and the whole
 * progression is testable without a DOM. Reading and writing `localStorage`
 * happens one layer up, in `profileStorage.ts` (ADR-0018).
 */

import { xpToNextLevel } from '../config/classicData';
import { ENEMY_ORDER, MAX_LEVEL, STARTING_LEVEL, bossXpReward } from '../config/gameConfig';
import type { EnemyId, GameOutcome } from '../simulation/types';

export interface BossRecord {
  wins: number;
  losses: number;
}

export interface PlayerProfile {
  level: number;
  /** Experience accumulated *inside* the current level. */
  xp: number;
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

export function createEmptyProfile(): PlayerProfile {
  const records = {} as Record<EnemyId, BossRecord>;
  for (const enemyId of ENEMY_ORDER) {
    records[enemyId] = { wins: 0, losses: 0 };
  }
  return { level: STARTING_LEVEL, xp: 0, records };
}

export function cloneProfile(profile: PlayerProfile): PlayerProfile {
  const records = {} as Record<EnemyId, BossRecord>;
  for (const enemyId of ENEMY_ORDER) {
    const record = profile.records[enemyId] ?? { wins: 0, losses: 0 };
    records[enemyId] = { ...record };
  }
  return { level: profile.level, xp: profile.xp, records };
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
