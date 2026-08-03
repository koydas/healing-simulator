/**
 * Données brutes de WoW Classic (patch 1.12) — niveau 1.
 *
 * Ce fichier ne contient QUE des valeurs sourcées et les formules officielles
 * qui les combinent. Les choix de game design (profil du boss, cadence des
 * événements) vivent dans `gameConfig.ts`, jamais ici.
 *
 * Sources — voir `docs/classic-stats.md` pour le détail et les liens :
 *   - PV / mana de base par classe : table `player_classlevelstats`
 *     (MaNGOS Zero, base de données vanilla 1.12).
 *   - Attributs par race/classe : table `player_levelstats` (même source).
 *   - Formules attribut → PV / mana : `Player::GetHealthBonusFromStamina` et
 *     `Player::GetManaBonusFromIntellect` (mangoszero/server, StatSystem.cpp).
 *   - Sorts de soin du prêtre : valeurs de rang 1 (wowclassicdb / EZDownRank).
 *   - Créatures de niveau 1 : table `creature_template` (même base vanilla).
 */

/** Classes de personnage (identifiants Blizzard). */
export type ClassId = 'warrior' | 'paladin' | 'hunter' | 'rogue' | 'priest' | 'mage';

/** Races jouables utilisées par le groupe. */
export type RaceId = 'human' | 'dwarf' | 'nightElf' | 'gnome';

export interface Attributes {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  spirit: number;
}

/* -------------------------------------------------------------------------- */
/* PV et mana de base par classe, au niveau 1                                  */
/* -------------------------------------------------------------------------- */

/**
 * `player_classlevelstats` (class, level=1, basehp, basemana).
 * Warrior et Rogue n'utilisent pas de mana (rage / énergie).
 */
export const CLASS_BASE_LEVEL_1: Record<ClassId, { baseHealth: number; baseMana: number }> = {
  warrior: { baseHealth: 20, baseMana: 0 },
  paladin: { baseHealth: 28, baseMana: 59 },
  hunter: { baseHealth: 26, baseMana: 63 },
  rogue: { baseHealth: 25, baseMana: 0 },
  priest: { baseHealth: 31, baseMana: 110 },
  mage: { baseHealth: 31, baseMana: 100 },
};

/* -------------------------------------------------------------------------- */
/* Attributs de départ par race et classe, au niveau 1                         */
/* -------------------------------------------------------------------------- */

/** `player_levelstats` (race, class, level=1, str, agi, sta, inte, spi). */
export const RACE_CLASS_ATTRIBUTES_LEVEL_1: Record<
  string,
  Attributes
> = {
  'human/warrior': { strength: 23, agility: 20, stamina: 22, intellect: 20, spirit: 21 },
  'human/paladin': { strength: 22, agility: 20, stamina: 22, intellect: 20, spirit: 22 },
  'human/rogue': { strength: 21, agility: 23, stamina: 21, intellect: 20, spirit: 20 },
  'human/priest': { strength: 20, agility: 20, stamina: 20, intellect: 22, spirit: 24 },
  'human/mage': { strength: 20, agility: 20, stamina: 20, intellect: 23, spirit: 22 },
  'dwarf/warrior': { strength: 25, agility: 16, stamina: 25, intellect: 19, spirit: 19 },
  'dwarf/paladin': { strength: 24, agility: 16, stamina: 25, intellect: 19, spirit: 20 },
  'dwarf/hunter': { strength: 22, agility: 19, stamina: 24, intellect: 19, spirit: 20 },
  'dwarf/rogue': { strength: 23, agility: 19, stamina: 24, intellect: 19, spirit: 19 },
  'dwarf/priest': { strength: 22, agility: 16, stamina: 23, intellect: 21, spirit: 22 },
  'nightElf/warrior': { strength: 20, agility: 25, stamina: 21, intellect: 20, spirit: 20 },
  'nightElf/hunter': { strength: 17, agility: 28, stamina: 20, intellect: 20, spirit: 21 },
  'nightElf/rogue': { strength: 18, agility: 28, stamina: 20, intellect: 20, spirit: 20 },
  'nightElf/priest': { strength: 17, agility: 25, stamina: 19, intellect: 22, spirit: 23 },
  'gnome/warrior': { strength: 18, agility: 23, stamina: 21, intellect: 23, spirit: 20 },
  'gnome/rogue': { strength: 16, agility: 26, stamina: 20, intellect: 23, spirit: 20 },
  'gnome/mage': { strength: 15, agility: 23, stamina: 19, intellect: 26, spirit: 22 },
};

export function getAttributes(race: RaceId, classId: ClassId): Attributes {
  const key = `${race}/${classId}`;
  const attributes = RACE_CLASS_ATTRIBUTES_LEVEL_1[key];
  if (!attributes) {
    throw new Error(`Combinaison race/classe inconnue au niveau 1 : ${key}`);
  }
  return attributes;
}

/* -------------------------------------------------------------------------- */
/* Formules officielles vanilla                                                */
/* -------------------------------------------------------------------------- */

/**
 * Bonus de PV apporté par l'endurance.
 * Les 20 premiers points donnent 1 PV, les suivants 10 PV.
 * (`Player::GetHealthBonusFromStamina`)
 */
export function healthBonusFromStamina(stamina: number): number {
  const base = Math.min(stamina, 20);
  return base + (stamina - base) * 10;
}

/**
 * Bonus de mana apporté par l'intelligence.
 * Les 20 premiers points donnent 1 mana, les suivants 15.
 * (`Player::GetManaBonusFromIntellect`)
 */
