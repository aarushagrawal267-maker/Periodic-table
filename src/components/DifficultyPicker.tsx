import type { KeyboardEvent } from 'react';
import { DIFFICULTIES, useSettings, type Difficulty } from '../store/settings';

/** `extra` adds a mode-specific sentence to a level's description, e.g. what the quiz adds on Expert. */
export function DifficultyPicker({ extra }: { extra?: Partial<Record<Difficulty, string>> } = {}) {
  const difficulty = useSettings((s) => s.difficulty);
  const set = useSettings((s) => s.set);
  const current = DIFFICULTIES.find((d) => d.id === difficulty)!;

  // Arrow keys move the choice, as native radios do.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = DIFFICULTIES.findIndex((d) => d.id === difficulty);
    const to = (at + step + DIFFICULTIES.length) % DIFFICULTIES.length;
    set({ difficulty: DIFFICULTIES[to].id });
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
  };

  return (
    <div>
      <div className="seg" role="radiogroup" aria-label="Difficulty" onKeyDown={onKeyDown}>
        {DIFFICULTIES.map((d) => {
          const on = d.id === difficulty;
          return (
            <button key={d.id} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => set({ difficulty: d.id })} className="seg-item">
              {d.name}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-2">
        {current.desc}
        {extra?.[difficulty] ? ` ${extra[difficulty]}` : ''}
      </p>
    </div>
  );
}
