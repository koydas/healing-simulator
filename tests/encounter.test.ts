import { describe, expect, it } from 'vitest';
import { DEFAULT_ENEMY_ID, ENEMIES, ENEMY_ORDER, TICK_MS } from '../src/config/gameConfig';
import { restartGame } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import { advance, isolateTimers, memberOf, patchState } from './helpers';

describe('enemy selection', () => {
  it('lists three distinct enemies, each keyed by its own id', () => {
    expect(ENEMY_ORDER).toHaveLength(3);
    expect(new Set(ENEMY_ORDER).size).toBe(3);
    for (const id of ENEMY_ORDER) {
      expect(ENEMIES[id].id).toBe(id);
    }
  });

  it('defaults to the reference enemy when none is given', () => {
    const state = createInitialState(1);
    expect(state.encounter.id).toBe(DEFAULT_ENEMY_ID);
    expect(state.encounter).toBe(ENEMIES[DEFAULT_ENEMY_ID]);
  });

  it('carries the chosen enemy into the fight', () => {
    for (const id of ENEMY_ORDER) {
      const state = createInitialState(1, 1, id);
      expect(state.encounter).toBe(ENEMIES[id]);
      expect(state.timers.tankDamageMs).toBe(ENEMIES[id].tankDamage.firstAtMs);
      expect(state.timers.aoeMs).toBe(ENEMIES[id].aoeDamage.firstAtMs);
    }
  });

  it('applies the chosen enemy’s tank damage, not another one’s', () => {
    const tankHp = 90; // level 1 dwarf warrior

    for (const id of ENEMY_ORDER) {
      const profile = ENEMIES[id];
      const state = advance(createInitialState(11, 1, id), profile.tankDamage.firstAtMs);
      expect(memberOf(state, 'tank').hp).toBe(tankHp - profile.tankDamage.amount);
    }
  });

  it('applies the chosen enemy’s AoE amount to every living member', () => {
    for (const id of ENEMY_ORDER) {
      const profile = ENEMIES[id];
      const base = isolateTimers(createInitialState(21, 1, id));
      const before = patchState(base, { timers: { ...base.timers, aoeMs: TICK_MS } });
      const hpBefore = new Map(before.party.map((member) => [member.id, member.hp]));

      const after = stepSimulation(before, TICK_MS);

      // The melee timer is isolated away too, so every member — tank included
      // — takes only the AoE hit on this step.
      for (const member of after.party) {
        const lost = (hpBefore.get(member.id) ?? 0) - member.hp;
        expect(lost).toBe(profile.aoeDamage.amount);
      }
    }
  });

  it('reschedules the spike inside the chosen enemy’s own interval', () => {
    for (const id of ENEMY_ORDER) {
      const profile = ENEMIES[id];
      const base = isolateTimers(createInitialState(31, 1, id));
      const state = patchState(base, { timers: { ...base.timers, spikeMs: TICK_MS } });

      const after = stepSimulation(state, TICK_MS);

      expect(after.timers.spikeMs).toBeGreaterThanOrEqual(profile.spikeDamage.minIntervalMs);
      expect(after.timers.spikeMs).toBeLessThan(profile.spikeDamage.maxIntervalMs);
    }
  });

  it('restartGame starts a fresh fight against the requested enemy', () => {
    const state = restartGame(99, 'threx');
    expect(state.encounter.id).toBe('threx');
    expect(state.status).toBe('active');
  });

  it('stays deterministic per enemy: same seed and enemy replay identically', () => {
    for (const id of ENEMY_ORDER) {
      const first = advance(createInitialState(55, 1, id), 8000);
      const second = advance(createInitialState(55, 1, id), 8000);
      expect(first).toEqual(second);
    }
  });
});
