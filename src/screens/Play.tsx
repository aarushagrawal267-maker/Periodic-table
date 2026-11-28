import { ArrowRight, Star } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { LifeArt, MatchArt, QuizArt, TimedArt } from '../components/ModeArt';
import { SectionHeader } from '../components/SectionHeader';
import { MiniTable } from '../components/MiniTable';
import { CHALLENGE_LEVELS, challengeCleared } from '../lib/challenge';
import { REGIONS, regionById, type Region } from '../lib/regions';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { Game } from './Game';
import { Home } from './Home';

/** A one-sentence caption ends without a period; longer copy keeps its punctuation. */
const caption = (s: string) => (/\.\s/.test(s) ? s : s.replace(/\.$/, ''));

export function PlayHub() {
  const regions = REGIONS.filter((r) => r.id !== 'full');
  const full = regionById('full');
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="label">Place mode</p>
          <h1 className="t-title mt-2">Choose a region</h1>
          <p className="mt-3 max-w-xl text-ink-2">Each region is one puzzle. Clear it, then raise the difficulty, or take on all 118 at once.</p>
        </div>
        <DifficultyPicker />
      </header>

      <div className="mt-8 grid auto-rows-fr gap-3 md:gap-4 lg:grid-cols-2">
        {regions.map((r) => (
          <RegionRow key={r.id} region={r} />
        ))}
      </div>
      {full && <FullTableCard region={full} />}
      <ChallengeCard />

      <section className="mt-12 md:mt-16" aria-labelledby="more-ways">
        <SectionHeader id="more-ways" title="More ways to play" sub="Quick rounds for when you have five minutes" />
        <div className="grid auto-rows-fr gap-3 md:gap-4 md:grid-cols-3">
          <ModeRow href="#/match" title="Match pairs" text="A relaxed memory game: flip cards and pair each symbol with its name" art={<MatchArt />} />
          <ModeRow href="#/life" title="In real life" text="Spot the elements inside phones, fireworks, bananas and your own bones" art={<LifeArt />} />
          <ModeRow href="#/quiz" title="Quick quiz" text="Ten questions, with extra practice on the elements you find hardest" art={<QuizArt />} />
        </div>
      </section>
    </div>
  );
}

/** Progress on a region at the current difficulty: best stars, best score, mastered and cleared counts. */
function useRegionProgress(r: Region) {
  const difficulty = useSettings((s) => s.difficulty);
  const best = useProgress((s) => s.best);
  const mastery = useProgress((s) => s.mastery);
  const b = best[`${r.id}:${difficulty}`];
  const known = r.numbers.filter((n) => (mastery[n]?.s ?? 0) >= 4).length;
  const cleared = DIFFICULTIES.filter((d) => best[`${r.id}:${d.id}`]).length;
  return { b, known, cleared };
}

function BestStars({ stars, score }: { stars?: number; score?: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-0.5" role="img" aria-label={stars !== undefined ? `${stars} stars, best ${score}` : 'Not cleared on this difficulty'}>
        {[0, 1, 2].map((i) => {
          const on = stars !== undefined && i < stars;
          return <Star key={i} size={16} strokeWidth={1.5} aria-hidden style={on ? { fill: 'var(--star)', color: 'var(--star-line)' } : { fill: 'var(--surface-2)', color: 'var(--ink-3)' }} />;
        })}
      </span>
      {score !== undefined && <span className="num text-sm text-ink-2">Best {score.toLocaleString('en-US')}</span>}
    </span>
  );
}

/** Mastered and cleared counts. "Cleared" drops to its own line as a unit when the column is narrow, never mid-phrase. */
function RegionCounts({ known, total, cleared }: { known: number; total: number; cleared: number }) {
  return (
    <p className="meta mt-1 flex flex-wrap gap-x-2">
      <span>
        {known}/{total} mastered
      </span>
      {cleared > 0 && (
        <>
          <span aria-hidden className="max-[359px]:hidden">·</span>
          <span className="max-[359px]:basis-full">cleared on {cleared} of 3 levels</span>
        </>
      )}
    </p>
  );
}

