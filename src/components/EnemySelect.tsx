/**
 * Enemy selection: the list of encounters on the home screen, each card
 * carrying the player's record against that boss.
 *
 * Rendered before any fight exists (no `GameStoreContext`, no engine state):
 * `App` only creates a store once one of these cards is tapped. The records
 * come straight from the saved profile as props — they change at most once per
 * fight, so the store's snapshot machinery has nothing to do here.
 */

import { memo, useEffect, useRef } from 'react';
import { ENEMIES, ENEMY_ORDER } from '../config/gameConfig';
import type { BossRecord } from '../profile/playerProfile';
import type { EnemyId } from '../simulation/types';

const EMPTY_RECORD: BossRecord = { wins: 0, losses: 0 };

function recordLabel(record: BossRecord): string {
  const wins = `${record.wins} ${record.wins === 1 ? 'win' : 'wins'}`;
  const losses = `${record.losses} ${record.losses === 1 ? 'loss' : 'losses'}`;
  return `${wins}, ${losses}`;
}

interface EnemySelectProps {
  records: Record<EnemyId, BossRecord>;
  onSelect: (enemyId: EnemyId) => void;
}

export const EnemySelect = memo(function EnemySelect({ records, onSelect }: EnemySelectProps) {
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
          const record = records[id] ?? EMPTY_RECORD;
          return (
            <li key={id}>
              <button
                type="button"
                className="enemy-select__card"
                ref={index === 0 ? firstButtonRef : undefined}
                onClick={() => onSelect(id)}
              >
                <span className="enemy-select__top">
                  <span className="enemy-select__name">
                    {enemy.name}
                    <span className="enemy-select__level">lv. {enemy.level}</span>
                  </span>
                  {/* The `W` / `L` glyphs read as initials to a screen reader,
                      so the chip carries the spelled-out record as its label —
                      it lands in the button's accessible name in place of the
                      two digits. */}
                  <span className="enemy-select__record" aria-label={recordLabel(record)}>
                    {/* A boss never fought shows a dim 0W · 0L rather than a
                        green zero and a red zero, which read as results. */}
                    <span className={record.wins > 0 ? 'enemy-select__wins' : 'enemy-select__zero'}>
                      {record.wins}W
                    </span>
                    <span className="enemy-select__record-sep" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={record.losses > 0 ? 'enemy-select__losses' : 'enemy-select__zero'}
                    >
                      {record.losses}L
                    </span>
                  </span>
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
