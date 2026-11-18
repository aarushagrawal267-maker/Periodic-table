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
  { id: 'first-steps', name: 'First Reaction', desc: 'Finish your first round.', icon: 'FlaskConical', tier: 'bronze', check: (p) => p.stats.rounds >= 1 },
  { id: 'flawless', name: 'Flawless', desc: 'Finish a round with no mistakes and no hints.', icon: 'Gem', tier: 'silver', check: (_p, r) => !!r && r.completed && r.mistakes === 0 && r.hints === 0 && r.correct >= 10 },
  { id: 'combo-10', name: 'Chain Reaction', desc: 'Reach a 10× combo.', icon: 'Zap', tier: 'silver', check: (p) => p.stats.bestCombo >= 10 },
  { id: 'combo-25', name: 'Critical Mass', desc: 'Reach a 25× combo.', icon: 'Atom', tier: 'gold', check: (p) => p.stats.bestCombo >= 25 },
  { id: 'speed', name: 'Catalyst', desc: 'Clear The First Twenty in under 60 seconds.', icon: 'Timer', tier: 'silver', check: (_p, r) => !!r && r.regionId === 'first-20' && r.completed && r.timeMs < 60000 },
  { id: 'all-regions', name: 'Cartographer', desc: 'Clear every region at least once.', icon: 'Map', tier: 'gold', check: (p) => REGIONS.every((g) => Object.keys(p.best).some((k) => k.startsWith(g.id + ':'))) },
  { id: 'full-table', name: 'Grand Unified', desc: 'Clear the full table of 118 elements.', icon: 'Crown', tier: 'gold', check: (p) => Object.keys(p.best).some((k) => k.startsWith('full:')) },
  { id: 'expert', name: 'No Safety Net', desc: 'Clear any region on Expert.', icon: 'Flame', tier: 'silver', check: (p) => Object.keys(p.best).some((k) => k.endsWith(':expert')) },
  { id: 'daily-1', name: 'Daily Dose', desc: 'Complete a daily challenge.', icon: 'CalendarCheck', tier: 'bronze', check: (p) => Object.keys(p.daily.results).length >= 1 },
  { id: 'daily-7', name: 'Half-Life Proof', desc: 'Keep a 7-day daily streak.', icon: 'CalendarRange', tier: 'gold', check: (p) => p.daily.bestStreak >= 7 },
  { id: 'quiz-ace', name: 'Quiz Ace', desc: 'Score 10 out of 10 in a quiz.', icon: 'BrainCircuit', tier: 'silver', check: (_p, r) => !!r && r.kind === 'quiz' && r.correct === 10 },
  { id: 'chapter-1', name: 'First Lesson', desc: 'Finish a chapter of the learning path.', icon: 'GraduationCap', tier: 'bronze', check: (p) => Object.keys(p.chapters).length >= 1 },
  { id: 'chapter-all', name: 'Graduate', desc: 'Finish every chapter of the learning path.', icon: 'GraduationCap', tier: 'gold', check: (p) => Object.keys(p.chapters).length >= CHAPTERS.length },
  { id: 'real-world', name: 'Everyday Chemist', desc: 'Get every answer right in an In Real Life round.', icon: 'House', tier: 'silver', check: (_p, r) => !!r && r.kind === 'life' && r.mistakes === 0 },
  { id: 'goal', name: 'Little and Often', desc: 'Reach your daily goal.', icon: 'Target', tier: 'bronze', check: (p) => p.today.xp >= DAILY_GOAL_XP },
  { id: 'explorer', name: 'Field Notes', desc: 'Open 25 different element cards.', icon: 'Telescope', tier: 'bronze', check: (p) => p.explored.length >= 25 },
  { id: 'encyclopedia', name: 'Encyclopedia', desc: 'Open every element card.', icon: 'Library', tier: 'gold', check: (p) => p.explored.length >= ELEMENTS.length },
  { id: 'master-25', name: 'Rising Chemist', desc: 'Master 25 elements.', icon: 'Sparkles', tier: 'bronze', check: (p) => mastered(p) >= 25 },
  { id: 'master-all', name: 'Living Table', desc: 'Master all 118 elements.', icon: 'Trophy', tier: 'gold', check: (p) => mastered(p) >= ELEMENTS.length },
];
