/**
 * Enemy selection: the list of encounters on the home screen.
 *
 * Rendered before any fight exists (no `GameStoreContext`, no engine state):
 * `App` only creates a store once one of these cards is tapped.
 */

import { memo, useEffect, useRef } from 'react';
import { ENEMIES, ENEMY_ORDER } from '../config/gameConfig';
import type { EnemyId } from '../simulation/types';

interface EnemySelectProps {
  onSelect: (enemyId: EnemyId) => void;
}

export const EnemySelect = memo(function EnemySelect({ onSelect }: EnemySelectProps) {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Land the keyboard focus on the first choice instead of `<body>`, but
  // without `preventScroll` the browser would scroll the character sheet out
  // of view on mount — the sheet sits above this list and is the first thing
  // the player is meant to see.
  useEffect(() => {
    firstButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="enemy-select" aria-labelledby="enemy-select-title">
      <h2 className="enemy-select__title" id="enemy-select-title">
        Choose an enemy
      </h2>

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
    </section>
  );
});
