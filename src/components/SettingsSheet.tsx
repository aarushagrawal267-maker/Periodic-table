import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
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
        <h2 className="font-display text-2xl font-medium">Settings</h2>

        <section className="mt-6">
          <h3 className="mb-2 text-sm text-ink-3">Appearance</h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {themes.map((t) => {
              const I = t.icon;
              const on = s.theme === t.id;
              return (
                <button key={t.id} role="radio" aria-checked={on} onClick={() => s.set({ theme: t.id })} className={`flex flex-col items-center gap-1.5 rounded-[10px] border py-3 text-sm font-medium transition-colors ${on ? 'border-accent bg-surface-2' : 'border-line bg-surface hover:bg-surface-2'}`}>
                  <I size={18} strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-sm text-ink-3">Default difficulty</h3>
          <div className="space-y-2" role="radiogroup" aria-label="Default difficulty">
            {DIFFICULTIES.map((d) => {
              const on = s.difficulty === d.id;
              return (
                <button key={d.id} role="radio" aria-checked={on} onClick={() => s.set({ difficulty: d.id })} className={`flex w-full items-start gap-3 rounded-[10px] border p-3 text-left transition-colors ${on ? 'border-accent bg-surface-2' : 'border-line bg-surface hover:bg-surface-2'}`}>
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-accent' : 'border-line-strong'}`}>{on && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</span>
                  <span>
                    <span className="block font-medium">{d.name}</span>
                    <span className="block text-sm text-ink-2">{d.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface">
          <Toggle label="Sound effects" on={s.sound} set={(v) => s.set({ sound: v })} />
          <Toggle label="Vibration" hint="On supported phones" on={s.haptics} set={(v) => s.set({ haptics: v })} />
          <Toggle label="Reduce motion" on={s.reduceMotion} set={(v) => s.set({ reduceMotion: v })} />
          <Toggle label="Colour-blind palette" hint="Okabe–Ito colours for categories" on={s.colorblind} set={(v) => s.set({ colorblind: v })} />
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-sm text-ink-3">Your data</h3>
          <p className="text-sm text-ink-2">Progress is saved on this device only. Nothing is sent anywhere.</p>
          {confirm ? (
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost h-11 flex-1 rounded-[10px] text-sm font-medium" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="h-11 flex-1 rounded-[10px] bg-bad/15 text-sm font-medium text-bad"
                onClick={() => {
                  reset();
                  setConfirm(false);
                }}
              >
                Erase everything
              </button>
            </div>
          ) : (
            <button className="mt-3 h-11 rounded-[10px] px-4 text-sm font-medium text-bad hover:bg-bad/10" onClick={() => setConfirm(true)}>
              Reset progress
            </button>
          )}
        </section>
      </div>
    </Sheet>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line-strong'}`}>
        <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}
