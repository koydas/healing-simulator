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
import type { ClassId } from './config/classicData';
import {
  DEFAULT_SEED,
  ENEMY_ORDER,
  MAX_LEVEL,
  PLAYER_MEMBER_ID,
  STARTING_LEVEL,
  isPlayableClass,
  type PlayableClassId,
  type PlayerIdentity,
} from './config/gameConfig';
import { GameStoreContext } from './hooks/useGameStore';
import { useGameLoop } from './hooks/useGameLoop';
import {
  applyFightOutcome,
  createEmptyProfile,
  renameCharacter,
  switchClass,
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
 * `?level=30` pins the level the party is built at, the same way `?seed=` and
 * `?enemy=` pin the rest of the fight. Without this, a replay URL only fully
 * identified a fight for a level 1 profile: since the whole party's health,
 * mana and spellbook now come from `playerLevel` (ADR-0019), the same
 * `?seed=&enemy=` opened in a level 60 browser produced a different party,
 * different stats and potentially a different outcome — silently breaking the
 * exact-replay contract from ADR-0005. Caught by Codex review on #9.
 *
 * Absent or invalid, this returns `null` and the fight falls back to the
 * saved profile's own level, exactly as before this parameter existed.
 */
function readInitialLevel(): number | null {
  if (typeof window === 'undefined') return null;
  const parameter = new URLSearchParams(window.location.search).get('level');
  if (parameter === null) return null;
  const parsed = Number.parseInt(parameter, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(MAX_LEVEL, Math.max(STARTING_LEVEL, parsed));
}

/**
 * `?class=hunter` pins the class the party is built at, the same way
 * `?level=` pins the level. Without this, class (ADR-0020) was the one thing
 * a shared `?seed=&enemy=&level=` link left unpinned: since class now sizes
 * the healer's health and mana through `partyTemplateAtLevel` — a hunter and
 * a mage do not share a mana pool — the same link opened on a browser whose
 * saved profile is playing a different class silently built a different
 * party and could reach a different outcome, breaking the exact-replay
 * contract from ADR-0005 exactly the way an unpinned level once did. Caught
 * by Codex review on #18.
 *
 * Absent or invalid, this returns `null` and the fight falls back to the
 * saved profile's own class, exactly as before this parameter existed.
 */
function readInitialClassId(): PlayableClassId | null {
  if (typeof window === 'undefined') return null;
  const parameter = new URLSearchParams(window.location.search).get('class');
  return isPlayableClass(parameter) ? parameter : null;
}

/**
 * Writes the currently displayed fight's seed, enemy, level and class into
 * the URL, so copying or reloading it always reproduces *that* fight —
 * called on mount and again on every "New fight", since a rematch rolls a
 * fresh seed that would otherwise leave the address bar pointing at the
 * previous one.
 */
function syncFightUrl(
  seed: number,
  enemyId: EnemyId,
  level: number,
  classId: PlayableClassId,
): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('enemy', enemyId);
  url.searchParams.set('level', String(level));
  url.searchParams.set('class', classId);
  window.history.replaceState(null, '', url);
}

/**
 * Clears `seed`, `enemy`, `level` and `class` from the URL when returning to
 * the selection screen. Without this, the completed fight's `seed` stayed in
 * the URL and `readInitialSeed()` silently reused it for whichever enemy was
 * picked next — every "Choose another enemy" replayed the same randomness
 * instead of rolling a fresh one.
 */
function clearFightUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('seed');
  url.searchParams.delete('enemy');
  url.searchParams.delete('level');
  url.searchParams.delete('class');
  window.history.replaceState(null, '', url);
}

interface FightProps {
  enemyId: EnemyId;
  /** Level the fight is fought at, from the saved profile. */
  playerLevel: number;
  /** Name and class the fight is fought as, from the saved profile. */
  player: PlayerIdentity;
  /** Experience and level gained by the fight that just ended, if any. */
  reward: FightReward | null;
  /** True when the fight just ended was played at a level or class the URL
   * pinned, different from the current profile — its result was not
   * credited. */
  identityMismatch: boolean;
  /** Back to the home screen — tears the store down entirely. */
  onChangeEnemy: () => void;
  onFightEnd: (
    outcome: GameOutcome,
    enemyId: EnemyId,
    fightLevel: number,
    fightClassId: ClassId,
  ) => void;
  onNewFight: () => void;
}

