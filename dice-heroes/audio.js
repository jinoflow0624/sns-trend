// 8비트 사운드 — 패미컴식 4채널(펄스 2 · 삼각파 · 노이즈) 칩튠 시퀀서와 효과음.
// 오디오 파일 없이 WebAudio 로 합성한다. 외부 음원을 쓰려면 BGM_FILES 에 경로만 넣으면
// 해당 트랙은 파일 재생으로 바뀐다 (예: { title: 'assets/bgm/title.ogg' }).

// 음원 파일로 바꾸려면 여기에 경로를 넣는다. 보스별 곡은 boss_dragon · boss_orc · boss_lich · boss_demon
// 파일은 마디 경계에서 잘라 끝과 처음이 이어지게 다듬은 루프여야 한다. sw.js 캐시 목록에도 넣는다.
export const BGM_FILES = {
  title:       'assets/bgm/title.ogg',         // 메인 메뉴 · 32마디 루프, 112BPM (Suno)
  adventure:   'assets/bgm/versus.ogg',        // 대전 · 32마디 루프, 133BPM (Suno)
  boss_dragon: 'assets/bgm/boss_dragon.ogg',   // 32마디 루프, 120BPM (Suno)
  boss_orc:    'assets/bgm/boss_orc.ogg',      // 28마디 루프, 120BPM (Suno)
  boss_lich:   'assets/bgm/boss_lich.ogg',     // 28마디 루프, 120BPM (Suno)
  boss_demon:  'assets/bgm/boss_demon.ogg',    // 마왕 · 34마디 루프(곡 첫 박부터), 133BPM (Suno)
  // 강화 보스 (Suno, 원곡 13~40 · 8~39 · 1~32 · 20~35마디)
  boss_cyclops:   'assets/bgm/boss_cyclops.ogg',   // 키클롭스 · 28마디 루프, 131BPM
  boss_hydra:     'assets/bgm/boss_hydra.ogg',     // 세머리 용 · 32마디 루프, 130BPM
  boss_overlord:  'assets/bgm/boss_overlord.ogg',  // 오버로드 · 32마디 루프(곡 첫 박부터), 133BPM
  boss_archdemon: 'assets/bgm/boss_archdemon.ogg', // 마신 · 16마디 루프(곡 앞 1분 안), 140BPM
};
// 협동모드 보스 곡: 보스별 파일이나 칩튠 곡이 있으면 그것, 없으면 공용 보스전 곡
// 강화 보스는 자기 곡이 없으면 원래 보스 곡을 쓴다
const SONG_BASE = { hydra: 'dragon', cyclops: 'orc', overlord: 'lich', archdemon: 'demon' };
export const bossSong = id => { const k = BGM_FILES[`boss_${id}`] || SONGS[`boss_${id}`] ? id : SONG_BASE[id] || id; return BGM_FILES[`boss_${k}`] || SONGS[`boss_${k}`] ? `boss_${k}` : 'boss'; };

const SETTINGS_KEY = 'diceheroes.audio';
const settings = { bgm: 0.55, sfx: 0.8, vibrate: true };
// 채널 음량: 슬라이더가 같은 값이면 효과음이 배경음악보다 또렷하게(약 6dB) 크게 들리도록 맞춘 비율.
// 효과음이 날 때는 배경음악을 잠깐 DUCK 만큼 낮춰(더킹) 효과음이 묻히지 않게 한다.
const BGM_LEVEL = 0.42, SFX_LEVEL = 3.1, DUCK = 0.6;
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* 저장 불가 */ }
export const audioSettings = () => ({ ...settings });
export function setAudio(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 무시 */ }
  if (bgmGain) bgmGain.gain.value = settings.bgm * BGM_LEVEL;
  if (sfxGain) sfxGain.gain.value = settings.sfx * SFX_LEVEL;
}
// 진동. 안드로이드는 Vibration API, 아이폰(사파리 18+)은 진동 API가 없어서
// 숨긴 스위치(<input switch>)를 눌러 시스템 햅틱을 낸다 (터치로 부른 경우에만 동작).
// 15ms 같은 짧은 진동은 기기 모터가 미처 돌지 못해 거의 느껴지지 않아 최소 40ms 로 낸다.
let hapticEl = null;
function iosHaptic() {
  if (!hapticEl) {
    hapticEl = document.createElement('label');
    hapticEl.setAttribute('aria-hidden', 'true');
    hapticEl.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    hapticEl.appendChild(input);
    document.body.appendChild(hapticEl);
  }
  hapticEl.click();
}
export function buzz(ms = 20) {
  if (!settings.vibrate) return;
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(Math.max(40, ms));
    else iosHaptic();
  } catch { /* 무시 */ }
}

