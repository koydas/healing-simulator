# ADR-0020: Editable character identity — name, class, and per-class progress

- **Date:** 2026-08-05
- **Status:** Accepted

## Context

The character sheet (ADR-0019) showed a fixed character — Elowen, the human
priest — with no way to rename it or play a different class. The request was
explicit: a name and a class editable from the sheet, switching class
restarts progress at level 1 but keeps what was earned under the class being
left, so returning to it later picks up where it stopped. The sheet itself
should default to a minimized view (name, race/class, level, experience bar)
with the full stat block behind an expand toggle, and a small cartoon avatar.

Two constraints from the existing data shaped what "editable class" could
mean. First, `RACE_CLASS_ATTRIBUTES` (`classic-data`) only carries a full
1 – 60 column for the five race/class combinations the party is already built
from — any other combination throws above level 1. Second, and more binding:
of those five, warrior and rogue have **0 base mana at every level**
(`CLASS_BASE_BY_LEVEL`) — they use rage and energy in Classic. This game only
simulates one spellbook, the priest's, and every spell in it costs mana. A
warrior or rogue "healer" would have a 0 mana pool and could never cast a
single spell — not a smaller game, an unplayable one.

## Decision

**Class is a narrow, real choice: Priest, Mage or Hunter.** `gameConfig.ts`
exports `PLAYABLE_CLASSES = ['priest', 'mage', 'hunter']`, the subset of the
party's five sourced combinations that both have a full attribute table *and*
spend mana, each paired with the race the party already uses for it (human,
gnome, night elf — `raceForPlayableClass`). The spellbook itself does not
change with class: `SPELLS`/`SPELL_ORDER` stay the priest's, gated by
`playerLevel` exactly as before. Switching class changes the sheet's
identity, and the health/mana/attributes derived from it — not what the
character can cast. That is deliberately a stats-and-flavor choice, not a
second game mode; a true per-class spellbook (rage for the warrior, an
energy-based rogue kit) is out of scope.

**The identity threads through the engine as a value, at fight creation,**
the same way `playerLevel` already does. `PlayerIdentity { name, classId }`
is an optional parameter added to `partyTemplateAtLevel`, `manaProfileAtLevel`,
`playerAttributesAtLevel` and `playerCharacterAtLevel` (all defaulted to
Elowen/human/priest, so every existing call site is unaffected), and from
there to `createInitialState`, `restartGame` and `GameStoreOptions.player`.
The healer party member — and only that slot — is rebuilt with the chosen
name/race/class; the tank and the three DPS never change.

**Level and experience track the active class; a stash holds the rest.**
`PlayerProfile` gained `name`, `classId` and `otherClassProgress: Partial<Record<PlayableClassId, { level, xp }>>`.
`level`/`xp` always describe `classId`; a class that is not active has, at
most, one entry in `otherClassProgress`, never both places at once.
`switchClass(profile, classId)` stashes the class being left under its own
key, restores whatever was stashed for the class being entered (level 1, no
experience, the first time), and is a no-op — same reference back — when the
target is already active. `renameCharacter(profile, name)` sanitizes through
the same `sanitizeName` the storage layer uses. The per-boss record is
**shared** across every class: `records` is untouched by a switch, because it
counts what the player has beaten, not what one class has.

