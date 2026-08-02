/**
 * Sélecteurs purs — lecture dérivée du `GameState`.
 * Aucun de ces helpers ne mute l'état ni ne touche au DOM.
 */

import { GCD_MS, SPELLS, SPELL_ORDER } from '../config/gameConfig';
import type { FeedbackEvent, GameState, PartyMember, SpellId } from './types';

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

export function getManaRatio(state: GameState): number {
  if (state.manaMax <= 0) return 0;
  return Math.max(0, Math.min(1, state.mana / state.manaMax));
}

/** Progression du cast en cours, dans [0, 1]. */
export function getCastProgress(state: GameState): number {
  const cast = state.activeCast;
  if (!cast || cast.castTimeMs <= 0) return 0;
  return Math.max(0, Math.min(1, cast.elapsedMs / cast.castTimeMs));
}

/** Progression du GCD, dans [0, 1] — 1 signifie « GCD terminé ». */
export function getGcdProgress(state: GameState): number {
  if (state.gcdRemainingMs <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - state.gcdRemainingMs / GCD_MS));
}

/** Renew actif sur un membre, ou `undefined`. */
export function getRenewEffect(member: PartyMember) {
  return member.hots.find((hot) => hot.spellId === 'renew');
}

/** Feedbacks flottants attachés à un membre. */
export function getMemberFeedback(state: GameState, memberId: string): FeedbackEvent[] {
  return state.feedback.filter((event) => event.targetId === memberId && event.kind !== 'message');
}

/** Messages globaux (refus de lancement, annulation, morts). */
export function getGlobalMessages(state: GameState): FeedbackEvent[] {
  return state.feedback.filter((event) => event.kind === 'message' || event.kind === 'death');
}

/* -------------------------------------------------------------------------- */
/* Statistiques dérivées                                                       */
/* -------------------------------------------------------------------------- */

export interface SpellCastSummary {
  spellId: SpellId;
  name: string;
  started: number;
  completed: number;
}

export interface StatsSummary {
  durationMs: number;
  durationLabel: string;
  /** Soin effectif par seconde. */
  hps: number;
  rawHealing: number;
  effectiveHealing: number;
  overhealing: number;
  /** Pourcentage d'overheal sur le soin brut. */
  overhealPct: number;
  manaSpent: number;
  /** Soin effectif par point de mana dépensé. */
  manaEfficiency: number;
  damageTaken: number;
  casts: SpellCastSummary[];
  castsCancelled: number;
  deaths: { id: string; name: string }[];
}

/** Formate une durée en `m:ss.d`. */
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
    casts: SPELL_ORDER.map((spellId) => ({
      spellId,
      name: SPELLS[spellId].name,
      started: stats.castsStartedBySpell[spellId] ?? 0,
      completed: stats.castsCompletedBySpell[spellId] ?? 0,
    })),
    castsCancelled: stats.castsCancelled,
    deaths: stats.deaths.map((id) => ({ id, name: nameById.get(id) ?? id })),
  };
}
