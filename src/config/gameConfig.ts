/**
 * Game balance constants.
 *
 * Two kinds of values live here, and the distinction is deliberate:
 *   - values **derived from WoW Classic** (health, mana, spells, regeneration,
 *     experience thresholds) are computed from `classicData.ts` — never
 *     written by hand;
 *   - **game design** values (boss profile, event cadence, ramp, the
 *     experience a boss kill is worth) are set here, and documented as such in
 *     `docs/classic-stats.md`.
 *
 * No other layer of the project contains a magic number.
 */

import {
  CREATURE_LEVEL_1,
  DRUID_SPELLS_RANK_1,
  GLOBAL_COOLDOWN_MS,
  MANA_REGEN_VANILLA,
  MAX_LEVEL,
  PALADIN_SPELLS_RANK_1,
  PRIEST_SPELLS_RANK_1,
  getAttributes,
  manaPerTickFromSpirit,
  maxHealthAtLevel,
  maxManaAtLevel,
  xpToNextLevel,
  type Attributes,
  type ClassId,
  type ClassSpellRank,
  type RaceId,
} from './classicData';
import type { EncounterProfile, EnemyId, Role, SpellId } from '../simulation/types';

/** Level a character starts at, and the level of a fight with no saved profile. */
export const STARTING_LEVEL = 1;

/** Vanilla level cap — re-exported so the game layer never imports it twice. */
export { MAX_LEVEL };

/**
 * Level of every enemy. The three encounters are level 1 designs (ADR-0010):
 * they keep that level as the healer climbs, so the fight gets easier with
 * every level rather than scaling — see `docs/balance.md`.
 */
export const ENEMY_LEVEL = 1;

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

/** The player controls this party member. */
export const PLAYER_MEMBER_ID = 'healer';

const PLAYER_SLOT = PARTY_SLOTS.find((slot) => slot.id === PLAYER_MEMBER_ID)!;

/**
 * Classes the player's own character may be edited to, from the character
 * sheet (ADR-0020, ADR-0021): the three healer classes this game actually
 * simulates a spellbook for. Each has its own four rank 1 spells (`SPELLS`,
 * `SPELL_ORDER`), unlike before ADR-0021 where every playable class cast the
 * same priest spellbook and the choice was cosmetic. Mage and hunter — two of
 * the other three sourced race/class combinations — are no longer offered:
 * this game only ever simulated a healer, and giving the healer a mage's or a
 * hunter's flavor never fit that any better than a warrior's or a rogue's
 * (both excluded from the start for having no mana at all).
 */
export const PLAYABLE_CLASSES = ['priest', 'druid', 'paladin'] as const;
export type PlayableClassId = (typeof PLAYABLE_CLASSES)[number];

export function isPlayableClass(value: unknown): value is PlayableClassId {
  return typeof value === 'string' && (PLAYABLE_CLASSES as readonly string[]).includes(value);
}

/**
 * Race paired with each playable class — human priest and human paladin
 * match `PARTY_SLOTS`'s and Classic's own Alliance pairing; night elf is the
 * only Alliance race with a druid in vanilla. Changing class therefore
 * changes race and every derived stat with it; it is not an independent
 * choice (see `classic-data`: only a sourced race/class combination has a
 * full attribute table past level 1).
 */
const PLAYABLE_CLASS_RACE: Record<PlayableClassId, RaceId> = {
  priest: 'human',
  druid: 'nightElf',
  paladin: 'human',
};

export function raceForPlayableClass(classId: PlayableClassId): RaceId {
  return PLAYABLE_CLASS_RACE[classId];
}

/** Identity of the player's own character, as stored on the profile. */
export interface PlayerIdentity {
  name: string;
  classId: PlayableClassId;
}

export const DEFAULT_PLAYER_NAME = PLAYER_SLOT.name;
export const DEFAULT_PLAYER_CLASS: PlayableClassId = 'priest';
/** Longest name the character sheet accepts (`sanitizeName` enforces it too). */
export const PLAYER_NAME_MAX_LENGTH = 24;

const DEFAULT_PLAYER_IDENTITY: PlayerIdentity = {
  name: DEFAULT_PLAYER_NAME,
  classId: DEFAULT_PLAYER_CLASS,
};

/**
 * Full party at a given level, health and mana computed by the vanilla
 * formulas. At level 1: Thorgrim 90 HP, Elowen 51 HP / 160 mana, Kaelan 55 HP,
 * Fizzwick 50 HP, Sylandra 46 HP. At level 60: 2639 / 1707 / 2093 / 1620 /
 * 2177 HP — the whole party levels with the player, not the healer alone.
 *
 * `player` overrides the healer slot's name, race and class with the saved
 * profile's identity (ADR-0020); defaulted to Elowen the human priest so
 * every other call site — the level 1 constants below, the tests — keeps
 * behaving exactly as it did before that identity was editable.
 */
