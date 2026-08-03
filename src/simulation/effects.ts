/**
 * Applies healing, damage and spell effects.
 *
 * Every function here mutates a *draft* state that the caller (`stepSimulation`
 * or an action) has already cloned: they never mutate shared state.
 */

import type { SpellDefinition } from '../config/gameConfig';
import { pushFeedback } from './feedback';
import { nextRandom } from './random';
import type { GameState, HotEffect, PartyMember } from './types';

/** Returns a party member by id, or `undefined`. */
export function findMember(state: GameState, id: string | null): PartyMember | undefined {
  if (!id) return undefined;
  return state.party.find((member) => member.id === id);
}

/**
 * Rolls a healing amount inside the spell's range, like in Classic
 * ("Heals your target for 46 to 56").
 *
 * The draw is uniform over the `max - min + 1` inclusive integers: rounding a
 * continuous sample instead would give each endpoint half the weight of an
 * interior value (46 and 56 at ~5% against ~10% for 47-55).
 *
 * Consumes the pseudo-random generator state as soon as the range holds more
 * than one value.
 */
export function rollHealAmount(draft: GameState, healMin: number, healMax: number): number {
  const min = Math.round(healMin);
  const max = Math.round(healMax);
  if (max <= min) return min;

  const { value, seed } = nextRandom(draft.seed);
  draft.seed = seed;
  return Math.min(max, min + Math.floor(value * (max - min + 1)));
}

/**
 * Heals a member.
 * A dead member can never receive healing.
 */
export function applyHealTo(draft: GameState, member: PartyMember, amount: number): void {
  if (!member.alive || amount <= 0) return;

  const missing = member.hpMax - member.hp;
  const effective = Math.min(amount, missing);
  const overheal = amount - effective;

  member.hp = Math.min(member.hpMax, member.hp + effective);

  draft.stats.rawHealing += amount;
  draft.stats.effectiveHealing += effective;
  draft.stats.overhealing += overheal;

  if (effective > 0) {
    pushFeedback(draft, { kind: 'heal', targetId: member.id, amount: effective });
  }
  if (overheal > 0) {
    pushFeedback(draft, { kind: 'overheal', targetId: member.id, amount: overheal });
  }
}

/**
 * Damages a living member.
 * The raw amount is multiplied by the ramp then rounded to the nearest integer.
 * Deaths are resolved separately, at the end of the simulation step.
 */
export function applyDamageTo(draft: GameState, member: PartyMember, rawAmount: number): void {
  if (!member.alive || rawAmount <= 0) return;

  const amount = Math.round(rawAmount * draft.damageMultiplier);
  const applied = Math.min(amount, member.hp);

  member.hp = Math.max(0, member.hp - amount);
  draft.stats.damageTaken += applied;

  pushFeedback(draft, { kind: 'damage', targetId: member.id, amount: applied });
}

/** Applies (or reapplies) a HoT, never stacking it. */
export function applyHot(member: PartyMember, spell: SpellDefinition): void {
  const hot: HotEffect = {
    spellId: spell.id,
    healPerTick: spell.healPerTick,
    intervalMs: spell.hotIntervalMs,
    ticksRemaining: spell.hotTicks,
    // Reapplying resets the delay: no immediate tick.
    nextTickInMs: spell.hotIntervalMs,
  };

  const existingIndex = member.hots.findIndex((entry) => entry.spellId === spell.id);
  if (existingIndex >= 0) {
    member.hots[existingIndex] = hot;
  } else {
    member.hots.push(hot);
  }
}

/**
 * Applies the effect of a finished cast.
 * The target is assumed valid (alive): deaths cancel casts.
 */
export function applySpellEffect(
  draft: GameState,
  spell: SpellDefinition,
  targetId: string | null,
): void {
  if (spell.kind === 'group') {
    // A single roll, applied to the whole party (like Prayer of Healing).
    const amount = rollHealAmount(draft, spell.healMin, spell.healMax);
    for (const member of draft.party) {
      if (member.alive) {
        applyHealTo(draft, member, amount);
      }
    }
    return;
  }

  const target = findMember(draft, targetId);
  if (!target || !target.alive) return;

  if (spell.kind === 'hot') {
    applyHot(target, spell);
    return;
  }

  const amount = rollHealAmount(draft, spell.healMin, spell.healMax);
  applyHealTo(draft, target, amount);
}
