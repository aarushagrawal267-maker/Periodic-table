import { useAuth } from '../../store/auth';

/** The circle avatar: the student's initials on the raised surface, no photo and no colour. */
export function Initials({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 select-none place-items-center rounded-full border border-line-strong bg-surface-2 font-medium leading-none text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}

/** What AccountEntry puts in the header: nothing (accounts off), "Sign in", or the avatar (also its placeholder). */
export function useAccountSlot(): 'none' | 'guest' | 'avatar' {
  return useAuth((s) => (s.status === 'unconfigured' ? 'none' : s.status === 'guest' ? 'guest' : 'avatar'));
}

/**
 * Header entry point (docs/ACCOUNTS.md 9, item 4), just before the Settings button in Shell.
 * unconfigured: nothing. guest: a quiet "Sign in" link (hidden below 400px, where the Settings sheet covers it).
 * loading: an empty 32px circle so the header does not shift. signed-in: the initials, with a red dot when saving failed.
 */
export function AccountEntry() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const sync = useAuth((s) => s.sync);

  if (status === 'unconfigured') return null;
  if (status === 'guest')
    return (
      <a href="#/account" className="btn btn-quiet btn-sm shrink-0 max-md:h-11 max-[399px]:hidden">
        Sign in
      </a>
    );
  if (status === 'loading' || !user)
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center md:h-9 md:w-9" aria-hidden>
        <span className="h-8 w-8 rounded-full border border-line bg-surface-2" />
      </span>
    );
  return (
    <a
      href="#/account"
      aria-label={`Your account, ${user.name}`}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-control transition-colors duration-150 ease-out hover:bg-surface-2 md:h-9 md:w-9"
    >
      <Initials initials={user.initials} />
      {sync === 'error' && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full border border-bg bg-bad md:right-0 md:top-0" />}
    </a>
  );
}
