import { useState, type KeyboardEvent } from 'react';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { Sheet } from './Sheet';
import { Switch } from './Switch';

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettings);
  const s = useSettings();
  const reset = useProgress((p) => p.reset);
  const [confirm, setConfirm] = useState(false);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Settings">
      {/* The heading sits on the close button's centre line: 30px on phones, 38px at sm, 34px from md. */}
      <div className="px-4 pb-8 pt-4 sm:px-8 sm:pt-6 md:pt-5">
        <h2 className="t-heading">Settings</h2>

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
          <Toggle label="Colour-blind palette" hint="Okabe–Ito colours for categories" on={s.colorblind} set={(v) => s.set({ colorblind: v })} />
        </section>

        <section className="mt-8">
          <h3 className="label mb-2">Your data</h3>
          <p className="text-sm text-ink-2">Progress is saved on this device only. Nothing is sent anywhere.</p>
          {confirm ? (
            <div className="mt-4 flex gap-3">
              <button className="btn btn-secondary flex-1" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger flex-1"
                onClick={() => {
                  reset();
                  setConfirm(false);
                }}
              >
                Erase everything
              </button>
            </div>
          ) : (
            <button className="btn btn-quiet -ml-4 mt-2 text-bad hover:text-bad" onClick={() => setConfirm(true)}>
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
    <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 px-4 py-2">
      <span>
        <span className="block text-[15px] leading-5">{label}</span>
        {hint && <span className="block text-[13px] leading-5 text-ink-2">{hint}</span>}
      </span>
      <Switch on={on} onChange={set} label={label} />
    </label>
  );
}
