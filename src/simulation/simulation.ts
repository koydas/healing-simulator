/**
 * Cœur du moteur : `stepSimulation` fait avancer la partie d'un pas fixe.
 *
 * Contraintes respectées par ce module :
 *   - fonction pure : l'état d'entrée n'est jamais muté, un nouvel état est renvoyé ;
 *   - aucun `Date.now()`, `performance.now()`, `Math.random()`, DOM ou API React ;
 *   - toute l'aléatoire passe par la seed transportée dans le state.
 *
 * Ordre de résolution des événements survenant au même instant :
 *   1. complétion des casts
 *   2. ticks de HoT
 *   3. régénération de mana
 *   4. dégâts tank
 *   5. dégâts AoE
 *   6. spike
 *   7. résolution des morts
 *   8. vérification du wipe
 */

import {
  AOE_DAMAGE,
  CANCEL_MESSAGE,
  CAST_IDLE_CAP_MS,
  MANA,
  RAMP,
  SPELLS,
  SPIKE_DAMAGE,
  TANK_DAMAGE,
  WIPE,
} from '../config/gameConfig';
import { applyDamageTo, applyHealTo, applySpellEffect, findMember } from './effects';
import { pruneFeedback, pushFeedback } from './feedback';
import { cloneState } from './initialState';
import { nextInt, nextRange } from './random';
import type { GameState } from './types';

/** Multiplicateur de dégâts cumulatif pour un temps de jeu donné. */
export function computeDamageMultiplier(elapsedMs: number): number {
  const steps = Math.floor(elapsedMs / RAMP.intervalMs);
  return Math.pow(RAMP.factor, steps);
}

/** Annule le cast en cours (la mana et le GCD restent consommés). */
export function cancelActiveCast(draft: GameState, message: string = CANCEL_MESSAGE): void {
  if (!draft.activeCast) return;
  draft.activeCast = null;
  draft.stats.castsCancelled += 1;
  pushFeedback(draft, { kind: 'message', text: message });
}

/* -------------------------------------------------------------------------- */
/* Étapes                                                                      */
/* -------------------------------------------------------------------------- */

function advanceCast(draft: GameState, dtMs: number): void {
  const cast = draft.activeCast;
  if (!cast) return;

  cast.elapsedMs += dtMs;
  if (cast.elapsedMs < cast.castTimeMs) return;

  const spell = SPELLS[cast.spellId];

  if (spell.requiresTarget) {
    const target = findMember(draft, cast.targetId);
    if (!target || !target.alive) {
      // Sécurité : une cible morte annule normalement le cast avant ce point.
      cancelActiveCast(draft);
      return;
    }
  }

  draft.activeCast = null;
  applySpellEffect(draft, spell, cast.targetId);
  draft.stats.castsCompletedBySpell[spell.id] =
    (draft.stats.castsCompletedBySpell[spell.id] ?? 0) + 1;
}

function tickHots(draft: GameState, dtMs: number): void {
  for (const member of draft.party) {
    if (!member.alive || member.hots.length === 0) continue;

    for (const hot of member.hots) {
      hot.nextTickInMs -= dtMs;
      while (hot.nextTickInMs <= 0 && hot.ticksRemaining > 0) {
        // Le soin du HoT passe par le même chemin que les autres soins.
        applyHealTo(draft, member, hot.healPerTick);
        hot.ticksRemaining -= 1;
        hot.nextTickInMs += hot.intervalMs;
      }
    }

    const remaining = member.hots.filter((hot) => hot.ticksRemaining > 0);
    if (remaining.length !== member.hots.length) {
      member.hots = remaining;
    }
  }
}

function regenerateMana(draft: GameState, dtMs: number): void {
  const enhanced =
    draft.activeCast === null && draft.msSinceLastCastStart >= MANA.enhancedRegenDelayMs;
  const perSecond = enhanced ? MANA.enhancedRegenPerSecond : MANA.regenPerSecond;
  const gain = (perSecond * dtMs) / 1000;
  draft.mana = Math.min(draft.manaMax, Math.max(0, draft.mana + gain));
}

function applyTankDamage(draft: GameState, dtMs: number): void {
  draft.timers.tankDamageMs -= dtMs;
  while (draft.timers.tankDamageMs <= 0) {
    const tank = draft.party.find((member) => member.role === 'tank');
    if (tank) {
      applyDamageTo(draft, tank, TANK_DAMAGE.amount);
    }
    draft.timers.tankDamageMs += TANK_DAMAGE.intervalMs;
  }
}

function applyAoeDamage(draft: GameState, dtMs: number): void {
  draft.timers.aoeMs -= dtMs;
  while (draft.timers.aoeMs <= 0) {
    for (const member of draft.party) {
      if (member.alive) {
        applyDamageTo(draft, member, AOE_DAMAGE.amount);
      }
    }
    draft.timers.aoeMs += AOE_DAMAGE.intervalMs;
  }
}

function applySpikeDamage(draft: GameState, dtMs: number): void {
  draft.timers.spikeMs -= dtMs;
  while (draft.timers.spikeMs <= 0) {
    const candidates = draft.party.filter((member) => member.alive && member.role !== 'tank');

    if (candidates.length > 0) {
      const pick = nextInt(draft.seed, candidates.length);
      draft.seed = pick.seed;
      applyDamageTo(draft, candidates[pick.value], SPIKE_DAMAGE.amount);
    }

    const interval = nextRange(draft.seed, SPIKE_DAMAGE.minIntervalMs, SPIKE_DAMAGE.maxIntervalMs);
    draft.seed = interval.seed;
    draft.timers.spikeMs += interval.value;
  }
}

function resolveDeaths(draft: GameState): void {
  for (const member of draft.party) {
    if (!member.alive || member.hp > 0) continue;

    member.hp = 0;
    member.alive = false;
    member.hots = [];
    draft.stats.deaths.push(member.id);
    pushFeedback(draft, { kind: 'death', targetId: member.id, text: `${member.name} est mort` });

    if (draft.selectedTargetId === member.id) {
      draft.selectedTargetId = null;
    }
    if (draft.activeCast && draft.activeCast.targetId === member.id) {
      cancelActiveCast(draft);
    }
  }
}

function checkWipe(draft: GameState): void {
  const tank = draft.party.find((member) => member.role === 'tank');
  const tankDead = !tank || !tank.alive;
  const deathCount = draft.party.filter((member) => !member.alive).length;

  if (!tankDead && deathCount < WIPE.maxDeaths) return;

  draft.status = 'over';
  cancelActiveCast(draft);
}

/* -------------------------------------------------------------------------- */
/* Boucle                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fait avancer la simulation d'exactement `dtMs` millisecondes.
 * Renvoie l'état inchangé si la partie n'est pas active.
 */
export function stepSimulation(state: GameState, dtMs: number): GameState {
  if (state.status !== 'active' || dtMs <= 0) return state;

  const draft = cloneState(state);

  draft.elapsedMs += dtMs;
  draft.damageMultiplier = computeDamageMultiplier(draft.elapsedMs);
  draft.gcdRemainingMs = Math.max(0, draft.gcdRemainingMs - dtMs);
  draft.msSinceLastCastStart = Math.min(draft.msSinceLastCastStart + dtMs, CAST_IDLE_CAP_MS);

  advanceCast(draft, dtMs);
  tickHots(draft, dtMs);
  regenerateMana(draft, dtMs);
  applyTankDamage(draft, dtMs);
  applyAoeDamage(draft, dtMs);
  applySpikeDamage(draft, dtMs);
  resolveDeaths(draft);
  checkWipe(draft);
  pruneFeedback(draft);

  return draft;
}
