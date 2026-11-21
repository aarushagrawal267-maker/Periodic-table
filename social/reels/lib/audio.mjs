// The soundtrack, synthesised from scratch so every reel is royalty-free: a soft pad and pluck bed with a light
// beat, plus ticks on countdowns, a chime on reveals and quiet pops and whooshes on scene changes.
// Deterministic: same plan, same samples. Loudness is set later by ffmpeg's loudnorm (about -18 LUFS).
import { writeFileSync } from 'node:fs';

const SR = 48000;
const TAU = Math.PI * 2;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// I - V - vi - IV in C, voiced softly in the middle register.
const CHORDS = [
  { bass: 48, pad: [60, 64, 67, 71], arp: [72, 76, 79, 83] },
  { bass: 43, pad: [59, 62, 67, 74], arp: [71, 74, 79, 83] },
  { bass: 45, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79] },
  { bass: 41, pad: [57, 60, 65, 67], arp: [69, 72, 77, 79] },
];
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Bus {
  constructor(n) {
    this.l = new Float32Array(n);
    this.r = new Float32Array(n);
  }
  add(i, v, pan = 0) {
    if (i < 0 || i >= this.l.length) return;
    const a = (pan + 1) * 0.25 * Math.PI;
    this.l[i] += v * Math.cos(a) * Math.SQRT2;
    this.r[i] += v * Math.sin(a) * Math.SQRT2;
  }
}

/** A small Schroeder reverb (Freeverb's comb and all-pass layout) for the send bus. */
function reverb(input, n, seedOffset) {
  const combs = [1557, 1617, 1491, 1422].map((d) => d + seedOffset);
  const aps = [556, 441].map((d) => d + seedOffset);
  const out = new Float32Array(n);
  const fb = 0.8;
  const damp = 0.3;
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    let store = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[idx];
      store = y * (1 - damp) + store * damp;
      buf[idx] = input[i] + store * fb;
      idx = (idx + 1) % d;
      out[i] += y * 0.25;
    }
  }
  for (const d of aps) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const b = buf[idx];
      const x = out[i];
      out[i] = -x + b;
      buf[idx] = x + b * 0.5;
      idx = (idx + 1) % d;
    }
  }
  return out;
}

/** 0 during a music drop (countdowns), 1 elsewhere, with short ramps. */
function dropGain(t, drops) {
  let g = 1;
  for (const d of drops) {
    const ramp = 0.08;
    if (t > d.from - ramp && t < d.to + ramp) {
      const a = Math.min(1, Math.max(0, (d.from - t) / ramp));
      const b = Math.min(1, Math.max(0, (t - d.to) / ramp));
      g = Math.min(g, Math.max(a, b));
    }
  }
  return g;
}

