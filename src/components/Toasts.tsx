import { AnimatePresence, motion } from 'motion/react';
import { useUi } from '../store/ui';
import { Icon, TIER_COLOR } from './Icon';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const color = t.tier ? TIER_COLOR[t.tier] : 'var(--accent-2)';
          return (
            <motion.button
              key={t.id}
              layout
              onClick={() => dismiss(t.id)}
              initial={{ y: -40, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -30, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="solid pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl p-3 pr-5 text-left"
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="shine grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
                <Icon name={t.icon} size={22} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
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
