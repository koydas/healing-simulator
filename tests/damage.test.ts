import { describe, expect, it } from 'vitest';
import {
  AOE_DAMAGE,
  SPIKE_DAMAGE,
  TANK_DAMAGE,
  TICK_MS,
  RAMP,
} from '../src/config/gameConfig';
import { createInitialState } from '../src/simulation/initialState';
import { computeDamageMultiplier, stepSimulation } from '../src/simulation/simulation';
import { advance, isolateTimers, memberOf, patchState } from './helpers';

describe('dégâts sur le tank', () => {
  it('frappe pour la première fois à 1,5 s, pas avant', () => {
    let state = createInitialState(101);
    state = advance(state, 1400);
    expect(memberOf(state, 'tank').hp).toBe(8000);

    state = advance(state, 100);
    expect(memberOf(state, 'tank').hp).toBe(8000 - TANK_DAMAGE.amount);
  });

  it('frappe toutes les 1,5 s', () => {
    let state = createInitialState(101);
    state = advance(state, 4500);
    expect(memberOf(state, 'tank').hp).toBe(8000 - 3 * TANK_DAMAGE.amount);
  });

  it('ne touche que le tank', () => {
    const state = advance(createInitialState(202), 1500);
    expect(memberOf(state, 'healer').hp).toBe(4000);
  });

  it('comptabilise les dégâts encaissés', () => {
    const state = advance(createInitialState(101), 1500);
    expect(state.stats.damageTaken).toBe(TANK_DAMAGE.amount);
  });
});

describe('dégâts de zone', () => {
  it('frappe tous les membres vivants à 12 s', () => {
    const before = advance(createInitialState(303), 11_900);
    const hpBefore = new Map(before.party.map((member) => [member.id, member.hp]));

    const after = stepSimulation(before, TICK_MS);

    for (const member of after.party) {
      const delta = (hpBefore.get(member.id) ?? 0) - member.hp;
      expect(delta).toBeGreaterThanOrEqual(AOE_DAMAGE.amount);
    }
    // Le tank encaisse aussi son coup régulier au même instant (1500 × 8).
    expect((hpBefore.get('tank') ?? 0) - memberOf(after, 'tank').hp).toBe(
      AOE_DAMAGE.amount + TANK_DAMAGE.amount,
    );
  });

  it('ne frappe pas avant 12 s', () => {
    const state = advance(createInitialState(303), 11_900);
    for (const member of state.party) {
      if (member.role === 'tank') continue;
      // Avant la première AoE, seuls les spikes ont pu toucher les non-tanks.
      const lost = member.hpMax - member.hp;
      expect(lost % SPIKE_DAMAGE.amount).toBe(0);
    }
  });
});

describe('spikes', () => {
  function spikeOnly(seed: number) {
    let state = isolateTimers(createInitialState(seed));
    state = { ...state, timers: { ...state.timers, spikeMs: TICK_MS } };
    return stepSimulation(state, TICK_MS);
  }

  it('touche un seul membre non-tank vivant', () => {
    const state = spikeOnly(5150);
    const damaged = state.party.filter((member) => member.hp < member.hpMax);
    expect(damaged).toHaveLength(1);
    expect(damaged[0].role).not.toBe('tank');
    expect(damaged[0].hp).toBe(4000 - SPIKE_DAMAGE.amount);
    expect(memberOf(state, 'tank').hp).toBe(8000);
  });

  it('ne cible jamais le tank, quelle que soit la seed', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = spikeOnly(seed);
      const damaged = state.party.find((member) => member.hp < member.hpMax);
      expect(damaged).toBeDefined();
      targets.add(damaged!.id);
    }
    expect(targets.has('tank')).toBe(false);
    // La sélection est bien répartie sur plusieurs cibles possibles.
    expect(targets.size).toBeGreaterThan(1);
  });

  it('replanifie le prochain spike entre 6 et 10 s', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = spikeOnly(seed);
      expect(state.timers.spikeMs).toBeGreaterThanOrEqual(SPIKE_DAMAGE.minIntervalMs);
      expect(state.timers.spikeMs).toBeLessThan(SPIKE_DAMAGE.maxIntervalMs);
    }
  });

  it('ne fait rien si aucun membre non-tank n’est vivant, mais replanifie', () => {
    let state = isolateTimers(createInitialState(12));
    state = {
      ...state,
      party: state.party.map((member) =>
        member.role === 'tank' ? member : { ...member, alive: false, hp: 0, hots: [] },
      ),
      timers: { ...state.timers, spikeMs: TICK_MS },
    };

    const after = stepSimulation(state, TICK_MS);
    expect(memberOf(after, 'tank').hp).toBe(8000);
    expect(after.timers.spikeMs).toBeGreaterThanOrEqual(SPIKE_DAMAGE.minIntervalMs);
  });
});

describe('rampe de dégâts', () => {
  it('applique les paliers attendus', () => {
    expect(computeDamageMultiplier(0)).toBe(1);
    expect(computeDamageMultiplier(29_999)).toBe(1);
    expect(computeDamageMultiplier(30_000)).toBeCloseTo(1.15, 10);
    expect(computeDamageMultiplier(59_999)).toBeCloseTo(1.15, 10);
    expect(computeDamageMultiplier(60_000)).toBeCloseTo(1.3225, 10);
    expect(computeDamageMultiplier(90_000)).toBeCloseTo(Math.pow(RAMP.factor, 3), 10);
  });

  it('multiplie les dégâts tank après 30 s et arrondit à l’entier', () => {
    const base = isolateTimers(createInitialState(9));
    const state = patchState(base, {
      elapsedMs: 29_900,
      timers: { ...base.timers, tankDamageMs: TICK_MS },
    });

    const after = stepSimulation(state, TICK_MS);
    expect(after.damageMultiplier).toBeCloseTo(1.15, 10);
    expect(memberOf(after, 'tank').hp).toBe(8000 - Math.round(TANK_DAMAGE.amount * 1.15));
  });

  it('multiplie les dégâts après 60 s', () => {
    const base = isolateTimers(createInitialState(9));
    const state = patchState(base, {
      elapsedMs: 59_900,
      timers: { ...base.timers, tankDamageMs: TICK_MS },
    });

    const after = stepSimulation(state, TICK_MS);
    expect(memberOf(after, 'tank').hp).toBe(8000 - Math.round(TANK_DAMAGE.amount * 1.3225));
  });
});
