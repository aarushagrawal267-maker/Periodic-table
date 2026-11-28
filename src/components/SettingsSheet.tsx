import { Monitor, Moon, Sun } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { DIFFICULTIES, THEMES, useSettings, type Theme } from '../store/settings';
import { useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { AccountDataSummary, useSignedIn } from './account/AccountData';
import { ConfirmBlock } from './account/ConfirmBlock';
import { focusHeadingWhenSheetCloses } from './focusAfterSheet';
import { Sheet } from './Sheet';
import { Switch } from './Switch';

/**
 * "Your data" with accounts, and whether the reset reaches every device. In a build without accounts these are
 * constants, so the bundler leaves the account code out. The env check is written out for that, rather than
 * isConfigured() (docs/ACCOUNTS.md 8.3).
 */
const DataSummary = import.meta.env.VITE_FIREBASE_PROJECT_ID ? AccountDataSummary : LocalDataSummary;
const useResetReachesAccount = import.meta.env.VITE_FIREBASE_PROJECT_ID ? useSignedIn : () => false;

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettings);
  const s = useSettings();
  const reset = useProgress((p) => p.reset);
  const [confirm, setConfirm] = useState(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const signedIn = useResetReachesAccount();

  /** Back to "Reset progress…", with focus on it. */
  const closeConfirm = () => {
    setConfirm(false);
    requestAnimationFrame(() => resetRef.current?.focus());
  };

  /** A link to the account screen: the sheet closes and the account screen's heading takes focus. */
  const toAccount = () => {
    setOpen(false);
    // The current screen's heading is the target only when the link leads to the screen already open.
    focusHeadingWhenSheetCloses(window.location.hash === '#/account' ? null : document.querySelector('#main h1'));
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Settings">
      {/* The heading sits on the close button's centre line: 30px on phones, 38px at sm, 34px from md. */}
      <div className="px-4 pb-8 pt-4 sm:px-8 sm:pt-6 md:pt-5">
        <h2 className="t-heading">Settings</h2>

        <section className="mt-8">
          <h3 id="theme-label" className="label mb-2">
            Theme
          </h3>
          <div
            className="seg grid w-full grid-cols-3"
            role="radiogroup"
            aria-labelledby="theme-label"
            onKeyDown={(e) => roveRadios(e, THEMES.map((t) => t.id), s.theme, s.setTheme)}
          >
            {THEMES.map((t) => {
              const I = THEME_ICON[t.id];
              const on = s.theme === t.id;
              return (
                <button key={t.id} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => s.setTheme(t.id)} className="seg-item flex items-center justify-center gap-2">
                  <I size={16} strokeWidth={1.5} aria-hidden />
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[13px] leading-5 text-ink-2">Light is easiest to read on a classroom projector. Saved on this device only</p>
        </section>

        <section className="mt-8">
          <h3 className="label mb-2">Default difficulty</h3>
          <div className="grid auto-rows-fr gap-1" role="radiogroup" aria-label="Default difficulty" onKeyDown={(e) => roveRadios(e, DIFFICULTIES.map((d) => d.id), s.difficulty, (difficulty) => s.set({ difficulty }))}>
            {DIFFICULTIES.map((d) => {
              const on = s.difficulty === d.id;
              return (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => s.set({ difficulty: d.id })}
                  // Rows share one height (the tallest), with each option's text centred in it.
                  className={`flex w-full items-center rounded-control p-3 text-left transition-colors duration-150 ease-out ${on ? 'is-selected' : 'hover:bg-surface-2'}`}
                >
                  <span className="flex items-start gap-3">
                    <span aria-hidden className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] ${on ? 'border-accent' : 'border-ink-3'}`}>
                      {on && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </span>
                    <span>
                      <span className="block font-medium leading-6">{d.name}</span>
                      <span className="block text-sm text-ink-2">{d.desc}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid auto-rows-fr divide-y divide-line rounded-card border border-line">
          <Toggle label="Sound effects" on={s.sound} set={(v) => s.set({ sound: v })} />
          <Toggle label="Vibration" hint="On supported phones" on={s.haptics} set={(v) => s.set({ haptics: v })} />
          <Toggle label="Reduce motion" on={s.reduceMotion} set={(v) => s.set({ reduceMotion: v })} />
          <Toggle label="Colour-blind palette" hint="Category colours that are easier to tell apart" on={s.colorblind} set={(v) => s.set({ colorblind: v })} />
        </section>

        <section className="mt-8">
          <h3 className="label mb-2">Your data</h3>
          <DataSummary onNavigate={toAccount} />
          {confirm ? (
            <div className="mt-4">
              <ConfirmBlock
                title="Erase your progress?"
                body={<p>{signedIn ? 'This erases your progress on every device signed in to this account' : 'This erases your progress in this browser'}</p>}
                confirmLabel="Erase everything"
                tone="danger"
                onConfirm={() => {
                  reset();
                  closeConfirm();
                }}
                onCancel={closeConfirm}
              />
            </div>
          ) : (
            <button ref={resetRef} className="btn btn-quiet -ml-4 mt-2 text-bad hover:text-bad" onClick={() => setConfirm(true)}>
              Reset progress…
            </button>
          )}
        </section>
      </div>
    </Sheet>
  );
}

const THEME_ICON: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/**
 * Arrow keys move the selection inside a radio group, as native radios do (roving tabindex):
 * only the checked radio is in the Tab order, arrows check and focus the next or previous one.
 */
function roveRadios<T extends string>(e: KeyboardEvent<HTMLElement>, ids: readonly T[], current: T, select: (id: T) => void) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  const at = Math.max(0, ids.indexOf(current));
  let to: number;
  if (step) to = (at + step + ids.length) % ids.length;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = ids.length - 1;
  else return;
  e.preventDefault();
  select(ids[to]);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 px-4 py-2">
      <span>
        <span className="block text-[15px] leading-5">{label}</span>
        {hint && <span className="block text-[13px] leading-5 text-ink-2">{hint}</span>}
      </span>
      <Switch on={on} onChange={set} label={label} />
    </label>
  );
}

/** "Your data" in a build without accounts: nothing leaves the device. */
function LocalDataSummary() {
  return <p className="text-sm text-ink-2">Progress is saved on this device only. Nothing is sent anywhere.</p>;
}
