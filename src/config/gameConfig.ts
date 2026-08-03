/**
 * Constantes de balance du jeu.
 *
 * Deux natures de valeurs cohabitent ici, et la distinction est volontaire :
 *   - celles **dérivées de WoW Classic** (PV, mana, sorts, régénération) sont
 *     calculées à partir de `classicData.ts` — on ne les écrit jamais à la main ;
 *   - celles de **game design** (profil du boss, cadence des événements, rampe)
 *     sont posées ici, et documentées comme telles dans `docs/classic-stats.md`.
 *
 * Aucune autre couche du projet ne contient de nombre magique.
 */

import {
  CREATURE_LEVEL_1,
  GLOBAL_COOLDOWN_MS,
  MANA_REGEN_VANILLA,
  PRIEST_HEALS_RANK_1,
  getAttributes,
  manaPerTickFromSpirit,
  maxHealthAtLevel1,
  maxManaAtLevel1,
  type ClassId,
  type RaceId,
} from './classicData';
import type { Role, SpellId } from '../simulation/types';

/** Niveau de tous les personnages et du boss. Tout le reste en découle. */
export const PLAYER_LEVEL = 1;

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
/* Groupe — cinq personnages Alliance de niveau 1                              */
/* -------------------------------------------------------------------------- */

export interface PartyMemberTemplate {
  id: string;
  name: string;
  race: RaceId;
  classId: ClassId;
  role: Role;
  hpMax: number;
  manaMax: number;
}

interface PartySlot {
  id: string;
  name: string;
  race: RaceId;
  classId: ClassId;
  role: Role;
}

const PARTY_SLOTS: readonly PartySlot[] = [
  { id: 'tank', name: 'Thorgrim', race: 'dwarf', classId: 'warrior', role: 'tank' },
  { id: 'healer', name: 'Elowen', race: 'human', classId: 'priest', role: 'healer' },
  { id: 'dps1', name: 'Kaelan', race: 'human', classId: 'rogue', role: 'dps' },
  { id: 'dps2', name: 'Fizzwick', race: 'gnome', classId: 'mage', role: 'dps' },
  { id: 'dps3', name: 'Sylandra', race: 'nightElf', classId: 'hunter', role: 'dps' },
] as const;

/**
 * Groupe complet, PV et mana calculés par les formules vanilla.
 * Au niveau 1 : Thorgrim 90 PV, Elowen 51 PV / 160 mana, Kaelan 55 PV,
 * Fizzwick 50 PV, Sylandra 46 PV.
 */
export const PARTY_TEMPLATE: readonly PartyMemberTemplate[] = PARTY_SLOTS.map((slot) => {
  const attributes = getAttributes(slot.race, slot.classId);
  return {
    ...slot,
    hpMax: maxHealthAtLevel1(slot.classId, attributes),
    manaMax: maxManaAtLevel1(slot.classId, attributes),
  };
});

/** Le joueur incarne ce membre du groupe. */
export const PLAYER_MEMBER_ID = 'healer';

const PLAYER_SLOT = PARTY_SLOTS.find((slot) => slot.id === PLAYER_MEMBER_ID)!;
const PLAYER_ATTRIBUTES = getAttributes(PLAYER_SLOT.race, PLAYER_SLOT.classId);

export const ROLE_LABELS: Record<Role, string> = {
  tank: 'Tank',
  healer: 'Soigneur',
  dps: 'DPS',
};

export const CLASS_LABELS: Record<ClassId, string> = {
  warrior: 'Guerrier',
  paladin: 'Paladin',
  hunter: 'Chasseur',
  rogue: 'Voleur',
  priest: 'Prêtre',
  mage: 'Mage',
};

export const RACE_LABELS: Record<RaceId, string> = {
  human: 'Humain',
  dwarf: 'Nain',
  nightElf: 'Elfe de la nuit',
  gnome: 'Gnome',
};

/* -------------------------------------------------------------------------- */
/* Mana du soigneur                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pool et régénération du prêtre, dérivés de ses attributs de niveau 1
 * (intelligence 22 → 160 mana, esprit 24 → 18,5 mana par palier de 2 s).
 *
 * Le comportement est celui de vanilla : la régénération tombe par paliers de
 * 2 secondes et la **règle des cinq secondes** la suspend totalement pendant
 * 5 s après chaque dépense de mana.
 */
export const MANA = {
  max: maxManaAtLevel1(PLAYER_SLOT.classId, PLAYER_ATTRIBUTES),
  initial: maxManaAtLevel1(PLAYER_SLOT.classId, PLAYER_ATTRIBUTES),
  tickMs: MANA_REGEN_VANILLA.tickMs,
  perTick: manaPerTickFromSpirit(PLAYER_ATTRIBUTES.spirit),
  fiveSecondRuleMs: MANA_REGEN_VANILLA.fiveSecondRuleMs,
} as const;

/** Plafond du compteur « temps depuis la dernière dépense de mana ». */
export const CAST_IDLE_CAP_MS = 10_000;

/* -------------------------------------------------------------------------- */
/* Sorts                                                                       */
/* -------------------------------------------------------------------------- */

export const GCD_MS = GLOBAL_COOLDOWN_MS;

