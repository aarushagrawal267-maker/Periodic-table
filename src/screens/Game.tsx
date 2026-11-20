import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { ArrowLeft, Lightbulb, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { ElementTile, tileRadius } from '../components/ElementTile';
import { DUR, EASE, tween } from '../components/motion';
import { PeriodicGrid, type CellRect } from '../components/PeriodicGrid';
import { AnimatedNumber, Elapsed } from '../components/Stats';
import { Sheet } from '../components/Sheet';
import { Results } from '../components/Results';
import { ELEMENTS, byNumber, catVar, type Element } from '../lib/elements';
import { createGame, gameReducer, hand, summarize, EXPERT_LIVES, HAND_SIZE } from '../lib/game';
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
  /** Label of the results screen's exit button. Say where it goes. */
  exitLabel?: string;
  /** Called once, on the first placement attempt or hint. The daily only counts as attempted from then on. */
  onFirstMove?: () => void;
}

export function Game({ config, onExit, onReplay, onNext, nextLabel, exitLabel, onFirstMove }: Props) {
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
  const [tip, setTip] = useState<{ id: number; text: string } | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const tileSize = useTrayTileSize(tilesRef);
  /** From sm the board may keep bigger cells; on phones it shrinks to 34 before it scrolls, inside the 16px gutter. */
  const wide = useWide();
  const bigBoard = config.targets.length > 40 || !!config.view;
  /** Where keyboard focus was when the last placement was attempted. */
  const focusFrom = useRef<FocusOrigin | null>(null);

  /** Polite announcement. Repeating the same text still gets read out. */
  const say = useCallback((msg: string) => setAnnounce((prev) => (prev === msg ? `${msg} ` : msg)), []);

  const placed = useMemo(() => new Set(state.placed), [state.placed]);
  const tiles = hand(state);
  const learner = config.difficulty === 'learner';
  const expert = config.difficulty === 'expert';

  // The first real move (a drop or a hint). Before it, leaving costs nothing, not even on the daily.
  const moved = state.event !== null || state.hints > 0;
  const firstMoveRef = useRef(onFirstMove);
  firstMoveRef.current = onFirstMove;
  useEffect(() => {
    if (moved) firstMoveRef.current?.();
  }, [moved]);
  const isDaily = config.kind === 'daily';

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
      setTip(null);
      say(`${e.name} placed. Plus ${ev.points} points.${state.combo >= 3 ? ` Combo ${state.combo}.` : ''}`);
    } else {
      sfx.miss();
      haptic([30, 40, 30]);
      const text = missTip(e, config.difficulty);
      setTip({ id: ev.id, text });
      say(`Not there. ${e.name} belongs somewhere else.${expert ? ` ${state.lives} lives left.` : ` ${text}`}`);
    }

    // Keep keyboard focus somewhere sensible (WCAG 2.4.3): the slot or tile that had it may be gone now.
    const from = focusFrom.current;
    focusFrom.current = null;
    if (!from || state.phase !== 'playing') return;
    const opts = { preventScroll: !from.visible };
    if (ev.kind === 'hit') {
      if (from.kind === 'slot') {
        const slots = [...(boardRef.current?.querySelectorAll<HTMLButtonElement>('button[data-slot]') ?? [])]
          .map((s) => ({ s, r: Number(s.dataset.row), c: Number(s.dataset.col) }))
          .sort((a, b) => a.r - b.r || a.c - b.c);
        const next = slots.find((x) => x.r > ev.row || (x.r === ev.row && x.c > ev.col)) ?? slots[slots.length - 1];
        if (next) {
          setFocusSlot(next.s.dataset.slot!);
          next.s.focus(opts);
          return;
        }
      }
      tilesRef.current?.querySelector<HTMLElement>('[data-tile]:not([inert])')?.focus(opts);
    } else if (from.kind === 'slot') {
      // A missed slot re-mounts to replay its flash; put focus back on it.
      boardRef.current?.querySelector<HTMLElement>(`[data-slot="${from.key}"]`)?.focus(opts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.event?.id]);

  // Hints are announced, not just shown (WCAG 4.1.3).
  useEffect(() => {
    if (state.hint) {
      const e = byNumber(state.hint);
      say(`Hint: ${e.name} goes ${whereIs(e)}.`);
    }
  }, [state.hint, say]);

  // Miss bubbles fade after about 3 seconds.
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 3200);
    return () => clearTimeout(t);
  }, [tip]);

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

  const placeAt = useCallback((n: number, row: number, col: number) => {
    focusFrom.current = currentFocusOrigin();
    dispatch({ type: 'place', number: n, row, col, now: Date.now() });
  }, []);

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
      const t = e.target instanceof HTMLElement ? e.target : null;
      // Never steal keys from dialogs or text fields.
      if (t?.closest('[role="dialog"], [role="alertdialog"], dialog')) return;
      if (t && (t.isContentEditable || t.closest('input, textarea, select'))) return;
      if (e.key === 'Escape') {
        if (state.selected !== null) dispatch({ type: 'select', number: null });
        return;
      }
      // Character shortcuts apply inside the board and tray, or when nothing interactive has focus
      // (the page, a heading). Never while another control such as "Leave round" has focus (WCAG 2.1.4).
      const inGame = !t || !!boardRef.current?.contains(t) || !!trayRef.current?.contains(t) || !t.closest(INTERACTIVE);
      if (!inGame || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const i = /^[1-5]$/.test(e.key) ? Number(e.key) - 1 : -1;
      if (i >= 0 && i < tiles.length) {
        dispatch({ type: 'select', number: tiles[i] });
        sfx.pick();
      } else if (e.key === 'h' || e.key === 'H') dispatch({ type: 'hint' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, state.selected, tiles]);

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
          aria-label={`${e.symbol}, ${e.name}, placed. Open details`}
          tabIndex={-1}
        >
          <motion.div
            className="h-full w-full"
            initial={fresh ? { scale: 1.12, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={tween(DUR.enter)}
          >
            <ElementTile element={e} size={rect.size} showNumber={rect.size >= 44} quietNumber />
          </motion.div>
          {fresh && (
            <>
              <span
                className="pointer-events-none absolute inset-0"
                style={{ borderRadius: tileRadius(rect.size), border: `2px solid ${catVar(e.category)}`, animation: 'ripple 0.7s var(--ease-out) forwards' }}
              />
              <motion.span
                key={state.event!.id}
                className="num pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-tag bg-bg px-1 text-sm font-medium text-good"
                initial={{ y: -4, opacity: 1 }}
                animate={{ y: -24, opacity: 0 }}
                transition={{ duration: 0.8, ease: EASE, opacity: { duration: 0.8, delay: 0.3, ease: EASE } }}
              >
                +{state.event!.points}
              </motion.span>
            </>
          )}
        </button>
      );
    }
    if (!targetSet.has(e.number)) {
      return <div className="h-full w-full bg-[var(--cell-empty)]" style={{ borderRadius: tileRadius(rect.size) }} aria-hidden />;
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
        aria-label={`Period ${e.period}, ${e.group ? `group ${e.group}` : 'f-block'}, empty${isHint ? ', hint' : ''}${state.selected ? `. Place ${byNumber(state.selected).name} here` : ''}`}
        className={`slot relative h-full w-full transition-[transform,background-color,border-color] duration-[var(--dur-press)] ease-out ${state.selected ? 'slot-armed' : ''} ${missed ? 'flash-bad' : ''} ${isHint ? 'is-target' : ''}`}
        style={{
          borderRadius: tileRadius(rect.size),
          background: isOver || isHint ? 'var(--accent-soft)' : tint,
          borderColor: isOver || isHint ? 'var(--accent)' : undefined,
          borderStyle: isOver || isHint ? 'solid' : undefined,
          transform: isOver ? 'scale(1.04)' : undefined,
          cursor: state.selected ? 'pointer' : 'default',
        }}
      />
    );
  };

  const progress = state.placed.length / config.targets.length;
  const guide = state.selected ? (
    <>
      Tap where <span className="font-medium text-ink">{byNumber(state.selected).name}</span> belongs
    </>
  ) : (
    <>Drag a tile onto the table, or tap a tile, then its cell</>
  );
  const mult = multiplier(state.combo);

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* HUD: quiet figures with labels. */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <button onClick={() => (state.phase === 'playing' && moved ? setConfirmLeave(true) : onExit())} className="icon-btn -ml-3 md:-ml-2" aria-label="Leave round">
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <h1 className="truncate text-base font-medium leading-6">{config.title}</h1>
              <span className="meta hidden truncate sm:inline">{config.subtitle}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="meter flex-1" role="progressbar" aria-valuenow={state.placed.length} aria-valuemin={0} aria-valuemax={config.targets.length} aria-label="Elements placed">
                <div className="meter-fill" style={{ transform: `scaleX(${progress})` }} />
              </div>
              <span className="meta">
                {state.placed.length}/{config.targets.length}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-6">
            {expert && (
              <div className="text-right" aria-label={`${state.lives} lives left`} role="img">
                <div className="text-xs leading-4 text-ink-3">Lives</div>
                <div className="num text-base font-medium leading-6">
                  <span className={state.lives <= 1 ? 'text-bad' : undefined}>{state.lives}</span>
                  <span className="text-ink-3">/{EXPERT_LIVES}</span>
                </div>
              </div>
            )}
            <div className={`hidden text-right ${learner ? '' : 'sm:block'}`}>
              <div className="text-xs leading-4 text-ink-3">Time</div>
              <div className="num text-base font-medium leading-6">
                <Elapsed start={state.startedAt} end={state.endedAt} running={state.phase === 'playing'} />
              </div>
            </div>
            <div className="min-w-12 text-right">
              <div className="text-xs leading-4 text-ink-3">Score</div>
              <div className="num text-base font-medium leading-6">
                <AnimatedNumber value={state.score} />
              </div>
            </div>
            <button onClick={() => setSettings({ sound: !sound })} className="icon-btn -mr-2 hidden sm:inline-grid" aria-label={sound ? 'Mute sounds' : 'Unmute sounds'}>
              {sound ? <Volume2 size={18} strokeWidth={1.5} /> : <VolumeX size={18} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </header>

      {/* Board */}
      <main ref={boardRef} className="relative z-10 flex flex-1 flex-col px-4 pb-2 pt-4 sm:px-6 sm:py-8">
        {/* The board sits centred between header and hand on every width, so no empty band is left above the tray.
            On phones it keeps the 16px page gutter like every other screen; a table too wide for it scrolls inside it. */}
        <div aria-hidden className="flex-1" />
        <div className="relative mx-auto w-full max-w-7xl">
          <ComboBadge combo={state.combo} mult={mult} />
          <PeriodicGrid
            numbers={config.view ?? config.targets}
            renderCell={renderCell}
            minCell={bigBoard || !wide ? 34 : 38}
            maxCell={72}
            showAxes
            className="pb-2 pt-6 sm:pt-8"
          />
          {/* On phones the guide sits under the table it talks about; from sm it sits under the tray. */}
          {/* A big board on a short phone needs every pixel above the tray, so there the guide steps aside rather than
              add a vertical scroll to a board that already scrolls sideways. */}
          <p className={`mt-4 text-balance text-center text-[13px] leading-5 text-ink-3 sm:hidden ${bigBoard ? '[@media(max-height:719px)]:hidden' : ''}`}>{guide}</p>
        </div>
        <div aria-hidden className="flex-1" />
      </main>

      {/* Tray */}
      <footer ref={trayRef} className="safe-bottom max-sm:pb-[max(16px,env(safe-area-inset-bottom))] sticky bottom-0 z-30 border-t border-line bg-bg">
        {/* Teaching note after a wrong drop. Screen readers get the same words from the live region. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-4 pb-3" aria-hidden>
          <AnimatePresence>
            {tip && (
              <motion.div
                key={tip.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={tween(DUR.menu)}
                className="flex max-w-[min(28rem,100%)] flex-wrap items-start gap-x-3 gap-y-1 rounded-control border border-line-strong bg-surface py-2 pl-3 pr-4 text-sm leading-5"
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                <span className="flex shrink-0 items-center gap-2 font-medium text-bad">
                  <span className="dot" style={{ background: 'var(--bad)' }} />
                  Not there
                </span>
                {tip.text && (
                  <span className="text-ink" data-testid="miss-tip">
                    {tip.text}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Phones: the count and the hint key share one line above the tiles, so five tiles fit the full width down to 320.
            From sm the key sits beside the tiles. */}
        <div className="mx-auto flex max-w-3xl flex-col-reverse gap-2 px-4 pt-2 sm:flex-row sm:items-center sm:justify-center sm:gap-6 sm:px-6 sm:pt-3">
          <div ref={tilesRef} className="flex min-w-0 items-center justify-center gap-1 min-[360px]:gap-2 sm:gap-3" role="group" aria-label="Elements to place">
            <AnimatePresence mode="popLayout" initial={false}>
              {tiles.map((n, i) => (
                <TrayButton
                  key={n}
                  e={byNumber(n)}
                  index={i}
                  difficulty={config.difficulty}
                  selected={state.selected === n}
                  missed={state.event?.kind === 'miss' && state.event.number === n}
                  dimmed={dragging === n}
                  size={tileSize}
                  onPointerDown={(ev) => onTileDown(ev, n)}
                  onPointerMove={onTileMove}
                  onPointerUp={onTileUp}
                  onPointerCancel={onTileCancel}
                  onActivate={() => {
                    dispatch({ type: 'select', number: n });
                    sfx.pick();
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 flex-row-reverse items-center justify-between gap-1 sm:flex-col sm:justify-center">
            <button
              onClick={() => dispatch({ type: 'hint' })}
              disabled={state.phase !== 'playing'}
              className="btn btn-secondary w-11 px-0 text-ink-2 disabled:text-ink-3 sm:h-12 sm:w-12"
              aria-label="Hint: show where the selected element goes (H)"
              title="Hint (H)"
            >
              <Lightbulb size={18} strokeWidth={1.5} />
            </button>
            <span className="meta">{state.queue.length} left</span>
          </div>
        </div>
        <p className="mx-auto mt-5 hidden max-w-3xl px-4 text-center text-[13px] leading-5 text-ink-3 sm:block">{guide}</p>
      </footer>

      {/* Drag ghost */}
      {dragging && (
        <div ref={ghost} className="pointer-events-none fixed left-0 top-0 z-[70] h-[84px] w-[72px]" style={{ filter: 'drop-shadow(0 8px 24px rgb(0 0 0 / 0.35))' }} aria-hidden>
          <TrayTile e={byNumber(dragging)} difficulty={config.difficulty} selected />
        </div>
      )}

      {/* Countdown */}
      <AnimatePresence>
        {state.phase === 'countdown' && count > 0 && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-bg" exit={{ opacity: 0 }} transition={tween(DUR.menu)}>
            <div className="text-center">
              <p className="text-ink-2">{config.title}</p>
              <div className="relative mt-2 h-28 w-40">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={count}
                    className="num absolute inset-0 grid place-items-center text-[112px] font-medium leading-none tracking-[-0.03em]"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={tween(DUR.menu)}
                  >
                    {count}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label="Leave round">
        <div className="p-6 pt-8 sm:pt-6">
          <h2 className="t-heading pr-12">{isDaily ? "Leave today's daily?" : 'Leave this round?'}</h2>
          <p className="mt-2 text-ink-2">
            {isDaily ? "Leaving now uses today's only try, and an unfinished daily has no score. A new puzzle comes at midnight." : "Your progress in this round won't be saved."}
          </p>
          <div className="mt-6 flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setConfirmLeave(false)}>
              Keep playing
            </button>
            <button className="btn btn-danger flex-1" onClick={onExit}>
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
          exitLabel={exitLabel}
        />
      )}
    </div>
  );
}

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [role="switch"], [role="radio"], [role="tab"], [role="link"]';

const ELEMENT_AT = new Map(ELEMENTS.map((e) => [`${e.row}-${e.col}`, e.number]));
const slotNumber = (key: string) => ELEMENT_AT.get(key) ?? -1;

/** "in period 2, group 1", or the f-block row for lanthanides and actinides. */
function whereIs(e: Element) {
  if (e.row === 9) return 'in the lanthanide row';
  if (e.row === 10) return 'in the actinide row';
  return `in period ${e.period}, group ${e.group}`;
}

/** Short nudge after a wrong drop: what the element's number tells you. More help on easier levels. */
function missTip(e: Element, difficulty: Difficulty) {
  // Expert gets no teaching note: the miss costs a life, shown in the figures above.
  if (difficulty === 'expert') return '';
  if (difficulty === 'learner') return `${e.name} is number ${e.number}, so it sits ${whereIs(e)}.`;
  return `${e.name} is number ${e.number}. Try counting along the rows.`;
}

interface FocusOrigin {
  kind: 'slot' | 'tile';
  key: string;
  /** Whether the user was moving focus with the keyboard. */
  visible: boolean;
}

function currentFocusOrigin(): FocusOrigin | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement)) return null;
  let visible = true;
  try {
    visible = a.matches(':focus-visible');
  } catch {
    /* very old browsers: assume keyboard */
  }
  const slot = a.closest<HTMLElement>('[data-slot]');
  if (slot) return { kind: 'slot', key: slot.dataset.slot!, visible };
  const tile = a.closest<HTMLElement>('[data-tile]');
  if (tile) return { kind: 'tile', key: tile.dataset.tile!, visible };
  return null;
}

