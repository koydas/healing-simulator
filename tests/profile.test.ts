/**
 * Progression: identity (name, class), experience, levels, the record
 * against each boss, and the `localStorage` layer around them.
 *
 * Everything here runs in the `node` environment like the rest of the suite —
 * the storage functions take their `Storage` as an argument, so no DOM and no
 * global mock is needed. See `docs/testing.md`.
 */

import { describe, expect, it } from 'vitest';
import { xpToNextLevel } from '../src/config/classicData';
import {
  BOSS_XP,
  DEFAULT_PLAYER_CLASS,
  DEFAULT_PLAYER_NAME,
  MAX_LEVEL,
  PLAYER_NAME_MAX_LENGTH,
  bossXpReward,
} from '../src/config/gameConfig';
import {
  applyFightOutcome,
  createEmptyProfile,
  grantXp,
  renameCharacter,
  switchClass,
  totalRecord,
  xpProgress,
} from '../src/profile/playerProfile';
import {
  PROFILE_STORAGE_KEY,
  clearProfile,
  loadProfile,
  sanitizeProfile,
  saveProfile,
  type ProfileStorage,
} from '../src/profile/profileStorage';

/** In-memory stand-in for `window.localStorage`. */
function fakeStorage(initial: Record<string, string> = {}): ProfileStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

/** Storage that refuses every operation, like Safari in private mode. */
const hostileStorage: ProfileStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
  removeItem() {
    throw new Error('denied');
  },
};

describe('a fresh profile', () => {
  it('starts at level 1 with no experience and an empty record', () => {
    const profile = createEmptyProfile();
    expect(profile.name).toBe(DEFAULT_PLAYER_NAME);
    expect(profile.classId).toBe(DEFAULT_PLAYER_CLASS);
    expect(profile.otherClassProgress).toEqual({});
    expect(profile.level).toBe(1);
    expect(profile.xp).toBe(0);
    expect(totalRecord(profile)).toEqual({ wins: 0, losses: 0 });
    expect(profile.records.gorvath).toEqual({ wins: 0, losses: 0 });
    expect(profile.records.skarn).toEqual({ wins: 0, losses: 0 });
    expect(profile.records.threx).toEqual({ wins: 0, losses: 0 });
  });

  it('reports the experience bar against the Classic requirement', () => {
    const progress = xpProgress(createEmptyProfile());
    expect(progress.required).toBe(400); // level 1 -> 2
    expect(progress.ratio).toBe(0);
    expect(progress.atMaxLevel).toBe(false);
  });
});

describe('renaming the character', () => {
  it('trims and collapses whitespace', () => {
    const profile = renameCharacter(createEmptyProfile(), '  Bob   the   Bold  ');
    expect(profile.name).toBe('Bob the Bold');
  });

  it('caps the name at the maximum length', () => {
    const profile = renameCharacter(createEmptyProfile(), 'x'.repeat(100));
    expect(profile.name).toHaveLength(PLAYER_NAME_MAX_LENGTH);
  });

  it('falls back to the default name on an empty or blank input', () => {
    expect(renameCharacter(createEmptyProfile(), '').name).toBe(DEFAULT_PLAYER_NAME);
    expect(renameCharacter(createEmptyProfile(), '   ').name).toBe(DEFAULT_PLAYER_NAME);
  });

  it('never mutates the profile it is given', () => {
    const profile = createEmptyProfile();
    renameCharacter(profile, 'Someone Else');
    expect(profile.name).toBe(DEFAULT_PLAYER_NAME);
  });
});

describe('switching class', () => {
  it('starts an unplayed class at level 1 with no experience', () => {
    const profile = grantXp(createEmptyProfile(), 550); // level 2, 150 xp, as priest
    const next = switchClass(profile, 'druid');
    expect(next.classId).toBe('druid');
    expect(next.level).toBe(1);
    expect(next.xp).toBe(0);
  });

  it('stashes the class being left at its current level and experience', () => {
    const profile = grantXp(createEmptyProfile(), 550); // priest, level 2, 150 xp
    const next = switchClass(profile, 'paladin');
    expect(next.otherClassProgress.priest).toEqual({ level: 2, xp: 150 });
    expect(next.otherClassProgress.paladin).toBeUndefined();
  });

  it('restores exactly the progress a class was left at', () => {
    let profile = grantXp(createEmptyProfile(), 550); // priest, level 2, 150 xp
    profile = switchClass(profile, 'druid'); // druid starts fresh
    profile = grantXp(profile, 1000); // 400 for level 2, 600 left inside it
    profile = switchClass(profile, 'priest'); // back to the stashed priest

    expect(profile.classId).toBe('priest');
    expect(profile.level).toBe(2);
    expect(profile.xp).toBe(150);
    expect(profile.otherClassProgress.druid).toEqual({ level: 2, xp: 600 });
  });

  it('shares the boss record across every class', () => {
    const withAWin = applyFightOutcome(createEmptyProfile(), 'gorvath', 'victory').profile;
    const next = switchClass(withAWin, 'paladin');
    expect(next.records.gorvath).toEqual({ wins: 1, losses: 0 });
  });

  it('is a no-op when switching to the already-active class', () => {
    const profile = createEmptyProfile();
    expect(switchClass(profile, profile.classId)).toBe(profile);
  });

  it('never mutates the profile it is given', () => {
    const profile = grantXp(createEmptyProfile(), 550);
    switchClass(profile, 'druid');
    expect(profile.classId).toBe('priest');
    expect(profile.level).toBe(2);
    expect(profile.otherClassProgress).toEqual({});
  });
});

