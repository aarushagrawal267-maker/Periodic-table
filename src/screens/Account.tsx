import { X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { AccountPanel } from '../components/account/AccountPanel';
import { Initials } from '../components/account/AccountEntry';
import { AuthPanel } from '../components/account/AuthForms';
import { ConfirmBlock } from '../components/account/ConfirmBlock';
import { FormError } from '../components/account/FormError';
import { GoogleButton } from '../components/account/GoogleButton';
import { Switch } from '../components/Switch';
import { AccountOff } from './AccountOff';
import { clearThisDevice, defaultShared, dismissNotice, prepareAccounts, refreshUser, resendVerification, signInWithGoogle } from '../lib/account';
import { useAuth, type Notice } from '../store/auth';
import { masteredCount, useProgress } from '../store/progress';

const NOTICES: Record<Exclude<Notice, null>, string> = {
  'signed-out': 'Signed out. This device has a fresh start.',
  deleted: 'Your account is deleted. This device has a fresh start.',
  'deleted-elsewhere': 'This account was deleted on another device. This device has a fresh start.',
  'session-ended': 'You were signed out on this device. Your progress is in your account, and this device has a fresh start.',
  'session-ended-unsaved': 'You were signed out on this device before your latest progress was saved. Sign in to the same account to save it.',
  'shared-idle': 'Signed out after 30 minutes without use, because this is a shared computer. This device has a fresh start.',
  cleared: 'This device has a fresh start.',
  'redirect-failed': 'Google sign in did not finish in this browser. Try again and it opens in a new window.',
};

/** Notices after which this device has nobody's account: a new student is as likely as a returning one. */
const FRESH_NOTICES = new Set<Notice>(['deleted', 'deleted-elsewhere', 'cleared']);

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The account screen (docs/ACCOUNTS.md 7). One 480px column on the page's left edge, where every screen's title sits.
 * States: finishing a Google sign in, signed out (Google, then email), signed in. A build without accounts loads
 * AccountOff instead (App.tsx); it also stands in here should the status ever read unconfigured.
 */
export function Account() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const sync = useAuth((s) => s.sync);
  const shared = useAuth((s) => s.shared);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const lastStatus = useRef(status);

  // Load the SDK and attach the listener as soon as the screen opens, so the Google popup can open
  // inside the click. Coming back online retries a load that failed.
  useEffect(() => {
    if (status === 'unconfigured') return;
    void prepareAccounts();
    const retry = () => {
      if (useAuth.getState().sdkOffline) void prepareAccounts();
    };
    window.addEventListener('online', retry);
    // A verification link opened in another tab or on the phone: pick it up when the student comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useAuth.getState().user?.verified === false) void refreshUser();
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Once per visit; the status only matters for the unconfigured build, where it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After signing in or out the whole screen changes: move focus to the notice ("Signed out. …") or the
  // new heading, so it is read out and the next Tab starts from the top of the new content.
  useEffect(() => {
    if (status === lastStatus.current) return;
    lastStatus.current = status;
    (noticeRef.current ?? headingRef.current)?.focus();
  }, [status]);

  // A notice can land just after the switch to the guest screen (sign out finishes its clean-up first).
  // If focus is still at the top of the screen, move it to the notice so it is read out.
  const notice = useAuth((s) => s.notice);
  useEffect(() => {
    if (!notice || !noticeRef.current) return;
    const a = document.activeElement;
    if (a === headingRef.current || a === document.body || a === null) noticeRef.current.focus();
  }, [notice]);

  if (status === 'unconfigured') return <AccountOff />;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="max-w-120">
        {status === 'loading' ? (
          <Finishing headingRef={headingRef} />
        ) : status === 'signed-in' && user ? (
          <>
            <div className="flex items-center gap-4">
              <Initials initials={user.initials} size={48} />
              <div className="min-w-0">
                <h1 ref={headingRef} tabIndex={-1} className="t-title break-words">
                  {user.name}
                </h1>
              </div>
            </div>
            {/* The email whole on its own line; the method below it in segments that never break inside. */}
            <div className="mt-3 text-sm leading-5 text-ink-2">
              {user.email && <p className="break-all">{user.email}</p>}
              <p>
                <span className="whitespace-nowrap">{user.provider === 'google' ? 'Google sign-in' : 'Email sign-in'}</span>
                {shared && (
                  <>
                    {' '}
                    <span className="whitespace-nowrap">· Shared computer</span>
                  </>
                )}
              </p>
            </div>
            {!user.verified && <VerifyEmail />}
            <AccountPanel user={user} sync={sync} />
          </>
        ) : (
          <Guest headingRef={headingRef} noticeRef={noticeRef} />
        )}
      </div>
    </div>
  );
}

type HeadingRef = { headingRef: RefObject<HTMLHeadingElement | null> };

function Finishing({ headingRef }: HeadingRef) {
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="t-title">
        Finishing sign in
      </h1>
      <div aria-busy="true" className="card mt-6 p-6">
        <p className="text-[15px] leading-6 text-ink-2">Checking your Google account</p>
      </div>
    </>
  );
}

