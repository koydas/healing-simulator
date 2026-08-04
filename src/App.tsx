/**
 * Application root.
 *
 * Before any fight there is no `GameState` at all: `App` shows the home screen
 * (character sheet, records, enemy selection) and only creates a store —
 * inside `Fight` — once a choice is made. `Fight` never re-renders during a
 * fight: the store is held by a `useRef` and every child subscribes to its own
 * snapshot. The player profile lives here, above the store, because it
 * outlives every fight and is written to `localStorage` (ADR-0018).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Controls } from './components/Controls';
import { GameOver } from './components/GameOver';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { MessageFeed } from './components/CombatFeedback';
import { PartyList } from './components/PartyList';
import { DEFAULT_SEED, ENEMY_ORDER } from './config/gameConfig';
import { GameStoreContext } from './hooks/useGameStore';
import { useGameLoop } from './hooks/useGameLoop';
import {
  applyFightOutcome,
  createEmptyProfile,
  type FightReward,
  type PlayerProfile,
} from './profile/playerProfile';
import { clearProfile, loadProfile, saveProfile } from './profile/profileStorage';
import type { EnemyId, GameOutcome } from './simulation/types';
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

/**
 * Clears `seed` and `enemy` from the URL when returning to the selection
 * screen. Without this, the completed fight's `seed` stayed in the URL and
 * `readInitialSeed()` silently reused it for whichever enemy was picked
 * next — every "Choose another enemy" replayed the same randomness instead
 * of rolling a fresh one.
 */
function clearFightUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('seed');
  url.searchParams.delete('enemy');
  window.history.replaceState(null, '', url);
}

interface FightProps {
  enemyId: EnemyId;
  /** Level the fight is fought at, from the saved profile. */
  playerLevel: number;
  /** Experience and level gained by the fight that just ended, if any. */
  reward: FightReward | null;
  /** Back to the home screen — tears the store down entirely. */
  onChangeEnemy: () => void;
  onFightEnd: (outcome: GameOutcome, enemyId: EnemyId) => void;
  onNewFight: () => void;
}

function Fight({
  enemyId,
  playerLevel,
  reward,
  onChangeEnemy,
  onFightEnd,
  onNewFight,
}: FightProps) {
  const storeRef = useRef<GameStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createGameStore(readInitialSeed(), enemyId, { playerLevel, onFightEnd });
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
    onNewFight();
    // A level gained on the previous fight applies to the rematch: the profile
    // is already updated by the time this runs.
    store.restart(seed, enemyId, playerLevel);
    // A rematch rolls a fresh seed: without this the address bar would keep
    // pointing at the fight that just ended instead of the one on screen.
    syncFightUrl(seed, enemyId);
  }, [store, enemyId, playerLevel, onNewFight]);

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
        <GameOver reward={reward} onRestart={handleRestart} onChangeEnemy={onChangeEnemy} />
      </div>
    </GameStoreContext.Provider>
  );
}

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile);
  const [enemyId, setEnemyId] = useState<EnemyId | null>(readInitialEnemyId);
  const [reward, setReward] = useState<FightReward | null>(null);

  // The store calls `onFightEnd` from outside React, so the callback reads the
  // current profile from a ref rather than closing over a stale render.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const persist = useCallback((next: PlayerProfile) => {
    profileRef.current = next;
    setProfile(next);
    saveProfile(next);
  }, []);

  const handleFightEnd = useCallback(
    (outcome: GameOutcome, foughtEnemyId: EnemyId) => {
      const next = applyFightOutcome(profileRef.current, foughtEnemyId, outcome);
      persist(next.profile);
      setReward(next);
    },
    [persist],
  );

  const handleNewFight = useCallback(() => setReward(null), []);

  const handleChangeEnemy = useCallback(() => {
    clearFightUrl();
    setReward(null);
    setEnemyId(null);
  }, []);

  const handleResetProfile = useCallback(() => {
    clearProfile();
    const fresh = createEmptyProfile();
    profileRef.current = fresh;
    setProfile(fresh);
    setReward(null);
  }, []);

  if (enemyId === null) {
    return (
      <HomeScreen profile={profile} onSelect={setEnemyId} onResetProfile={handleResetProfile} />
    );
  }

  return (
    <Fight
      key={enemyId}
      enemyId={enemyId}
      playerLevel={profile.level}
      reward={reward}
      onChangeEnemy={handleChangeEnemy}
      onFightEnd={handleFightEnd}
      onNewFight={handleNewFight}
    />
  );
}