describe('granting experience', () => {
  it('never mutates the profile it is given', () => {
    const profile = createEmptyProfile();
    const next = grantXp(profile, 300);
    expect(profile.xp).toBe(0);
    expect(next.xp).toBe(300);
    expect(next.records).not.toBe(profile.records);
  });

  it('ignores a zero or negative amount', () => {
    const profile = grantXp(createEmptyProfile(), 120);
    expect(grantXp(profile, 0).xp).toBe(120);
    expect(grantXp(profile, -500).xp).toBe(120);
  });

  it('levels up and carries the surplus into the new level', () => {
    // 400 to reach level 2, so 550 leaves 150 inside level 2.
    const profile = grantXp(createEmptyProfile(), 550);
    expect(profile.level).toBe(2);
    expect(profile.xp).toBe(150);
  });

  it('crosses several levels at once when the amount allows it', () => {
    // 400 + 900 + 1400 = 2700 covers levels 1, 2 and 3 exactly.
    const profile = grantXp(createEmptyProfile(), 2700);
    expect(profile.level).toBe(4);
    expect(profile.xp).toBe(0);
  });

  it('stops at level 60 and drops the surplus', () => {
    const profile = grantXp(createEmptyProfile(), 10_000_000);
    expect(profile.level).toBe(MAX_LEVEL);
    expect(profile.xp).toBe(0);
    expect(xpProgress(profile)).toMatchObject({ required: null, ratio: 1, atMaxLevel: true });
    expect(grantXp(profile, 5000).level).toBe(MAX_LEVEL);
  });
});

describe('the boss experience reward', () => {
  it('is a share of the current level, and three victories are a level', () => {
    for (const level of [1, 10, 30, 59]) {
      const required = xpToNextLevel(level)!;
      expect(bossXpReward(level)).toBe(Math.round(required * BOSS_XP.victoryShare));
      expect(bossXpReward(level) * 3).toBeGreaterThanOrEqual(required);
      expect(bossXpReward(level) * 2).toBeLessThan(required);
    }
  });

  it('is 136 at level 1 and 0 at the cap', () => {
    expect(bossXpReward(1)).toBe(136); // round(400 x 0.34)
    expect(bossXpReward(MAX_LEVEL)).toBe(0);
  });
});

describe('recording a fight', () => {
  it('counts a victory and pays its experience', () => {
    const result = applyFightOutcome(createEmptyProfile(), 'gorvath', 'victory');
    expect(result.xpGained).toBe(136);
    expect(result.profile.xp).toBe(136);
    expect(result.profile.records.gorvath).toEqual({ wins: 1, losses: 0 });
    expect(result.levelBefore).toBe(1);
    expect(result.levelAfter).toBe(1);
  });

  it('counts a wipe without paying anything', () => {
    const result = applyFightOutcome(createEmptyProfile(), 'threx', 'wipe');
    expect(result.xpGained).toBe(0);
    expect(result.profile.xp).toBe(0);
    expect(result.profile.records.threx).toEqual({ wins: 0, losses: 1 });
  });

  it('keeps a record per boss', () => {
    let profile = createEmptyProfile();
    profile = applyFightOutcome(profile, 'gorvath', 'victory').profile;
    profile = applyFightOutcome(profile, 'gorvath', 'wipe').profile;
    profile = applyFightOutcome(profile, 'skarn', 'victory').profile;

    expect(profile.records.gorvath).toEqual({ wins: 1, losses: 1 });
    expect(profile.records.skarn).toEqual({ wins: 1, losses: 0 });
    expect(profile.records.threx).toEqual({ wins: 0, losses: 0 });
    expect(totalRecord(profile)).toEqual({ wins: 2, losses: 1 });
  });

  it('reports the level-up the third victory triggers', () => {
    let profile = createEmptyProfile();
    profile = applyFightOutcome(profile, 'skarn', 'victory').profile;
    profile = applyFightOutcome(profile, 'skarn', 'victory').profile;
    expect(profile.level).toBe(1);

    const third = applyFightOutcome(profile, 'skarn', 'victory');
    expect(third.levelBefore).toBe(1);
    expect(third.levelAfter).toBe(2);
    expect(third.profile.xp).toBe(8); // 3 x 136 - 400
  });

  it('never mutates the profile it is given', () => {
    const profile = createEmptyProfile();
    applyFightOutcome(profile, 'gorvath', 'victory');
    expect(profile.xp).toBe(0);
    expect(profile.records.gorvath.wins).toBe(0);
  });
});