export function partyTemplateAtLevel(
  level: number,
  player: PlayerIdentity = DEFAULT_PLAYER_IDENTITY,
): readonly PartyMemberTemplate[] {
  return PARTY_SLOTS.map((slot) => {
    const isPlayer = slot.id === PLAYER_MEMBER_ID;
    const name = isPlayer ? player.name : slot.name;
    const race = isPlayer ? raceForPlayableClass(player.classId) : slot.race;
    const classId: ClassId = isPlayer ? player.classId : slot.classId;
    const attributes = getAttributes(race, classId, level);
    return {
      ...slot,
      name,
      race,
      classId,
      hpMax: maxHealthAtLevel(classId, attributes, level),
      manaMax: maxManaAtLevel(classId, attributes, level),
    };
  });
}

/** The party as it starts out, at level 1. */
export const PARTY_TEMPLATE: readonly PartyMemberTemplate[] = partyTemplateAtLevel(STARTING_LEVEL);

/** Attributes of the player's character at the given level. */
export function playerAttributesAtLevel(
  level: number,
  player: PlayerIdentity = DEFAULT_PLAYER_IDENTITY,
): Attributes {
  return getAttributes(raceForPlayableClass(player.classId), player.classId, level);
}

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
  druid: 'Druid',
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

export interface ManaProfile {
  max: number;
  initial: number;
  tickMs: number;
  perTick: number;
  fiveSecondRuleMs: number;
}

/**
 * Priest pool and regeneration at a given level, derived from that level's
 * attributes (level 1: intellect 22 → 160 mana, spirit 24 → 18.5 mana per 2s
 * tick; level 60: intellect 120 → 2956 mana, spirit 131 → 45.25 per tick).
 * Druid and paladin get their own pool the same way, from their own attribute
 * tables (ADR-0020, ADR-0021) — and, since ADR-0021, their own spellbook too.
 *
 * The behaviour is vanilla's: regeneration lands in 2-second ticks and the
 * **five-second rule** fully suspends it for 5 s after every mana expenditure.
 */
export function manaProfileAtLevel(
  level: number,
  player: PlayerIdentity = DEFAULT_PLAYER_IDENTITY,
): ManaProfile {
  const attributes = playerAttributesAtLevel(level, player);
  const max = maxManaAtLevel(player.classId, attributes, level);
  return {
    max,
    initial: max,
    tickMs: MANA_REGEN_VANILLA.tickMs,
    perTick: manaPerTickFromSpirit(attributes.spirit),
    fiveSecondRuleMs: MANA_REGEN_VANILLA.fiveSecondRuleMs,
  };
}

/** The healer's mana as the game starts, at level 1. */
export const MANA: ManaProfile = manaProfileAtLevel(STARTING_LEVEL);

/** Cap of the "time since the last mana expenditure" counter. */
export const CAST_IDLE_CAP_MS = 10_000;

/* -------------------------------------------------------------------------- */
/* Spells                                                                      */
/* -------------------------------------------------------------------------- */

export const GCD_MS = GLOBAL_COOLDOWN_MS;

/**
 * `hot` and `group` predate ADR-0021; `groupHot` (a HoT applied to every
 * living member at once, e.g. the druid's Tranquility) and `shield` (an
 * absorb pool consumed by damage before HP, e.g. Power Word: Shield) are new
 * with it.
 */
export type SpellKind = 'direct' | 'hot' | 'group' | 'groupHot' | 'shield';

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
  /** Always the caster, never the selected target (e.g. Divine Shield). */
  targetsSelf: boolean;
  /** Direct heal: min / max bounds (the roll is uniform between them). */
  healMin: number;
  healMax: number;
  /** HoT / group HoT: healing per tick, tick count, interval. */
  healPerTick: number;
  hotTicks: number;
  hotIntervalMs: number;
  /** Shield: absorb pool granted, and how long it lasts unconsumed. */
  shieldAmount: number;
  shieldDurationMs: number;
  /** Short description shown on the button. */
  description: string;
}

function classifySpellKind(source: ClassSpellRank): SpellKind {
  if (source.shieldAmount > 0) return 'shield';
  if (source.targetsParty) return source.hotTicks > 0 ? 'groupHot' : 'group';
  return source.hotTicks > 0 ? 'hot' : 'direct';
}