interface TrayButtonProps {
  e: Element;
  index: number;
  difficulty: Difficulty;
  selected: boolean;
  missed: boolean;
  dimmed: boolean;
  /** Type size of the printed tile (see TrayTile). */
  size: number;
  onPointerDown: (ev: PointerEvent) => void;
  onPointerMove: (ev: PointerEvent) => void;
  onPointerUp: (ev: PointerEvent) => void;
  onPointerCancel: () => void;
  onActivate: () => void;
}

function TrayButton({ e, index, difficulty, selected, missed, dimmed, size, onActivate, ...pointer }: TrayButtonProps) {
  // While a placed tile animates out it must not take clicks or focus.
  const present = useIsPresent();
  const onKeyDown = (ev: KeyboardEvent<HTMLButtonElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (!ev.repeat) onActivate();
      return;
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const all = [...(ev.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-tile]:not([inert])') ?? [])];
      const i = all.indexOf(ev.currentTarget);
      const next = all[i + (ev.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        ev.preventDefault();
        next.focus();
      }
    }
  };
  return (
    <motion.button
      type="button"
      layout
      data-tile={e.number}
      aria-pressed={selected}
      // Starts with the visible symbol, so speech users can say "click Cl" (WCAG 2.5.3).
      aria-label={`${e.symbol}, ${e.name}${difficulty === 'learner' ? `, atomic number ${e.number}` : ''}`}
      aria-keyshortcuts={present ? String(index + 1) : undefined}
      inert={!present}
      tabIndex={present ? undefined : -1}
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: selected ? -8 : 0, opacity: dimmed ? 0.35 : 1 }}
      exit={{ y: -8, opacity: 0, scale: 0.92 }}
      transition={tween(DUR.menu)}
      {...(present ? pointer : {})}
      onKeyDown={present ? onKeyDown : undefined}
      className={`relative aspect-[15/17] min-h-0 min-w-0 max-w-[72px] flex-1 basis-0 cursor-grab touch-none rounded-control sm:aspect-auto sm:h-[84px] sm:w-[72px] sm:flex-none ${missed ? 'animate-shake' : ''}`}
      style={{ pointerEvents: present ? undefined : 'none' }}
    >
      <TrayTile e={e} difficulty={difficulty} selected={selected} size={size} />
      <kbd aria-hidden className="kbd absolute -bottom-3 left-1/2 hidden -translate-x-1/2 sm:inline-grid">
        {index + 1}
      </kbd>
    </motion.button>
  );
}

