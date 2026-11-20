import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { sendReset, signInWithEmail, signUpWithEmail, validateForm, type AuthResult, type FieldErrors, type FormField } from '../../lib/account';
import { Field } from './Field';
import { FormError } from './FormError';

type Mode = 'sign-in' | 'sign-up' | 'reset';
type EmailMode = Exclude<Mode, 'reset'>;

const MODES: { id: EmailMode; label: string }[] = [
  { id: 'sign-in', label: 'Sign in' },
  { id: 'sign-up', label: 'Create account' },
];

/** Firebase codes that belong to one field rather than to the whole form. */
const FIELD_OF_CODE: Record<string, FormField> = {
  'auth/invalid-email': 'email',
  'auth/missing-email': 'email',
  'auth/missing-password': 'password',
  'auth/weak-password': 'password',
  'auth/password-does-not-meet-requirements': 'password',
};

/**
 * Shared submit logic: validate first (no network call with bad input), focus the first invalid field,
 * then run the action and place its error under a field or above the button.
 */
function useSubmit(refs: Partial<Record<FormField, RefObject<HTMLInputElement | null>>>) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const focusFirst = (fields: FieldErrors) => {
    const first = (['name', 'email', 'password'] as FormField[]).find((f) => fields[f]);
    if (first) refs[first]?.current?.focus();
  };

  const run = async (local: FieldErrors, action: () => Promise<AuthResult>, onOk?: () => void) => {
    if (busy) return;
    setFormError(null);
    if (Object.keys(local).length) {
      setErrors(local);
      focusFirst(local);
      return;
    }
    setErrors({});
    setBusy(true);
    const r = await action();
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      onOk?.();
      return;
    }
    if (r.fields) {
      setErrors(r.fields);
      focusFirst(r.fields);
      return;
    }
    const field = FIELD_OF_CODE[r.code];
    if (field && r.message && refs[field]) {
      const next = { [field]: r.message };
      setErrors(next);
      focusFirst(next);
      return;
    }
    setFormError(r.message);
  };

  /** Typing in a field clears its own error and the form error. */
  const clear = (f: FormField) => {
    setFormError(null);
    setErrors((e) => {
      if (!e[f]) return e;
      const next = { ...e };
      delete next[f];
      return next;
    });
  };

  return { errors, formError, busy, run, clear };
}

/**
 * Email sign in, account creation and password reset (docs/ACCOUNTS.md 7.4). The seg control switches
 * between Sign in and Create account; "Forgot password" swaps both for the reset form. The email is
 * shared, so it carries over between the three. `above` (the Google button) and `below` (the shared-computer
 * switch) show except on the reset form.
 */
export function AuthPanel({
  initialMode = 'sign-in',
  above,
  below,
  disabled = false,
  shared,
}: {
  initialMode?: Mode;
  above?: ReactNode;
  below?: ReactNode;
  disabled?: boolean;
  /** The shared-computer choice for the sign-in (undefined: the default for this device). */
  shared?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const tabRefs = useRef<Record<EmailMode, HTMLButtonElement | null>>({ 'sign-in': null, 'sign-up': null });
  const backFromReset = useRef(false);

  useEffect(() => {
    if (mode !== 'reset' && backFromReset.current) {
      backFromReset.current = false;
      tabRefs.current[mode]?.focus();
    }
  }, [mode]);

  if (mode === 'reset')
    return (
      <ResetForm
        initialEmail={email}
        onEmail={setEmail}
        disabled={disabled}
        onBack={() => {
          backFromReset.current = true;
          setMode('sign-in');
        }}
      />
    );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    let to: EmailMode | null = null;
    if (step) to = MODES[(MODES.findIndex((m) => m.id === mode) + step + MODES.length) % MODES.length].id;
    else if (e.key === 'Home') to = MODES[0].id;
    else if (e.key === 'End') to = MODES[MODES.length - 1].id;
    if (!to) return;
    e.preventDefault();
    setMode(to);
    tabRefs.current[to]?.focus();
  };

  return (
    <div>
      {above}
      <div role="tablist" aria-label="Sign in with email" className="seg grid w-full grid-cols-2" onKeyDown={onKeyDown}>
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              ref={(el) => {
                tabRefs.current[m.id] = el;
              }}
              type="button"
              role="tab"
              id={`auth-tab-${m.id}`}
              aria-selected={on}
              aria-controls="auth-tabpanel"
              tabIndex={on ? 0 : -1}
              // One line down to 320px wide: "Create account" must not wrap.
              className="seg-item whitespace-nowrap px-2"
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="auth-tabpanel" aria-labelledby={`auth-tab-${mode}`} className="mt-6">
        {mode === 'sign-in' ? (
          <SignInForm
            email={email}
            onEmail={setEmail}
            disabled={disabled}
            shared={shared}
            onForgot={(value) => {
              setEmail(value);
              setMode('reset');
            }}
          />
        ) : (
          <SignUpForm email={email} onEmail={setEmail} disabled={disabled} shared={shared} />
        )}
      </div>
      {below}
    </div>
  );
}

