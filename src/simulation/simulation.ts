/**
 * Engine core: `stepSimulation` advances the fight by one fixed step.
 *
 * Constraints this module honours:
 *   - pure function: the input state is never mutated, a new state is returned;
 *   - no `Date.now()`, `performance.now()`, `Math.random()`, DOM or React APIs;
 *   - all randomness goes through the seed carried inside the state.
 *
 * Resolution order for events landing on the same instant:
 *   1. cast completion
 *   2. HoT ticks
 *   3. mana regeneration
 *   4. tank damage
 *   5. AoE damage
 *   6. spike
 *   7. death resolution
 *   8. wipe check
 *   9. party damage on the boss
 *   10. victory check
 *
 * Wipe is checked before victory: a mutual kill (the boss dies the same tick
 * the tank does) resolves as a wipe, and step 10 is a no-op once step 8 has
 * already ended the fight.
 */

import {
  CANCEL_MESSAGE,
  CAST_IDLE_CAP_MS,
  MANA,
  PARTY_DAMAGE,
  PLAYER_MEMBER_ID,
  RAMP,
  SPELLS,
  WIPE,
} from '../config/gameConfig';
import { applyDamageTo, applyHealTo, applySpellEffect, findMember } from './effects';
import { pruneFeedback, pushFeedback } from './feedback';
import { cloneState } from './initialState';
import { nextInt, nextRange } from './random';
import type { GameState } from './types';

/** Cumulative damage multiplier for a given fight time. */
export function computeDamageMultiplier(elapsedMs: number): number {
  const steps = Math.floor(elapsedMs / RAMP.intervalMs);
  return Math.pow(RAMP.factor, steps);
}

/** Cancels the active cast (mana and the GCD stay spent). */
export function cancelActiveCast(draft: GameState, message: string = CANCEL_MESSAGE): void {
  if (!draft.activeCast) return;
  draft.activeCast = null;
  draft.stats.castsCancelled += 1;
  pushFeedback(draft, { kind: 'message', text: message });
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
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
      // Safety net: a dead target normally cancels the cast before this point.
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
        // HoT healing goes through the same path as any other heal.
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

/**
 * Vanilla mana regeneration: one tick every 2 seconds, and the five-second rule
 * which fully suspends the spirit-based part for 5 s after any mana spend.
 */
function regenerateMana(draft: GameState, dtMs: number): void {
  draft.timers.manaTickMs -= dtMs;
  while (draft.timers.manaTickMs <= 0) {
    if (draft.msSinceLastCastStart >= MANA.fiveSecondRuleMs) {
      draft.mana = Math.min(draft.manaMax, Math.max(0, draft.mana + MANA.perTick));
    }
    draft.timers.manaTickMs += MANA.tickMs;
  }
}

function applyTankDamage(draft: GameState, dtMs: number): void {
  const { tankDamage } = draft.encounter;
  draft.timers.tankDamageMs -= dtMs;
  while (draft.timers.tankDamageMs <= 0) {
    const tank = draft.party.find((member) => member.role === 'tank');
    if (tank) {
      applyDamageTo(draft, tank, tankDamage.amount);
    }
    draft.timers.tankDamageMs += tankDamage.intervalMs;
  }
}

function applyAoeDamage(draft: GameState, dtMs: number): void {
  const { aoeDamage } = draft.encounter;
  draft.timers.aoeMs -= dtMs;
  while (draft.timers.aoeMs <= 0) {
    for (const member of draft.party) {
      if (member.alive) {
        applyDamageTo(draft, member, aoeDamage.amount);
      }
    }
    draft.timers.aoeMs += aoeDamage.intervalMs;
  }
}

function applySpikeDamage(draft: GameState, dtMs: number): void {
  const { spikeDamage } = draft.encounter;
  draft.timers.spikeMs -= dtMs;
  while (draft.timers.spikeMs <= 0) {
    const candidates = draft.party.filter((member) => member.alive && member.role !== 'tank');

    if (candidates.length > 0) {
      const pick = nextInt(draft.seed, candidates.length);
      draft.seed = pick.seed;
      applyDamageTo(draft, candidates[pick.value], spikeDamage.amount);
    }

    const interval = nextRange(draft.seed, spikeDamage.minIntervalMs, spikeDamage.maxIntervalMs);
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
    pushFeedback(draft, { kind: 'death', targetId: member.id, text: `${member.name} died` });

    if (draft.selectedTargetId === member.id) {
      draft.selectedTargetId = null;
    }
    // A cast is interrupted both when its target dies and when the healer —
    // the caster — dies. Already applied HoTs keep ticking, as in game.
    if (
      draft.activeCast &&
      (draft.activeCast.targetId === member.id || member.id === PLAYER_MEMBER_ID)
    ) {
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
  draft.outcome = 'wipe';
  cancelActiveCast(draft);
}

/**
 * The tank and the three DPS chip away at the boss; the healer never
 * contributes. A dead contributor's share is simply not dealt — no
 * make-up damage from the survivors.
 */
function applyPartyDamage(draft: GameState, dtMs: number): void {
  draft.timers.partyDamageMs -= dtMs;
  while (draft.timers.partyDamageMs <= 0) {
    const contributors = draft.party.filter(
      (member) => member.alive && member.role !== 'healer',
    ).length;
    draft.bossHp = Math.max(0, draft.bossHp - PARTY_DAMAGE.perMemberAmount * contributors);
    draft.timers.partyDamageMs += PARTY_DAMAGE.intervalMs;
  }
}

function checkVictory(draft: GameState): void {
  if (draft.status !== 'active' || draft.bossHp > 0) return;

  draft.status = 'over';
  draft.outcome = 'victory';
  cancelActiveCast(draft);
}

/* -------------------------------------------------------------------------- */
/* Loop                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Advances the simulation by exactly `dtMs` milliseconds.
 * Returns the state untouched when the fight is not active.
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
  applyPartyDamage(draft, dtMs);
  checkVictory(draft);
  pruneFeedback(draft);

  return draft;
}
