import type { ProgressData, RoundSummary } from '../store/progress';
import { DAILY_GOAL_XP } from './scoring';
import { REGIONS } from './regions';
import { ELEMENTS } from './elements';
import { CHAPTERS } from './chapters';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  check: (p: ProgressData, r?: RoundSummary) => boolean;
}

const mastered = (p: ProgressData) => Object.values(p.mastery).filter((m) => m.s >= 4).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-steps', name: 'First reaction', desc: 'Finish your first round', icon: 'FlaskConical', tier: 'bronze', check: (p) => p.stats.rounds >= 1 },
  { id: 'flawless', name: 'Flawless', desc: 'Finish a round with no mistakes and no hints', icon: 'Gem', tier: 'silver', check: (_p, r) => !!r && r.completed && r.mistakes === 0 && r.hints === 0 && r.correct >= 10 },
  { id: 'combo-10', name: 'Chain reaction', desc: 'Reach a combo of 10', icon: 'Zap', tier: 'silver', check: (p) => p.stats.bestCombo >= 10 },
  { id: 'combo-25', name: 'Critical mass', desc: 'Reach a combo of 25', icon: 'Atom', tier: 'gold', check: (p) => p.stats.bestCombo >= 25 },
  { id: 'speed', name: 'Catalyst', desc: 'Clear the first twenty in under 60 seconds', icon: 'Timer', tier: 'silver', check: (_p, r) => !!r && r.regionId === 'first-20' && r.completed && r.timeMs < 60000 },
  { id: 'all-regions', name: 'Cartographer', desc: 'Clear every region at least once', icon: 'Map', tier: 'gold', check: (p) => REGIONS.every((g) => Object.keys(p.best).some((k) => k.startsWith(g.id + ':'))) },
  { id: 'full-table', name: 'Grand unified', desc: 'Clear the full table of 118 elements', icon: 'Crown', tier: 'gold', check: (p) => Object.keys(p.best).some((k) => k.startsWith('full:')) },
  { id: 'expert', name: 'No safety net', desc: 'Clear any region on Expert', icon: 'Flame', tier: 'silver', check: (p) => Object.keys(p.best).some((k) => k.endsWith(':expert')) },
  { id: 'daily-1', name: 'Daily dose', desc: 'Complete a daily challenge', icon: 'CalendarCheck', tier: 'bronze', check: (p) => Object.values(p.daily.results).some((d) => d.stars > 0) },
  { id: 'daily-7', name: 'Half-life proof', desc: 'Keep a 7-day daily streak', icon: 'CalendarRange', tier: 'gold', check: (p) => p.daily.bestStreak >= 7 },
  { id: 'quiz-ace', name: 'Quiz ace', desc: 'Score 10 out of 10 in a quiz', icon: 'ListChecks', tier: 'silver', check: (_p, r) => !!r && r.kind === 'quiz' && r.correct === 10 },
  { id: 'chapter-1', name: 'First lesson', desc: 'Finish a chapter of the learning path', icon: 'GraduationCap', tier: 'bronze', check: (p) => CHAPTERS.some((c) => p.chapters[c.id]) },
  { id: 'chapter-all', name: 'Graduate', desc: 'Finish every chapter of the learning path', icon: 'GraduationCap', tier: 'gold', check: (p) => CHAPTERS.every((c) => p.chapters[c.id]) },
  { id: 'real-world', name: 'Everyday chemist', desc: 'Get every answer right in an In real life round', icon: 'House', tier: 'silver', check: (_p, r) => !!r && r.kind === 'life' && r.mistakes === 0 },
  { id: 'goal', name: 'Little and often', desc: 'Reach your daily goal', icon: 'Target', tier: 'bronze', check: (p) => p.today.xp >= DAILY_GOAL_XP },
  { id: 'explorer', name: 'Field notes', desc: 'Open 25 different element cards', icon: 'Telescope', tier: 'bronze', check: (p) => p.explored.length >= 25 },
  { id: 'encyclopedia', name: 'Encyclopedia', desc: 'Open every element card', icon: 'Library', tier: 'gold', check: (p) => p.explored.length >= ELEMENTS.length },
  { id: 'master-25', name: 'Rising chemist', desc: 'Master 25 elements', icon: 'BadgeCheck', tier: 'bronze', check: (p) => mastered(p) >= 25 },
  { id: 'master-all', name: 'Living table', desc: 'Master all 118 elements', icon: 'Trophy', tier: 'gold', check: (p) => mastered(p) >= ELEMENTS.length },
];
