import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settings';

const COLORS = ['#8b7cff', '#4fd1ff', '#5cf2b0', '#ffc94a', '#ff5d73', '#e879f9'];

/** Lightweight canvas confetti burst. Skipped entirely when reduced motion is on. */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    if (!fire || reduce) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    const parts = Array.from({ length: 160 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? 0 : w,
        y: h * 0.75,
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 14) * dpr,
        vy: -(14 + Math.random() * 16) * dpr,
        r: (4 + Math.random() * 5) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[i % COLORS.length],
        shape: i % 3,
      };
    });
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - frame / 200);
        if (p.shape === 0) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.r / 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
      }
      if (frame < 200) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, reduce]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
