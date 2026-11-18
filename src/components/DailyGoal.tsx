import { Check, Target } from 'lucide-react';
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

/** Compact ring for the header. Purely informative, so it is an image, not a control. */
export function GoalRingBadge() {
  const { xp, goal, value, met } = useDailyGoal();
  const label = goalLabel(xp, goal);
  return (
    <div role="img" aria-label={label} title={label} className="grid h-10 w-10 shrink-0 place-items-center">
      <Ring value={met ? 1 : value} size={32} stroke={3} color={met ? 'var(--good)' : undefined}>
        {met ? <Check size={15} strokeWidth={3} className="text-good" /> : <Target size={14} className={xp ? 'text-ink' : 'text-ink-3'} />}
      </Ring>
    </div>
  );
}
