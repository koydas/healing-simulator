# Balance

Two files, two roles:

- **`src/config/classicData.ts`** — raw WoW Classic 1.12 data and official
  formulas. Only sourced values go in there (see
  [classic-stats.md](./classic-stats.md)).
- **`src/config/gameConfig.ts`** — game constants. Character stats are
  *computed* from the previous file; only the boss profile and the event cadence
  are set by hand.

No other layer holds a gameplay number.

## Loop

| Constant | Value | Role |
| --- | --- | --- |
| `TICK_MS` | 100 | fixed simulation step |
| `MAX_CATCHUP_MS` | 500 | maximum catch-up per frame (5 steps) |
| `LONG_STALL_MS` | 1000 | beyond this, elapsed time is discarded |
| `DEFAULT_SEED` | 1337 | seed used when `?seed=` is invalid |
| `PLAYER_LEVEL` | 1 | level of the party and of the boss |

## Party — derived from the vanilla formulas

`PARTY_TEMPLATE` computes health and mana from race, class and level 1
attributes. None of these values are hard-coded.

| Member | Race / class | Health | Mana |
| --- | --- | --- | --- |
| Thorgrim (tank) | Dwarf warrior | 90 | — |
| Elowen (healer) | Human priest | 51 | 160 |
| Kaelan (DPS) | Human rogue | 55 | — |
| Fizzwick (DPS) | Gnome mage | 50 | 210 |
| Sylandra (DPS) | Night elf hunter | 46 | 83 |

Changing a member's race or class is enough to recompute their health: you edit
`PARTY_SLOTS`, never a number.

## Healer mana

| Constant | Value | Origin |
| --- | --- | --- |
| `MANA.max` | 160 | 110 (priest base) + 50 (intellect 22) |
| `MANA.tickMs` | 2000 | vanilla regeneration tick |
| `MANA.perTick` | 18.5 | spirit 24 → `24 / 4 + 12.5` |
| `MANA.fiveSecondRuleMs` | 5000 | five-second rule |
| `GCD_MS` | 1500 | vanilla global cooldown |

## Spells — rank 1, gated by level

| Spell | Level | Mana | Cast | Effect |
| --- | --- | --- | --- | --- |
| Lesser Heal | **1** | 30 | 1.5 s | 46 – 56 |
| Renew | 8 | 30 | instant | 9 per tick × 5, every 3 s |
| Heal | 16 | 155 | 3.0 s | 295 – 341 |
| Flash Heal | 20 | 125 | 1.5 s | 193 – 237 |
| Prayer of Healing | 30 | 410 | 3.0 s | 312 – 333 on the party |

At level 1 only Lesser Heal is castable; the others appear locked with their
required level (ADR-0008). No per-spell cooldown, no haste, no spell queue.

## Enemies — three selectable encounters

Picked on the opening selection screen (`EnemySelect`) and carried in
`GameState.encounter` (ADR-0016); `ENEMY_ORDER` lists them in the order shown.
The melee cadence (2000 ms) is sourced — every level 1 creature swings at that
rate — and identical across all three; every amount is designed. The ramp
(`RAMP`, ×1.15 every 30 000 ms) is a single shared constant, not per-enemy.

| Enemy | Health | Tank melee | AoE | Spike |
| --- | --- | --- | --- | --- |
| Gorvath the Cavebreaker (`TANK_DAMAGE` / `AOE_DAMAGE` / `SPIKE_DAMAGE`) | 600 | 8 every 2000 ms | 6 per member every 12 000 ms | 18, uniform [6000, 10 000) ms |
| Skarn the Swarmcaller (`SKARN_*`) | 550 | 6 every 2000 ms | 8 per member every 9000 ms | 14, uniform [8000, 12 000) ms |
| Threx the Impaler (`THREX_*`) | 460 | 9 every 2000 ms | 4 per member every 16 000 ms | 26, uniform [5000, 8000) ms |

| Constant | Value | Nature |
| --- | --- | --- |
| `WIPE.maxDeaths` | 3 | designed |
| `PARTY_DAMAGE.perMemberAmount` | 3, per contributing (non-healer) member, every 1000 ms | designed |

