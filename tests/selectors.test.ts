import { describe, expect, it } from 'vitest';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import {
  formatDuration,
  getAliveMembers,
  getCastProgress,
  getGcdProgress,
  getGlobalMessages,
  getHpRatio,
  getManaRatio,
  getMember,
  getMemberFeedback,
  getRenewEffect,
} from '../src/simulation/selectors';
import { advance, isolateTimers, memberOf, patchMember, unlockAllSpells } from './helpers';

describe('sélecteurs', () => {
  it('formate une durée', () => {
    expect(formatDuration(0)).toBe('0:00.0');
    expect(formatDuration(1500)).toBe('0:01.5');
    expect(formatDuration(65_400)).toBe('1:05.4');
    expect(formatDuration(-10)).toBe('0:00.0');
  });

  it('retrouve un membre et gère l’identifiant nul', () => {
    const state = createInitialState(1);
    expect(getMember(state, 'tank')?.name).toBe('Thorgrim');
    expect(getMember(state, null)).toBeUndefined();
    expect(getMember(state, 'inconnu')).toBeUndefined();
  });

  it('liste les membres vivants', () => {
    let state = createInitialState(1);
    expect(getAliveMembers(state)).toHaveLength(5);

    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    expect(getAliveMembers(state)).toHaveLength(4);
  });

  it('calcule les ratios HP et mana', () => {
    let state = createInitialState(1);
    expect(getHpRatio(memberOf(state, 'tank'))).toBe(1);
    expect(getManaRatio(state)).toBe(1);

    state = patchMember(state, 'tank', { hp: memberOf(state, 'tank').hpMax / 4 });
    expect(getHpRatio(memberOf(state, 'tank'))).toBe(0.25);

    state = { ...state, mana: state.manaMax / 4 };
    expect(getManaRatio(state)).toBe(0.25);
  });

  it('calcule la progression du cast', () => {
    let state = isolateTimers(createInitialState(1));
    expect(getCastProgress(state)).toBe(0);

    state = castSpell(state, 'lesserHeal');
    expect(getCastProgress(state)).toBe(0);

    state = advance(state, 600);
    expect(getCastProgress(state)).toBeCloseTo(0.4, 6);
  });

  it('calcule la progression du GCD', () => {
    let state = isolateTimers(createInitialState(1));
    expect(getGcdProgress(state)).toBe(1);

    state = castSpell(unlockAllSpells(state), 'renew');
    expect(getGcdProgress(state)).toBe(0);

    state = advance(state, 600);
    expect(getGcdProgress(state)).toBeCloseTo(0.4, 6);

    state = advance(state, 900);
    expect(getGcdProgress(state)).toBe(1);
  });

  it('expose le Renew actif', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(1)));
    state = selectTarget(state, 'dps3');
    state = patchMember(state, 'dps3', { hp: 10 });
    state = castSpell(state, 'renew');

    expect(getRenewEffect(memberOf(state, 'dps3'))?.ticksRemaining).toBe(5);
    expect(getRenewEffect(memberOf(state, 'tank'))).toBeUndefined();
  });

  it('sépare les feedbacks par cible et les messages globaux', () => {
    let state = isolateTimers(createInitialState(1));
    state = patchMember(state, 'tank', { hp: 10 });
    state = castSpell(state, 'lesserHeal');
    state = advance(state, 1500);

    expect(getMemberFeedback(state, 'tank').length).toBeGreaterThan(0);
    expect(getMemberFeedback(state, 'dps1')).toHaveLength(0);

    // Sort instantané puis second lancement : refusé pour cause de GCD.
    const refused = castSpell(castSpell(unlockAllSpells(state), 'renew'), 'lesserHeal');
    expect(getGlobalMessages(refused).at(-1)?.text).toBe('GCD actif');
  });

  it('purge les feedbacks expirés', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(1)));
    state = patchMember(state, 'healer', { hp: 10 });
    state = selectTarget(state, 'healer');
    state = castSpell(state, 'renew');
    state = advance(state, 3000);
    expect(getMemberFeedback(state, 'healer').length).toBeGreaterThan(0);

    state = advance(state, 3000);
    // Le tick suivant a produit un nouveau feedback, mais l'ancien a expiré.
    expect(state.feedback.every((event) => event.expiresAtMs > state.elapsedMs)).toBe(true);
  });
});
