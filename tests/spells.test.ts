import { describe, expect, it } from 'vitest';
import { GCD_MS, MANA, SPELLS, TICK_MS } from '../src/config/gameConfig';
import { cancelCast, castSpell, checkCast, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import { advance, isolateTimers, memberOf, patchMember, patchState } from './helpers';

/** Partie isolée de la timeline, avec un membre blessé pour observer les soins. */
function woundedGame(seed = 1, targetId = 'healer', hp = 1000): GameState {
  let state = isolateTimers(createInitialState(seed));
  state = patchMember(state, targetId, { hp });
  return selectTarget(state, targetId);
}

describe('coût et GCD', () => {
  it('dépense la mana au lancement et déclenche le GCD', () => {
    const state = castSpell(woundedGame(), 'greater');
    expect(state.mana).toBe(MANA.initial - SPELLS.greater.manaCost);
    expect(state.gcdRemainingMs).toBe(GCD_MS);
    expect(state.stats.manaSpent).toBe(SPELLS.greater.manaCost);
    expect(state.stats.castsStartedBySpell.greater).toBe(1);
  });

  it('applique immédiatement un sort instantané et le compte comme complété', () => {
    const state = castSpell(woundedGame(), 'renew');
    expect(state.activeCast).toBeNull();
    expect(state.stats.castsCompletedBySpell.renew).toBe(1);
    expect(memberOf(state, 'healer').hots).toHaveLength(1);
  });

  it('refuse un second sort pendant le GCD, sans rien dépenser', () => {
    const first = castSpell(woundedGame(), 'renew');
    const second = castSpell(first, 'flash');

    expect(second.mana).toBe(first.mana);
    expect(second.gcdRemainingMs).toBe(first.gcdRemainingMs);
    expect(second.stats.castsStartedBySpell.flash).toBe(0);
    expect(second.feedback.at(-1)?.text).toBe('GCD actif');
  });

  it('refuse un sort pendant un cast en cours', () => {
    let state = castSpell(woundedGame(), 'greater');
    state = advance(state, GCD_MS);
    const refused = castSpell(state, 'flash');

    expect(refused.activeCast?.spellId).toBe('greater');
    expect(refused.mana).toBe(state.mana);
    expect(refused.feedback.at(-1)?.text).toBe('Cast déjà en cours');
  });

  it('refuse le lancement sans mana suffisante', () => {
    const state = patchState(woundedGame(), { mana: 100 });
    const refused = castSpell(state, 'greater');

    expect(refused.mana).toBe(100);
    expect(refused.gcdRemainingMs).toBe(0);
    expect(refused.activeCast).toBeNull();
    expect(refused.stats.manaSpent).toBe(0);
    expect(refused.feedback.at(-1)?.text).toBe('Mana insuffisante');
  });

  it('refuse le lancement sans cible sélectionnée', () => {
    const state = patchState(woundedGame(), { selectedTargetId: null });
    const refused = castSpell(state, 'flash');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.feedback.at(-1)?.text).toBe('Cible requise');
  });

  it('refuse le lancement sur une cible morte', () => {
    let state = woundedGame(1, 'dps1', 4000);
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    const refused = castSpell(state, 'flash');

    expect(refused.feedback.at(-1)?.text).toBe('Cible morte');
    expect(refused.stats.manaSpent).toBe(0);
  });

  it('accepte Group Heal sans cible sélectionnée', () => {
    const state = patchState(woundedGame(), { selectedTargetId: null });
    const cast = castSpell(state, 'group');

    expect(checkCast(state, 'group').allowed).toBe(true);
    expect(cast.activeCast?.spellId).toBe('group');
    expect(cast.activeCast?.targetId).toBeNull();
  });

  it('refuse tout lancement une fois la partie terminée', () => {
    const state = patchState(woundedGame(), { status: 'over' });
    const refused = castSpell(state, 'flash');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.feedback.at(-1)?.text).toBe('Partie terminée');
  });
});

describe('résolution des casts', () => {
  it('applique le soin à la fin du temps d’incantation, pas avant', () => {
    let state = castSpell(woundedGame(), 'greater');
    state = advance(state, 2400);
    expect(memberOf(state, 'healer').hp).toBe(1000);

    state = stepSimulation(state, TICK_MS);
    expect(state.activeCast).toBeNull();
    expect(memberOf(state, 'healer').hp).toBeGreaterThan(1000);
    expect(state.stats.castsCompletedBySpell.greater).toBe(1);
  });

  it('applique la variation de ±10 % au soin direct', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      let state = castSpell(woundedGame(seed), 'greater');
      state = advance(state, 2500);
      const healed = memberOf(state, 'healer').hp - 1000;
      expect(healed).toBeGreaterThanOrEqual(Math.round(2000 * 0.9));
      expect(healed).toBeLessThanOrEqual(Math.round(2000 * 1.1));
    }
  });

  it('soigne tous les membres vivants avec Group Heal', () => {
    let state = isolateTimers(createInitialState(3));
    state = patchMember(state, 'tank', { hp: 4000 });
    state = patchMember(state, 'dps1', { hp: 1000 });
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });

    state = castSpell(state, 'group');
    state = advance(state, 3000);

    expect(memberOf(state, 'tank').hp).toBe(4600);
    expect(memberOf(state, 'dps1').hp).toBe(1600);
    expect(memberOf(state, 'dps2').hp).toBe(0);
  });
});

