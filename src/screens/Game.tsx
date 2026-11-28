import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Heart, Lightbulb, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ElementTile } from '../components/ElementTile';
import { PeriodicGrid, type CellRect } from '../components/PeriodicGrid';
import { AnimatedNumber, Elapsed } from '../components/Stats';
import { Sheet } from '../components/Sheet';
import { Results } from '../components/Results';
import { ELEMENTS, byNumber, catVar, type Element } from '../lib/elements';
import { createGame, gameReducer, hand, summarize, EXPERT_LIVES } from '../lib/game';
import { haptic, sfx } from '../lib/feedback';
import { multiplier } from '../lib/scoring';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings, type Difficulty } from '../store/settings';
import { announceAchievements, useUi } from '../store/ui';

export interface GameConfig {
  kind: 'place' | 'daily' | 'lesson';
  title: string;
  subtitle: string;
  targets: number[];
  /** Area of the table to show. Defaults to `targets`. */
  view?: number[];
  difficulty: Difficulty;
  regionId?: string;
  dailyKey?: string;
  order?: number[];
}

interface Props {
  config: GameConfig;
  onExit: () => void;
  onReplay?: () => void;
  onNext?: () => void;
  nextLabel?: string;
}

export function Game({ config, onExit, onReplay, onNext, nextLabel }: Props) {
  const [state, dispatch] = useReducer(gameReducer, config, (c) => createGame(c.targets, c.difficulty, c.order));
  const [result, setResult] = useState<{ summary: RoundSummary; outcome: RoundOutcome } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [focusSlot, setFocusSlot] = useState<string | null>(null);
  const recordRound = useProgress((s) => s.recordRound);
  const sound = useSettings((s) => s.sound);
  const setSettings = useSettings((s) => s.set);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const openDetail = useUi((s) => s.openDetail);
  const recorded = useRef(false);

  const placed = useMemo(() => new Set(state.placed), [state.placed]);
  const tiles = hand(state);
  const learner = config.difficulty === 'learner';
  const expert = config.difficulty === 'expert';

  // Countdown, then start.
  const [count, setCount] = useState(reduceMotion ? 0 : 3);
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    if (count <= 0) {
      dispatch({ type: 'start', now: Date.now() });
      return;
    }
    sfx.tick();
    const t = setTimeout(() => setCount((c) => c - 1), 650);
    return () => clearTimeout(t);
  }, [count, state.phase]);

  // Feedback for every placement attempt.
  useEffect(() => {
    const ev = state.event;
    if (!ev) return;
    const e = byNumber(ev.number);
    if (ev.kind === 'hit') {
      sfx.hit(state.combo - 1);
      haptic(12);
      setAnnounce(`${e.name} placed. Plus ${ev.points} points.${state.combo >= 3 ? ` Combo ${state.combo}.` : ''}`);
    } else {
      sfx.miss();
      haptic([30, 40, 30]);
      setAnnounce(`Not there. ${e.name} belongs somewhere else.${expert ? ` ${state.lives} lives left.` : ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.event?.id]);

  // Record the round once it ends.
  useEffect(() => {
    if (state.phase !== 'done' || recorded.current) return;
    recorded.current = true;
    const summary = summarize(state, config.kind, { regionId: config.regionId, dailyKey: config.dailyKey });
    const outcome = recordRound(summary);
    if (summary.completed) setTimeout(sfx.win, 250);
    setTimeout(() => setResult({ summary, outcome }), summary.completed ? 700 : 900);
    announceAchievements(outcome.unlocked);
  }, [state, config, recordRound]);

  const placeAt = useCallback(
    (n: number, row: number, col: number) => dispatch({ type: 'place', number: n, row, col, now: Date.now() }),
    [],
  );

  // ---- Pointer drag (mouse, pen and touch share one code path) ----
  const drag = useRef<{ n: number; x0: number; y0: number; active: boolean } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const slotAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]') ?? null;
  const moveGhost = (x: number, y: number) => {
    if (ghost.current) ghost.current.style.transform = `translate3d(${x - 36}px, ${y - 46}px, 0) rotate(-4deg)`;
  };

  const onTileDown = (e: PointerEvent, n: number) => {
    if (e.button !== 0 || state.phase !== 'playing') return;
    drag.current = { n, x0: e.clientX, y0: e.clientY, active: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onTileMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
      d.active = true;
      setDragging(d.n);
      if (state.selected !== d.n) dispatch({ type: 'select', number: d.n });
      sfx.pick();
      requestAnimationFrame(() => moveGhost(e.clientX, e.clientY));
    }
    if (d.active) {
      moveGhost(e.clientX, e.clientY);
      const slot = slotAt(e.clientX, e.clientY)?.dataset.slot ?? null;
      setOver((o) => (o === slot ? o : slot));
    }
  };
  const onTileUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.active) {
      setDragging(null);
      setOver(null);
      const slot = slotAt(e.clientX, e.clientY);
      if (slot) placeAt(d.n, Number(slot.dataset.row), Number(slot.dataset.col));
    } else {
      dispatch({ type: 'select', number: d.n });
      sfx.pick();
    }
  };
  const onTileCancel = () => {
    drag.current = null;
    setDragging(null);
    setOver(null);
  };

  // ---- Keyboard ----
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (state.phase !== 'playing' || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < tiles.length) {
        dispatch({ type: 'select', number: tiles[i] });
        sfx.pick();
      } else if (e.key.toLowerCase() === 'h') dispatch({ type: 'hint' });
      else if (e.key === 'Escape') dispatch({ type: 'select', number: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, tiles]);

  const onSlotKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const me = e.currentTarget;
    const r0 = Number(me.dataset.row);
    const c0 = Number(me.dataset.col);
    const slots = [...document.querySelectorAll<HTMLButtonElement>('[data-slot]')];
    let best: HTMLButtonElement | null = null;
    let bestScore = Infinity;
    for (const s of slots) {
      const dr = Number(s.dataset.row) - r0;
      const dc = Number(s.dataset.col) - c0;
      const along = dr * d[0] + dc * d[1];
      if (along <= 0) continue;
      const across = Math.abs(d[0] ? dc : dr);
      const score = along + across * 3;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best) {
      setFocusSlot(best.dataset.slot!);
      best.focus();
    }
  };

  const hintTarget = state.hint ? byNumber(state.hint) : null;
  const firstSlotKey = useMemo(() => {
    const first = config.targets.map(byNumber).filter((e) => !placed.has(e.number)).sort((a, b) => a.row - b.row || a.col - b.col)[0];
    return first ? `${first.row}-${first.col}` : null;
  }, [config.targets, placed]);
  const rovingKey = focusSlot && !placed.has(slotNumber(focusSlot)) ? focusSlot : firstSlotKey;
  const targetSet = useMemo(() => new Set(config.targets), [config.targets]);

  const renderCell = (e: Element, rect: CellRect) => {
    const key = `${e.row}-${e.col}`;
    if (placed.has(e.number)) {
      const fresh = state.event?.kind === 'hit' && state.event.number === e.number;
      return (
        <button
          className="relative block h-full w-full"
          onClick={() => openDetail(e.number)}
          aria-label={`${e.name}, placed. Open details`}
          tabIndex={-1}
        >
          <motion.div
            className="h-full w-full"
            initial={fresh ? { scale: 1.12, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <ElementTile element={e} size={rect.size} showNumber={rect.size >= 44} />
          </motion.div>
          {fresh && (
            <>
              <span
                className="pointer-events-none absolute inset-0 rounded-lg"
                style={{ border: `2px solid ${catVar(e.category)}`, animation: 'ripple 0.7s var(--ease) forwards' }}
              />
              <motion.span
                key={state.event!.id}
                className="font-display pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 whitespace-nowrap text-sm font-medium text-good"
                initial={{ y: 0, opacity: 1 }}
                animate={{ y: -24, opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                +{state.event!.points}
              </motion.span>
            </>
          )}
        </button>
      );
    }
    if (!targetSet.has(e.number)) {
      return <div className="h-full w-full rounded-md bg-surface opacity-50" style={{ borderRadius: Math.max(5, rect.size * 0.14) }} aria-hidden />;
    }
    const missed = state.event?.kind === 'miss' && state.event.row === e.row && state.event.col === e.col;
    const isOver = over === key;
    const isHint = hintTarget?.number === e.number;
    const tint = learner ? `color-mix(in oklab, ${catVar(e.category)} 16%, var(--cell-empty))` : undefined;
    return (
      <button
        key={missed ? state.event!.id : 'slot'}
        data-slot={key}
        data-row={e.row}
        data-col={e.col}
        tabIndex={rovingKey === key ? 0 : -1}
        onFocus={() => setFocusSlot(key)}
        onKeyDown={onSlotKey}
        onClick={() => state.selected && placeAt(state.selected, e.row, e.col)}
        aria-label={`Period ${e.period}, ${e.group ? `group ${e.group}` : 'f-block'}, empty${state.selected ? `. Place ${byNumber(state.selected).name} here` : ''}`}
        className={`slot relative h-full w-full transition-[transform,background,border-color] duration-150 ${state.selected ? 'slot-armed' : ''} ${missed ? 'flash-bad' : ''} ${isHint ? '' : ''}`}
        style={{
          borderRadius: Math.max(5, rect.size * 0.14),
          background: isOver ? 'color-mix(in oklab, var(--accent) 22%, transparent)' : isHint ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : tint,
          borderColor: isOver || isHint ? 'var(--accent)' : learner ? `color-mix(in oklab, ${catVar(e.category)} 40%, transparent)` : undefined,
          borderStyle: isOver || isHint ? 'solid' : undefined,
          transform: isOver ? 'scale(1.08)' : undefined,
          cursor: state.selected ? 'pointer' : 'default',
        }}
      />
    );
  };

  const progress = state.placed.length / config.targets.length;
  const mult = multiplier(state.combo);

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* HUD */}
      <header className="solid border border-line sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-6">
          <button onClick={() => (state.phase === 'playing' && state.placed.length ? setConfirmLeave(true) : onExit())} className="btn-ghost grid h-10 w-10 shrink-0 place-items-center rounded-[10px]" aria-label="Leave round">
            <ArrowLeft size={18} strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h1 className="font-display truncate text-base font-medium sm:text-lg">{config.title}</h1>
              <span className="hidden truncate text-xs text-ink-3 sm:inline">{config.subtitle}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={state.placed.length} aria-valuemin={0} aria-valuemax={config.targets.length} aria-label="Elements placed">
                <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <span className="text-xs tabular-nums text-ink-2">
                {state.placed.length}/{config.targets.length}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {expert && (
              <div className="flex gap-0.5" aria-label={`${state.lives} lives left`}>
                {Array.from({ length: EXPERT_LIVES }, (_, i) => (
                  <Heart key={i} size={16} strokeWidth={1.75} className={i < state.lives ? 'fill-bad text-bad' : 'text-ink-3'} />
                ))}
              </div>
            )}
            <div className={`hidden text-right ${learner ? '' : 'sm:block'}`}>
              <div className="text-xs text-ink-3">Time</div>
              <div className="font-display text-sm font-medium tabular-nums">
                <Elapsed start={state.startedAt} end={state.endedAt} running={state.phase === 'playing'} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-3">Score</div>
              <div className="font-display text-sm font-medium sm:text-base">
                <AnimatedNumber value={state.score} />
              </div>
            </div>
            <button onClick={() => setSettings({ sound: !sound })} className="btn-ghost hidden h-10 w-10 place-items-center rounded-[10px] sm:grid" aria-label={sound ? 'Mute sounds' : 'Unmute sounds'}>
              {sound ? <Volume2 size={16} strokeWidth={1.75} /> : <VolumeX size={16} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>

      {/* Board */}
      <main className="relative z-10 flex flex-1 flex-col justify-center px-1 py-4 sm:px-6">
        <div className="relative mx-auto w-full max-w-7xl">
          <ComboBadge combo={state.combo} mult={mult} />
          <PeriodicGrid
            numbers={config.view ?? config.targets}
            renderCell={renderCell}
            minCell={config.targets.length > 40 || config.view ? 34 : 38}
            maxCell={72}
            showAxes
            className="pb-2 pt-6"
          />
        </div>
      </main>

      {/* Tray */}
      <footer className="solid border border-line safe-bottom sticky bottom-0 z-30 border-x-0 border-b-0">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 pt-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 sm:gap-3" role="listbox" aria-label="Elements to place">
            <AnimatePresence mode="popLayout" initial={false}>
              {tiles.map((n, i) => {
                const e = byNumber(n);
                const sel = state.selected === n;
                const miss = state.event?.kind === 'miss' && state.event.number === n;
                return (
                  <motion.button
                    key={n}
                    layout
                    role="option"
                    aria-selected={sel}
                    aria-label={`${e.name}${learner ? `, atomic number ${e.number}` : ''}${sel ? ', selected' : ''}`}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: sel ? -6 : 0, opacity: dragging === n ? 0.35 : 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    onPointerDown={(ev) => onTileDown(ev, n)}
                    onPointerMove={onTileMove}
                    onPointerUp={onTileUp}
                    onPointerCancel={onTileCancel}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        dispatch({ type: 'select', number: n });
                        sfx.pick();
                      }
                    }}
                    className={`relative h-[66px] w-[57px] shrink-0 cursor-grab touch-none rounded-xl sm:h-[84px] sm:w-[74px] ${miss ? 'animate-shake' : ''}`}
                  >
                    <TrayTile e={e} difficulty={config.difficulty} selected={sel} />
                    <kbd className="solid absolute -bottom-2 left-1/2 hidden -translate-x-1/2 rounded-md border border-line px-1.5 text-[11px] font-medium leading-4 text-ink-3 sm:block">{i + 1}</kbd>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              onClick={() => dispatch({ type: 'hint' })}
              disabled={state.phase !== 'playing'}
              className="btn-ghost grid h-11 w-11 place-items-center rounded-[10px] disabled:opacity-40 sm:h-12 sm:w-12"
              aria-label="Hint: show where the selected element goes (H)"
              title="Hint (H)"
            >
              <Lightbulb size={18} strokeWidth={1.75} className="text-ink-2" />
            </button>
            <span className="text-[11px] tabular-nums text-ink-3">{state.queue.length} left</span>
          </div>
        </div>
        <p className="mx-auto mt-2.5 max-w-3xl px-4 text-center text-xs text-ink-3">
          {state.selected ? (
            <>
              Tap where <span className="font-medium text-ink-2">{byNumber(state.selected).name}</span> belongs
            </>
          ) : (
            <>Drag a tile onto the table, or tap a tile then tap its cell</>
          )}
        </p>
      </footer>

      {/* Drag ghost */}
      {dragging && (
        <div ref={ghost} className="pointer-events-none fixed left-0 top-0 z-[70] h-[86px] w-[74px]" style={{ filter: 'drop-shadow(0 8px 16px rgb(0 0 0 / 0.25))' }} aria-hidden>
          <TrayTile e={byNumber(dragging)} difficulty={config.difficulty} selected />
        </div>
      )}

      {/* Countdown */}
      <AnimatePresence>
        {state.phase === 'countdown' && count > 0 && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-bg/90" exit={{ opacity: 0 }}>
            <div className="text-center">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={count}
                  className="font-display text-[128px] font-medium leading-none tabular-nums"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {count}
                </motion.div>
              </AnimatePresence>
              <p className="mt-4 text-ink-2">{config.title}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label="Leave round">
        <div className="p-7 pt-9">
          <h2 className="font-display text-2xl font-medium">Leave this round?</h2>
          <p className="mt-2 text-ink-2">Your progress in this round won't be saved.</p>
          <div className="mt-6 flex gap-3">
            <button className="btn-ghost h-12 flex-1 rounded-[10px] font-medium" onClick={() => setConfirmLeave(false)}>
              Keep playing
            </button>
            <button className="h-12 flex-1 rounded-[10px] bg-bad/15 font-medium text-bad transition-colors hover:bg-bad/20" onClick={onExit}>
              Leave
            </button>
          </div>
        </div>
      </Sheet>

      {result && (
        <Results
          summary={result.summary}
          outcome={result.outcome}
          title={config.title}
          total={config.targets.length}
          onReplay={onReplay}
          onNext={onNext}
          nextLabel={nextLabel}
          onExit={onExit}
        />
      )}
    </div>
  );
}

const ELEMENT_AT = new Map(ELEMENTS.map((e) => [`${e.row}-${e.col}`, e.number]));
const slotNumber = (key: string) => ELEMENT_AT.get(key) ?? -1;

function TrayTile({ e, difficulty, selected }: { e: Element; difficulty: Difficulty; selected: boolean }) {
  return (
    <div className={`h-full w-full rounded-xl ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`} style={{ '--c': catVar(e.category) } as CSSProperties}>
      <ElementTile
        element={e}
        size={74}
        showNumber={difficulty === 'learner'}
        showName={difficulty !== 'expert'}
        color={difficulty === 'learner' ? undefined : 'var(--ink-3)'}
        className="rounded-xl"
      />
    </div>
  );
}

function ComboBadge({ combo, mult }: { combo: number; mult: number }) {
  return (
    <div className="pointer-events-none absolute right-2 top-0 z-20 sm:right-4">
      <AnimatePresence>
        {combo >= 3 && (
          <motion.div
            key={mult}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-1"
          >
            <span className="text-xs text-ink-2">Combo</span>
            <motion.span key={combo} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="font-display text-sm font-medium tabular-nums">
              {combo}
            </motion.span>
            <span className="font-display text-sm font-medium tabular-nums text-accent-ink">×{mult}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

