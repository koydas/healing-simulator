import { describe, expect, it } from 'vitest';
import { GCD_MS, MANA, SPELLS, TICK_MS } from '../src/config/gameConfig';
import { cancelCast, castSpell, checkCast, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import {
  advance,
  isolateTimers,
  memberOf,
  patchMember,
  patchState,
  unlockAllSpells,
} from './helpers';

/**
 * Partie isolée de la timeline, avec un membre blessé pour observer les soins.
 * Le tank (90 PV) sert de cible par défaut : à 10 PV, un Lesser Heal (46-56)
 * est intégralement effectif.
 */
function woundedGame(seed = 1, targetId = 'tank', hp = 10): GameState {
  let state = isolateTimers(createInitialState(seed));
  state = patchMember(state, targetId, { hp });
  return selectTarget(state, targetId);
}

describe('disponibilité des sorts au niveau 1', () => {
  it('n’autorise que Lesser Heal', () => {
    const state = woundedGame();

    expect(checkCast(state, 'lesserHeal').allowed).toBe(true);
    for (const spellId of ['renew', 'heal', 'flashHeal', 'prayerOfHealing'] as const) {
      expect(checkCast(state, spellId)).toEqual({ allowed: false, reason: 'level' });
    }
  });

  it('refuse un sort non appris sans rien dépenser', () => {
    const state = woundedGame();
    const refused = castSpell(state, 'flashHeal');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.gcdRemainingMs).toBe(0);
    expect(refused.stats.manaSpent).toBe(0);
    expect(refused.stats.castsStartedBySpell.flashHeal).toBe(0);
    expect(refused.feedback.at(-1)?.text).toBe('Niveau insuffisant');
  });

  it('débloque les sorts dès que le niveau requis est atteint', () => {
    const state = patchState(woundedGame(), { playerLevel: 20, mana: 500 });

    expect(checkCast(state, 'renew').allowed).toBe(true);
    expect(checkCast(state, 'heal').allowed).toBe(true);
    expect(checkCast(state, 'flashHeal').allowed).toBe(true);
    expect(checkCast(state, 'prayerOfHealing').reason).toBe('level');
  });
});

describe('coût et GCD', () => {
  it('dépense la mana au lancement et déclenche le GCD', () => {
    const state = castSpell(woundedGame(), 'lesserHeal');

    expect(state.mana).toBe(MANA.initial - SPELLS.lesserHeal.manaCost);
    expect(state.gcdRemainingMs).toBe(GCD_MS);
    expect(state.stats.manaSpent).toBe(SPELLS.lesserHeal.manaCost);
    expect(state.stats.castsStartedBySpell.lesserHeal).toBe(1);
  });

  it('applique immédiatement un sort instantané et le compte comme complété', () => {
    const state = castSpell(unlockAllSpells(woundedGame()), 'renew');

    expect(state.activeCast).toBeNull();
    expect(state.stats.castsCompletedBySpell.renew).toBe(1);
    expect(memberOf(state, 'tank').hots).toHaveLength(1);
  });

  it('refuse un second sort pendant le GCD, sans rien dépenser', () => {
    const first = castSpell(unlockAllSpells(woundedGame()), 'renew');
    const second = castSpell(first, 'lesserHeal');

    expect(second.mana).toBe(first.mana);
    expect(second.gcdRemainingMs).toBe(first.gcdRemainingMs);
    expect(second.stats.castsStartedBySpell.lesserHeal).toBe(0);
    expect(second.feedback.at(-1)?.text).toBe('GCD actif');
  });

  it('refuse un sort pendant un cast en cours', () => {
    let state = castSpell(unlockAllSpells(woundedGame()), 'heal'); // 3 s d’incantation
    state = advance(state, GCD_MS);
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.activeCast?.spellId).toBe('heal');
    expect(refused.mana).toBe(state.mana);
    expect(refused.feedback.at(-1)?.text).toBe('Cast déjà en cours');
  });

  it('refuse le lancement sans mana suffisante', () => {
    const state = patchState(woundedGame(), { mana: 10 });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.mana).toBe(10);
    expect(refused.gcdRemainingMs).toBe(0);
    expect(refused.activeCast).toBeNull();
    expect(refused.stats.manaSpent).toBe(0);
    expect(refused.feedback.at(-1)?.text).toBe('Mana insuffisante');
  });

  it('refuse le lancement sans cible sélectionnée', () => {
    const state = patchState(woundedGame(), { selectedTargetId: null });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.feedback.at(-1)?.text).toBe('Cible requise');
  });

  it('refuse le lancement sur une cible morte', () => {
    let state = woundedGame(1, 'dps1', 50);
    state = selectTarget(state, 'dps1');
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.feedback.at(-1)?.text).toBe('Cible morte');
    expect(refused.stats.manaSpent).toBe(0);
  });

  it('accepte Prayer of Healing sans cible sélectionnée', () => {
    const state = patchState(unlockAllSpells(woundedGame()), { selectedTargetId: null });
    const cast = castSpell(state, 'prayerOfHealing');

    expect(checkCast(state, 'prayerOfHealing').allowed).toBe(true);
    expect(cast.activeCast?.spellId).toBe('prayerOfHealing');
    expect(cast.activeCast?.targetId).toBeNull();
  });

  it('refuse tout lancement une fois la partie terminée', () => {
    const state = patchState(woundedGame(), { status: 'over' });
    const refused = castSpell(state, 'lesserHeal');

    expect(refused.mana).toBe(MANA.initial);
    expect(refused.feedback.at(-1)?.text).toBe('Partie terminée');
  });
});

