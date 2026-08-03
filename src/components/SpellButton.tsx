/**
 * Spell button (72 × 72 px minimum, a comfortable touch target).
 *
 * GCD progress is carried by the `--gcd-progress` CSS variable set on the
 * controls container: animating it needs no React render.
 */

import { memo, useCallback } from 'react';
import { REFUSAL_MESSAGES } from '../config/gameConfig';
import type { SpellId } from '../simulation/types';
import type { SpellSnapshot } from '../store/gameStore';

interface SpellButtonProps {
  spell: SpellSnapshot;
  onCast: (spellId: SpellId) => void;
}

export const SpellButton = memo(function SpellButton({ spell, onCast }: SpellButtonProps) {
  const handleClick = useCallback(() => {
    onCast(spell.id);
  }, [onCast, spell.id]);

  const className = [
    'spell',
    spell.disabled ? 'spell--disabled' : '',
    spell.locked ? 'spell--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      aria-disabled={spell.disabled}
      title={
        spell.locked
          ? `${spell.name} (rank ${spell.rank}) — learned at level ${spell.requiredLevel}`
          : spell.disabled && spell.reason
            ? REFUSAL_MESSAGES[spell.reason]
            : `${spell.name} (rank ${spell.rank})`
      }
    >
      <span className="spell__gcd" aria-hidden="true" />
      <span className="spell__name">{spell.name}</span>
      {spell.locked ? (
        <span className="spell__lock">Lv. {spell.requiredLevel}</span>
      ) : (
        <>
          <span className="spell__meta">
            <span className="spell__mana">{spell.manaCost}</span>
            <span className="spell__cast">{spell.castLabel}</span>
          </span>
          <span className="spell__description">{spell.description}</span>
        </>
      )}
    </button>
  );
});
