import { ELEMENTS, catVar } from '../lib/elements';

interface Props {
  highlight?: Set<number>;
  /** Colour for each element; defaults to category colour for highlighted cells. */
  color?: (n: number) => string | undefined;
  className?: string;
  label?: string;
}

/** Compact SVG thumbnail of the whole table. Cheap enough to render many at once. */
export function MiniTable({ highlight, color, className = '', label }: Props) {
  const S = 10;
  const G = 1.6;
  const y = (row: number) => (row >= 9 ? (row - 1) * (S + G) + S * 0.4 : (row - 1) * (S + G));
  return (
    <svg viewBox={`0 0 ${18 * (S + G) - G} ${y(10) + S}`} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {ELEMENTS.map((e) => {
        const on = !highlight || highlight.has(e.number);
        const c = color?.(e.number) ?? (on ? catVar(e.category) : undefined);
        return (
          <rect
            key={e.number}
            x={(e.col - 1) * (S + G)}
            y={y(e.row)}
            width={S}
            height={S}
            rx={2}
            fill={c ?? 'var(--line)'}
            opacity={on ? 1 : 0.7}
          />
        );
      })}
    </svg>
  );
}
