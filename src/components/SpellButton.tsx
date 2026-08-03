/**
 * Bouton de sort (72 × 72 px minimum, cible tactile confortable).
 *
 * La progression du GCD est portée par la variable CSS `--gcd-progress`
 * placée sur le conteneur des contrôles : aucun rendu React n'est nécessaire
 * pour l'animer.
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

  const className = ['spell', spell.disabled ? 'spell--disabled' : '', spell.locked ? 'spell--locked' : '']
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
          ? `${spell.name} (rang ${spell.rank}) — appris au niveau ${spell.requiredLevel}`
          : spell.disabled && spell.reason
            ? REFUSAL_MESSAGES[spell.reason]
            : `${spell.name} (rang ${spell.rank})`
      }
    >
      <span className="spell__gcd" aria-hidden="true" />
      <span className="spell__name">{spell.name}</span>
      {spell.locked ? (
        <span className="spell__lock">Niv. {spell.requiredLevel}</span>
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
