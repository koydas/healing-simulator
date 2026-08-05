/**
 * Game store — the bridge between the pure engine and the React layer.
 *
 * The store is the source of truth (a plain mutable object held by a `useRef`).
 * It exposes:
 *   - light, memoised *snapshots* consumed through `useSyncExternalStore`: a
 *     component only re-renders when ITS snapshot changed;
 *   - "frame" callbacks for animated elements (cast / mana / GCD bars) that are
 *     updated straight through CSS variables, with no React render.
 *
 * As a result, a 100 ms simulation step never triggers a full re-render of the
 * application.
 */

import {
  CLASS_LABELS,
  RACE_LABELS,
  ROLE_LABELS,
  SPELLS,
  SPELL_ORDER,
  isSpellUnlocked,
  type CastRefusalReason,
} from '../config/gameConfig';
import {
  cancelCast,
  castSpell,
  checkCast,
  restartGame,
  selectTarget,
  togglePause,
} from '../simulation/actions';
import { createInitialState } from '../simulation/initialState';
import {
  computeStatsSummary,
  getBossHpRatio,
  getGlobalMessages,
  getHpRatio,
  getMemberFeedback,
  getRenewEffect,
  type StatsSummary,
} from '../simulation/selectors';
import { stepSimulation } from '../simulation/simulation';
import type {
  EnemyId,
  FeedbackEvent,
  GameOutcome,
  GameState,
  GameStatus,
  Role,
  SpellId,
} from '../simulation/types';

export interface MemberSnapshot {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  /** "Dwarf · Warrior" — the character's Classic race and class. */
  classLabel: string;
  hp: number;
  hpMax: number;
  hpRatio: number;
  hpPercent: number;
  alive: boolean;
  renewTicks: number;
  selected: boolean;
  feedback: FeedbackEvent[];
}

export interface HeaderSnapshot {
  bossName: string;
  bossSubtitle: string;
  bossLevel: number;
  bossHp: number;
  bossHpMax: number;
  bossHpRatio: number;
  bossHpPercent: number;
  playerLevel: number;
  status: GameStatus;
  timeLabel: string;
  damageMultiplier: number;
  aliveCount: number;
  seed: number;
}

export interface SpellSnapshot {
  id: SpellId;
  name: string;
  rank: number;
  /** Training level of the spell in Classic. */
  requiredLevel: number;
  /** True while the healer has not reached the required level. */
  locked: boolean;
  manaCost: number;
  castLabel: string;
  description: string;
  disabled: boolean;
  reason: CastRefusalReason | null;
}

export interface ControlsSnapshot {
  status: GameStatus;
  casting: boolean;
  castSpellName: string | null;
  spells: SpellSnapshot[];
}

export interface GameStore {
  getState(): GameState;
  subscribe(listener: () => void): () => void;
  onFrame(callback: (state: GameState) => void): () => void;
  emitFrame(): void;
  advance(dtMs: number): void;
  select(memberId: string): void;
  cast(spellId: SpellId): void;
  cancel(): void;
  toggle(): void;
  restart(seed: number, enemyId: EnemyId, playerLevel?: number): void;
  getMemberIds(): string[];
  getMemberSnapshot(memberId: string): MemberSnapshot;
  getHeaderSnapshot(): HeaderSnapshot;
  getControlsSnapshot(): ControlsSnapshot;
  getMessagesSnapshot(): FeedbackEvent[];
  getSummarySnapshot(): StatsSummary | null;
}

function arrayShallowEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function snapshotEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const left: unknown = a[key];
    const right: unknown = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      if (!arrayShallowEqual(left, right)) return false;
    } else if (!Object.is(left, right)) {
      return false;
    }
  }
  return true;
}

/** Keeps the previous reference when the content has not changed. */
function reuse<T extends object>(previous: T | undefined, next: T): T {
  return previous && snapshotEqual(previous, next) ? previous : next;
}

