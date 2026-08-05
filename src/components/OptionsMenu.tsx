/**
 * Options dialog of the home screen — today it holds one destructive action:
 * deleting the saved game.
 *
 * It does the three things `role="dialog"` only claims: it takes focus into
 * the container, marks its siblings `inert` so the controls behind it leave
 * the tab order, and names itself through `aria-labelledby`. Same contract as
 * the end-of-fight dialog (see `docs/architecture.md`).
 */

import { memo, useEffect, useRef, useState } from 'react';
import { PROFILE_STORAGE_KEY } from '../profile/profileStorage';

interface OptionsMenuProps {
  onClose: () => void;
  /** Deletes the save and resets the character back to level 1. */
  onResetProfile: () => void;
}

export const OptionsMenu = memo(function OptionsMenu({
  onClose,
  onResetProfile,
}: OptionsMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const siblings = Array.from(dialog.parentElement?.children ?? []).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== dialog,
    );
    const alreadyInert = siblings.filter((child) => child.hasAttribute('inert'));
    siblings.forEach((child) => child.setAttribute('inert', ''));

    dialog.focus();

    return () => {
      // Leaking `inert` here would freeze the whole home screen, so it is
      // removed from exactly the siblings this dialog marked.
      siblings
        .filter((child) => !alreadyInert.includes(child))
        .forEach((child) => child.removeAttribute('inert'));
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onResetProfile();
    setConfirming(false);
    onClose();
  };

  return (
    <div
      className="options"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
      tabIndex={-1}
      ref={dialogRef}
    >
      <div className="options__panel">
        <h2 className="options__title" id="options-title">
          Options
        </h2>

        <p className="options__text">
          Your level, experience and record are saved in this browser only, under{' '}
          <code className="options__key">{PROFILE_STORAGE_KEY}</code>. Nothing is sent anywhere.
        </p>

        <button
          type="button"
          className={`options__delete${confirming ? ' options__delete--confirming' : ''}`}
          onClick={handleDelete}
        >
          {confirming ? 'Confirm: delete everything' : 'Delete saved game'}
        </button>
        {confirming ? (
          <p className="options__warning" role="alert">
            This resets the character to level 1 and clears every win and loss.
          </p>
        ) : null}

        <button type="button" className="options__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
});
