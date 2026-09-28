// 8비트 사운드 — 패미컴식 4채널(펄스 2 · 삼각파 · 노이즈) 칩튠 시퀀서와 효과음.
// 오디오 파일 없이 WebAudio 로 합성한다. 외부 음원을 쓰려면 BGM_FILES 에 경로만 넣으면
// 해당 트랙은 파일 재생으로 바뀐다 (예: { title: 'assets/bgm/title.ogg' }).

// 음원 파일로 바꾸려면 여기에 경로를 넣는다. 보스별 곡은 boss_dragon · boss_orc · boss_lich
// 예) export const BGM_FILES = { boss_dragon: 'assets/bgm/boss_dragon.ogg' };
export const BGM_FILES = {};
// 협동모드 보스 곡: 보스별 파일이 있으면 그것, 없으면 칩튠 보스전 곡
export const bossSong = id => (BGM_FILES[`boss_${id}`] ? `boss_${id}` : 'boss');

const SETTINGS_KEY = 'diceheroes.audio';
const settings = { bgm: 0.55, sfx: 0.8, vibrate: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* 저장 불가 */ }
export const audioSettings = () => ({ ...settings });
export function setAudio(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 무시 */ }
  if (bgmGain) bgmGain.gain.value = settings.bgm * 0.5;
  if (sfxGain) sfxGain.gain.value = settings.sfx * 0.6;
  if (fileAudio) fileAudio.volume = settings.bgm;
}
export function buzz(ms = 20) {
  if (settings.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* 무시 */ }
}

let ctx = null, master = null, bgmGain = null, sfxGain = null, noiseBuf = null;
const waves = {};

// 브라우저는 사용자 조작 전 소리를 막는다 — 첫 터치 때 연다
export function unlock() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = 0.9;
    // 살짝 눌러 주는 컴프레서 — 채널이 겹쳐도 찢어지지 않게
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = settings.bgm * 0.5; bgmGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = settings.sfx * 0.6; sfxGain.connect(master);
    waves.p12 = pulseWave(0.125);
    waves.p25 = pulseWave(0.25);
    waves.p50 = pulseWave(0.5);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// 듀티비 있는 펄스파 (푸리에 급수)
