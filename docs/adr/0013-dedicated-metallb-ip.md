# ADR-0013: Dedicated MetalLB IP alongside the Ingress

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

ADR-0012 routed the app through `gitops-homelab`'s `ingress-nginx` at hostname
`healing-simulator.home`, specifically to avoid spending a MetalLB address per
app (see `gitops-homelab` ADR-0014/0023). That works from a machine with a
`/etc/hosts` entry for the hostname, but there is no LAN DNS server in this
homelab yet (`gitops-homelab` `docs/operations.md`), and a phone has no
practical way to add one — hitting the bare ingress IP (`192.168.1.243`)
without a matching `Host` header just returns ingress-nginx's own 404. For
trying the game out from a phone, that setup step is friction the operator
wants to skip — same situation `ollama-chat` hit first (its own ADR-0007).

## Decision

`k8s/service.yaml`'s `Service` is `type: LoadBalancer` with
`metallb.io/loadBalancerIPs: "192.168.1.247"` (pinned, next free address after
`ollama-chat` (`.244`), `whisper` (`.245`) and `piper` (`.246`)) — **in
addition to**, not instead of, the Ingress: the same Service backs both, so
`http://192.168.1.247` works directly with zero client-side config, and
`http://healing-simulator.home` (via `.243`) still works once a hostname is
set up on a given device.

## Alternatives Considered

- **Ingress-only (status quo)** — rejected: doesn't satisfy "try it from a
  phone with no setup," which was the actual ask.
- **A local DNS resolver for the LAN** (e.g. dnsmasq/Pi-hole answering
  `*.home`, pointed at from each device's Wi-Fi DNS settings) — the more
  general long-term fix `gitops-homelab`'s `docs/operations.md` already flags
  as the gap here, and it would cover every future host-routed app at once.
  Rejected *for this ADR* as more infrastructure than "let me try the game on
  my phone" needs today; worth revisiting once more than one or two apps hit
  the same friction (see `ollama-chat` ADR-0007's identical note).

## Consequences

✅ `http://192.168.1.247` works immediately from any device on the LAN,
including a phone, with no `/etc/hosts` edit or DNS setup.

⚠️ Reintroduces the per-app MetalLB address the ingress model was meant to
move away from — pool has `.248`-`.250` left after this (3 addresses).
Acceptable for one more app; revisit the ingress-only model, or actually stand
up the LAN DNS resolver noted above, if this recurs for a third app.

Neutral: the Ingress stays in place and still works once a hostname is
configured — this doesn't replace ADR-0012's routing, it adds a second path
to the same Service.