describe('Renew', () => {
  it('ne tick pas immédiatement et tick toutes les 2 s', () => {
    let state = castSpell(woundedGame(), 'renew');
    expect(memberOf(state, 'healer').hp).toBe(1000);

    state = advance(state, 1900);
    expect(memberOf(state, 'healer').hp).toBe(1000);

    state = advance(state, 100);
    expect(memberOf(state, 'healer').hp).toBe(1150);

    state = advance(state, 2000);
    expect(memberOf(state, 'healer').hp).toBe(1300);
  });

  it('applique exactement cinq ticks puis disparaît', () => {
    let state = castSpell(woundedGame(), 'renew');
    state = advance(state, 10_000);

    expect(memberOf(state, 'healer').hp).toBe(1000 + 5 * 150);
    expect(memberOf(state, 'healer').hots).toHaveLength(0);

    state = advance(state, 5000);
    expect(memberOf(state, 'healer').hp).toBe(1000 + 5 * 150);
  });

  it('ne stacke pas : réappliquer réinitialise les ticks et le délai', () => {
    let state = castSpell(woundedGame(), 'renew');
    state = advance(state, 5000); // 2 ticks appliqués
    expect(memberOf(state, 'healer').hp).toBe(1300);
    expect(memberOf(state, 'healer').hots[0].ticksRemaining).toBe(3);

    state = castSpell(state, 'renew');
    const hots = memberOf(state, 'healer').hots;
    expect(hots).toHaveLength(1);
    expect(hots[0].ticksRemaining).toBe(5);
    expect(hots[0].nextTickInMs).toBe(2000);

    // Aucun tick immédiat.
    expect(memberOf(state, 'healer').hp).toBe(1300);
    state = advance(state, 1900);
    expect(memberOf(state, 'healer').hp).toBe(1300);
    state = advance(state, 100);
    expect(memberOf(state, 'healer').hp).toBe(1450);
  });

  it('disparaît à la mort du porteur', () => {
    let state = castSpell(woundedGame(1, 'dps1', 1000), 'renew');
    state = patchMember(state, 'dps1', { hp: 0 });
    state = stepSimulation(state, TICK_MS);

    expect(memberOf(state, 'dps1').alive).toBe(false);
    expect(memberOf(state, 'dps1').hots).toHaveLength(0);
  });
});

describe('annulation et interruption', () => {
  it('conserve la mana et le GCD, n’applique aucun soin', () => {
    let state = castSpell(woundedGame(), 'greater');
    state = advance(state, 1000);

    const cancelled = cancelCast(state);

    expect(cancelled.activeCast).toBeNull();
    expect(cancelled.mana).toBe(state.mana);
    expect(cancelled.gcdRemainingMs).toBe(state.gcdRemainingMs);
    expect(cancelled.gcdRemainingMs).toBe(GCD_MS - 1000);
    expect(memberOf(cancelled, 'healer').hp).toBe(1000);
    expect(cancelled.stats.castsCancelled).toBe(1);
    expect(cancelled.stats.castsCompletedBySpell.greater).toBe(0);
  });

  it('ne rembourse jamais la mana', () => {
    let state = castSpell(woundedGame(), 'greater');
    state = advance(state, 500);
    const cancelled = cancelCast(state);
    expect(cancelled.stats.manaSpent).toBe(SPELLS.greater.manaCost);
    expect(cancelled.mana).toBeLessThanOrEqual(MANA.initial - SPELLS.greater.manaCost + 100);
  });

  it('annule le cast lorsque la cible meurt', () => {
    let state = woundedGame(1, 'dps1', 4000);
    state = castSpell(state, 'greater');
    state = patchMember(state, 'dps1', { hp: 1 });
    state = patchState(state, { timers: { ...state.timers, aoeMs: TICK_MS } });

    const after = stepSimulation(state, TICK_MS);

    expect(memberOf(after, 'dps1').alive).toBe(false);
    expect(after.activeCast).toBeNull();
    expect(after.stats.castsCancelled).toBe(1);
    expect(after.selectedTargetId).toBeNull();
  });

  it('ne fait rien si aucun cast n’est en cours', () => {
    const state = woundedGame();
    expect(cancelCast(state)).toBe(state);
  });
});

describe('régénération de mana', () => {
  it('régénère 100/s pendant un cast', () => {
    let state = castSpell(woundedGame(), 'greater');
    state = patchState(state, { mana: 0 });
    state = advance(state, 1000);

    expect(state.activeCast).not.toBeNull();
    expect(state.mana).toBeCloseTo(100, 6);
  });

  it('reste à 100/s tant qu’un cast est en cours, même après deux secondes', () => {
    let state = castSpell(woundedGame(), 'group'); // 3 s d’incantation
    state = patchState(state, { mana: 0 });
    state = advance(state, 2500);

    expect(state.activeCast).not.toBeNull();
    expect(state.mana).toBeCloseTo(250, 6);
  });

  it('passe à 200/s après deux secondes sans lancement', () => {
    let state = patchState(woundedGame(), { mana: 0, msSinceLastCastStart: 0 });

    state = advance(state, 1900); // 19 pas à 100/s
    expect(state.mana).toBeCloseTo(190, 6);

    // Le pas qui atteint exactement 2000 ms bénéficie déjà du bonus.
    state = advance(state, 100);
    expect(state.mana).toBeCloseTo(210, 6);

    state = advance(state, 1000); // 1 s à 200/s
    expect(state.mana).toBeCloseTo(410, 6);
  });

  it('ne dépasse jamais la mana maximale', () => {
    const state = advance(woundedGame(), 5000);
    expect(state.mana).toBe(MANA.max);
  });
});
