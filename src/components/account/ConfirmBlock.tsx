import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FormError } from './FormError';

/**
 * An inline confirmation that takes the place of the actions it confirms (docs/ACCOUNTS.md 7.2), here and for
 * "Reset progress…" in Settings. A labelled group: when it opens, focus goes to the safe choice
 * (cancel), and the group's title and body are read with it.
 */
export function ConfirmBlock({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  children,
  confirmDisabled = false,
  error,
  cancelTone = 'secondary',
  focusCancel = true,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone: 'primary' | 'danger';
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content between the body and the buttons, such as a typed confirmation. */
  children?: ReactNode;
  confirmDisabled?: boolean;
  error?: string | null;
  /** "Stay signed in" is the safe choice and the main one, so it can take the primary fill. */
  cancelTone?: 'secondary' | 'primary';
  /** Off when the block focuses something of its own, such as the typed confirmation field. */
  focusCancel?: boolean;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusCancel) cancelRef.current?.focus({ preventScroll: true });
    // The whole block in view, buttons included (in the Settings sheet it opens near the bottom edge).
    groupRef.current?.scrollIntoView({ block: 'nearest' });
    // Only when the block opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={groupRef} role="group" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`} className="rounded-card border border-line-strong bg-surface p-5 sm:p-6">
      <h3 id={`${id}-t`} className="text-base font-medium leading-6 text-ink">
        {title}
      </h3>
      <div id={`${id}-b`} className="mt-1 text-sm leading-5 text-ink-2">
        {body}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      <FormError message={error} className="mt-4" />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button ref={cancelRef} type="button" className={`btn ${cancelTone === 'primary' ? 'btn-primary' : 'btn-secondary'} sm:min-w-28`} onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn-danger disabled:bg-surface disabled:text-ink-3 disabled:shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'btn-primary'} sm:min-w-28`}
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          aria-busy={busy || undefined}
        >
          {busy && busyLabel ? busyLabel : confirmLabel}
        </button>
      </div>
    </section>
  );
}
