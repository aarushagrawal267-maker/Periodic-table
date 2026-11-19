import { Check } from 'lucide-react';
import { DAILY_GOAL_XP, useProgress, xpToday } from '../store/progress';
import { Ring } from './Stats';

/** Today's XP against the small daily goal. */
export function useDailyGoal() {
  const today = useProgress((s) => s.today);
  const xp = xpToday(today);
  return { xp, goal: DAILY_GOAL_XP, value: Math.min(1, xp / DAILY_GOAL_XP), met: xp >= DAILY_GOAL_XP };
}

export function goalLabel(xp: number, goal = DAILY_GOAL_XP) {
  return xp >= goal ? `Daily goal reached: ${xp} XP today` : `Daily goal: ${xp} of ${goal} XP`;
}

/**
 * Compact ring for the header with its figure beside it ("95/150"), so it never reads as a spinner.
 * Purely informative, so it is an image, not a control.
 */
export function GoalRingBadge() {
  const { xp, goal, value, met } = useDailyGoal();
  const label = goalLabel(xp, goal);
  return (
    <div role="img" aria-label={label} title={label} className="flex h-11 shrink-0 items-center gap-2 px-1 md:h-9 md:px-2">
      <Ring value={met ? 1 : value} size={20} stroke={2.5} color={met ? 'var(--good)' : undefined}>
        {met && <Check size={12} strokeWidth={2.5} className="text-good" />}
      </Ring>
      <span aria-hidden className="mono text-[13px] text-ink-2">
        {xp}/{goal}
      </span>
    </div>
  );
}
