/** End-of-fight screen: full statistics and restart. */

import { memo, useEffect, useRef } from 'react';
import { useHeaderSnapshot, useSummarySnapshot } from '../hooks/useGameStore';
import type { FightReward } from '../profile/playerProfile';
import type { StatsSummary } from '../simulation/selectors';

interface GameOverProps {
  /**
   * What the fight did to the profile — `null` until it has been recorded,
   * and permanently `null` when `levelMismatch` is true.
   */
  reward: FightReward | null;
  /**
   * True when this fight was played at a level a replay URL pinned, different
   * from the current profile: it is not credited (ADR-0005) — the numbers
   * below still describe what actually happened in the fight itself.
   */
  levelMismatch: boolean;
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
export const GameOver = memo(function GameOver({
  reward,
  levelMismatch,
  onRestart,
  onChangeEnemy,
}: GameOverProps) {
  const summary = useSummarySnapshot();

  if (!summary) return null;
  return (
    <GameOverDialog
      summary={summary}
      reward={reward}
      levelMismatch={levelMismatch}
      onRestart={onRestart}
      onChangeEnemy={onChangeEnemy}
    />
  );
});

const GameOverDialog = memo(function GameOverDialog({
  summary,
  reward,
  levelMismatch,
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

        {levelMismatch ? (
          <p className="gameover__xp gameover__xp--mismatch">
            Fought at a level your saved character isn't — not recorded, no
            experience gained.
          </p>
        ) : reward ? (
          <p className="gameover__xp">
            {reward.xpGained > 0
              ? `Experience gained: +${integer.format(reward.xpGained)}`
              : victory
                ? 'No experience — already at the level cap'
                : 'No experience — the boss has to die for that'}
            {reward.levelAfter > reward.levelBefore ? (
              <strong className="gameover__levelup">
                {' '}
                Level {reward.levelBefore} → {reward.levelAfter}
              </strong>
            ) : null}
          </p>
        ) : null}

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
