/** Header: boss, timer, damage multiplier, pause / resume. */

import { memo, useCallback, type CSSProperties } from 'react';
import { useHeaderSnapshot, useStore } from '../hooks/useGameStore';


const BOSS_EMOJI: Record<string, string> = {
  gorvath: '🪨',
  skarn: '🪲',
  threx: '🦏',
};

function bossAnimationClass(header: ReturnType<typeof useHeaderSnapshot>): string {
  if (header.status !== 'active') return 'boss-portrait--idle';
  const elapsedMs = header.elapsedMs;
  const cycle = elapsedMs % 6000;
  if (cycle < 520) return 'boss-portrait--attack';
  if (cycle >= 2000 && cycle < 2500) return 'boss-portrait--hurt';
  if (cycle >= 4300 && cycle < 5050) return `boss-portrait--${header.enemyId}-joke`;
  return 'boss-portrait--idle';
}

export const Header = memo(function Header() {
  const store = useStore();
  const header = useHeaderSnapshot();

  const handleToggle = useCallback(() => {
    store.toggle();
  }, [store]);

  const paused = header.status === 'paused';
  const over = header.status === 'over';

  const bossHpFillClass =
    header.bossHpRatio <= 0.25
      ? 'header__bossbar-fill header__bossbar-fill--near-death'
      : header.bossHpRatio <= 0.5
        ? 'header__bossbar-fill header__bossbar-fill--half'
        : 'header__bossbar-fill';

  return (
    <header className="header">
      <div className="header__top">
        <div
          className={`boss-portrait boss-portrait--${header.enemyId} ${bossAnimationClass(header)}`}
          aria-hidden="true"
          style={{ '--boss-hp': header.bossHpRatio } as CSSProperties}
        >
          <span className="boss-portrait__shadow" />
          <span className="boss-portrait__body">
            <span className="boss-portrait__horn boss-portrait__horn--left" />
            <span className="boss-portrait__horn boss-portrait__horn--right" />
            <span className="boss-portrait__eye boss-portrait__eye--left" />
            <span className="boss-portrait__eye boss-portrait__eye--right" />
            <span className="boss-portrait__mouth" />
            <span className="boss-portrait__badge">{BOSS_EMOJI[header.enemyId]}</span>
          </span>
          <span className="boss-portrait__arm boss-portrait__arm--left" />
          <span className="boss-portrait__arm boss-portrait__arm--right" />
        </div>

        <div className="header__boss">
          <h1 className="header__name">
            {header.bossName} <span className="header__level">lv. {header.bossLevel}</span>
          </h1>
          <p className="header__subtitle">{header.bossSubtitle}</p>
        </div>

        <div className="header__stats">
          <span className="header__timer" aria-label="Survival time">
            {header.timeLabel}
          </span>
          <span className="header__multiplier" aria-label="Damage multiplier">
            ×{header.damageMultiplier.toFixed(2)}
          </span>
          <span className="header__alive" aria-label="Members alive">
            {header.aliveCount}/5
          </span>
        </div>

        <button
          type="button"
          className="header__pause"
          onClick={handleToggle}
          disabled={over}
          aria-label={paused ? 'Resume' : 'Pause'}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      <div
        className="header__bossbar"
        role="progressbar"
        aria-label={`${header.bossName} health`}
        aria-valuenow={header.bossHp}
        aria-valuemin={0}
        aria-valuemax={header.bossHpMax}
      >
        <div className={bossHpFillClass} style={{ width: `${header.bossHpPercent}%` }} />
        <span className="header__bossbar-label">
          {header.bossHp} / {header.bossHpMax}
        </span>
      </div>
    </header>
  );
});
