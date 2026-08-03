/**
 * Vérifie que les PV, la mana et les sorts sont bien ceux de WoW Classic
 * niveau 1 — et qu'ils sont *dérivés* des formules, jamais écrits en dur.
 * Voir `docs/classic-stats.md` pour les sources.
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

describe('formules vanilla', () => {
  it('convertit l’endurance en PV : 1 PV par point jusqu’à 20, puis 10', () => {
    expect(healthBonusFromStamina(0)).toBe(0);
    expect(healthBonusFromStamina(19)).toBe(19);
    expect(healthBonusFromStamina(20)).toBe(20);
    expect(healthBonusFromStamina(22)).toBe(40);
    expect(healthBonusFromStamina(25)).toBe(70);
  });

  it('convertit l’intelligence en mana : 1 mana par point jusqu’à 20, puis 15', () => {
    expect(manaBonusFromIntellect(19)).toBe(19);
    expect(manaBonusFromIntellect(20)).toBe(20);
    expect(manaBonusFromIntellect(22)).toBe(50);
    expect(manaBonusFromIntellect(26)).toBe(110);
  });

  it('reproduit les PV connus d’un guerrier humain niveau 1 (60 PV)', () => {
    const attributes = getAttributes('human', 'warrior');
    expect(attributes.stamina).toBe(22);
    expect(maxHealthAtLevel1('warrior', attributes)).toBe(60);
  });

  it('donne 0 mana aux classes sans mana', () => {
    expect(CLASS_BASE_LEVEL_1.warrior.baseMana).toBe(0);
    expect(maxManaAtLevel1('warrior', getAttributes('dwarf', 'warrior'))).toBe(0);
    expect(maxManaAtLevel1('rogue', getAttributes('human', 'rogue'))).toBe(0);
  });

  it('calcule la régénération d’esprit du prêtre (esprit / 4 + 12,5 par palier)', () => {
    expect(manaPerTickFromSpirit(24)).toBe(18.5);
    expect(manaPerTickFromSpirit(20)).toBe(17.5);
  });

  it('refuse une combinaison race/classe absente des tables', () => {
    expect(() => getAttributes('gnome', 'priest')).toThrow(/gnome\/priest/);
  });
});

describe('groupe de niveau 1', () => {
  it('a les PV attendus par race et classe', () => {
    const state = createInitialState(1);

    expect(state.playerLevel).toBe(PLAYER_LEVEL);
    expect(memberOf(state, 'tank').hpMax).toBe(90); // Nain guerrier, endurance 25
    expect(memberOf(state, 'healer').hpMax).toBe(51); // Humain prêtre, endurance 20
    expect(memberOf(state, 'dps1').hpMax).toBe(55); // Humain voleur, endurance 21
    expect(memberOf(state, 'dps2').hpMax).toBe(50); // Gnome mage, endurance 19
    expect(memberOf(state, 'dps3').hpMax).toBe(46); // Elfe de la nuit chasseur, endurance 20
  });

  it('démarre chaque membre à ses PV maximum', () => {
    const state = createInitialState(1);
    for (const member of state.party) {
      expect(member.hp).toBe(member.hpMax);
      expect(member.alive).toBe(true);
    }
  });

  it('donne au tank environ le double des PV d’un DPS', () => {
    const state = createInitialState(1);
    const tank = memberOf(state, 'tank').hpMax;
    const dps = memberOf(state, 'dps3').hpMax;
    expect(tank / dps).toBeGreaterThan(1.5);
    expect(tank / dps).toBeLessThan(2.5);
  });

  it('dérive les PV du gabarit, sans valeur codée en dur', () => {
    const state = createInitialState(1);
    for (const template of PARTY_TEMPLATE) {
      expect(memberOf(state, template.id).hpMax).toBe(template.hpMax);
    }
  });

  it('donne au prêtre humain 160 points de mana', () => {
    const state = createInitialState(1);
    expect(MANA.max).toBe(160);
    expect(state.mana).toBe(160);
    expect(state.manaMax).toBe(160);
  });
});

describe('sorts de soin du prêtre (rang 1)', () => {
  it('reprend les valeurs Classic', () => {
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

  it('répartit les 45 points de Renew en cinq ticks de 9', () => {
    expect(SPELLS.renew.healPerTick).toBe(9);
    expect(SPELLS.renew.healPerTick * SPELLS.renew.hotTicks).toBe(45);
  });

  it('ne rend Prayer of Healing lançable qu’avec un pool bien supérieur au niveau 1', () => {
    expect(SPELLS.prayerOfHealing.manaCost).toBeGreaterThan(MANA.max);
  });
});
