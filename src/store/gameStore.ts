/**
 * Store de jeu — pont entre le moteur pur et la couche React.
 *
 * Le store est la source de vérité (un simple objet mutable détenu par un
 * `useRef`). Il expose :
 *   - des *snapshots* légers et mémoïsés, consommés par `useSyncExternalStore` :
 *     un composant ne se re-rend que si SON snapshot a changé ;
 *   - des callbacks « frame » pour les éléments animés (barres de cast / mana /
 *     GCD) qui sont mis à jour directement via des variables CSS, sans rendu React.
 *
 * Conséquence : un pas de simulation de 100 ms ne provoque jamais un rendu
 * complet de l'application.
 */

import {
  BOSS,
  ROLE_LABELS,
  SPELLS,
  SPELL_ORDER,
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
  getGlobalMessages,
  getHpRatio,
  getMemberFeedback,
  getRenewEffect,
  type StatsSummary,
} from '../simulation/selectors';
import { stepSimulation } from '../simulation/simulation';
import type { FeedbackEvent, GameState, GameStatus, Role, SpellId } from '../simulation/types';

export interface MemberSnapshot {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
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
  status: GameStatus;
  timeLabel: string;
  damageMultiplier: number;
  aliveCount: number;
  seed: number;
}

export interface SpellSnapshot {
  id: SpellId;
  name: string;
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
  restart(seed: number): void;
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

/** Conserve la référence précédente si le contenu n'a pas changé. */
function reuse<T extends object>(previous: T | undefined, next: T): T {
  return previous && snapshotEqual(previous, next) ? previous : next;
}

function castLabel(castTimeMs: number): string {
  return castTimeMs <= 0 ? 'Instant' : `${(castTimeMs / 1000).toFixed(1)} s`;
}

export function createGameStore(initialSeed: number): GameStore {
  let state: GameState = createInitialState(initialSeed);

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
    return {
      bossName: BOSS.name,
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

  /** Recalcule tous les snapshots ; renvoie `true` si au moins un a changé. */
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
    // Les snapshots de sorts sont mémoïsés individuellement pour que
    // `React.memo` sur les boutons reste efficace.
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
    state = next;
    if (refreshSnapshots()) {
      for (const listener of listeners) listener();
    }
  }

  // Initialisation des snapshots.
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

    restart(seed) {
      const next = restartGame(seed);
      memberIds = next.party.map((member) => member.id);
      memberSnapshots = new Map();
      setState(next);
      // Force la notification même si les snapshots sont identiques
      // (nouvelle partie avec la même seed, par exemple).
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
