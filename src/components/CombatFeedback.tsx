/**
 * Feedback de combat : nombres flottants sur les frames et messages globaux.
 *
 * Les événements expirés sont supprimés par le moteur (`pruneFeedback`), donc
 * aucune accumulation n'est possible côté React : on se contente d'afficher la
 * liste courante.
 */

import { memo } from 'react';
import { useMessagesSnapshot } from '../hooks/useGameStore';
import type { FeedbackEvent } from '../simulation/types';

interface MemberFeedbackProps {
  events: FeedbackEvent[];
}

function formatAmount(event: FeedbackEvent): string {
  switch (event.kind) {
    case 'heal':
      return `+${event.amount}`;
    case 'overheal':
      return `+${event.amount}`;
    case 'damage':
      return `−${event.amount}`;
    default:
      return event.text ?? '';
  }
}

/** Nombres flottants affichés sur une frame de groupe. */
export const MemberFeedback = memo(function MemberFeedback({ events }: MemberFeedbackProps) {
  if (events.length === 0) return null;

  return (
    <span className="feedback" aria-hidden="true">
      {events.slice(-4).map((event) => (
        <span key={event.id} className={`feedback__item feedback__item--${event.kind}`}>
          {formatAmount(event)}
        </span>
      ))}
    </span>
  );
});

/** Bandeau de messages : refus de lancement, annulations, morts. */
export const MessageFeed = memo(function MessageFeed() {
  const messages = useMessagesSnapshot();
  const visible = messages.slice(-3);

  return (
    <div className="messages" role="status" aria-live="polite">
      {visible.map((event) => (
        <p key={event.id} className={`messages__item messages__item--${event.kind}`}>
          {event.text}
        </p>
      ))}
    </div>
  );
});
