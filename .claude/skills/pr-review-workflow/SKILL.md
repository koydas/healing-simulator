---
name: pr-review-workflow
description: How to handle review feedback on a pull request in this repo — reproduce the finding, fix it with a regression test, reply with the evidence, resolve the thread, and only then request a new review. Use this skill whenever review comments arrive (from a human or from the Codex bot), whenever you are asked to check or address PR comments, and whenever CI fails on a PR you opened.
---

# pr-review-workflow

## When to Apply

Any review activity on a pull request of this repository: inline threads from a
human reviewer, findings from the automated Codex review, or a CI failure on a
PR you opened.

## Expected Behavior

### Step 1 — Judge the finding on the code, not on its tone

An automated reviewer is right often enough to take seriously and wrong often
enough to check. Read the code path it points at and decide for yourself:

- **Real and small** → fix it.
- **Real but architecturally significant** → say so and ask before rewriting.
- **Not real** → say why, with the code or the measurement that shows it. A
  false positive answered with evidence is a perfectly good outcome; a false
  positive "fixed" to make the bot happy adds a bug.

### Step 2 — Reproduce before fixing

Write the failing test, or a scratch script that prints the symptom, *before*
touching the fix. Two reasons: you learn whether the finding is real, and you
get the exact numbers that make the reply convincing ("the dead healer spent 30
mana and healed the tank for 46", "204 px of the party clipped at 320 × 568").

Scratch reproductions go in the scratchpad, not in the repo. The permanent
version is a regression test — see `test-protocol`.

### Step 3 — Fix, test, document, push

The fix, its regression test, and the documentation it invalidates travel in
the same commit. A behaviour change usually touches `docs/simulation.md` or a
guide, plus a `Fixed` bullet in `CHANGELOG.md`.

Run `npm test && npm run build` before pushing — the Docker build runs the suite
too, so a red suite blocks more than CI.

### Step 4 — Reply to the thread with evidence

One reply per thread, after the fix is pushed, containing:

- the commit SHA that fixes it;
- what the reproduction showed, in numbers;
- what changed, in one or two lines;
- what you verified afterwards.

State plainly anything you could **not** verify in this environment — no Docker
daemon, no cluster, no Nginx binary. A reviewer can work with "reasoned, not
executed"; they cannot work with a claim that quietly assumes it was tested.

If you decided not to fix, the reply carries the reasoning and, where relevant,
the offer: *"happy to do X instead if you prefer"*.

### Step 5 — Resolve the thread

Resolve only after replying. A resolved thread with no reply erases the
reviewer's finding from the conversation, which is exactly what a reviewer
coming back later needs to read.

### Step 6 — Request a new review, once

Post `@Codex review` **only when code changed**. Threads answered with an
explanation and no commit do not warrant a new run. One request per round of
fixes, not one per thread.

### CI on a PR you opened

Drive it to green. Every failure ends with either a pushed fix or a reply
explaining what is failing and why it is not yours to fix. If the failure
reproduces on the base branch, say so once in the thread and act on the
recovery. Never leave a CI failure on your own PR silent.

## Constraints

- Do not resolve a thread you have not answered.
- Do not batch several unrelated fixes behind a single vague reply — the
  reviewer needs to match each answer to their finding.
- Do not widen the fix beyond the finding. If you spot something adjacent, fix
  it in its own commit and say so, rather than smuggling it in.
- Be sparing with PR-level comments: threads carry the detail, the PR comment
  carries at most a short round summary.
- Every comment posted from an agent ends with the Claude Code attribution
  footer.

## References

- `docs/testing.md` — where the regression test belongs
- `CHANGELOG.md` — the `Fixed` section for user-visible corrections
- `.github/workflows/ci.yml` — what CI actually runs (typecheck, tests, build)
