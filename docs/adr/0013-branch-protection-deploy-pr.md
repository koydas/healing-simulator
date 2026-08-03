# ADR-0013: `main` ruleset activated — deploy pipeline switches to an auto-merged PR

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

The repo already had a "Main" ruleset requiring a pull request onto `main`
(no direct push, no force-push, no deletion), created alongside the repo but
left with `enforcement: disabled` — so it existed but blocked nothing.
Activating it (this ADR) exposed a conflict: ADR-0012's `docker-publish.yml`
commits the built image tag straight to `main` with a plain `git push`, which
the now-active `pull_request` rule rejects.

The natural fix — add `github-actions[bot]`'s app (id `15368`) as a
`bypass_actors` entry so the workflow can keep pushing directly — is not
available here: the ruleset API rejects an `Integration`-type bypass actor on
a **personal-account** repository (`koydas/healing-simulator` is user-owned,
not org-owned) with *"Actor GitHub Actions integration must be part of the
ruleset source or owner organization"*. `RepositoryRole` bypass (e.g. Admin)
would not help either — commits made via the workflow's `GITHUB_TOKEN` are
attributed to the `github-actions[bot]` app identity, not to the human admin
account, so a role-based bypass never matches the pushing actor.

## Decision

Activate the ruleset (`enforcement: active`, no bypass actors) and change the
"commit the built tag" step in `.github/workflows/docker-publish.yml` from a
direct push to a same-repo branch + PR + immediate squash-merge:

```bash
git fetch origin main
git checkout -B "deploy/${sha}" origin/main   # live main tip, not this job's trigger commit
sed -i "s|...:.*|...:${sha}|" k8s/deployment.yaml
git commit -m "chore: deploy ${sha}"
git push --force origin "HEAD:refs/heads/deploy/${sha}"   # retry-safe: branch name is deterministic
PR_NUMBER=$(gh pr list --head "deploy/${sha}" --base main --state open --json number --jq '.[0].number')
[ -z "$PR_NUMBER" ] && gh pr create --base main --head "deploy/${sha}" ...
gh pr merge "deploy/${sha}" --squash --delete-branch
```

The ruleset's `pull_request` rule requires `required_approving_review_count:
0`, so the merge completes immediately with no human in the loop — the
workflow is still fully automated, it just goes through the PR API instead of
a raw `git push`. `main` stays genuinely protected against a direct push or
force-push from anywhere else (a human's laptop, a leaked token, a different
workflow), which is what the ruleset in place from repo creation was for.

Branching from `origin/main`'s live tip (not the job's triggering commit) and
force-pushing by deterministic branch name are both retry/concurrency
correctness fixes found in review after this ADR was first written — see the
PR #2 review thread for the two failure modes (a stale trigger-commit base
conflicting with an already-merged tag bump; a non-fast-forward rejection on
retry after a failed `gh pr create`/`gh pr merge`) — folded into this recipe
rather than given their own ADR, since they don't change the decision itself.

## Alternatives Considered

- **Leave the ruleset disabled** — rejected: it existed specifically to stop
  direct pushes to `main`; leaving it off after being asked to turn it on
  defeats the point silently.
- **Bypass actor for the GitHub Actions app** — rejected: not supported by
  GitHub's API for user-owned repositories (see Context); would require
  transferring the repo into an organization, which is a much bigger and
  unrelated change.
- **Bypass actor for `RepositoryRole: Admin`** — rejected: doesn't match the
  actual pushing identity (`github-actions[bot]`), so it would not have
  bypassed anything.
- **Require human approval on the deploy PR** — rejected: would turn every
  automated deploy into a manual step, undoing the point of ADR-0012's
  pipeline; `required_approving_review_count: 0` already satisfies "a PR
  exists" without needing a reviewer.

## Consequences

✅ `main` cannot be pushed to directly, force-pushed, or deleted by anyone —
the ruleset now actually enforces what it was created for.

✅ The deploy pipeline stays fully automated: no human approval needed, just
an extra PR-create-and-merge round trip instead of a plain push.

⚠️ Each deploy now leaves a merged, squashed PR in the repo's history (e.g.
"chore: deploy a1b2c3d") instead of a single direct commit — slightly more
GitHub API traffic per deploy, no functional cost.

⚠️ If this repo is ever moved into a GitHub organization, revisit whether an
`Integration` bypass actor for the GitHub Actions app becomes available and
would simplify this back to a direct push — that option was rejected here
specifically because the repo is user-owned, not because a direct push is
undesirable in principle.