// 주사위가 부딪힐 때 드르륵 — 세게 부딪힐수록 길게. 터치 없이도 울려야 해서 진동 API가 있는 기기(안드로이드)만
let rumbleT = 0;
export function rumble(v = 5) {
  if (!settings.vibrate || typeof navigator.vibrate !== 'function') return;
  const now = performance.now();
  if (now - rumbleT < 80) return;
  rumbleT = now;
  try { navigator.vibrate(Math.round(35 + Math.min(1, v / 14) * 30)); } catch { /* 무시 */ }
}
export const canVibrate = () => typeof navigator.vibrate === 'function';

let ctx = null, master = null, bgmGain = null, duckGain = null, sfxGain = null, noiseBuf = null;
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
    duckGain = ctx.createGain(); duckGain.connect(master);
    bgmGain = ctx.createGain(); bgmGain.gain.value = settings.bgm * BGM_LEVEL; bgmGain.connect(duckGain);
    sfxGain = ctx.createGain(); sfxGain.gain.value = settings.sfx * SFX_LEVEL; sfxGain.connect(master);
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

// 브라우저는 첫 터치 전엔 소리를 막는다(오디오가 '멈춤' 상태로 시작). 메뉴 음악은 시작 화면이 뜨자마자 걸어 두고,
// 허락되는 첫 순간(아무 곳이나 터치·클릭·키) 바로 들리게 한다. 전화·다른 앱 때문에 멈췄을 때도 다음 터치로 다시 켠다
const wake = () => { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => addEventListener(ev, wake, { capture: true, passive: true }));

// 효과음이 울리는 동안 배경음악을 살짝 내렸다가 끝나면 부드럽게 되돌린다
let duckUntil = 0;
function duck(t, dur) {
  duckUntil = Math.max(duckUntil, t + dur);
  const g = duckGain.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(DUCK, t, 0.015);
  g.setTargetAtTime(1, duckUntil + 0.05, 0.15);
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
  if (dest === sfxGain) duck(t, dur);
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
  if (dest === sfxGain) duck(t, dur);
}

