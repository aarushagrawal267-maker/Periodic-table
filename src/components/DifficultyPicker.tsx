import { motion } from 'motion/react';
import { DIFFICULTIES, useSettings } from '../store/settings';

export function DifficultyPicker() {
  const difficulty = useSettings((s) => s.difficulty);
  const set = useSettings((s) => s.set);
  const current = DIFFICULTIES.find((d) => d.id === difficulty)!;
  return (
    <div>
      <div className="inline-flex rounded-[10px] border border-line bg-surface p-1" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => {
          const on = d.id === difficulty;
          return (
            <button key={d.id} role="radio" aria-checked={on} onClick={() => set({ difficulty: d.id })} className={`relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${on ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {on && <motion.span layoutId="diff-pill" className="absolute inset-0 rounded-md border border-line-strong bg-surface-2" transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} />}
              <span className="relative">{d.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-3">{current.desc}</p>
    </div>
  );
}