/**
 * Tray tiles are printed in plain ink on every level, so the puzzle is solved by position rather than by
 * matching category colours. A tile takes its category colour once it lands on the table.
 * Learner still shows the atomic number in the corner.
 */
function TrayTile({ e, difficulty, selected, size = 80 }: { e: Element; difficulty: Difficulty; selected: boolean; size?: number }) {
  const learner = difficulty === 'learner';
  return (
    <div className={`relative h-full w-full rounded-control ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}>
      <ElementTile
        element={e}
        size={size}
        showNumber={false}
        showName={difficulty !== 'expert'}
        // Names stay at 11px or more; a long one (Phosphorus on a 54px phone tile) breaks over two lines.
        minName={11}
        wrapName
        color="var(--ink-2)"
        // Small phone tiles: nudge the symbol down so the atomic number never overlaps it.
        className={`rounded-control ${learner ? 'pt-3 sm:pt-0' : ''}`}
      />
      {learner && (
        <span aria-hidden className="tile-number pointer-events-none absolute left-1.5 top-1.5 text-[11px] text-ink sm:left-2 sm:top-2 sm:text-xs">
          {e.number}
        </span>
      )}
    </div>
  );
}

const WIDE = '(min-width: 640px)';
/** True from the sm breakpoint (640px). */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

/**
 * Tray tiles are 72x84 from sm. On phones five of them share the tray's width (54 wide at 320, capped at 72), and
 * the printed type follows the tile so the symbol and name keep their proportions instead of overflowing it.
 * 80 is the type size the 60-72px tiles were drawn with.
 */
function useTrayTileSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(80);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia('(min-width: 640px)');
    const measure = () => {
      if (wide.matches) return setSize(80);
      const gap = parseFloat(getComputedStyle(el).columnGap) || 4;
      const tile = Math.min(72, (el.clientWidth - gap * (HAND_SIZE - 1)) / HAND_SIZE);
      setSize(Math.min(80, Math.round(tile * (80 / 60))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    wide.addEventListener('change', measure);
    return () => {
      ro.disconnect();
      wide.removeEventListener('change', measure);
    };
  }, [ref]);
  return size;
}

/** The combo, as a quiet annotation centred above the board: how many in a row, and the multiplier it earns. */
function ComboBadge({ combo, mult }: { combo: number; mult: number }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
      <AnimatePresence>
        {combo >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={tween(DUR.menu)}
            className="flex h-6 items-baseline gap-2 text-sm leading-6"
          >
            <span className="text-xs text-ink-3">Combo</span>
            <span className="num font-medium text-ink">{combo}</span>
            <span className="num font-medium text-accent">×{mult}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
