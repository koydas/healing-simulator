/**
 * Combat feedback: floating numbers on the frames, and global messages.
 *
 * Expired events are pruned by the engine (`pruneFeedback`), so nothing can
 * accumulate on the React side: we simply render the current list.
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

/** Floating numbers shown on a party frame. */
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

/** Message strip: cast refusals, cancellations, deaths. */
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