// 맑게 울리고 서서히 사라지는 소리 (방울·유리·금화·별빛). 칩튠 엔벨로프 대신 지수 감쇠
function ping(dest, { f, t, dur = 0.3, vol = 0.1, type = 'sine', slide = null }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (type === 'sine' || type === 'square' || type === 'triangle') o.type = type; else o.setPeriodicWave(waves[type]);
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + Math.min(dur, 0.12));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
  if (dest === sfxGain) duck(t, dur);
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
  // 보스전 — 협동모드에서 보스마다 한 곡. 16마디 루프, 마지막 마디가 딸림화음으로 첫 마디에 이어진다.
  // 화염룡 이그니스 — A단조, 당당한 영웅 선율과 화성단음계 내림 질주
  boss_dragon: {
    bpm: 120,
    lead: [
      'A4 . E5 . A5 . B5 C6', 'B5 . A5 . F5 . . .', 'G4 . D5 . G5 . A5 B5', 'G#5 . . . E5 . . .',
      'A4 . E5 . A5 . B5 C6', 'D6 . C6 . A5 . F5 .', 'B5 . D6 . G5 . B5 .', 'G#5 . A5 B5 G#5 . E5 .',
      'F5 . . E5 D5 . F5 .', 'E5 . . . C5 . A4 .', 'A5 . . G5 F5 . A5 .', 'G#5 . . . B5 . . .',
      'D6 . C6 . A5 . F5 .', 'E6 . C6 . A5 . E5 .', 'F5 . A5 . C6 . A5 .', 'B5 A5 G#5 F5 E5 D5 C5 B4',
    ],
    harm: [
      'A4 C5 E5 C5 A4 C5 E5 C5', 'A4 C5 F5 C5 A4 C5 F5 C5', 'G4 B4 D5 B4 G4 B4 D5 B4', 'G#4 B4 D5 B4 G#4 B4 E5 B4',
      'A4 C5 E5 C5 A4 C5 E5 C5', 'A4 C5 F5 C5 A4 C5 F5 C5', 'G4 B4 D5 B4 G4 B4 D5 B4', 'G#4 B4 D5 B4 G#4 B4 E5 B4',
      'A4 D5 F5 D5 A4 D5 F5 D5', 'A4 C5 E5 C5 A4 C5 E5 C5', 'A4 C5 F5 C5 A4 C5 F5 C5', 'G#4 B4 E5 B4 G#4 B4 E5 B4',
      'A4 D5 F5 D5 A4 D5 F5 D5', 'A4 C5 E5 C5 A4 C5 E5 C5', 'A4 C5 F5 C5 A4 C5 F5 C5', 'G#4 B4 D5 B4 G#4 B4 D5 B4',
    ],
    bass: [
      'A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3', 'G2 G3 G2 G3 G2 G3 G2 G3', 'E2 E3 E2 E3 E2 E3 G#2 B2',
      'A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3', 'G2 G3 G2 G3 G2 G3 G2 G3', 'E2 E3 E2 E3 E2 E3 G#2 B2',
      'D3 D4 D3 D4 D3 D4 D3 D4', 'A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3', 'E2 E3 E2 E3 E2 E3 E2 E3',
      'D3 D4 D3 D4 D3 D4 D3 D4', 'A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3', 'E2 E3 E2 E3 E2 E3 G#2 B2',
    ],
    drums: [
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K H S H K S S S',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K H S H S S S O',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K H S H K S S S',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K S K S S S S O',
    ],
  },
  // 오크 대장 그로크 — E단조, 빠르고 급박한 행진. 같은 음을 두드리는 리프와 쉬지 않는 베이스
  boss_orc: {
    bpm: 144,
    lead: [
      'E5 E5 - E5 G5 . F#5 E5', 'B4 . . B4 D5 . E5 .', 'E5 E5 - E5 G5 . A5 G5', 'F#5 . . D5 A5 . F#5 .',
      'E5 E5 - E5 G5 . F#5 E5', 'B4 . . B4 D5 . E5 .', 'G5 G5 - G5 E5 . C6 .', 'B5 . A5 . F#5 . D#5 .',
      'G5 . E5 G5 C6 . B5 A5', 'A5 . F#5 A5 D6 . C6 A5', 'B5 B5 - B5 G5 . E5 .', 'B5 B5 - B5 C6 . B5 .',
      'C6 C6 - C6 G5 . E5 .', 'D6 D6 - D6 A5 . F#5 .', 'D#6 D#6 - D#6 B5 . F#5 .', 'D#5 E5 F#5 G5 A5 . B5 .',
    ],
    harm: [
      'E4 G4 B4 G4 E4 G4 B4 G4', 'E4 G4 B4 G4 E4 G4 B4 G4', 'E4 G4 C5 G4 E4 G4 C5 G4', 'D4 F#4 A4 F#4 D4 F#4 A4 F#4',
      'E4 G4 B4 G4 E4 G4 B4 G4', 'E4 G4 B4 G4 E4 G4 B4 G4', 'E4 G4 C5 G4 E4 G4 C5 G4', 'D#4 F#4 A4 F#4 D#4 F#4 B4 F#4',
      'E4 G4 C5 G4 E4 G4 C5 G4', 'D4 F#4 A4 F#4 D4 F#4 A4 F#4', 'E4 G4 B4 G4 E4 G4 B4 G4', 'E4 G4 B4 G4 E4 G4 B4 G4',
      'E4 G4 C5 G4 E4 G4 C5 G4', 'D4 F#4 A4 F#4 D4 F#4 A4 F#4', 'D#4 F#4 A4 F#4 D#4 F#4 B4 F#4', 'D#4 F#4 A4 F#4 D#4 F#4 B4 F#4',
    ],
    bass: [
      'E2 E2 E3 E2 E2 E2 E3 E2', 'E2 E2 E3 E2 E2 E2 E3 E2', 'C3 C3 C4 C3 C3 C3 C4 C3', 'D3 D3 D4 D3 D3 D3 D4 D3',
      'E2 E2 E3 E2 E2 E2 E3 E2', 'E2 E2 E3 E2 E2 E2 E3 E2', 'C3 C3 C4 C3 C3 C3 C4 C3', 'B2 B2 B3 B2 B2 B2 A2 F#2',
      'C3 C3 C4 C3 C3 C3 C4 C3', 'D3 D3 D4 D3 D3 D3 D4 D3', 'E2 E2 E3 E2 E2 E2 E3 E2', 'E2 E2 E3 E2 E2 E2 E3 E2',
      'C3 C3 C4 C3 C3 C3 C4 C3', 'D3 D3 D4 D3 D3 D3 D4 D3', 'B2 B2 B3 B2 B2 B2 B3 B2', 'B2 B2 B3 B2 A2 G2 F#2 D#2',
    ],
    drums: [
      'K H S K K H S H', 'K H S K K H S H', 'K H S K K H S H', 'K H S K K S S S',
      'K H S K K H S H', 'K H S K K H S H', 'K H S K K H S H', 'K S K S K S S S',
      'K H S K K H S H', 'K H S K K H S H', 'K H S K K H S H', 'K H S K K S S S',
      'K H S K K H S H', 'K H S K K H S H', 'K H S K K H S H', 'S S S S S S S S',
    ],
  },
  // 악마 군주 (리치 왕 자리) — D단조, 반음으로 스며드는 수상한 선율과 아르페지오 질주
  boss_lich: {
    bpm: 120,
    lead: [
      'D5 . . F5 A5 . G#5 A5', 'D6 . . . A5 . F5 .', 'G5 . A5 A#5 A5 . G5 D5', 'C#5 . . E5 G5 . F5 E5',
      'D5 . . F5 A5 . G#5 A5', 'F6 . E6 . D6 . A#5 .', 'G5 A#5 D6 G6 D6 A#5 G5 A#5', 'A5 C#6 E6 G6 E6 C#6 A5 G5',
      'A#5 . A5 . G5 . D5 .', 'F5 . E5 . D5 . A4 .', 'A#4 . D5 . F5 . A5 .', 'G#5 . A5 . . . E5 .',
      'D6 . C#6 . D6 . A#5 .', 'A5 . G#5 . A5 . F5 .', 'F5 E5 F5 A#5 D6 . A#5 .', 'A5 G5 E5 C#5 A4 . C#5 E5',
    ],
    harm: [
      'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 A#4 F4 D4 F4 A#4 F4', 'D4 G4 A#4 G4 D4 G4 A#4 G4', 'C#4 E4 G4 E4 C#4 E4 A4 E4',
      'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 A#4 F4 D4 F4 A#4 F4', 'D4 G4 A#4 G4 D4 G4 A#4 G4', 'C#4 E4 G4 E4 C#4 E4 A4 E4',
      'D4 G4 A#4 G4 D4 G4 A#4 G4', 'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 A#4 F4 D4 F4 A#4 F4', 'C#4 E4 A4 E4 C#4 E4 A4 E4',
      'D4 G4 A#4 G4 D4 G4 A#4 G4', 'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 A#4 F4 D4 F4 A#4 F4', 'C#4 E4 G4 E4 C#4 E4 A4 E4',
    ],
    bass: [
      'D2 D3 D2 D3 D2 D3 D2 D3', 'A#1 A#2 A#1 A#2 A#1 A#2 A#1 A#2', 'G2 G3 G2 G3 G2 G3 G2 G3', 'A2 A3 A2 A3 A2 A3 C#3 E3',
      'D2 D3 D2 D3 D2 D3 D2 D3', 'A#1 A#2 A#1 A#2 A#1 A#2 A#1 A#2', 'G2 G3 G2 G3 G2 G3 G2 G3', 'A2 A3 A2 A3 A2 A3 C#3 E3',
      'G2 G3 G2 G3 G2 G3 G2 G3', 'D2 D3 D2 D3 D2 D3 D2 D3', 'A#1 A#2 A#1 A#2 A#1 A#2 A#1 A#2', 'A2 A3 A2 A3 A2 A3 A2 A3',
      'G2 G3 G2 G3 G2 G3 G2 G3', 'D2 D3 D2 D3 D2 D3 D2 D3', 'A#1 A#2 A#1 A#2 A#1 A#2 A#1 A#2', 'A2 A3 A2 A3 A2 G2 F2 E2',
    ],
    drums: [
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K H S H K S S O',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K H S H S S S O',
      'K - S - K - S -', 'K - S - K K S -', 'K - S - K - S -', 'K - S - K S S O',
      'K H S H K H S H', 'K H S H K K S H', 'K H S H K H S H', 'K S K S S S S O',
    ],
  },
};

