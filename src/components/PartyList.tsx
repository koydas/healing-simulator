/** Liste des cinq frames du groupe. */

import { memo } from 'react';
import { useMemberIds } from '../hooks/useGameStore';
import { PartyFrame } from './PartyFrame';

export const PartyList = memo(function PartyList() {
  const memberIds = useMemberIds();

  return (
    <section className="party" aria-label="Groupe">
      {memberIds.map((id) => (
        <PartyFrame key={id} memberId={id} />
      ))}
    </section>
  );
});
