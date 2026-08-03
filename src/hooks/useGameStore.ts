/**
 * React access to the game store.
 *
 * Every hook subscribes to one precise snapshot through `useSyncExternalStore`:
 * React compares the returned reference and only re-renders the component when
 * ITS snapshot actually changed.
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
    throw new Error('useStore must be used inside GameStoreContext.Provider');
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
 * Runs a callback on every frame with the current engine state.
 * Used to animate bars through CSS variables, without a React render.
 * Unsubscription happens automatically on unmount.
 */
export function useFrame(callback: (state: GameState) => void): void {
  const store = useStore();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => store.onFrame((state) => callbackRef.current(state)), [store]);
}
