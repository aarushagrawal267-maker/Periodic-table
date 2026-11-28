import { AnimatePresence, motion } from 'motion/react';
import { useUi } from '../store/ui';
import { Icon, TIER_COLOR } from './Icon';
import { Plate } from './ElementTile';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const color = t.tier ? TIER_COLOR[t.tier] : 'var(--accent)';
          return (
            <motion.button
              key={t.id}
              layout
              onClick={() => dismiss(t.id)}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="solid pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-line p-3 pr-5 text-left"
              style={{ boxShadow: 'var(--shadow-md)' }}
            >
              <Plate size={44}>
                <Icon name={t.icon} size={18} />
              </Plate>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  {t.tier && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                  Achievement unlocked
                </div>
                <div className="font-display font-medium">{t.title}</div>
                <div className="truncate text-xs text-ink-2">{t.body}</div>
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
