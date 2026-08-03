/**
 * Checks that health, mana and spells really are the WoW Classic level 1 ones —
 * and that they are *derived* from the formulas, never hard-coded.
 * See `docs/classic-stats.md` for the sources.
 */

import { describe, expect, it } from 'vitest';
import {
  CLASS_BASE_LEVEL_1,
  getAttributes,
  healthBonusFromStamina,
  manaBonusFromIntellect,
  manaPerTickFromSpirit,
  maxHealthAtLevel1,
  maxManaAtLevel1,
} from '../src/config/classicData';
import { MANA, PARTY_TEMPLATE, PLAYER_LEVEL, SPELLS } from '../src/config/gameConfig';
import { createInitialState } from '../src/simulation/initialState';
import { memberOf } from './helpers';

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

  it('gives 0 mana to classes without mana', () => {
    expect(CLASS_BASE_LEVEL_1.warrior.baseMana).toBe(0);
    expect(maxManaAtLevel1('warrior', getAttributes('dwarf', 'warrior'))).toBe(0);
    expect(maxManaAtLevel1('rogue', getAttributes('human', 'rogue'))).toBe(0);
  });

  it('computes the priest spirit regeneration (spirit / 4 + 12.5 per tick)', () => {
    expect(manaPerTickFromSpirit(24)).toBe(18.5);
    expect(manaPerTickFromSpirit(20)).toBe(17.5);
  });

  it('rejects a race/class combination missing from the tables', () => {
    expect(() => getAttributes('gnome', 'priest')).toThrow(/gnome\/priest/);
  });
});

describe('level 1 party', () => {
  it('has the health expected from its races and classes', () => {
    const state = createInitialState(1);

    expect(state.playerLevel).toBe(PLAYER_LEVEL);
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
