/**
 * Since ADR-0021 each playable class has its own four-spell kit
 * (`SPELL_ORDER`), instead of every class sharing the priest's. This file
 * covers the shape of that per-class split and the paladin's group heal
 * (Holy Radiance), which behaves like Prayer of Healing but for a different
 * class.
 */
import { describe, expect, it } from 'vitest';
import { PLAYABLE_CLASSES, SPELLS, SPELL_ORDER } from '../src/config/gameConfig';
import { castSpell } from '../src/simulation/actions';
import { createInitialState } from '../src/simulation/initialState';
import type { GameState } from '../src/simulation/types';
import { advance, isolateTimers, memberOf, patchMember, patchState, unlockAllSpells } from './helpers';

describe('per-class spellbooks', () => {
  it('gives every playable class exactly four spells, each a real entry in SPELLS', () => {
    for (const classId of PLAYABLE_CLASSES) {
      const spellIds = SPELL_ORDER[classId];
      expect(spellIds).toHaveLength(4);
      expect(new Set(spellIds).size).toBe(4);
      for (const spellId of spellIds) {
        expect(SPELLS[spellId]).toBeDefined();
      }
    }
  });

  it('never gives two classes the same spell id — a fight only ever plays one kit', () => {
    const seen = new Set<string>();
    for (const classId of PLAYABLE_CLASSES) {
      for (const spellId of SPELL_ORDER[classId]) {
        expect(seen.has(spellId)).toBe(false);
        seen.add(spellId);
      }
    }
  });

  it('orders each kit by training level, ascending', () => {
    for (const classId of PLAYABLE_CLASSES) {
      const levels = SPELL_ORDER[classId].map((spellId) => SPELLS[spellId].requiredLevel);
      const sorted = [...levels].sort((a, b) => a - b);
      expect(levels).toEqual(sorted);
    }
  });
});

describe('Holy Radiance (paladin group heal)', () => {
  function paladinGame(seed = 1): GameState {
    return unlockAllSpells(
      isolateTimers(createInitialState(seed, 1, 'gorvath', { name: 'Aldric', classId: 'paladin' })),
    );
  }

  it('heals every living member with a single roll and needs no target', () => {
    let state = paladinGame();
    state = patchMember(state, 'tank', { hp: 10 });
    state = patchMember(state, 'dps1', { alive: false, hp: 0 });
    state = patchState(state, { selectedTargetId: null });

    const cast = castSpell(state, 'holyRadiance');
    expect(cast.activeCast?.spellId).toBe('holyRadiance');
    expect(cast.activeCast?.targetId).toBeNull();

    const after = advance(cast, SPELLS.holyRadiance.castTimeMs);
    // 280-310 far exceeds level 1 pools: everyone alive is topped off.
    expect(memberOf(after, 'tank').hp).toBe(memberOf(after, 'tank').hpMax);
    expect(memberOf(after, 'healer').hp).toBe(memberOf(after, 'healer').hpMax);
    expect(memberOf(after, 'dps1').hp).toBe(0);
  });
});
