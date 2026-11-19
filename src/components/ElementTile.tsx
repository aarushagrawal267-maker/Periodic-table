import { memo, type CSSProperties } from 'react';
import { catVar, type Element } from '../lib/elements';

interface Props {
  element: Element;
  size: number;
  showNumber?: boolean;
  showName?: boolean;
  showSymbol?: boolean;
  color?: string;
  className?: string;
  style?: CSSProperties;
  /**
   * Hide the atomic number from assistive tech. Use inside a control whose aria-label already says the number
   * after the symbol and name, so the visible label (symbol, name) leads the accessible name (WCAG 2.5.3).
   */
  quietNumber?: boolean;
}

/**
 * The element square, as the wall chart prints it: flat category tint, the symbol in the middle,
 * the atomic number in the top-left corner in mono (the signature, docs/DESIGN.md).
 * Text scales with the tile, so the same component serves 28px map cells and 144px detail cards.
 */
export const ElementTile = memo(function ElementTile({
  element: e,
  size,
  showNumber = true,
  showName = size >= 54,
  showSymbol = true,
  color,
  className = '',
  style,
  quietNumber = false,
}: Props) {
  const tiny = size < 34;
  return (
    <div
      className={`tile flex h-full w-full select-none flex-col items-center justify-center overflow-hidden [container-type:inline-size] ${className}`}
      style={{ '--c': color ?? catVar(e.category), borderRadius: tileRadius(size), ...style } as CSSProperties}
    >
      {showNumber && !tiny && (
        <span
          className="tile-number absolute"
          style={{ left: Math.round(size * 0.09), top: Math.round(size * 0.08), fontSize: Math.max(9, Math.round(size * 0.15)) }}
          aria-hidden={quietNumber || undefined}
        >
          {e.number}
        </span>
      )}
      {/* Spaces keep the parts separate words for assistive tech ("Fe Iron", not "FeIron"); flex layout ignores them. */}{' '}
      {showSymbol && (
        <span className="font-medium leading-none" style={{ fontSize: size * (tiny ? 0.42 : showName ? 0.36 : 0.4), marginTop: size * (showName ? 0.04 : tiny ? 0 : 0.08) }}>
          {e.symbol}
        </span>
      )}{' '}
      {showName && (
        <span className="tile-name max-w-[94%] truncate" style={{ fontSize: nameSize(e.name, size), marginTop: size * 0.06 }}>
          {e.name}
        </span>
      )}
    </div>
  );
});

/**
 * The name fits the tile's real width instead of being cut off: at most 13% of the tile, shrinking for long names
 * (Rutherfordium, Praseodymium) by the tile's own width (cqi), never under 8px. `truncate` stays only as a safety net.
 */
function nameSize(name: string, size: number) {
  const fit = 90 / (name.length * 0.54);
  return `max(8px, min(${Math.max(9, size * 0.13)}px, ${fit.toFixed(2)}cqi))`;
}

/** Tile corner radius by size: 6px for map cells up to 20px for the detail card. */
export function tileRadius(size: number) {
  return Math.min(20, Math.max(4, Math.round(size * 0.14)));
}

/**
 * An element named in a list or a sentence: its symbol on a small printed square with the atomic number
 * in the corner (the signature). Use it wherever an element is a chip: review lists, results, lesson cards.
 * Decorative by default; the surrounding text or control carries the name.
 */
export function ElementChip({ element: e, size = 32, className = '', label = false }: { element: Element; size?: number; className?: string; label?: boolean }) {
  return (
    <span
      className={`cat-chip relative inline-grid shrink-0 place-items-center font-medium leading-none ${className}`}
      style={{ '--c': catVar(e.category), width: size, height: size, borderRadius: Math.max(4, Math.round(size * 0.19)), fontSize: Math.round(size * 0.4) } as CSSProperties}
      aria-hidden={label ? undefined : true}
      aria-label={label ? `${e.name}, element ${e.number}` : undefined}
      role={label ? 'img' : undefined}
    >
      {size >= 28 && (
        <span className="tile-number absolute" style={{ left: 3, top: 3, fontSize: Math.max(9, Math.round(size * 0.28)) }}>
          {e.number}
        </span>
      )}
      <span style={{ marginTop: size >= 28 ? Math.round(size * 0.12) : 0 }}>{e.symbol}</span>
    </span>
  );
}
