import { describe, expect, it } from 'vitest';
import { MANA, TICK_MS } from '../src/config/gameConfig';
import {
  castSpell,
  pauseGame,
  resumeGame,
  selectTarget,
  togglePause,
} from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import {
  advance,
  isolateTimers,
  memberOf,
  patchMember,
  patchState,
  totalHp,
  unlockAllSpells,
} from './helpers';

describe('conditions de wipe', () => {
  it('termine la partie à la mort du tank', () => {
    let state = isolateTimers(createInitialState(31));
    state = patchMember(state, 'tank', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'tank').alive).toBe(false);
    expect(after.status).toBe('over');
    expect(after.stats.deaths).toEqual(['tank']);
  });

  it('termine la partie à la troisième mort', () => {
    let state = isolateTimers(createInitialState(32));
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });
    state = patchMember(state, 'dps3', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'dps3').alive).toBe(false);
    expect(after.status).toBe('over');
  });

  it('continue avec deux morts', () => {
    let state = isolateTimers(createInitialState(33));
    state = patchMember(state, 'dps1', { hp: 5 });
    state = patchMember(state, 'dps2', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.status).toBe('active');
    expect(after.party.filter((member) => !member.alive)).toHaveLength(2);
  });

  it('annule le cast en cours au wipe', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(34)));
    state = castSpell(state, 'prayerOfHealing');
    state = patchMember(state, 'tank', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.status).toBe('over');
    expect(after.activeCast).toBeNull();
    expect(after.stats.castsCancelled).toBe(1);
  });

  it('n’applique plus aucun événement après le wipe', () => {
    let state = isolateTimers(createInitialState(35));
    state = patchMember(state, 'tank', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });
    const wiped = stepSimulation(state, TICK_MS);

    const later = advance(wiped, 5000);
    expect(later).toBe(wiped);
    expect(later.elapsedMs).toBe(wiped.elapsedMs);
  });

  it('refuse toute action après le wipe', () => {
    let state = isolateTimers(createInitialState(36));
    state = patchState(state, { status: 'over' });
    const after = castSpell(state, 'lesserHeal');

    expect(after.mana).toBe(MANA.initial);
    expect(after.stats.castsStartedBySpell.lesserHeal).toBe(0);
  });

  it('marque un mort comme non ciblable et sans HoT', () => {
    let state = isolateTimers(createInitialState(37));
    state = unlockAllSpells(state);
    state = patchMember(state, 'dps1', { hp: 5 });
    state = selectTarget(state, 'dps1');
    state = castSpell(state, 'renew');
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'dps1').alive).toBe(false);
    expect(memberOf(after, 'dps1').hots).toHaveLength(0);
    expect(after.selectedTargetId).toBeNull();
  });
});

describe('pause', () => {
  it('ne fait progresser aucun état pendant la pause', () => {
    let state = advance(createInitialState(41), 3000);
    state = pauseGame(state);

    const after = advance(state, 5000);

    expect(after).toBe(state);
    expect(after.elapsedMs).toBe(state.elapsedMs);
    expect(totalHp(after)).toBe(totalHp(state));
    expect(after.mana).toBe(state.mana);
  });

  it('reprend exactement là où la partie s’était arrêtée', () => {
    const reference = advance(createInitialState(42), 6000);

    let paused = advance(createInitialState(42), 3000);
    paused = pauseGame(paused);
    paused = advance(paused, 10_000); // sans effet
    paused = resumeGame(paused);
    paused = advance(paused, 3000);

    expect(paused).toEqual(reference);
  });

  it('bascule pause / reprise et ignore la bascule après un wipe', () => {
    const active = createInitialState(43);
    const paused = togglePause(active);
    expect(paused.status).toBe('paused');
    expect(togglePause(paused).status).toBe('active');

    const over = patchState(active, { status: 'over' });
    expect(togglePause(over)).toBe(over);
  });
});

describe('invariants sur une partie complète', () => {
  it('respecte les bornes HP et mana, et s’arrête sur un wipe', () => {
    let state = createInitialState(44);

    for (let step = 0; step < 3000; step += 1) {
      state = stepSimulation(state, TICK_MS);

      for (const member of state.party) {
        expect(member.hp).toBeGreaterThanOrEqual(0);
        expect(member.hp).toBeLessThanOrEqual(member.hpMax);
        if (!member.alive) {
          expect(member.hp).toBe(0);
          expect(member.hots).toHaveLength(0);
        }
      }

      expect(state.mana).toBeGreaterThanOrEqual(0);
      expect(state.mana).toBeLessThanOrEqual(state.manaMax);
      expect(state.feedback.length).toBeLessThanOrEqual(40);

      if (state.status === 'over') break;
    }

    // Sans le moindre soin, le groupe finit toujours par tomber.
    expect(state.status).toBe('over');
    expect(state.stats.deaths.length).toBeGreaterThan(0);
  });
});
