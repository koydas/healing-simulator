import { describe, expect, it } from 'vitest';
import { SPELLS } from '../src/config/gameConfig';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { computeStatsSummary } from '../src/simulation/selectors';
import { advance, isolateTimers, memberOf, patchMember, unlockAllSpells } from './helpers';

describe('healing accounting', () => {
  it('separates effective healing from overhealing', () => {
    // Renew ticks for exactly 9: no random roll, so the overheal on a target
    // sitting 5 HP below maximum is perfectly predictable.
    let state = unlockAllSpells(isolateTimers(createInitialState(21)));
    const tankHpMax = memberOf(state, 'tank').hpMax;
    state = patchMember(state, 'tank', { hp: tankHpMax - 5 });
    state = selectTarget(state, 'tank');

    state = castSpell(state, 'renew');
    state = advance(state, SPELLS.renew.hotIntervalMs);

    expect(memberOf(state, 'tank').hp).toBe(tankHpMax);
    expect(state.stats.rawHealing).toBe(9);
    expect(state.stats.effectiveHealing).toBe(5);
    expect(state.stats.overhealing).toBe(4);
  });

  it('never exceeds hpMax', () => {
    let state = isolateTimers(createInitialState(22));
    const hpMax = memberOf(state, 'tank').hpMax;
    state = patchMember(state, 'tank', { hp: hpMax - 2 });
    state = selectTarget(state, 'tank');

    state = castSpell(state, 'renew');
    state = advance(state, SPELLS.renew.hotIntervalMs);

    expect(memberOf(state, 'tank').hp).toBe(hpMax);
    expect(state.stats.effectiveHealing).toBe(2);
    expect(state.stats.overhealing).toBeGreaterThan(0);
    expect(state.stats.rawHealing).toBe(
      state.stats.effectiveHealing + state.stats.overhealing,
    );
  });

  it('never heals a dead member', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(23)));
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });
    state = patchMember(state, 'tank', { hp: 10 });

    state = castSpell(state, 'prayerOfHealing');
    state = advance(state, SPELLS.prayerOfHealing.castTimeMs);

    expect(memberOf(state, 'dps2').hp).toBe(0);
    // Four living members healed, nothing wasted on the dead one.
    const roll = state.stats.rawHealing / 4;
    expect(Number.isInteger(roll)).toBe(true);
    expect(roll).toBeGreaterThanOrEqual(SPELLS.prayerOfHealing.healMin);
    expect(roll).toBeLessThanOrEqual(SPELLS.prayerOfHealing.healMax);
  });

  it('computes HPS, overheal percentage and mana efficiency', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(24)));
    const tankHpMax = memberOf(state, 'tank').hpMax;
    state = patchMember(state, 'tank', { hp: tankHpMax - 5 });
    state = selectTarget(state, 'tank');

    state = castSpell(state, 'renew');
    state = advance(state, 10_000); // 3 ticks of 9: 5 effective, 22 overhealed

    const summary = computeStatsSummary(state);

    expect(summary.durationMs).toBe(10_000);
    expect(summary.rawHealing).toBe(27);
    expect(summary.effectiveHealing).toBe(5);
    expect(summary.hps).toBeCloseTo(0.5, 6);
    expect(summary.overhealPct).toBeCloseTo((22 / 27) * 100, 6);
    expect(summary.manaEfficiency).toBeCloseTo(5 / SPELLS.renew.manaCost, 6);
    expect(summary.casts.find((cast) => cast.spellId === 'renew')?.completed).toBe(1);
  });

  it('returns neutral values when nothing happened', () => {
    const summary = computeStatsSummary(createInitialState(25));
    expect(summary.hps).toBe(0);
    expect(summary.overhealPct).toBe(0);
    expect(summary.manaEfficiency).toBe(0);
    expect(summary.deaths).toEqual([]);
  });
});