const tokenize = rows => rows.join(' ').trim().split(/\s+/);

let playing = null;       // { name, timer, step, next } 또는 음원 파일이면 { name, src }

// 음원 파일은 WebAudio 버퍼로 반복한다 — <audio loop> 는 이음새에서 살짝 끊길 수 있다.
// 음원은 피크 -1 dBFS 로 맞춰 두고, 칩튠 곡과 체감 음량이 비슷하도록 여기서 줄인다.
const FILE_VOL = 0.9;
const buffers = {};
const badFiles = new Set();   // 못 받았거나 못 푼 파일(구형 iOS 의 OGG 등)은 칩튠 곡으로 대신한다
const loadBuffer = url => (buffers[url] ||= fetch(url)
  .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
  .then(b => ctx.decodeAudioData(b))
  .catch(err => { delete buffers[url]; throw err; }));

// 곡 파일을 미리 받아 풀어 둔다 (스플래시 동안 메뉴 음악을 준비해서 시작 화면에서 바로 나오게)
export function preloadBgm(name) {
  const url = BGM_FILES[name];
  if (url && !badFiles.has(url) && unlock()) loadBuffer(url).catch(() => {});
}

export function playBgm(name) {
  if (playing?.name === name) return;
  stopBgm();
  if (!unlock()) return;
  const url = BGM_FILES[name];
  if (url && !badFiles.has(url)) {
    const state = { name };
    playing = state;
    loadBuffer(url).then(buf => {
      if (playing !== state) return;   // 받는 사이 다른 곡으로 바뀌었다
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = true; g.gain.value = FILE_VOL;
      src.connect(g).connect(bgmGain);
      src.start();
      state.src = src;
    }).catch(() => {
      badFiles.add(url);
      if (playing === state) { playing = null; if (SONGS[name]) playBgm(name); }
    });
    return;
  }
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
  if (playing?.src) try { playing.src.stop(); } catch { /* 이미 멈춤 */ }
  playing = null;
}

