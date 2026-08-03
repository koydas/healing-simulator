import { describe, expect, it } from 'vitest';
import { GCD_MS, MANA, SPELLS, TICK_MS } from '../src/config/gameConfig';
import { cancelCast, castSpell, checkCast, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import {
  advance,
  isolateTimers,
  memberOf,
  patchMember,
  patchState,
  unlockAllSpells,
} from './helpers';

/**
 * A fight isolated from the timeline, with one wounded member so healing is
 * observable. The tank (90 HP) is the default target: at 10 HP a Lesser Heal
 * (46-56) lands in full.
 */
function woundedGame(seed = 1, targetId = 'tank', hp = 10): GameState {
  let state = isolateTimers(createInitialState(seed));
  state = patchMember(state, targetId, { hp });
  return selectTarget(state, targetId);
}

describe('spell availability at level 1', () => {
  it('only allows Lesser Heal', () => {
    const state = woundedGame();

    expect(checkCast(state, 'lesserHeal').allowed).toBe(true);
    for (const spellId of ['renew', 'heal', 'flashHeal', 'prayerOfHealing'] as const) {
      expect(checkCast(state, spellId)).toEqual({ allowed: false, reason: 'level' });
    }
  });

  it('refuses an untrained spell without spending anything', () => {
    const state = woundedGame();
    const refused = castSpell(state, 'flashHeal');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.gcdRemainingMs).toBe(0);
    expect(refused.stats.manaSpent).toBe(0);
    expect(refused.stats.castsStartedBySpell.flashHeal).toBe(0);
    expect(refused.feedback.at(-1)?.text).toBe('Level too low');
  });

  it('unlocks spells as soon as the required level is reached', () => {
    const state = patchState(woundedGame(), { playerLevel: 20, mana: 500 });

    expect(checkCast(state, 'renew').allowed).toBe(true);
    expect(checkCast(state, 'heal').allowed).toBe(true);
    expect(checkCast(state, 'flashHeal').allowed).toBe(true);
    expect(checkCast(state, 'prayerOfHealing').reason).toBe('level');
  });
});

describe('cost and global cooldown', () => {
  it('spends mana on cast start and triggers the GCD', () => {
    const state = castSpell(woundedGame(), 'lesserHeal');

    expect(state.mana).toBe(MANA.initial - SPELLS.lesserHeal.manaCost);
    expect(state.gcdRemainingMs).toBe(GCD_MS);
    expect(state.stats.manaSpent).toBe(SPELLS.lesserHeal.manaCost);
    expect(state.stats.castsStartedBySpell.lesserHeal).toBe(1);
  });

  it('applies an instant spell right away and counts it as completed', () => {
    const state = castSpell(unlockAllSpells(woundedGame()), 'renew');

    expect(state.activeCast).toBeNull();
    expect(state.stats.castsCompletedBySpell.renew).toBe(1);
    expect(memberOf(state, 'tank').hots).toHaveLength(1);
  });

  it('refuses a second spell during the GCD, without spending anything', () => {
    const first = castSpell(unlockAllSpells(woundedGame()), 'renew');
    const second = castSpell(first, 'lesserHeal');

    expect(second.mana).toBe(first.mana);
    expect(second.gcdRemainingMs).toBe(first.gcdRemainingMs);
    expect(second.stats.castsStartedBySpell.lesserHeal).toBe(0);
    expect(second.feedback.at(-1)?.text).toBe('Global cooldown');
  });

  it('refuses a spell while another cast is in progress', () => {
    let state = castSpell(unlockAllSpells(woundedGame()), 'heal'); // 3 s cast
    state = advance(state, GCD_MS);
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.activeCast?.spellId).toBe('heal');
    expect(refused.mana).toBe(state.mana);
    expect(refused.feedback.at(-1)?.text).toBe('Already casting');
  });

  it('refuses the cast without enough mana', () => {
    const state = patchState(woundedGame(), { mana: 10 });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.mana).toBe(10);
    expect(refused.gcdRemainingMs).toBe(0);
    expect(refused.activeCast).toBeNull();
    expect(refused.stats.manaSpent).toBe(0);
    expect(refused.feedback.at(-1)?.text).toBe('Not enough mana');
  });

  it('refuses the cast without a selected target', () => {
    const state = patchState(woundedGame(), { selectedTargetId: null });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.feedback.at(-1)?.text).toBe('Target required');
  });

  it('refuses the cast on a dead target', () => {
    let state = woundedGame(1, 'dps1', 50);
    state = selectTarget(state, 'dps1');
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.feedback.at(-1)?.text).toBe('Target is dead');
    expect(refused.stats.manaSpent).toBe(0);
  });

  it('accepts Prayer of Healing with no selected target', () => {
    const state = patchState(unlockAllSpells(woundedGame()), { selectedTargetId: null });
    const cast = castSpell(state, 'prayerOfHealing');

    expect(checkCast(state, 'prayerOfHealing').allowed).toBe(true);
    expect(cast.activeCast?.spellId).toBe('prayerOfHealing');
    expect(cast.activeCast?.targetId).toBeNull();
  });

  it('refuses every cast once the fight is over', () => {
    const state = patchState(woundedGame(), { status: 'over' });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.feedback.at(-1)?.text).toBe('Fight is over');
  });
});