export function manaBonusFromIntellect(intellect: number): number {
  const base = Math.min(intellect, 20);
  return base + (intellect - base) * 15;
}

/** PV maximum d'un personnage de niveau 1. */
export function maxHealthAtLevel1(classId: ClassId, attributes: Attributes): number {
  return CLASS_BASE_LEVEL_1[classId].baseHealth + healthBonusFromStamina(attributes.stamina);
}

/** Mana maximum d'un personnage de niveau 1 (0 pour les classes sans mana). */
export function maxManaAtLevel1(classId: ClassId, attributes: Attributes): number {
  const base = CLASS_BASE_LEVEL_1[classId].baseMana;
  if (base <= 0) return 0;
  return base + manaBonusFromIntellect(attributes.intellect);
}

/* -------------------------------------------------------------------------- */
/* Régénération de mana                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Régénération hors combat de mana, en vanilla :
 *   - elle tombe par paliers de 2 secondes ;
 *   - la « règle des cinq secondes » (5SR) suspend totalement la part liée à
 *     l'esprit pendant 5 secondes après une dépense de mana.
 *
 * Le coefficient exact vit dans le DBC `gtRegenMPPerSpt` (non public) et dépend
 * de la classe ET du niveau. On utilise ici la formule prêtre communément
 * documentée — c'est la seule valeur *approchée* du fichier, signalée comme
 * telle dans `docs/classic-stats.md`.
 */
export const MANA_REGEN_VANILLA = {
  tickMs: 2000,
  fiveSecondRuleMs: 5000,
  /** mana par palier de 2 s = esprit / 4 + 12,5 (prêtre) */
  spiritDivisor: 4,
  flatBonus: 12.5,
} as const;

export function manaPerTickFromSpirit(spirit: number): number {
  return spirit / MANA_REGEN_VANILLA.spiritDivisor + MANA_REGEN_VANILLA.flatBonus;
}

/* -------------------------------------------------------------------------- */
/* Sorts de soin du prêtre — valeurs de rang 1                                 */
/* -------------------------------------------------------------------------- */

export interface PriestHealRank {
  /** Identifiant de sort Blizzard, pour retrouver la source. */
  spellId: number;
  name: string;
  rank: number;
  /** Niveau auquel le prêtre apprend ce rang. */
  requiredLevel: number;
  manaCost: number;
  castTimeMs: number;
  /** Soin direct minimum / maximum (0 pour un HoT). */
  healMin: number;
  healMax: number;
  /** Soin total du HoT et cadence de ses ticks (0 pour un soin direct). */
  hotTotalHeal: number;
  hotTicks: number;
  hotIntervalMs: number;
  /** Cible unique ou groupe entier. */
  targetsParty: boolean;
}

/**
 * Les cinq familles de soin du prêtre vanilla, au rang 1.
 * `requiredLevel` est le vrai niveau d'apprentissage : au niveau 1, seul
 * Lesser Heal est disponible (voir ADR-0008).
 */
export const PRIEST_HEALS_RANK_1: Record<string, PriestHealRank> = {
  lesserHeal: {
    spellId: 2050,
    name: 'Lesser Heal',
    rank: 1,
    requiredLevel: 1,
    manaCost: 30,
    castTimeMs: 1500,
    healMin: 46,
    healMax: 56,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: false,
  },
  renew: {
    spellId: 139,
    name: 'Renew',
    rank: 1,
    requiredLevel: 8,
    manaCost: 30,
    castTimeMs: 0,
    healMin: 0,
    healMax: 0,
    hotTotalHeal: 45,
    hotTicks: 5,
    hotIntervalMs: 3000,
    targetsParty: false,
  },
  heal: {
    spellId: 2054,
    name: 'Heal',
    rank: 1,
    requiredLevel: 16,
    manaCost: 155,
    castTimeMs: 3000,
    healMin: 295,
    healMax: 341,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: false,
  },
  flashHeal: {
    spellId: 2061,
    name: 'Flash Heal',
    rank: 1,
    requiredLevel: 20,
    manaCost: 125,
    castTimeMs: 1500,
    healMin: 193,
    healMax: 237,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: false,
  },
  prayerOfHealing: {
    spellId: 596,
    name: 'Prayer of Healing',
    rank: 1,
    requiredLevel: 30,
    manaCost: 410,
    castTimeMs: 3000,
    healMin: 312,
    healMax: 333,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: true,
  },
};

/** Global cooldown vanilla, identique pour tous les sorts de soin. */
export const GLOBAL_COOLDOWN_MS = 1500;

/* -------------------------------------------------------------------------- */
/* Créatures de niveau 1                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Relevé sur les 597 créatures de niveau 1 « réelles » de `creature_template`
 * (déclencheurs et formes de métamorphose exclus) :
 *   - dégâts de mêlée : médiane 2, troisième quartile 9-10 ;
 *   - PV : médiane 64 ;
 *   - vitesse d'attaque : 2000 ms.
 *
 * Facteur élite mesuré sur la même base, en comparant rang 0 et rang 1 à niveau
 * égal : ×1,2 au niveau 20 puis ×3 environ à partir du niveau 30 (les PV, eux,
 * font ×1,6 à ×3).
 */
export const CREATURE_LEVEL_1 = {
  meleeDamageMedian: 2,
  meleeDamageHighEnd: 10,
  meleeAttackTimeMs: 2000,
  healthMedian: 64,
} as const;

export const ELITE_DAMAGE_FACTOR_MEASURED = {
  level20: 1.24,
  level30: 3.11,
  level40: 3.27,
  level50: 3.22,
  level60: 2.9,
} as const;
