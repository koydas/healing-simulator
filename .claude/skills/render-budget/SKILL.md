---
name: render-budget
description: How to add or change UI without breaking the render budget — the store/snapshot/onFrame split, React.memo, CSS-variable animation, cleanup, and the mobile layout rules (64x64 spell buttons on phones, 72x72 on desktop, scrollable regions on short viewports). Use this skill whenever you touch src/components/, src/store/, src/hooks/ or src/styles.css, add a widget or an indicator, or wire a new value from the engine into the screen.
---

# render-budget

## When to Apply

Any change under `src/components/`, `src/store/`, `src/hooks/` or
`src/styles.css`: a new indicator, a new control, a new field surfaced from the
engine, a layout change.

The engine produces a new state ten times a second. The reason the interface
stays cheap is a deliberate split between what React renders and what is
written straight to the DOM — and that split is easy to undo by accident with
one innocent-looking `useState`.

## Expected Behavior

### Decide where a value belongs

Ask one question: **does it change on most 100 ms steps?**

- **Yes** (mana, cast progress, GCD progress) → it never goes through React.
  Subscribe with `useFrame` and write a CSS variable or a `textContent` through
  a ref:

  ```ts
  useFrame(useCallback((state) => {
    barRef.current?.style.setProperty('--mana-fill', `${getManaRatio(state) * 100}%`);
  }, []));
  ```

- **No** (health, alive state, Renew stacks, selection, spell availability,
  timer in whole seconds) → it belongs in a snapshot built by
  `src/store/gameStore.ts`, consumed with a `useSyncExternalStore` hook.

The store rebuilds snapshots after every step and **reuses the previous
reference when the content is unchanged** (`reuse` / `snapshotEqual`), so React
skips components whose data did not move. Two habits keep that working:

- keep snapshot fields primitive; arrays are compared element by element, but a
  fresh object or a new closure per rebuild makes the snapshot always look
  different and re-renders the component ten times a second, silently;
- round or bucket continuous values before putting them in a snapshot (the
  header timer is stored as `m:ss`, so it changes once per second, not per step).

### Component hygiene

Wrap subscribed components in `React.memo`, stabilise handlers with
`useCallback`, and pass the store through `useStore()` rather than as a prop.
`App` holds the store in a `useRef` and must keep re-rendering never.

Clean up everything you subscribe: `useFrame` returns the store's unsubscribe
function, `useGameLoop` cancels its `requestAnimationFrame` and removes its
`visibilitychange` listener.

### A modal has to take focus, not just claim to be modal

`role="dialog"` and `aria-modal="true"` describe the intent; they move no
focus and stop no Tab. Measured on the wipe screen before it was fixed: focus
stayed on `<body>` and six consecutive Tabs landed on party frames and spell
buttons *behind* the overlay, so a keyboard user could keep operating controls
they could not see.

A dialog in this project therefore does three things itself:

- `tabIndex={-1}` on the dialog container and `.focus()` on mount — focus the
  container rather than the button, so the label and the content get announced
  instead of jumping to the last control;
- `inert` on the dialog's siblings, so the obscured controls leave the tab
  order, removed again on unmount (a leaked `inert` freezes the whole game —
  verify the restart path, not just the open path);
- `aria-labelledby` pointing at the visible title.

Set `inert` on siblings rather than wrapping the app in a new element: the
`.app` flex layout has caused three separate regressions already, and a wrapper
is a layout change disguised as an accessibility fix.

### Refusals stay clickable

Spell buttons use `aria-disabled`, not the `disabled` attribute, because a tap
on an unavailable spell must still reach the engine and produce its refusal
message ("Not enough mana", "Level too low", …). Do not "fix" that into a real
`disabled`.

### Mobile layout rules

- Party frames: 64 px minimum height. Spell buttons: 64 × 64 px minimum on a
  phone (single row, see ADR-0015), 72 × 72 px on desktop/landscape
  (`min-width: 720px and (orientation: landscape)`).
- `touch-action: manipulation` and `user-select: none` on interactive surfaces;
  respect `env(safe-area-inset-*)`.
- **Never lock zoom.** `maximum-scale` and `user-scalable=no` in the viewport
  meta break pinch-to-zoom, and the smallest text here is 9px — someone with
  low vision has no other way to read it (WCAG 1.4.4). The reason a tapping
  game reaches for that lock is accidental double-tap zoom, and
  `touch-action: manipulation` already prevents it: measured at 390 × 844,
  320 × 568 and 667 × 375, a fast double tap on a spell button leaves
  `visualViewport.scale` at 1 while a pinch reaches 2.5.
- `html`, `body` and `.app` are height-locked and the page cannot scroll. **Any
  region whose content can exceed the viewport must scroll itself**
  (`overflow-y: auto`), otherwise the content is drawn outside the visible area
  and becomes untappable. This already happened once: `overflow: hidden` on
  `.app__main` clipped 204 px of the party on a 320 × 568 phone and left the
  bottom members unreachable.

Check a layout change at three sizes, not one: 390 × 844 (reference), 320 × 568
(small phone) and a landscape shape such as 667 × 375. `npm run preview` plus
the browser's device toolbar is enough; what you are looking for is content
below the fold in a container that does not scroll.

## Constraints

- Never put the `GameState`, or anything derived per step, in `useState` or in
  a Context value — that is a full re-render at 10 Hz.
- Never render inside a `useFrame` callback (no `setState`); it exists to
  bypass React, and calling into React from it defeats the purpose.
- Do not add a UI library, an animation library or a CSS framework: plain CSS
  and CSS variables are a hard project constraint.
- Do not let a snapshot carry a value that changes every step.

## References

- `docs/architecture.md` — layers, frame flow, rendering strategy
- `docs/adr/0004-external-store-memoized-snapshots.md` — why the store exists
- `src/store/gameStore.ts` — snapshot building and memoisation
- `src/hooks/useGameStore.ts` — subscription hooks, including `useFrame`
- `src/components/ManaBar.tsx` — the reference example of a frame-driven widget
