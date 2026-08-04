/**
 * Win / loss record against each boss, read from the saved profile.
 *
 * A fight is counted the instant it ends — a victory when the boss's health
 * reaches 0 first, a defeat on a wipe — so the totals here always match the
 * number of fights actually played out.
 */

import { memo } from 'react';
import { ENEMIES, ENEMY_ORDER } from '../config/gameConfig';
import { totalRecord, type PlayerProfile } from '../profile/playerProfile';

interface BossRecordsProps {
  profile: PlayerProfile;
}

export const BossRecords = memo(function BossRecords({ profile }: BossRecordsProps) {
  const total = totalRecord(profile);

  return (
    <section className="records" aria-labelledby="records-title">
      <h2 className="records__title" id="records-title">
        Record
      </h2>
      <table className="records__table">
        <thead>
          <tr>
            <th scope="col">Boss</th>
            <th scope="col">Wins</th>
            <th scope="col">Losses</th>
          </tr>
        </thead>
        <tbody>
          {ENEMY_ORDER.map((enemyId) => {
            const record = profile.records[enemyId];
            return (
              <tr key={enemyId}>
                <th scope="row">{ENEMIES[enemyId].name}</th>
                <td className="records__wins">{record.wins}</td>
                <td className="records__losses">{record.losses}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="records__wins">{total.wins}</td>
            <td className="records__losses">{total.losses}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
});
