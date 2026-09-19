// 효과음과 팝업. 오디오 파일 없이 WebAudio 로 합성해서 쓴다(추가 다운로드 0바이트).

// ── 소리 ─────────────────────────────────────────────────────────────────────
let ctx = null;
let muted = false;

try { muted = localStorage.getItem('acquire.muted') === '1'; } catch { /* 무시 */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('acquire.muted', muted ? '1' : '0'); } catch { /* 무시 */ }
}

// 브라우저는 사용자 조작 전에는 소리를 못 내게 막는다 — 첫 조작 때 열어 둔다
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { ctx = null; }
}

function tone({ freq, start = 0, dur = 0.3, type = 'sine', gain = 0.18, sweepTo = null }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  // 딸깍거리지 않게 앞뒤를 부드럽게 감싼다
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// 내 차례 / 새 채팅 — 짧은 차임벨 두 음
export function chime() {
  unlockAudio();
  tone({ freq: 880, dur: 0.22, type: 'triangle', gain: 0.16 });
  tone({ freq: 1318.5, start: 0.13, dur: 0.34, type: 'triangle', gain: 0.13 });
}

// 배당 — 동전 떨어지는 느낌의 밝은 두 음
export function cash() {
  unlockAudio();
  tone({ freq: 1046.5, dur: 0.12, type: 'square', gain: 0.08 });
  tone({ freq: 1567.98, start: 0.08, dur: 0.2, type: 'square', gain: 0.07 });
}

// 안전 체인 — 낮게 울리는 알림음
export function alert2() {
  unlockAudio();
  tone({ freq: 523.25, dur: 0.18, type: 'sine', gain: 0.14 });
  tone({ freq: 659.25, start: 0.12, dur: 0.26, type: 'sine', gain: 0.12 });
}

// 게임 종료 — 팡파르 + 환호성
export function fanfare() {
  unlockAudio();
  if (!ctx || muted) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];   // 도미솔도
  notes.forEach((f, i) => tone({ freq: f, start: i * 0.13, dur: 0.4, type: 'triangle', gain: 0.16 }));
  tone({ freq: 1318.5, start: 0.52, dur: 0.7, type: 'triangle', gain: 0.18 });

  // 환호성 — 필터를 통과시킨 잡음을 서서히 키웠다 줄인다
  const dur = 1.8;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 0.8;
  const amp = ctx.createGain();
  const t0 = ctx.currentTime;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.1, t0 + 0.45);
  amp.gain.setValueAtTime(0.1, t0 + 1.0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(amp).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

// ── 팝업 ─────────────────────────────────────────────────────────────────────
// 한 번에 하나씩 순서대로 띄운다 (이벤트가 몰려도 겹치지 않게)
const queue = [];
let showing = false;

function next() {
  if (showing || queue.length === 0) return;
  showing = true;
  const item = queue.shift();
  const dlg = document.getElementById('fxDialog');
  const body = document.getElementById('fxBody');
  body.replaceChildren(item.node);
  dlg.className = 'fx-dialog ' + (item.tone || '');

  let timer = null;
  const close = () => {
    clearTimeout(timer);
    try { dlg.close(); } catch { /* 무시 */ }
  };
  dlg.onclose = () => {
    dlg.onclick = null;
    showing = false;
    item.onClose?.();
    setTimeout(next, 120);
  };

  if (item.buttons?.length) {
    const row = document.createElement('div');
    row.className = 'fx-buttons';
    for (const b of item.buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' btn-primary' : '');
      btn.textContent = b.label;
      btn.onclick = () => { close(); b.onClick?.(); };
      row.append(btn);
    }
    body.append(row);
  }

  // 자동으로 사라지는 알림형 팝업은 아무 데나 눌러도 바로 닫히게 한다.
  // (선택을 요구하는 팝업은 버튼을 눌러야 닫힌다)
  dlg.onclick = item.buttons?.length ? null : close;

  dlg.showModal();
  if (item.ms) timer = setTimeout(close, item.ms);
  item.sound?.();
}

// node: 내용, ms: 자동 닫힘(ms), buttons: [{label, primary, onClick}]
export function popup({ node, ms, buttons, tone, sound, onClose }) {
  queue.push({ node, ms, buttons, tone, sound, onClose });
  next();
}

export const popupPending = () => showing || queue.length > 0;
