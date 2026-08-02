/**
 * Barre de mana.
 *
 * Le remplissage et la valeur numérique sont mis à jour via refs DOM à chaque
 * frame : la mana change en continu, un rendu React serait du gaspillage.
 */

import { memo, useCallback, useRef } from 'react';
import { useFrame } from '../hooks/useGameStore';
import { getManaRatio } from '../simulation/selectors';

export const ManaBar = memo(function ManaBar() {
  const barRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  useFrame(
    useCallback((state) => {
      const bar = barRef.current;
      if (bar) {
        bar.style.setProperty('--mana-fill', `${getManaRatio(state) * 100}%`);
      }
      const value = valueRef.current;
      if (value) {
        const label = `${Math.floor(state.mana)} / ${state.manaMax}`;
        if (value.textContent !== label) {
          value.textContent = label;
        }
      }
    }, []),
  );

  return (
    <div className="manabar" ref={barRef}>
      <div className="manabar__track">
        <div className="manabar__fill" />
      </div>
      <span className="manabar__value" ref={valueRef} />
    </div>
  );
});
