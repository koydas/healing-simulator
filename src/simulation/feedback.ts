/**
 * Combat feedback handling (floating numbers and messages).
 *
 * Feedback is timestamped with the simulation clock (`state.elapsedMs`): no
 * real clock is involved. Expired entries are pruned on every step and the list
 * is capped, which guarantees no memory build-up.
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

/** Adds feedback to the draft state (local mutation, never on the input state). */
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

/** Removes expired feedback. */
export function pruneFeedback(draft: GameState): void {
  if (draft.feedback.length === 0) return;
  const kept = draft.feedback.filter((event) => event.expiresAtMs > draft.elapsedMs);
  if (kept.length !== draft.feedback.length) {
    draft.feedback = kept;
  }
}
