/**
 * A small cartoon bust for the character sheet, procedurally drawn from the
 * chosen class (ADR-0020) rather than an image file: no network request, no
 * bundled asset, consistent with "no remote asset, no CDN"
 * (`docs/architecture.md`). Silhouette and palette both vary — pointed ears
 * and a headband for the night elf hunter, round ears and a conical hat for
 * the gnome mage, round ears and a thin halo for the human priest — so the
 * three playable classes read apart from each other at a glance, even at the
 * 40 px the minimized sheet draws it at.
 */

import { memo } from 'react';
import type { PlayableClassId } from '../config/gameConfig';

interface CharacterAvatarProps {
  classId: PlayableClassId;
  /** Pixel size of the square avatar (width and height). */
  size?: number;
  className?: string;
}

interface AvatarPalette {
  skin: string;
  hair: string;
  robe: string;
  robeAccent: string;
  earShape: 'round' | 'pointed';
}

const PALETTES: Record<PlayableClassId, AvatarPalette> = {
  priest: {
    skin: '#f0c9a0',
    hair: '#e4d18a',
    robe: '#eae4d8',
    robeAccent: '#c9a84c',
    earShape: 'round',
  },
  mage: {
    skin: '#e7bd8e',
    hair: '#8a8a96',
    robe: '#3d5bd9',
    robeAccent: '#9db8ff',
    earShape: 'round',
  },
  hunter: {
    skin: '#b98cd9',
    hair: '#241a35',
    robe: '#3d7350',
    robeAccent: '#8fd6a4',
    earShape: 'pointed',
  },
};

export const CharacterAvatar = memo(function CharacterAvatar({
  classId,
  size = 48,
  className,
}: CharacterAvatarProps) {
  const palette = PALETTES[classId];

  const ears =
    palette.earShape === 'pointed' ? (
      <>
        <path d="M16 27 L7 17 L19 22 Z" fill={palette.skin} />
        <path d="M48 27 L57 17 L45 22 Z" fill={palette.skin} />
      </>
    ) : (
      <>
        <circle cx="15" cy="30" r="4" fill={palette.skin} />
        <circle cx="49" cy="30" r="4" fill={palette.skin} />
      </>
    );

  const accessory =
    classId === 'priest' ? (
      <ellipse
        cx="32"
        cy="10.5"
        rx="9"
        ry="2.4"
        fill="none"
        stroke={palette.robeAccent}
        strokeWidth="2"
      />
    ) : classId === 'mage' ? (
      <path d="M32 3 L45 20 L19 20 Z" fill={palette.robe} stroke={palette.robeAccent} strokeWidth="1.5" />
    ) : (
      <path
        d="M17 20 Q32 11 47 20 L44 25 Q32 18 20 25 Z"
        fill={palette.robeAccent}
      />
    );

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="31" fill="var(--bg-panel-alt)" stroke="var(--border-soft)" />
      {/* robe / shoulders */}
      <path d="M12 60 C12 44 20 38 32 38 C44 38 52 44 52 60 Z" fill={palette.robe} />
      <path
        d="M20 60 C21 48 26 43 32 43 C38 43 43 48 44 60 Z"
        fill={palette.robeAccent}
        opacity="0.5"
      />
      {ears}
      {/* head */}
      <circle cx="32" cy="27" r="14" fill={palette.skin} />
      {/* hair */}
      <path
        d="M18 24 C18 12 46 12 46 24 C46 18 40 15 32 15 C24 15 18 18 18 24 Z"
        fill={palette.hair}
      />
      {accessory}
      {/* face */}
      <circle cx="27" cy="28" r="1.6" fill="#241a1a" />
      <circle cx="37" cy="28" r="1.6" fill="#241a1a" />
      <path d="M27 34 Q32 37 37 34" stroke="#241a1a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
});
