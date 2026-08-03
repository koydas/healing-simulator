/**
 * Construction de l'état initial d'une partie.
 *
 * Fonction pure : la seed est fournie par l'appelant (la couche React peut,
 * elle, utiliser l'horloge réelle pour en générer une).
 */

import {
  AOE_DAMAGE,
  DEFAULT_SEED,
  MANA,
  PARTY_TEMPLATE,
  PLAYER_LEVEL,
  SPELL_ORDER,
  SPIKE_DAMAGE,
  TANK_DAMAGE,
} from '../config/gameConfig';
import { nextRange, normalizeSeed } from './random';
import type { GameStats, GameState, PartyMember } from './types';

/**
 * Groupe de départ : PV issus des formules vanilla (voir `classicData.ts`),
 * jamais écrits en dur.
 */
function createParty(): PartyMember[] {
  return PARTY_TEMPLATE.map((template) => ({
    id: template.id,
    name: template.name,
    role: template.role,
    race: template.race,
    classId: template.classId,
    hpMax: template.hpMax,
    hp: template.hpMax,
    alive: true,
    hots: [],
  }));
}

export function createEmptyStats(): GameStats {
  const castsStartedBySpell: Record<string, number> = {};
  const castsCompletedBySpell: Record<string, number> = {};
  for (const spellId of SPELL_ORDER) {
    castsStartedBySpell[spellId] = 0;
    castsCompletedBySpell[spellId] = 0;
  }
  return {
    rawHealing: 0,
    effectiveHealing: 0,
    overhealing: 0,
    manaSpent: 0,
    damageTaken: 0,
    castsStartedBySpell,
    castsCompletedBySpell,
    castsCancelled: 0,
    deaths: [],
  };
}

/**
 * Crée une partie neuve.
 *
 * Le premier spike est planifié immédiatement à partir de la seed : c'est le
 * seul tirage aléatoire effectué avant le premier pas de simulation.
 */
export function createInitialState(
  seed: number = DEFAULT_SEED,
  playerLevel: number = PLAYER_LEVEL,
): GameState {
  const initialSeed = normalizeSeed(seed);
  const firstSpike = nextRange(initialSeed, SPIKE_DAMAGE.minIntervalMs, SPIKE_DAMAGE.maxIntervalMs);

  return {
    status: 'active',
    playerLevel,
    elapsedMs: 0,
    seed: firstSpike.seed,
    initialSeed,
    party: createParty(),
    selectedTargetId: PARTY_TEMPLATE[0].id,
    mana: MANA.initial,
    manaMax: MANA.max,
    gcdRemainingMs: 0,
    // Aucune mana dépensée : la règle des cinq secondes ne s'applique pas.
    msSinceLastCastStart: MANA.fiveSecondRuleMs,
    activeCast: null,
    timers: {
      manaTickMs: MANA.tickMs,
      tankDamageMs: TANK_DAMAGE.firstAtMs,
      aoeMs: AOE_DAMAGE.firstAtMs,
      spikeMs: firstSpike.value,
    },
    damageMultiplier: 1,
    feedback: [],
    nextFeedbackId: 1,
    stats: createEmptyStats(),
  };
}

/** Clone profond d'un état (les fonctions du moteur travaillent sur un brouillon). */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    party: state.party.map((member) => ({
      ...member,
      hots: member.hots.map((hot) => ({ ...hot })),
    })),
    timers: { ...state.timers },
    activeCast: state.activeCast ? { ...state.activeCast } : null,
    feedback: state.feedback.slice(),
    stats: {
      ...state.stats,
      castsStartedBySpell: { ...state.stats.castsStartedBySpell },
      castsCompletedBySpell: { ...state.stats.castsCompletedBySpell },
      deaths: state.stats.deaths.slice(),
    },
  };
}
