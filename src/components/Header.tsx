/** En-tête : boss, timer, multiplicateur de dégâts, pause / reprise. */

import { memo, useCallback } from 'react';
import { BOSS } from '../config/gameConfig';
import { useHeaderSnapshot, useStore } from '../hooks/useGameStore';

export const Header = memo(function Header() {
  const store = useStore();
  const header = useHeaderSnapshot();

  const handleToggle = useCallback(() => {
    store.toggle();
  }, [store]);

  const paused = header.status === 'paused';
  const over = header.status === 'over';

  return (
    <header className="header">
      <div className="header__boss">
        <h1 className="header__name">{header.bossName}</h1>
        <p className="header__subtitle">{BOSS.subtitle}</p>
      </div>

      <div className="header__stats">
        <span className="header__timer" aria-label="Durée de survie">
          {header.timeLabel}
        </span>
        <span className="header__multiplier" aria-label="Multiplicateur de dégâts">
          ×{header.damageMultiplier.toFixed(2)}
        </span>
        <span className="header__alive" aria-label="Membres en vie">
          {header.aliveCount}/5
        </span>
      </div>

      <button
        type="button"
        className="header__pause"
        onClick={handleToggle}
        disabled={over}
        aria-label={paused ? 'Reprendre' : 'Mettre en pause'}
      >
        {paused ? '▶' : '❚❚'}
      </button>
    </header>
  );
});
