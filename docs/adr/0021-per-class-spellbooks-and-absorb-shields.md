# ADR-0021: Per-class spellbooks, absorb shields, and replacing mage/hunter with druid/paladin

- **Date:** 2026-08-05
- **Status:** Accepted

## Context

Since ADR-0020, `PLAYABLE_CLASSES` was `['priest', 'mage', 'hunter']`, but
switching class only ever changed the sheet's identity, race and derived
stats — every class cast the same five priest spells. The request this time
was explicit and different in kind: three classes — **Priest, Druid,
Paladin** — each with its **own** four spells (Priest: shield, renew, heal,
group heal; Druid: thorns, rejuvenation, a strong single-target heal, an AoE
renew; Paladin: a next-hit ward, a self shield, a strong group heal, a big
single-target heal). Mage and hunter, never a good flavor fit for a healer's
kit to begin with, were dropped rather than given spellbooks of their own.

Three problems surfaced turning that into an engine change, in the order they
were found:

1. **`shield` is a mechanic this engine did not have.** Every existing spell
   either restored HP now (`direct`, `group`) or over time (`hot`); an absorb
   pool consumed by damage before HP is a different kind of state entirely.
2. **A druid didn't exist in the data at all**, and a full paladin
   (`human/paladin`) attribute column stopped at level 1. `classic-data`
   requires extending the sourced tables before a new class can join the
   party or the sheet.
3. **Network access to the primary spell databases was blocked** in this
   session (wowclassicdb, wowhead and every wiki mirror returned HTTP 403
   through the environment's proxy policy). `EZDownRank.lua` (GitHub raw,
   reachable) confirmed level/cost/cast time for four spells across the three
   classes; every other number — heal amounts, Thorns, Tranquility, the two
   paladin defensive spells — could only be cross-checked against secondary
   web sources, and two spells (the druid's AoE renew, the paladin's group
   heal) have no real Classic mechanic to source at all.
4. **The real Classic training levels left two kits unplayable at level 1.**
   Power Word: Shield trains at 4, so a fresh priest — the default class —
   had nothing to cast for three levels; separately, even once that was fixed
   by moving Renew to level 1, Renew's 3 HP/s sustained heal turned out to be
   *mathematically* unable to out-heal Gorvath's original tank pressure
   (4 HP/s), a loss no amount of skill could avoid. Druid and paladin, whose
   level 1 spell is a strong direct heal, were never at risk from either
   problem.

## Decision

**`PLAYABLE_CLASSES` becomes `['priest', 'druid', 'paladin']`.** `druid`
pairs with `nightElf` (the only Alliance druid race in Classic); `paladin`
keeps the `human` pairing `PARTY_SLOTS` already used for it. A saved profile
with `classId: 'mage'` or `'hunter'` falls back to the default (`priest`) the
same way any other unplayable class already did (`sanitizeClassId`) — no
migration, because ADR-0020 already established that a `classId` outside
`PLAYABLE_CLASSES` is invalid input, not a shape to preserve.

**Both new classes' base stats are sourced the same way the original five
were**, from the same MaNGOS Zero SQL dumps (`player_classlevelstats` for
`druid`'s base health/mana, `player_levelstats` for the full 1–60
`nightElf/druid` and `human/paladin` attribute columns) — fetched directly
from `raw.githubusercontent.com` in this session and cross-checked at level 1
and level 60 in `tests/classicStats.test.ts`, the same sanity-check pattern
`classic-data` already requires.

**Spells generalize from "the priest's five" to "one table per class of
four."** `classicData.ts`'s `PriestHealRank` becomes `ClassSpellRank`, with
three new fields: `targetsSelf` (Divine Shield), and `shieldAmount` /
`shieldDurationMs` (any absorb spell). `PRIEST_SPELLS_RANK_1`,
`DRUID_SPELLS_RANK_1` and `PALADIN_SPELLS_RANK_1` each hold four entries.
`gameConfig.ts`'s `SPELLS` stays one flat `Record<SpellId, SpellDefinition>`
— spell ids are unique across classes, so `SPELLS[cast.spellId]` inside the
engine needs no class context — but `SPELL_ORDER` becomes
`Record<PlayableClassId, readonly SpellId[]>`, and every call site that used
to assume one spellbook (`createEmptyStats`, `computeStatsSummary`,
`gameStore.buildControlsSnapshot`, `spellsKnownAtLevel`) now reads the
fighting healer's own class off `state.party` first.

**Two new `SpellKind`s cover the new mechanics**, each reusing the engine's
existing shape rather than inventing a bespoke system per spell:

- **`shield`** — a numeric absorb pool (`member.shieldAmount`) and a
  countdown (`member.shieldMsRemaining`). `applyDamageTo` drains the pool
  before touching HP (pushing an `absorb` feedback event for what was
  blocked, a `damage` event only for what got through), a new `tickShields`
  step decays the countdown once per simulation step (position 3, right
  after HoT ticks — see `docs/simulation.md`), and death clears both fields
  the same way it already clears HoTs. A second shield replaces the first
  rather than stacking, matching Renew's own no-stacking rule.
- **`groupHot`** — `applyHot` run once per living member, for a HoT that
  targets the whole party (Tranquility, reflavored). `applySpellEffect` gets
  one new branch; nothing about `HotEffect`, `tickHots`, or expiry changes.

**Where a real Classic number could not be confirmed, or the ability's real
mechanic doesn't fit this engine, the deviation is named, not hidden:**