Where the amounts come from: [classic-stats.md](./classic-stats.md#the-enemies)
and [ADR-0010](./adr/0010-level-1-boss-profile.md) (Gorvath),
[ADR-0016](./adr/0016-selectable-enemy-encounters.md) (Skarn, Threx, and the
selection screen itself), [ADR-0017](./adr/0017-boss-health-and-victory.md)
(boss health, party damage output, and the victory condition).

The tank and the three DPS deal `PARTY_DAMAGE` damage to the boss automatically,
once a second; the healer never contributes, and a dead contributor's share is
not picked up by the survivors. With all four alive that is 12 HP/s on the
boss — enough to kill a 600 HP Gorvath in 50 s at full uptime, but losing even
one DPS stretches that considerably (a death spiral: less boss damage → a
longer fight → more time for the ramp to kill someone else).

## Orders of magnitude

Gorvath — the reference profile:

- Pressure on the tank: 8 / 2 s = **4.0 HP/s**; they fall in 22 s with no
  healing.
- AoE: 6 × 5 / 12 s ≈ **2.5 HP/s** spread across the party.
- Spike: 18 every 8 s on average ≈ **2.2 HP/s** on a non-tank, a third of their
  health in one hit.
- **Burst** healing throughput: 51 HP every 1.5 s ≈ 34 HP/s.
- **Sustainable** healing throughput: mana-limited to ≈ 15 HP/s (9.25 mana/s
  outside the five-second rule, 1.7 HP per point of mana).

Measured survival, all three enemies, eight fixed seeds (ADR-0016):

| Enemy | No healing | Naive automated healer |
| --- | --- | --- |
| Gorvath | 22 s | 48 – 63 s |
| Skarn | 26 s | 40 – 63 s |
| Threx | 20 s | 34 – 56 s |

The ramp pushes pressure above sustainable healing after a few tiers, for
every enemy. Since ADR-0017 that is no longer automatically a loss: if the
boss dies first, it is a win. Measured outcome distribution for the same
naive healer, twelve fixed seeds (ADR-0017):

| Enemy | Wins | Wipes |
| --- | --- | --- |
| Gorvath | 7 | 5 |
| Skarn | 7 | 5 |
| Threx | 6 | 6 |

## Feedback

| Constant | Value |
| --- | --- |
| `FEEDBACK.lifetimeMs` | 1200 ms (floating numbers) |
| `FEEDBACK.messageLifetimeMs` | 1600 ms (messages, deaths) |
| `FEEDBACK.maxEntries` | 40 (anti-leak cap) |

## Tuning the difficulty

Do not touch the sourced values: the tuning room is on the enemy side. Each
enemy has its own set of constants (`TANK_DAMAGE` / `AOE_DAMAGE` /
`SPIKE_DAMAGE` for Gorvath, `SKARN_*` and `THREX_*` for the other two) — pick
the one you mean to retune.

- **Easier**: lower an enemy's `tankDamage.amount` or `spikeDamage.amount`, or
  lengthen `RAMP.intervalMs` (shared by all three).
- **Harder**: raise `spikeDamage.amount`, shorten `spikeDamage.minIntervalMs`,
  or lower `RAMP.intervalMs`.
- **Change scale**: raise `PLAYER_LEVEL` — that unlocks spells, but the stat
  tables currently only cover level 1 (see
  [classic-stats.md](./classic-stats.md#levelling-up-later)).
- **Easier to win**: lower an enemy's `hpMax`, or raise
  `PARTY_DAMAGE.perMemberAmount`.
- **Harder to win**: raise `hpMax`, but re-run the win/wipe sweep (ADR-0017) —
  past a point the death spiral makes victory unreachable under naive play,
  which is what happened at the first values tried (780/780/660: 0 wins in 12
  seeds, on every enemy).
- **Add a fourth enemy**: give it an `EnemyId`, an `EncounterProfile` entry
  (including `hpMax`) in `ENEMIES`, and a slot in `ENEMY_ORDER`. Calibrate it
  the way ADR-0016 and ADR-0017 did — the no-heal/naive-healer survival
  windows, then the win/wipe distribution — before committing the numbers.

After any change, run `npm test`: several tests rely on the nominal values
(90 / 51 / 55 / 50 / 46 health, 8 / 6 / 18 damage for Gorvath — see
`tests/encounter.test.ts` and `tests/bossHealth.test.ts` for the rest).
