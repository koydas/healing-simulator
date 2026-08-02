/**
 * Frame d'un membre du groupe.
 *
 * `React.memo` + abonnement ciblé : ce composant ne se re-rend que lorsque
 * SON snapshot change (HP, mort, Renew, sélection, feedback).
 */

import { memo, useCallback, type CSSProperties } from 'react';
import { useMemberSnapshot, useStore } from '../hooks/useGameStore';
import { MemberFeedback } from './CombatFeedback';

interface PartyFrameProps {
  memberId: string;
}

function hpBarClass(ratio: number): string {
  if (ratio <= 0.3) return 'frame__fill frame__fill--critical';
  if (ratio <= 0.6) return 'frame__fill frame__fill--warning';
  return 'frame__fill';
}

export const PartyFrame = memo(function PartyFrame({ memberId }: PartyFrameProps) {
  const store = useStore();
  const member = useMemberSnapshot(memberId);

  const handleSelect = useCallback(() => {
    store.select(memberId);
  }, [store, memberId]);

  const className = [
    'frame',
    `frame--${member.role}`,
    member.selected ? 'frame--selected' : '',
    member.alive ? '' : 'frame--dead',
  ]
    .filter(Boolean)
    .join(' ');

  const style = { '--hp-fill': `${member.hpRatio * 100}%` } as CSSProperties;

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={handleSelect}
      disabled={!member.alive}
      aria-pressed={member.selected}
      aria-label={`${member.name}, ${member.roleLabel}, ${member.hpPercent} %`}
    >
      <span className="frame__header">
        <span className="frame__name">{member.name}</span>
        <span className="frame__role">{member.roleLabel}</span>
        {member.renewTicks > 0 && (
          <span className="frame__renew" title="Renew actif">
            ⟳ {member.renewTicks}
          </span>
        )}
      </span>

      <span className="frame__bar">
        <span className={hpBarClass(member.hpRatio)} />
        {!member.alive && <span className="frame__dead-label">MORT</span>}
      </span>

      <span className="frame__footer">
        <span className="frame__hp">
          {member.hp} / {member.hpMax}
        </span>
        <span className="frame__percent">{member.hpPercent} %</span>
      </span>

      <MemberFeedback events={member.feedback} />
    </button>
  );
});
