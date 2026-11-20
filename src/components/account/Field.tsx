import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useState, type Ref } from 'react';

/**
 * A labelled text input for the account forms (docs/ACCOUNTS.md 2.9, 7.4). Label above, `.field` input,
 * then the hint or the error under it, linked with aria-describedby. Inputs are 16px so iOS does not zoom
 * on focus. Password fields get a show toggle inside the field, a 44px target on phones.
 */
export function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  inputMode,
  maxLength,
  disabled,
  inputRef,
}: {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
  error?: string | null;
  inputMode?: 'email';
  maxLength?: number;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const textLike = type === 'email' || isPassword;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium leading-5 text-ink">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          ref={inputRef}
          id={id}
          name={id}
          type={isPassword && shown ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoCapitalize={textLike ? 'none' : undefined}
          autoCorrect={textLike ? 'off' : undefined}
          spellCheck={textLike ? false : undefined}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`field text-base disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-transparent disabled:text-ink-3 ${isPassword ? 'pr-12' : ''} ${error ? 'border-bad hover:border-bad focus:border-accent' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            className="icon-btn absolute right-0 top-0 md:right-1 md:top-1"
            aria-label="Show password"
            aria-pressed={shown}
            aria-controls={id}
            disabled={disabled}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? <EyeOff size={18} strokeWidth={1.5} aria-hidden /> : <Eye size={18} strokeWidth={1.5} aria-hidden />}
          </button>
        )}
      </div>
      {error ? (
        <p id={errorId} className="mt-2 flex gap-2 text-sm leading-5 text-bad">
          <CircleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 text-sm leading-5 text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
