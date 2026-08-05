/**
 * Builds the initial state of a fight.
 *
 * Pure function: the seed is supplied by the caller (the React layer may use
 * the real clock to generate one).
 */

import {
  DEFAULT_ENEMY_ID,
  DEFAULT_PLAYER_CLASS,
  DEFAULT_SEED,
  ENEMIES,
  PARTY_DAMAGE,
  SPELL_ORDER,
  STARTING_LEVEL,
  manaProfileAtLevel,
  partyTemplateAtLevel,
  type PlayableClassId,
  type PlayerIdentity,
} from '../config/gameConfig';
import { nextRange, normalizeSeed } from './random';
import type { EnemyId, GameStats, GameState, PartyMember } from './types';

/**
 * Starting party at the given level: health comes from the vanilla formulas
 * (see `classicData.ts`), never written by hand. `player` overrides the
 * healer slot's name/race/class with the saved profile's identity — see
 * `partyTemplateAtLevel`.
 */
function createParty(level: number, player?: PlayerIdentity): PartyMember[] {
  return partyTemplateAtLevel(level, player).map((template) => ({
    id: template.id,
    name: template.name,
    role: template.role,
    race: template.race,
    classId: template.classId,
    hpMax: template.hpMax,
    hp: template.hpMax,
    alive: true,
    hots: [],
    shieldAmount: 0,
    shieldMsRemaining: 0,
  }));
}

/** `classId` picks which of the three per-class spellbooks the stats track. */
export function createEmptyStats(classId: PlayableClassId = DEFAULT_PLAYER_CLASS): GameStats {
  const castsStartedBySpell: Record<string, number> = {};
  const castsCompletedBySpell: Record<string, number> = {};
  for (const spellId of SPELL_ORDER[classId]) {
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
 *
 * `player` carries the saved profile's editable identity (name, class —
 * ADR-0020) so the healer in this fight's party matches the character sheet.
 * Left out, the party builds Elowen the human priest, exactly as before that
 * identity was editable.
 */
export function createInitialState(
  seed: number = DEFAULT_SEED,
  playerLevel: number = STARTING_LEVEL,
  enemyId: EnemyId = DEFAULT_ENEMY_ID,
  player?: PlayerIdentity,
): GameState {
  const encounter = ENEMIES[enemyId];
  const initialSeed = normalizeSeed(seed);
  const firstSpike = nextRange(
    initialSeed,
    encounter.spikeDamage.minIntervalMs,
    encounter.spikeDamage.maxIntervalMs,
  );
  const party = partyTemplateAtLevel(playerLevel, player);
  const mana = manaProfileAtLevel(playerLevel, player);

  return {
    status: 'active',
    outcome: null,
    playerLevel,
    elapsedMs: 0,
    seed: firstSpike.seed,
    initialSeed,
    encounter,
    bossHp: encounter.hpMax,
    party: createParty(playerLevel, player),
    selectedTargetId: party[0].id,
    mana: mana.initial,
    manaMax: mana.max,
    manaRegenPerTick: mana.perTick,
    gcdRemainingMs: 0,
    // No mana spent yet: the five-second rule does not apply.
    msSinceLastCastStart: mana.fiveSecondRuleMs,
    activeCast: null,
    timers: {
      manaTickMs: mana.tickMs,
      tankDamageMs: encounter.tankDamage.firstAtMs,
      aoeMs: encounter.aoeDamage.firstAtMs,
      spikeMs: firstSpike.value,
      partyDamageMs: PARTY_DAMAGE.firstAtMs,
    },
    damageMultiplier: 1,
    feedback: [],
    nextFeedbackId: 1,
    stats: createEmptyStats(player?.classId),
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
