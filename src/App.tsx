/**
 * Application root.
 *
 * `App` never re-renders during a fight: the store is held by a `useRef` and
 * every child subscribes to its own snapshot.
 */

import { useCallback, useRef } from 'react';
import { Controls } from './components/Controls';
import { GameOver } from './components/GameOver';
import { Header } from './components/Header';
import { MessageFeed } from './components/CombatFeedback';
import { PartyList } from './components/PartyList';
import { DEFAULT_SEED } from './config/gameConfig';
import { GameStoreContext } from './hooks/useGameStore';
import { useGameLoop } from './hooks/useGameLoop';
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

export default function App() {
  const storeRef = useRef<GameStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createGameStore(readInitialSeed());
  }
  const store = storeRef.current;

  useGameLoop(store);

  const handleRestart = useCallback(() => {
    store.restart(Date.now() >>> 0);
  }, [store]);

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
        <GameOver onRestart={handleRestart} />
      </div>
    </GameStoreContext.Provider>
  );
}