function castLabel(castTimeMs: number): string {
  return castTimeMs <= 0 ? 'Instant' : `${(castTimeMs / 1000).toFixed(1)} s`;
}

export interface GameStoreOptions {
  /** Level the fight is fought at — the saved profile's, 1 without one. */
  playerLevel?: number;
  /**
   * Called once, on the step that ends the fight. The store is the only place
   * that sees every state transition, so it is where "this fight is over"
   * can be detected exactly once — a `useEffect` watching the summary would
   * fire again on every re-render of the end screen.
   *
   * `playerLevel` is the level the party was actually built and fought at —
   * `state.playerLevel`, not `options.playerLevel` — so the caller can tell a
   * normal fight from a replay URL that pinned a level different from the
   * current profile (ADR-0005) and refuse to credit the wrong character.
   */
  onFightEnd?: (outcome: GameOutcome, enemyId: EnemyId, playerLevel: number) => void;
}

export function createGameStore(
  initialSeed: number,
  enemyId: EnemyId,
  options: GameStoreOptions = {},
): GameStore {
  let state: GameState = createInitialState(initialSeed, options.playerLevel, enemyId);
  let currentEnemyId: EnemyId = enemyId;

  const listeners = new Set<() => void>();
  const frameListeners = new Set<(state: GameState) => void>();

  let memberIds: string[] = state.party.map((member) => member.id);
  let memberSnapshots = new Map<string, MemberSnapshot>();
  let headerSnapshot!: HeaderSnapshot;
  let controlsSnapshot!: ControlsSnapshot;
  let messagesSnapshot: FeedbackEvent[] = [];
  let summarySnapshot: StatsSummary | null = null;

  function buildMemberSnapshot(memberId: string): MemberSnapshot {
    const member = state.party.find((entry) => entry.id === memberId)!;
    const renew = getRenewEffect(member);
    const ratio = getHpRatio(member);
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      roleLabel: ROLE_LABELS[member.role],
      classLabel: `${RACE_LABELS[member.race]} · ${CLASS_LABELS[member.classId]}`,
      hp: Math.round(member.hp),
      hpMax: member.hpMax,
      hpRatio: ratio,
      hpPercent: Math.round(ratio * 100),
      alive: member.alive,
      renewTicks: renew ? renew.ticksRemaining : 0,
      selected: state.selectedTargetId === member.id,
      feedback: getMemberFeedback(state, member.id),
    };
  }

  function buildHeaderSnapshot(): HeaderSnapshot {
    const totalSeconds = Math.floor(state.elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const bossHpRatio = getBossHpRatio(state);
    return {
      bossName: state.encounter.name,
      bossSubtitle: state.encounter.subtitle,
      bossLevel: state.encounter.level,
      bossHp: Math.round(state.bossHp),
      bossHpMax: state.encounter.hpMax,
      bossHpRatio,
      bossHpPercent: Math.round(bossHpRatio * 100),
      playerLevel: state.playerLevel,
      status: state.status,
      timeLabel: `${minutes}:${String(seconds).padStart(2, '0')}`,
      damageMultiplier: Math.round(state.damageMultiplier * 100) / 100,
      aliveCount: state.party.filter((member) => member.alive).length,
      seed: state.initialSeed,
    };
  }

  function buildControlsSnapshot(): ControlsSnapshot {
    const spells: SpellSnapshot[] = SPELL_ORDER.map((spellId) => {
      const spell = SPELLS[spellId];
      const check = checkCast(state, spellId);
      return {
        id: spell.id,
        name: spell.name,
        rank: spell.rank,
        requiredLevel: spell.requiredLevel,
        locked: !isSpellUnlocked(spell, state.playerLevel),
        manaCost: spell.manaCost,
        castLabel: castLabel(spell.castTimeMs),
        description: spell.description,
        disabled: !check.allowed,
        reason: check.reason,
      };
    });

    return {
      status: state.status,
      casting: state.activeCast !== null,
      castSpellName: state.activeCast ? SPELLS[state.activeCast.spellId].name : null,
      spells,
    };
  }

  /** Recomputes every snapshot; returns `true` when at least one changed. */
  function refreshSnapshots(): boolean {
    let changed = false;

    const nextMemberSnapshots = new Map<string, MemberSnapshot>();
    for (const id of memberIds) {
      const next = reuse(memberSnapshots.get(id), buildMemberSnapshot(id));
      if (next !== memberSnapshots.get(id)) changed = true;
      nextMemberSnapshots.set(id, next);
    }
    memberSnapshots = nextMemberSnapshots;

    const nextHeader = reuse(headerSnapshot, buildHeaderSnapshot());
    if (nextHeader !== headerSnapshot) changed = true;
    headerSnapshot = nextHeader;

    const nextControlsBase = buildControlsSnapshot();
    // Spell snapshots are memoised individually so that `React.memo` on the
    // buttons stays effective.
    const previousSpells = controlsSnapshot ? controlsSnapshot.spells : [];
    nextControlsBase.spells = nextControlsBase.spells.map((spell, index) =>
      reuse(previousSpells[index], spell),
    );
    const nextControls = reuse(controlsSnapshot, nextControlsBase);
    if (nextControls !== controlsSnapshot) changed = true;
    controlsSnapshot = nextControls;

    const nextMessages = getGlobalMessages(state);
    if (!arrayShallowEqual(nextMessages, messagesSnapshot)) {
      messagesSnapshot = nextMessages;
      changed = true;
    }

    const nextSummary = state.status === 'over' ? computeStatsSummary(state) : null;
    if (nextSummary === null) {
      if (summarySnapshot !== null) {
        summarySnapshot = null;
        changed = true;
      }
    } else if (
      summarySnapshot === null ||
      summarySnapshot.durationMs !== nextSummary.durationMs ||
      summarySnapshot.effectiveHealing !== nextSummary.effectiveHealing
    ) {
      summarySnapshot = nextSummary;
      changed = true;
    }

    return changed;
  }

  function setState(next: GameState): void {
    if (next === state) return;
    const wasOver = state.status === 'over';
    state = next;
    if (refreshSnapshots()) {
      for (const listener of listeners) listener();
    }
    if (!wasOver && state.status === 'over') {
      options.onFightEnd?.(state.outcome, currentEnemyId, state.playerLevel);
    }
  }

  // Initial snapshots.
  refreshSnapshots();

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    onFrame(callback) {
      frameListeners.add(callback);
      callback(state);
      return () => {
        frameListeners.delete(callback);
      };
    },

    emitFrame() {
      for (const callback of frameListeners) callback(state);
    },

    advance(dtMs) {
      setState(stepSimulation(state, dtMs));
    },

    select(memberId) {
      setState(selectTarget(state, memberId));
    },

    cast(spellId) {
      setState(castSpell(state, spellId));
    },

    cancel() {
      setState(cancelCast(state));
    },

    toggle() {
      setState(togglePause(state));
    },

    restart(seed, enemyId, playerLevel) {
      const next = restartGame(seed, enemyId, playerLevel ?? state.playerLevel);
      currentEnemyId = enemyId;
      memberIds = next.party.map((member) => member.id);
      memberSnapshots = new Map();
      setState(next);
      // Force a notification even when the snapshots are identical
      // (a new fight with the same seed, for instance).
      for (const listener of listeners) listener();
      for (const callback of frameListeners) callback(state);
    },

    getMemberIds: () => memberIds,
    getMemberSnapshot: (memberId) => memberSnapshots.get(memberId) as MemberSnapshot,
    getHeaderSnapshot: () => headerSnapshot,
    getControlsSnapshot: () => controlsSnapshot,
    getMessagesSnapshot: () => messagesSnapshot,
    getSummarySnapshot: () => summarySnapshot,
  };
}
