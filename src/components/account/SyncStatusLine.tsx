import { Cloud, CloudAlert, CloudCheck, CloudDownload, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react';
import { useAuth, type SyncStatus } from '../../store/auth';

const LINES: Record<Exclude<SyncStatus, 'idle' | 'error' | 'outdated'>, { icon: LucideIcon; text: string }> = {
  loading: { icon: CloudDownload, text: 'Loading your progress' },
  saving: { icon: Cloud, text: 'Saving' },
  saved: { icon: CloudCheck, text: 'Saved to your account' },
  offline: { icon: CloudOff, text: 'Offline, will save when you reconnect' },
};

const SAVE_FAILED = 'Could not save to your account. Your progress is still on this device.';

/**
 * Where the student's progress stands, in one line (docs/ACCOUNTS.md 7.2). Static text, never the accent,
 * no spinner and no pulse. The status region is always rendered so a change is announced politely.
 */
export function SyncStatusLine({ status }: { status: SyncStatus }) {
  const error = useAuth((s) => s.error);
  let body = null;
  if (status === 'error') {
    body = (
      <p className="flex gap-2 text-sm leading-5 text-ink-2">
        <CloudAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-bad" />
        <span>{error && !error.code.startsWith('auth/') ? error.message : SAVE_FAILED}</span>
      </p>
    );
  } else if (status === 'outdated') {
    body = (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="flex min-w-0 flex-1 basis-60 gap-2 text-sm leading-5 text-ink-2">
          <RefreshCw size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
          <span>A newer version of Periodica saved your progress. Reload to keep saving</span>
        </p>
        <button type="button" className="btn btn-secondary btn-sm max-md:h-11" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  } else if (status !== 'idle') {
    const { icon: Icon, text } = LINES[status];
    body = (
      <p className="flex items-center gap-2 text-sm leading-5 text-ink-2">
        <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
        <span>{text}</span>
      </p>
    );
  }
  return (
    <div role="status" data-sync={status}>
      {body}
    </div>
  );
}
