import type { CSSProperties, ReactNode } from 'react';
import { CHALLENGE_LEVELS } from '../lib/challenge';
import { byNumber, bySymbol, catVar, type Element } from '../lib/elements';
import '../styles/art.css';

/*
 * Illustrations for the game-mode cards (Home "More ways to practise", Play "More ways to play", the Timed challenge).
 * Each is a small flat scene made of the product's own material: element squares printed like the wall chart
 * (category tint, category edge, the atomic number in the corner) on quiet card stock. No gradients, glows or emoji.
 *
 * Every illustration fills the box it is put in and draws one of two compositions, picked by the box's own shape
 * with a container query (src/styles/art.css): a wide scene (220 x 80) for the Home and desktop cards, a square one
 * (100 x 100) for the narrow phone column on Play. Both scale with their SVG viewBox, so nothing is ever cut off, and
 * no text renders under 9px in the boxes the app uses. Colours are CSS variables only, so light, dark and the
 * colour-blind palette all work. Decorative: aria-hidden, no pointer events.
 */

const el = (sym: string) => bySymbol.get(sym.toLowerCase())!;
const tint = (e: Element) => ({ '--c': catVar(e.category) }) as CSSProperties;

/** The frame every illustration shares: both compositions, one shown at a time by the box's aspect ratio. */
function Art({ name, wide, square }: { name: string; wide: ReactNode; square: ReactNode }) {
  return (
    <span className={`mode-art mode-art-${name}`} aria-hidden="true">
      <svg className="mode-art-wide" viewBox="0 0 220 80" preserveAspectRatio="xMidYMid meet" focusable="false">
        {wide}
      </svg>
      <svg className="mode-art-square" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" focusable="false">
        {square}
      </svg>
    </span>
  );
}

/**
 * An element square as the chart prints it: category tint, category edge, the corner number in mono, the symbol.
 * `empty` prints only the edge (a step not yet climbed), `strong` prints it as the mini table does (a tiny square that
 * must read at a glance); `symbol` replaces the symbol (the quiz's "?").
 */
function Tile({ e, x, y, s, num = 0, sym = 0, symbol, showNumber = true, empty = false, strong = false }: { e: Element; x: number; y: number; s: number; num?: number; sym?: number; symbol?: string; showNumber?: boolean; empty?: boolean; strong?: boolean }) {
  const r = Math.max(2, Math.round(s * 0.17));
  // In a small square the corner number would sit on the symbol's cap height: lift one, lower the other.
  const small = s < 40;
  return (
    <g style={tint(e)}>
      <rect className={empty ? 'art-tile-empty' : strong ? 'art-tile-strong' : 'art-tile'} x={x + 0.5} y={y + 0.5} width={s - 1} height={s - 1} rx={r} />
      {num > 0 && showNumber && (
        <text className="art-num art-tile-ink" x={x + s * 0.12} y={y + s * (small ? 0.08 : 0.1)} fontSize={num} dominantBaseline="hanging">
          {e.number}
        </text>
      )}
      {sym > 0 && (
        <text className="art-sym art-tile-ink" x={x + s / 2} y={y + s * (num > 0 && showNumber ? (small ? 0.68 : 0.62) : 0.52)} fontSize={sym} textAnchor="middle" dominantBaseline="central">
          {symbol ?? e.symbol}
        </text>
      )}
    </g>
  );
}

/** A small tick, as the quiz marks the right answer. */
const Tick = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => <path className="art-good-line" d={`M${x} ${y} l${3.5 * s} ${3.5 * s} l${7 * s} ${-8 * s}`} />;

/* ---------------------------------------------------------------- Quick quiz */

const QUIZ_OPTIONS = ['Co', 'Fe', 'Mn', 'Ni'];
const QUIZ_RIGHT = 1;

function QuizAnswer({ x, y, w, h, i, keycap }: { x: number; y: number; w: number; h: number; i: number; keycap: boolean }) {
  const right = i === QUIZ_RIGHT;
  const label = QUIZ_OPTIONS[i];
  if (keycap) {
    return (
      <g>
        <rect className={right ? 'art-answer-right' : 'art-paper'} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={6} />
        {right ? (
          <Tick x={x + 9} y={y + h / 2} />
        ) : (
          <>
            <rect className="art-key" x={x + 6} y={y + (h - 17) / 2} width={17} height={17} rx={4} />
            <text className="art-num art-ink-2" x={x + 14.5} y={y + h / 2 + 0.5} fontSize={12} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
          </>
        )}
        <text className="art-sym art-ink" x={x + 30} y={y + h / 2 + 0.5} fontSize={14} dominantBaseline="central">
          {label}
        </text>
      </g>
    );
  }
  return (
    <g>
      <rect className={right ? 'art-answer-right' : 'art-paper'} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={5} />
      {right && <Tick x={x + 6} y={y + h / 2} s={0.8} />}
      <text className="art-sym art-ink" x={x + w / 2 + (right ? 5 : 0)} y={y + h / 2 + 0.5} fontSize={13} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </g>
  );
}