function Fight({
  enemyId,
  playerLevel,
  player,
  reward,
  identityMismatch,
  onChangeEnemy,
  onFightEnd,
  onNewFight,
}: FightProps) {
  const storeRef = useRef<GameStore | null>(null);
  if (storeRef.current === null) {
    // A `?level=`/`?class=` in the URL pin the fight to a specific level and
    // class, exactly like `?seed=` and `?enemy=` already do — without them, a
    // replay falls back to whatever the current saved profile happens to be.
    const initialLevel = readInitialLevel() ?? playerLevel;
    const initialClassId = readInitialClassId() ?? player.classId;
    storeRef.current = createGameStore(readInitialSeed(), enemyId, {
      playerLevel: initialLevel,
      player: { name: player.name, classId: initialClassId },
      onFightEnd,
    });
  }
  const store = storeRef.current;

  useGameLoop(store);

  // Encode the resolved seed, enemy, level and class into the URL once, on
  // mount: whatever wasn't already pinned by the visitor (an auto-generated
  // seed, a level or class read from the current profile) becomes part of a
  // shareable link that reproduces this exact fight — the other half of the
  // ADR-0005 contract `readInitialSeed` / `readInitialEnemyId` /
  // `readInitialLevel` / `readInitialClassId` only read from. The class comes
  // from the party the store actually built (the healer's own member), the
  // same reasoning `state.playerLevel` is read instead of echoing
  // `initialLevel` above.
  useEffect(() => {
    const state = store.getState();
    const healerClassId = state.party.find((member) => member.id === PLAYER_MEMBER_ID)!.classId;
    // The healer's class is always one `createInitialState` built from a
    // `PlayableClassId` (see `partyTemplateAtLevel`); `player.classId` is
    // only a fallback for the type checker, never actually reached.
    syncFightUrl(
      state.initialSeed,
      enemyId,
      state.playerLevel,
      isPlayableClass(healerClassId) ? healerClassId : player.classId,
    );
    // `store`, `enemyId` and `player` are all fixed for the lifetime of this
    // component (a new enemy remounts `Fight` entirely, and the sheet cannot
    // be edited while a fight is running) — this only needs to run once, the
    // rematch case is handled by `handleRestart` itself.
  }, [store, enemyId, player]);

  const handleRestart = useCallback(() => {
    const seed = Date.now() >>> 0;
    onNewFight();
    // A level or class gained/changed since the previous fight applies to the
    // rematch: the profile is already updated by the time this runs.
    store.restart(seed, enemyId, playerLevel, player);
    // A rematch rolls a fresh seed: without this the address bar would keep
    // pointing at the fight that just ended instead of the one on screen.
    syncFightUrl(seed, enemyId, playerLevel, player.classId);
  }, [store, enemyId, playerLevel, player, onNewFight]);

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
        <GameOver
          reward={reward}
          identityMismatch={identityMismatch}
          onRestart={handleRestart}
          onChangeEnemy={onChangeEnemy}
        />
      </div>
    </GameStoreContext.Provider>
  );
}

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile);
  const [enemyId, setEnemyId] = useState<EnemyId | null>(readInitialEnemyId);
  const [reward, setReward] = useState<FightReward | null>(null);
  // Set instead of `reward` when a replay URL pinned a level or class
  // different from the current profile: the fight still plays out, but it is
  // not credited.
  const [identityMismatch, setIdentityMismatch] = useState(false);

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
    (outcome: GameOutcome, foughtEnemyId: EnemyId, fightLevel: number, fightClassId: ClassId) => {
      // A shared `?level=`/`?class=` link can pin a fight at a level or class
      // different from the profile that opens it (ADR-0005, ADR-0020).
      // Crediting it anyway would let a low-level profile bank a high-level
      // reward for a fight it never really had the character to face, a
      // high-level profile farm an easy low-level replay for full credit, or
      // a class the profile isn't currently playing bank its reward onto
      // whichever class *is* active — caught by Codex review on #9 (level)
      // and #18 (class). The fight still plays out for viewing; it just
      // changes nothing.
      if (fightLevel !== profileRef.current.level || fightClassId !== profileRef.current.classId) {
        setReward(null);
        setIdentityMismatch(true);
        return;
      }
      setIdentityMismatch(false);
      const next = applyFightOutcome(profileRef.current, foughtEnemyId, outcome);
      persist(next.profile);
      setReward(next);
    },
    [persist],
  );

  const handleNewFight = useCallback(() => {
    setReward(null);
    setIdentityMismatch(false);
  }, []);

  const handleChangeEnemy = useCallback(() => {
    clearFightUrl();
    setReward(null);
    setIdentityMismatch(false);
    setEnemyId(null);
  }, []);

  const handleResetProfile = useCallback(() => {
    clearProfile();
    const fresh = createEmptyProfile();
    profileRef.current = fresh;
    setProfile(fresh);
    setReward(null);
    setIdentityMismatch(false);
  }, []);

  const handleRenameCharacter = useCallback(
    (name: string) => {
      persist(renameCharacter(profileRef.current, name));
    },
    [persist],
  );

  const handleSwitchClass = useCallback(
    (classId: PlayableClassId) => {
      persist(switchClass(profileRef.current, classId));
    },
    [persist],
  );

  if (enemyId === null) {
    return (
      <HomeScreen
        profile={profile}
        onSelect={setEnemyId}
        onResetProfile={handleResetProfile}
        onRenameCharacter={handleRenameCharacter}
        onSwitchClass={handleSwitchClass}
      />
    );
  }

  return (
    <Fight
      key={enemyId}
      enemyId={enemyId}
      playerLevel={profile.level}
      player={{ name: profile.name, classId: profile.classId }}
      reward={reward}
      identityMismatch={identityMismatch}
      onChangeEnemy={handleChangeEnemy}
      onFightEnd={handleFightEnd}
      onNewFight={handleNewFight}
    />
  );
}