function pulseWave(duty) {
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = 12 * (Number(m[2]) + 1) + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function voice(dest, { type = 'p25', f, t, dur, vol = 0.2, slide = null, vib = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (type === 'tri') o.type = 'triangle'; else o.setPeriodicWave(waves[type]);
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  if (vib) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 6; lg.gain.value = f * 0.012 * vib;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t + 0.12); lfo.stop(t + dur + 0.05);
  }
  // 칩튠다운 계단식 엔벨로프: 빠른 어택, 짧게 감쇠 후 유지, 끝에서 뚝
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.linearRampToValueAtTime(vol * 0.7, t + Math.min(0.08, dur * 0.5));
  g.gain.setValueAtTime(vol * 0.7, t + Math.max(0.01, dur - 0.02));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dest, { t, dur, vol = 0.2, hp = 800, lp = 12000 }) {
  const s = ctx.createBufferSource(), g = ctx.createGain();
  const hpf = ctx.createBiquadFilter(), lpf = ctx.createBiquadFilter();
  s.buffer = noiseBuf;
  hpf.type = 'highpass'; hpf.frequency.value = hp;
  lpf.type = 'lowpass'; lpf.frequency.value = lp;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(hpf).connect(lpf).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

function drum(dest, kind, t) {
  if (kind === 'K') voice(dest, { type: 'tri', f: 160, slide: 40, t, dur: 0.14, vol: 0.55 });
  if (kind === 'S') noise(dest, { t, dur: 0.12, vol: 0.28, hp: 1200, lp: 7000 });
  if (kind === 'H') noise(dest, { t, dur: 0.03, vol: 0.12, hp: 7000 });
  if (kind === 'O') noise(dest, { t, dur: 0.16, vol: 0.1, hp: 6000 });
}

// ── 곡 ───────────────────────────────────────────────────────────────────────
// 토큰 하나 = 8분음표. '.' = 앞 음 늘이기, '-' = 쉼표. 드럼: K 킥, S 스네어, H 하이햇, O 오픈햇.
// 곡은 모두 이 프로젝트를 위해 새로 쓴 것이다.
const SONGS = {
  // 타이틀 — 모험의 시작. C장조, 영웅적인 행진
  title: {
    bpm: 118,
    lead: [
      'G4 . C5 . E5 . G5 .', 'A5 . G5 . E5 . C5 .', 'F5 . A5 . C6 . A5 .', 'G5 . . . D5 . G5 .',
      'C6 . B5 . G5 . E5 .', 'A5 . . . E5 . A5 .', 'F5 . A5 . G5 . B5 .', 'C6 . . . . . - -',
      'E5 . E5 F5 G5 . E5 .', 'F5 . F5 G5 A5 . F5 .', 'G5 . A5 . B5 . D6 .', 'C6 . B5 . A5 . G5 .',
      'E5 . F5 . G5 . C6 .', 'A5 . G5 . F5 . E5 .', 'D5 . E5 . F5 . B4 .', 'C5 . . . - - G4 .',
    ],
    harm: [
      'E4 G4 C5 G4 E4 G4 C5 G4', 'E4 A4 C5 A4 E4 A4 C5 A4', 'F4 A4 C5 A4 F4 A4 C5 A4', 'D4 G4 B4 G4 D4 G4 B4 G4',
      'E4 G4 C5 G4 E4 G4 C5 G4', 'E4 A4 C5 A4 E4 A4 C5 A4', 'F4 A4 C5 A4 G4 B4 D5 B4', 'E4 G4 C5 G4 E4 G4 C5 G4',
      'C5 . G4 . C5 . G4 .', 'C5 . A4 . C5 . A4 .', 'D5 . B4 . D5 . B4 .', 'E5 . C5 . E5 . C5 .',
      'C5 . G4 . C5 . G4 .', 'C5 . A4 . C5 . A4 .', 'B4 . G4 . B4 . G4 .', 'E4 . G4 . C5 . - -',
    ],
    bass: [
      'C3 . C4 . C3 . C4 .', 'A2 . A3 . A2 . A3 .', 'F2 . F3 . F2 . F3 .', 'G2 . G3 . G2 . G3 .',
      'C3 . C4 . C3 . C4 .', 'A2 . A3 . A2 . A3 .', 'F2 . F3 . G2 . G3 .', 'C3 . G2 . C3 . - -',
      'C3 . C3 . E3 . E3 .', 'F2 . F2 . A2 . A2 .', 'G2 . G2 . B2 . B2 .', 'A2 . A2 . C3 . C3 .',
      'C3 . C3 . E3 . E3 .', 'F2 . F2 . A2 . A2 .', 'G2 . G2 . G2 . G2 .', 'C3 . . . G2 . . .',
    ],
    drums: [
      'K H S H K K S H', 'K H S H K K S H', 'K H S H K K S H', 'K H S H K S S S',
      'K H S H K K S H', 'K H S H K K S H', 'K H S H K K S H', 'K - K - S S S S',
      'K H H H S H H H', 'K H H H S H H H', 'K H H H S H H H', 'K H K H S S S S',
      'K H S H K K S H', 'K H S H K K S H', 'K H S H K S S S', 'K - - - S - O -',
    ],
  },
  // 모험 — 게임 중. A단조, 경쾌한 던전 탐험
  adventure: {
    bpm: 138,
    lead: [
      'A4 . C5 E5 A5 . G5 E5', 'F5 . E5 C5 A4 . C5 .', 'E5 . G5 . C6 . B5 G5', 'D5 . G5 . B5 . A5 G5',
      'A5 . E5 . C5 E5 A5 .', 'F5 . A5 C6 A5 . F5 .', 'G5 . B5 D6 B5 . G5 .', 'G#5 . B5 . E6 . . .',
      '- - E5 . D5 . C5 .', 'D5 . . C5 D5 . E5 .', '- - G5 . F5 . E5 .', 'F5 . . E5 F5 . G5 .',
      'A5 . G5 . F5 . E5 .', 'D5 . E5 . F5 . A5 .', 'G5 . F5 . E5 . D5 .', 'E5 . . . G#4 . B4 .',
    ],
    harm: [
      'A4 C5 E5 C5 A4 C5 E5 C5', 'A4 C5 F5 C5 A4 C5 F5 C5', 'G4 C5 E5 C5 G4 C5 E5 C5', 'G4 B4 D5 B4 G4 B4 D5 B4',
      'A4 C5 E5 C5 A4 C5 E5 C5', 'A4 C5 F5 C5 A4 C5 F5 C5', 'B4 D5 G5 D5 B4 D5 G5 D5', 'B4 E5 G#5 E5 B4 E5 G#5 E5',
      'C5 . E5 . C5 . E5 .', 'D5 . F5 . D5 . F5 .', 'E5 . G5 . E5 . G5 .', 'F5 . A5 . F5 . A5 .',
      'C5 . E5 . C5 . E5 .', 'A4 . D5 . A4 . D5 .', 'B4 . D5 . B4 . D5 .', 'B4 . E5 . G#4 . B4 .',
    ],
    bass: [
      'A2 A2 A3 A2 A2 A2 A3 A2', 'F2 F2 F3 F2 F2 F2 F3 F2', 'C3 C3 C4 C3 C3 C3 C4 C3', 'G2 G2 G3 G2 G2 G2 G3 G2',
      'A2 A2 A3 A2 A2 A2 A3 A2', 'F2 F2 F3 F2 F2 F2 F3 F2', 'G2 G2 G3 G2 G2 G2 G3 G2', 'E2 E2 E3 E2 E2 E2 G#2 B2',
      'A2 . A3 . A2 . A3 .', 'D3 . D4 . D3 . D4 .', 'C3 . C4 . C3 . C4 .', 'F2 . F3 . F2 . F3 .',
      'A2 . A3 . A2 . A3 .', 'D3 . D4 . D3 . D4 .', 'G2 . G3 . G2 . G3 .', 'E2 . E3 . E2 . E3 .',
    ],
    drums: [
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K H S H K K S S',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K S K S S S S O',
      'K H H H S H H K', 'K H H H S H H H', 'K H H H S H H K', 'K H H H S H S S',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K - S - S S S O',
    ],
  },
  // 보스전 — D단조, 120BPM. 쉬지 않는 8분음표 베이스 위로 영웅적이면서 위협적인 주제.
  // 진행 Dm - B♭ - C - A7, 8마디 주제 A + 한 옥타브 높은 B, 마지막 마디가 첫 마디로 이어진다.
  boss: {
    bpm: 120,
    lead: [
      'D5 . . A4 D5 . E5 .', 'F5 . E5 . D5 . C#5 .', 'D5 . . A#4 D5 . F5 .', 'E5 . . . C5 . G5 .',
      'A5 . . G5 F5 . E5 .', 'F5 . D5 . A#4 . D5 .', 'E5 . G5 . C6 . A#5 .', 'A5 . . . C#5 . E5 .',
      'D6 . A5 . F5 . D5 .', 'A#5 . F5 . D5 . A#4 .', 'C6 . G5 . E5 . C5 .', 'C#6 . A5 . E5 . C#5 .',
      'D5 E5 F5 G5 A5 . F5 .', 'A#5 A5 G5 F5 E5 . D5 .', 'E5 F5 G5 A5 A#5 . G5 .', 'A5 . G5 . F5 . E5 .',
    ],
    harm: [
      'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 A4 F4 C#4 E4 A4 E4', 'A#3 D4 F4 D4 A#3 D4 F4 D4', 'C4 E4 G4 E4 C4 E4 G4 E4',
      'D4 F4 A4 F4 D4 F4 A4 F4', 'A#3 D4 F4 D4 A#3 D4 F4 D4', 'C4 E4 G4 E4 C4 E4 G4 E4', 'A3 C#4 E4 G4 A3 C#4 E4 G4',
      'D5 . A4 . D5 . A4 .', 'D5 . A#4 . D5 . A#4 .', 'E5 . C5 . E5 . C5 .', 'E5 . C#5 . E5 . C#5 .',
      'D4 F4 A4 F4 D4 F4 A4 F4', 'A#3 D4 F4 D4 A#3 D4 F4 D4', 'C4 E4 G4 E4 C4 E4 G4 E4', 'A3 C#4 E4 G4 A3 C#4 E4 G4',
    ],
    bass: [
      'D2 D2 D3 D2 D2 D2 D3 D2', 'D2 D2 D3 D2 A1 A1 A2 A1', 'A#1 A#1 A#2 A#1 A#1 A#1 A#2 A#1', 'C2 C2 C3 C2 C2 C2 C3 C2',
      'D2 D2 D3 D2 D2 D2 D3 D2', 'A#1 A#1 A#2 A#1 A#1 A#1 A#2 A#1', 'C2 C2 C3 C2 C2 C2 C3 C2', 'A1 A1 A2 A1 A1 A1 C#2 E2',
      'D2 D2 D3 D2 D2 D2 D3 D2', 'A#1 A#1 A#2 A#1 A#1 A#1 A#2 A#1', 'C2 C2 C3 C2 C2 C2 C3 C2', 'A1 A1 A2 A1 A1 A1 A2 A1',
      'D2 D2 D3 D2 D2 D2 D3 D2', 'A#1 A#1 A#2 A#1 A#1 A#1 A#2 A#1', 'C2 C2 C3 C2 C2 C2 C3 C2', 'A1 A1 A2 A1 C#2 C#2 E2 E2',
    ],
    drums: [
      'K H S H K K S H', 'K H S H K K S H', 'K H S H K K S H', 'K H S H K K S S',
      'K H S H K K S H', 'K H S H K K S H', 'K H S H K K S H', 'K S K S S S S O',
      'K H S H K H S K', 'K H S H K H S K', 'K H S H K H S K', 'K H S H K S S S',
      'K H S H K K S H', 'K H S H K K S H', 'K H S H K K S H', 'K - S - S S S O',
    ],
  },
  // 결과 — 여유로운 개선 행진, F장조
  victory: {
    bpm: 104,
    lead: [
      'C5 . F5 . A5 . C6 .', 'A#5 . A5 . G5 . F5 .', 'G5 . A5 . A#5 . D6 .', 'C6 . . . A5 . . .',
      'F5 . A5 . C6 . F6 .', 'E6 . D6 . C6 . A#5 .', 'A5 . G5 . E5 . G5 .', 'F5 . . . . . - -',
    ],
    harm: [
      'A4 . C5 . F5 . C5 .', 'A#4 . D5 . F5 . D5 .', 'A#4 . D5 . G5 . D5 .', 'A4 . C5 . F5 . C5 .',
      'A4 . C5 . F5 . C5 .', 'A#4 . D5 . G5 . D5 .', 'A#4 . C5 . E5 . C5 .', 'A4 . C5 . F5 . - -',
    ],
    bass: [
      'F2 . C3 . F2 . C3 .', 'A#2 . F3 . A#2 . F3 .', 'G2 . D3 . G2 . D3 .', 'F2 . C3 . F2 . C3 .',
      'F2 . C3 . F2 . C3 .', 'A#2 . F3 . A#2 . F3 .', 'C3 . G3 . C3 . E3 .', 'F2 . . . . . - -',
    ],
    drums: [
      'K - H - S - H -', 'K - H - S - H -', 'K - H - S - H -', 'K - H - S S S S',
      'K - H - S - H -', 'K - H - S - H -', 'K - H - S - H -', 'K - - - O - - -',
    ],
  },
};

const tokenize = rows => rows.join(' ').trim().split(/\s+/);

let playing = null;       // { name, timer, step, next }
let fileAudio = null;

export function playBgm(name) {
  if (playing?.name === name) return;
  stopBgm();
  if (BGM_FILES[name]) {
    fileAudio = new Audio(BGM_FILES[name]);
    fileAudio.loop = true;
    fileAudio.volume = settings.bgm;
    fileAudio.play().catch(() => {});
    playing = { name };
    return;
  }
  if (!unlock()) return;
  const song = SONGS[name];
  const tracks = {
    lead: tokenize(song.lead), harm: tokenize(song.harm),
    bass: tokenize(song.bass), drums: tokenize(song.drums),
  };
  const len = tracks.lead.length;
  const step = 60 / song.bpm / 2;   // 8분음표 길이
  const state = { name, step: 0, next: ctx.currentTime + 0.08 };
  // 늘임표(.)를 미리 계산해 두면 음 길이를 한 번에 스케줄할 수 있다
  const durOf = (arr, i) => { let n = 1; while (arr[(i + n) % len] === '.' && n < len) n++; return n; };
  const tick = () => {
    while (state.next < ctx.currentTime + 0.15) {
      const i = state.step % len, t = state.next;
      const lead = tracks.lead[i], harm = tracks.harm[i], bass = tracks.bass[i], dr = tracks.drums[i];
      if (freq(lead)) voice(bgmGain, { type: 'p25', f: freq(lead), t, dur: step * durOf(tracks.lead, i) * 0.95, vol: 0.16, vib: durOf(tracks.lead, i) > 2 ? 1 : 0 });
      if (freq(harm)) voice(bgmGain, { type: 'p12', f: freq(harm), t, dur: step * durOf(tracks.harm, i) * 0.9, vol: 0.07 });
      if (freq(bass)) voice(bgmGain, { type: 'tri', f: freq(bass), t, dur: step * durOf(tracks.bass, i) * 0.92, vol: 0.34 });
      if (dr && dr !== '-' && dr !== '.') drum(bgmGain, dr, t);
      state.step++;
      state.next += step;
    }
  };
  tick();
  state.timer = setInterval(tick, 30);
  playing = state;
}

export function stopBgm() {
  if (playing?.timer) clearInterval(playing.timer);
  if (fileAudio) { fileAudio.pause(); fileAudio = null; }
  playing = null;
}

// 탭이 가려지면 음악을 멈췄다가 돌아오면 이어서
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

// ── 효과음 ───────────────────────────────────────────────────────────────────
const seq = (notes, gap, opts = {}) => {
  if (!unlock()) return;
  const t0 = ctx.currentTime;
  notes.forEach((n, i) => n && voice(sfxGain, { type: opts.type || 'p50', f: freq(n), t: t0 + i * gap, dur: opts.dur || gap * 1.2, vol: opts.vol || 0.18 }));
};

export const sfx = {
  tap() { seq(['C6'], 0.04, { type: 'p25', vol: 0.1 }); },
  select() { seq(['E5', 'B5'], 0.05, { type: 'p25', vol: 0.14 }); },
  back() { seq(['B5', 'E5'], 0.05, { type: 'p25', vol: 0.12 }); },
  hold() { seq(['A5'], 0.05, { type: 'p12', vol: 0.14 }); buzz(12); },
  unhold() { seq(['E5'], 0.05, { type: 'p12', vol: 0.12 }); },
  shake() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 7; i++) noise(sfxGain, { t: t + i * 0.035 + Math.random() * 0.01, dur: 0.03, vol: 0.12, hp: 2500, lp: 9000 });
  },
  // 주사위가 바닥·벽·서로에 부딪히는 소리 (충격량에 따라)
  clack(v = 5) {
    if (!unlock()) return;
    const t = ctx.currentTime, k = Math.min(1, v / 14);
    noise(sfxGain, { t, dur: 0.025 + k * 0.03, vol: 0.08 + k * 0.22, hp: 1500 + Math.random() * 1500, lp: 8000 });
    voice(sfxGain, { type: 'tri', f: 700 + Math.random() * 500, t, dur: 0.03, vol: 0.05 + k * 0.08 });
  },
  score() { seq(['C5', 'E5', 'G5', 'C6'], 0.06, { vol: 0.15 }); },
  zero() { seq(['E4', 'C4', 'G#3'], 0.1, { type: 'p25', vol: 0.12 }); },
  coin() { seq(['B5', 'E6'], 0.07, { type: 'p50', vol: 0.16, dur: 0.25 }); buzz(25); },
  quest() { seq(['G5', 'C6', 'E6', 'G6', 'E6', 'G6'], 0.07, { type: 'p25', vol: 0.16 }); buzz(40); },
  levelup() {
    seq(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.055, { type: 'p25', vol: 0.15 });
    setTimeout(() => seq(['C6', 'C6', 'C6', 'G6'], 0.1, { type: 'p50', vol: 0.14, dur: 0.14 }), 420);
    setTimeout(() => seq(['E6'], 0.5, { type: 'p25', vol: 0.14, dur: 0.6 }), 860);
    buzz(80);
  },
  card() { seq(['G6', 'D7'], 0.04, { type: 'p12', vol: 0.1 }); },
  legend() { seq(['C6', 'E6', 'G6', 'B6', 'D7', 'G7'], 0.05, { type: 'p12', vol: 0.12 }); },
  round() { seq(['G4', null, 'G4', 'C5'], 0.09, { type: 'p50', vol: 0.14 }); },
  turn() { seq(['E5', 'A5'], 0.09, { type: 'p25', vol: 0.12 }); },
  win() { seq(['C5', 'C5', 'C5', 'C5', 'G#4', 'A#4', 'C5', null, 'A#4', 'C5'], 0.12, { type: 'p25', vol: 0.16, dur: 0.14 }); },
  start() { seq(['C5', 'G5', 'C6', 'E6', 'G6'], 0.06, { type: 'p25', vol: 0.16 }); buzz(30); },
  // 족보 완성 알림
  combo() { seq(['E6', 'G6', 'C7'], 0.045, { type: 'p12', vol: 0.13 }); buzz(20); },
  // 주사위가 에너지로 모이는 소리 (점점 높아진다)
  charge(power = 1) {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'p12', f: 220, slide: 880 + power * 400, t, dur: 0.55, vol: 0.12 });
    voice(sfxGain, { type: 'p25', f: 110, slide: 440 + power * 200, t: t + 0.05, dur: 0.5, vol: 0.07 });
  },
  whoosh() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    noise(sfxGain, { t, dur: 0.28, vol: 0.2, hp: 1800, lp: 9000 });
    voice(sfxGain, { type: 'p50', f: 1400, slide: 300, t, dur: 0.25, vol: 0.06 });
  },
  boom(power = 1) {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 180, slide: 30, t, dur: 0.35 + power * 0.15, vol: 0.6 });
    noise(sfxGain, { t, dur: 0.3 + power * 0.25, vol: 0.32, hp: 200, lp: 4000 });
    if (power > 1) seq(['C6', 'G6', 'C7'], 0.05, { type: 'p25', vol: 0.12 });
    buzz(40 + power * 30);
  },
  fire() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 10; i++) noise(sfxGain, { t: t + i * 0.06 + Math.random() * 0.03, dur: 0.07, vol: 0.14, hp: 400, lp: 3000 });
    voice(sfxGain, { type: 'p50', f: 300, slide: 80, t, dur: 0.6, vol: 0.08 });
  },
  twist() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'p12', f: 900, slide: 200, t, dur: 0.5, vol: 0.1, vib: 3 });
    voice(sfxGain, { type: 'p25', f: 300, slide: 1200, t: t + 0.1, dur: 0.45, vol: 0.06 });
  },
  drum() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 120, slide: 35, t, dur: 0.22, vol: 0.7 });
    noise(sfxGain, { t, dur: 0.12, vol: 0.18, hp: 100, lp: 1200 });
    buzz(35);
  },
  // 보스 등장 — 칼로 베는 소리 + 낮은 굉음
  slash() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    noise(sfxGain, { t, dur: 0.18, vol: 0.3, hp: 3000, lp: 12000 });
    voice(sfxGain, { type: 'tri', f: 90, slide: 30, t: t + 0.05, dur: 0.9, vol: 0.6 });
    voice(sfxGain, { type: 'p50', f: 110, slide: 55, t: t + 0.05, dur: 0.8, vol: 0.08 });
    buzz(90);
  },
};
