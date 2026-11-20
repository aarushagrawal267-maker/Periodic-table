import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { todayKey } from '../../lib/daily';
import { ELEMENTS } from '../../lib/elements';
import { deleteAccount, signOutAndReset } from '../../lib/account';
import { levelFromXp, titleForLevel } from '../../lib/scoring';
import type { AccountUser, SyncStatus } from '../../store/auth';
import { liveStreak, masteredCount, useProgress } from '../../store/progress';
import { ConfirmBlock } from './ConfirmBlock';
import { Field } from './Field';
import { ReauthBlock } from './ReauthBlock';
import { SyncStatusLine } from './SyncStatusLine';

type Step = 'idle' | 'sign-out' | 'unsaved' | 'delete' | 'delete-offline' | 'reauth';

/** The word typed to confirm a delete. Lower case, so phones do not need the shift key. */
const DELETE_WORD = 'delete';

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The signed-in part of the account screen below the name (docs/ACCOUNTS.md 7.2): what the account holds with
 * the sync status as its caption, sign out with its confirmation, and the delete flow in a quiet danger zone.
 */
export function AccountPanel({ user, sync }: { user: AccountUser; sync: SyncStatus }) {
  const [step, setStep] = useState<Step>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const signOutRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  /** Where focus goes once the next step has rendered. */
  const focusNext = useRef<RefObject<HTMLElement | null> | null>(null);

  useEffect(() => {
    focusNext.current?.current?.focus();
    focusNext.current = null;
  }, [step]);

  const open = (next: Step) => {
    setError(null);
    if (next === 'delete') {
      setTyped('');
      focusNext.current = typedRef;
    }
    setStep(next);
  };
  /** Back to the actions, with focus on the button that opened the step. */
  const close = (back: RefObject<HTMLButtonElement | null>) => {
    setError(null);
    setBusy(false);
    focusNext.current = back;
    setStep('idle');
  };

  const signOut = async (force = false) => {
    setBusy(true);
    setError(null);
    const r = await signOutAndReset({ force });
    if (r.ok) return; // The screen switches to the guest state.
    setBusy(false);
    if (r.reason === 'unsaved') setStep('unsaved');
    else setError(r.message);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const r = await deleteAccount();
    if (r.ok) return;
    setBusy(false);
    if (r.reason === 'reauth') {
      if (step === 'reauth') setError('For your security, sign in again to continue');
      else setStep('reauth');
    } else if (r.reason === 'offline') setStep('delete-offline');
    else setError(r.message ?? 'Something went wrong. Try again.');
  };

  const deleting = step === 'delete' || step === 'delete-offline' || step === 'reauth';

  return (
    <>
      <section aria-label="Saved in your account" className="card mt-6 p-5 sm:p-6">
        <SavedFigures />
        <div className="mt-5">
          <SyncStatusLine status={sync} />
        </div>
      </section>

      <section aria-label="Sign out" className="mt-8">
        {step === 'sign-out' ? (
          <ConfirmBlock
            key="sign-out"
            title="Sign out on this device?"
            body={<p>Your progress stays in your account. This device goes back to a fresh start, so the next person to use it starts from zero.</p>}
            confirmLabel="Sign out"
            tone="primary"
            busy={busy}
            busyLabel="Saving, then signing out"
            error={error}
            onConfirm={() => void signOut()}
            onCancel={() => close(signOutRef)}
          />
        ) : step === 'unsaved' ? (
          <ConfirmBlock
            key="unsaved"
            title="You are offline"
            body={<p>Progress from this device since you went offline is not in your account yet. If you sign out now, it is lost.</p>}
            cancelLabel="Stay signed in"
            cancelTone="primary"
            confirmLabel="Sign out anyway"
            tone="danger"
            busy={busy}
            busyLabel="Signing out"
            error={error}
            onConfirm={() => void signOut(true)}
            onCancel={() => close(signOutRef)}
          />
        ) : (
          <button ref={signOutRef} type="button" className="btn btn-secondary w-full sm:w-auto" disabled={deleting} onClick={() => open('sign-out')}>
            Sign out
          </button>
        )}
      </section>

      <section aria-label="Delete account" className="mt-12 border-t border-line pt-6">
        {step === 'delete' ? (
          <div>
            <ConfirmBlock
              title="Delete your account?"
              body={<p>This deletes your account and everything saved in it: XP, streaks, mastered elements, badges and settings, on every device. It cannot be undone.</p>}
              confirmLabel="Delete account"
              tone="danger"
              busy={busy}
              busyLabel="Deleting"
              error={error}
              focusCancel={false}
              confirmDisabled={typed.trim().toLowerCase() !== DELETE_WORD}
              onConfirm={() => void remove()}
              onCancel={() => close(deleteRef)}
            >
              <Field
                id="delete-confirm"
                label={`Type ${DELETE_WORD} to confirm`}
                type="text"
                autoComplete="off"
                value={typed}
                onChange={setTyped}
                disabled={busy}
                inputRef={typedRef}
              />
            </ConfirmBlock>
          </div>
        ) : step === 'delete-offline' ? (
          <div>
            <ConfirmBlock
              title="You are offline"
              body={<p>Connect to the internet to delete your account.</p>}
              cancelLabel="Close"
              confirmLabel="Try again"
              tone="danger"
              busy={busy}
              busyLabel="Deleting"
              onConfirm={() => void remove()}
              onCancel={() => close(deleteRef)}
            />
          </div>
        ) : step === 'reauth' ? (
          <div>
            <ReauthBlock user={user} error={error} onDone={remove} onCancel={() => close(deleteRef)} />
          </div>
        ) : (
          <>
            <p className="text-sm leading-5 text-ink-2">Deleting your account removes it and its saved progress from every device</p>
            <p className="mt-1 text-sm leading-5 text-ink-3">Your name and email are kept by Google Firebase, which runs sign in</p>
            <button ref={deleteRef} type="button" className="btn btn-quiet -ml-4 mt-2 text-bad hover:text-bad" disabled={step !== 'idle'} onClick={() => open('delete')}>
              Delete account…
            </button>
          </>
        )}
      </section>
    </>
  );
}

/** What the account holds, in the Progress screen's figures: level, XP, mastered elements and the daily streak. */
function SavedFigures() {
  const xp = useProgress((p) => p.xp);
  const mastered = useProgress((p) => masteredCount(p.mastery));
  const streak = useProgress((p) => liveStreak(p.daily, todayKey()));
  const level = levelFromXp(xp).level;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      <Figure label="Level" value={fmt(level)} unit={titleForLevel(level)} />
      <Figure label="XP" value={fmt(xp)} />
      <Figure label="Mastered" value={fmt(mastered)} unit={`of ${ELEMENTS.length}`} />
      <Figure label="Streak" value={fmt(streak)} unit={streak === 1 ? 'day' : 'days'} />
    </dl>
  );
}

function Figure({ label, value, unit }: { label: string; value: string; unit?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="num text-2xl font-medium leading-8">{value}</span>
        {unit && <span className="text-sm text-ink-2">{unit}</span>}
      </dd>
    </div>
  );
}
