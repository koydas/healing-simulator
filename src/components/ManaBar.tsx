/**
 * Mana bar.
 *
 * Fill and numeric value are updated through DOM refs on every frame: mana
 * changes constantly, so a React render would be pure waste.
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
        <span className="manabar__value" ref={valueRef} />
      </div>
    </div>
  );
});
