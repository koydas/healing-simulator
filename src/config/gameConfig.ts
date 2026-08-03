/**
 * Game balance constants.
 *
 * Two kinds of values live here, and the distinction is deliberate:
 *   - values **derived from WoW Classic** (health, mana, spells, regeneration)
 *     are computed from `classicData.ts` — never written by hand;
 *   - **game design** values (boss profile, event cadence, ramp) are set here,
 *     and documented as such in `docs/classic-stats.md`.
 *
 * No other layer of the project contains a magic number.
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

/** Level of every character and of the boss. Everything else follows from it. */
export const PLAYER_LEVEL = 1;

/** Fixed simulation step, in milliseconds. */
export const TICK_MS = 100;

/** Maximum catch-up allowed on a single frame (5 simulation steps). */
export const MAX_CATCHUP_MS = 500;

/**
 * Past this delta we assume the tab was in the background: the elapsed time is
 * discarded, no catch-up is performed.
 */
export const LONG_STALL_MS = 1000;

/** Default seed of the pseudo-random generator. */
export const DEFAULT_SEED = 1337;

/* -------------------------------------------------------------------------- */
/* Party — five level 1 Alliance characters                                    */
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
 * Full party, health and mana computed by the vanilla formulas.
 * At level 1: Thorgrim 90 HP, Elowen 51 HP / 160 mana, Kaelan 55 HP,
 * Fizzwick 50 HP, Sylandra 46 HP.
 */
export const PARTY_TEMPLATE: readonly PartyMemberTemplate[] = PARTY_SLOTS.map((slot) => {
  const attributes = getAttributes(slot.race, slot.classId);
  return {
    ...slot,
    hpMax: maxHealthAtLevel1(slot.classId, attributes),
    manaMax: maxManaAtLevel1(slot.classId, attributes),
  };
});

/** The player controls this party member. */
export const PLAYER_MEMBER_ID = 'healer';

const PLAYER_SLOT = PARTY_SLOTS.find((slot) => slot.id === PLAYER_MEMBER_ID)!;
const PLAYER_ATTRIBUTES = getAttributes(PLAYER_SLOT.race, PLAYER_SLOT.classId);

export const ROLE_LABELS: Record<Role, string> = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'DPS',
};

export const CLASS_LABELS: Record<ClassId, string> = {
  warrior: 'Warrior',
  paladin: 'Paladin',
  hunter: 'Hunter',
  rogue: 'Rogue',
  priest: 'Priest',
  mage: 'Mage',
};

export const RACE_LABELS: Record<RaceId, string> = {
  human: 'Human',
  dwarf: 'Dwarf',
  nightElf: 'Night Elf',
  gnome: 'Gnome',
};

/* -------------------------------------------------------------------------- */
/* Healer mana                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Priest pool and regeneration, derived from level 1 attributes
 * (intellect 22 → 160 mana, spirit 24 → 18.5 mana per 2s tick).
 *
 * The behaviour is vanilla's: regeneration lands in 2-second ticks and the
 * **five-second rule** fully suspends it for 5 s after every mana expenditure.
 */
export const MANA = {
  max: maxManaAtLevel1(PLAYER_SLOT.classId, PLAYER_ATTRIBUTES),
  initial: maxManaAtLevel1(PLAYER_SLOT.classId, PLAYER_ATTRIBUTES),
  tickMs: MANA_REGEN_VANILLA.tickMs,
  perTick: manaPerTickFromSpirit(PLAYER_ATTRIBUTES.spirit),
  fiveSecondRuleMs: MANA_REGEN_VANILLA.fiveSecondRuleMs,
} as const;

/** Cap of the "time since the last mana expenditure" counter. */
export const CAST_IDLE_CAP_MS = 10_000;

/* -------------------------------------------------------------------------- */
/* Spells                                                                      */
/* -------------------------------------------------------------------------- */

export const GCD_MS = GLOBAL_COOLDOWN_MS;