describe('résolution des casts', () => {
  it('applique le soin à la fin du temps d’incantation, pas avant', () => {
    let state = castSpell(woundedGame(), 'lesserHeal');
    state = advance(state, 1400);
    expect(memberOf(state, 'tank').hp).toBe(10);

    state = stepSimulation(state, TICK_MS);
    expect(state.activeCast).toBeNull();
    expect(memberOf(state, 'tank').hp).toBeGreaterThan(10);
    expect(state.stats.castsCompletedBySpell.lesserHeal).toBe(1);
  });

  it('tire le soin dans la fourchette Classic 46 – 56', () => {
    const amounts = new Set<number>();

    for (let seed = 1; seed <= 40; seed += 1) {
      let state = castSpell(woundedGame(seed), 'lesserHeal');
      state = advance(state, SPELLS.lesserHeal.castTimeMs);
      const healed = memberOf(state, 'tank').hp - 10;
      amounts.add(healed);
      expect(healed).toBeGreaterThanOrEqual(SPELLS.lesserHeal.healMin);
      expect(healed).toBeLessThanOrEqual(SPELLS.lesserHeal.healMax);
    }

    // La fourchette est réellement parcourue, pas figée sur une valeur.
    expect(amounts.size).toBeGreaterThan(3);
  });

  it('soigne tous les membres vivants avec Prayer of Healing', () => {
    let state = unlockAllSpells(isolateTimers(createInitialState(3)));
    state = patchMember(state, 'tank', { hp: 10 });
    state = patchMember(state, 'dps1', { hp: 5 });
    state = patchMember(state, 'dps2', { alive: false, hp: 0 });

    state = castSpell(state, 'prayerOfHealing');
    state = advance(state, SPELLS.prayerOfHealing.castTimeMs);

    // Le soin (312-333) dépasse largement les PV de niveau 1 : tout le monde
    // est au maximum, sauf le mort.
    expect(memberOf(state, 'tank').hp).toBe(memberOf(state, 'tank').hpMax);
    expect(memberOf(state, 'dps1').hp).toBe(memberOf(state, 'dps1').hpMax);
    expect(memberOf(state, 'dps2').hp).toBe(0);
  });
});

