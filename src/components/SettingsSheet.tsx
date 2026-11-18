import { Monitor, Moon, Sun } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { DIFFICULTIES, useSettings, type Theme } from '../store/settings';
import { useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { Sheet } from './Sheet';

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettings);
  const s = useSettings();
  const reset = useProgress((p) => p.reset);
  const [confirm, setConfirm] = useState(false);

  const themes: { id: Theme; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: 'Auto', icon: Monitor },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun },
  ];

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Settings">
      <div className="p-6 pt-8 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">Settings</h2>

        <section className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Appearance</h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme" onKeyDown={(e) => roveRadios(e, themes.map((t) => t.id), s.theme, (theme) => s.set({ theme }))}>
            {themes.map((t) => {
              const I = t.icon;
              const on = s.theme === t.id;
              return (
                <button key={t.id} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => s.set({ theme: t.id })} className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-sm font-medium transition-colors ${on ? 'border-accent-2 bg-accent-2/10' : 'border-line bg-surface hover:bg-surface-2'}`}>
                  <I size={18} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Default difficulty</h3>
          <div className="space-y-2" role="radiogroup" aria-label="Default difficulty" onKeyDown={(e) => roveRadios(e, DIFFICULTIES.map((d) => d.id), s.difficulty, (difficulty) => s.set({ difficulty }))}>
            {DIFFICULTIES.map((d) => {
              const on = s.difficulty === d.id;
              return (
                <button key={d.id} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => s.set({ difficulty: d.id })} className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${on ? 'border-accent-2 bg-accent-2/10' : 'border-line bg-surface hover:bg-surface-2'}`}>
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-accent-2' : 'border-line-strong'}`}>{on && <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />}</span>
                  <span>
                    <span className="block font-medium">{d.name}</span>
                    <span className="block text-sm text-ink-2">{d.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          <Toggle label="Sound effects" on={s.sound} set={(v) => s.set({ sound: v })} />
          <Toggle label="Vibration" hint="On supported phones" on={s.haptics} set={(v) => s.set({ haptics: v })} />
          <Toggle label="Reduce motion" on={s.reduceMotion} set={(v) => s.set({ reduceMotion: v })} />
          <Toggle label="Colour-blind palette" hint="Okabe–Ito colours for categories" on={s.colorblind} set={(v) => s.set({ colorblind: v })} />
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Your data</h3>
          <p className="text-sm text-ink-2">Progress is saved on this device only. Nothing is sent anywhere.</p>
          {confirm ? (
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost h-11 flex-1 rounded-xl text-sm font-medium" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="h-11 flex-1 rounded-xl bg-bad/15 text-sm font-semibold text-bad"
                onClick={() => {
                  reset();
                  setConfirm(false);
                }}
              >
                Erase everything
              </button>
            </div>
          ) : (
            <button className="mt-3 h-11 rounded-xl px-4 text-sm font-medium text-bad hover:bg-bad/10" onClick={() => setConfirm(true)}>
              Reset progress…
            </button>
          )}
        </section>
      </div>
    </Sheet>
  );
}

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
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-accent-2' : 'bg-line-strong'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}
