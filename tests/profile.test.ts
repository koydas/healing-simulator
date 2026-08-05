/**
 * Progression: experience, levels, the record against each boss, and the
 * `localStorage` layer around them.
 *
 * Everything here runs in the `node` environment like the rest of the suite —
 * the storage functions take their `Storage` as an argument, so no DOM and no
 * global mock is needed. See `docs/testing.md`.
 */

import { describe, expect, it } from 'vitest';
import { xpToNextLevel } from '../src/config/classicData';
import { BOSS_XP, MAX_LEVEL, bossXpReward } from '../src/config/gameConfig';
import {
  applyFightOutcome,
  createEmptyProfile,
  grantXp,
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
    const saved = applyFightOutcome(createEmptyProfile(), 'threx', 'victory').profile;
    saveProfile(saved, storage);

    expect(storage.data[PROFILE_STORAGE_KEY]).toContain('"version":1');
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