describe('Renew', () => {
  const renewGame = (seed = 1) => unlockAllSpells(woundedGame(seed));

  it('ne tick pas immédiatement et tick toutes les 3 s', () => {
    let state = castSpell(renewGame(), 'renew');
    expect(memberOf(state, 'tank').hp).toBe(10);

    state = advance(state, 2900);
    expect(memberOf(state, 'tank').hp).toBe(10);

    state = advance(state, 100);
    expect(memberOf(state, 'tank').hp).toBe(19);

    state = advance(state, 3000);
    expect(memberOf(state, 'tank').hp).toBe(28);
  });

  it('applique exactement cinq ticks de 9 puis disparaît', () => {
    let state = castSpell(renewGame(), 'renew');
    state = advance(state, 15_000);

    expect(memberOf(state, 'tank').hp).toBe(10 + 45);
    expect(memberOf(state, 'tank').hots).toHaveLength(0);

    state = advance(state, 6000);
    expect(memberOf(state, 'tank').hp).toBe(10 + 45);
  });

  it('ne stacke pas : réappliquer réinitialise les ticks et le délai', () => {
    let state = castSpell(renewGame(), 'renew');
    state = advance(state, 7000); // 2 ticks appliqués
    expect(memberOf(state, 'tank').hp).toBe(28);
    expect(memberOf(state, 'tank').hots[0].ticksRemaining).toBe(3);

    state = castSpell(state, 'renew');
    const hots = memberOf(state, 'tank').hots;
    expect(hots).toHaveLength(1);
    expect(hots[0].ticksRemaining).toBe(5);
    expect(hots[0].nextTickInMs).toBe(3000);

    // Aucun tick immédiat.
    expect(memberOf(state, 'tank').hp).toBe(28);
    state = advance(state, 2900);
    expect(memberOf(state, 'tank').hp).toBe(28);
    state = advance(state, 100);
    expect(memberOf(state, 'tank').hp).toBe(37);
  });

  it('disparaît à la mort du porteur', () => {
    let state = unlockAllSpells(woundedGame(1, 'dps1', 20));
    state = selectTarget(state, 'dps1');
    state = castSpell(state, 'renew');
    state = patchMember(state, 'dps1', { hp: 0 });
    state = stepSimulation(state, TICK_MS);

    expect(memberOf(state, 'dps1').alive).toBe(false);
    expect(memberOf(state, 'dps1').hots).toHaveLength(0);
  });
});

describe('annulation et interruption', () => {
  it('conserve la mana et le GCD, n’applique aucun soin', () => {
    let state = castSpell(woundedGame(), 'lesserHeal');
    state = advance(state, 1000);

    const cancelled = cancelCast(state);

    expect(cancelled.activeCast).toBeNull();
    expect(cancelled.mana).toBe(state.mana);
    expect(cancelled.gcdRemainingMs).toBe(GCD_MS - 1000);
    expect(memberOf(cancelled, 'tank').hp).toBe(10);
    expect(cancelled.stats.castsCancelled).toBe(1);
    expect(cancelled.stats.castsCompletedBySpell.lesserHeal).toBe(0);
  });

  it('ne rembourse jamais la mana', () => {
    let state = castSpell(woundedGame(), 'lesserHeal');
    state = advance(state, 500);
    const cancelled = cancelCast(state);

    expect(cancelled.stats.manaSpent).toBe(SPELLS.lesserHeal.manaCost);
    expect(cancelled.mana).toBeLessThanOrEqual(MANA.initial - SPELLS.lesserHeal.manaCost);
  });

  it('annule le cast lorsque la cible meurt', () => {
    let state = woundedGame(1, 'dps1', 40);
    state = selectTarget(state, 'dps1');
    state = castSpell(state, 'lesserHeal');
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

describe('régénération de mana (règle des cinq secondes)', () => {
  /** Partie isolée, mais avec le palier de régénération actif. */
  function regenGame(mana = 0, msSinceLastCastStart: number = MANA.fiveSecondRuleMs): GameState {
    const base = isolateTimers(createInitialState(9));
    return patchState(base, {
      mana,
      msSinceLastCastStart,
      timers: { ...base.timers, manaTickMs: MANA.tickMs },
    });
  }

  it('régénère par paliers de 2 secondes hors des cinq secondes', () => {
    let state = regenGame();

    state = advance(state, 1900);
    expect(state.mana).toBe(0);

    state = advance(state, 100);
    expect(state.mana).toBeCloseTo(MANA.perTick, 6);

    state = advance(state, 2000);
    expect(state.mana).toBeCloseTo(2 * MANA.perTick, 6);
  });

  it('ne régénère rien pendant les cinq secondes qui suivent une dépense', () => {
    let state = regenGame(0, 0);

    state = advance(state, 4900);
    expect(state.mana).toBe(0);

    // Le palier de 6 s survient alors que 5 s se sont écoulées : il compte.
    state = advance(state, 1100);
    expect(state.mana).toBeCloseTo(MANA.perTick, 6);
  });

  it('relance la règle des cinq secondes à chaque lancement accepté', () => {
    let state = regenGame(MANA.max);
    state = castSpell(state, 'lesserHeal');
    expect(state.msSinceLastCastStart).toBe(0);

    const manaAfterCast = state.mana;
    state = advance(state, 4000);
    expect(state.mana).toBe(manaAfterCast);
  });

  it('ne dépasse jamais la mana maximale', () => {
    const state = advance(regenGame(MANA.max), 20_000);
    expect(state.mana).toBe(MANA.max);
  });
});