export function SignInForm({
  onForgot,
  email,
  onEmail,
  disabled = false,
  shared,
}: {
  onForgot: (email: string) => void;
  email: string;
  onEmail: (v: string) => void;
  disabled?: boolean;
  shared?: boolean;
}) {
  const [password, setPassword] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { errors, formError, busy, run, clear } = useSubmit({ email: emailRef, password: passwordRef });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(validateForm({ email, password }, false), () => signInWithEmail(email, password, { shared }));
  };

  return (
    <form noValidate onSubmit={submit} aria-label="Sign in" className="grid gap-5">
      <Field
        id="signin-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(v) => {
          onEmail(v);
          clear('email');
        }}
        error={errors.email}
        disabled={disabled}
        inputRef={emailRef}
      />
      <Field
        id="signin-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(v) => {
          setPassword(v);
          clear('password');
        }}
        error={errors.password}
        disabled={disabled}
        inputRef={passwordRef}
      />
      <div>
        <FormError message={formError} className="mb-4" />
        <button type="submit" className="btn btn-primary w-full" disabled={disabled || busy} aria-busy={busy || undefined}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
        <div className="mt-3 text-center">
          <button type="button" className="btn btn-quiet" disabled={disabled} onClick={() => onForgot(email)}>
            Forgot password
          </button>
        </div>
      </div>
    </form>
  );
}

export function SignUpForm({
  email,
  onEmail,
  disabled = false,
  shared,
}: {
  email: string;
  onEmail: (v: string) => void;
  disabled?: boolean;
  shared?: boolean;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { errors, formError, busy, run, clear } = useSubmit({ name: nameRef, email: emailRef, password: passwordRef });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(validateForm({ name, email, password }, true), () => signUpWithEmail(name, email, password, { shared }));
  };

  return (
    <form noValidate onSubmit={submit} aria-label="Create account" className="grid gap-5">
      <Field
        id="signup-name"
        label="Name"
        type="text"
        autoComplete="nickname"
        hint="First name or a nickname"
        value={name}
        onChange={(v) => {
          setName(v);
          clear('name');
        }}
        error={errors.name}
        disabled={disabled}
        inputRef={nameRef}
      />
      <Field
        id="signup-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(v) => {
          onEmail(v);
          clear('email');
        }}
        error={errors.email}
        disabled={disabled}
        inputRef={emailRef}
      />
      <Field
        id="signup-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        value={password}
        onChange={(v) => {
          setPassword(v);
          clear('password');
        }}
        error={errors.password}
        disabled={disabled}
        inputRef={passwordRef}
      />
      <div>
        <FormError message={formError} className="mb-4" />
        <button type="submit" className="btn btn-primary w-full" disabled={disabled || busy} aria-busy={busy || undefined}>
          {busy ? 'Creating account' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

export function ResetForm({
  initialEmail,
  onBack,
  onEmail,
  disabled = false,
}: {
  initialEmail: string;
  onBack: () => void;
  onEmail?: (v: string) => void;
  disabled?: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const { errors, formError, busy, run, clear } = useSubmit({ email: emailRef });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (sentTo) doneRef.current?.focus();
  }, [sentTo]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    void run(
      validateForm({ email }, false),
      () => sendReset(email),
      () => setSentTo(value),
    );
  };

  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="t-heading">
        Reset your password
      </h2>
      {sentTo ? (
        <div className="mt-2">
          <p ref={doneRef} tabIndex={-1} className="text-[15px] leading-6 text-ink-2 outline-none">
            If an account uses <span className="break-all text-ink">{sentTo}</span>, a reset link is on its way. Check your inbox and spam folder.
          </p>
          <button type="button" className="btn btn-quiet -ml-4 mt-4" onClick={onBack}>
            Back to sign in
          </button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[15px] leading-6 text-ink-2">Enter the email you use for Periodica and we will send a link to choose a new password.</p>
          <form noValidate onSubmit={submit} aria-label="Reset your password" className="mt-6 grid gap-5">
            <Field
              id="reset-email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                onEmail?.(v);
                clear('email');
              }}
              error={errors.email}
              disabled={disabled}
              inputRef={emailRef}
            />
            <div>
              <FormError message={formError} className="mb-4" />
              <button type="submit" className="btn btn-primary w-full" disabled={disabled || busy} aria-busy={busy || undefined}>
                {busy ? 'Sending' : 'Send reset link'}
              </button>
              <div className="mt-3 text-center">
                <button type="button" className="btn btn-quiet" onClick={onBack}>
                  Back to sign in
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
