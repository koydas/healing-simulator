/** End-of-fight screen: full statistics and restart. */

import { memo } from 'react';
import { useHeaderSnapshot, useSummarySnapshot } from '../hooks/useGameStore';

interface GameOverProps {
  onRestart: () => void;
}

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const GameOver = memo(function GameOver({ onRestart }: GameOverProps) {
  const summary = useSummarySnapshot();
  const header = useHeaderSnapshot();

  if (!summary) return null;

  return (
    <div className="gameover" role="dialog" aria-modal="true" aria-label="Fight over">
      <div className="gameover__panel">
        <h2 className="gameover__title">Wipe</h2>
        <p className="gameover__duration">
          Survived: <strong>{summary.durationLabel}</strong>
        </p>

        <dl className="gameover__grid">
          <div className="gameover__row">
            <dt>HPS</dt>
            <dd>{decimal.format(summary.hps)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Effective healing</dt>
            <dd>{integer.format(summary.effectiveHealing)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Raw healing</dt>
            <dd>{integer.format(summary.rawHealing)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Overhealing</dt>
            <dd>
              {integer.format(summary.overhealing)} ({decimal.format(summary.overhealPct)}%)
            </dd>
          </div>
          <div className="gameover__row">
            <dt>Mana spent</dt>
            <dd>{integer.format(summary.manaSpent)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Healing per mana</dt>
            <dd>{decimal.format(summary.manaEfficiency)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Damage taken</dt>
            <dd>{integer.format(summary.damageTaken)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Casts cancelled</dt>
            <dd>{summary.castsCancelled}</dd>
          </div>
        </dl>

        <h3 className="gameover__subtitle">Spells</h3>
        <table className="gameover__table">
          <thead>
            <tr>
              <th scope="col">Spell</th>
              <th scope="col">Started</th>
              <th scope="col">Completed</th>
            </tr>
          </thead>
          <tbody>
            {summary.casts.map((cast) => (
              <tr key={cast.spellId}>
                <td>{cast.name}</td>
                <td>{cast.started}</td>
                <td>{cast.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="gameover__subtitle">Deaths</h3>
        <p className="gameover__deaths">
          {summary.deaths.length > 0
            ? summary.deaths.map((death) => death.name).join(', ')
            : 'None'}
        </p>

        <p className="gameover__seed">Seed: {header.seed}</p>

        <button type="button" className="gameover__restart" onClick={onRestart}>
          New fight
        </button>
      </div>
    </div>
  );
});
