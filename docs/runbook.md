# Runbook

Troubleshooting for the common problems, from the dev machine to the cluster.

## Development

### `npm run dev` starts but the page is blank

1. Open the browser console: an exception in `main.tsx` (missing `#root`
   element) or in a component stops the render.
2. Check that `index.html` still contains `<div id="root">`.
3. Run `npm run typecheck` to rule out a type error hidden by HMR.

### The game seems to "jump" after switching tabs

That is the expected behaviour: beyond `LONG_STALL_MS` (1 s) the elapsed time is
**discarded**, there is no catch-up. The timer does not progress while the tab
is in the background.

### The game runs too slowly on a weak device

Catch-up is capped at `MAX_CATCHUP_MS` (500 ms, i.e. 5 steps per frame). If the
device cannot hold 2 frames per second the simulation falls behind by design —
that is a deliberate choice (see ADR-0002), not a bug.

### A test fails after a balance change

Several tests rely on the nominal level 1 values (melee 8, AoE 6, spike 18,
health 90 / 51 / 55 / 50 / 46). Update the test, `docs/balance.md`, and — if the
value claims to come from Classic — `docs/classic-stats.md`.

### "The health values are not what I expected"

Health is not written in the code: it is recomputed from race, class and the
vanilla formulas (`src/config/classicData.ts`). The threshold at 20 stamina
explains the gaps — beyond 20, each point is worth 10 health instead of 1. See
[classic-stats.md](./classic-stats.md).

### A race/class combination throws

`getAttributes` only knows the combinations present in
`RACE_CLASS_ATTRIBUTES`. Add the matching row from the vanilla
`player_levelstats` table rather than improvising attributes.

### A race/class combination throws only above level 1

Same table, other axis: the five combinations the party uses carry every level
up to 60, the twelve others only their level 1 row. `No attributes for
gnome/mage at level 30` means that column has to be extended from the same SQL
file — the error is deliberate, so nobody ships an interpolated character.

### A duration test is off by one step

`advance(state, ms)` rounds `ms / 100`: use multiples of 100 ms. Watch out for
threshold effects too — an event scheduled at 2000 ms fires during the step that
**reaches** 2000 ms.

## Build

### `npm run build` fails on `tsc --noEmit`

The script chains typecheck then build: fix the TypeScript errors first.
`tsconfig.json` enables `strict`, `noUnusedLocals` and `noUnusedParameters` — an
unused import alone will fail the build.

### `Property 'at' does not exist on type`

`lib` must include `ES2022` in `tsconfig.json`.

## Container

### The Docker build fails on `npm ci`

`package-lock.json` must be committed and in sync with `package.json`. Run
`npm install` locally and commit the updated lockfile.

### The Docker build fails on the test step

That is intentional: the image does not build if the suite fails. Reproduce it
locally with `npm test`.

### `403 Forbidden` or `Permission denied` when Nginx starts

The `nginx-unprivileged` image runs as uid 101. Check that the copied files use
`--chown=101:101` (the provided `Dockerfile` does).

### `nginx: [emerg] ... Read-only file system`

A writable path is missing. Mount `/tmp`, `/var/cache/nginx` and `/var/run` as
`emptyDir` volumes (see `k8s/deployment.yaml`).

## Kubernetes

### The pod stays in `CrashLoopBackOff`

```bash
kubectl logs deployment/healing-simulator
kubectl describe pod -l app.kubernetes.io/name=healing-simulator
```

Common causes: the image is missing from the cluster registry, the writable
volumes are missing, or `runAsUser` conflicts with a local PodSecurityPolicy.

### The `startupProbe` fails

```bash
kubectl port-forward deployment/healing-simulator 8080:8080
curl -i http://localhost:8080/health
```

If that returns `200 OK` directly, the problem is the probe port (it must be the
named `http` port, i.e. 8080), not the application.

### Blank page when reloading a deep route

The SPA fallback is handled by `try_files ... /index.html`, so the *page*
always arrives with `200`. A blank screen means the page arrived but its assets
did not. Check the console for:

```
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "text/html".
```

That line means a request for `…/assets/index-*.js` fell through to the SPA
catch-all and got `index.html` back. The asset prefix the browser asks for does
not match what the container serves — see the table in
[deployment.md](./deployment.md#serving-under-a-sub-path). Confirm it with:

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://host/assets/index-<hash>.js
# 200 text/javascript  -> correct
# 200 text/html        -> caught by the fallback, wrong prefix or wrong --base
# 404                  -> the URL never reached the container (Ingress rule)
```

Serving under a sub-path requires **both** `--base=/<prefix>/` at build time
and an Ingress that strips the prefix (ADR-0011).

### Assets do not update after a deployment

Vite content-hashes the file names and `index.html` is served `no-store`: a
reload is enough. If an intermediate cache (corporate CDN, proxy) holds on to
`index.html`, purge that cache — the application itself uses none.

## Gameplay

### "The fight ends too quickly"

With no healing at all, the wipe happens around 22 s (the tank has 90 HP and
takes 8 damage every 2 s). Played well, survival goes well past a minute; the
×1.15 ramp every 30 s mathematically overtakes healing throughput in the end —
that is the point of the mode.

### "The spell does not fire"

The message below the party always gives the exact reason: `Global cooldown`,
`Already casting`, `Level too low`, `Not enough mana`, `Target required`,
`Target is dead`, `You are dead`, `Game paused` or `Fight is over`.

### "Elowen died and I cannot do anything any more"

That is expected. The healer is a party member: a spike or an AoE can kill her
while the tank is still standing, and the fight then runs on without a healer
until a wipe condition is met. Casting is refused with `You are dead`, and any
cast in flight is interrupted. HoTs applied beforehand keep ticking.

### "Four buttons out of five are greyed out"

That is intended. At level 1 a WoW Classic priest only knows Lesser Heal; Renew
comes at level 8, Heal at 16, Flash Heal at 20 and Prayer of Healing at 30. The
locked buttons show their required level, and unlock as the character levels —
three victories per level (see
[classic-stats.md](./classic-stats.md#experience-and-levels)).

### "Mana is not coming back"

Vanilla's five-second rule is in effect: after a mana expenditure, spirit-based
regeneration is fully suspended for 5 seconds. Ticks then land every 2 seconds,
for 18.5 points.

### Replaying the exact same fight

Add `?seed=<value>` to the URL — the current one is displayed at the bottom of
the end screen, and `?enemy=` / `?level=` are filled in automatically once the
fight starts. All three matter: since the party's stats and spellbook come
from the level, the same seed and enemy opened without `?level=` falls back to
*your own* profile's level, not the one the link was generated from.

### "My level and my record are gone"

The profile lives in this browser only, under
`healing-simulator.profile.v1` in `localStorage`. It is lost by clearing site
data, by browsing in private mode (where storage is often refused outright —
the game then plays normally but saves nothing), or by opening the game in
another browser or on another device. There is no account and no sync, by
design (ADR-0018).

### "My level came back wrong after editing the save"

`loadProfile` never trusts what it reads: the level is clamped to `[1, 60]`,
experience is clipped below the current level's requirement, counters are
floored at 0, and anything unparseable falls back to a fresh profile. Editing
the JSON to grant yourself a level therefore does not work — and that is what
stops a corrupt save from throwing inside the Classic tables mid-fight.

### Deleting the save from the app

`Options → Delete saved game`, then confirm. It removes the `localStorage` key
and resets the character to level 1 with an empty record.
