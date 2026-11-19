import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { DUR, tween } from './motion';

const FOCUSABLE = ['button', '[href]', 'input', 'select', 'textarea', '[tabindex]']
  .map((q) => `${q}:not([disabled]):not([tabindex="-1"])`)
  .join(', ');

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}

/**
 * Dialog that is a bottom sheet on phones and a centred panel on larger screens.
 * Traps focus, closes on Escape and on backdrop click, restores focus on close.
 */
export function Sheet({ open, onClose, label, children, wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  // Callers usually pass onClose inline; keep it in a ref so focus only moves when the sheet opens.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        const outside = !(active instanceof Node) || !panel.current.contains(active) || active === panel.current;
        if (e.shiftKey && (outside || active === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (outside ? active !== panel.current : active === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween(DUR.menu)}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-panel border border-line bg-surface outline-none thin-scroll sm:rounded-panel ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
            style={{ boxShadow: 'var(--shadow-lg)' }}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={tween(DUR.enter)}
          >
            <div aria-hidden className="mx-auto mt-2 h-1 w-8 rounded-full bg-line-strong sm:hidden" />
            <button onClick={onClose} className="icon-btn absolute right-3 top-3 z-10 sm:right-4 sm:top-4" aria-label="Close">
              <X size={18} strokeWidth={1.5} />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
