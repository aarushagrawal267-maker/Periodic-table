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
}

/**
 * The visual element card. Text scales with the tile so the same component
 * serves 28px map cells and 140px hero cards.
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
}: Props) {
  const tiny = size < 40;
  return (
    <div
      className={`tile flex h-full w-full select-none flex-col items-center justify-center overflow-hidden ${className}`}
      style={{ '--c': color ?? catVar(e.category), borderRadius: Math.max(6, size * 0.16), ...style } as CSSProperties}
    >
      {showNumber && !tiny && (
        <span className="absolute left-[9%] top-[6%] font-medium tabular-nums opacity-80" style={{ fontSize: Math.max(8, size * 0.17) }}>
          {e.number}
        </span>
      )}
      {showSymbol && (
        <span className="font-display font-semibold leading-none" style={{ fontSize: size * (tiny ? 0.42 : showName ? 0.36 : 0.4), marginTop: showName ? -size * 0.04 : 0 }}>
          {e.symbol}
        </span>
      )}
      {showName && (
        <span className="mt-[6%] max-w-[92%] truncate font-medium text-ink-2" style={{ fontSize: Math.max(8, size * 0.135) }}>
          {e.name}
        </span>
      )}
    </div>
  );
});

/**
 * The element-tile anatomy (number top-left, symbol, name) on a neutral plate.
 * Used outside the table for levels, lesson steps and achievements.
 */
export function Plate({
  size,
  corner,
  children,
  label,
  accent = false,
  muted = false,
  className = '',
}: {
  size: number;
  corner?: string | number;
  children: React.ReactNode;
  label?: string;
  accent?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`plate flex shrink-0 select-none flex-col items-center justify-center ${muted ? 'text-ink-3' : ''} ${className}`}
      style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.14)), borderColor: accent ? 'var(--accent)' : undefined }}
    >
      {corner !== undefined && size >= 32 && (
        <span className="absolute left-[10%] top-[6%] tabular-nums text-ink-3" style={{ fontSize: Math.max(9, Math.round(size * 0.16)) }}>
          {corner}
        </span>
      )}
      <span className="font-display flex items-center font-medium leading-none" style={{ fontSize: Math.round(size * (label ? 0.34 : 0.4)), marginTop: label ? -size * 0.04 : 0 }}>
        {children}
      </span>
      {label && (
        <span className="mt-[6%] max-w-[92%] truncate text-ink-3" style={{ fontSize: Math.max(9, Math.round(size * 0.13)) }}>
          {label}
        </span>
      )}
    </div>
  );
}
