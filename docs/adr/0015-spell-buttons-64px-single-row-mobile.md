# ADR-0015: Spell buttons drop to 64 px and pack into one row on mobile

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

On an iPhone 13 mini (375 px wide, and often less once Safari's toolbar is
visible) the layout budget did not leave enough room for the party. With the
five spell buttons wrapping onto two rows at 72 × 72 px each
(`grid-template-columns: repeat(auto-fit, minmax(96px, 1fr))`, `.spell`
`min-height: 72px`), the controls block measured roughly:

| Piece | Height |
| --- | --- |
| Cast bar + mana bar + inter-gaps | ~54 px |
| Spell grid (2 rows × 72 px + row gap) | ~152 px |
| Controls padding + safe-area-inset-bottom | ~50 px |
| **Controls total** | **~256 px** |

Combined with the header (~58 px) and the message feed (~46 px), that leaves
as little as ~300 px for the party on a short viewport (Safari's toolbar
visible), against the ~360 px the five 64 px party frames need. The party
frame scrolls in that case (`.app__main` is deliberately `overflow-y: auto`
for exactly this reason), but for this game that is a real usability problem,
not a cosmetic one: triage during a live fight requires seeing every party
member's health at a glance, and scrolling mid-fight defeats that.

ADR-0008 explicitly reaffirmed "the 72 × 72 px constraint still holds" when
the spell bar grew from four to five buttons. This decision reverses that.

## Decision

`.spell` drops to a 64 × 64 px minimum (matching the party frame's existing
64 px minimum height — reusing that number rather than inventing a new one),
and `.controls__spells` targets a single row on a phone:

```css
.controls__spells {
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  gap: 6px;
}

.spell {
  min-width: 64px;
  min-height: 64px;
  padding: 4px;
}
```

At 375 px (iPhone 13 mini) this fits five 64 px columns with 6 px gaps
(5 × 64 + 4 × 6 = 344 px against ~359 px available) — one row instead of two,
saving ~88 px. On a 320 px wide phone the same `auto-fit` rule wraps to
4 + 1 automatically, the same graceful-degradation pattern already used for
the party (`.app__main` scrolls rather than clipping).

Desktop / wide landscape (`min-width: 720px and (orientation: landscape)`)
keeps the original 96 px column width and restores `.spell` to a 72 px
minimum height — the constraint this ADR relaxes was about a thumb on a small
phone screen, and that pressure does not exist there.

## Alternatives Considered

- **Horizontal-scrolling single row at 72 × 72 px** — keeps the touch-target
  size ADR-0008 set, at the cost of a swipe to reach the rightmost spell(s) on
  the narrowest phones. Rejected here on explicit product direction: full
  visibility of the party outranks keeping the larger touch target.
- **Tightening only the surrounding gaps/padding** (castbar/manabar spacing,
  controls padding) — tried first; saves at most ~20 px, not enough to close
  the ~58 px worst-case deficit on a short viewport.
- **Letting the page scroll as a whole instead of just the party** — rejected:
  contradicts the existing height-locked `.app` design (`render-budget`
  skill), which exists to stop controls from scrolling out of reach during a
  fight.

## Consequences

- ✅ All five party members are visible without scrolling on an iPhone 13
  mini in the common case (Safari toolbar collapsed), and need at most a short
  scroll rather than losing a full row of party frames otherwise.
- ✅ Desktop/landscape appearance is unchanged (72 px buttons, 96 px columns).
- ⚠️ 64 px is below the 44 pt Apple HIG minimum's usual safety margin, though
  still above it; verify a real device if spell mis-taps are reported.
- ⚠️ On a 320 px wide phone the bar still wraps to two rows (4 + 1), so the
  worst case from ADR-0008 is narrowed, not eliminated.
- ⚠️ Supersedes the "72 × 72 px constraint still holds" consequence in
  ADR-0008; that ADR is left in place with a pointer to this one.
