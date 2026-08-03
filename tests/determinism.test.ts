import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/config/gameConfig';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import { advance } from './helpers';

/** Rejoue une partie scriptée : mêmes actions, aux mêmes pas de simulation. */
function playScriptedGame(seed: number, steps = 600): GameState {
  // Niveau 20 : le script peut enchaîner plusieurs familles de sorts.
  let state = createInitialState(seed, 20);

  for (let step = 0; step < steps; step += 1) {
    if (step === 3) state = selectTarget(state, 'tank');
    if (step === 4) state = castSpell(state, 'heal');
    if (step === 40) state = castSpell(state, 'renew');
    if (step === 60) state = selectTarget(state, 'dps2');
    if (step === 61) state = castSpell(state, 'flashHeal');
    if (step === 120) state = castSpell(state, 'lesserHeal');
    if (step === 200) state = selectTarget(state, 'healer');
    if (step === 201) state = castSpell(state, 'lesserHeal');
    state = stepSimulation(state, TICK_MS);
  }

  return state;
}

describe('déterminisme du moteur', () => {
  it('produit exactement la même partie avec la même seed et les mêmes actions', () => {
    const first = playScriptedGame(4242);
    const second = playScriptedGame(4242);
    expect(second).toEqual(first);
  });

  it('produit des parties différentes avec des seeds différentes', () => {
    const first = playScriptedGame(4242);
    const second = playScriptedGame(9001);
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
  });

  it('n’utilise pas d’horloge réelle : deux exécutions décalées sont identiques', async () => {
    const first = advance(createInitialState(77), 5000);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = advance(createInitialState(77), 5000);
    expect(second).toEqual(first);
  });

  it('ne mute jamais l’état d’entrée', () => {
    const state = createInitialState(5);
    const before = JSON.stringify(state);
    stepSimulation(state, TICK_MS);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('découper le temps en pas fixes donne le même résultat qu’un enchaînement continu', () => {
    const reference = advance(createInitialState(31), 10_000);
    let chunked = createInitialState(31);
    chunked = advance(chunked, 3000);
    chunked = advance(chunked, 4000);
    chunked = advance(chunked, 3000);
    expect(chunked).toEqual(reference);
  });
});
