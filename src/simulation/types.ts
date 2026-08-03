/**
 * Simulation engine types.
 *
 * This layer is fully independent from React and the DOM: it only holds
 * serializable data and pure functions.
 */

import type { ClassId, RaceId } from '../config/classicData';

export type Role = 'tank' | 'healer' | 'dps';

/** The five vanilla priest healing families (rank 1). */
export type SpellId = 'lesserHeal' | 'renew' | 'heal' | 'flashHeal' | 'prayerOfHealing';

export type GameStatus = 'active' | 'paused' | 'over';

export interface HotEffect {
  spellId: SpellId;
  healPerTick: number;
  intervalMs: number;
  ticksRemaining: number;
  /** Time left before the next tick, in milliseconds. */
  nextTickInMs: number;
}

export interface PartyMember {
  id: string;
  name: string;
  role: Role;
  race: RaceId;
  classId: ClassId;
  hpMax: number;
  hp: number;
  alive: boolean;
  hots: HotEffect[];
}

export interface ActiveCast {
  spellId: SpellId;
  targetId: string | null;
  castTimeMs: number;
  elapsedMs: number;
}

export type FeedbackKind = 'heal' | 'overheal' | 'damage' | 'death' | 'message';

export interface FeedbackEvent {
  id: number;
  kind: FeedbackKind;
  /** Member concerned, or `null` for a global message. */
  targetId: string | null;
  amount: number;
  text: string | null;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface GameStats {
  rawHealing: number;
  effectiveHealing: number;
  overhealing: number;
  manaSpent: number;
  damageTaken: number;
  castsStartedBySpell: Record<string, number>;
  castsCompletedBySpell: Record<string, number>;
  castsCancelled: number;
  /** Ids of the dead members, in chronological order. */
  deaths: string[];
}

export interface GameTimers {
  /** Time left before the next mana regeneration tick (2 s). */
  manaTickMs: number;
  /** Time left before the next hit on the tank. */
  tankDamageMs: number;
  /** Time left before the next AoE. */
  aoeMs: number;
  /** Time left before the next spike. */
  spikeMs: number;
}

export interface GameState {
  status: GameStatus;
  /**
   * Healer level: gates which spells are available.
   * The stat tables currently only cover level 1.
   */
  playerLevel: number;
  /** Simulated time elapsed, in milliseconds. */
  elapsedMs: number;
  /** Pseudo-random generator state (determinism). */
  seed: number;
  /** Seed the fight started from, kept for display and replayability. */
  initialSeed: number;
  party: PartyMember[];
  selectedTargetId: string | null;
  mana: number;
  manaMax: number;
  gcdRemainingMs: number;
  /** Time elapsed since the last accepted cast started. */
  msSinceLastCastStart: number;
  activeCast: ActiveCast | null;
  timers: GameTimers;
  damageMultiplier: number;
  feedback: FeedbackEvent[];
  nextFeedbackId: number;
  stats: GameStats;
}
