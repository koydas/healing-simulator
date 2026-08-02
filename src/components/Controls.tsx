/**
 * Zone de contrôles : barre de cast, barre de mana et boutons de sorts.
 *
 * La progression du GCD est écrite une seule fois par frame sur le conteneur
 * (`--gcd-progress`), ce qui anime tous les boutons sans rendu React.
 */

import { memo, useCallback, useRef } from 'react';
import { useControlsSnapshot, useFrame, useStore } from '../hooks/useGameStore';
import { getGcdProgress } from '../simulation/selectors';
import type { SpellId } from '../simulation/types';
import { CastBar } from './CastBar';
import { ManaBar } from './ManaBar';
import { SpellButton } from './SpellButton';

export const Controls = memo(function Controls() {
  const store = useStore();
  const controls = useControlsSnapshot();
  const containerRef = useRef<HTMLDivElement>(null);

  useFrame(
    useCallback((state) => {
      const node = containerRef.current;
      if (!node) return;
      node.style.setProperty('--gcd-progress', `${getGcdProgress(state) * 100}%`);
    }, []),
  );

  const handleCast = useCallback(
    (spellId: SpellId) => {
      store.cast(spellId);
    },
    [store],
  );

  return (
    <section className="controls" ref={containerRef} aria-label="Contrôles">
      <CastBar />
      <ManaBar />
      <div className="controls__spells">
        {controls.spells.map((spell) => (
          <SpellButton key={spell.id} spell={spell} onCast={handleCast} />
        ))}
      </div>
    </section>
  );
});
