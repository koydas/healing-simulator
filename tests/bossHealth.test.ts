import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_ORDER, PARTY_DAMAGE, TICK_MS } from '../src/config/gameConfig';
import { castSpell, checkCast, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { getBossHpRatio } from '../src/simulation/selectors';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import { isolateTimers, patchMember, patchState } from './helpers';

/** Naive automated healer: always Renew the lowest-ratio living ally. */
function playNaively(seed: number): GameState {
  let state = createInitialState(seed, 1, 'gorvath');
  let guard = 0;
  while (state.status === 'active' && guard < 20_000) {
    guard += 1;
    let target: string | null = null;
    let bestRatio = Infinity;
    for (const member of state.party) {
      if (!member.alive) continue;
      const ratio = member.hp / member.hpMax;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        target = member.id;
      }
    }
    if (target && target !== state.selectedTargetId) {
      state = selectTarget(state, target);
    }
    if (checkCast(state, 'renew').allowed) {
      state = castSpell(state, 'renew');
    }
    state = stepSimulation(state, TICK_MS);
  }
  return state;
}

describe('boss health', () => {
  it('starts at the chosen enemy’s hpMax', () => {
    for (const id of ENEMY_ORDER) {
      const state = createInitialState(1, 1, id);
      expect(state.bossHp).toBe(ENEMIES[id].hpMax);
      expect(getBossHpRatio(state)).toBe(1);
    }
  });

  it('drops by the full party share on the first tick, with everyone alive', () => {
    const base = isolateTimers(createInitialState(1));
    const state = patchState(base, { timers: { ...base.timers, partyDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    // tank + 3 dps alive, healer never contributes.
    expect(after.bossHp).toBe(state.bossHp - PARTY_DAMAGE.perMemberAmount * 4);
  });

  it('deals less damage once a DPS is dead — no make-up from the survivors', () => {
    let base = isolateTimers(createInitialState(1));
    base = patchMember(base, 'dps1', { alive: false, hp: 0 });
    const state = patchState(base, { timers: { ...base.timers, partyDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.bossHp).toBe(state.bossHp - PARTY_DAMAGE.perMemberAmount * 3);
  });

  it('the dead healer still does not contribute (nothing changes there)', () => {
    let base = isolateTimers(createInitialState(1));
    base = patchMember(base, 'healer', { alive: false, hp: 0 });
    const state = patchState(base, { timers: { ...base.timers, partyDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.bossHp).toBe(state.bossHp - PARTY_DAMAGE.perMemberAmount * 4);
  });

  it('never drops below zero', () => {
    let base = isolateTimers(createInitialState(1));
    base = patchState(base, { bossHp: 1 });
    const state = patchState(base, { timers: { ...base.timers, partyDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.bossHp).toBe(0);
  });

  it('ends the fight in victory once the boss dies, and cancels the active cast', () => {
    let base = isolateTimers(createInitialState(1));
    base = patchState(base, {
      bossHp: 1,
      activeCast: { spellId: 'heal', targetId: 'tank', castTimeMs: 1500, elapsedMs: 0 },
    });
    const state = patchState(base, { timers: { ...base.timers, partyDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.bossHp).toBe(0);
    expect(after.status).toBe('over');
    expect(after.outcome).toBe('victory');
    expect(after.activeCast).toBeNull();
    expect(after.stats.castsCancelled).toBe(1);
  });

  it('a simultaneous tank death and boss death resolves as a wipe, not a victory', () => {
    let base = isolateTimers(createInitialState(1));
    base = patchMember(base, 'tank', { hp: 1 });
    base = patchState(base, { bossHp: 1 });
    const state = patchState(base, {
      timers: { ...base.timers, tankDamageMs: TICK_MS, partyDamageMs: TICK_MS },
    });

    const after = stepSimulation(state, TICK_MS);

    expect(after.status).toBe('over');
    expect(after.outcome).toBe('wipe');
  });

  it('applies no further boss damage after the fight is over', () => {
    let base = isolateTimers(createInitialState(1));
    base = patchState(base, { status: 'over', outcome: 'wipe' });
    const state = patchState(base, { timers: { ...base.timers, partyDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after).toBe(state);
  });

  it('outcome is null while the fight is still active', () => {
    const state = createInitialState(1);
    expect(state.outcome).toBeNull();
  });

  it('reaches victory through the real cast/select/step path, not just a patched state', () => {
    const result = playNaively(101);
    expect(result.outcome).toBe('victory');
    expect(result.bossHp).toBe(0);
  });

  it('the same naive strategy can just as well end in a wipe, seed depending', () => {
    const result = playNaively(4);
    expect(result.outcome).toBe('wipe');
    expect(result.bossHp).toBeGreaterThan(0);
  });
});
