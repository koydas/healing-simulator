/**
 * Cast bar.
 *
 * Progress is written straight into a CSS variable on every frame: the
 * animation triggers no React render. Only the spell name and the appearance
 * of the Cancel button go through a snapshot.
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
        <span className="castbar__label">
          {controls.casting ? controls.castSpellName : 'Ready'}
        </span>
      </div>
      <button
        type="button"
        className="castbar__cancel"
        onClick={handleCancel}
        hidden={!controls.casting}
      >
        Cancel
      </button>
    </div>
  );
});
