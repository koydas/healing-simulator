# ADR-0011: Root-relative asset base

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

The build shipped with `base: './'`, so `index.html` referenced
`./assets/index-<hash>.js`. The browser resolves that against the URL of the
page that carried it, and the SPA fallback serves `index.html` for **any**
unknown path — so the two features contradicted each other.

Reproduced against a server replicating `nginx/default.conf` (`/assets/` →
`try_files $uri =404`, everything else → `index.html`), Chromium 390 × 844:

| URL | `#root` innerHTML | Party frames |
| --- | --- | --- |
| `/` | 5161 chars | 5 |
| `/some/route` | **0 chars** | **0** |

```
/some/assets/index-CCcds_Tb.js -> 200 text/html
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "text/html".
```

A page served for `/some/route` resolved `./assets/…` to `/some/assets/…`,
which matches no `location /assets/`, so the catch-all answered with
`index.html` and the browser refused the HTML as a module. Blank page, one
console line.

Three documents promised the opposite: `docs/deployment.md` curls
`/some/route` as a working SPA fallback, `docs/runbook.md` has a "404 when
reloading a deep route" entry, and ADR-0006 lists "✅ Deep routes and reloads
work (SPA fallback)" as a consequence.

The application has no client-side router today — `src/App.tsx` only reads
`?seed=` — so nothing currently generates a deep route. The defect is a
promise the build cannot keep, and a trap for whoever adds routing next.

## Decision

Build with `base: '/'`. `index.html` emits `/assets/index-<hash>.js`, which
resolves identically whatever URL served the document, so the SPA fallback
boots the application instead of a blank page.

Sub-path deployments build for their prefix **and** pair it with an Ingress
that strips the prefix while preserving the suffix. Both halves have a shape
that is easy to get subtly wrong, so they are spelled out in
`docs/deployment.md`:

- the prefix reaches the image through `--build-arg BASE_PATH=/sim/`, not
  through a host-side `npm run build -- --base=/sim/` — `dist/` is in
  `.dockerignore`, so a host build never enters the image;
- the Ingress needs `rewrite-target: /$2` against `path: /sim(/|$)(.*)`.
  `rewrite-target: /` rewrites every request to `/`, assets included, which
  reproduces exactly the blank page this ADR is about.

## Alternatives Considered

- **Keep `base: './'` and delete the deep-route promise from the docs.**
  Cheaper, and honest about today's behaviour, since the app has no router. It
  lost because the fallback then exists only to answer a mistyped URL with a
  blank page: `try_files … /index.html` and relative assets are a
  contradiction, and the next person to add a router pays for it with a
  MIME-type error rather than a 404 that names the problem.

- **Map `/<prefix>/assets/…` back onto `/assets/…` with a regex `location`.**
  Rejected for the reason already recorded in `docs/deployment.md`: the
  container would silently accept any prefix, hiding a misconfigured Ingress
  instead of surfacing it.

- **`--base=/sim/` against an Ingress that forwards the prefix intact.**
  Measured, and it does not work: the container receives `/sim/assets/…`, which
  it does not serve, so the fallback returns `text/html` for the module — the
  same failure. `--base=/sim/` pairs with a *stripping* Ingress, not a
  forwarding one. (`docs/deployment.md` previously claimed the opposite; this
  ADR corrects it.)

## Consequences

- ✅ Deep paths boot the application, so the SPA fallback promised by ADR-0006
  is now real. Verified in Chromium: `/some/route` renders all five party
  frames, identical to `/`.
- ✅ The shipped `k8s/ingress.yaml` serves at path `/`, where root-relative is
  the correct and only sane choice.
- ✅ Adding a router later needs no deployment change.
- ⚠️ **An Ingress that strips its prefix no longer works with the default
  build.** Previously `./assets/…` resolved to `/sim/assets/…` and survived the
  strip; now the browser requests `/assets/…`, which matches no Ingress rule
  and hits the default backend. Measured: `404 text/plain`. Sub-path
  deployments must build with `--base=/<prefix>/`, which is verified to work
  against a stripping Ingress (`200 text/javascript`).
- ⚠️ The built `dist/` is no longer portable to an arbitrary sub-directory of a
  static host without rebuilding.
