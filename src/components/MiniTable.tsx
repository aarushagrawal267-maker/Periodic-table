import { ELEMENTS, catVar } from '../lib/elements';

interface Props {
  highlight?: Set<number>;
  /** Colour for each element; defaults to category colour for highlighted cells. */
  color?: (n: number) => string | undefined;
  /** Elements to outline in --bad, like the slips of a round. */
  flagged?: Set<number>;
  className?: string;
  label?: string;
  /** Print each element's symbol in its square (for a large, single table such as the Learn page's picture). */
  symbols?: boolean;
}

/**
 * Compact SVG thumbnail of the whole table. Cheap enough to render many at once.
 * Highlighted cells are printed like the tiles, at every size: category colour mixed into the surface
 * (a little stronger than a full tile, so a 10px square still reads) with a category hairline.
 * The rest sit in a neutral step of the ramp.
 */
export function MiniTable({ highlight, color, flagged, className = '', label, symbols = false }: Props) {
  const S = 10;
  const G = 1.6;
  const y = (row: number) => (row >= 9 ? (row - 1) * (S + G) + S * 0.4 : (row - 1) * (S + G));
  return (
    <svg viewBox={`0 0 ${18 * (S + G) - G} ${y(10) + S}`} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {ELEMENTS.map((e) => {
        const on = !highlight || highlight.has(e.number);
        const c = color?.(e.number) ?? (on ? catVar(e.category) : undefined);
        const bad = flagged?.has(e.number);
        const square = (
          <rect
            key={e.number}
            x={(e.col - 1) * (S + G) + 0.5}
            y={y(e.row) + 0.5}
            width={S - 1}
            height={S - 1}
            rx={2}
            fill={c ? `color-mix(in oklab, ${c} var(--mini-tint), var(--surface))` : 'var(--mini-empty)'}
            stroke={bad ? 'var(--bad)' : c ? `color-mix(in oklab, ${c} var(--tile-edge), transparent)` : 'none'}
            strokeWidth={bad ? 2 : 1}
            vectorEffect="non-scaling-stroke"
          />
        );
        if (!symbols) return square;
        return (
          <g key={e.number}>
            {square}
            <text
              x={(e.col - 1) * (S + G) + S / 2}
              y={y(e.row) + S / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={e.symbol.length > 2 ? 3.2 : 4.2}
              fill={c ? `color-mix(in oklab, ${c} var(--cell-ink-mix), var(--ink))` : 'var(--ink-2)'}
              style={{ fontWeight: 500 }}
            >
              {e.symbol}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
