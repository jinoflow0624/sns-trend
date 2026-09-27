// 효과음과 잔잔한 배경음. 파일 없이 WebAudio 로 합성한다.
let ctx = null;
let master = null;
let musicGain = null;
let settings = { sound: true, music: true };

export function setSoundSettings(s) {
  settings = s;
  if (musicGain) musicGain.gain.value = s.music ? 0.05 : 0;
}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

function tone(freq, { start = 0, dur = 0.12, type = 'square', vol = 0.08, to = null } = {}) {
  if (!ctx || !settings.sound) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function noise(dur = 0.1, vol = 0.12, freq = 1200) {
  if (!ctx || !settings.sound) return;
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource();
  s.buffer = b;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start();
}

// ── 동물 울음: 성대(톱니파) + 입 모양(포먼트 필터) + 숨소리로 흉내 낸다 ──────────
// f0: [[초, Hz]...] 음높이 곡선, fm: [[초, [F1, F2, F3]]...] 모음 변화, env: [[초, 크기]...]
const jit = (v, r = 0.08) => v * (1 + (Math.random() * 2 - 1) * r);
function voice({ start = 0, f0, fm, env, q = [8, 10, 12], fg = [1, 0.6, 0.25], breath = 0.15, rough = 0, vib = 0 }) {
  if (!ctx || !settings.sound) return;
  const t0 = ctx.currentTime + start;
  const dur = env[env.length - 1][0];
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  for (const [t, v] of env) out.gain.linearRampToValueAtTime(Math.max(0.0001, v), t0 + t);
  out.connect(master);

  const src = ctx.createGain();
  // 성대: 톱니파 두 개를 살짝 어긋나게 → 떨리는 목소리
  [1, 1.006].forEach(d => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0[0][1] * d, t0);
    for (const [t, f] of f0.slice(1)) o.frequency.exponentialRampToValueAtTime(f * d, t0 + t);
    if (vib) {
      const l = ctx.createOscillator(); const lg = ctx.createGain();
      l.frequency.value = 5.5; lg.gain.value = vib;
      l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(g).connect(src); o.start(t0); o.stop(t0 + dur + 0.05);
  });
  // 숨소리
  if (breath) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (dur + 0.05)), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = b;
    const ng = ctx.createGain(); ng.gain.value = breath;
    n.connect(ng).connect(src); n.start(t0);
  }
  // 거친 목소리(으르렁): 음량을 빠르게 흔든다
  let body = src;
  if (rough) {
    const am = ctx.createGain(); am.gain.value = 1 - rough / 2;
    const l = ctx.createOscillator(); const lg = ctx.createGain();
    l.frequency.value = 38 + Math.random() * 12; lg.gain.value = rough / 2;
    l.connect(lg).connect(am.gain); l.start(t0); l.stop(t0 + dur + 0.05);
    src.connect(am); body = am;
  }
  // 입 모양: 포먼트 세 개를 나란히
  for (let k = 0; k < 3; k++) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q[k];
    f.frequency.setValueAtTime(fm[0][1][k], t0);
    for (const [t, fs] of fm.slice(1)) f.frequency.linearRampToValueAtTime(fs[k], t0 + t);
    const g = ctx.createGain(); g.gain.value = fg[k] * 3;
    body.connect(f).connect(g).connect(out);
  }
}

// 고양이 "미이아옹": 음이 올라갔다 내려오며 입이 이→아→우 로 열렸다 닫힌다
function meow() {
  const p = jit(1, 0.12);
  const len = jit(0.75, 0.15);
  voice({
    f0: [[0, 560 * p], [len * 0.25, 820 * p], [len * 0.55, 780 * p], [len, 430 * p]],
    fm: [[0, [700, 2300, 3600]], [len * 0.35, [1250, 1900, 3300]], [len * 0.7, [900, 1400, 3000]], [len, [650, 1050, 2800]]],
    env: [[0.04, 0.22], [len * 0.4, 0.3], [len * 0.8, 0.2], [len, 0.0001]],
    q: [7, 9, 12], breath: 0.12, vib: 14 * p,
  });
}
// 강아지 "왕!": 짧고 거칠게 터졌다가 음이 뚝 떨어진다
function bark(start) {
  const p = jit(1, 0.1);
  voice({
    start,
    f0: [[0, 330 * p], [0.03, 560 * p], [0.16, 280 * p]],
    fm: [[0, [500, 1200, 2600]], [0.04, [850, 1500, 2800]], [0.16, [550, 1000, 2400]]],
    env: [[0.008, 0.5], [0.06, 0.34], [0.16, 0.0001]],
    q: [5, 7, 9], fg: [1, 0.7, 0.35], breath: 0.6, rough: 0.7,
  });
}
// 오리 "꽥": 코맹맹이(좁은 포먼트) + 강한 거칠기
function quack(start) {
  const p = jit(1, 0.08);
  voice({
    start,
    f0: [[0, 260 * p], [0.05, 300 * p], [0.16, 220 * p]],
    fm: [[0, [900, 1700, 3000]], [0.08, [1100, 1800, 3100]], [0.16, [800, 1500, 2900]]],
    env: [[0.01, 0.6], [0.12, 0.5], [0.17, 0.0001]],
    q: [14, 16, 18], fg: [1, 0.8, 0.3], breath: 0.1, rough: 0.9,
  });
}

