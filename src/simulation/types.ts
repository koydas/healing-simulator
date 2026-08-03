/**
 * Types du moteur de simulation.
 *
 * Cette couche est totalement indépendante de React et du DOM : elle ne
 * contient que des données sérialisables et des fonctions pures.
 */

import type { ClassId, RaceId } from '../config/classicData';

export type Role = 'tank' | 'healer' | 'dps';

/** Les cinq familles de soin du prêtre vanilla (rang 1). */
export type SpellId = 'lesserHeal' | 'renew' | 'heal' | 'flashHeal' | 'prayerOfHealing';

export type GameStatus = 'active' | 'paused' | 'over';

export interface HotEffect {
  spellId: SpellId;
  healPerTick: number;
  intervalMs: number;
  ticksRemaining: number;
  /** Temps restant avant le prochain tick, en millisecondes. */
  nextTickInMs: number;
}

export interface PartyMember {
  id: string;
  name: string;
  role: Role;
  race: RaceId;
  classId: ClassId;
  hpMax: number;
  hp: number;
  alive: boolean;
  hots: HotEffect[];
}

export interface ActiveCast {
  spellId: SpellId;
  targetId: string | null;
  castTimeMs: number;
  elapsedMs: number;
}

export type FeedbackKind = 'heal' | 'overheal' | 'damage' | 'death' | 'message';

export interface FeedbackEvent {
  id: number;
  kind: FeedbackKind;
  /** Membre concerné, ou `null` pour un message global. */
  targetId: string | null;
  amount: number;
  text: string | null;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface GameStats {
  rawHealing: number;
  effectiveHealing: number;
  overhealing: number;
  manaSpent: number;
  damageTaken: number;
  castsStartedBySpell: Record<string, number>;
  castsCompletedBySpell: Record<string, number>;
  castsCancelled: number;
  /** Identifiants des membres morts, dans l'ordre chronologique. */
  deaths: string[];
}

export interface GameTimers {
  /** Temps restant avant le prochain palier de régénération de mana (2 s). */
  manaTickMs: number;
  /** Temps restant avant le prochain coup sur le tank. */
  tankDamageMs: number;
  /** Temps restant avant la prochaine AoE. */
  aoeMs: number;
  /** Temps restant avant le prochain spike. */
  spikeMs: number;
}

export interface GameState {
  status: GameStatus;
  /**
   * Niveau du soigneur : conditionne les sorts disponibles.
   * Les tables de stats ne couvrent aujourd'hui que le niveau 1.
   */
  playerLevel: number;
  /** Temps de simulation écoulé, en millisecondes. */
  elapsedMs: number;
  /** État du générateur pseudo-aléatoire (déterminisme). */
  seed: number;
  /** Seed d'origine de la partie, conservée pour l'affichage et la rejouabilité. */
  initialSeed: number;
  party: PartyMember[];
  selectedTargetId: string | null;
  mana: number;
  manaMax: number;
  gcdRemainingMs: number;
  /** Temps écoulé depuis le lancement du dernier sort accepté. */
  msSinceLastCastStart: number;
  activeCast: ActiveCast | null;
  timers: GameTimers;
  damageMultiplier: number;
  feedback: FeedbackEvent[];
  nextFeedbackId: number;
  stats: GameStats;
}
