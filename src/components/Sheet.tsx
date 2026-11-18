import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

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

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
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
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={`solid relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] outline-none thin-scroll sm:rounded-[28px] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
            style={{ boxShadow: 'var(--shadow-lg)' }}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            <button
              onClick={onClose}
              className="btn-ghost absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
