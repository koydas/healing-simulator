/**
 * Accès React au store de jeu.
 *
 * Chaque hook s'abonne à un snapshot précis via `useSyncExternalStore` :
 * React compare la référence renvoyée et ne re-rend le composant que si SON
 * snapshot a réellement changé.
 */

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { StatsSummary } from '../simulation/selectors';
import type { FeedbackEvent, GameState } from '../simulation/types';
import type {
  ControlsSnapshot,
  GameStore,
  HeaderSnapshot,
  MemberSnapshot,
} from '../store/gameStore';

export const GameStoreContext = createContext<GameStore | null>(null);

export function useStore(): GameStore {
  const store = useContext(GameStoreContext);
  if (!store) {
    throw new Error('useStore doit être utilisé à l’intérieur de GameStoreContext.Provider');
  }
  return store;
}

export function useMemberIds(): string[] {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getMemberIds, store.getMemberIds);
}

export function useMemberSnapshot(memberId: string): MemberSnapshot {
  const store = useStore();
  const get = () => store.getMemberSnapshot(memberId);
  return useSyncExternalStore(store.subscribe, get, get);
}

export function useHeaderSnapshot(): HeaderSnapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getHeaderSnapshot, store.getHeaderSnapshot);
}

export function useControlsSnapshot(): ControlsSnapshot {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getControlsSnapshot,
    store.getControlsSnapshot,
  );
}

export function useMessagesSnapshot(): FeedbackEvent[] {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getMessagesSnapshot,
    store.getMessagesSnapshot,
  );
}

export function useSummarySnapshot(): StatsSummary | null {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSummarySnapshot, store.getSummarySnapshot);
}

/**
 * Exécute un callback à chaque frame avec l'état courant du moteur.
 * Utilisé pour animer les barres via des variables CSS, sans rendu React.
 * Le désabonnement est automatique au démontage.
 */
export function useFrame(callback: (state: GameState) => void): void {
  const store = useStore();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => store.onFrame((state) => callbackRef.current(state)), [store]);
}
