import { AnimatePresence, motion } from 'motion/react';
import { useUi } from '../store/ui';
import { Icon, TIER_COLOR } from './Icon';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  // Over a results screen, phones show toasts at the bottom so the headline and stars stay visible.
  const bottom = useUi((s) => s.resultsOpen);
  const from = bottom ? 40 : -40;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 ${bottom ? 'bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-3' : 'top-3'}`}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const color = t.tier ? TIER_COLOR[t.tier] : 'var(--accent-2)';
          return (
            <motion.button
              key={t.id}
              layout
              onClick={() => dismiss(t.id)}
              initial={{ y: from, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: from * 0.75, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="solid pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl p-3 pr-5 text-left"
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="shine grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
                <Icon name={t.icon} size={22} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: `color-mix(in oklab, ${color} var(--cell-ink-mix), var(--ink))` }}>
                  Achievement unlocked
                </div>
                <div className="font-display font-semibold">{t.title}</div>
                <div className="truncate text-xs text-ink-2">{t.body}</div>
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
