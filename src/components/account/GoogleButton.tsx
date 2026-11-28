/**
 * "Continue with Google", following Google's sign-in branding for dark themes (docs/ACCOUNTS.md 7.3).
 * The fill, border, text colours and the four-colour mark are the one sanctioned exception to the single
 * accent: a third party's mark that must stay recognisable. They live here, not in index.css.
 */

/** The standard multicolour G, unaltered, on a transparent background. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false" className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

export function GoogleButton({
  onClick,
  busy = false,
  disabled = false,
  children = 'Continue with Google',
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children?: 'Continue with Google';
}) {
  const off = disabled || busy;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-busy={busy || undefined}
      // Roboto is not bundled: Android uses its system copy, elsewhere the interface face stands in.
      style={{ fontFamily: 'Roboto, var(--font-sans)' }}
      className={[
        'flex h-11 w-full items-center justify-center gap-[10px] rounded-control border px-3',
        'text-[15px] font-medium leading-5',
        'transition-[background-color,border-color,color,transform] duration-150 ease-out',
        off
          ? 'cursor-not-allowed border-[#8E918F1F] bg-[#13131461] text-[#E3E3E361] light:border-[#1F1F1F1F] light:bg-[#FFFFFF61] light:text-[#1F1F1F61]'
          : // Google's own button colours: the dark variant in the dark theme, the light variant (white, #747775 edge) in the light theme.
            'border-[#8E918F] bg-[#131314] text-[#E3E3E3] hover:bg-[color-mix(in_srgb,#131314_92%,#fff)] light:border-[#747775] light:bg-white light:text-[#1F1F1F] light:hover:bg-[color-mix(in_srgb,#fff_92%,#1F1F1F)] active:scale-[0.98]',
      ].join(' ')}
    >
      <span className={off ? 'opacity-[0.38]' : undefined}>
        <GoogleMark />
      </span>
      <span>{children}</span>
    </button>
  );
}