/**
 * Builds a `SpellDefinition` from a sourced rank. `overrides` exists for the
 * one deliberate deviation from Classic's own training levels: Renew's is
 * lowered from 8 to 1 so the default class (priest) is not left with zero
 * castable spells between levels 1 and 3, since Shield itself only trains at
 * 4 — see ADR-0021. Every other spell uses its real, sourced level untouched.
 */
function defineSpell(
  id: SpellId,
  source: ClassSpellRank,
  description: string,
  overrides: Partial<Pick<ClassSpellRank, 'requiredLevel'>> = {},
): SpellDefinition {
  const merged: ClassSpellRank = { ...source, ...overrides };
  const kind = classifySpellKind(merged);

  return {
    id,
    spellId: merged.spellId,
    name: merged.name,
    rank: merged.rank,
    requiredLevel: merged.requiredLevel,
    kind,
    castTimeMs: merged.castTimeMs,
    manaCost: merged.manaCost,
    requiresTarget: !merged.targetsParty && !merged.targetsSelf,
    targetsSelf: merged.targetsSelf,
    healMin: merged.healMin,
    healMax: merged.healMax,
    healPerTick: merged.hotTicks > 0 ? merged.hotTotalHeal / merged.hotTicks : 0,
    hotTicks: merged.hotTicks,
    hotIntervalMs: merged.hotIntervalMs,
    shieldAmount: merged.shieldAmount,
    shieldDurationMs: merged.shieldDurationMs,
    description,
  };
}

/**
 * Every spell of every playable class, at rank 1 — spell ids are unique
 * across classes, so this stays one flat lookup (`SPELLS[cast.spellId]`)
 * regardless of which class is fighting. `SPELL_ORDER` is what varies per
 * class.
 */
export const SPELLS: Record<SpellId, SpellDefinition> = {
  // Priest.
  shield: defineSpell('shield', PRIEST_SPELLS_RANK_1.shield, 'Absorbs 44 damage'),
  renew: defineSpell('renew', PRIEST_SPELLS_RANK_1.renew, '9 / tick × 5', { requiredLevel: 1 }),
  heal: defineSpell('heal', PRIEST_SPELLS_RANK_1.heal, '295 – 341'),
  prayerOfHealing: defineSpell(
    'prayerOfHealing',
    PRIEST_SPELLS_RANK_1.prayerOfHealing,
    '312 – 333 party',
  ),
  // Druid.
  healingTouch: defineSpell('healingTouch', DRUID_SPELLS_RANK_1.healingTouch, '37 – 51'),
  rejuvenation: defineSpell('rejuvenation', DRUID_SPELLS_RANK_1.rejuvenation, '8 / tick × 4'),
  thorns: defineSpell('thorns', DRUID_SPELLS_RANK_1.thorns, 'Absorbs 36 damage'),
  tranquility: defineSpell(
    'tranquility',
    DRUID_SPELLS_RANK_1.tranquility,
    '20 / tick × 5 party',
  ),
  // Paladin.
  holyLight: defineSpell('holyLight', PALADIN_SPELLS_RANK_1.holyLight, '39 – 47'),
  blessingOfProtection: defineSpell(
    'blessingOfProtection',
    PALADIN_SPELLS_RANK_1.blessingOfProtection,
    'Absorbs 200 damage',
  ),
  divineShield: defineSpell(
    'divineShield',
    PALADIN_SPELLS_RANK_1.divineShield,
    'Absorbs 500 damage',
  ),
  holyRadiance: defineSpell(
    'holyRadiance',
    PALADIN_SPELLS_RANK_1.holyRadiance,
    '280 – 310 party',
  ),
};

/**
 * Display order per class: the order in which that class learns its four
 * spells (ascending by `requiredLevel`), the same convention the single
 * priest spellbook used before ADR-0021.
 */
export const SPELL_ORDER: Record<PlayableClassId, readonly SpellId[]> = {
  priest: ['renew', 'shield', 'heal', 'prayerOfHealing'],
  druid: ['healingTouch', 'rejuvenation', 'thorns', 'tranquility'],
  paladin: ['holyLight', 'blessingOfProtection', 'divineShield', 'holyRadiance'],
};

/** Spells actually usable at the given level. */
export function isSpellUnlocked(spell: SpellDefinition, level: number = STARTING_LEVEL): boolean {
  return spell.requiredLevel <= level;
}

/** The spells a character of that class and level has trained, in learning order. */
export function spellsKnownAtLevel(
  level: number,
  classId: PlayableClassId = DEFAULT_PLAYER_CLASS,
): readonly SpellDefinition[] {
  return SPELL_ORDER[classId]
    .map((spellId) => SPELLS[spellId])
    .filter((spell) => isSpellUnlocked(spell, level));
}

