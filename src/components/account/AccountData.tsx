import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { Initials } from './AccountEntry';
import { SyncStatusLine } from './SyncStatusLine';

/** Signed in, with the account's details at hand. */
export function useSignedIn(): boolean {
  return useAuth((a) => a.status === 'signed-in' && !!a.user);
}

/**
 * The account part of the Settings sheet's "Your data" (docs/ACCOUNTS.md 9, item 5). Signed in: the initials, name
 * and email, the sync line, and "Manage account". Otherwise where progress is kept, and "Sign in to save it to an
 * account". Both links lead to the account screen; `onNavigate` closes the sheet.
 */
export function AccountDataSummary({ onNavigate }: { onNavigate: () => void }) {
  const status = useAuth((a) => a.status);
  const user = useAuth((a) => a.user);
  const sync = useAuth((a) => a.sync);

  if (status === 'signed-in' && user)
    return (
      <>
        <div className="flex min-w-0 items-center gap-3">
          <Initials initials={user.initials} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-5">{user.name}</p>
            {user.email && <p className="truncate text-[13px] leading-5 text-ink-2">{user.email}</p>}
          </div>
        </div>
        <div className="mt-3">
          <SyncStatusLine status={sync} />
        </div>
        <TextLink onClick={onNavigate}>Manage account</TextLink>
      </>
    );
  return (
    <>
      <p className="text-sm text-ink-2">Progress is saved in this browser, on this device</p>
      {status === 'guest' && <TextLink onClick={onNavigate}>Sign in to save it to an account</TextLink>}
    </>
  );
}

/** The app's text link (Home's "Explore the full periodic table"), at the full 44px touch height. */
function TextLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <a href="#/account" onClick={onClick} className="mt-1 flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-ink-2">
      {children} <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
    </a>
  );
}
