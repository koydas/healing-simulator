/**
 * Game loop — the only place in the project that reads the real clock.
 *
 * How it works:
 *   - `requestAnimationFrame` provides real time;
 *   - an accumulator slices that time into fixed `TICK_MS` steps;
 *   - catch-up is capped at `MAX_CATCHUP_MS` per frame;
 *   - beyond `LONG_STALL_MS` (background tab, sleep), the elapsed time is
 *     simply discarded: no catch-up at all.
 *
 * The rAF handle, the listeners and the accumulator are cleaned up on unmount.
 */

import { useEffect } from 'react';
import { LONG_STALL_MS, MAX_CATCHUP_MS, TICK_MS } from '../config/gameConfig';
import type { GameStore } from '../store/gameStore';

const MAX_STEPS_PER_FRAME = Math.floor(MAX_CATCHUP_MS / TICK_MS);

export function useGameLoop(store: GameStore): void {
  useEffect(() => {
    let rafId = 0;
    let lastTimestamp: number | null = null;
    let accumulator = 0;

    const frame = (timestamp: number): void => {
      rafId = requestAnimationFrame(frame);

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        store.emitFrame();
        return;
      }

      let delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      // Inactive tab or abnormally long frame: no catch-up.
      if (delta > LONG_STALL_MS || delta < 0) {
        delta = 0;
        accumulator = 0;
      }

      accumulator = Math.min(accumulator + delta, MAX_CATCHUP_MS);

      let steps = 0;
      while (accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        store.advance(TICK_MS);
        accumulator -= TICK_MS;
        steps += 1;
      }

      store.emitFrame();
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        // Restart from a clean clock when the tab comes back.
        lastTimestamp = null;
        accumulator = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [store]);
}
