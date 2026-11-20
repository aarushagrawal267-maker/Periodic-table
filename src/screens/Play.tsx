import { ArrowRight, ChevronRight, Star } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { ElementChip, tileRadius } from '../components/ElementTile';
import { SectionHeader } from '../components/SectionHeader';
import { MiniTable } from '../components/MiniTable';
import { bySymbol } from '../lib/elements';
import { REGIONS, regionById, type Region } from '../lib/regions';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { Game } from './Game';
import { Home } from './Home';

const el = (sym: string) => bySymbol.get(sym.toLowerCase())!;

/** A one-sentence caption ends without a period; longer copy keeps its punctuation. */
const caption = (s: string) => (/\.\s/.test(s) ? s : s.replace(/\.$/, ''));

export function PlayHub() {
  const regions = REGIONS.filter((r) => r.id !== 'full');
  const full = regionById('full');
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label">Place mode</p>
          <h1 className="t-title mt-2">Choose a region</h1>
          <p className="mt-3 max-w-xl text-ink-2">Each region is one puzzle. Clear it, then raise the difficulty, or take on all 118 at once.</p>
        </div>
        <DifficultyPicker />
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {regions.map((r) => (
          <RegionRow key={r.id} region={r} />
        ))}
      </div>
      {full && <FullTableCard region={full} />}

      <section className="mt-16" aria-labelledby="more-ways">
        <SectionHeader id="more-ways" title="More ways to play" sub="Quick rounds for when you have five minutes" />
        <div className="grid gap-4 md:grid-cols-3">
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
      {score !== undefined && <span className="num text-sm text-ink-2">{score.toLocaleString('en-US')}</span>}
    </span>
  );
}

function RegionRow({ region: r }: { region: Region }) {
  const set = useMemo(() => new Set(r.numbers), [r.numbers]);
  const { b, known, cleared } = useRegionProgress(r);
  return (
    <a href={`#/play/${r.id}`} className="card card-link flex items-center gap-4 p-4">
      <MiniTable highlight={set} className="w-24 shrink-0 sm:w-28" label={`${r.name} highlighted on the periodic table`} />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium">{r.name}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-ink-2">{caption(r.tagline)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <BestStars stars={b?.stars} score={b?.score} />
          <span className="meta">
            {known}/{r.numbers.length} mastered{cleared > 0 && ` · ${cleared}/3 cleared`}
          </span>
        </div>
      </div>
    </a>
  );
}

/** The whole table: the last and largest region, so the table itself is the bright element of the screen. */
function FullTableCard({ region: r }: { region: Region }) {
  const { b, known, cleared } = useRegionProgress(r);
  return (
    <a href={`#/play/${r.id}`} className="card card-link mt-4 grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
      <MiniTable className="w-full" label={`${r.name} highlighted on the periodic table`} />
      <div>
        <h2 className="t-heading">{r.name}</h2>
        <p className="mt-1 text-ink-2">{caption(r.tagline)}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <BestStars stars={b?.stars} score={b?.score} />
          <span className="meta">
            {known}/{r.numbers.length} mastered{cleared > 0 && ` · ${cleared}/3 cleared`}
          </span>
        </div>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-ink">
          Place all {r.numbers.length} <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </span>
      </div>
    </a>
  );
}

function ModeRow({ href, title, text, art }: { href: string; title: string; text: string; art: ReactNode }) {
  return (
    <a href={href} className="card card-link flex items-center gap-4 p-4 md:flex-col md:items-stretch md:gap-0">
      <div className="grid h-20 w-24 shrink-0 place-items-center rounded-control bg-surface-2 sm:w-28 md:h-28 md:w-full" aria-hidden>
        {art}
      </div>
      <div className="min-w-0 flex-1 md:mt-4">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="mt-1 text-sm text-ink-2">{text}</p>
      </div>
      <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-ink-3 md:hidden" aria-hidden />
    </a>
  );
}

/** A symbol and the name it pairs with, as the two cards of a match. */
export function MatchArt() {
  return (
    <span className="flex items-center gap-2">
      <ElementChip element={el('Fe')} size={36} />
      <span className="grid h-9 place-items-center rounded-tag border border-line-strong bg-surface px-2 text-xs font-medium text-ink-2">Iron</span>
    </span>
  );
}

/** The elements inside a phone battery, fireworks, a banana and bones. */
function LifeArt() {
  return (
    <span className="grid grid-cols-2 gap-1">
      {['Li', 'Sr', 'K', 'Ca'].map((s) => (
        <ElementChip key={s} element={el(s)} size={28} />
      ))}
    </span>
  );
}

/** A blank square on the chart and the four answer keys. */
export function QuizArt() {
  return (
    <span className="flex items-center gap-2">
      <span className="slot grid h-9 w-9 place-items-center text-sm text-ink-3" style={{ borderRadius: tileRadius(36) }}>
        ?
      </span>
      <span className="grid grid-cols-2 gap-1">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="kbd">
            {n}
          </span>
        ))}
      </span>
    </span>
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