describe('persistence', () => {
  it('saves and reloads a profile unchanged', () => {
    const storage = fakeStorage();
    let saved = applyFightOutcome(createEmptyProfile(), 'threx', 'victory').profile;
    saved = renameCharacter(saved, 'Bob');
    saved = switchClass(saved, 'druid');
    saveProfile(saved, storage);

    expect(storage.data[PROFILE_STORAGE_KEY]).toContain('"version":2');
    expect(loadProfile(storage)).toEqual(saved);
  });

  it('starts fresh when nothing is stored', () => {
    expect(loadProfile(fakeStorage())).toEqual(createEmptyProfile());
  });

  it('starts fresh on unreadable content instead of throwing', () => {
    expect(loadProfile(fakeStorage({ [PROFILE_STORAGE_KEY]: 'not json' }))).toEqual(
      createEmptyProfile(),
    );
    expect(loadProfile(fakeStorage({ [PROFILE_STORAGE_KEY]: 'null' }))).toEqual(
      createEmptyProfile(),
    );
  });

  it('starts fresh when only a pre-ADR-0020 v1 save exists, under its own key', () => {
    // v1 (`healing-simulator.profile.v1`) has no `name` or `classId` to
    // migrate from, so the key bump abandons it rather than guessing —
    // documented in `PROFILE_STORAGE_KEY`'s comment and in ADR-0018.
    const storage = fakeStorage({
      'healing-simulator.profile.v1': JSON.stringify({
        version: 1,
        level: 12,
        xp: 300,
        records: { gorvath: { wins: 2, losses: 1 } },
      }),
    });
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
  });

  it('clamps a hand-edited save rather than trusting it', () => {
    // A level past the cap would reach the Classic tables and throw mid-fight;
    // experience beyond the level's requirement would be a free level-up.
    expect(sanitizeProfile({ level: 999, xp: 50 })).toMatchObject({ level: 60, xp: 0 });
    expect(sanitizeProfile({ level: 0, xp: -12 })).toMatchObject({ level: 1, xp: 0 });
    expect(sanitizeProfile({ level: 1, xp: 10_000 })).toMatchObject({ level: 1, xp: 399 });
    expect(sanitizeProfile({ level: 1.9, xp: 12.7 })).toMatchObject({ level: 1, xp: 12 });
    expect(sanitizeProfile('nonsense')).toEqual(createEmptyProfile());
    expect(
      sanitizeProfile({ records: { gorvath: { wins: -3, losses: 'many' } } }).records.gorvath,
    ).toEqual({ wins: 0, losses: 0 });
  });

  it('falls back to the default name and class on an invalid value', () => {
    expect(sanitizeProfile({ name: 42, classId: 'warrior' })).toMatchObject({
      name: DEFAULT_PLAYER_NAME,
      classId: DEFAULT_PLAYER_CLASS,
    });
    // `warrior` is one of the five combinations the party itself is built
    // from, but it has no mana and could never cast the priest spellbook —
    // not a playable class on the sheet (see `gameConfig.ts`).
    expect(sanitizeProfile({ classId: 'warrior' }).classId).toBe(DEFAULT_PLAYER_CLASS);
    expect(sanitizeProfile({ name: '   ' }).name).toBe(DEFAULT_PLAYER_NAME);
  });

  it('sanitizes stashed per-class progress and drops the active class from it', () => {
    const sanitized = sanitizeProfile({
      classId: 'druid',
      otherClassProgress: {
        priest: { level: 999, xp: -5 },
        paladin: 'not an object',
        druid: { level: 10, xp: 100 }, // active class: dropped, not duplicated
      },
    });
    expect(sanitized.otherClassProgress.priest).toMatchObject({ level: 60, xp: 0 });
    expect(sanitized.otherClassProgress.paladin).toBeUndefined();
    expect(sanitized.otherClassProgress.druid).toBeUndefined();
  });

  it('deletes the save', () => {
    const storage = fakeStorage();
    saveProfile(grantXp(createEmptyProfile(), 5000), storage);
    clearProfile(storage);
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
    expect(loadProfile(storage)).toEqual(createEmptyProfile());
  });

  it('survives a storage that refuses every operation', () => {
    expect(loadProfile(hostileStorage)).toEqual(createEmptyProfile());
    expect(() => saveProfile(createEmptyProfile(), hostileStorage)).not.toThrow();
    expect(() => clearProfile(hostileStorage)).not.toThrow();
  });

  it('does nothing at all when there is no storage', () => {
    expect(loadProfile(null)).toEqual(createEmptyProfile());
    expect(() => saveProfile(createEmptyProfile(), null)).not.toThrow();
    expect(() => clearProfile(null)).not.toThrow();
  });
});