const SFX = {
  hoe: () => noise(0.08, 0.15, 800),
  // 물뿌리개: 쏴아 하는 물줄기 + 톡톡 떨어지는 물방울
  can: () => {
    noise(0.45, 0.14, 2600);
    [0.05, 0.13, 0.2, 0.3, 0.38].forEach((t, i) => tone(1400 + i * 160, { start: t, dur: 0.05, type: 'sine', vol: 0.05, to: 700 }));
  },
  meow: () => meow(),
  bark: () => { bark(0); bark(0.26 + Math.random() * 0.06); },
  quack: () => { quack(0); quack(0.2); },
  save: () => tone(1320, { dur: 0.05, type: 'sine', vol: 0.025 }),
  pick: () => { tone(1400, { dur: 0.05, vol: 0.05 }); noise(0.05, 0.1, 4000); },
  axe: () => { tone(220, { dur: 0.06, vol: 0.08 }); noise(0.06, 0.12, 900); },
  sword: () => noise(0.09, 0.12, 5000),
  rod: () => tone(600, { dur: 0.2, type: 'sine', vol: 0.05, to: 300 }),
  hand: () => {},
  plant: () => tone(660, { dur: 0.08, type: 'triangle', vol: 0.06 }),
  harvest: () => { tone(784, { dur: 0.08, type: 'triangle' }); tone(1175, { start: 0.07, dur: 0.12, type: 'triangle' }); },
  fell: () => { noise(0.4, 0.2, 500); tone(110, { dur: 0.3, vol: 0.06, to: 60 }); },
  break: () => { noise(0.2, 0.2, 2500); tone(300, { dur: 0.1, vol: 0.05, to: 120 }); },
  coin: () => { tone(1318, { dur: 0.06 }); tone(1760, { start: 0.06, dur: 0.12 }); },
  discover: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { start: i * 0.07, dur: 0.2, type: 'triangle', vol: 0.06 })),
  teleport: () => tone(300, { dur: 0.5, type: 'sine', vol: 0.08, to: 1600 }),
  bite: () => { tone(880, { dur: 0.08, vol: 0.08 }); tone(880, { start: 0.12, dur: 0.08, vol: 0.08 }); },
  cast: () => noise(0.15, 0.06, 2000),
  catch: () => [659, 784, 988, 1318].forEach((f, i) => tone(f, { start: i * 0.06, dur: 0.15, type: 'triangle', vol: 0.06 })),
  levelup: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, { start: i * 0.1, dur: 0.25, type: 'square', vol: 0.05 })),
  hurt: () => tone(200, { dur: 0.15, type: 'sawtooth', vol: 0.07, to: 90 }),
  click: () => tone(1000, { dur: 0.03, type: 'sine', vol: 0.04 }),
  open: () => { tone(520, { dur: 0.05, type: 'triangle', vol: 0.05 }); tone(780, { start: 0.05, dur: 0.07, type: 'triangle', vol: 0.05 }); },
  error: () => tone(180, { dur: 0.12, type: 'square', vol: 0.05 }),
};
export const sfx = name => { try { SFX[name]?.(); } catch { /* 무시 */ } };

// ── 배경음: 느긋한 아르페지오 반복 ───────────────────────────────────────────
const SONG = [
  [60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67],
];
let musicTimer = null;
export function startMusic() {
  if (!ctx || musicTimer) return;
  musicGain = ctx.createGain();
  musicGain.gain.value = settings.music ? 0.05 : 0;
  musicGain.connect(master);
  let bar = 0;
  const play = () => {
    if (!ctx) return;
    const chord = SONG[bar % SONG.length];
    const t0 = ctx.currentTime + 0.05;
    const notes = [0, 1, 2, 3, 2, 1, 2, 3];
    notes.forEach((n, i) => {
      const f = 440 * 2 ** ((chord[n] - 69) / 12);
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const s = t0 + i * 0.3;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.5, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      o.connect(g).connect(musicGain); o.start(s); o.stop(s + 0.55);
    });
    const b = ctx.createOscillator(); const bg = ctx.createGain();
    b.type = 'sine'; b.frequency.value = 440 * 2 ** ((chord[0] - 12 - 69) / 12);
    bg.gain.setValueAtTime(0.0001, t0); bg.gain.exponentialRampToValueAtTime(0.6, t0 + 0.05); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.3);
    b.connect(bg).connect(musicGain); b.start(t0); b.stop(t0 + 2.4);
    bar++;
  };
  play();
  musicTimer = setInterval(play, 2400);
}