/* -------------------------------------------------------------------------- */
/* Enemies — level 1, elite                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Melee on the tank, shared cadence.
 *
 * A level 1 creature hits for 2 (median) to 10 (high end of the distribution);
 * the measured elite factor ranges from ×1.2 to ×3. Every profile below picks
 * its amount inside the [6, 12] range those two bounds define.
 *
 * The cadence is the vanilla one: one swing every 2 s
 * (`MeleeBaseAttackTime` = 2000 for every level 1 creature) — sourced, and
 * therefore identical across every enemy.
 */
const MELEE_INTERVAL_MS = CREATURE_LEVEL_1.meleeAttackTimeMs;

/**
 * Gorvath the Cavebreaker — the original level 1 elite profile (ADR-0010):
 * steady pressure on the tank, a moderate AoE and an occasional spike.
 *
 * Re-calibrated from 8 to 5 per swing (ADR-0021): a level 1 priest's only
 * spell is now Renew (3 HP/s sustained on one target, see `docs/balance.md`),
 * and 8 per 2 s swing (4 HP/s) could not be out-healed even by a perfect
 * player — a mathematical loss, not a triage challenge. At 5 per swing
 * (2.5 HP/s) Renew clears the tank's own damage with a margin, leaving AoE,
 * ramp and spikes as the actual test. Druid and paladin, whose level 1 spell
 * is a strong direct heal, were never at risk from the original value.
 */
export const TANK_DAMAGE = {
  amount: 5,
  intervalMs: MELEE_INTERVAL_MS,
  firstAtMs: MELEE_INTERVAL_MS,
} as const;

export const AOE_DAMAGE = {
  amount: 6,
  intervalMs: 12_000,
  firstAtMs: 12_000,
} as const;

export const SPIKE_DAMAGE = {
  amount: 18,
  minIntervalMs: 6000,
  maxIntervalMs: 10_000,
} as const;

/**
 * Skarn the Swarmcaller — the AoE-heavy profile: lighter melee, but the whole
 * party bleeds twice as often as under Gorvath (12 s → 8 s), so a single
 * target rarely needs a spike-sized heal but everyone drifts down together.
 * Calibrated — see ADR-0016 — to land in the same survival range as Gorvath.
 */
export const SKARN_TANK_DAMAGE = {
  amount: 6,
  intervalMs: MELEE_INTERVAL_MS,
  firstAtMs: MELEE_INTERVAL_MS,
} as const;

export const SKARN_AOE_DAMAGE = {
  amount: 8,
  intervalMs: 9000,
  firstAtMs: 9000,
} as const;

export const SKARN_SPIKE_DAMAGE = {
  amount: 14,
  minIntervalMs: 8000,
  maxIntervalMs: 12_000,
} as const;

/**
 * Threx the Impaler — the burst profile: harder melee, a rare AoE, and a
 * spike heavy enough to remove over half of a level 1 DPS's health, on a
 * shorter fuse than Gorvath's. Triage under Threx means reacting fast to one
 * target rather than spreading heals — see ADR-0016.
 */
export const THREX_TANK_DAMAGE = {
  amount: 9,
  intervalMs: MELEE_INTERVAL_MS,
  firstAtMs: MELEE_INTERVAL_MS,
} as const;

export const THREX_AOE_DAMAGE = {
  amount: 4,
  intervalMs: 16_000,
  firstAtMs: 16_000,
} as const;

export const THREX_SPIKE_DAMAGE = {
  amount: 26,
  minIntervalMs: 5000,
  maxIntervalMs: 8000,
} as const;

/** Cumulative ramp: a mechanic of the game mode, shared by every enemy. */
export const RAMP = {
  intervalMs: 30_000,
  factor: 1.15,
} as const;

/**
 * Outgoing damage from the party to the boss — game design (ADR-0017): no
 * per-class attack is simulated, the tank and the three DPS are abstracted
 * into one throughput, split evenly and reduced when a contributor dies.
 * The healer never contributes: healing is the whole point of the game.
 */
export const PARTY_DAMAGE = {
  /** Per contributing (non-healer) member, per tick. */
  perMemberAmount: 3,
  intervalMs: 1000,
  firstAtMs: 1000,
} as const;

export const DEFAULT_ENEMY_ID: EnemyId = 'gorvath';

