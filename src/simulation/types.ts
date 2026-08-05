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

/** How a finished fight ended — `null` while `status !== 'over'`. */
export type GameOutcome = 'wipe' | 'victory' | null;

export type EnemyId = 'gorvath' | 'skarn' | 'threx';

export interface DamageEvent {
  amount: number;
  intervalMs: number;
  firstAtMs: number;
}

export interface SpikeEvent {
  amount: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

/**
 * One enemy's damage profile — copied into `GameState.encounter` at fight
 * creation so the engine can read it without importing a fixed constant. The
 * ramp stays a single shared constant (`RAMP` in `gameConfig.ts`): it is the
 * game mode's mechanic, not a property of the enemy.
 */
export interface EncounterProfile {
  id: EnemyId;
  name: string;
  subtitle: string;
  level: number;
  /** Designed health pool: no level 1 creature is a real boss, so nothing here is sourced. */
  hpMax: number;
  tankDamage: DamageEvent;
  aoeDamage: DamageEvent;
  spikeDamage: SpikeEvent;
}

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
  /** Time left before the party's next chunk of damage lands on the boss. */
  partyDamageMs: number;
}

export interface GameState {
  status: GameStatus;
  outcome: GameOutcome;
  /**
   * Level of the party for this fight, taken from the saved profile.
   * It gates which spells are available and sizes health, mana and
   * regeneration through the Classic tables (levels 1 to 60).
   */
  playerLevel: number;
  /** Simulated time elapsed, in milliseconds. */
  elapsedMs: number;
  /** Pseudo-random generator state (determinism). */
  seed: number;
  /** Seed the fight started from, kept for display and replayability. */
  initialSeed: number;
  /** Damage profile of the enemy picked on the selection screen. */
  encounter: EncounterProfile;
  /** Current boss health; starts at `encounter.hpMax`. */
  bossHp: number;
  party: PartyMember[];
  selectedTargetId: string | null;
  mana: number;
  manaMax: number;
  /**
   * Mana regenerated per 2 s tick outside the five-second rule. Carried in the
   * state because it comes from the healer's spirit at `playerLevel`, and the
   * engine must not have to look the level up to run a step.
   */
  manaRegenPerTick: number;
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