describe('cast resolution', () => {
  it('applies healing when the cast finishes, not before', () => {
    let state = castSpell(woundedGame(), 'lesserHeal');
    state = advance(state, 1400);
    expect(memberOf(state, 'tank').hp).toBe(10);

    state = stepSimulation(state, TICK_MS);
    expect(state.activeCast).toBeNull();
    expect(memberOf(state, 'tank').hp).toBeGreaterThan(10);
    expect(state.stats.castsCompletedBySpell.lesserHeal).toBe(1);
  });

  it('rolls healing inside the Classic 46 – 56 range', () => {
    const amounts = new Set<number>();

    for (let seed = 1; seed <= 40; seed += 1) {
      let state = castSpell(woundedGame(seed), 'lesserHeal');
      state = advance(state, SPELLS.lesserHeal.castTimeMs);
      const healed = memberOf(state, 'tank').hp - 10;
      amounts.add(healed);
      expect(healed).toBeGreaterThanOrEqual(SPELLS.lesserHeal.healMin);
      expect(healed).toBeLessThanOrEqual(SPELLS.lesserHeal.healMax);
    }

    // The range is actually covered, not stuck on a single value.
    expect(amounts.size).toBeGreaterThan(3);
  });

  it('heals every living member with Prayer of Healing', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(3)));
    state = patchMember(state, 'tank', { hp: 10 });
    state = patchMember(state, 'dps1', { hp: 5 });
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });

    state = castSpell(state, 'prayerOfHealing');
    state = advance(state, SPELLS.prayerOfHealing.castTimeMs);

    // The heal (312-333) far exceeds level 1 health pools: everyone is topped
    // off, except the dead member.
    expect(memberOf(state, 'tank').hp).toBe(memberOf(state, 'tank').hpMax);
    expect(memberOf(state, 'dps1').hp).toBe(memberOf(state, 'dps1').hpMax);
    expect(memberOf(state, 'dps2').hp).toBe(0);
  });
});

describe('Renew', () => {
  const renewGame = (seed = 1) => unlockAllSpells(woundedGame(seed));

  it('does not tick immediately and ticks every 3 s', () => {
    let state = castSpell(renewGame(), 'renew');
    expect(memberOf(state, 'tank').hp).toBe(10);

    state = advance(state, 2900);
    expect(memberOf(state, 'tank').hp).toBe(10);

    state = advance(state, 100);
    expect(memberOf(state, 'tank').hp).toBe(19);

    state = advance(state, 3000);
    expect(memberOf(state, 'tank').hp).toBe(28);
  });

  it('applies exactly five ticks of 9 then falls off', () => {
    let state = castSpell(renewGame(), 'renew');
    state = advance(state, 15_000);

    expect(memberOf(state, 'tank').hp).toBe(10 + 45);
    expect(memberOf(state, 'tank').hots).toHaveLength(0);

    state = advance(state, 6000);
    expect(memberOf(state, 'tank').hp).toBe(10 + 45);
  });

  it('never stacks: reapplying resets the ticks and the delay', () => {
    let state = castSpell(renewGame(), 'renew');
    state = advance(state, 7000); // 2 ticks applied
    expect(memberOf(state, 'tank').hp).toBe(28);
    expect(memberOf(state, 'tank').hots[0].ticksRemaining).toBe(3);

    state = castSpell(state, 'renew');
    const hots = memberOf(state, 'tank').hots;
    expect(hots).toHaveLength(1);
    expect(hots[0].ticksRemaining).toBe(5);
    expect(hots[0].nextTickInMs).toBe(3000);

    // No immediate tick.
    expect(memberOf(state, 'tank').hp).toBe(28);
    state = advance(state, 2900);
    expect(memberOf(state, 'tank').hp).toBe(28);
    state = advance(state, 100);
    expect(memberOf(state, 'tank').hp).toBe(37);
  });

  it('falls off when its carrier dies', () => {
    let state = unlockAllSpells(woundedGame(1, 'dps1', 20));
    state = selectTarget(state, 'dps1');
    state = castSpell(state, 'renew');
    state = patchMember(state, 'dps1', { hp: 0 });
    state = stepSimulation(state, TICK_MS);

    expect(memberOf(state, 'dps1').alive).toBe(false);
    expect(memberOf(state, 'dps1').hots).toHaveLength(0);
  });
});