// 탭이 가려지면 음악을 멈췄다가 돌아오면 이어서. 광고가 나오는 동안에도 멈춘다
let adPause = false;
export function pauseAudio(on) {
  adPause = !!on;
  if (!ctx) return;
  if (adPause) ctx.suspend().catch(() => {});
  else if (!document.hidden) ctx.resume().catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else if (!adPause) ctx.resume().catch(() => {});
});

// ── 효과음 ───────────────────────────────────────────────────────────────────
const seq = (notes, gap, opts = {}) => {
  if (!unlock()) return;
  const t0 = ctx.currentTime;
  notes.forEach((n, i) => n && voice(sfxGain, { type: opts.type || 'p50', f: freq(n), t: t0 + i * gap, dur: opts.dur || gap * 1.2, vol: opts.vol || 0.18 }));
};

// 짧은 팡파레: 배경음악과 같은 편성(펄스 리드 p25·펄스 화음 p12·삼각파 베이스·노이즈 드럼)
// parts: { p25|p12|tri: [[칸, 음, 길이, 비브라토]] }, drums: { kick, snare, hat: [칸…], crash: 칸 }
const FANFARE_VOL = { p25: 0.085, p12: 0.04, tri: 0.11 };
function fanfare(st, parts, drums = {}) {
  if (!unlock()) return;
  const t0 = ctx.currentTime + 0.02, at = i => t0 + i * st;
  for (const [type, notes] of Object.entries(parts))
    for (const [i, n, len, vib = 0] of notes) voice(sfxGain, { type, f: freq(n), t: at(i), dur: len * st * 0.95, vol: FANFARE_VOL[type], vib });
  (drums.kick || []).forEach(i => voice(sfxGain, { type: 'tri', f: 160, slide: 40, t: at(i), dur: 0.12, vol: 0.07 }));
  (drums.snare || []).forEach(i => noise(sfxGain, { t: at(i), dur: 0.08, vol: 0.04, hp: 1200, lp: 7000 }));
  (drums.hat || []).forEach(i => noise(sfxGain, { t: at(i), dur: 0.04, vol: 0.03, hp: 7000 }));
  if (drums.crash != null) noise(sfxGain, { t: at(drums.crash), dur: 0.45, vol: 0.03, hp: 5000 });
}

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
  // 굴리기 버튼: 손에 쥔 주사위를 흔드는 '착' 소리 + 짧은 진동
  rollPress() {
    buzz(35);
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'p25', f: 880, slide: 1320, t, dur: 0.06, vol: 0.12 });
    for (let i = 0; i < 4; i++) noise(sfxGain, { t: t + 0.02 + i * 0.045, dur: 0.035, vol: 0.16, hp: 1800, lp: 7000 });
  },
  // 고정한 주사위가 나무 주사위 함에 '톡' 들어가는 소리
  box() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 420, slide: 260, t, dur: 0.07, vol: 0.18 });
    noise(sfxGain, { t, dur: 0.03, vol: 0.08, hp: 600, lp: 3000 });
  },
  // 주사위 스킨별 부딪히는 소리 (style: skins.js 의 sound). 없으면 기본 달그락
  hit(style, v = 5) {
    if (!unlock()) return;
    const t = ctx.currentTime, k = Math.min(1, v / 14), r = Math.random();
    switch (style) {
      case 'silver': {      // 오픈하츠: 은 장신구끼리 부딪히는 '찰캉' — 밝은 금속 타격 + 비화성 배음, 세게 부딪히면 체인처럼 잘게 한 번 더
        if (t - (this.svT || 0) < 0.03) break;
        this.svT = t;
        const f = 1900 + r * 700;
        noise(sfxGain, { t, dur: 0.012, vol: 0.05 + k * 0.09, hp: 3500, lp: 12000 });
        ping(sfxGain, { f, t, dur: 0.32, vol: 0.04 + k * 0.07 });
        ping(sfxGain, { f: f * 1.006, t, dur: 0.32, vol: 0.02 + k * 0.03 });   // 살짝 어긋난 음이 맥놀이로 금속 떨림을 만든다
        ping(sfxGain, { f: f * 2.76, t, dur: 0.16, vol: 0.02 + k * 0.04 });
        ping(sfxGain, { f: f * 5.4, t, dur: 0.06, vol: 0.01 + k * 0.02 });
        if (k > 0.5) {
          const f2 = 2600 + Math.random() * 900, t2 = t + 0.03 + Math.random() * 0.03;
          noise(sfxGain, { t: t2, dur: 0.01, vol: 0.03 + k * 0.04, hp: 4000, lp: 12000 });
          ping(sfxGain, { f: f2, t: t2, dur: 0.14, vol: 0.02 + k * 0.03 });
          ping(sfxGain, { f: f2 * 2.76, t: t2, dur: 0.07, vol: 0.01 + k * 0.015 });
        }
        break;
      }
      case 'coin': {        // 황금: 금화가 부딪히는 짤랑
        const f = 3000 + r * 900;
        ping(sfxGain, { f, t, dur: 0.22, vol: 0.05 + k * 0.08, type: 'square' });
        ping(sfxGain, { f: f * 1.51, t: t + 0.012, dur: 0.28, vol: 0.03 + k * 0.05 });
        noise(sfxGain, { t, dur: 0.02, vol: 0.05 + k * 0.08, hp: 5000, lp: 12000 });
        break;
      }
      case 'soft':          // 미니멀: 톡 — 짧고 둥근 소리
        ping(sfxGain, { f: 520 + r * 120, slide: 300, t, dur: 0.07, vol: 0.12 + k * 0.14, type: 'triangle' });
        break;
      case 'twinkle': {     // 우주: 반짝 — 약하게 스치면 조용히, 세게 부딪힐 때만 두 음. 너무 자주 울리지 않게
        if (t - (this.twT || 0) < 0.09) break;
        this.twT = t;
        const notes = [1568, 1760, 2093, 2349, 2637];
        const n = k > 0.6 ? 2 : 1;
        for (let i = 0; i < n; i++) ping(sfxGain, { f: notes[Math.floor(Math.random() * notes.length)], t: t + i * 0.07, dur: 0.24, vol: 0.015 + k * 0.03 });
        break;
      }
      case 'glass': {       // 투명: 유리알이 부딪히는 챙
        const f = 2600 + r * 1200;
        ping(sfxGain, { f, t, dur: 0.2, vol: 0.05 + k * 0.08 });
        ping(sfxGain, { f: f * 2.32, t, dur: 0.12, vol: 0.02 + k * 0.04 });
        noise(sfxGain, { t, dur: 0.015, vol: 0.04 + k * 0.06, hp: 4000, lp: 11000 });
        break;
      }
      case 'pop':           // 하트: 뿅
        ping(sfxGain, { f: 700 + r * 200, slide: 1500 + r * 300, t, dur: 0.1, vol: 0.05 + k * 0.07, type: 'square' });
        break;
      case 'key':           // 키캡: 도각 — 스위치 클릭 + 낮은 바닥음
        noise(sfxGain, { t, dur: 0.018, vol: 0.12 + k * 0.2, hp: 2000, lp: 6000 });
        ping(sfxGain, { f: 170 + r * 40, slide: 120, t: t + 0.004, dur: 0.05, vol: 0.12 + k * 0.12, type: 'triangle' });
        break;
      default: this.clack(v);
    }
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
  // 레벨업 팡파레: 도약 → IV–V–I 로 올라가 C장조로 끝난다. 약 0.9초
  levelup() {
    buzz(80);
    fanfare(0.075, {
      p25: [[0, 'G5', 1], [1, 'C6', 1], [2, 'E6', 1], [3, 'G6', 2], [5, 'A6', 1], [6, 'B6', 1], [7, 'C7', 5, 1]],
      p12: [[0, 'E5', 1], [1, 'G5', 1], [2, 'C6', 1], [3, 'E6', 2], [5, 'F6', 1], [6, 'G6', 1], [7, 'E6', 5]],
      tri: [[0, 'C3', 3], [3, 'C4', 2], [5, 'F3', 1], [6, 'G3', 1], [7, 'C3', 5]],
    }, { kick: [0, 3, 7], snare: [3, 6, 6.5], crash: 7 });
  },
  card() { seq(['G6', 'D7'], 0.04, { type: 'p12', vol: 0.1 }); },
  legend() { seq(['C6', 'E6', 'G6', 'B6', 'D7', 'G7'], 0.05, { type: 'p12', vol: 0.12 }); },
  round() { seq(['G4', null, 'G4', 'C5'], 0.09, { type: 'p50', vol: 0.14 }); },
  turn() { seq(['E5', 'A5'], 0.09, { type: 'p25', vol: 0.12 }); },
  // 승리 팡파레: 빰빰빰 빠—암, 따라라 빠——암. 1.5초 뒤 이어지는 승리 곡과 같은 F장조, 약 1.35초
  win() {
    buzz(60);
    fanfare(0.09, {
      p25: [[0, 'A5', 1], [1, 'A5', 1], [2, 'A5', 1], [3, 'F6', 3], [6, 'E6', 1], [7, 'D6', 1], [8, 'E6', 1], [9, 'F6', 6, 1]],
      p12: [[0, 'F5', 1], [1, 'F5', 1], [2, 'F5', 1], [3, 'C6', 3], [6, 'C6', 1], [7, 'A#5', 1], [8, 'C6', 1], [9, 'A5', 6]],
      tri: [[0, 'F2', 3], [3, 'A2', 3], [6, 'C3', 1], [7, 'A#2', 1], [8, 'C3', 1], [9, 'F2', 6]],
    }, { kick: [0, 3, 9], snare: [3, 6, 7, 8, 8.5], crash: 9 });
  },
  start() { seq(['C5', 'G5', 'C6', 'E6', 'G6'], 0.06, { type: 'p25', vol: 0.16 }); buzz(30); },
  // 패배: F단조로 천천히 내려앉는 짧은 곡 (Fm–D♭–B♭m–C–Fm), 드럼은 거의 빼고 약 2초
  lose() {
    buzz(40);
    fanfare(0.13, {
      p25: [[0, 'C6', 2], [2, 'C#6', 2], [4, 'A#5', 2], [6, 'G5', 2], [8, 'F5', 8, 1]],
      p12: [[0, 'G#5', 2], [2, 'F5', 2], [4, 'F5', 2], [6, 'E5', 2], [8, 'C5', 8]],
      tri: [[0, 'F3', 2], [2, 'C#3', 2], [4, 'A#2', 2], [6, 'C3', 2], [8, 'F2', 8]],
    }, { kick: [0, 8] });
  },
  // 족보 완성 알림: 짧게 '띠링' — 두 음 도약 + 반짝이는 끝음, 약 0.25초
  combo() {
    buzz(20);
    fanfare(0.04, {
      p25: [[0, 'G6', 1], [1, 'C7', 1], [2, 'E7', 4]],
      p12: [[0, 'E6', 1], [1, 'G6', 1], [2, 'C7', 4]],
    }, { hat: [2] });
  },
  // 주사위가 에너지로 모이는 소리 (점점 높아진다)
  charge(power = 1) {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'p12', f: 220, slide: 880 + power * 400, t, dur: 0.55, vol: 0.12 });
    voice(sfxGain, { type: 'p25', f: 110, slide: 440 + power * 200, t: t + 0.05, dur: 0.5, vol: 0.07 });
  },
  // 대전: 에너지를 받아 강화되는 소리 — 낮게 깔린 웅 소리가 차오르며 반짝이는 상승 아르페지오로 끝난다
  powerUp(power = 1) {
    buzz(30 + power * 20);
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 82, slide: 165, t, dur: 0.45, vol: 0.16 });
    voice(sfxGain, { type: 'p50', f: 330, slide: 660 + power * 220, t, dur: 0.38, vol: 0.06 });
    const notes = power >= 2.4 ? ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'] : power >= 1.6 ? ['C5', 'E5', 'G5', 'C6', 'E6'] : ['C5', 'E5', 'G5', 'C6'];
    notes.forEach((n, i) => voice(sfxGain, { type: i % 2 ? 'p12' : 'p25', f: freq(n), t: t + 0.12 + i * 0.045, dur: 0.12, vol: 0.09, vib: i === notes.length - 1 ? 1 : 0 }));
    noise(sfxGain, { t: t + 0.12 + notes.length * 0.045, dur: 0.3, vol: 0.03, hp: 6000 });
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
    voice(sfxGain, { type: 'tri', f: 180, slide: 30, t, dur: 0.35 + power * 0.15, vol: 0.22 });
    noise(sfxGain, { t, dur: 0.3 + power * 0.25, vol: 0.12, hp: 200, lp: 4000 });
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
  // 마왕의 패기: 낮고 길게 '둥~' 한 번 (칩튠 화음 없이)
  haki() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 110, slide: 36, t, dur: 1.5, vol: 0.42 });
    voice(sfxGain, { type: 'p50', f: 55, slide: 30, t, dur: 1.3, vol: 0.05 });
    noise(sfxGain, { t, dur: 0.9, vol: 0.14, hp: 60, lp: 700 });
  },
  // 마왕의 봉인 (약 1.3초, fx.seal 과 박자를 맞춤): 낮게 깔리는 어둠 → 사방에서 쇠사슬이 날아와 철컥철컥 →
  // 사슬이 끼익 조여들고 → 쾅! 자물쇠가 잠긴다
  seal() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 70, slide: 38, t, dur: 1.3, vol: 0.3 });
    voice(sfxGain, { type: 'p50', f: 55, slide: 41, t, dur: 1.1, vol: 0.05, vib: 2 });
    noise(sfxGain, { t, dur: 0.5, vol: 0.06, hp: 150, lp: 900 });
    const clank = (tt, f, v = 1) => {           // 쇠사슬 고리 부딪히는 소리: 짧은 잡음 + 어긋난 금속 배음
      noise(sfxGain, { t: tt, dur: 0.02, vol: 0.14 * v, hp: 2500, lp: 11000 });
      ping(sfxGain, { f, t: tt, dur: 0.22, vol: 0.06 * v, type: 'square' });
      ping(sfxGain, { f: f * 2.76, t: tt, dur: 0.12, vol: 0.04 * v });
      ping(sfxGain, { f: f * 1.007, t: tt, dur: 0.2, vol: 0.03 * v });
    };
    [0.36, 0.43, 0.5, 0.57].forEach((d, i) => { clank(t + d, 1100 + i * 170); clank(t + d + 0.03, 1700 + i * 90, 0.5); });
    voice(sfxGain, { type: 'p12', f: 1100, slide: 140, t: t + 0.62, dur: 0.38, vol: 0.07, vib: 4 });   // 끼이익 조여든다
    for (let i = 0; i < 5; i++) clank(t + 0.66 + i * 0.05, 900 + Math.random() * 600, 0.45);
    voice(sfxGain, { type: 'tri', f: 170, slide: 28, t: t + 1.0, dur: 0.6, vol: 0.4 });            // 쾅
    noise(sfxGain, { t: t + 1.0, dur: 0.45, vol: 0.2, hp: 80, lp: 2400 });
    clank(t + 1.0, 620, 1.4);
    clank(t + 1.06, 930, 0.7);
    buzz(90); setTimeout(() => buzz(220), 1000);
  },
  // 봉인이 풀린다: 사슬이 떨리다 산산조각 → 유리처럼 부서지는 소리 + 밝게 솟구치는 화음
  unseal() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) noise(sfxGain, { t: t + i * 0.035, dur: 0.02, vol: 0.05 + i * 0.02, hp: 3000, lp: 10000 });
    noise(sfxGain, { t: t + 0.22, dur: 0.35, vol: 0.2, hp: 3500, lp: 12000 });
    voice(sfxGain, { type: 'tri', f: 120, slide: 40, t: t + 0.22, dur: 0.35, vol: 0.25 });
    for (let i = 0; i < 9; i++) ping(sfxGain, { f: 2000 + Math.random() * 2600, t: t + 0.22 + Math.random() * 0.25, dur: 0.25, vol: 0.04 });
    voice(sfxGain, { type: 'p25', f: 300, slide: 1800, t: t + 0.24, dur: 0.35, vol: 0.06 });
    ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => ping(sfxGain, { f: freq(n), t: t + 0.36 + i * 0.05, dur: 0.5, vol: 0.05, type: 'triangle' }));
    buzz(120);
  },
  drum() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    voice(sfxGain, { type: 'tri', f: 120, slide: 35, t, dur: 0.22, vol: 0.25 });
    noise(sfxGain, { t, dur: 0.12, vol: 0.07, hp: 100, lp: 1200 });
    buzz(35);
  },
  // 보스 등장 — 칼로 베는 소리 + 낮은 굉음
  slash() {
    if (!unlock()) return;
    const t = ctx.currentTime;
    noise(sfxGain, { t, dur: 0.18, vol: 0.11, hp: 3000, lp: 12000 });
    voice(sfxGain, { type: 'tri', f: 90, slide: 30, t: t + 0.05, dur: 0.9, vol: 0.22 });
    voice(sfxGain, { type: 'p50', f: 110, slide: 55, t: t + 0.05, dur: 0.8, vol: 0.03 });
    buzz(90);
  },
};
