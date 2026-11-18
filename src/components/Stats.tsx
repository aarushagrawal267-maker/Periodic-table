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

/** Circular progress ring. */
export function Ring({ value, size = 56, stroke = 6, children, color = 'url(#ring-grad)' }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="0.6" stopColor="var(--accent-2)" />
            <stop offset="1" stopColor="var(--accent-3)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: 'stroke-dashoffset 1s var(--ease-out-expo)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
