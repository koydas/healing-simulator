/**
 * Home screen: character sheet, overall record, enemy selection — each card
 * showing the record against that boss — and the options dialog.
 *
 * Rendered instead of the fight (no `GameStoreContext` yet, no engine state):
 * `App` only creates a store once an enemy is chosen. Everything here is
 * driven by the saved profile, which changes at most once per fight — plain
 * props and React state are the right tool, the store's snapshot machinery is
 * for the 10 Hz fight screen.
 */

import { memo, useCallback, useState } from 'react';
import { BossRecords } from './BossRecords';
import { CharacterSheet } from './CharacterSheet';
import { EnemySelect } from './EnemySelect';
import { OptionsMenu } from './OptionsMenu';
import type { PlayerProfile } from '../profile/playerProfile';
import type { EnemyId } from '../simulation/types';

interface HomeScreenProps {
  profile: PlayerProfile;
  onSelect: (enemyId: EnemyId) => void;
  onResetProfile: () => void;
}

export const HomeScreen = memo(function HomeScreen({
  profile,
  onSelect,
  onResetProfile,
}: HomeScreenProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);

  return (
    <div className="home">
      {/* The dialog is a direct sibling of this panel: `OptionsMenu` marks its
          siblings `inert`, which only works if the rest of the screen sits
          next to it rather than around it. */}
      <div className="home__panel">
        <header className="home__header">
          <h1 className="home__title">Healing Simulator</h1>
          <button
            type="button"
            className="home__options-button"
            aria-haspopup="dialog"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen(true)}
          >
            Options
          </button>
        </header>

        <CharacterSheet profile={profile} />
        <BossRecords profile={profile} />
        <EnemySelect records={profile.records} onSelect={onSelect} />
      </div>

      {optionsOpen ? (
        <OptionsMenu onClose={closeOptions} onResetProfile={onResetProfile} />
      ) : null}
    </div>
  );
});
