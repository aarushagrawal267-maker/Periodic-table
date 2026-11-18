import { motion } from 'motion/react';
import { DIFFICULTIES, useSettings, type Difficulty } from '../store/settings';

/** `extra` adds a mode-specific sentence to a level's description, e.g. what the quiz adds on Expert. */
export function DifficultyPicker({ extra }: { extra?: Partial<Record<Difficulty, string>> } = {}) {
  const difficulty = useSettings((s) => s.difficulty);
  const set = useSettings((s) => s.set);
  const current = DIFFICULTIES.find((d) => d.id === difficulty)!;
  return (
    <div>
      <div className="inline-flex rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => {
          const on = d.id === difficulty;
          return (
            <button key={d.id} role="radio" aria-checked={on} onClick={() => set({ difficulty: d.id })} className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${on ? 'text-bg' : 'text-ink-2 hover:text-ink'}`}>
              {on && <motion.span layoutId="diff-pill" className="absolute inset-0 rounded-full" style={{ background: 'var(--grad)' }} transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
              <span className="relative">{d.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-3">
        {current.desc}
        {extra?.[difficulty] ? ` ${extra[difficulty]}` : ''}
      </p>
    </div>
  );
}