/** The quiz as it plays: element 26 with a "?" for its symbol, and four answers with the right one ticked. */
export function QuizArt() {
  const fe = el('Fe');
  return (
    <Art
      name="quiz"
      wide={
        <>
          <Tile e={fe} x={14} y={10} s={60} num={13} sym={30} symbol="?" />
          {QUIZ_OPTIONS.map((_, i) => (
            <QuizAnswer key={i} x={86 + (i % 2) * 63} y={10 + Math.floor(i / 2) * 33} w={59} h={27} i={i} keycap />
          ))}
        </>
      }
      square={
        <>
          <Tile e={fe} x={29} y={5} s={42} num={11} sym={21} symbol="?" />
          {QUIZ_OPTIONS.map((_, i) => (
            <QuizAnswer key={i} x={6 + (i % 2) * 46} y={54 + Math.floor(i / 2) * 22} w={42} h={19} i={i} keycap={false} />
          ))}
        </>
      }
    />
  );
}

/* --------------------------------------------------------------- Match pairs */

/** A face-up card of a found pair: the card takes the element's printed colour, as in the game. */
function PairCard({ e, cx, cy, w, h, rot, face, num, sym }: { e: Element; cx: number; cy: number; w: number; h: number; rot: number; face: 'symbol' | 'name'; num: number; sym: number }) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const t = Math.round(w * 0.8);
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} style={tint(e)}>
      <rect className="art-card-found" x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={8} />
      {face === 'symbol' ? (
        <Tile e={e} x={cx - t / 2} y={cy - t / 2} s={t} num={num} sym={sym} />
      ) : (
        <text className="art-sym art-tile-ink" x={cx} y={cy + 0.5} fontSize={sym * 0.68} textAnchor="middle" dominantBaseline="central">
          {e.name}
        </text>
      )}
    </g>
  );
}

/** A face-down card, as the game draws its back: plain card stock and one empty place from the table. */
function BackCard({ cx, cy, w, h, rot = 0 }: { cx: number; cy: number; w: number; h: number; rot?: number }) {
  const s = Math.round(w * 0.3);
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <rect className="art-paper" x={cx - w / 2 + 0.5} y={cy - h / 2 + 0.5} width={w - 1} height={h - 1} rx={8} />
      <rect className="art-slot" x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={3} />
    </g>
  );
}

/** Two cards of a pair, Fe and Iron, leaning together with a tick, and one card still face down. */
export function MatchArt() {
  const fe = el('Fe');
  return (
    <Art
      name="match"
      wide={
        <>
          <BackCard cx={164} cy={41} w={48} h={62} rot={3} />
          <PairCard e={fe} cx={62} cy={42} w={48} h={62} rot={-7} face="symbol" num={12} sym={17} />
          <PairCard e={fe} cx={109} cy={41} w={48} h={62} rot={6} face="name" num={12} sym={21} />
          <g>
            <circle className="art-badge" cx={86} cy={13} r={9} />
            <Tick x={81.5} y={13.5} s={0.85} />
          </g>
        </>
      }
      square={
        <>
          <BackCard cx={50} cy={31} w={38} h={48} />
          <PairCard e={fe} cx={31} cy={65} w={38} h={48} rot={-8} face="symbol" num={11} sym={14} />
          <PairCard e={fe} cx={69} cy={63} w={38} h={48} rot={7} face="name" num={11} sym={19} />
        </>
      }
    />
  );
}

/* -------------------------------------------------------------- In real life */

/** A smartphone in flat line, with the chip and battery inside showing through. */
function Phone({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const sx = x + 4;
  const sy = y + 8;
  const sw = w - 8;
  const sh = h - 16;
  const cs = Math.round(sw * 0.38);
  const cx = x + w / 2;
  const chipY = sy + sh * 0.18;
  const batW = Math.round(sw * 0.34);
  const batH = Math.round(sh * 0.32);
  const batY = sy + sh * 0.56;
  return (
    <g>
      <rect className="art-device" x={x} y={y} width={w} height={h} rx={8} />
      <rect className="art-screen" x={sx} y={sy} width={sw} height={sh} rx={3} />
      <line className="art-line" x1={cx - 5} y1={y + 4.5} x2={cx + 5} y2={y + 4.5} />
      <line className="art-line" x1={cx - 6} y1={y + h - 4} x2={cx + 6} y2={y + h - 4} />
      {/* The processor: a square with pins. */}
      <rect className="art-part" x={cx - cs / 2} y={chipY} width={cs} height={cs} rx={1.5} />
      {[0.3, 0.7].map((f) => (
        <g key={f}>
          <line className="art-line" x1={cx - cs / 2 - 2.5} y1={chipY + cs * f} x2={cx - cs / 2} y2={chipY + cs * f} />
          <line className="art-line" x1={cx + cs / 2} y1={chipY + cs * f} x2={cx + cs / 2 + 2.5} y2={chipY + cs * f} />
        </g>
      ))}
      {/* The battery, with its charge. */}
      <rect className="art-part" x={cx - batW / 2} y={batY} width={batW} height={batH} rx={1.5} />
      <rect className="art-part-fill" x={cx - batW / 2 + 2} y={batY + batH * 0.45} width={batW - 4} height={batH * 0.55 - 2} rx={0.5} />
      <rect className="art-part-fill" x={cx - 2} y={batY - 2} width={4} height={2} />
    </g>
  );
}

/** A label line from an element chip to the part it names, ending in a pin dot. */
const Leader = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
  <g>
    <line className="art-leader" x1={x1} y1={y1} x2={x2} y2={y2} />
    <circle className="art-pin" cx={x2} cy={y2} r={2} />
  </g>
);

