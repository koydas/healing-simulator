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

describe('wipe conditions', () => {
  it('ends the fight when the tank dies', () => {
    let state = isolateTimers(createInitialState(31));
    state = patchMember(state, 'tank', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'tank').alive).toBe(false);
    expect(after.status).toBe('over');
    expect(after.stats.deaths).toEqual(['tank']);
  });

  it('ends the fight on the third death', () => {
    let state = isolateTimers(createInitialState(32));
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });
    state = patchMember(state, 'dps3', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'dps3').alive).toBe(false);
    expect(after.status).toBe('over');
  });

  it('carries on with two deaths', () => {
    let state = isolateTimers(createInitialState(33));
    state = patchMember(state, 'dps1', { hp: 5 });
    state = patchMember(state, 'dps2', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.status).toBe('active');
    expect(after.party.filter((member) => !member.alive)).toHaveLength(2);
  });

  it('cancels the active cast on a wipe', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(34)));
    state = castSpell(state, 'prayerOfHealing');
    state = patchMember(state, 'tank', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(after.status).toBe('over');
    expect(after.activeCast).toBeNull();
    expect(after.stats.castsCancelled).toBe(1);
  });

  it('applies no further event after the wipe', () => {
    let state = isolateTimers(createInitialState(35));
    state = patchMember(state, 'tank', { hp: 5 });
    state = patchState(state, { timers: { ...state.timers, tankDamageMs: TICK_MS } });
    const wiped = stepSimulation(state, TICK_MS);

    const later = advance(wiped, 5000);
    expect(later).toBe(wiped);
    expect(later.elapsedMs).toBe(wiped.elapsedMs);
  });

  it('refuses every action after the wipe', () => {
    let state = isolateTimers(createInitialState(36));
    state = patchState(state, { status: 'over' });
    const after = castSpell(state, 'lesserHeal');

    expect(after.mana).toBe(MANA.initial);
    expect(after.stats.castsStartedBySpell.lesserHeal).toBe(0);
  });

  it('marks a dead member as untargetable and strips its HoTs', () => {
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
  it('advances nothing while paused', () => {
    let state = advance(createInitialState(41), 3000);
    state = pauseGame(state);

    const after = advance(state, 5000);

    expect(after).toBe(state);
    expect(after.elapsedMs).toBe(state.elapsedMs);
    expect(totalHp(after)).toBe(totalHp(state));
    expect(after.mana).toBe(state.mana);
  });

  it('resumes exactly where the fight stopped', () => {
    const reference = advance(createInitialState(42), 6000);

    let paused = advance(createInitialState(42), 3000);
    paused = pauseGame(paused);
    paused = advance(paused, 10_000); // no effect
    paused = resumeGame(paused);
    paused = advance(paused, 3000);

    expect(paused).toEqual(reference);
  });

  it('toggles pause / resume and ignores the toggle after a wipe', () => {
    const active = createInitialState(43);
    const paused = togglePause(active);
    expect(paused.status).toBe('paused');
    expect(togglePause(paused).status).toBe('active');

    const over = patchState(active, { status: 'over' });
    expect(togglePause(over)).toBe(over);
  });
});

describe('invariants over a full fight', () => {
  it('respects the health and mana bounds, and stops on a wipe', () => {
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

    // With no healing at all, the party always goes down eventually.
    expect(state.status).toBe('over');
    expect(state.stats.deaths.length).toBeGreaterThan(0);
  });
});
