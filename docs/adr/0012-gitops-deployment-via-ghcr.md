# ADR-0012: GitOps deployment via GHCR image + ArgoCD git-source Application

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

The project had a working container (ADR-0006) and Kubernetes manifests
(`k8s/`), but no publishing pipeline: `k8s/deployment.yaml` pointed at a local
tag (`healing-simulator:1.0.0`) that only exists on a machine that ran
`docker build` by hand, and `k8s/ingress.yaml` used a placeholder host
(`healing-simulator.local`). Getting the app running on the homelab's microk8s
cluster needs an image the cluster can actually pull, and a way for ArgoCD to
know what to deploy.

`koydas/ollama-chat` solved the same problem already: a GitHub Actions workflow
builds the image, pushes it to GHCR, and commits the new tag back into
`k8s/deployment.yaml` on `main`, which is the commit ArgoCD's git-source
Application syncs on. This project reuses that recipe rather than inventing a
second one.

## Decision

`.github/workflows/docker-publish.yml`, triggered on push to `main`
(`paths-ignore` on `k8s/**`, `docs/**`, `**.md` to avoid re-triggering on its
own commit):

1. run the existing test/typecheck/build job;
2. build the image and push it to `ghcr.io/koydas/healing-simulator`, tagged
   with both the short commit SHA and `latest`;
3. `sed` the SHA tag into `k8s/deployment.yaml`'s `image:` line and commit that
   change back to `main` with `github-actions[bot]`.

`k8s/deployment.yaml`'s `image:` therefore always reflects a real, pulled
image, not a moving `latest` — the same reasoning as ollama-chat's ADR-0006.

`k8s/ingress.yaml`'s host becomes `healing-simulator.home`, served through the
cluster's shared `ingress-nginx` rather than a dedicated MetalLB IP — this app
has no realtime backend and no reason to need one (unlike `ollama-chat`, which
was the first app to actually use that path).

The ArgoCD Application itself (git source, `path: k8s`, namespace
`healing-simulator`) lives in `gitops-homelab`, not here — see that repo's own
ADR for the onboarding decision, following the same split ollama-chat uses
(this repo owns image + manifests, `gitops-homelab` owns the Application/
AppProject wiring).

## Alternatives Considered

- **Helm chart for this app** — rejected: a single-image static site with three
  flat manifests does not need chart templating; Kustomize-free plain YAML is
  simpler and keeps the deployment shape next to the code it deploys.
- **`latest` tag only, no SHA bump** — rejected: ArgoCD would see no Git change
  on a new image and never redeploy without a manual restart; the SHA-tag
  commit is what turns "a new image exists" into "a new commit to sync."
- **Push the image from a local machine** — rejected: ties every deploy to
  whoever has Docker and GHCR credentials on their laptop, and leaves no
  record of which commit produced which image.

## Consequences

✅ Pushing to `main` is now sufficient to get a new build running on the
cluster, with no manual `docker build`/`push`/`kubectl apply` step.

✅ The image tag in `k8s/deployment.yaml` is always traceable to the exact
commit it was built from.

⚠️ A push to `main` gets a second, bot-authored commit shortly after; pulling
before pushing again avoids a rejected non-fast-forward push (same caveat as
`ollama-chat`'s `homelab-deploy` skill documents).

⚠️ GHCR packages pushed via `GITHUB_TOKEN` default to **private** visibility on
first publish; the package must be set to public (or the Deployment given an
`imagePullSecret`) or the cluster's `ImagePullBackOff` will be silent about why.
