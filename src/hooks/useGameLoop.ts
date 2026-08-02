/**
 * Boucle de jeu — seul endroit du projet où l'horloge réelle est utilisée.
 *
 * Principe :
 *   - `requestAnimationFrame` fournit le temps réel ;
 *   - un accumulateur découpe ce temps en pas fixes de `TICK_MS` ;
 *   - le rattrapage est plafonné à `MAX_CATCHUP_MS` par frame ;
 *   - au-delà de `LONG_STALL_MS` (onglet en arrière-plan, mise en veille),
 *     le temps écoulé est purement et simplement jeté : aucun rattrapage.
 *
 * Le rAF, les listeners et l'accumulateur sont nettoyés au démontage.
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

      // Onglet inactif ou frame anormalement longue : aucun rattrapage.
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
        // On repart d'une horloge propre au retour dans l'onglet.
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