/** A smartphone with its elements pinned on like labels: indium in the touchscreen, silicon in the chip, lithium in the battery. */
export function LifeArt() {
  const [li, si, inn] = [el('Li'), el('Si'), el('In')];
  return (
    <Art
      name="life"
      wide={
        <>
          <Phone x={92} y={6} w={40} h={68} />
          <Leader x1={78} y1={22} x2={98} y2={18} />
          <Leader x1={78} y1={60} x2={106} y2={53} />
          <Leader x1={146} y1={38} x2={122} y2={27} />
          <Tile e={inn} x={46} y={6} s={32} num={12} sym={15} />
          <Tile e={li} x={46} y={44} s={32} num={12} sym={15} />
          <Tile e={si} x={146} y={22} s={32} num={12} sym={15} />
        </>
      }
      square={
        <>
          <Phone x={36} y={24} w={28} h={70} />
          <Leader x1={34} y1={22} x2={42} y2={35} />
          <Leader x1={66} y1={22} x2={56} y2={44} />
          <Leader x1={66} y1={76} x2={54} y2={71} />
          <Tile e={inn} x={6} y={6} s={28} num={11} sym={13} />
          <Tile e={si} x={66} y={6} s={28} num={11} sym={13} />
          <Tile e={li} x={66} y={62} s={28} num={11} sym={13} />
        </>
      }
    />
  );
}

/* ----------------------------------------------------------- Timed challenge */

/** Steps of the ladder: level k is k+1 squares tall, each square an element from inside that level, lightest at the bottom. */
const LADDER = CHALLENGE_LEVELS.map((l, k) => Array.from({ length: k + 1 }, (_, j) => byNumber(Math.round(((j + 1) / (k + 1)) * l.numbers.length))));

/** A flat stopwatch: crown, side button, twelve ticks, the elapsed time swept in the accent, one hand. */
function Stopwatch({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const sweep = 150;
  const ar = r - 8;
  const pt = (deg: number, rr: number) => [cx + rr * Math.sin((deg * Math.PI) / 180), cy - rr * Math.cos((deg * Math.PI) / 180)] as const;
  const [ex, ey] = pt(sweep, ar);
  const [hx, hy] = pt(sweep, ar - 1);
  const [bx, by] = pt(45, r + 1);
  return (
    <g>
      <rect className="art-device" x={cx - 3} y={cy - r - 7} width={6} height={7} rx={1} />
      <rect className="art-device" x={cx - 7} y={cy - r - 11} width={14} height={5} rx={2} />
      <rect className="art-device" x={bx - 3} y={by - 4} width={6} height={6} rx={1} transform={`rotate(45 ${bx} ${by})`} />
      <circle className="art-device" cx={cx} cy={cy} r={r} />
      {Array.from({ length: 12 }, (_, i) => {
        const [x1, y1] = pt(i * 30, r - (i % 3 === 0 ? 6 : 4.5));
        const [x2, y2] = pt(i * 30, r - 2.5);
        return <line key={i} className="art-tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <circle className="art-track" cx={cx} cy={cy} r={ar} />
      <path className="art-sweep" d={`M${cx} ${cy - ar} A${ar} ${ar} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`} />
      <line className="art-hand" x1={cx} y1={cy} x2={hx.toFixed(2)} y2={hy.toFixed(2)} />
      <circle className="art-hub" cx={cx} cy={cy} r={2.5} />
    </g>
  );
}

/** Six steps of tiny element squares, the cleared levels printed in full, the rest only their edge. */
function Ladder({ x, bottom, s, gap, cleared }: { x: number; bottom: number; s: number; gap: number; cleared: number }) {
  return (
    <g>
      {LADDER.map((col, k) =>
        col.map((e, j) => <Tile key={`${k}-${j}`} e={e} x={x + k * (s + gap)} y={bottom - s - j * (s + gap)} s={s} empty={k >= cleared} strong />),
      )}
    </g>
  );
}

/** Race the clock, climb the levels: a stopwatch beside the six-step ladder, filled up to the levels cleared. */
export function TimedArt({ cleared = 0 }: { cleared?: number }) {
  return (
    <Art
      name="timed"
      wide={
        <>
          <Stopwatch cx={66} cy={45} r={28} />
          <Ladder x={114} bottom={75} s={10} gap={2} cleared={cleared} />
        </>
      }
      square={
        <>
          <Ladder x={32} bottom={95} s={9} gap={2} cleared={cleared} />
          <Stopwatch cx={33} cy={40} r={22} />
        </>
      }
    />
  );
}