- Priest: Shield (Power Word: Shield) and the group heal (Prayer of Healing,
  unchanged) are real; Renew's level moves from its real 8 to 1 — a
  **Designed** exception, so the default class is not left with zero spells
  for three levels (see `PRIEST_SPELLS_RANK_1.renew`'s comment).
- Druid: Healing Touch and Rejuvenation's level/cost/cast time are
  **Sourced** (`EZDownRank.lua`); their heal amounts are **Approximated**.
  Thorns keeps its real cost/level/duration but is reimplemented as an
  absorb shield instead of a damage-reflect buff — this game never lets a
  heal contribute party damage (`PARTY_DAMAGE`'s own design note) — so its
  absorb amount is **Designed**. Tranquility keeps its real training level
  but is reimplemented as an instant party-wide HoT instead of a channel,
  which the engine has no concept of; its numbers are **Designed**.
- Paladin: Holy Light is **Sourced** the same way; Blessing of Protection and
  Divine Shield are real full-immunity effects, not an HP-based absorb, so
  both are modeled as a shield sized to comfortably outlast its own duration
  (**Designed** absorb amount, **Approximated** cost/level). The group heal,
  **Holy Radiance**, has no vanilla equivalent at all — real paladins had no
  AoE heal in 1.12 — so it is borrowed anachronistically from a later
  expansion and marked **Designed** outright.

See `docs/classic-stats.md` for the full sourced/derived/approximated/
designed breakdown, spell by spell.

**Gorvath's tank melee drops from 8 to 5 per swing.** Once Renew moved to
level 1, simulating the naive-healer benchmark (`tests/bossHealth.test.ts`)
showed 0 wins in 400 seeds: Renew's 3 HP/s sustained heal on one target could
not outpace 8 damage every 2 s (4 HP/s) even before AoE, spike or ramp are
added — every fight was lost on arithmetic, not on triage skill. At 5 per
swing (2.5 HP/s) Renew clears the tank's own pressure with a margin, and the
naive-bot benchmark returns a real mix of outcomes again (149/200 wins).
Skarn and Threx, and every other Designed number in `docs/balance.md`, are
untouched — only Gorvath's `TANK_DAMAGE.amount` changed.

## Alternatives Considered

- **Keep mage and hunter, add druid and paladin as a fourth and fifth
  playable class.** Rejected: the request replaced the roster, and a
  six-class picker with three flavor-only entries and three with real
  spellbooks would read as an inconsistency baked into the UI itself.
- **Give the "take next hit" / "self shield" paladin spells a true
  time-based full-immunity mechanic** (a boolean flag that negates all
  damage for a duration), rather than reusing the absorb-pool `shield` kind.
  Rejected: it would be a second new engine mechanic for the same one PR, for
  spells whose real numbers could not be sourced here either way; a shield
  sized to comfortably outlast its duration produces the same practical
  outcome — the ally is untouchable for that window — without adding a
  parallel damage-resolution path alongside the one absorb pools already use.
- **Model Thorns as real damage reflection to the boss.** Rejected outright:
  `PARTY_DAMAGE`'s own design note is explicit that the healer never
  contributes to boss damage — "healing is the whole point of the game."
  Making one druid spell the sole exception would quietly break that
  invariant for one class only.
- **Invent a wholly original name/effect for the paladin's group heal**
  instead of borrowing Holy Radiance. Rejected: every other spell in the game
  carries a real Blizzard name and spell id, even where the numbers are
  Designed; a fabricated ability name would be a bigger departure from that
  pattern than an anachronistic real one, clearly flagged as such.
- **Leave Gorvath's tank damage at 8 and instead buff Renew or grant Shield
  from level 1 too.** Considered, and rejected on the user's own call:
  raising Renew's numbers isn't sourced from anything, and unlocking Shield
  early was already rejected once (see the level-1 priest history above) —
  tuning the one enemy whose profile was already known to be Designed, by a
  small and documented amount, is the narrower change.
- **Recalibrate Skarn and Threx too**, since a level 1 priest is likely still
  tougher against them than a druid or paladin. Deferred: only Gorvath's
  naive-bot benchmark was measured to be a mathematical loss; the other two
  were not asked about and are left for a future pass if the same problem is
  found there.

## Consequences

- ✅ Each of the three playable classes now has a real, distinct kit — the
  class picker (ADR-0020) is a gameplay choice, not just a stats-and-flavor
  one.
- ✅ The absorb-shield and party-wide-HoT mechanics are generic engine
  primitives (one `SpellKind` each), not per-spell special cases — reused
  across five spells (Shield, Thorns, Blessing of Protection, Divine Shield;
  Tranquility) rather than five bespoke behaviors.
- ✅ Every sourced number that changed hands is traceable, and every number
  that could not be sourced in this environment is named as Approximated or
  Designed rather than presented as fact — see `docs/classic-stats.md`.
- ✅ The naive-healer benchmark is meaningful again for all three classes,
  not just two of them.
- ⚠️ **A meaningful share of the new numbers are Approximated, not Sourced**,
  because this session's network policy blocked every primary spell database
  it tried. A future session with different network access should replace
  them with real wowclassicdb/EZDownRank values and update the bucket in
  `docs/classic-stats.md` accordingly.
- ⚠️ **Two spells have no real Classic mechanic at all** (the druid's
  AoE renew, the paladin's group heal) and are reimplementations by design,
  not approximations of something real — a player who knows Classic will
  notice Tranquility does not channel and paladins never had Holy Radiance
  in 1.12.
- ⚠️ **Gorvath's tank damage changed for every class**, not just the priest,
  though druid and paladin had no trouble with the original value — a
  narrower, class-specific fix was considered and rejected as more engine
  complexity than one boss-profile number was worth.
- ⚠️ **A saved profile playing mage or hunter resets to priest** on load,
  same as any other invalid `classId` — expected given ADR-0020's own
  `sanitizeClassId` contract, but worth restating since this is the first
  time it actually fires for a value that used to be valid.
