/**
 * Actions du joueur — fonctions pures `(state, payload) => state`.
 *
 * Aucune action n'utilise l'horloge réelle : elles s'intercalent entre deux
 * pas de simulation et sont donc rejouables à l'identique.
 */

import {
  CANCEL_MESSAGE,
  GCD_MS,
  REFUSAL_MESSAGES,
  SPELLS,
  type CastRefusalReason,
} from '../config/gameConfig';
import { applySpellEffect, findMember } from './effects';
import { pushFeedback } from './feedback';
import { cloneState, createInitialState } from './initialState';
import { cancelActiveCast } from './simulation';
import type { GameState, SpellId } from './types';

export interface CastCheck {
  allowed: boolean;
  reason: CastRefusalReason | null;
}

/**
 * Vérifie si un sort peut être lancé, sans modifier l'état.
 * L'ordre des vérifications détermine le message affiché en cas de refus.
 */
export function checkCast(state: GameState, spellId: SpellId): CastCheck {
  const spell = SPELLS[spellId];

  if (state.status === 'over') return { allowed: false, reason: 'game_over' };
  if (state.status !== 'active') return { allowed: false, reason: 'paused' };
  if (state.activeCast) return { allowed: false, reason: 'casting' };
  if (state.gcdRemainingMs > 0) return { allowed: false, reason: 'gcd' };

  if (spell.requiresTarget) {
    const target = findMember(state, state.selectedTargetId);
    if (!target) return { allowed: false, reason: 'no_target' };
    if (!target.alive) return { allowed: false, reason: 'target_dead' };
  }

  if (state.mana < spell.manaCost) return { allowed: false, reason: 'mana' };

  return { allowed: true, reason: null };
}

/** Sélectionne une cible (les membres morts ne sont pas ciblables). */
export function selectTarget(state: GameState, memberId: string): GameState {
  const member = findMember(state, memberId);
  if (!member || !member.alive) return state;
  if (state.selectedTargetId === memberId) return state;

  const draft = cloneState(state);
  draft.selectedTargetId = memberId;
  return draft;
}

/**
 * Lance un sort sur la cible sélectionnée.
 *
 * Un refus ne dépense ni mana ni GCD : il produit uniquement un message.
 * Un lancement accepté dépense la mana immédiatement et déclenche le GCD ;
 * les sorts instantanés appliquent leur effet sur-le-champ.
 */
export function castSpell(state: GameState, spellId: SpellId): GameState {
  const spell = SPELLS[spellId];
  const check = checkCast(state, spellId);

  if (!check.allowed) {
    const draft = cloneState(state);
    pushFeedback(draft, {
      kind: 'message',
      text: REFUSAL_MESSAGES[check.reason ?? 'game_over'],
    });
    return draft;
  }

  const draft = cloneState(state);
  const targetId = spell.requiresTarget ? draft.selectedTargetId : null;

  draft.mana = Math.max(0, draft.mana - spell.manaCost);
  draft.stats.manaSpent += spell.manaCost;
  draft.stats.castsStartedBySpell[spell.id] = (draft.stats.castsStartedBySpell[spell.id] ?? 0) + 1;
  draft.gcdRemainingMs = GCD_MS;
  draft.msSinceLastCastStart = 0;

  if (spell.castTimeMs <= 0) {
    applySpellEffect(draft, spell, targetId);
    draft.stats.castsCompletedBySpell[spell.id] =
      (draft.stats.castsCompletedBySpell[spell.id] ?? 0) + 1;
    return draft;
  }

  draft.activeCast = {
    spellId: spell.id,
    targetId,
    castTimeMs: spell.castTimeMs,
    elapsedMs: 0,
  };

  return draft;
}

/**
 * Annule le cast en cours à la demande du joueur.
 * La mana dépensée et le GCD sont conservés.
 */
export function cancelCast(state: GameState): GameState {
  if (!state.activeCast) return state;
  const draft = cloneState(state);
  cancelActiveCast(draft, CANCEL_MESSAGE);
  return draft;
}

/** Met la partie en pause (aucune progression tant que la pause dure). */
export function pauseGame(state: GameState): GameState {
  if (state.status !== 'active') return state;
  const draft = cloneState(state);
  draft.status = 'paused';
  return draft;
}

/** Reprend la partie. */
export function resumeGame(state: GameState): GameState {
  if (state.status !== 'paused') return state;
  const draft = cloneState(state);
  draft.status = 'active';
  return draft;
}

/** Bascule pause / reprise. */
export function togglePause(state: GameState): GameState {
  if (state.status === 'active') return pauseGame(state);
  if (state.status === 'paused') return resumeGame(state);
  return state;
}

/** Démarre une nouvelle partie avec la seed fournie. */
export function restartGame(seed: number): GameState {
  return createInitialState(seed);
}
