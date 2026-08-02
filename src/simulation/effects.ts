/**
 * Application des soins, des dégâts et des effets de sorts.
 *
 * Toutes les fonctions mutent un *brouillon* d'état déjà cloné par l'appelant
 * (`stepSimulation` ou les actions) : elles ne mutent jamais un état partagé.
 */

import type { SpellDefinition } from '../config/gameConfig';
import { pushFeedback } from './feedback';
import { nextRandom } from './random';
import type { GameState, HotEffect, PartyMember } from './types';

/** Retourne un membre du groupe par identifiant, ou `undefined`. */
export function findMember(state: GameState, id: string | null): PartyMember | undefined {
  if (!id) return undefined;
  return state.party.find((member) => member.id === id);
}

/**
 * Tire un montant de soin en appliquant la variation du sort.
 * Consomme l'état du générateur pseudo-aléatoire lorsque la variation existe.
 */
export function rollHealAmount(draft: GameState, base: number, variancePct: number): number {
  if (variancePct <= 0) return Math.round(base);
  const { value, seed } = nextRandom(draft.seed);
  draft.seed = seed;
  const factor = 1 - variancePct + value * variancePct * 2;
  return Math.round(base * factor);
}

/**
 * Applique un soin à un membre.
 * Un membre mort ne peut jamais recevoir de soin.
 */
export function applyHealTo(draft: GameState, member: PartyMember, amount: number): void {
  if (!member.alive || amount <= 0) return;

  const missing = member.hpMax - member.hp;
  const effective = Math.min(amount, missing);
  const overheal = amount - effective;

  member.hp = Math.min(member.hpMax, member.hp + effective);

  draft.stats.rawHealing += amount;
  draft.stats.effectiveHealing += effective;
  draft.stats.overhealing += overheal;

  if (effective > 0) {
    pushFeedback(draft, { kind: 'heal', targetId: member.id, amount: effective });
  }
  if (overheal > 0) {
    pushFeedback(draft, { kind: 'overheal', targetId: member.id, amount: overheal });
  }
}

/**
 * Applique des dégâts à un membre vivant.
 * Le montant brut est multiplié par la rampe puis arrondi à l'entier le plus proche.
 * La résolution des morts est faite séparément, en fin de pas de simulation.
 */
export function applyDamageTo(draft: GameState, member: PartyMember, rawAmount: number): void {
  if (!member.alive || rawAmount <= 0) return;

  const amount = Math.round(rawAmount * draft.damageMultiplier);
  const applied = Math.min(amount, member.hp);

  member.hp = Math.max(0, member.hp - amount);
  draft.stats.damageTaken += applied;

  pushFeedback(draft, { kind: 'damage', targetId: member.id, amount: applied });
}

/** Applique (ou réapplique) un HoT sans jamais le stacker. */
export function applyHot(member: PartyMember, spell: SpellDefinition): void {
  const hot: HotEffect = {
    spellId: spell.id,
    healPerTick: spell.healAmount,
    intervalMs: spell.hotIntervalMs,
    ticksRemaining: spell.hotTicks,
    // Réappliquer réinitialise le délai : aucun tick immédiat.
    nextTickInMs: spell.hotIntervalMs,
  };

  const existingIndex = member.hots.findIndex((entry) => entry.spellId === spell.id);
  if (existingIndex >= 0) {
    member.hots[existingIndex] = hot;
  } else {
    member.hots.push(hot);
  }
}

/**
 * Applique l'effet d'un sort dont le lancement est terminé.
 * La cible est supposée valide (vivante) : les morts annulent les casts.
 */
export function applySpellEffect(
  draft: GameState,
  spell: SpellDefinition,
  targetId: string | null,
): void {
  if (spell.kind === 'group') {
    for (const member of draft.party) {
      if (member.alive) {
        applyHealTo(draft, member, spell.healAmount);
      }
    }
    return;
  }

  const target = findMember(draft, targetId);
  if (!target || !target.alive) return;

  if (spell.kind === 'hot') {
    applyHot(target, spell);
    return;
  }

  const amount = rollHealAmount(draft, spell.healAmount, spell.variancePct);
  applyHealTo(draft, target, amount);
}
