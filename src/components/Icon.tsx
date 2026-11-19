import {
  Atom,
  Award,
  BadgeCheck,
  CalendarCheck,
  CalendarRange,
  Crown,
  Flame,
  FlaskConical,
  Gem,
  GraduationCap,
  House,
  Library,
  ListChecks,
  Map,
  Target,
  Telescope,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Achievement icons by name (names come from src/lib/achievements.ts). One set (lucide), one stroke. */
const ICONS: Record<string, LucideIcon> = {
  Atom,
  BadgeCheck,
  CalendarCheck,
  CalendarRange,
  Crown,
  Flame,
  FlaskConical,
  Gem,
  GraduationCap,
  House,
  Library,
  ListChecks,
  Map,
  Target,
  Telescope,
  Timer,
  Trophy,
  Zap,
};

/** Icons take the colour of their text role: pass a text-ink-* class, never a hue. */
export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? Award;
  return <C size={size} strokeWidth={1.5} className={className} aria-hidden />;
}

/** Achievement tiers. Shown only as a small status dot (`.dot`) next to the name, never as an icon colour. */
export const TIER_COLOR = { bronze: '#c7834f', silver: '#a3acbb', gold: 'var(--star)' } as const;
