/**
 * Motion tokens for motion/react, matching the CSS tokens in src/styles/index.css (docs/DESIGN.md, "Motion").
 * One easing curve, three durations. No springs, no overshoot, no loops.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Seconds, for motion/react. */
export const DUR = {
  /** Hover, press, toggles. */
  press: 0.15,
  /** Menus, popovers, tooltips, toasts. */
  menu: 0.2,
  /** Entrances, sheets, layout changes. */
  enter: 0.36,
} as const;

/** Stagger between items: 50ms, for at most six items. */
export const STAGGER = 0.05;

/** The one entrance on a screen: a short fade and rise. */
export const rise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.enter, ease: EASE },
} as const;

/** Tween transition with the shared curve. */
export const tween = (duration: number = DUR.enter, delay = 0) => ({ duration, delay, ease: EASE });