export type SpellKind = 'direct' | 'hot' | 'group';

export interface SpellDefinition {
  id: SpellId;
  /** Blizzard spell id, so the source can be looked up. */
  spellId: number;
  name: string;
  rank: number;
  /** Real training level of the spell in Classic. */
  requiredLevel: number;
  kind: SpellKind;
  castTimeMs: number;
  manaCost: number;
  requiresTarget: boolean;
  /** Direct heal: min / max bounds (the roll is uniform between them). */
  healMin: number;
  healMax: number;
  /** HoT: healing per tick, tick count, interval. */
  healPerTick: number;
  hotTicks: number;
  hotIntervalMs: number;
  /** Short description shown on the button. */
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

/** The five priest healing families, at rank 1. */
export const SPELLS: Record<SpellId, SpellDefinition> = {
  lesserHeal: defineSpell('lesserHeal', 'lesserHeal', '46 – 56'),
  renew: defineSpell('renew', 'renew', '9 / tick × 5'),
  heal: defineSpell('heal', 'heal', '295 – 341'),
  flashHeal: defineSpell('flashHeal', 'flashHeal', '193 – 237'),
  prayerOfHealing: defineSpell('prayerOfHealing', 'prayerOfHealing', '312 – 333 party'),
};

/** Display order: the order in which the priest learns the spells. */
export const SPELL_ORDER: readonly SpellId[] = [
  'lesserHeal',
  'renew',
  'heal',
  'flashHeal',
  'prayerOfHealing',
] as const;

/** Spells actually usable at the given level. */
export function isSpellUnlocked(spell: SpellDefinition, level: number = PLAYER_LEVEL): boolean {
  return spell.requiredLevel <= level;
}

/* -------------------------------------------------------------------------- */
/* Boss — level 1, elite                                                       */
/* -------------------------------------------------------------------------- */

export const BOSS = {
  name: 'Gorvath the Cavebreaker',
  subtitle: 'Level 1 elite — stay alive',
  level: PLAYER_LEVEL,
} as const;

/**
 * Melee on the tank.
 *
 * A level 1 creature hits for 2 (median) to 10 (high end of the distribution);
 * the measured elite factor ranges from ×1.2 to ×3. We use 8 per swing, inside
 * the [6, 12] range those two bounds define.
 *
 * The cadence is the vanilla one: one swing every 2 s
 * (`MeleeBaseAttackTime` = 2000 for every level 1 creature).
 */
export const TANK_DAMAGE = {
  amount: 8,
  intervalMs: CREATURE_LEVEL_1.meleeAttackTimeMs,
  firstAtMs: CREATURE_LEVEL_1.meleeAttackTimeMs,
} as const;

/** Boss area ability — game design, calibrated against level 1 health pools. */
export const AOE_DAMAGE = {
  amount: 6,
  intervalMs: 12_000,
  firstAtMs: 12_000,
} as const;

/**
 * Damage spike on a non-tank member — game design.
 * 18 damage removes roughly a third of a level 1 DPS's health.
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
/* End of fight                                                                */
/* -------------------------------------------------------------------------- */

export const WIPE = {
  /** Number of deaths that ends the fight. */
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

/** Possible reasons for refusing a spell cast. */
export type CastRefusalReason =
  | 'game_over'
  | 'paused'
  | 'caster_dead'
  | 'casting'
  | 'gcd'
  | 'level'
  | 'no_target'
  | 'target_dead'
  | 'mana';

export const REFUSAL_MESSAGES: Record<CastRefusalReason, string> = {
  game_over: 'Fight is over',
  paused: 'Game paused',
  caster_dead: 'You are dead',
  casting: 'Already casting',
  gcd: 'Global cooldown',
  level: 'Level too low',
  no_target: 'Target required',
  target_dead: 'Target is dead',
  mana: 'Not enough mana',
};

export const CANCEL_MESSAGE = 'Cast cancelled';
