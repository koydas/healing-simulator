/**
 * Checks that health, mana and spells really are the WoW Classic ones — and
 * that they are *derived* from the formulas, never hard-coded.
 * See `docs/classic-stats.md` for the sources.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  XP_TO_NEXT_LEVEL,
  getAttributes,
  getClassBase,
  healthBonusFromStamina,
  manaBonusFromIntellect,
  manaPerTickFromSpirit,
  maxHealthAtLevel,
  maxHealthAtLevel1,
  maxManaAtLevel,
  maxManaAtLevel1,
  xpToNextLevel,
} from '../src/config/classicData';
import {
  MANA,
  PARTY_TEMPLATE,
  PLAYER_MEMBER_ID,
  STARTING_LEVEL,
  SPELLS,
  manaProfileAtLevel,
  partyTemplateAtLevel,
  playerAttributesAtLevel,
  playerCharacterAtLevel,
  raceForPlayableClass,
} from '../src/config/gameConfig';
import { rollHealAmount } from '../src/simulation/effects';
import { createInitialState } from '../src/simulation/initialState';
import { advance, isolateTimers, memberOf, patchState } from './helpers';

describe('vanilla formulas', () => {
  it('converts stamina into health: 1 HP per point up to 20, then 10', () => {
    expect(healthBonusFromStamina(0)).toBe(0);
    expect(healthBonusFromStamina(19)).toBe(19);
    expect(healthBonusFromStamina(20)).toBe(20);
    expect(healthBonusFromStamina(22)).toBe(40);
    expect(healthBonusFromStamina(25)).toBe(70);
  });

  it('converts intellect into mana: 1 mana per point up to 20, then 15', () => {
    expect(manaBonusFromIntellect(19)).toBe(19);
    expect(manaBonusFromIntellect(20)).toBe(20);
    expect(manaBonusFromIntellect(22)).toBe(50);
    expect(manaBonusFromIntellect(26)).toBe(110);
  });

  it('reproduces the known health of a level 1 human warrior (60 HP)', () => {
    const attributes = getAttributes('human', 'warrior');
    expect(attributes.stamina).toBe(22);
    expect(maxHealthAtLevel1('warrior', attributes)).toBe(60);
  });

  it('gives 0 mana to classes without mana, at any level', () => {
    expect(getClassBase('warrior', 1).baseMana).toBe(0);
    expect(getClassBase('warrior', 60).baseMana).toBe(0);
    expect(maxManaAtLevel1('warrior', getAttributes('dwarf', 'warrior'))).toBe(0);
    expect(maxManaAtLevel1('rogue', getAttributes('human', 'rogue'))).toBe(0);
    expect(maxManaAtLevel('warrior', getAttributes('dwarf', 'warrior', 60), 60)).toBe(0);
  });

  it('computes the priest spirit regeneration (spirit / 4 + 12.5 per tick)', () => {
    expect(manaPerTickFromSpirit(24)).toBe(18.5);
    expect(manaPerTickFromSpirit(20)).toBe(17.5);
  });

  it('rejects a race/class combination missing from the tables', () => {
    expect(() => getAttributes('gnome', 'priest')).toThrow(/gnome\/priest/);
  });

  it('rejects a level the tables do not cover, instead of guessing', () => {
    // Only the five party combinations carry every level.
    expect(() => getAttributes('human', 'mage', 30)).toThrow(/level 30/);
    expect(() => getAttributes('human', 'priest', 61)).toThrow(/level 61/);
    expect(() => getClassBase('priest', 61)).toThrow(/level 61/);
  });
});

describe('levels 1 to 60', () => {
  it('stops at the vanilla cap', () => {
    expect(MAX_LEVEL).toBe(60);
    expect(xpToNextLevel(60)).toBeNull();
    expect(() => xpToNextLevel(61)).toThrow(/out of range/);
    expect(() => xpToNextLevel(0)).toThrow(/out of range/);
  });

  it('uses the Classic experience table', () => {
    expect(xpToNextLevel(1)).toBe(400); // player_xp_for_level, lvl 1
    expect(xpToNextLevel(10)).toBe(7600);
    expect(xpToNextLevel(59)).toBe(209_800);
    expect(XP_TO_NEXT_LEVEL).toHaveLength(59);
    // Levels 1 -> 60 are 4,084,700 experience in total.
    expect(XP_TO_NEXT_LEVEL.reduce((sum, value) => sum + value, 0)).toBe(4_084_700);
  });

  it('grows the party by the Classic tables, not by a multiplier', () => {
    const party = partyTemplateAtLevel(60);
    const byId = new Map(party.map((member) => [member.id, member]));
    // Dwarf warrior, stamina 113 at level 60: 1689 + 20 + 93 x 10.
    expect(byId.get('tank')!.hpMax).toBe(2639);
    expect(byId.get('healer')!.hpMax).toBe(1707); // human priest, stamina 50
    expect(byId.get('dps1')!.hpMax).toBe(2093); // human rogue, stamina 75
    expect(byId.get('dps2')!.hpMax).toBe(1620); // gnome mage, stamina 44
    expect(byId.get('dps3')!.hpMax).toBe(2177); // night elf hunter, stamina 89
  });

  it('gives the level 60 priest 2956 mana and a 45.25 regeneration tick', () => {
    const mana = manaProfileAtLevel(60);
    expect(mana.max).toBe(2956); // 1360 base + intellect 120
    expect(mana.perTick).toBe(45.25); // spirit 131 x 0.25 + 12.5
    expect(mana.tickMs).toBe(MANA.tickMs);
    expect(maxHealthAtLevel('priest', getAttributes('human', 'priest', 60), 60)).toBe(1707);
  });

  it('fights at the level it is handed, regeneration included', () => {
    const state = isolateTimers(createInitialState(1, 60));
    expect(memberOf(state, 'healer').hpMax).toBe(1707);
    expect(state.manaMax).toBe(2956);
    expect(state.manaRegenPerTick).toBe(45.25);

    // One regeneration tick, outside the five-second rule: the amount comes
    // from the state, so a level 60 healer regenerates 45.25 and not 18.5.
    const drained = patchState(state, {
      mana: 0,
      timers: { ...state.timers, manaTickMs: MANA.tickMs },
    });
    expect(advance(drained, MANA.tickMs).mana).toBe(45.25);
  });

  it('unlocks the priest spells at their training levels', () => {
    // Renew's real training level (8) is overridden to 1 so the default
    // class is not left with nothing to cast between levels 1 and 3, since
    // Shield itself only trains at 4 (ADR-0021).
    expect(playerCharacterAtLevel(1).spellsKnown.map((spell) => spell.id)).toEqual(['renew']);
    expect(playerCharacterAtLevel(4).spellsKnown.map((spell) => spell.id)).toEqual([
      'renew',
      'shield',
    ]);
    expect(playerCharacterAtLevel(30).spellsKnown).toHaveLength(4);
    expect(playerCharacterAtLevel(29).spellsLocked.map((spell) => spell.id)).toEqual([
      'prayerOfHealing',
    ]);
  });

  it('unlocks the druid and paladin spells at their training levels', () => {
    expect(
      playerCharacterAtLevel(1, { name: 'Fern', classId: 'druid' }).spellsKnown.map(
        (spell) => spell.id,
      ),
    ).toEqual(['healingTouch']);
    expect(
      playerCharacterAtLevel(30, { name: 'Fern', classId: 'druid' }).spellsKnown,
    ).toHaveLength(4);

    expect(
      playerCharacterAtLevel(1, { name: 'Aldric', classId: 'paladin' }).spellsKnown.map(
        (spell) => spell.id,
      ),
    ).toEqual(['holyLight']);
    expect(
      playerCharacterAtLevel(30, { name: 'Aldric', classId: 'paladin' }).spellsKnown,
    ).toHaveLength(4);
  });
});

describe('the two new playable classes — sourced base stats (ADR-0021)', () => {
  it('gives the level 1 night elf druid 52 health and 100 mana', () => {
    const attributes = getAttributes('nightElf', 'druid', 1);
    expect(attributes.stamina).toBe(19);
    expect(attributes.intellect).toBe(22);
    expect(maxHealthAtLevel('druid', attributes, 1)).toBe(52); // 33 base + 19
    expect(maxManaAtLevel('druid', attributes, 1)).toBe(100); // 50 base + 50
  });

  it('gives the level 60 night elf druid 1993 health', () => {
    const attributes = getAttributes('nightElf', 'druid', 60);
    expect(attributes.stamina).toBe(69);
    expect(maxHealthAtLevel('druid', attributes, 60)).toBe(1993); // 1483 base + 510
  });

  it('gives the level 1 human paladin 68 health and 79 mana', () => {
    const attributes = getAttributes('human', 'paladin', 1);
    expect(attributes.stamina).toBe(22);
    expect(attributes.intellect).toBe(20);
    expect(maxHealthAtLevel('paladin', attributes, 1)).toBe(68); // 28 base + 40
    expect(maxManaAtLevel('paladin', attributes, 1)).toBe(79); // 59 base + 20
  });

  it('gives the level 60 human paladin 2201 health', () => {
    const attributes = getAttributes('human', 'paladin', 60);
    expect(attributes.stamina).toBe(100);
    expect(maxHealthAtLevel('paladin', attributes, 60)).toBe(2201); // 1381 base + 820
  });
});

describe('editable player identity (ADR-0020, ADR-0021)', () => {
  it('defaults to Elowen the human priest, unchanged from before the sheet was editable', () => {
    expect(playerAttributesAtLevel(1)).toEqual(getAttributes('human', 'priest', 1));
    expect(manaProfileAtLevel(1)).toEqual(MANA);
    expect(partyTemplateAtLevel(1)).toEqual(PARTY_TEMPLATE);
  });

  it('rebuilds only the healer slot when a class is chosen', () => {
    const party = partyTemplateAtLevel(1, { name: 'Zed', classId: 'druid' });
    const byId = new Map(party.map((member) => [member.id, member]));
    const healer = byId.get(PLAYER_MEMBER_ID)!;

    expect(healer.name).toBe('Zed');
    expect(healer.race).toBe('nightElf');
    expect(healer.classId).toBe('druid');
    expect(healer.hpMax).toBe(maxHealthAtLevel1('druid', getAttributes('nightElf', 'druid')));

    // Nobody else in the party changes.
    expect(byId.get('tank')).toEqual(PARTY_TEMPLATE.find((member) => member.id === 'tank'));
    expect(byId.get('dps3')).toEqual(PARTY_TEMPLATE.find((member) => member.id === 'dps3'));
  });

  it('derives a pool and regeneration from the chosen class, not always the priest', () => {
    const paladin = manaProfileAtLevel(60, { name: 'Aldric', classId: 'paladin' });
    const attributes = getAttributes('human', 'paladin', 60);
    expect(paladin.max).toBe(maxManaAtLevel('paladin', attributes, 60));
    expect(paladin.perTick).toBe(manaPerTickFromSpirit(attributes.spirit));
    expect(paladin.max).not.toBe(manaProfileAtLevel(60).max); // different from the priest default
  });

  it('reports the chosen identity and its own spellbook on the character sheet', () => {
    const sheet = playerCharacterAtLevel(30, { name: 'Zed', classId: 'druid' });
    expect(sheet.name).toBe('Zed');
    expect(sheet.classId).toBe('druid');
    expect(sheet.raceLabel).toBe('Night Elf');
    expect(sheet.classLabel).toBe('Druid');
    // Since ADR-0021 each class has its own four spells: a druid's sheet
    // lists the druid kit, not the priest's.
    expect(sheet.spellsKnown.map((spell) => spell.id)).toEqual([
      'healingTouch',
      'rejuvenation',
      'thorns',
      'tranquility',
    ]);
    expect(sheet.spellsKnown.map((spell) => spell.id)).not.toEqual(
      playerCharacterAtLevel(30).spellsKnown.map((spell) => spell.id),
    );
  });

  it('maps every playable class to the race with a full attribute table', () => {
    expect(raceForPlayableClass('priest')).toBe('human');
    expect(raceForPlayableClass('druid')).toBe('nightElf');
    expect(raceForPlayableClass('paladin')).toBe('human');
    // Every mapping resolves at every level — would throw otherwise.
    for (const classId of ['priest', 'druid', 'paladin'] as const) {
      expect(() => getAttributes(raceForPlayableClass(classId), classId, 60)).not.toThrow();
    }
  });

  it('fights the chosen identity: the healer in GameState matches the sheet', () => {
    const state = createInitialState(1, 40, 'gorvath', { name: 'Zed', classId: 'druid' });
    const healer = memberOf(state, PLAYER_MEMBER_ID);
    expect(healer.name).toBe('Zed');
    expect(healer.classId).toBe('druid');
    expect(healer.hpMax).toBe(
      maxHealthAtLevel('druid', getAttributes('nightElf', 'druid', 40), 40),
    );
    expect(state.manaMax).toBe(maxManaAtLevel('druid', getAttributes('nightElf', 'druid', 40), 40));
  });
});

describe('level 1 party', () => {
  it('has the health expected from its races and classes', () => {
    const state = createInitialState(1);

    expect(state.playerLevel).toBe(STARTING_LEVEL);
    expect(memberOf(state, 'tank').hpMax).toBe(90); // Dwarf warrior, stamina 25
    expect(memberOf(state, 'healer').hpMax).toBe(51); // Human priest, stamina 20
    expect(memberOf(state, 'dps1').hpMax).toBe(55); // Human rogue, stamina 21
    expect(memberOf(state, 'dps2').hpMax).toBe(50); // Gnome mage, stamina 19
    expect(memberOf(state, 'dps3').hpMax).toBe(46); // Night elf hunter, stamina 20
  });

  it('starts every member at full health', () => {
    const state = createInitialState(1);
    for (const member of state.party) {
      expect(member.hp).toBe(member.hpMax);
      expect(member.alive).toBe(true);
    }
  });

  it('gives the tank roughly twice a DPS’s health', () => {
    const state = createInitialState(1);
    const tank = memberOf(state, 'tank').hpMax;
    const dps = memberOf(state, 'dps3').hpMax;
    expect(tank / dps).toBeGreaterThan(1.5);
    expect(tank / dps).toBeLessThan(2.5);
  });

  it('derives health from the template, with no hard-coded value', () => {
    const state = createInitialState(1);
    for (const template of PARTY_TEMPLATE) {
      expect(memberOf(state, template.id).hpMax).toBe(template.hpMax);
    }
  });

  it('gives the human priest 160 mana', () => {
    const state = createInitialState(1);
    expect(MANA.max).toBe(160);
    expect(state.mana).toBe(160);
    expect(state.manaMax).toBe(160);
  });
});

describe('priest spells (rank 1) — ADR-0021', () => {
  it('uses the Classic values', () => {
    expect(SPELLS.shield).toMatchObject({
      spellId: 17,
      requiredLevel: 4,
      manaCost: 45,
      castTimeMs: 0,
      shieldAmount: 44,
    });
    expect(SPELLS.renew).toMatchObject({
      spellId: 139,
      // Real training level is 8; overridden to 1 so the default class has
      // something to cast from the first fight (see ADR-0021).
      requiredLevel: 1,
      manaCost: 30,
      castTimeMs: 0,
      hotTicks: 5,
      hotIntervalMs: 3000,
    });
    expect(SPELLS.heal).toMatchObject({ spellId: 2054, requiredLevel: 16, manaCost: 155 });
    expect(SPELLS.prayerOfHealing).toMatchObject({
      spellId: 596,
      requiredLevel: 30,
      manaCost: 410,
    });
  });

  it('splits Renew’s 45 healing into five ticks of 9', () => {
    expect(SPELLS.renew.healPerTick).toBe(9);
    expect(SPELLS.renew.healPerTick * SPELLS.renew.hotTicks).toBe(45);
  });

  it('makes Prayer of Healing castable only with a pool far above level 1', () => {
    expect(SPELLS.prayerOfHealing.manaCost).toBeGreaterThan(MANA.max);
  });
});

describe('druid spells (rank 1) — ADR-0021', () => {
  it('uses the sourced values for Healing Touch and Rejuvenation', () => {
    expect(SPELLS.healingTouch).toMatchObject({
      spellId: 5185,
      requiredLevel: 1,
      manaCost: 25,
      castTimeMs: 1500,
    });
    expect(SPELLS.rejuvenation).toMatchObject({
      spellId: 774,
      requiredLevel: 4,
      manaCost: 25,
      castTimeMs: 0,
      hotTicks: 4,
      hotIntervalMs: 3000,
    });
  });

  it('reflavors Thorns as an absorb shield and Tranquility as a party-wide HoT', () => {
    // Both deviate from the real spell's mechanic — see the doc comment on
    // `DRUID_SPELLS_RANK_1` in classicData.ts for why.
    expect(SPELLS.thorns.kind).toBe('shield');
    expect(SPELLS.thorns.shieldAmount).toBeGreaterThan(0);
    expect(SPELLS.tranquility.kind).toBe('groupHot');
    expect(SPELLS.tranquility.healPerTick * SPELLS.tranquility.hotTicks).toBe(100);
  });
});

describe('paladin spells (rank 1) — ADR-0021', () => {
  it('uses the sourced values for Holy Light', () => {
    expect(SPELLS.holyLight).toMatchObject({
      spellId: 635,
      requiredLevel: 1,
      manaCost: 35,
      castTimeMs: 2500,
    });
  });

  it('models Blessing of Protection and Divine Shield as absorb shields', () => {
    expect(SPELLS.blessingOfProtection.kind).toBe('shield');
    expect(SPELLS.blessingOfProtection.targetsSelf).toBe(false);
    expect(SPELLS.divineShield.kind).toBe('shield');
    // Divine Shield always targets the caster, never the selected ally.
    expect(SPELLS.divineShield.targetsSelf).toBe(true);
    expect(SPELLS.divineShield.requiresTarget).toBe(false);
  });

  it('gives the paladin a group heal borrowed from a later expansion (Holy Radiance)', () => {
    expect(SPELLS.holyRadiance.kind).toBe('group');
    expect(SPELLS.holyRadiance.requiresTarget).toBe(false);
  });
});

describe('healing rolls', () => {
  /** Draws `count` amounts of the given spell through the engine's own roll. */
  function rollMany(count: number, healMin: number, healMax: number): Map<number, number> {
    const draft = createInitialState(4242);
    const counts = new Map<number, number>();
    for (let index = 0; index < count; index += 1) {
      const amount = rollHealAmount(draft, healMin, healMax);
      counts.set(amount, (counts.get(amount) ?? 0) + 1);
    }
    return counts;
  }

  it('covers every integer of the inclusive range, endpoints included', () => {
    const { healMin, healMax } = SPELLS.heal;
    const counts = rollMany(2200, healMin, healMax);
    for (let value = healMin; value <= healMax; value += 1) {
      expect(counts.get(value) ?? 0).toBeGreaterThan(0);
    }
    expect(counts.size).toBe(healMax - healMin + 1);
  });

  it('gives the endpoints the same weight as the interior values', () => {
    // Heal's range (295-341) is 47 values wide; scale draws up so the
    // rarest value still gets a meaningful sample.
    const { healMin, healMax } = SPELLS.heal;
    const counts = rollMany(9400, healMin, healMax);
    const frequencies = [...counts.values()];
    const min = Math.min(...frequencies);
    const max = Math.max(...frequencies);

    // Rounding a continuous sample instead of drawing uniformly over the
    // inclusive integers would leave the two endpoints at roughly half the
    // weight of an interior value.
    expect(min / max).toBeGreaterThan(0.6);
  });

  it('returns the single value of a zero-width range without consuming the seed', () => {
    const draft = createInitialState(7);
    const seedBefore = draft.seed;
    expect(rollHealAmount(draft, 42, 42)).toBe(42);
    expect(draft.seed).toBe(seedBefore);
  });
});