export type SpellKind = 'direct' | 'hot' | 'group';

export interface SpellDefinition {
  id: SpellId;
  /** Identifiant Blizzard du sort, pour retrouver la source. */
  spellId: number;
  name: string;
  rank: number;
  /** Niveau d'apprentissage réel du sort en Classic. */
  requiredLevel: number;
  kind: SpellKind;
  castTimeMs: number;
  manaCost: number;
  requiresTarget: boolean;
  /** Soin direct : bornes min / max (le tirage est uniforme entre les deux). */
  healMin: number;
  healMax: number;
  /** HoT : soin par tick, nombre de ticks, intervalle. */
  healPerTick: number;
  hotTicks: number;
  hotIntervalMs: number;
  /** Description courte affichée sur le bouton. */
  description: string;
}

function defineSpell(id: SpellId, key: string, description: string): SpellDefinition {
  const source = PRIEST_HEALS_RANK_1[key];
  const kind: SpellKind = source.targetsParty
    ? 'group'
    : source.hotTicks > 0
      ? 'hot'
      : 'direct';

  return {
    id,
    spellId: source.spellId,
    name: source.name,
    rank: source.rank,
    requiredLevel: source.requiredLevel,
    kind,
    castTimeMs: source.castTimeMs,
    manaCost: source.manaCost,
    requiresTarget: !source.targetsParty,
    healMin: source.healMin,
    healMax: source.healMax,
    healPerTick: source.hotTicks > 0 ? source.hotTotalHeal / source.hotTicks : 0,
    hotTicks: source.hotTicks,
    hotIntervalMs: source.hotIntervalMs,
    description,
  };
}

/** Les cinq familles de soin du prêtre, au rang 1. */
export const SPELLS: Record<SpellId, SpellDefinition> = {
  lesserHeal: defineSpell('lesserHeal', 'lesserHeal', '46 – 56'),
  renew: defineSpell('renew', 'renew', '9 / tick × 5'),
  heal: defineSpell('heal', 'heal', '295 – 341'),
  flashHeal: defineSpell('flashHeal', 'flashHeal', '193 – 237'),
  prayerOfHealing: defineSpell('prayerOfHealing', 'prayerOfHealing', '312 – 333 au groupe'),
};

/** Ordre d'affichage : celui dans lequel le prêtre apprend les sorts. */
export const SPELL_ORDER: readonly SpellId[] = [
  'lesserHeal',
  'renew',
  'heal',
  'flashHeal',
  'prayerOfHealing',
] as const;

/** Sorts réellement utilisables au niveau courant. */
export function isSpellUnlocked(spell: SpellDefinition, level: number = PLAYER_LEVEL): boolean {
  return spell.requiredLevel <= level;
}

/* -------------------------------------------------------------------------- */
/* Boss — niveau 1, élite                                                      */
/* -------------------------------------------------------------------------- */

export const BOSS = {
  name: 'Gorvath, l’Effondreur',
  subtitle: 'Élite niveau 1 — survivez',
  level: PLAYER_LEVEL,
} as const;

/**
 * Mêlée sur le tank.
 *
 * Une créature de niveau 1 frappe pour 2 (médiane) à 10 (haut de la
 * distribution) ; le facteur élite mesuré va de ×1,2 à ×3. On retient 8 par
 * coup, dans la fourchette [6, 12] que ces deux bornes encadrent.
 *
 * La cadence est celle des créatures vanilla : un coup toutes les 2 s
 * (`MeleeBaseAttackTime` = 2000 pour toutes les créatures de niveau 1).
 */
export const TANK_DAMAGE = {
  amount: 8,
  intervalMs: CREATURE_LEVEL_1.meleeAttackTimeMs,
  firstAtMs: CREATURE_LEVEL_1.meleeAttackTimeMs,
} as const;

/** Capacité de zone du boss — game design, calibré sur des PV de niveau 1. */
export const AOE_DAMAGE = {
  amount: 6,
  intervalMs: 12_000,
  firstAtMs: 12_000,
} as const;

/**
 * Pic de dégâts sur un membre non-tank — game design.
 * 18 dégâts retirent environ un tiers des PV d'un DPS de niveau 1.
 */
export const SPIKE_DAMAGE = {
  amount: 18,
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
  /** Nombre de morts qui termine la partie. */
  maxDeaths: 3,
} as const;

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

export const FEEDBACK = {
  lifetimeMs: 1200,
  messageLifetimeMs: 1600,
  maxEntries: 40,
} as const;

/** Raisons possibles de refus d'un lancement de sort. */
export type CastRefusalReason =
  | 'game_over'
  | 'paused'
  | 'casting'
  | 'gcd'
  | 'level'
  | 'no_target'
  | 'target_dead'
  | 'mana';

export const REFUSAL_MESSAGES: Record<CastRefusalReason, string> = {
  game_over: 'Partie terminée',
  paused: 'Jeu en pause',
  casting: 'Cast déjà en cours',
  gcd: 'GCD actif',
  level: 'Niveau insuffisant',
  no_target: 'Cible requise',
  target_dead: 'Cible morte',
  mana: 'Mana insuffisante',
};

export const CANCEL_MESSAGE = 'Cast annulé';