function RegionRow({ region: r }: { region: Region }) {
  const set = useMemo(() => new Set(r.numbers), [r.numbers]);
  const { b, known, cleared } = useRegionProgress(r);
  return (
    <a href={`#/play/${r.id}`} className="card card-link flex items-center gap-3 p-4 sm:gap-4">
      <MiniTable highlight={set} className="w-24 shrink-0 sm:w-28" label={`${r.name} highlighted on the periodic table`} />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium leading-6">{r.name}</h2>
        <p className="mt-1 text-sm leading-5 text-ink-2">{caption(r.tagline)}</p>
        <div className="mt-3">
          <BestStars stars={b?.stars} score={b?.score} />
        </div>
        <RegionCounts known={known} total={r.numbers.length} cleared={cleared} />
      </div>
    </a>
  );
}

/** The whole table: the last and largest region, so the table itself is the bright element of the screen. */
function FullTableCard({ region: r }: { region: Region }) {
  const { b, known, cleared } = useRegionProgress(r);
  return (
    <a href={`#/play/${r.id}`} className="card card-link mt-3 grid gap-4 p-4 sm:gap-6 sm:p-6 md:mt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
      <MiniTable className="w-full" label={`${r.name} highlighted on the periodic table`} />
      <div>
        <h2 className="t-heading">{r.name}</h2>
        <p className="mt-1 text-ink-2">{caption(r.tagline)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 sm:mt-5">
          <BestStars stars={b?.stars} score={b?.score} />
          <span className="meta">
            {known}/{r.numbers.length} mastered{cleared > 0 && ` · ${cleared}/3 cleared`}
          </span>
        </div>
        <span className="mt-4 inline-flex min-h-6 items-center gap-2 text-sm font-medium text-ink sm:mt-6">
          Place all {r.numbers.length} <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </span>
      </div>
    </a>
  );
}

/** The Timed Challenge: the classic six-level ladder against the clock. */
function ChallengeCard() {
  const best = useProgress((s) => s.best);
  const cleared = CHALLENGE_LEVELS.filter((l) => challengeCleared(best, l.id)).length;
  return (
    <a href="#/challenge" className="card card-link mt-3 flex items-center gap-3 p-4 sm:gap-6 sm:p-6 md:mt-4">
      <div className="min-h-20 w-24 shrink-0 self-stretch rounded-control bg-surface-2 sm:w-32 md:w-48 lg:w-56" aria-hidden>
        <TimedArt cleared={cleared} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium leading-6">Timed challenge</h2>
        <p className="mt-1 text-sm leading-5 text-ink-2">Six levels against the clock, from 10 elements up to all 118. Pause whenever you need to.</p>
        <p className="meta mt-3">{cleared}/6 levels cleared</p>
      </div>
      <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="hidden shrink-0 text-ink-2 sm:block" />
    </a>
  );
}

function ModeRow({ href, title, text, art }: { href: string; title: string; text: string; art: ReactNode }) {
  return (
    <a href={href} className="card card-link flex items-center gap-3 p-4 sm:gap-4 md:flex-col md:items-stretch md:gap-0">
      <div className="min-h-20 w-24 shrink-0 self-stretch rounded-control bg-surface-2 sm:w-28 md:h-28 md:w-full md:self-auto" aria-hidden>
        {art}
      </div>
      <div className="min-w-0 flex-1 md:mt-4">
        <h3 className="text-base font-medium leading-6">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-ink-2">{text}</p>
      </div>
    </a>
  );
}

export function RegionGame({ regionId }: { regionId: string }) {
  const region = regionById(regionId);
  const difficulty = useSettings((s) => s.difficulty);
  const [round, setRound] = useState(0);
  if (!region) return <Home />;
  const idx = REGIONS.indexOf(region);
  const next = REGIONS[idx + 1];
  const diffName = DIFFICULTIES.find((d) => d.id === difficulty)!.name;
  return (
    <Game
      key={`${region.id}-${round}-${difficulty}`}
      config={{ kind: 'place', title: region.name, subtitle: `${region.numbers.length} elements · ${diffName}`, targets: region.numbers, difficulty, regionId: region.id }}
      onExit={() => go('/play')}
      exitLabel="All regions"
      onReplay={() => setRound((r) => r + 1)}
      onNext={next ? () => go(`/play/${next.id}`, true) : undefined}
      nextLabel={next ? `Next: ${next.name}` : undefined}
    />
  );
}
