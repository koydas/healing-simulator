/**
 * Racine de l'application.
 *
 * `App` ne se re-rend jamais pendant une partie : le store est détenu par un
 * `useRef` et chaque sous-composant s'abonne à son propre snapshot.
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
 * Seed de départ : `?seed=123` dans l'URL pour rejouer une partie à
 * l'identique, sinon l'horloge réelle (utilisée uniquement ici, jamais dans le
 * moteur).
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
          <MessageFeed />
        </main>
        <Controls />
        <GameOver onRestart={handleRestart} />
      </div>
    </GameStoreContext.Provider>
  );
}
