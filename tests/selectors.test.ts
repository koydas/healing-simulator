import { describe, expect, it } from 'vitest';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import {
  formatDuration,
  getActiveHotEffect,
  getAliveMembers,
  getCastProgress,
  getGcdProgress,
  getGlobalMessages,
  getHpRatio,
  getManaRatio,
  getMember,
  getMemberFeedback,
} from '../src/simulation/selectors';
import { advance, isolateTimers, memberOf, patchMember, unlockAllSpells } from './helpers';

describe('selectors', () => {
  it('formats a duration', () => {
    expect(formatDuration(0)).toBe('0:00.0');
    expect(formatDuration(1500)).toBe('0:01.5');
    expect(formatDuration(65_400)).toBe('1:05.4');
    expect(formatDuration(-10)).toBe('0:00.0');
  });

  it('finds a member and handles a null id', () => {
    const state = createInitialState(1);
    expect(getMember(state, 'tank')?.name).toBe('Thorgrim');
    expect(getMember(state, null)).toBeUndefined();
    expect(getMember(state, 'unknown')).toBeUndefined();
  });

  it('lists the living members', () => {
    let state = createInitialState(1);
    expect(getAliveMembers(state)).toHaveLength(5);

    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    expect(getAliveMembers(state)).toHaveLength(4);
  });

  it('computes the health and mana ratios', () => {
    let state = createInitialState(1);
    expect(getHpRatio(memberOf(state, 'tank'))).toBe(1);
    expect(getManaRatio(state)).toBe(1);

    state = patchMember(state, 'tank', { hp: memberOf(state, 'tank').hpMax / 4 });
    expect(getHpRatio(memberOf(state, 'tank'))).toBe(0.25);

    state = { ...state, mana: state.manaMax / 4 };
    expect(getManaRatio(state)).toBe(0.25);
  });

  it('computes cast progress', () => {
    let state = isolateTimers(createInitialState(1));
    expect(getCastProgress(state)).toBe(0);

    state = castSpell(unlockAllSpells(state), 'heal'); // 3 s cast
    expect(getCastProgress(state)).toBe(0);

    state = advance(state, 1200);
    expect(getCastProgress(state)).toBeCloseTo(0.4, 6);
  });

  it('computes GCD progress', () => {
    let state = isolateTimers(createInitialState(1));
    expect(getGcdProgress(state)).toBe(1);

    state = castSpell(unlockAllSpells(state), 'renew');
    expect(getGcdProgress(state)).toBe(0);

    state = advance(state, 600);
    expect(getGcdProgress(state)).toBeCloseTo(0.4, 6);

    state = advance(state, 900);
    expect(getGcdProgress(state)).toBe(1);
  });

  it('exposes the active HoT', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(1)));
    state = selectTarget(state, 'dps3');
    state = patchMember(state, 'dps3', { hp: 10 });
    state = castSpell(state, 'renew');

    expect(getActiveHotEffect(memberOf(state, 'dps3'))?.ticksRemaining).toBe(5);
    expect(getActiveHotEffect(memberOf(state, 'tank'))).toBeUndefined();
  });

  it('separates per-target feedback from global messages', () => {
    let state = isolateTimers(createInitialState(1));
    state = patchMember(state, 'tank', { hp: 10 });
    state = castSpell(state, 'renew'); // instant, default target is the tank
    state = advance(state, 3000); // first Renew tick

    expect(getMemberFeedback(state, 'tank').length).toBeGreaterThan(0);
    expect(getMemberFeedback(state, 'dps1')).toHaveLength(0);

    // Instant spell then a second cast: refused because of the GCD.
    const refused = castSpell(castSpell(unlockAllSpells(state), 'shield'), 'renew');
    expect(getGlobalMessages(refused).at(-1)?.text).toBe('Global cooldown');
  });

  it('prunes expired feedback', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(1)));
    state = patchMember(state, 'healer', { hp: 10 });
    state = selectTarget(state, 'healer');
    state = castSpell(state, 'renew');
    state = advance(state, 3000);
    expect(getMemberFeedback(state, 'healer').length).toBeGreaterThan(0);

    state = advance(state, 3000);
    // The next tick produced fresh feedback, but the old entry expired.
    expect(state.feedback.every((event) => event.expiresAtMs > state.elapsedMs)).toBe(true);
  });
});
