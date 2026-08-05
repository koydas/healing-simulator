/**
 * The store's contract with the profile layer: it builds the fight at the
 * level it is handed, and it reports the end of a fight exactly once.
 *
 * The store holds no DOM reference, so it runs in the same `node` environment
 * as the engine tests.
 */

import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/config/gameConfig';
import { createGameStore } from '../src/store/gameStore';
import type { EnemyId, GameOutcome } from '../src/simulation/types';

/** Runs the fight, without ever healing, until it ends or the budget runs out. */
function playOut(store: ReturnType<typeof createGameStore>, maxMs = 300_000): void {
  for (let elapsed = 0; elapsed < maxMs; elapsed += TICK_MS) {
    if (store.getState().status === 'over') return;
    store.advance(TICK_MS);
  }
}

describe('createGameStore', () => {
  it('builds the fight at the level it is given', () => {
    const store = createGameStore(1, 'gorvath', { playerLevel: 60 });
    expect(store.getHeaderSnapshot().playerLevel).toBe(60);
    expect(store.getMemberSnapshot('healer').hpMax).toBe(1707);
    // Every spell of the priest kit is trained by level 60.
    expect(store.getControlsSnapshot().spells.every((spell) => !spell.locked)).toBe(true);
  });

  it('defaults to level 1', () => {
    const store = createGameStore(1, 'gorvath');
    expect(store.getHeaderSnapshot().playerLevel).toBe(1);
    expect(store.getMemberSnapshot('healer').hpMax).toBe(51);
  });

  /** Name and class from the profile (ADR-0020) reach the fight's party. */
  it('builds the healer as the chosen name and class', () => {
    const store = createGameStore(1, 'gorvath', {
      playerLevel: 40,
      player: { name: 'Zed', classId: 'hunter' },
    });
    const healer = store.getMemberSnapshot('healer');
    expect(healer.name).toBe('Zed');
    expect(healer.classLabel).toBe('Night Elf · Hunter');
    // A night elf hunter's pool at 40, not the priest default.
    expect(store.getMemberSnapshot('healer').hpMax).not.toBe(0);
  });

  it('keeps the chosen identity across a restart, like it keeps the level', () => {
    const store = createGameStore(1, 'threx', {
      playerLevel: 12,
      player: { name: 'Zed', classId: 'mage' },
    });
    store.restart(2, 'threx');
    const healer = store.getMemberSnapshot('healer');
    expect(healer.name).toBe('Zed');
    expect(healer.classLabel).toBe('Gnome · Mage');
  });

  it('reports the end of the fight once, with the enemy fought', () => {
    const calls: { outcome: GameOutcome; enemyId: EnemyId }[] = [];
    const store = createGameStore(1337, 'gorvath', {
      onFightEnd: (outcome, enemyId) => calls.push({ outcome, enemyId }),
    });

    playOut(store);
    expect(store.getState().status).toBe('over');
    // A level 1 party with no healer at the keyboard wipes on Gorvath.
    expect(calls).toEqual([{ outcome: 'wipe', enemyId: 'gorvath' }]);

    // Steps after the end, and the pause toggle, must not report it again.
    store.advance(TICK_MS);
    store.toggle();
    expect(calls).toHaveLength(1);
  });

  /**
   * `onFightEnd`'s third argument is `state.playerLevel` — the level the
   * fight was actually built and fought with — not merely an echo of
   * `options.playerLevel`. `App` compares it against the current saved
   * profile to refuse crediting a replay URL that pinned a different level
   * (ADR-0005) — see the Codex finding on #9.
   */
  it("reports the level the fight was actually built with, on every restart", () => {
    const levels: number[] = [];
    const store = createGameStore(1337, 'skarn', {
      playerLevel: 45,
      onFightEnd: (_outcome, _enemyId, playerLevel) => levels.push(playerLevel),
    });

    playOut(store);
    expect(levels).toEqual([45]);

    store.restart(99, 'skarn', 12);
    playOut(store);
    expect(levels).toEqual([45, 12]);
  });

  it('reports the next fight too, at the level the rematch is started with', () => {
    const calls: GameOutcome[] = [];
    const store = createGameStore(1337, 'skarn', { onFightEnd: (outcome) => calls.push(outcome) });
    playOut(store);
    expect(calls).toHaveLength(1);

    store.restart(99, 'skarn', 4);
    expect(store.getHeaderSnapshot().playerLevel).toBe(4);
    expect(calls).toHaveLength(1);

    playOut(store);
    expect(calls).toHaveLength(2);
  });

  it('keeps the current level when a rematch does not name one', () => {
    const store = createGameStore(1, 'threx', { playerLevel: 12 });
    store.restart(2, 'threx');
    expect(store.getHeaderSnapshot().playerLevel).toBe(12);
  });

  /**
   * Documents the balance consequence of levelling: the encounters are still
   * the level 1 designs of ADR-0010, so a high-level party wins them without
   * a single heal. Scaling the bosses is deliberate future work — see
   * `docs/balance.md`.
   */
  it('lets a level 60 party win with no healing at all', () => {
    const store = createGameStore(1337, 'gorvath', { playerLevel: 60 });
    playOut(store);
    expect(store.getState().outcome).toBe('victory');
  });

  /**
   * The header snapshot used to carry raw `elapsedMs`, which changes on
   * every 100 ms tick and defeated `reuse`/`snapshotEqual` — every
   * `useSyncExternalStore` subscriber woke up at 10 Hz just to animate a
   * boss portrait that only changes phase a few times per 6 s cycle (Codex
   * finding on #17). `bossAnimationPhase` replaces it: two ticks in the same
   * phase, with nothing else in the header changed, must reuse the exact
   * same snapshot reference.
   */
  it('reuses the header snapshot while the boss animation phase does not change', () => {
    const store = createGameStore(1, 'gorvath');
    // Past the opening "attack" beat (< 520 ms) and before the first party
    // damage tick (1000 ms) or the next phase boundary (2000 ms): the whole
    // header, including bossAnimationPhase, is stable across these ticks.
    store.advance(600);
    const first = store.getHeaderSnapshot();
    expect(first.bossAnimationPhase).toBe('idle');

    store.advance(TICK_MS);
    const second = store.getHeaderSnapshot();
    expect(second).toBe(first);
  });
});
