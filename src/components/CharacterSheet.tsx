/**
 * Character sheet shown on the home screen: the Classic stats of the player's
 * priest at their current level, and the experience bar towards the next one.
 *
 * Everything displayed here is derived from the Classic tables by
 * `playerCharacterAtLevel` — the profile only stores a level and an experience
 * count, never a health or mana value.
 */

import { memo } from 'react';
import { MAX_LEVEL, playerCharacterAtLevel } from '../config/gameConfig';
import { xpProgress, type PlayerProfile } from '../profile/playerProfile';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

interface CharacterSheetProps {
  profile: PlayerProfile;
}

export const CharacterSheet = memo(function CharacterSheet({ profile }: CharacterSheetProps) {
  const character = playerCharacterAtLevel(profile.level);
  const progress = xpProgress(profile);
  const nextSpell = character.spellsLocked[0];

  return (
    <section className="sheet" aria-labelledby="sheet-title">
      <header className="sheet__header">
        <h2 className="sheet__title" id="sheet-title">
          {character.name}
        </h2>
        <p className="sheet__identity">
          {character.raceLabel} · {character.classLabel}
        </p>
        <p className="sheet__level">
          Level <strong>{character.level}</strong>
          {character.level >= MAX_LEVEL ? ' · max' : ` / ${MAX_LEVEL}`}
        </p>
      </header>

      <div className="sheet__xp">
        <div
          className="sheet__xp-track"
          role="progressbar"
          aria-label="Experience"
          aria-valuemin={0}
          aria-valuemax={progress.required ?? 0}
          aria-valuenow={progress.required === null ? 0 : progress.xp}
          aria-valuetext={
            progress.required === null
              ? 'Maximum level reached'
              : `${integer.format(progress.xp)} of ${integer.format(progress.required)} experience`
          }
        >
          {/* A static width, written once per profile change: no per-frame
              value ever reaches this screen, so plain inline style is enough. */}
          <div className="sheet__xp-fill" style={{ width: `${progress.ratio * 100}%` }} />
        </div>
        <p className="sheet__xp-label">
          {progress.required === null
            ? 'Maximum level reached'
            : `${integer.format(progress.xp)} / ${integer.format(progress.required)} XP`}
        </p>
      </div>

      <dl className="sheet__stats">
        <div className="sheet__stat">
          <dt>Health</dt>
          <dd>{integer.format(character.hpMax)}</dd>
        </div>
        <div className="sheet__stat">
          <dt>Mana</dt>
          <dd>{integer.format(character.manaMax)}</dd>
        </div>
        <div className="sheet__stat">
          <dt>Regen</dt>
          <dd>{decimal.format(character.manaPerTick)} / 2 s</dd>
        </div>
        <div className="sheet__stat">
          <dt>Stamina</dt>
          <dd>{character.attributes.stamina}</dd>
        </div>
        <div className="sheet__stat">
          <dt>Intellect</dt>
          <dd>{character.attributes.intellect}</dd>
        </div>
        <div className="sheet__stat">
          <dt>Spirit</dt>
          <dd>{character.attributes.spirit}</dd>
        </div>
        <div className="sheet__stat">
          <dt>Strength</dt>
          <dd>{character.attributes.strength}</dd>
        </div>
        <div className="sheet__stat">
          <dt>Agility</dt>
          <dd>{character.attributes.agility}</dd>
        </div>
      </dl>

      <p className="sheet__spells">
        <span className="sheet__spells-label">Spells</span>
        {character.spellsKnown.map((spell) => spell.name).join(', ')}
        {nextSpell ? (
          <span className="sheet__spells-next">
            {' '}
            — {nextSpell.name} at level {nextSpell.requiredLevel}
          </span>
        ) : null}
      </p>
    </section>
  );
});
