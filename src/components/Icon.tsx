import {
  Atom,
  BrainCircuit,
  CalendarCheck,
  CalendarRange,
  Crown,
  Flame,
  FlaskConical,
  Gem,
  GraduationCap,
  House,
  Library,
  Map,
  Sparkles,
  Target,
  Telescope,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Atom,
  BrainCircuit,
  CalendarCheck,
  CalendarRange,
  Crown,
  Flame,
  FlaskConical,
  Gem,
  GraduationCap,
  House,
  Library,
  Map,
  Sparkles,
  Target,
  Telescope,
  Timer,
  Trophy,
  Zap,
};

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? Sparkles;
  return <C size={size} className={className} aria-hidden />;
}

export const TIER_COLOR = { bronze: '#e0975a', silver: '#c9d3e6', gold: 'var(--gold)' } as const;
