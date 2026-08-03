/** Utilitaires partagés par les tests du moteur (aucun DOM requis). */

import { MANA, TICK_MS } from '../src/config/gameConfig';
import { cloneState } from '../src/simulation/initialState';
import { stepSimulation } from '../src/simulation/simulation';
import type { GameState, PartyMember } from '../src/simulation/types';

/** Avance la simulation de `ms` millisecondes par pas fixes. */
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
  if (!member) throw new Error(`Membre introuvable : ${id}`);
  return member;
}

/** Modifie un membre (outil de test : permet d'isoler un scénario). */
export function patchMember(
  state: GameState,
  id: string,
  patch: Partial<PartyMember>,
): GameState {
  const draft = cloneState(state);
  const index = draft.party.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`Membre introuvable : ${id}`);
  draft.party[index] = { ...draft.party[index], ...patch };
  return draft;
}

/** Repousse tous les événements de la timeline pour isoler un comportement. */
export function isolateTimers(state: GameState, ms = 10_000_000): GameState {
  const draft = cloneState(state);
  draft.timers = { manaTickMs: ms, tankDamageMs: ms, aoeMs: ms, spikeMs: ms };
  return draft;
}

/** Force n'importe quel champ du state. */
export function patchState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...cloneState(state), ...patch };
}

/**
 * Débloque les sorts de haut niveau et donne assez de mana pour les lancer.
 * Les tables de stats ne couvrant que le niveau 1, seul le gating des sorts
 * change : les PV et la régénération restent ceux du niveau 1.
 */
export function unlockAllSpells(state: GameState, mana = 1000): GameState {
  return patchState(state, { playerLevel: 60, mana, manaMax: Math.max(mana, MANA.max) });
}

/** Somme des HP du groupe (utile pour détecter un événement de dégâts). */
export function totalHp(state: GameState): number {
  return state.party.reduce((sum, member) => sum + member.hp, 0);
}
