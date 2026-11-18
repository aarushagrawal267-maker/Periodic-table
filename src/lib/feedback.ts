import { useSettings } from '../store/settings';

let ctx: AudioContext | null = null;
function audio() {
  if (!useSettings.getState().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Pentatonic steps so rising combos always sound musical.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (semi: number, base = 523.25) => base * Math.pow(2, semi / 12);

export const sfx = {
  pick: () => tone(880, 0, 0.06, 'triangle', 0.05),
  hit: (combo: number) => {
    const s = SCALE[Math.min(combo, SCALE.length - 1)];
    tone(note(s), 0, 0.18, 'triangle', 0.11);
    tone(note(s + 7), 0.04, 0.22, 'sine', 0.06);
  },
  miss: () => {
    tone(196, 0, 0.16, 'sawtooth', 0.05);
    tone(155, 0.06, 0.2, 'sawtooth', 0.04);
  },
  tick: () => tone(1200, 0, 0.03, 'square', 0.02),
  win: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(note(s, 392), i * 0.09, 0.5, 'triangle', 0.09)),
  unlock: () => [12, 16, 19, 24].forEach((s, i) => tone(note(s), i * 0.07, 0.35, 'sine', 0.08)),
};

export function haptic(pattern: number | number[]) {
  if (!useSettings.getState().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
