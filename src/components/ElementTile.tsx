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
