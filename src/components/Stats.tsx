import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/scoring';

/** Number that tweens to its new value. */
export function AnimatedNumber({ value, duration = 500, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return <span className={`tabular-nums ${className ?? ''}`}>{shown.toLocaleString('en-US')}</span>;
}

/** Ticking clock that re-renders itself only. */
export function Elapsed({ start, end, running }: { start: number; end: number; running: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  const ms = start ? (running ? now : end) - start : 0;
  return <span className="tabular-nums">{formatTime(Math.max(0, ms))}</span>;
}

/** Circular progress ring: a hairline track and one arc, in the accent unless a colour is given. */
export function Ring({ value, size = 56, stroke = 6, children, color }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: 'stroke-dashoffset var(--dur-enter) var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
