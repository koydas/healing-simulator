# ADR-0002: Boucle à pas fixe de 100 ms avec accumulateur borné

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

`requestAnimationFrame` fournit un delta variable (16 ms sur un écran 60 Hz,
8 ms en 120 Hz, plusieurs secondes après un retour d'arrière-plan). Faire
avancer la simulation de ce delta rendrait le jeu non reproductible : deux
appareils ne verraient pas la même partie avec la même seed, et un onglet
laissé en arrière-plan reviendrait avec un « rattrapage » de plusieurs minutes
appliqué d'un coup, tuant le groupe instantanément.

## Decision

La simulation n'avance **que** par pas fixes de `TICK_MS = 100`. `useGameLoop`
accumule le temps réel et le découpe :

```
delta = now - dernierTimestamp
si delta > LONG_STALL_MS (1000)  → delta = 0, accumulateur = 0   (aucun rattrapage)
accumulateur = min(accumulateur + delta, MAX_CATCHUP_MS = 500)
tant que accumulateur >= 100 et pas < 5 :  store.advance(100)
```

Un listener `visibilitychange` remet l'horloge et l'accumulateur à zéro dès que
l'onglet passe en arrière-plan, ce qui évite de dépendre du seul seuil de 1 s.

Tous les intervalles de la timeline (1500, 12 000, 30 000 ms) sont des multiples
de 100 ms : la résolution des événements est donc exacte, sans dérive.

## Alternatives Considered

- **Pas variable (`stepSimulation(state, delta)`)** — rejeté : perte du
  déterminisme et arrondis de dégâts dépendants de la fréquence d'écran.
- **`setInterval(100)`** — rejeté : dérive du navigateur, throttling agressif en
  arrière-plan (jusqu'à 1 Hz), et le cahier des charges interdit les timers
  réels dans la logique métier.
- **Rattrapage complet après un retour d'onglet** — rejeté explicitement : le
  joueur perdrait la partie sans avoir pu agir.

## Consequences

- ✅ Même seed + mêmes actions ⇒ même partie, quel que soit le matériel.
- ✅ Un onglet en arrière-plan gèle la partie au lieu de la perdre.
- ✅ Les tests appellent `stepSimulation(state, 100)` directement, sans mock de
  `requestAnimationFrame`.
- ⚠️ La granularité des événements est de 100 ms : un cast de 1,55 s se
  résoudrait à 1,6 s. Toutes les valeurs de balance doivent rester des
  multiples de 100 ms.
- ⚠️ Sur un appareil incapable de tenir 2 frames/s, la simulation prend un
  retard permanent (plafond de rattrapage). C'est préférable à un pic de dégâts.
