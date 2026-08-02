/**
 * Toutes les constantes de balance et de configuration du jeu.
 *
 * Aucune autre couche du projet ne doit contenir de nombre magique : la
 * simulation, les composants et les tests importent tous depuis ce fichier.
 */

import type { Role, SpellId } from '../simulation/types';

/** Pas de simulation fixe, en millisecondes. */
export const TICK_MS = 100;

/** Rattrapage maximum autorisé sur une frame (5 pas de simulation). */
export const MAX_CATCHUP_MS = 500;

/**
 * Au-delà de ce delta, on considère que l'onglet était en arrière-plan :
 * le temps écoulé est jeté, aucun rattrapage n'est effectué.
 */
export const LONG_STALL_MS = 1000;

/** Seed par défaut du générateur pseudo-aléatoire. */
export const DEFAULT_SEED = 1337;

/* -------------------------------------------------------------------------- */
/* Groupe                                                                      */
/* -------------------------------------------------------------------------- */

export interface PartyMemberTemplate {
  id: string;
  name: string;
  role: Role;
}

/** HP de base d'un membre non-tank. */
export const BASE_HP = 4000;

/** Le tank possède deux fois les HP des autres membres. */
export const TANK_HP_MULTIPLIER = 2;

export const PARTY_TEMPLATE: readonly PartyMemberTemplate[] = [
  { id: 'tank', name: 'Thorgrim', role: 'tank' },
  { id: 'healer', name: 'Elowen', role: 'healer' },
  { id: 'dps1', name: 'Kaelan', role: 'dps' },
  { id: 'dps2', name: 'Ysolde', role: 'dps' },
  { id: 'dps3', name: 'Brann', role: 'dps' },
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  tank: 'Tank',
  healer: 'Soigneur',
  dps: 'DPS',
};

/* -------------------------------------------------------------------------- */
/* Mana                                                                        */
/* -------------------------------------------------------------------------- */

export const MANA = {
  max: 10_000,
  initial: 10_000,
  /** Régénération normale, par seconde. */
  regenPerSecond: 100,
  /** Régénération améliorée, par seconde. */
  enhancedRegenPerSecond: 200,
  /** Délai sans lancement de sort avant activation de la régénération améliorée. */
  enhancedRegenDelayMs: 2000,
} as const;

/** Plafond du compteur « temps depuis le dernier sort lancé » (évite la dérive). */
export const CAST_IDLE_CAP_MS = 10_000;

/* -------------------------------------------------------------------------- */
/* Sorts                                                                       */
/* -------------------------------------------------------------------------- */

export const GCD_MS = 1500;

export type SpellKind = 'direct' | 'hot' | 'group';

export interface SpellDefinition {
  id: SpellId;
  name: string;
  kind: SpellKind;
  castTimeMs: number;
  manaCost: number;
  requiresTarget: boolean;
  /** Soin direct, ou soin par tick pour un HoT. */
  healAmount: number;
  /** Variation appliquée au soin, en fraction (0.1 = ±10 %). */
  variancePct: number;
  /** Nombre de ticks pour un HoT. */
  hotTicks: number;
  /** Intervalle entre deux ticks de HoT, en millisecondes. */
  hotIntervalMs: number;
  /** Description courte affichée sur le bouton. */
  description: string;
}

export const SPELLS: Record<SpellId, SpellDefinition> = {
  renew: {
    id: 'renew',
    name: 'Renew',
    kind: 'hot',
    castTimeMs: 0,
    manaCost: 300,
    requiresTarget: true,
    healAmount: 150,
    variancePct: 0,
    hotTicks: 5,
    hotIntervalMs: 2000,
    description: '150 / tick × 5',
  },
  flash: {
    id: 'flash',
    name: 'Flash Heal',
    kind: 'direct',
    castTimeMs: 1500,
    manaCost: 500,
    requiresTarget: true,
    healAmount: 800,
    variancePct: 0.1,
    hotTicks: 0,
    hotIntervalMs: 0,
    description: '800 ±10 %',
  },
  greater: {
    id: 'greater',
    name: 'Greater Heal',
    kind: 'direct',
    castTimeMs: 2500,
    manaCost: 700,
    requiresTarget: true,
    healAmount: 2000,
    variancePct: 0.1,
    hotTicks: 0,
    hotIntervalMs: 0,
    description: '2000 ±10 %',
  },
  group: {
    id: 'group',
    name: 'Group Heal',
    kind: 'group',
    castTimeMs: 3000,
    manaCost: 1200,
    requiresTarget: false,
    healAmount: 600,
    variancePct: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    description: '600 au groupe',
  },
};

/** Ordre d'affichage des sorts dans la barre d'action. */
export const SPELL_ORDER: readonly SpellId[] = ['renew', 'flash', 'greater', 'group'] as const;

/* -------------------------------------------------------------------------- */
/* Timeline de dégâts                                                          */
/* -------------------------------------------------------------------------- */

export const BOSS = {
  name: 'Gorvath, l’Effondreur',
  subtitle: 'Pression croissante — survivez',
} as const;

export const TANK_DAMAGE = {
  amount: 400,
  intervalMs: 1500,
  /** Premier impact. */
  firstAtMs: 1500,
} as const;

export const AOE_DAMAGE = {
  amount: 500,
  intervalMs: 12_000,
  firstAtMs: 12_000,
} as const;

export const SPIKE_DAMAGE = {
  amount: 1200,
  minIntervalMs: 6000,
  maxIntervalMs: 10_000,
} as const;

export const RAMP = {
  intervalMs: 30_000,
  factor: 1.15,
} as const;

/* -------------------------------------------------------------------------- */
/* Fin de partie                                                               */
/* -------------------------------------------------------------------------- */

export const WIPE = {
  /** Nombre de morts (hors mort du tank) qui termine la partie. */
  maxDeaths: 3,
} as const;

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

export const FEEDBACK = {
  /** Durée de vie d'un feedback flottant. */
  lifetimeMs: 1200,
  /** Durée de vie d'un message textuel (refus de lancement, annulation). */
  messageLifetimeMs: 1600,
  /** Nombre maximum de feedbacks conservés dans le state (anti-fuite mémoire). */
  maxEntries: 40,
} as const;

/** Raisons possibles de refus d'un lancement de sort. */
export type CastRefusalReason =
  | 'game_over'
  | 'paused'
  | 'casting'
  | 'gcd'
  | 'no_target'
  | 'target_dead'
  | 'mana';

export const REFUSAL_MESSAGES: Record<CastRefusalReason, string> = {
  game_over: 'Partie terminée',
  paused: 'Jeu en pause',
  casting: 'Cast déjà en cours',
  gcd: 'GCD actif',
  no_target: 'Cible requise',
  target_dead: 'Cible morte',
  mana: 'Mana insuffisante',
};

export const CANCEL_MESSAGE = 'Cast annulé';
