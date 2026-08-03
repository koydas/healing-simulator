import { describe, expect, it } from 'vitest';
import {
  AOE_DAMAGE,
  RAMP,
  SPIKE_DAMAGE,
  TANK_DAMAGE,
  TICK_MS,
} from '../src/config/gameConfig';
import { createInitialState } from '../src/simulation/initialState';
import { computeDamageMultiplier, stepSimulation } from '../src/simulation/simulation';
import { advance, isolateTimers, memberOf, patchState } from './helpers';

const TANK_HP = 90; // Nain guerrier niveau 1
const HEALER_HP = 51; // Humain prêtre niveau 1

describe('dégâts sur le tank', () => {
  it('frappe pour la première fois au bout de la cadence vanilla (2 s)', () => {
    expect(TANK_DAMAGE.intervalMs).toBe(2000);

    let state = createInitialState(101);
    state = advance(state, TANK_DAMAGE.firstAtMs - TICK_MS);
    expect(memberOf(state, 'tank').hp).toBe(TANK_HP);

    state = advance(state, TICK_MS);
    expect(memberOf(state, 'tank').hp).toBe(TANK_HP - TANK_DAMAGE.amount);
  });

  it('frappe à chaque cycle d’attaque', () => {
    const state = advance(createInitialState(101), 3 * TANK_DAMAGE.intervalMs);
    expect(memberOf(state, 'tank').hp).toBe(TANK_HP - 3 * TANK_DAMAGE.amount);
  });

  it('ne touche que le tank', () => {
    const state = advance(createInitialState(202), TANK_DAMAGE.firstAtMs);
    expect(memberOf(state, 'healer').hp).toBe(HEALER_HP);
  });

  it('comptabilise les dégâts encaissés', () => {
    const state = advance(createInitialState(101), TANK_DAMAGE.firstAtMs);
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
    // Le tank encaisse aussi son coup de mêlée au même instant (2000 × 6).
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
    const base = isolateTimers(createInitialState(seed));
    const state = patchState(base, { timers: { ...base.timers, spikeMs: TICK_MS } });
    return stepSimulation(state, TICK_MS);
  }

  it('touche un seul membre non-tank vivant', () => {
    const state = spikeOnly(5150);
    const damaged = state.party.filter((member) => member.hp < member.hpMax);

    expect(damaged).toHaveLength(1);
    expect(damaged[0].role).not.toBe('tank');
    expect(damaged[0].hp).toBe(damaged[0].hpMax - SPIKE_DAMAGE.amount);
    expect(memberOf(state, 'tank').hp).toBe(TANK_HP);
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
    expect(targets.size).toBeGreaterThan(1);
  });

  it('replanifie le prochain spike entre 6 et 10 s', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = spikeOnly(seed);
      expect(state.timers.spikeMs).toBeGreaterThanOrEqual(SPIKE_DAMAGE.minIntervalMs);
      expect(state.timers.spikeMs).toBeLessThan(SPIKE_DAMAGE.maxIntervalMs);
    }
  });

  it('retire environ un tiers des PV d’un DPS de niveau 1', () => {
    const state = spikeOnly(5150);
    const damaged = state.party.find((member) => member.hp < member.hpMax)!;
    const share = SPIKE_DAMAGE.amount / damaged.hpMax;

    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.45);
  });

  it('ne fait rien si aucun membre non-tank n’est vivant, mais replanifie', () => {
    const base = isolateTimers(createInitialState(12));
    const state = patchState(base, {
      party: base.party.map((member) =>
        member.role === 'tank' ? member : { ...member, alive: false, hp: 0, hots: [] },
      ),
      timers: { ...base.timers, spikeMs: TICK_MS },
    });

    const after = stepSimulation(state, TICK_MS);
    expect(memberOf(after, 'tank').hp).toBe(TANK_HP);
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
    expect(memberOf(after, 'tank').hp).toBe(TANK_HP - Math.round(TANK_DAMAGE.amount * 1.15));
  });

  it('multiplie les dégâts après 60 s', () => {
    const base = isolateTimers(createInitialState(9));
    const state = patchState(base, {
      elapsedMs: 59_900,
      timers: { ...base.timers, tankDamageMs: TICK_MS },
    });

    const after = stepSimulation(state, TICK_MS);
    expect(memberOf(after, 'tank').hp).toBe(TANK_HP - Math.round(TANK_DAMAGE.amount * 1.3225));
  });
});
