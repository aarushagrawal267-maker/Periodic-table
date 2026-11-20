import { useEffect, useRef, useState, type FormEvent } from 'react';
import { reauthenticate, validatePassword } from '../../lib/account';
import type { AccountUser } from '../../store/auth';
import { Field } from './Field';
import { FormError } from './FormError';
import { GoogleButton } from './GoogleButton';

const WRONG_PASSWORD = new Set(['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials']);

/**
 * A fresh sign-in before deleting the account (docs/ACCOUNTS.md 7.2). Google users confirm in the Google
 * window; email users type their password. `onDone` then deletes, and may report an error back here.
 */
export function ReauthBlock({
  user,
  onDone,
  onCancel,
  error: outerError = null,
}: {
  user: AccountUser;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
  error?: string | null;
}) {
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const google = user.provider === 'google';

  useEffect(() => {
    if (google) titleRef.current?.focus();
    else passwordRef.current?.focus();
  }, [google]);

  const finish = async (run: () => ReturnType<typeof reauthenticate>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const r = await run();
    if (!r.ok) {
      setBusy(false);
      if (r.fields?.password) {
        setFieldError(r.fields.password);
        passwordRef.current?.focus();
      } else if (!google && WRONG_PASSWORD.has(r.code)) {
        // Only the password was typed here, so the error belongs under it.
        setFieldError('That password does not match your account. Check it and try again.');
        passwordRef.current?.focus();
      } else setError(r.message);
      return;
    }
    await onDone();
    setBusy(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const invalid = validatePassword(password, false);
    if (invalid) {
      setFieldError(invalid);
      passwordRef.current?.focus();
      return;
    }
    void finish(() => reauthenticate(password));
  };

  const shown = error ?? outerError;

  return (
    <section aria-labelledby="reauth-title" className="rounded-card border border-line-strong bg-surface p-5 sm:p-6">
      <h3 id="reauth-title" ref={titleRef} tabIndex={-1} className="text-base font-medium leading-6 text-ink outline-none">
        Confirm it is you
      </h3>
      <p className="mt-1 text-sm leading-5 text-ink-2">For your security, sign in again before deleting your account.</p>
      {google ? (
        <div className="mt-4">
          <FormError message={shown} className="mb-4" />
          <GoogleButton busy={busy} onClick={() => void finish(() => reauthenticate())} />
        </div>
      ) : (
        <form noValidate onSubmit={submit} aria-label="Confirm it is you" className="mt-4">
          <Field
            id="reauth-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setFieldError(null);
              setError(null);
            }}
            error={fieldError}
            inputRef={passwordRef}
            disabled={busy}
          />
          <FormError message={shown} className="mt-4" />
          <button type="submit" className="btn btn-danger mt-4 w-full" disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Deleting' : 'Confirm and delete'}
          </button>
        </form>
      )}
      <div className="mt-3 text-center">
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </section>
  );
}
