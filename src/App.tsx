/**
 * Application root.
 *
 * Before any fight there is no `GameState` at all: `App` shows the enemy
 * selection screen and only creates a store — inside `Fight` — once a choice
 * is made. `Fight` never re-renders during a fight: the store is held by a
 * `useRef` and every child subscribes to its own snapshot.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Controls } from './components/Controls';
import { EnemySelect } from './components/EnemySelect';
import { GameOver } from './components/GameOver';
import { Header } from './components/Header';
import { MessageFeed } from './components/CombatFeedback';
import { PartyList } from './components/PartyList';
import { DEFAULT_SEED, ENEMY_ORDER } from './config/gameConfig';
import { GameStoreContext } from './hooks/useGameStore';
import { useGameLoop } from './hooks/useGameLoop';
import type { EnemyId } from './simulation/types';
import { createGameStore, type GameStore } from './store/gameStore';

/**
 * Starting seed: `?seed=123` in the URL replays a fight exactly, otherwise the
 * real clock is used (only here, never inside the engine).
 */
function readInitialSeed(): number {
  if (typeof window === 'undefined') return DEFAULT_SEED;
  const parameter = new URLSearchParams(window.location.search).get('seed');
  if (parameter === null) return Date.now() >>> 0;
  const parsed = Number.parseInt(parameter, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SEED;
}

/**
 * `?enemy=skarn` in the URL skips the selection screen and pins the
 * encounter, the same way `?seed=` pins the fight itself — without this, a
 * shared `?seed=` URL for Skarn or Threx would still land on the selection
 * screen and could replay against the wrong enemy, breaking the exact-replay
 * contract from ADR-0005.
 */
function readInitialEnemyId(): EnemyId | null {
  if (typeof window === 'undefined') return null;
  const parameter = new URLSearchParams(window.location.search).get('enemy');
  return (ENEMY_ORDER as readonly string[]).includes(parameter ?? '')
    ? (parameter as EnemyId)
    : null;
}

/**
 * Writes the currently displayed fight's seed and enemy into the URL, so
 * copying or reloading it always reproduces *that* fight — called on mount
 * and again on every "New fight", since a rematch rolls a fresh seed that
 * would otherwise leave the address bar pointing at the previous one.
 */
function syncFightUrl(seed: number, enemyId: EnemyId): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('enemy', enemyId);
  window.history.replaceState(null, '', url);
}

interface FightProps {
  enemyId: EnemyId;
  /** Back to the enemy selection screen — tears the store down entirely. */
  onChangeEnemy: () => void;
}

function Fight({ enemyId, onChangeEnemy }: FightProps) {
  const storeRef = useRef<GameStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createGameStore(readInitialSeed(), enemyId);
  }
  const store = storeRef.current;

  useGameLoop(store);

  // Encode the resolved seed and enemy into the URL once, on mount: whatever
  // wasn't already pinned by the visitor (an auto-generated seed, an enemy
  // picked on the selection screen) becomes part of a shareable link that
  // reproduces this exact fight — the other half of the ADR-0005 contract
  // `readInitialSeed` / `readInitialEnemyId` only read from.
  useEffect(() => {
    syncFightUrl(store.getState().initialSeed, enemyId);
    // `store` and `enemyId` are both fixed for the lifetime of this
    // component (a new enemy remounts `Fight` entirely) — this only needs to
    // run once, the rematch case is handled by `handleRestart` itself.
  }, [store, enemyId]);

  const handleRestart = useCallback(() => {
    const seed = Date.now() >>> 0;
    store.restart(seed, enemyId);
    // A rematch rolls a fresh seed: without this the address bar would keep
    // pointing at the fight that just ended instead of the one on screen.
    syncFightUrl(seed, enemyId);
  }, [store, enemyId]);

  return (
    <GameStoreContext.Provider value={store}>
      <div className="app">
        <Header />
        <main className="app__main">
          <PartyList />
        </main>
        {/* Outside the scroller on purpose: the party can overflow on short
            viewports, and a refusal message that scrolls out of sight makes a
            rejected cast look like a dead button. */}
        <MessageFeed />
        <Controls />
        <GameOver onRestart={handleRestart} onChangeEnemy={onChangeEnemy} />
      </div>
    </GameStoreContext.Provider>
  );
}

export default function App() {
  const [enemyId, setEnemyId] = useState<EnemyId | null>(readInitialEnemyId);

  if (enemyId === null) {
    return <EnemySelect onSelect={setEnemyId} />;
  }

  return <Fight key={enemyId} enemyId={enemyId} onChangeEnemy={() => setEnemyId(null)} />;
}
