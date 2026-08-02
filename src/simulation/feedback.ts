/**
 * Gestion des feedbacks de combat (nombres flottants et messages).
 *
 * Les feedbacks sont datés avec l'horloge de simulation (`state.elapsedMs`) :
 * aucune horloge réelle n'intervient. Ils sont purgés à chaque pas et la liste
 * est plafonnée, ce qui garantit l'absence d'accumulation mémoire.
 */

import { FEEDBACK } from '../config/gameConfig';
import type { FeedbackEvent, FeedbackKind, GameState } from './types';

interface FeedbackInput {
  kind: FeedbackKind;
  targetId?: string | null;
  amount?: number;
  text?: string | null;
  lifetimeMs?: number;
}

/** Ajoute un feedback au brouillon d'état (mutation locale, jamais sur l'état d'entrée). */
export function pushFeedback(draft: GameState, input: FeedbackInput): void {
  const lifetimeMs =
    input.lifetimeMs ??
    (input.kind === 'message' || input.kind === 'death'
      ? FEEDBACK.messageLifetimeMs
      : FEEDBACK.lifetimeMs);

  const event: FeedbackEvent = {
    id: draft.nextFeedbackId,
    kind: input.kind,
    targetId: input.targetId ?? null,
    amount: input.amount ?? 0,
    text: input.text ?? null,
    createdAtMs: draft.elapsedMs,
    expiresAtMs: draft.elapsedMs + lifetimeMs,
  };

  draft.nextFeedbackId += 1;
  draft.feedback = [...draft.feedback, event];

  if (draft.feedback.length > FEEDBACK.maxEntries) {
    draft.feedback = draft.feedback.slice(draft.feedback.length - FEEDBACK.maxEntries);
  }
}

/** Supprime les feedbacks expirés. */
export function pruneFeedback(draft: GameState): void {
  if (draft.feedback.length === 0) return;
  const kept = draft.feedback.filter((event) => event.expiresAtMs > draft.elapsedMs);
  if (kept.length !== draft.feedback.length) {
    draft.feedback = kept;
  }
}
