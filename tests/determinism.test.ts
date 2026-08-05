import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/config/gameConfig';
import { castSpell, selectTarget } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState } from '../src/simulation/types';
import { advance } from './helpers';

/** Replays a scripted fight: same actions, on the same simulation steps. */
function playScriptedGame(seed: number, steps = 600): GameState {
  // Level 20: the script can chain several spell families.
  let state = createInitialState(seed, 20);

  for (let step = 0; step < steps; step += 1) {
    if (step === 3) state = selectTarget(state, 'tank');
    if (step === 4) state = castSpell(state, 'heal');
    if (step === 40) state = castSpell(state, 'renew');
    if (step === 60) state = selectTarget(state, 'dps2');
    if (step === 61) state = castSpell(state, 'shield');
    if (step === 120) state = castSpell(state, 'renew');
    if (step === 200) state = selectTarget(state, 'healer');
    if (step === 201) state = castSpell(state, 'shield');
    state = stepSimulation(state, TICK_MS);
  }

  return state;
}

describe('engine determinism', () => {
  it('produces exactly the same fight from the same seed and actions', () => {
    const first = playScriptedGame(4242);
    const second = playScriptedGame(4242);
    expect(second).toEqual(first);
  });

  it('produces different fights from different seeds', () => {
    const first = playScriptedGame(4242);
    const second = playScriptedGame(9001);
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
  });

  it('uses no real clock: two runs at different times are identical', async () => {
    const first = advance(createInitialState(77), 5000);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = advance(createInitialState(77), 5000);
    expect(second).toEqual(first);
  });

  it('never mutates the input state', () => {
    const state = createInitialState(5);
    const before = JSON.stringify(state);
    stepSimulation(state, TICK_MS);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('slicing time into fixed steps matches one continuous run', () => {
    const reference = advance(createInitialState(31), 10_000);
    let chunked = createInitialState(31);
    chunked = advance(chunked, 3000);
    chunked = advance(chunked, 4000);
    chunked = advance(chunked, 3000);
    expect(chunked).toEqual(reference);
  });
});
