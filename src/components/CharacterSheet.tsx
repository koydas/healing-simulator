/**
 * Character sheet shown on the home screen: identity, level and experience
 * bar always visible; the Classic stats of the player's character at their
 * current level behind an expand toggle (ADR-0020).
 *
 * Everything displayed here is derived from the Classic tables by
 * `playerCharacterAtLevel` — the profile only stores a name, a class, a level
 * and an experience count, never a health or mana value.
 *
 * Name and class are editable from the same panel. Class is a real, if
 * narrow, choice: switching stashes the class being left at its current level
 * and experience, and restores whatever was stashed for the class being
 * entered — level 1, first time. Editing never touches the render budget:
 * this component runs before any fight exists, on a profile that changes at
 * most once per fight (see `render-budget`).
 */

import { memo, useCallback, useId, useState } from 'react';
import { CharacterAvatar } from './CharacterAvatar';
import {
  CLASS_LABELS,
  MAX_LEVEL,
  PLAYABLE_CLASSES,
  PLAYER_NAME_MAX_LENGTH,
  playerCharacterAtLevel,
  type PlayableClassId,
} from '../config/gameConfig';
import { xpProgress, type PlayerProfile } from '../profile/playerProfile';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

interface CharacterSheetProps {
  profile: PlayerProfile;
  onRenameCharacter: (name: string) => void;
  onSwitchClass: (classId: PlayableClassId) => void;
}

export const CharacterSheet = memo(function CharacterSheet({
  profile,
  onRenameCharacter,
  onSwitchClass,
}: CharacterSheetProps) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftClass, setDraftClass] = useState<PlayableClassId>(profile.classId);
  const [confirmingClassChange, setConfirmingClassChange] = useState(false);

  const character = playerCharacterAtLevel(profile.level, {
    name: profile.name,
    classId: profile.classId,
  });
  const progress = xpProgress(profile);
  const nextSpell = character.spellsLocked[0];
  const classChanged = draftClass !== profile.classId;

  const openEdit = useCallback(() => {
    setDraftName(profile.name);
    setDraftClass(profile.classId);
    setConfirmingClassChange(false);
    setEditing(true);
  }, [profile.name, profile.classId]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setConfirmingClassChange(false);
  }, []);

  const pickClass = useCallback(
    (classId: PlayableClassId) => {
      setDraftClass(classId);
      setConfirmingClassChange(false);
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (classChanged && !confirmingClassChange) {
      // A class switch restarts progress at level 1 (the previous class's
      // progress is kept, see the module doc) — the same arm-then-confirm
      // pattern `OptionsMenu` uses for its own consequential action.
      setConfirmingClassChange(true);
      return;
    }
    if (draftName.trim() !== profile.name) {
      onRenameCharacter(draftName);
    }
    if (classChanged) {
      onSwitchClass(draftClass);
    }
    setEditing(false);
    setConfirmingClassChange(false);
  }, [
    classChanged,
    confirmingClassChange,
    draftClass,
    draftName,
    onRenameCharacter,
    onSwitchClass,
    profile.name,
  ]);

  return (
    <section className="sheet" aria-labelledby={titleId}>
      <div className="sheet__row">
        <CharacterAvatar classId={profile.classId} size={48} className="sheet__avatar" />

        <header className="sheet__header">
          <h2 className="sheet__title" id={titleId}>
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

        <div className="sheet__actions">
          <button
            type="button"
            className="sheet__icon-button"
            aria-label={editing ? 'Close character editor' : 'Edit name and class'}
            aria-pressed={editing}
            onClick={editing ? cancelEdit : openEdit}
          >
            {editing ? '✕' : '✎'}
          </button>
          <button
            type="button"
            className="sheet__icon-button"
            aria-label={expanded ? 'Show fewer stats' : 'Show all stats'}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

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

      {editing ? (
        <div className="sheet__edit">
          <label className="sheet__edit-label" htmlFor={`${titleId}-name`}>
            Name
          </label>
          <input
            id={`${titleId}-name`}
            className="sheet__edit-input"
            type="text"
            value={draftName}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            onChange={(event) => setDraftName(event.target.value)}
          />

          <span className="sheet__edit-label">Class</span>
          <div className="sheet__class-picker" role="group" aria-label="Class">
            {PLAYABLE_CLASSES.map((classId) => {
              const stashed = profile.otherClassProgress[classId];
              const isActive = classId === profile.classId;
              return (
                <button
                  key={classId}
                  type="button"
                  className="sheet__class-option"
                  aria-pressed={draftClass === classId}
                  onClick={() => pickClass(classId)}
                >
                  <CharacterAvatar classId={classId} size={32} />
                  <span className="sheet__class-name">{CLASS_LABELS[classId]}</span>
                  <span className="sheet__class-hint">
                    {isActive ? `Lv. ${profile.level}` : stashed ? `Lv. ${stashed.level}` : 'New'}
                  </span>
                </button>
              );
            })}
          </div>

          {classChanged ? (
            <p className="sheet__edit-warning" role="alert">
              {profile.otherClassProgress[draftClass]
                ? `Switching restarts play at level ${profile.otherClassProgress[draftClass]!.level}, where your ${CLASS_LABELS[draftClass]} left off.`
                : `Switching restarts at level 1. Your ${CLASS_LABELS[profile.classId]} progress (level ${profile.level}) is kept for when you come back.`}
            </p>
          ) : null}

          <div className="sheet__edit-buttons">
            <button
              type="button"
              className={`sheet__save${confirmingClassChange ? ' sheet__save--confirming' : ''}`}
              onClick={handleSave}
            >
              {confirmingClassChange ? `Confirm — switch to ${CLASS_LABELS[draftClass]}` : 'Save'}
            </button>
            <button type="button" className="sheet__cancel" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <>
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
        </>
      ) : null}
    </section>
  );
});
