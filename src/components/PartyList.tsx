/** The five party frames. */

import { memo } from 'react';
import { useMemberIds } from '../hooks/useGameStore';
import { PartyFrame } from './PartyFrame';

export const PartyList = memo(function PartyList() {
  const memberIds = useMemberIds();

  return (
    <section className="party" aria-label="Party">
      {memberIds.map((id) => (
        <PartyFrame key={id} memberId={id} />
      ))}
    </section>
  );
});