**The replay URL pins class too, alongside seed, enemy and level.** Class now
sizes the healer's health and mana (`partyTemplateAtLevel`), so it is as much
a part of a fight's exact identity as `?level=` already was — a shared link
opened on a browser playing a different class would otherwise silently build
a different party. `?class=` is read by `readInitialClassId()` and written by
`syncFightUrl` next to the other three; absent or invalid, it falls back to
the current profile's class. `App.handleFightEnd`'s existing level-mismatch
credit refusal (ADR-0005/ADR-0019) gained the matching class check, and its
`levelMismatch` flag is renamed `identityMismatch` to say so honestly. See the
update note on [ADR-0005](./0005-no-persistence-url-seed.md) for the
before/after — this half of the decision was caught by Codex review on this
same PR (#18), one round after the rest of it.

**Storage bumps to `healing-simulator.profile.v2`.** The v1 shape
(`{ level, xp, records }`) has no `name` or `classId` to migrate from, so a
browser holding a v1 save simply starts a fresh v2 profile — the same
"no migration path" consequence ADR-0018 already flagged for a future
incompatible shape.

**The sheet defaults to minimized** (avatar, name, race/class, level,
experience bar), an expand toggle reveals the existing stat block and spell
list unchanged, and a separate edit toggle opens a name field plus a
three-way class picker. Picking a different class arms a second tap — the
same pattern `OptionsMenu` already uses for deleting the save — before
`onSwitchClass` actually fires, and the picker shows the stashed level for
any class that has been played before. The avatar (`CharacterAvatar`) is an
inline, procedurally-drawn SVG bust — palette and silhouette keyed off
`classId` — rather than an image asset, keeping "no remote asset, no CDN"
intact.

## Alternatives Considered

- **All six classes, with class-specific mechanics.** Rejected: the game
  simulates one spellbook. A rage-based warrior or an energy-based rogue
  would need their own resource model, their own abilities and their own
  balance pass — a different game, not this sheet.
- **All five party combinations, warrior and rogue included, keeping the
  priest spellbook.** Rejected on the merits, not on scope: a warrior or
  rogue would have a mana pool of exactly 0 at every level and could never
  cast a single heal. That is not a harder difficulty, it is a softlock.
- **Race chosen independently of class.** Rejected: only five race/class
  pairs are sourced past level 1, and three of those five are the ones that
  spend mana. Decoupling race from class would either reintroduce the
  "throws above level 1" failure for an unsourced pair, or just relabel the
  same three pairs — no real added choice for real added complexity.
- **One save slot per class (a v1-style profile duplicated three times).**
  Rejected: it would triple the storage surface, the sanitization surface,
  and make "shared record" an awkward reconciliation across three saves
  instead of one shared field. The stash (`otherClassProgress`) gets the same
  outcome — nothing is lost switching away and back — with one save and one
  source of truth per field.
- **Per-class boss records.** Considered and rejected: the record is meant to
  answer "have I beaten this boss", not "have I beaten this boss as this
  specific class" — the latter reads as a different, unrequested feature
  (achievement-style per-class tracking) rather than what was asked for.
- **A full-screen modal for editing**, matching `GameOver`/`OptionsMenu`'s
  dialog contract. Rejected: editing the sheet does not need to obscure the
  rest of the home screen, and the `inert`/focus-trap machinery those two
  dialogs need is a cost worth paying only when something *must* be answered
  before anything else is reachable. An inline panel, expanded in place, is
  the right weight — the two-step confirm on class change is what carries
  the "this is consequential" signal instead.
- **Static SVG/image files per race/class for the avatar.** Rejected: three
  more assets to keep in sync with any future class addition, against one
  small procedural component that already generalizes for free.

## Consequences

- ✅ Name and class are real, editable identity — the party's healer in an
  actual fight reflects the sheet, not just its home-screen display.
- ✅ Switching class costs nothing permanent: `otherClassProgress` means
  trying a different class and coming back is exactly as safe as it sounds.
- ✅ No new spell content, no new balance surface: the priest spellbook and
  every existing balance number in `docs/balance.md` are untouched.
- ✅ The avatar adds zero network requests and zero bundled assets.
- ✅ `?class=` keeps replay URLs exact and keeps a mismatched replay from
  crediting the wrong character — the same guarantee `?level=` already gave,
  now extended to the variable this ADR added (ADR-0005 update note).
- ⚠️ **Warrior and rogue remain unplayable as the healer's own class**,
  despite being two of the five race/class combinations the party itself
  uses. That is the direct, documented consequence of this game simulating
  exactly one (mana-based) spellbook — not an oversight of the picker.
- ⚠️ **v1 saves are abandoned, not migrated**, on top of ADR-0018's own
  warning that a shape change would need a new key. A player who saved
  progress before this change starts over once, the same way a browser with
  storage disabled always has.
- ⚠️ `PlayerProfile`'s shape grew (`name`, `classId`, `otherClassProgress`);
  every future field still needs the four edits `player-progression`
  describes (`createEmptyProfile`, `cloneProfile`, `sanitizeProfile`, a test).
