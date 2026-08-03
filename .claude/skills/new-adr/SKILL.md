---
name: new-adr
description: Procedure for recording an architecture decision in docs/adr/ — next number, file structure, index entry, CHANGELOG line, and how to annotate an ADR that a later decision supersedes. Use this skill whenever you make a structural or irreversible choice (engine contract, data sourcing, rendering strategy, deployment shape), whenever you pick between two designs with real trade-offs, and whenever someone asks why the project works the way it does.
---

# new-adr

## When to Apply

A decision deserves an ADR when reversing it later would be expensive, when you
rejected a credible alternative, or when the choice will look arbitrary to
someone reading the code in six months. Balance tweaks and refactors do not
need one; "the engine is pure", "spells are gated by training level" and "the
boss profile is partly designed" do.

If you are hesitating, ask what a reader would ask: *why is it like this?* If
the code cannot answer, write the ADR.

## Expected Behavior

### Step 1 — Find the next number

```bash
ls docs/adr/[0-9][0-9][0-9][0-9]-*.md | sort | tail -1
```

Increment by one, four digits, zero-padded. Numbers are sequential with no
gaps, and they are never reused — an obsolete decision keeps its number and
gets a status change.

### Step 2 — Write `docs/adr/<NNNN>-<kebab-case-title>.md`

```markdown
# ADR-<NNNN>: <Title>

- **Date:** <YYYY-MM-DD>
- **Status:** Accepted

## Context

[What forced a decision? Include the numbers that made it necessary — the
measurement, the failing case, the constraint from the brief.]

## Decision

[What was decided and how it works. Be concrete: name the functions, the files,
the constants.]

## Alternatives Considered

[Each credible option, and *why it lost*. This is the section future readers
actually need — an ADR without it is just documentation.]

## Consequences

[✅ for what this buys, ⚠️ for what it costs. Write the drawbacks honestly;
an ADR with only benefits reads as marketing and gets ignored.]
```

The alternatives section carries the weight. "We used X" is in the code
already; "we did not use Y because it breaks Z" is the part that stops the next
person from redoing the analysis — or from silently undoing the decision.

### Step 3 — Update the index

Append to the `## Records` list in `docs/adr/README.md`:

```markdown
- [ADR-<NNNN>: <Title>](./<NNNN>-<kebab-case-title>.md)
```

### Step 4 — Update the CHANGELOG

Add a bullet under `## [Unreleased]` in `CHANGELOG.md`, in the right subsection
(`Added` / `Changed` / `Fixed`), describing the observable consequence and
citing the ADR number. A decision nobody can see from the outside is rare — if
you cannot describe an observable effect, reconsider whether it needs an ADR.

### Step 5 — Update the affected docs

An ADR states *why*; the guides state *what*. If the decision changes behaviour,
`docs/simulation.md`, `docs/balance.md`, `docs/classic-stats.md`,
`docs/deployment.md` or the runbook needs the same change in the same commit.

### Superseding an earlier ADR

Do not rewrite history. Leave the old ADR in place and add a short note where a
reader will hit it, pointing at the new number:

```markdown
> Update (ADR-0007): the healing roll now uses the Classic spell's min/max range
> instead of a ±10% variation. Its position in the sequence has not changed.
```

If a decision is fully reversed, set its `Status` to `Superseded by ADR-<NNNN>`
rather than deleting the file.

## Constraints

- Never skip the index update — an orphaned ADR is invisible.
- Never skip the CHANGELOG line.
- Status is `Accepted`, `Proposed`, or `Superseded by ADR-NNNN`; no custom
  statuses.
- Keep it to one decision per ADR. Two decisions in one file means neither can
  be superseded independently later.
- Write it in English, like the rest of the project.

## References

- `docs/adr/README.md` — the index to update
- `docs/adr/0010-level-1-boss-profile.md` — a good model: measurements in
  Context, an explicit sourced/designed split, honest ⚠️ consequences
- `docs/adr/0003-deterministic-prng-in-state.md` — example of a superseding note
- `CHANGELOG.md` — where the observable consequence goes