describe('cancellation and interruption', () => {
  it('keeps the mana and the GCD, and applies no healing', () => {
    let state = castSpell(woundedGame(), 'lesserHeal');
    state = advance(state, 1000);

    const cancelled = cancelCast(state);

    expect(cancelled.activeCast).toBeNull();
    expect(cancelled.mana).toBe(state.mana);
    expect(cancelled.gcdRemainingMs).toBe(GCD_MS - 1000);
    expect(memberOf(cancelled, 'tank').hp).toBe(10);
    expect(cancelled.stats.castsCancelled).toBe(1);
    expect(cancelled.stats.castsCompletedBySpell.lesserHeal).toBe(0);
  });

  it('never refunds mana', () => {
    let state = castSpell(woundedGame(), 'lesserHeal');
    state = advance(state, 500);
    const cancelled = cancelCast(state);

    expect(cancelled.stats.manaSpent).toBe(SPELLS.lesserHeal.manaCost);
    expect(cancelled.mana).toBeLessThanOrEqual(MANA.initial - SPELLS.lesserHeal.manaCost);
  });

  it('cancels the cast when its target dies', () => {
    let state = woundedGame(1, 'dps1', 40);
    state = selectTarget(state, 'dps1');
    state = castSpell(state, 'lesserHeal');
    state = patchMember(state, 'dps1', { hp: 1 });
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'dps1').alive).toBe(false);
    expect(after.activeCast).toBeNull();
    expect(after.stats.castsCancelled).toBe(1);
    expect(after.selectedTargetId).toBeNull();
  });

  it('does nothing when no cast is in progress', () => {
    const state = woundedGame();
    expect(cancelCast(state)).toBe(state);
  });
});

describe('mana regeneration (five-second rule)', () => {
  /** An isolated fight, but with the regeneration tick running. */
  function regenGame(mana = 0, msSinceLastCastStart: number = MANA.fiveSecondRuleMs): GameState {
    const base = isolateTimers(createInitialState(9));
    return patchState(base, {
      mana,
      msSinceLastCastStart,
      timers: { ...base.timers, manaTickMs: MANA.tickMs },
    });
  }

  it('regenerates in 2-second ticks outside the five-second window', () => {
    let state = regenGame();

    state = advance(state, 1900);
    expect(state.mana).toBe(0);

    state = advance(state, 100);
    expect(state.mana).toBeCloseTo(MANA.perTick, 6);

    state = advance(state, 2000);
    expect(state.mana).toBeCloseTo(2 * MANA.perTick, 6);
  });

  it('regenerates nothing during the five seconds after a mana spend', () => {
    let state = regenGame(0, 0);

    state = advance(state, 4900);
    expect(state.mana).toBe(0);

    // The 6 s tick lands once 5 s have elapsed: it counts.
    state = advance(state, 1100);
    expect(state.mana).toBeCloseTo(MANA.perTick, 6);
  });

  it('restarts the five-second rule on every accepted cast', () => {
    let state = regenGame(MANA.max);
    state = castSpell(state, 'lesserHeal');
    expect(state.msSinceLastCastStart).toBe(0);

    const manaAfterCast = state.mana;
    state = advance(state, 4000);
    expect(state.mana).toBe(manaAfterCast);
  });

  it('never exceeds maximum mana', () => {
    const state = advance(regenGame(MANA.max), 20_000);
    expect(state.mana).toBe(MANA.max);
  });
});
