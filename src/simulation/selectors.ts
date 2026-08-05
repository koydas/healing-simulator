/**
 * Pure selectors — derived reads over the `GameState`.
 * None of these helpers mutate state or touch the DOM.
 */

import {
  DEFAULT_PLAYER_CLASS,
  GCD_MS,
  PLAYER_MEMBER_ID,
  SPELLS,
  SPELL_ORDER,
  isPlayableClass,
} from '../config/gameConfig';
import type { FeedbackEvent, GameOutcome, GameState, PartyMember, SpellId } from './types';

export function getMember(state: GameState, id: string | null): PartyMember | undefined {
  if (!id) return undefined;
  return state.party.find((member) => member.id === id);
}

export function getAliveMembers(state: GameState): PartyMember[] {
  return state.party.filter((member) => member.alive);
}

export function getHpRatio(member: PartyMember): number {
  if (member.hpMax <= 0) return 0;
  return Math.max(0, Math.min(1, member.hp / member.hpMax));
}

export function getBossHpRatio(state: GameState): number {
  if (state.encounter.hpMax <= 0) return 0;
  return Math.max(0, Math.min(1, state.bossHp / state.encounter.hpMax));
}

export function getManaRatio(state: GameState): number {
  if (state.manaMax <= 0) return 0;
  return Math.max(0, Math.min(1, state.mana / state.manaMax));
}

/** Progress of the active cast, in [0, 1]. */
export function getCastProgress(state: GameState): number {
  const cast = state.activeCast;
  if (!cast || cast.castTimeMs <= 0) return 0;
  return Math.max(0, Math.min(1, cast.elapsedMs / cast.castTimeMs));
}

/** Progress of the GCD, in [0, 1] — 1 means "GCD finished". */
export function getGcdProgress(state: GameState): number {
  if (state.gcdRemainingMs <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - state.gcdRemainingMs / GCD_MS));
}

/**
 * The HoT currently on a member, or `undefined` — Renew, Rejuvenation, or the
 * per-member tick a party-wide HoT like Tranquility applies. A member never
 * carries more than one of the same `spellId` (`applyHot` replaces rather
 * than stacks), but could in principle carry two different HoTs at once; the
 * party-frame indicator only needs to know *a* HoT is running, so the first
 * one is enough.
 */
export function getActiveHotEffect(member: PartyMember) {
  return member.hots[0];
}

/** The spell order of the class actually fighting, healer's own class first. */
function spellOrderFor(state: GameState): readonly SpellId[] {
  const healer = state.party.find((member) => member.id === PLAYER_MEMBER_ID);
  const classId = healer && isPlayableClass(healer.classId) ? healer.classId : DEFAULT_PLAYER_CLASS;
  return SPELL_ORDER[classId];
}

/** Floating feedback attached to a member. */
export function getMemberFeedback(state: GameState, memberId: string): FeedbackEvent[] {
  return state.feedback.filter((event) => event.targetId === memberId && event.kind !== 'message');
}

/** Global messages (cast refusals, cancellations, deaths). */
export function getGlobalMessages(state: GameState): FeedbackEvent[] {
  return state.feedback.filter((event) => event.kind === 'message' || event.kind === 'death');
}

/* -------------------------------------------------------------------------- */
/* Derived statistics                                                          */
/* -------------------------------------------------------------------------- */

export interface SpellCastSummary {
  spellId: SpellId;
  name: string;
  started: number;
  completed: number;
}

export interface StatsSummary {
  outcome: GameOutcome;
  durationMs: number;
  durationLabel: string;
  /** Effective healing per second. */
  hps: number;
  rawHealing: number;
  effectiveHealing: number;
  overhealing: number;
  /** Overhealing as a percentage of raw healing. */
  overhealPct: number;
  manaSpent: number;
  /** Effective healing per point of mana spent. */
  manaEfficiency: number;
  damageTaken: number;
  casts: SpellCastSummary[];
  castsCancelled: number;
  deaths: { id: string; name: string }[];
}

/** Formats a duration as `m:ss.d`. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const secondsLabel = seconds.toFixed(1).padStart(4, '0');
  return `${minutes}:${secondsLabel}`;
}

export function computeStatsSummary(state: GameState): StatsSummary {
  const { stats } = state;
  const durationMs = state.elapsedMs;
  const durationSeconds = durationMs / 1000;

  const nameById = new Map(state.party.map((member) => [member.id, member.name]));

  return {
    outcome: state.outcome,
    durationMs,
    durationLabel: formatDuration(durationMs),
    hps: durationSeconds > 0 ? stats.effectiveHealing / durationSeconds : 0,
    rawHealing: stats.rawHealing,
    effectiveHealing: stats.effectiveHealing,
    overhealing: stats.overhealing,
    overhealPct: stats.rawHealing > 0 ? (stats.overhealing / stats.rawHealing) * 100 : 0,
    manaSpent: stats.manaSpent,
    manaEfficiency: stats.manaSpent > 0 ? stats.effectiveHealing / stats.manaSpent : 0,
    damageTaken: stats.damageTaken,
    casts: spellOrderFor(state).map((spellId) => ({
      spellId,
      name: SPELLS[spellId].name,
      started: stats.castsStartedBySpell[spellId] ?? 0,
      completed: stats.castsCompletedBySpell[spellId] ?? 0,
    })),
    castsCancelled: stats.castsCancelled,
    deaths: stats.deaths.map((id) => ({ id, name: nameById.get(id) ?? id })),
  };
}