/** The three selectable enemies, in the order shown on the selection screen. */
export const ENEMIES: Record<EnemyId, EncounterProfile> = {
  gorvath: {
    id: 'gorvath',
    name: 'Gorvath the Cavebreaker',
    subtitle: 'Balanced pressure — steady melee, an occasional spike',
    level: ENEMY_LEVEL,
    hpMax: 600,
    tankDamage: TANK_DAMAGE,
    aoeDamage: AOE_DAMAGE,
    spikeDamage: SPIKE_DAMAGE,
  },
  skarn: {
    id: 'skarn',
    name: 'Skarn the Swarmcaller',
    subtitle: 'AoE-heavy — the whole party bleeds together',
    level: ENEMY_LEVEL,
    hpMax: 550,
    tankDamage: SKARN_TANK_DAMAGE,
    aoeDamage: SKARN_AOE_DAMAGE,
    spikeDamage: SKARN_SPIKE_DAMAGE,
  },
  threx: {
    id: 'threx',
    name: 'Threx the Impaler',
    subtitle: 'Burst — rare AoE, a spike that can drop a DPS in one hit',
    level: ENEMY_LEVEL,
    hpMax: 460,
    tankDamage: THREX_TANK_DAMAGE,
    aoeDamage: THREX_AOE_DAMAGE,
    spikeDamage: THREX_SPIKE_DAMAGE,
  },
} as const;

export const ENEMY_ORDER: readonly EnemyId[] = ['gorvath', 'skarn', 'threx'] as const;

/* -------------------------------------------------------------------------- */
/* End of fight                                                                */
/* -------------------------------------------------------------------------- */

export const WIPE = {
  /** Number of deaths that ends the fight. */
  maxDeaths: 3,
} as const;

/* -------------------------------------------------------------------------- */
/* Experience — designed reward over a sourced level table                     */
/* -------------------------------------------------------------------------- */

/**
 * How much of a level a boss kill is worth.
 *
 * The level thresholds themselves are Classic's (`XP_TO_NEXT_LEVEL`), but the
 * reward is **designed**, not sourced: vanilla's own kill formula pays a
 * same-level elite `2 × (5 × level + 45)` experience — 100 at level 1 against
 * a 400-point level, 690 at level 59 against a 209,800-point one. Reaching 60
 * that way would take about 8,000 boss kills, so the reward is expressed as a
 * share of the current level instead: three victories per level, at every
 * level. See ADR-0019.
 */
export const BOSS_XP = {
  /** Fraction of the current level's requirement granted by a victory. */
  victoryShare: 0.34,
  /** A wipe teaches nothing: the fight has to be won. */
  wipeShare: 0,
} as const;

/** Experience granted for defeating a boss at that level (0 at the cap). */
export function bossXpReward(level: number): number {
  const required = xpToNextLevel(level);
  if (required === null) return 0;
  return Math.round(required * BOSS_XP.victoryShare);
}

/* -------------------------------------------------------------------------- */
/* Character sheet                                                             */
/* -------------------------------------------------------------------------- */

export interface CharacterSheet {
  name: string;
  classId: PlayableClassId;
  raceLabel: string;
  classLabel: string;
  level: number;
  attributes: Attributes;
  hpMax: number;
  manaMax: number;
  /** Spirit-based regeneration, per 2 s tick, outside the five-second rule. */
  manaPerTick: number;
  spellsKnown: readonly SpellDefinition[];
  spellsLocked: readonly SpellDefinition[];
}

/**
 * Everything the home screen shows about the player's character, derived from
 * the Classic tables at that level — nothing here is stored or written by
 * hand. `player` is the profile's editable identity (ADR-0020); defaulted to
 * Elowen the human priest so a caller that does not pass one sees exactly
 * what this returned before the sheet became editable.
 */
export function playerCharacterAtLevel(
  level: number,
  player: PlayerIdentity = DEFAULT_PLAYER_IDENTITY,
): CharacterSheet {
  const attributes = playerAttributesAtLevel(level, player);
  const mana = manaProfileAtLevel(level, player);
  return {
    name: player.name,
    classId: player.classId,
    raceLabel: RACE_LABELS[raceForPlayableClass(player.classId)],
    classLabel: CLASS_LABELS[player.classId],
    level,
    attributes,
    hpMax: maxHealthAtLevel(player.classId, attributes, level),
    manaMax: mana.max,
    manaPerTick: mana.perTick,
    spellsKnown: spellsKnownAtLevel(level, player.classId),
    spellsLocked: SPELL_ORDER[player.classId]
      .map((spellId) => SPELLS[spellId])
      .filter((spell) => !isSpellUnlocked(spell, level)),
  };
}

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
