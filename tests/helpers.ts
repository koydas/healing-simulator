/** Shared helpers for the engine tests (no DOM required). */

import { MANA, TICK_MS } from '../src/config/gameConfig';
import { cloneState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState, PartyMember } from '../src/simulation/types';

/** Advances the simulation by `ms` milliseconds, in fixed steps. */
export function advance(state: GameState, ms: number): GameState {
  let current = state;
  const steps = Math.round(ms / TICK_MS);
  for (let index = 0; index < steps; index += 1) {
    current = stepSimulation(current, TICK_MS);
  }
  return current;
}

export function memberOf(state: GameState, id: string): PartyMember {
  const member = state.party.find((entry) => entry.id === id);
  if (!member) throw new Error(`Member not found: ${id}`);
  return member;
}

/** Edits a member (test tool: lets a scenario be isolated). */
export function patchMember(
  state: GameState,
  id: string,
  patch: Partial<PartyMember>,
): GameState {
  const draft = cloneState(state);
  const index = draft.party.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`Member not found: ${id}`);
  draft.party[index] = { ...draft.party[index], ...patch };
  return draft;
}

/** Pushes every timeline event far away, to isolate one behaviour. */
export function isolateTimers(state: GameState, ms = 10_000_000): GameState {
  const draft = cloneState(state);
  draft.timers = { manaTickMs: ms, tankDamageMs: ms, aoeMs: ms, spikeMs: ms };
  return draft;
}

/** Forces any field of the state. */
export function patchState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...cloneState(state), ...patch };
}

/**
 * Unlocks the higher-level spells and grants enough mana to cast them.
 * Since the stat tables only cover level 1, only spell gating changes: health
 * and regeneration stay at their level 1 values.
 */
export function unlockAllSpells(state: GameState, mana = 1000): GameState {
  return patchState(state, { playerLevel: 60, mana, manaMax: Math.max(mana, MANA.max) });
}

/** Total party health (handy to detect a damage event). */
export function totalHp(state: GameState): number {
  return state.party.reduce((sum, member) => sum + member.hp, 0);
}
