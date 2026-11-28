import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { catVar, type Category } from '../lib/elements';
import { CONFETTI_TOTAL_S, confettiPieces, snapBits } from '../lib/celebrate';
import { useSettings } from '../store/settings';
import { tween } from './motion';
import '../styles/effects.css';

/**
 * The celebration pieces of the game: the snap of a correct drop, the mark of a wrong one, confetti and the
 * trophy on the results screen. Everything here is decorative (aria-hidden, pointer-events: none), runs once
 * on transform and opacity only, and is not rendered at all when motion is reduced.
 */

/** True when the app setting or the OS asks for reduced motion. JS-driven effects check this, not just CSS. */
export function useCalm() {
  const setting = useSettings((s) => s.reduceMotion);
  const os = useReducedMotion();
  return setting || !!os;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/**
 * The snap: a ring in the element's category colour opens from the cell, and eight tiny squares fly off its rim.
 * Lives inside the placed cell, absolutely positioned, so it never moves the layout.
 */
export function SnapBurst({ category, size, radius, n }: { category: Category; size: number; radius: number; n: number }) {
  const bits = useMemo(() => snapBits(size, n), [size, n]);
  return (
    <span aria-hidden className="snap-burst" style={{ '--c': catVar(category), '--r': `${radius}px` } as Vars}>
      <span className="snap-ring" />
      {bits.map((b, i) => (
        <span
          key={i}
          className={`snap-bit ${b.solid ? '' : 'snap-bit-tint'}`}
          style={
            {
              '--x0': `${b.x0}px`,
              '--y0': `${b.y0}px`,
              '--x1': `${b.x1}px`,
              '--y1': `${b.y1}px`,
              '--rot': `${b.rot}deg`,
              '--s': `${b.size}px`,
              animationDelay: `${b.delay}ms`,
            } as Vars
          }
        />
      ))}
    </span>
  );
}

/** A small cross in the wrong cell. Fades in and out, or stays still while `still` (reduced motion). */
export function MissMark({ size, still = false }: { size: number; still?: boolean }) {
  const s = Math.max(12, Math.min(24, Math.round(size * 0.36)));
  return (
    <span aria-hidden className={`miss-mark ${still ? 'miss-mark-still' : ''}`}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </span>
  );
}

/**
 * Confetti for a finished round: tiny element squares in category colours, thrown up from behind the stars
 * (`origin`) and falling past the bottom of the first screen. Rendered once, removed when it has landed.
 * The caller decides when it plays and must not render it when motion is reduced.
 */
export function Confetti({ seed, count, elements, origin }: { seed: number; count: number; elements: number[]; origin: RefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [done, setDone] = useState(false);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const pieces = useMemo(() => confettiPieces({ count, seed, elements }), [count, seed, elements]);

  // Measure once: where the stars sit inside the layer, and how big the first screen is.
  useLayoutEffect(() => {
    if (!layer) return;
    const l = layer.getBoundingClientRect();
    const o = origin.current?.getBoundingClientRect();
    const x = o ? o.left + o.width / 2 - l.left : l.width / 2;
    const y = o ? o.top + o.height / 2 - l.top : l.height * 0.3;
    setBox({ x, y, w: l.width, h: l.height });
  }, [layer, origin]);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), (CONFETTI_TOTAL_S + 0.3) * 1000);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;
  const spreadX = box ? Math.min(box.w / 2 - 8, 420) : 0;
  const lift = box ? Math.max(80, Math.min(box.y - 24, 260)) : 0;
  // A phone gets fewer pieces than a desktop (never under 40), so the headline is not buried.
  const shown = box ? Math.min(pieces.length, Math.max(40, Math.round((pieces.length * box.w) / 720))) : 0;
  return (
    <div ref={setLayer} aria-hidden className="confetti" data-testid="confetti">
      {box &&
        pieces.slice(0, shown).map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: box.x,
                top: box.y,
                '--s': `${p.size}px`,
                '--dx': `${Math.round(p.dx * spreadX)}px`,
                '--up': `${Math.round(-p.up * lift)}px`,
                '--fall': `${Math.round((box.h - box.y + 40) * p.fall)}px`,
                '--rot': `${p.rot}deg`,
                '--c': p.color,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              } as Vars
            }
          >
            <span className={p.symbol ? 'confetti-tile' : 'confetti-bit'} style={{ animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}>
              {p.symbol}
            </span>
          </span>
        ))}
    </div>
  );
}

/**
 * The master finish: a flat gold trophy with element 118 printed on the cup, as the wall chart prints it.
 * It rises in above the headline once, or simply stands there when motion is reduced.
 */
export function MasterTrophy({ still }: { still: boolean }) {
  return (
    <motion.div
      className="mx-auto mb-4 w-fit"
      aria-hidden
      data-testid="trophy"
      initial={still ? false : { opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={tween(0.6, 0.1)}
    >
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden className="block">
        <g fill="var(--star)" stroke="var(--star-line)" strokeWidth="2" strokeLinejoin="round">
          {/* Handles */}
          <path d="M26 22h-9a3 3 0 0 0-3 3v4c0 10 7 17 17 18" fill="none" strokeWidth="5" stroke="var(--star-line)" strokeLinecap="round" />
          <path d="M70 22h9a3 3 0 0 1 3 3v4c0 10-7 17-17 18" fill="none" strokeWidth="5" stroke="var(--star-line)" strokeLinecap="round" />
          {/* Cup */}
          <path d="M24 14h48v16c0 15-10.7 26-24 26S24 45 24 30z" />
          {/* Stem and base */}
          <path d="M43 55h10v12H43z" />
          <path d="M34 67h28a3 3 0 0 1 3 3v6H31v-6a3 3 0 0 1 3-3z" />
          <path d="M26 76h44a2 2 0 0 1 2 2v4H24v-4a2 2 0 0 1 2-2z" />
        </g>
        {/* Element 118 on the cup: number in the top-left corner, symbol in the middle. */}
        {/* The corner number at 9px, the smallest size any figure in the app is printed at. */}
        <rect x="32" y="16" width="32" height="32" rx="4" fill="var(--surface)" stroke="var(--star-line)" strokeWidth="1.5" />
        <text x="35" y="26" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-2)">
          118
        </text>
        <text x="48" y="43" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13" fontWeight="500" fill="var(--ink)">
          Og
        </text>
      </svg>
    </motion.div>
  );
}
