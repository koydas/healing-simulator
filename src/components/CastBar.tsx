/**
 * Cast bar.
 *
 * Progress is written straight into a CSS variable on every frame: the
 * animation triggers no React render. Only the spell name and the appearance
 * of the Cancel button go through a snapshot.
 *
 * Idle, the bar shows nothing at all: an empty track labelled "Ready" read as
 * a full-width button sitting above the spells, and tapping it did nothing.
 * The whole row is hidden with `visibility` rather than removed, so it keeps
 * its height and nothing below it — the mana bar, the spell buttons — moves
 * when a cast starts. The Cancel button is rendered at all times for the same
 * reason: it is what makes the row 40 px tall, and `visibility: hidden` already
 * takes it out of the tab order and out of reach of a tap.
 */

import { memo, useCallback, useRef } from 'react';
import { useControlsSnapshot, useFrame, useStore } from '../hooks/useGameStore';
import { getCastProgress } from '../simulation/selectors';

export const CastBar = memo(function CastBar() {
  const store = useStore();
  const controls = useControlsSnapshot();
  const barRef = useRef<HTMLDivElement>(null);

  useFrame(
    useCallback((state) => {
      const node = barRef.current;
      if (!node) return;
      node.style.setProperty('--cast-progress', `${getCastProgress(state) * 100}%`);
    }, []),
  );

  const handleCancel = useCallback(() => {
    store.cancel();
  }, [store]);

  return (
    <div className="castbar" ref={barRef} data-casting={controls.casting ? 'true' : 'false'}>
      <div className="castbar__track">
        <div className="castbar__fill" />
        <span className="castbar__label">{controls.castSpellName}</span>
      </div>
      <button type="button" className="castbar__cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
});
