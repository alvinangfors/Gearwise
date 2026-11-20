// Egenkomponerad bakgrundsmusik + ljudeffekter för videorna (ingen upphovsrättsskyddad musik).
// Syntetiseras sampel för sampel och returneras som en stereo-WAV (16 bit, 44,1 kHz).

const SR = 44100;
const BPM = 112;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Ackordföljder: [grundton bas, ackordtoner]
const PROGS = {
  cool: [[45, [57, 60, 64]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62]]], // Am F C G
  bright: [[48, [55, 60, 64]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [53, 57, 60]]], // C G Am F
};

// Enkel deterministisk slump (samma ljud varje gång)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

export function makeTrack({ duration, sceneStarts = [], theme = 'blue', seed = 1 }) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rnd = rng(seed);
  const prog = theme === 'jul' || theme === 'home' ? PROGS.bright : PROGS.cool;
  const add = (i, l, r = l) => { if (i >= 0 && i < n) { L[i] += l; R[i] += r; } };

  // Pad: mjuka ackord (sågtand med få övertoner, lätt detunad), ny ackord varje takt
  for (let bar = 0; bar * BAR < duration; bar++) {
    const [, chord] = prog[bar % prog.length];
    const t0 = bar * BAR, len = BAR + 0.4;
    const s0 = Math.floor(t0 * SR), s1 = Math.min(n, Math.floor((t0 + len) * SR));
    for (let i = s0; i < s1; i++) {
      const t = i / SR - t0;
      const env = Math.min(1, t / 0.35) * Math.min(1, (len - t) / 0.4);
      let v = 0;
      for (const m of chord) for (const d of [-0.07, 0.07]) {
        const f = mtof(m) * Math.pow(2, d / 12);
        for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * (i / SR)) / (h * h * 0.9 + 0.1);
      }
      add(i, v * env * 0.034, v * env * 0.034);
    }
  }

  // Bas: grundton på varje slag med kort attack
  for (let b = 0; b * BEAT < duration; b++) {
    const root = prog[Math.floor(b / 4) % prog.length][0];
    const f = mtof(root), t0 = b * BEAT, s0 = Math.floor(t0 * SR), len = BEAT * 0.9;
    for (let i = s0; i < Math.min(n, s0 + len * SR); i++) {
      const t = i / SR - t0;
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 3.5);
      const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env * 0.2;
      add(i, v);
    }
  }

  // Pluck-arpeggio: åttondelar genom ackordet en oktav upp
  for (let k = 0; k * BEAT / 2 < duration; k++) {
    const bar = Math.floor(k / 8), chord = prog[bar % prog.length][1];
    const m = chord[[0, 1, 2, 1, 0, 2, 1, 2][k % 8]] + 12;
    const f = mtof(m), t0 = k * BEAT / 2, s0 = Math.floor(t0 * SR);
    const pan = k % 2 ? 0.75 : 1.25;
    for (let i = s0; i < Math.min(n, s0 + 0.5 * SR); i++) {
      const t = i / SR - t0;
      const ph = (f * t) % 1, tri = 4 * Math.abs(ph - 0.5) - 1;
      const v = tri * Math.exp(-t * 7) * Math.min(1, t / 0.004) * 0.13;
      add(i, v * (2 - pan), v * pan);
    }
  }

  // Trummor: kick på 1 och 3 (+ synkop), virvel på 2 och 4, hihat på åttondelar
  for (let b = 0; b * BEAT < duration; b++) {
    const t0 = b * BEAT;
    if (b % 2 === 0 || b % 8 === 7) { // kick
      const s0 = Math.floor(t0 * SR); let ph = 0;
      for (let i = s0; i < Math.min(n, s0 + 0.35 * SR); i++) {
        const t = i / SR - t0; const f = 45 + 80 * Math.exp(-t * 32); ph += f / SR;
        add(i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 11) * 0.3);
      }
    }
    if (b % 2 === 1) { // virvel/clap
      const s0 = Math.floor(t0 * SR); let lp = 0;
      for (let i = s0; i < Math.min(n, s0 + 0.25 * SR); i++) {
        const t = i / SR - t0; const x = rnd(); lp += 0.35 * (x - lp);
        add(i, (x - lp) * Math.exp(-t * 20) * 0.16 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.08);
      }
    }
    for (const off of [0, 0.5]) { // hihat
      const th = t0 + off * BEAT, s0 = Math.floor(th * SR); let prev = 0;
      for (let i = s0; i < Math.min(n, s0 + 0.06 * SR); i++) {
        const t = i / SR - th; const x = rnd(); const hp = x - prev; prev = x;
        const v = hp * Math.exp(-t * (off ? 55 : 80)) * (off ? 0.05 : 0.03);
        add(i, v * 0.7, v * 1.3);
      }
    }
  }

  // Jul: bjällror och klockmelodi
  if (theme === 'jul') {
    for (let k = 0; k * BEAT / 2 < duration; k++) {
      const t0 = k * BEAT / 2, s0 = Math.floor(t0 * SR); let prev = 0;
      for (let i = s0; i < Math.min(n, s0 + 0.12 * SR); i++) {
        const t = i / SR - t0; const x = rnd(); const hp = x - prev; prev = x;
        const shake = 0.6 + 0.4 * Math.sin(2 * Math.PI * 38 * t);
        add(i, hp * shake * Math.exp(-t * 28) * 0.05, hp * shake * Math.exp(-t * 28) * 0.06);
      }
    }
    const mel = [76, 79, 81, 79, 76, 74, 72, 74];
    for (let k = 0; k * BEAT < duration; k++) {
      const f = mtof(mel[k % mel.length]), t0 = k * BEAT, s0 = Math.floor(t0 * SR);
      for (let i = s0; i < Math.min(n, s0 + 1.2 * SR); i++) {
        const t = i / SR - t0;
        const v = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 4) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 7)) * Math.exp(-t * 3) * 0.045;
        add(i, v);
      }
    }
  }

  // Ljudeffekter vid varje scenbyte: whoosh före + "pop" på bytet
  sceneStarts.slice(1).forEach((st) => {
    const w0 = st - 0.32, s0 = Math.floor(w0 * SR); let lp = 0;
    for (let i = Math.max(0, s0); i < Math.min(n, s0 + 0.45 * SR); i++) {
      const t = i / SR - w0; const k = t / 0.45;
      const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * Math.min(1, k));
      const x = rnd(); lp += cutoff * (x - lp);
      const env = Math.sin(Math.PI * Math.min(1, k)) ** 2;
      add(i, lp * env * 0.35 * (1 - k * 0.5), lp * env * 0.35 * (0.5 + k * 0.5));
    }
    const p0 = Math.floor(st * SR);
    for (let i = p0; i < Math.min(n, p0 + 0.09 * SR); i++) {
      const t = i / SR - st; const f = 900 - 3500 * t;
      add(i, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 45) * 0.12);
    }
  });

  // Mixning: in-/uttoning, mjuk begränsare, normalisering
  const fadeIn = 0.4 * SR, fadeOut = 1.4 * SR;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fadeIn) * Math.min(1, (n - i) / fadeOut);
    L[i] = Math.tanh(L[i] * 1.2) * g; R[i] = Math.tanh(R[i] * 1.2) * g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = peak > 0 ? 0.89 / peak : 1;

  // WAV
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
  }
  return buf;
}
