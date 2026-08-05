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
  STARTING_LEVEL,
  SPELLS,
  manaProfileAtLevel,
  partyTemplateAtLevel,
  playerCharacterAtLevel,
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

  it('unlocks the spells at their training levels', () => {
    expect(playerCharacterAtLevel(1).spellsKnown.map((spell) => spell.id)).toEqual(['lesserHeal']);
    expect(playerCharacterAtLevel(8).spellsKnown.map((spell) => spell.id)).toEqual([
      'lesserHeal',
      'renew',
    ]);
    expect(playerCharacterAtLevel(30).spellsKnown).toHaveLength(5);
    expect(playerCharacterAtLevel(29).spellsLocked.map((spell) => spell.id)).toEqual([
      'prayerOfHealing',
    ]);
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

describe('priest healing spells (rank 1)', () => {
  it('uses the Classic values', () => {
    expect(SPELLS.lesserHeal).toMatchObject({
      spellId: 2050,
      requiredLevel: 1,
      manaCost: 30,
      castTimeMs: 1500,
      healMin: 46,
      healMax: 56,
    });
    expect(SPELLS.renew).toMatchObject({
      spellId: 139,
      requiredLevel: 8,
      manaCost: 30,
      castTimeMs: 0,
      hotTicks: 5,
      hotIntervalMs: 3000,
    });
    expect(SPELLS.heal).toMatchObject({ spellId: 2054, requiredLevel: 16, manaCost: 155 });
    expect(SPELLS.flashHeal).toMatchObject({ spellId: 2061, requiredLevel: 20, manaCost: 125 });
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

describe('healing rolls', () => {
  /** Draws `count` Lesser Heal amounts through the engine's own roll. */
  function rollMany(count: number): Map<number, number> {
    const draft = createInitialState(4242);
    const counts = new Map<number, number>();
    for (let index = 0; index < count; index += 1) {
      const amount = rollHealAmount(draft, SPELLS.lesserHeal.healMin, SPELLS.lesserHeal.healMax);
      counts.set(amount, (counts.get(amount) ?? 0) + 1);
    }
    return counts;
  }

  it('covers every integer of the inclusive range, endpoints included', () => {
    const counts = rollMany(2200);
    for (let value = SPELLS.lesserHeal.healMin; value <= SPELLS.lesserHeal.healMax; value += 1) {
      expect(counts.get(value) ?? 0).toBeGreaterThan(0);
    }
    expect(counts.size).toBe(SPELLS.lesserHeal.healMax - SPELLS.lesserHeal.healMin + 1);
  });

  it('gives the endpoints the same weight as the interior values', () => {
    const counts = rollMany(2200);
    const frequencies = [...counts.values()];
    const min = Math.min(...frequencies);
    const max = Math.max(...frequencies);

    // Uniform over 11 values: ~200 draws each. Rounding a continuous sample
    // would leave the two endpoints at roughly half that.
    expect(min / max).toBeGreaterThan(0.7);
  });

  it('returns the single value of a zero-width range without consuming the seed', () => {
    const draft = createInitialState(7);
    const seedBefore = draft.seed;
    expect(rollHealAmount(draft, 42, 42)).toBe(42);
    expect(draft.seed).toBe(seedBefore);
  });
});
