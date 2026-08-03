/**
 * Builds the initial state of a fight.
 *
 * Pure function: the seed is supplied by the caller (the React layer may use
 * the real clock to generate one).
 */

import {
  DEFAULT_ENEMY_ID,
  DEFAULT_SEED,
  ENEMIES,
  MANA,
  PARTY_TEMPLATE,
  PLAYER_LEVEL,
  SPELL_ORDER,
} from '../config/gameConfig';
import { nextRange, normalizeSeed } from './random';
import type { EnemyId, GameStats, GameState, PartyMember } from './types';

/**
 * Starting party: health comes from the vanilla formulas (see `classicData.ts`),
 * never written by hand.
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
 * Creates a fresh fight.
 *
 * The first spike is scheduled straight from the seed: it is the only random
 * draw performed before the first simulation step.
 */
export function createInitialState(
  seed: number = DEFAULT_SEED,
  playerLevel: number = PLAYER_LEVEL,
  enemyId: EnemyId = DEFAULT_ENEMY_ID,
): GameState {
  const encounter = ENEMIES[enemyId];
  const initialSeed = normalizeSeed(seed);
  const firstSpike = nextRange(
    initialSeed,
    encounter.spikeDamage.minIntervalMs,
    encounter.spikeDamage.maxIntervalMs,
  );

  return {
    status: 'active',
    playerLevel,
    elapsedMs: 0,
    seed: firstSpike.seed,
    initialSeed,
    encounter,
    party: createParty(),
    selectedTargetId: PARTY_TEMPLATE[0].id,
    mana: MANA.initial,
    manaMax: MANA.max,
    gcdRemainingMs: 0,
    // No mana spent yet: the five-second rule does not apply.
    msSinceLastCastStart: MANA.fiveSecondRuleMs,
    activeCast: null,
    timers: {
      manaTickMs: MANA.tickMs,
      tankDamageMs: encounter.tankDamage.firstAtMs,
      aoeMs: encounter.aoeDamage.firstAtMs,
      spikeMs: firstSpike.value,
    },
    damageMultiplier: 1,
    feedback: [],
    nextFeedbackId: 1,
    stats: createEmptyStats(),
  };
}

/** Deep clone of a state (engine functions work on a draft). */
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
