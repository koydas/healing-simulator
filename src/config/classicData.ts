/**
 * Raw WoW Classic (patch 1.12) data — level 1.
 *
 * This file holds ONLY sourced values and the official formulas that combine
 * them. Game-design choices (boss profile, event cadence) live in
 * `gameConfig.ts`, never here.
 *
 * Sources — see `docs/classic-stats.md` for details and links:
 *   - base health / mana per class: `player_classlevelstats` table
 *     (MaNGOS Zero, vanilla 1.12 database).
 *   - attributes per race/class: `player_levelstats` table (same source).
 *   - attribute → health / mana formulas: `Player::GetHealthBonusFromStamina`
 *     and `Player::GetManaBonusFromIntellect` (mangoszero/server, StatSystem.cpp).
 *   - priest healing spells: rank 1 values (wowclassicdb / EZDownRank).
 *   - level 1 creatures: `creature_template` table (same vanilla database).
 */

/** Character classes (Blizzard identifiers). */
export type ClassId = 'warrior' | 'paladin' | 'hunter' | 'rogue' | 'priest' | 'mage';

/** Playable races used by the party. */
export type RaceId = 'human' | 'dwarf' | 'nightElf' | 'gnome';

export interface Attributes {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  spirit: number;
}

/* -------------------------------------------------------------------------- */
/* Base health and mana per class, at level 1                                  */
/* -------------------------------------------------------------------------- */

/**
 * `player_classlevelstats` (class, level=1, basehp, basemana).
 * Warriors and rogues use no mana (rage / energy).
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
/* Starting attributes per race and class, at level 1                          */
/* -------------------------------------------------------------------------- */

/** `player_levelstats` (race, class, level=1, str, agi, sta, inte, spi). */
export const RACE_CLASS_ATTRIBUTES_LEVEL_1: Record<string, Attributes> = {
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
    throw new Error(`Unknown race/class combination at level 1: ${key}`);
  }
  return attributes;
}

/* -------------------------------------------------------------------------- */
/* Official vanilla formulas                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Health granted by stamina.
 * The first 20 points give 1 health each, every point beyond gives 10.
 * (`Player::GetHealthBonusFromStamina`)
 */
export function healthBonusFromStamina(stamina: number): number {
  const base = Math.min(stamina, 20);
  return base + (stamina - base) * 10;
}

/**
 * Mana granted by intellect.
 * The first 20 points give 1 mana each, every point beyond gives 15.
 * (`Player::GetManaBonusFromIntellect`)
 */
export function manaBonusFromIntellect(intellect: number): number {
  const base = Math.min(intellect, 20);
  return base + (intellect - base) * 15;
}

/** Maximum health of a level 1 character. */
export function maxHealthAtLevel1(classId: ClassId, attributes: Attributes): number {
  return CLASS_BASE_LEVEL_1[classId].baseHealth + healthBonusFromStamina(attributes.stamina);
}

/** Maximum mana of a level 1 character (0 for classes without mana). */
export function maxManaAtLevel1(classId: ClassId, attributes: Attributes): number {
  const base = CLASS_BASE_LEVEL_1[classId].baseMana;
  if (base <= 0) return 0;
  return base + manaBonusFromIntellect(attributes.intellect);
}

/* -------------------------------------------------------------------------- */
/* Mana regeneration                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Vanilla out-of-combat mana regeneration:
 *   - it lands in 2-second ticks;
 *   - the "five-second rule" (5SR) fully suspends the spirit-based part for
 *     5 seconds after any mana expenditure.
 *
 * The exact coefficient lives in the `gtRegenMPPerSpt` DBC (not public) and
 * depends on both class AND level. We use the commonly documented priest
 * formula — the only *approximated* value in this file, flagged as such in
 * `docs/classic-stats.md`.
 */
export const MANA_REGEN_VANILLA = {
  tickMs: 2000,
  fiveSecondRuleMs: 5000,
  /** mana per 2s tick = spirit / 4 + 12.5 (priest) */
  spiritDivisor: 4,
  flatBonus: 12.5,
} as const;

export function manaPerTickFromSpirit(spirit: number): number {
  return spirit / MANA_REGEN_VANILLA.spiritDivisor + MANA_REGEN_VANILLA.flatBonus;
}

/* -------------------------------------------------------------------------- */
/* Priest healing spells — rank 1 values                                       */
/* -------------------------------------------------------------------------- */

export interface PriestHealRank {
  /** Blizzard spell id, so the source can be looked up. */
  spellId: number;
  name: string;
  rank: number;
  /** Level at which the priest learns this rank. */
  requiredLevel: number;
  manaCost: number;
  castTimeMs: number;
  /** Minimum / maximum direct healing (0 for a HoT). */
  healMin: number;
  healMax: number;
  /** Total HoT healing and its tick cadence (0 for a direct heal). */
  hotTotalHeal: number;
  hotTicks: number;
  hotIntervalMs: number;
  /** Single target or whole party. */
  targetsParty: boolean;
}

/**
 * The five vanilla priest healing families, at rank 1.
 * `requiredLevel` is the real training level: at level 1 only Lesser Heal is
 * available (see ADR-0008).
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

/** Vanilla global cooldown, identical for every healing spell. */
export const GLOBAL_COOLDOWN_MS = 1500;

/* -------------------------------------------------------------------------- */
/* Level 1 creatures                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Measured over the 597 "real" level 1 creatures of `creature_template`
 * (triggers and shapeshift forms excluded):
 *   - melee damage: median 2, third quartile 9-10;
 *   - health: median 64;
 *   - attack speed: 2000 ms.
 *
 * Elite factor measured on the same data, comparing rank 0 and rank 1 at equal
 * level: ×1.2 at level 20, then roughly ×3 from level 30 upwards (health goes
 * ×1.6 to ×3).
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
