/** End-of-fight screen: full statistics and restart. */

import { memo, useEffect, useRef } from 'react';
import { useHeaderSnapshot, useSummarySnapshot } from '../hooks/useGameStore';
import type { StatsSummary } from '../simulation/selectors';

interface GameOverProps {
  onRestart: () => void;
  onChangeEnemy: () => void;
}

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * `GameOver` only subscribes; the dialog is a separate component so that its
 * focus effect runs on mount — which is exactly when the wipe happens — instead
 * of being skipped by an early `return null`.
 */
export const GameOver = memo(function GameOver({ onRestart, onChangeEnemy }: GameOverProps) {
  const summary = useSummarySnapshot();

  if (!summary) return null;
  return <GameOverDialog summary={summary} onRestart={onRestart} onChangeEnemy={onChangeEnemy} />;
});

const GameOverDialog = memo(function GameOverDialog({
  summary,
  onRestart,
  onChangeEnemy,
}: GameOverProps & { summary: StatsSummary }) {
  const header = useHeaderSnapshot();
  const dialogRef = useRef<HTMLDivElement>(null);

  /**
   * `aria-modal` tells assistive technology the rest of the page is out of
   * play, but it does not move focus and it does not stop Tab: measured before
   * this effect existed, a wipe left focus on `<body>` and six consecutive Tabs
   * all landed on party frames and spell buttons *behind* the overlay.
   *
   * So do both things the attribute only claims: take focus into the dialog,
   * and mark the siblings `inert` so the obscured controls leave the tab order
   * entirely. Marking siblings rather than wrapping them keeps the flex layout
   * of `.app` untouched — that layout has been fragile enough already.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const siblings = Array.from(dialog.parentElement?.children ?? []).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== dialog,
    );
    const alreadyInert = siblings.filter((child) => child.hasAttribute('inert'));
    siblings.forEach((child) => child.setAttribute('inert', ''));

    // Focus the dialog itself, not the button: a screen reader then announces
    // the label and the statistics the player is here to read, rather than
    // jumping straight to "New fight".
    dialog.focus();

    return () => {
      siblings
        .filter((child) => !alreadyInert.includes(child))
        .forEach((child) => child.removeAttribute('inert'));
    };
  }, []);

  const victory = summary.outcome === 'victory';

  return (
    <div
      className={`gameover${victory ? ' gameover--victory' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
      tabIndex={-1}
      ref={dialogRef}
    >
      <div className="gameover__panel">
        <h2 className="gameover__title" id="gameover-title">
          {victory ? 'Victory' : 'Wipe'}
        </h2>
        <p className="gameover__duration">
          {victory ? 'Boss defeated in' : 'Survived'}: <strong>{summary.durationLabel}</strong>
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
          New fight — {header.bossName}
        </button>
        <button type="button" className="gameover__change-enemy" onClick={onChangeEnemy}>
          Choose another enemy
        </button>
      </div>
    </div>
  );
});