/** An email account whose address is not confirmed yet (docs/ACCOUNTS.md 5.6.10). */
function VerifyEmail() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setState('busy');
    setError(null);
    const r = await resendVerification();
    setState(r.ok ? 'sent' : 'idle');
    if (!r.ok) setError(r.message);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <p role="status" className="min-w-0 flex-1 basis-60 text-sm leading-5 text-ink-2">
        {state === 'sent' ? 'Sent. Open the link in the email to confirm your address' : 'Check your inbox for a link to confirm your email address'}
      </p>
      {state !== 'sent' && (
        <button type="button" className="btn btn-quiet btn-sm -ml-3 max-md:h-11" disabled={state === 'busy'} aria-busy={state === 'busy' || undefined} onClick={() => void send()}>
          {state === 'busy' ? 'Sending' : 'Send again'}
        </button>
      )}
      <FormError message={error} className="w-full" />
    </div>
  );
}

function Guest({ headingRef, noticeRef }: HeadingRef & { noticeRef: RefObject<HTMLDivElement | null> }) {
  const notice = useAuth((s) => s.notice);
  const ready = useAuth((s) => s.ready);
  const sdkOffline = useAuth((s) => s.sdkOffline);
  const storeError = useAuth((s) => s.error);
  const leftover = useAuth((s) => s.leftover);
  const xp = useProgress((p) => p.xp);
  const mastered = useProgress((p) => masteredCount(p.mastery));
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [shared, setShared] = useState(defaultShared);
  // Fixed for this visit, so the form does not jump to Sign in when the first XP lands. A notice that the student
  // was just signed out (or that their progress waits for their account) means they have one: Sign in, too.
  const [startMode] = useState<'sign-in' | 'sign-up'>(() => (xp > 0 || (notice && !FRESH_NOTICES.has(notice)) ? 'sign-in' : 'sign-up'));

  const hasProgress = xp > 0;
  const backgroundError = storeError && storeError.code.startsWith('auth/') ? storeError.message : null;

  const google = async () => {
    setGoogleError(null);
    setGoogleBusy(true);
    const r = await signInWithGoogle({ shared });
    setGoogleBusy(false);
    if (!r.ok) setGoogleError(r.message);
  };

  return (
    <>
      {notice && (
        <div ref={noticeRef} tabIndex={-1} role="status" className="card mb-6 flex items-center gap-3 py-2 pl-4 pr-2 outline-none">
          <p className="flex-1 py-2 text-sm leading-5 text-ink">{NOTICES[notice]}</p>
          <button type="button" className="icon-btn" aria-label="Dismiss"
            onClick={() => {
              dismissNotice();
              headingRef.current?.focus();
            }}
          >
            <X size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}

      <h1 ref={headingRef} tabIndex={-1} className="t-title">
        Sign in to save your progress
      </h1>
      {sdkOffline ? (
        <p className="mt-3 text-[15px] leading-6 text-ink-2">You are offline. Connect to the internet to sign in or create an account.</p>
      ) : (
        <p className="mt-3 text-[15px] leading-6 text-ink-2">
          Save your XP, streak and mastered elements and carry on from any device. You can also keep playing without an account.
        </p>
      )}

      {leftover ? (
        <Leftover xp={xp} mastered={mastered} />
      ) : (
        hasProgress && (
          <p className="mt-4 text-sm leading-5 text-ink-2">
            The progress on this device (<span className="mono text-ink">{fmt(xp)}</span> XP, <span className="mono text-ink">{fmt(mastered)}</span> mastered) moves into your account when you sign in.
          </p>
        )
      )}

      <div className="card mt-8 p-5 sm:p-6">
        <AuthPanel
          initialMode={startMode}
          disabled={sdkOffline}
          shared={shared}
          below={
            // A rare setting, so the last row: Google is the first thing in the card. Its value goes to every way in.
            <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 border-t border-line pt-5">
              <span>
                <span className="block text-[15px] leading-5 text-ink">Shared computer</span>
                <span className="block text-[13px] leading-5 text-ink-2">Signs out when the browser closes or after 30 idle minutes</span>
              </span>
              <Switch on={shared} onChange={setShared} label="Shared computer" />
            </label>
          }
          above={
            <>
              <GoogleButton onClick={() => void google()} busy={googleBusy} disabled={!ready || sdkOffline} />
              <FormError message={googleError ?? backgroundError} className="mt-3" />
              <div className="my-6 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line-strong" />
                <span className="label">or</span>
                <span className="h-px flex-1 bg-line-strong" />
              </div>
            </>
          }
        />
      </div>
    </>
  );
}

/**
 * The device holds progress from an account whose session ended before it was saved (`leftover`). It can only
 * go back to that account; the next person can clear it.
 */
function Leftover({ xp, mastered }: { xp: number; mastered: number }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const clear = async () => {
    setBusy(true);
    await clearThisDevice();
  };
  return (
    <div className="mt-4">
      <p className="text-sm leading-5 text-ink-2">
        This device has progress (<span className="mono text-ink">{fmt(xp)}</span> XP, <span className="mono text-ink">{fmt(mastered)}</span> mastered) from an
        account that was signed out before it was saved. Sign in to that account to save it. Signing in to a different account clears it.
      </p>
      {confirming ? (
        <div className="mt-4">
          <ConfirmBlock
            title="Clear this device?"
            body={<p>The progress on this device is removed for good. Anything already saved in the account stays there.</p>}
            confirmLabel="Clear this device"
            tone="danger"
            busy={busy}
            busyLabel="Clearing"
            onConfirm={() => void clear()}
            onCancel={() => {
              setConfirming(false);
              requestAnimationFrame(() => openRef.current?.focus());
            }}
          />
        </div>
      ) : (
        <button ref={openRef} type="button" className="btn btn-quiet -ml-4 mt-2" onClick={() => setConfirming(true)}>
          Clear this device
        </button>
      )}
    </div>
  );
}