export function synthesize(plan) {
  const D = plan.duration;
  const n = Math.ceil(D * SR);
  const dry = new Bus(n);
  const send = new Bus(n);
  const rand = rng(20261121);
  const drops = plan.music?.drops ?? [];

  // Pad: two slightly detuned voices per note, chords crossfading at each bar.
  for (let bar = 0; bar * BAR < D; bar++) {
    const ch = CHORDS[bar % CHORDS.length];
    const t0 = bar * BAR;
    const t1 = t0 + BAR + 0.45;
    for (const m of ch.pad) {
      for (const [cents, pan] of [[-6, -0.5], [6, 0.5]]) {
        const f = midi(m) * 2 ** (cents / 1200);
        const phase0 = rand() * TAU;
        for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.ceil(t1 * SR)); i++) {
          const t = i / SR;
          const lt = t - t0;
          const att = Math.min(1, lt / (bar === 0 ? 0.03 : 0.25));
          const rel = Math.min(1, Math.max(0, (t1 - t) / 0.45));
          const ph = TAU * f * lt + phase0;
          const v = (Math.sin(ph) + 0.18 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph)) * att * rel * 0.024;
          dry.add(i, v, pan);
          send.add(i, v * 0.6, pan);
        }
      }
    }
  }

  // Bass: beats 1 and 3.
  for (let b = 0; b * BEAT < D; b++) {
    if (b % 2) continue;
    const t0 = b * BEAT;
    const ch = CHORDS[Math.floor(t0 / BAR) % CHORDS.length];
    const f = midi(ch.bass);
    for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.ceil((t0 + 1.1) * SR)); i++) {
      const lt = i / SR - t0;
      const g = dropGain(i / SR, drops);
      const env = Math.min(1, lt / 0.006) * Math.exp(-lt / 0.4);
      dry.add(i, (Math.sin(TAU * f * lt) + 0.35 * Math.sin(TAU * 2 * f * lt)) * env * 0.11 * g, 0);
    }
  }

  // Pluck arpeggio: eighth notes.
  for (let k = 0; k * BEAT * 0.5 < D; k++) {
    const t0 = k * BEAT * 0.5;
    const ch = CHORDS[Math.floor(t0 / BAR) % CHORDS.length];
    const f = midi(ch.arp[ARP_PATTERN[k % ARP_PATTERN.length]]);
    const pan = k % 2 ? 0.35 : -0.35;
    const accent = k % 2 ? 0.75 : 1;
    for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.ceil((t0 + 0.7) * SR)); i++) {
      const lt = i / SR - t0;
      const g = 0.25 + 0.75 * dropGain(i / SR, drops);
      const env = Math.min(1, lt / 0.004) * Math.exp(-lt / 0.16);
      const ph = TAU * f * lt;
      const v = (Math.sin(ph + 0.6 * Math.exp(-lt / 0.05) * Math.sin(2 * ph)) * env) * 0.05 * accent * g;
      dry.add(i, v, pan);
      send.add(i, v * 0.9, pan);
    }
  }

  // Drums: soft kick on 1 and 3, a brushed snare on 2 and 4, closed hats on the off-beats.
  for (let b = 0; b * BEAT < D; b++) {
    const t0 = b * BEAT;
    if (b % 2 === 0) {
      let ph = 0;
      for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.ceil((t0 + 0.4) * SR)); i++) {
        const lt = i / SR - t0;
        const f = 48 + 90 * Math.exp(-lt / 0.03);
        ph += (TAU * f) / SR;
        const env = Math.min(1, lt / 0.002) * Math.exp(-lt / 0.13);
        dry.add(i, Math.sin(ph) * env * 0.32 * dropGain(i / SR, drops), 0);
      }
    } else {
      let lp1 = 0;
      let lp = 0;
      for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.ceil((t0 + 0.3) * SR)); i++) {
        const lt = i / SR - t0;
        const noise = rand() * 2 - 1;
        lp1 += 0.22 * (noise - lp1);
        lp += 0.22 * (lp1 - lp);
        const env = Math.exp(-lt / 0.07);
        const v = (lp * 1.1 + 0.25 * Math.sin(TAU * 185 * lt) * Math.exp(-lt / 0.04)) * env * 0.09 * dropGain(i / SR, drops);
        dry.add(i, v, 0.05);
        send.add(i, v * 0.4, 0.05);
      }
    }
    // Hat on the "and".
    const th = t0 + BEAT / 2;
    let prev = 0;
    for (let i = Math.floor(th * SR); i < Math.min(n, Math.ceil((th + 0.08) * SR)); i++) {
      const lt = i / SR - th;
      const noise = rand() * 2 - 1;
      const hp = noise - prev;
      prev = noise;
      dry.add(i, hp * Math.exp(-lt / 0.018) * 0.012 * dropGain(i / SR, drops), 0.25);
    }
  }

  // Effects.
  for (const cue of plan.cues ?? []) {
    const t0 = cue.t;
    const p = cue.pitch ?? 1;
    const gain = cue.gain ?? 1;
    const start = Math.floor(t0 * SR);
    if (cue.type === 'tick') {
      for (let i = start; i < Math.min(n, start + 0.12 * SR); i++) {
        const lt = i / SR - t0;
        const v = (Math.sin(TAU * 1760 * p * lt) * Math.exp(-lt / 0.018) * 0.6 + Math.sin(TAU * 880 * p * lt) * Math.exp(-lt / 0.035) * 0.4) * 0.22 * gain;
        dry.add(i, v, 0);
        send.add(i, v * 0.3, 0);
      }
    } else if (cue.type === 'pop') {
      let ph = 0;
      for (let i = start; i < Math.min(n, start + 0.15 * SR); i++) {
        const lt = i / SR - t0;
        const f = (520 + 380 * Math.min(1, lt / 0.04)) * p;
        ph += (TAU * f) / SR;
        const v = Math.sin(ph) * Math.min(1, lt / 0.003) * Math.exp(-lt / 0.045) * 0.11 * gain;
        dry.add(i, v, 0);
        send.add(i, v * 0.5, 0);
      }
    } else if (cue.type === 'chime') {
      const notes = [1046.5, 1318.51, 1567.98, 2093.0];
      notes.forEach((f, k) => {
        const tk = t0 + k * 0.055;
        const s = Math.floor(tk * SR);
        for (let i = s; i < Math.min(n, s + 2.2 * SR); i++) {
          const lt = i / SR - tk;
          const env = Math.min(1, lt / 0.003);
          const v =
            (Math.sin(TAU * f * lt) * Math.exp(-lt / 0.7) + 0.3 * Math.sin(TAU * f * 2.01 * lt) * Math.exp(-lt / 0.35) + 0.12 * Math.sin(TAU * f * 3.9 * lt) * Math.exp(-lt / 0.15)) *
            env *
            0.075 *
            gain;
          const pan = (k - 1.5) * 0.25;
          dry.add(i, v, pan);
          send.add(i, v * 0.8, pan);
        }
      });
    } else if (cue.type === 'whoosh') {
      let lp = 0;
      const len = 0.42;
      for (let i = start; i < Math.min(n, start + len * SR); i++) {
        const lt = i / SR - t0;
        const x = lt / len;
        const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * x);
        lp += cutoff * (rand() * 2 - 1 - lp);
        const env = Math.sin(Math.PI * Math.min(1, x)) ** 2;
        dry.add(i, lp * env * 0.12 * gain, (x - 0.5) * 0.6);
      }
    }
  }

  // Reverb, then a gentle fade at the very start and a longer one at the end.
  const wetL = reverb(send.l, n, 0);
  const wetR = reverb(send.r, n, 23);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.01) * Math.min(1, Math.max(0, (D - t) / 1.0));
    L[i] = Math.tanh((dry.l[i] + wetL[i] * 0.35) * 1.2) * fade;
    R[i] = Math.tanh((dry.r[i] + wetR[i] * 0.35) * 1.2) * fade;
  }
  return { L, R, sampleRate: SR };
}

/** 32-bit float stereo WAV. */
export function writeWav(path, { L, R, sampleRate }) {
  const n = L.length;
  const data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) {
    data.writeFloatLE(L[i], i * 8);
    data.writeFloatLE(R[i], i * 8 + 4);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20); // IEEE float
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 8, 28);
  head.writeUInt16LE(8, 32);
  head.writeUInt16LE(32, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
}
