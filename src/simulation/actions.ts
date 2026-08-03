/**
 * Player actions — pure `(state, payload) => state` functions.
 *
 * No action reads the real clock: they slot in between two simulation steps and
 * are therefore replayable as-is.
 */

import {
  CANCEL_MESSAGE,
  GCD_MS,
  PLAYER_MEMBER_ID,
  REFUSAL_MESSAGES,
  SPELLS,
  isSpellUnlocked,
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
 * Checks whether a spell can be cast, without modifying the state.
 * The order of the checks determines which message is shown on refusal.
 */
export function checkCast(state: GameState, spellId: SpellId): CastCheck {
  const spell = SPELLS[spellId];

  if (state.status === 'over') return { allowed: false, reason: 'game_over' };
  if (state.status !== 'active') return { allowed: false, reason: 'paused' };
  // A dead healer casts nothing, even while the fight goes on around them.
  const caster = findMember(state, PLAYER_MEMBER_ID);
  if (!caster || !caster.alive) return { allowed: false, reason: 'caster_dead' };
  if (state.activeCast) return { allowed: false, reason: 'casting' };
  if (state.gcdRemainingMs > 0) return { allowed: false, reason: 'gcd' };
  // The spell must be trained: at level 1 only Lesser Heal is.
  if (!isSpellUnlocked(spell, state.playerLevel)) return { allowed: false, reason: 'level' };

  if (spell.requiresTarget) {
    const target = findMember(state, state.selectedTargetId);
    if (!target) return { allowed: false, reason: 'no_target' };
    if (!target.alive) return { allowed: false, reason: 'target_dead' };
  }

  if (state.mana < spell.manaCost) return { allowed: false, reason: 'mana' };

  return { allowed: true, reason: null };
}

/** Selects a target (dead members cannot be targeted). */
export function selectTarget(state: GameState, memberId: string): GameState {
  const member = findMember(state, memberId);
  if (!member || !member.alive) return state;
  if (state.selectedTargetId === memberId) return state;

  const draft = cloneState(state);
  draft.selectedTargetId = memberId;
  return draft;
}

/**
 * Casts a spell on the selected target.
 *
 * A refusal spends neither mana nor GCD: it only produces a message.
 * An accepted cast spends mana immediately and triggers the GCD; instant spells
 * apply their effect right away.
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
 * Cancels the active cast at the player's request.
 * Spent mana and the GCD are kept.
 */
export function cancelCast(state: GameState): GameState {
  if (!state.activeCast) return state;
  const draft = cloneState(state);
  cancelActiveCast(draft, CANCEL_MESSAGE);
  return draft;
}

/** Pauses the fight (nothing progresses while paused). */
export function pauseGame(state: GameState): GameState {
  if (state.status !== 'active') return state;
  const draft = cloneState(state);
  draft.status = 'paused';
  return draft;
}

/** Resumes the fight. */
export function resumeGame(state: GameState): GameState {
  if (state.status !== 'paused') return state;
  const draft = cloneState(state);
  draft.status = 'active';
  return draft;
}

/** Toggles pause / resume. */
export function togglePause(state: GameState): GameState {
  if (state.status === 'active') return pauseGame(state);
  if (state.status === 'paused') return resumeGame(state);
  return state;
}

/** Starts a new fight with the given seed. */
export function restartGame(seed: number): GameState {
  return createInitialState(seed);
}
