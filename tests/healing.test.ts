import { describe, expect, it } from 'vitest';
import { SPELLS } from '../src/config/gameConfig';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { computeStatsSummary } from '../src/simulation/selectors';
import { advance, isolateTimers, memberOf, patchMember } from './helpers';

describe('comptabilité des soins', () => {
  it('sépare soin effectif et overheal', () => {
    let state = isolateTimers(createInitialState(21));
    // Un seul membre blessé, de 100 HP exactement.
    state = patchMember(state, 'dps1', { hp: 3900 });
    state = selectTarget(state, 'dps1');

    state = castSpell(state, 'group'); // 600 fixes sur chaque membre vivant
    state = advance(state, 3000);

    const raw = 5 * SPELLS.group.healAmount;
    expect(state.stats.rawHealing).toBe(raw);
    expect(state.stats.effectiveHealing).toBe(100);
    expect(state.stats.overhealing).toBe(raw - 100);
    expect(memberOf(state, 'dps1').hp).toBe(4000);
  });

  it('ne dépasse jamais hpMax', () => {
    let state = isolateTimers(createInitialState(22));
    state = patchMember(state, 'healer', { hp: 3950 });
    state = selectTarget(state, 'healer');

    state = castSpell(state, 'greater');
    state = advance(state, 2500);

    expect(memberOf(state, 'healer').hp).toBe(4000);
    expect(state.stats.overhealing).toBeGreaterThan(0);
  });

  it('ne soigne jamais un membre mort', () => {
    let state = isolateTimers(createInitialState(23));
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });
    state = patchMember(state, 'tank', { hp: 4000 });

    state = castSpell(state, 'group');
    state = advance(state, 3000);

    expect(memberOf(state, 'dps2').hp).toBe(0);
    // 4 membres vivants soignés uniquement.
    expect(state.stats.rawHealing).toBe(4 * SPELLS.group.healAmount);
  });

  it('calcule HPS, pourcentage d’overheal et efficacité mana', () => {
    let state = isolateTimers(createInitialState(24));
    state = patchMember(state, 'dps1', { hp: 3900 });
    state = selectTarget(state, 'dps1');
    state = castSpell(state, 'group');
    state = advance(state, 10_000);

    const summary = computeStatsSummary(state);
    const raw = 5 * SPELLS.group.healAmount;

    expect(summary.durationMs).toBe(10_000);
    expect(summary.hps).toBeCloseTo(100 / 10, 6);
    expect(summary.overhealPct).toBeCloseTo(((raw - 100) / raw) * 100, 6);
    expect(summary.manaEfficiency).toBeCloseTo(100 / SPELLS.group.manaCost, 6);
    expect(summary.casts.find((cast) => cast.spellId === 'group')?.completed).toBe(1);
  });

  it('renvoie des valeurs neutres quand rien ne s’est passé', () => {
    const summary = computeStatsSummary(createInitialState(25));
    expect(summary.hps).toBe(0);
    expect(summary.overhealPct).toBe(0);
    expect(summary.manaEfficiency).toBe(0);
    expect(summary.deaths).toEqual([]);
  });
});
