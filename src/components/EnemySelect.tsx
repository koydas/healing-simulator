/**
 * Opening screen: pick which enemy to face before a fight starts.
 *
 * Rendered instead of the fight (no `GameStoreContext` yet, no engine state):
 * `App` only creates a store once an enemy is chosen.
 */

import { memo, useEffect, useRef } from 'react';
import { ENEMIES, ENEMY_ORDER } from '../config/gameConfig';
import type { EnemyId } from '../simulation/types';

interface EnemySelectProps {
  onSelect: (enemyId: EnemyId) => void;
}

export const EnemySelect = memo(function EnemySelect({ onSelect }: EnemySelectProps) {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Nothing else is mounted yet, so there is no focus trap to set up — just
  // land the keyboard focus on the first choice instead of `<body>`.
  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  return (
    <div className="enemy-select">
      <div className="enemy-select__panel">
        <h1 className="enemy-select__title">Healing Simulator</h1>
        <p className="enemy-select__intro">Choose an enemy to face.</p>

        <ul className="enemy-select__list">
          {ENEMY_ORDER.map((id, index) => {
            const enemy = ENEMIES[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  className="enemy-select__card"
                  ref={index === 0 ? firstButtonRef : undefined}
                  onClick={() => onSelect(id)}
                >
                  <span className="enemy-select__name">
                    {enemy.name}
                    <span className="enemy-select__level">lv. {enemy.level}</span>
                  </span>
                  <span className="enemy-select__subtitle">{enemy.subtitle}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
});
