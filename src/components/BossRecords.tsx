/**
 * Overall win / loss record, read from the saved profile.
 *
 * The per-boss breakdown lives on the enemy cards themselves (`EnemySelect`),
 * where the player is already looking when they pick a fight; this section
 * only carries the total, which no single card can show.
 *
 * A fight is counted the instant it ends — a victory when the boss's health
 * reaches 0 first, a defeat on a wipe — so the totals here always match the
 * number of fights actually played out.
 */

import { memo } from 'react';
import { totalRecord, type PlayerProfile } from '../profile/playerProfile';

interface BossRecordsProps {
  profile: PlayerProfile;
}

export const BossRecords = memo(function BossRecords({ profile }: BossRecordsProps) {
  const total = totalRecord(profile);
  const fights = total.wins + total.losses;

  return (
    <section className="records" aria-labelledby="records-title">
      <h2 className="records__title" id="records-title">
        Record
      </h2>
      <p className="records__total">
        {fights === 0 ? (
          <span className="records__empty">No fight yet</span>
        ) : (
          <>
            <span className="records__wins">
              {total.wins}{' '}
              <span className="records__unit">{total.wins === 1 ? 'win' : 'wins'}</span>
            </span>
            <span className="records__losses">
              {total.losses}{' '}
              <span className="records__unit">{total.losses === 1 ? 'loss' : 'losses'}</span>
            </span>
          </>
        )}
      </p>
    </section>
  );
});
