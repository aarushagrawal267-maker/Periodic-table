import { AnimatePresence, motion } from 'motion/react';
import { useUi } from '../store/ui';
import { Icon, TIER_COLOR } from './Icon';
import { DUR, tween } from './motion';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  // Over a results screen or an open dialog, toasts move to the bottom so they never cover its headline.
  const bottom = useUi((s) => s.resultsOpen || s.detail !== null || s.settingsOpen);
  const from = bottom ? 8 : -8;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 ${bottom ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]' : 'top-4'}`}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout="position"
            onClick={() => dismiss(t.id)}
            initial={{ y: from, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween(DUR.menu)}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card border border-line bg-surface p-3 pr-4 text-left"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface-2 text-ink-2">
              <Icon name={t.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13px] text-ink-2">
                {t.tier && <span className="dot" style={{ background: TIER_COLOR[t.tier] }} aria-hidden />}
                Achievement unlocked
              </span>
              <span className="block font-medium">{t.title}</span>
              <span className="block truncate text-[13px] text-ink-2">{t.body}</span>
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
