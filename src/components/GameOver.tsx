/** Écran de fin de partie : statistiques complètes et relance. */

import { memo } from 'react';
import { useHeaderSnapshot, useSummarySnapshot } from '../hooks/useGameStore';

interface GameOverProps {
  onRestart: () => void;
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export const GameOver = memo(function GameOver({ onRestart }: GameOverProps) {
  const summary = useSummarySnapshot();
  const header = useHeaderSnapshot();

  if (!summary) return null;

  return (
    <div className="gameover" role="dialog" aria-modal="true" aria-label="Fin de partie">
      <div className="gameover__panel">
        <h2 className="gameover__title">Wipe</h2>
        <p className="gameover__duration">
          Survie : <strong>{summary.durationLabel}</strong>
        </p>

        <dl className="gameover__grid">
          <div className="gameover__row">
            <dt>HPS</dt>
            <dd>{decimal.format(summary.hps)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Soin effectif</dt>
            <dd>{integer.format(summary.effectiveHealing)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Soin brut</dt>
            <dd>{integer.format(summary.rawHealing)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Overheal</dt>
            <dd>
              {integer.format(summary.overhealing)} ({decimal.format(summary.overhealPct)} %)
            </dd>
          </div>
          <div className="gameover__row">
            <dt>Mana dépensée</dt>
            <dd>{integer.format(summary.manaSpent)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Soin / mana</dt>
            <dd>{decimal.format(summary.manaEfficiency)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Dégâts encaissés</dt>
            <dd>{integer.format(summary.damageTaken)}</dd>
          </div>
          <div className="gameover__row">
            <dt>Casts annulés</dt>
            <dd>{summary.castsCancelled}</dd>
          </div>
        </dl>

        <h3 className="gameover__subtitle">Sorts</h3>
        <table className="gameover__table">
          <thead>
            <tr>
              <th scope="col">Sort</th>
              <th scope="col">Commencés</th>
              <th scope="col">Complétés</th>
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

        <h3 className="gameover__subtitle">Morts</h3>
        <p className="gameover__deaths">
          {summary.deaths.length > 0
            ? summary.deaths.map((death) => death.name).join(', ')
            : 'Aucune'}
        </p>

        <p className="gameover__seed">Seed : {header.seed}</p>

        <button type="button" className="gameover__restart" onClick={onRestart}>
          Nouvelle partie
        </button>
      </div>
    </div>
  );
});
