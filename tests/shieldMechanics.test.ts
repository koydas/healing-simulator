/**
 * The absorb-shield mechanic introduced with the per-class spellbooks
 * (ADR-0021): a member's `shieldAmount` is consumed by incoming damage before
 * any of it reaches HP, and decays on its own after `shieldDurationMs` if
 * never fully spent.
 */
import { describe, expect, it } from 'vitest';
import { GCD_MS, SPELLS, TICK_MS } from '../src/config/gameConfig';
import { applyDamageTo } from '../src/simulation/effects';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import { advance, isolateTimers, memberOf, patchMember, patchState, unlockAllSpells } from './helpers';

/** An isolated fight with the priest's Shield unlocked. */
function shieldGame(seed = 1): GameState {
  let state = unlockAllSpells(isolateTimers(createInitialState(seed)));
  return selectTarget(state, 'tank');
}

describe('casting a shield spell', () => {
  it('grants the caster’s target an absorb pool and a duration', () => {
    const state = castSpell(shieldGame(), 'shield');
    const tank = memberOf(state, 'tank');

    expect(tank.shieldAmount).toBe(SPELLS.shield.shieldAmount);
    expect(tank.shieldMsRemaining).toBe(SPELLS.shield.shieldDurationMs);
  });

  it('is instant and counts as completed right away, like Renew', () => {
    const state = castSpell(shieldGame(), 'shield');
    expect(state.activeCast).toBeNull();
    expect(state.stats.castsCompletedBySpell.shield).toBe(1);
  });

  it('replaces rather than stacks: recasting resets the pool, it does not add to it', () => {
    let state = castSpell(shieldGame(), 'shield');
    state = patchMember(state, 'tank', { shieldAmount: 10 });
    state = advance(state, GCD_MS); // clear the GCD so the second cast is accepted
    state = castSpell(state, 'shield');

    expect(memberOf(state, 'tank').shieldAmount).toBe(SPELLS.shield.shieldAmount);
  });

  it('always targets the caster for a self-only shield (Divine Shield), never the selected ally', () => {
    let state = unlockAllSpells(
      isolateTimers(createInitialState(1, 1, 'gorvath', { name: 'Aldric', classId: 'paladin' })),
    );
    state = selectTarget(state, 'tank'); // selected ally is the tank...
    state = castSpell(state, 'divineShield'); // ...but Divine Shield is self-only

    expect(memberOf(state, 'tank').shieldAmount).toBe(0);
    expect(memberOf(state, 'healer').shieldAmount).toBe(SPELLS.divineShield.shieldAmount);
  });
});

describe('absorbing damage', () => {
  it('absorbs a hit smaller than the pool, leaving HP untouched', () => {
    let state = castSpell(shieldGame(), 'shield');
    const draft = patchState(state, {}); // a fresh draft to mutate directly
    const tank = memberOf(draft, 'tank');
    const hpBefore = tank.hp;

    applyDamageTo(draft, tank, 10);

    expect(tank.hp).toBe(hpBefore);
    expect(tank.shieldAmount).toBe(SPELLS.shield.shieldAmount - 10);
    expect(draft.feedback.at(-1)).toMatchObject({ kind: 'absorb', amount: 10 });
  });

  it('spends the whole pool and lets the remainder through once it is exceeded', () => {
    let state = castSpell(shieldGame(), 'shield');
    const draft = patchState(state, {});
    const tank = memberOf(draft, 'tank');
    const hpBefore = tank.hp;
    const overflow = 20;

    applyDamageTo(draft, tank, SPELLS.shield.shieldAmount + overflow);

    expect(tank.shieldAmount).toBe(0);
    expect(tank.hp).toBe(hpBefore - overflow);
    // Both an absorb and a damage event fire, in that order.
    const kinds = draft.feedback.slice(-2).map((event) => event.kind);
    expect(kinds).toEqual(['absorb', 'damage']);
  });

  it('applies through the real tank-damage timeline, not just a direct call', () => {
    let state = castSpell(shieldGame(), 'shield');
    const hpBefore = memberOf(state, 'tank').hp;
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'tank').hp).toBe(hpBefore);
    expect(memberOf(after, 'tank').shieldAmount).toBeLessThan(SPELLS.shield.shieldAmount);
  });
});

describe('shield decay', () => {
  it('fades on its own once the duration elapses, spent or not', () => {
    let state = castSpell(shieldGame(), 'shield');
    expect(memberOf(state, 'tank').shieldAmount).toBeGreaterThan(0);

    state = advance(state, SPELLS.shield.shieldDurationMs);

    expect(memberOf(state, 'tank').shieldAmount).toBe(0);
    expect(memberOf(state, 'tank').shieldMsRemaining).toBe(0);
  });

  it('does nothing to a member who never had a shield', () => {
    const state = advance(shieldGame(), 20_000);
    expect(memberOf(state, 'tank').shieldAmount).toBe(0);
  });

  it('is cleared outright when its carrier dies', () => {
    let state = castSpell(shieldGame(), 'shield');
    state = patchMember(state, 'tank', { hp: 0 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });
    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'tank').alive).toBe(false);
    expect(memberOf(after, 'tank').shieldAmount).toBe(0);
    expect(memberOf(after, 'tank').shieldMsRemaining).toBe(0);
  });
});

describe('a party-wide HoT (Tranquility, reflavored — ADR-0021)', () => {
  function druidGame(seed = 1): GameState {
    return unlockAllSpells(
      isolateTimers(createInitialState(seed, 1, 'gorvath', { name: 'Fern', classId: 'druid' })),
    );
  }

  it('applies the same HoT to every living member, and skips the dead', () => {
    let state = druidGame();
    state = patchMember(state, 'tank', { hp: 10 });
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });

    state = castSpell(state, 'tranquility');
    state = advance(state, SPELLS.tranquility.hotIntervalMs);

    expect(memberOf(state, 'tank').hots).toHaveLength(1);
    expect(memberOf(state, 'healer').hots).toHaveLength(1);
    expect(memberOf(state, 'dps2').hots).toHaveLength(1);
    expect(memberOf(state, 'dps1').hots).toHaveLength(0);
    expect(memberOf(state, 'tank').hp).toBe(10 + SPELLS.tranquility.healPerTick);
  });

  it('requires no target, like Prayer of Healing', () => {
    let state = patchState(druidGame(), { selectedTargetId: null });
    const cast = castSpell(state, 'tranquility');
    expect(cast.activeCast).toBeNull();
    expect(cast.stats.castsCompletedBySpell.tranquility).toBe(1);
  });
});
