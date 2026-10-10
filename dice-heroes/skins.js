// 꾸미기 — 주사위 스킨 · 트레이 스킨.
import { GAME } from './config.js';
// 그림은 모두 캔버스로 그린다(이미지 파일 없음). three.js 에 의존하지 않아서 목록 미리보기(2D)에도 같은 그림을 쓴다.
//
// 각 스킨의 tier ('free' | 'special'). 스페셜 스킨은 보석으로 산다 (가격·보유 여부는 wallet.js).

// sound: 굴릴 때 부딪히는 소리 (audio.js sfx.hit)
export const DICE_SKINS = [
  { id: 'classic', name: '기본', desc: '상아색 기본 주사위', tier: 'free', sound: 'classic' },
  { id: 'openheart', name: '오픈하츠', desc: '톱니바퀴가 맞물린 구리 시계 · 빛나는 눈 · 은빛 찰캉 소리', tier: 'special', sound: 'silver' },
  { id: 'gold', name: '황금', desc: '온통 순금 · 새겨진 눈 · 금화 소리', tier: 'special', sound: 'coin' },
  { id: 'minimal', name: '미니멀', desc: '매끈하게 윤나는 하얀 주사위 · 톡톡 소리', tier: 'special', sound: 'soft' },
  { id: 'cosmic', name: '우주', desc: '은하수가 반짝이는 밤하늘 · 반짝 소리', tier: 'special', sound: 'twinkle' },
  { id: 'black', name: '블랙', desc: '흑요석처럼 깊고 윤나는 검정 · 하얀 눈', tier: 'special', sound: 'classic' },
  { id: 'clear', name: '투명', desc: '무지갯빛이 번지는 유리 주사위 · 유리 소리', tier: 'special', sound: 'glass' },
  { id: 'heart', name: '하트', desc: '반짝이는 연분홍에 하트 눈 · 뿅뿅', tier: 'special', sound: 'pop' },
  { id: 'keycap', name: '키캡', desc: '기계식 키보드 키캡 · 도각 소리', tier: 'special', sound: 'key' },
];

export const TRAY_SKINS = [
  { id: 'classic', name: '기본', desc: '초록 펠트 · 나무 테두리', tier: 'free' },
  { id: 'marble', name: '클래식', desc: '상아빛 대리석 · 빛나는 황금 나침반', tier: 'special' },
  { id: 'royal', name: '왕실', desc: '진홍 벨벳에 황금 왕관', tier: 'special' },
  { id: 'deepsea', name: '심해', desc: '일렁이는 물빛 · 산호와 별 나침반', tier: 'special' },
  { id: 'demon', name: '마왕성', desc: '검은 돌바닥에 보랏빛으로 타오르는 삼지창 문장', tier: 'special' },
  { id: 'sakura', name: '벚꽃', desc: '연분홍 바닥에 피어난 벚꽃 문양', tier: 'special' },
  { id: 'lava', name: '용암', desc: '갈라진 현무암 사이로 끓는 용암', tier: 'special' },
  { id: 'starry', name: '은하', desc: '밤하늘 초승달 · 반짝이는 별자리', tier: 'special' },
];

export const diceSkin = id => DICE_SKINS.find(s => s.id === id) || DICE_SKINS[0];
export const traySkin = id => TRAY_SKINS.find(s => s.id === id) || TRAY_SKINS[0];

// 결정적 난수 (스킨 그림이 매번 같게)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ── 주사위 ──────────────────────────────────────────────────────────────────
const PIP_POS = {
  1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]],
  4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
  5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
  6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]],
};

// 재질 (dice3d.js 가 읽는다)
//   env: 반사 세기 · toon: 만화풍 음영 · outline: 검은 외곽선 · cutout: 구멍 뚫린 면(양면)
//   clear: 반투명(양면) · bump: 새김 · glow: 발광 · twinkle: 반짝임
//   upright: 숫자 눈 — 굴린 뒤 윗면 숫자의 머리가 화면 위쪽을 향하게 세운다
const DIE_MAT = {
  classic: { roughness: 0.32, metalness: 0.02 },
  // image: 디자인 시트에서 오려 낸 면 그림(assets/dice/<스킨>/1~6.webp, tools/make_dice_from_sheet.py). 그림에 음영이 이미 들어 있다
// 기본(classic)만 코드로 그린다. 예전 코드 그림(하트·키캡·투명·미니멀)은 drawDieFace 에 그대로 남아 있다 — image 줄만 지우면 되돌아간다
  openheart: { roughness: 0.4, metalness: 0.45, env: 0.8, image: true },
  gold: { roughness: 0.28, metalness: 0.35, env: 0.9, image: true },
  minimal: { roughness: 0.3, metalness: 0.0, env: 0.35, image: true },
  cosmic: { roughness: 0.25, metalness: 0.1, env: 0.5, image: true, selfGlow: 0.35, twinkle: true },
  black: { roughness: 0.28, metalness: 0.1, env: 0.6, image: true },
  clear: { roughness: 0.12, metalness: 0.0, env: 0.9, image: true, selfGlow: 0.18 },
  heart: { roughness: 0.3, metalness: 0.0, env: 0.4, image: true },
  keycap: { roughness: 0.6, metalness: 0.0, env: 0.2, image: true },
};
export const dieMatParams = id => DIE_MAT[id] || DIE_MAT.classic;
export const dieGlows = id => !!DIE_MAT[id]?.glow;
// 그림 주소 끝에 게임 버전을 붙인다 — 오프라인 캐시(sw.js)가 주소가 같으면 저장해 둔 그림을 먼저 쓰기 때문에,
// 파일 이름이 그대로면 새 버전에서도 예전 그림이 계속 보였다 (주사위 모서리가 검던 예전 그림 등)
const AV = `?v=${GAME.version}`;
export const dieImage = (id, v) => (DIE_MAT[id]?.image ? `assets/dice/${id}/${v}.webp${AV}` : null);

// 면 그림을 미리 받아 둔다 (꾸미기에서 고르면 바로 바뀌게). 받은 그림은 READY 에 남는다
const IMGS = new Map();
export const READY = new Map();
export function loadImage(url) {
  if (!IMGS.has(url)) {
    IMGS.set(url, new Promise((res, rej) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => Promise.resolve(img.decode?.()).catch(() => {}).then(() => { READY.set(url, img); res(img); });
      img.onerror = () => { IMGS.delete(url); rej(new Error('load ' + url)); };
      img.src = url;
    }));
  }
  return IMGS.get(url);
}
const dieImages = id => [1, 2, 3, 4, 5, 6].map(v => dieImage(id, v)).filter(Boolean);
export const diceReady = id => dieImages(id).every(u => READY.has(u));
export const preloadDice = id => Promise.all(dieImages(id).map(loadImage));

function roundRect(g, x, y, w, h, r, begin = true) {
  if (begin) g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.55, y - s * 1.05, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.55, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  g.closePath();
}
// 둥근 눈 (입체 그라데이션)
function pips(g, v, col, one, W, { r0 = 25, r1 = 40, shine = true } = {}) {
  for (const [x, y] of PIP_POS[v]) {
    const rad = v === 1 ? r1 : r0;
    const px = x * W, py = y * W, c = v === 1 ? one : col;
    const pg = g.createRadialGradient(px - rad * .3, py - rad * .3, rad * .1, px, py, rad);
    pg.addColorStop(0, c[0]); pg.addColorStop(1, c[1]);
    g.fillStyle = pg;
    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
    if (shine) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py + 1.5, rad, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
  }
}

// 주사위 한 면 (256×256). mode: '' 색 | 'glow' 발광 지도 | 'bump' 새김 높이 지도
export function drawDieFace(c, v, id = 'classic', mode = '') {
  const W = c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = rng(v * 97 + id.length * 13);
  g.clearRect(0, 0, W, W);
  const radial = (a, b) => {
    const grad = g.createRadialGradient(100, 90, 20, 128, 128, 190);
    grad.addColorStop(0, a); grad.addColorStop(1, b);
    g.fillStyle = grad; g.fillRect(0, 0, W, W);
  };
  switch (id) {
    case 'openheart': {
      // 금속 테 + 안쪽 기계 골조(톱니·살) — 빈 곳은 투명해서 반대편 면이 비쳐 보인다
      const cu = g.createLinearGradient(0, 0, W, W);
      cu.addColorStop(0, '#F2B27A'); cu.addColorStop(0.5, '#C8733A'); cu.addColorStop(1, '#7A3C16');
      const dark = '#26211D';
      // 골조: 대각선 살 + 톱니바퀴 두 개
      g.strokeStyle = dark; g.lineWidth = 14; g.lineCap = 'round';
      g.beginPath(); g.moveTo(40, 60); g.lineTo(216, 196); g.moveTo(60, 216); g.lineTo(196, 40); g.stroke();
      const gear = (cx, cy, R, teeth) => {
        g.fillStyle = dark;
        g.beginPath();
        for (let k = 0; k < teeth * 2; k++) {
          const a = k / (teeth * 2) * Math.PI * 2, rr = k % 2 ? R : R * 1.2;
          g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.closePath(); g.fill();
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = '#8A5A34'; g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.stroke();
      };
      gear(78 + r() * 20, 170 + r() * 10, 30, 9);
      gear(178 - r() * 20, 82 + r() * 10, 24, 8);
      // 바깥 테 (두꺼운 구리 테 + 안쪽 모서리 그림자)
      g.fillStyle = cu;
      g.beginPath(); g.rect(0, 0, W, W); roundRect(g, 30, 30, W - 60, W - 60, 22, false); g.fill('evenodd');
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4; roundRect(g, 30, 30, W - 60, W - 60, 22); g.stroke();
      g.strokeStyle = 'rgba(255,230,200,.6)'; g.lineWidth = 2; g.strokeRect(6, 6, W - 12, W - 12);
      // 숫자: 구리 테두리 두른 굵은 숫자
      g.font = 'bold 183px Georgia, "Times New Roman", serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 22; g.strokeStyle = cu; g.strokeText(String(v), W / 2, W / 2 + 8);
      g.fillStyle = dark; g.fillText(String(v), W / 2, W / 2 + 8);
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,220,180,.7)'; g.strokeText(String(v), W / 2, W / 2 + 8);
      if (v === 6) { g.fillStyle = cu; g.fillRect(W / 2 - 41, W / 2 + 88, 82, 11); }   // 6 밑줄
      break;
    }
    case 'gold': {
      if (mode === 'bump') {
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
        for (const [x, y] of PIP_POS[v]) {
          const rad = v === 1 ? 38 : 24, px = x * W, py = y * W;
          const pg = g.createRadialGradient(px, py, 0, px, py, rad);
          pg.addColorStop(0, '#000'); pg.addColorStop(0.75, '#333'); pg.addColorStop(1, '#fff');
          g.fillStyle = pg; g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
        }
        break;
      }
      radial('#FFE68A', '#C8861A');
      for (let y = 0; y < W; y += 2) { g.fillStyle = `rgba(${r() < .5 ? '255,250,210' : '120,70,0'},${r() * 0.07})`; g.fillRect(0, y, W, 1); }
      const sh = g.createLinearGradient(0, 0, W, W);
      sh.addColorStop(0.15, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,235,.5)'); sh.addColorStop(0.75, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.fillRect(0, 0, W, W);
      // 새긴 눈: 어두운 금빛 구멍 + 아래쪽 반사 테
      for (const [x, y] of PIP_POS[v]) {
        const rad = v === 1 ? 38 : 24, px = x * W, py = y * W;
        const pg = g.createRadialGradient(px, py - rad * 0.3, rad * 0.1, px, py, rad);
        pg.addColorStop(0, '#2A1800'); pg.addColorStop(0.7, '#6A4308'); pg.addColorStop(1, '#B07A18');
        g.fillStyle = pg; g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,245,200,.85)'; g.lineWidth = 3;
        g.beginPath(); g.arc(px, py, rad - 1.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
      break;
    }
    case 'minimal': {
      // 만화 주사위: 크림색 면 + 가장자리로 갈수록 살짝 어두운 턱 + 윤기 도는 검은 타원 눈 (외곽선은 3D 에서)
      g.fillStyle = '#E3D4BA'; g.fillRect(0, 0, W, W);
      g.fillStyle = '#F6EFE2'; roundRect(g, 14, 14, W - 28, W - 28, 34); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(40, 28); g.lineTo(120, 24); g.stroke();
      for (const [x, y] of PIP_POS[v]) {
        const rx = v === 1 ? 40 : 27, ry = v === 1 ? 34 : 24, px = x * W, py = y * W;
        g.fillStyle = '#0E0E10'; g.beginPath(); g.ellipse(px, py, rx, ry, -0.25, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4;
        g.beginPath(); g.ellipse(px - rx * 0.1, py - ry * 0.1, rx * 0.62, ry * 0.55, -0.25, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
      }
      break;
    }
    case 'cosmic': {
      const glow = mode === 'glow';
      if (glow) { g.fillStyle = '#000'; g.fillRect(0, 0, W, W); }
      else {
        radial('#2A1060', '#05030F');
        const blobs = [['rgba(200,80,255,.55)', 110], ['rgba(90,110,255,.5)', 95], ['rgba(255,110,210,.4)', 80], ['rgba(120,60,220,.5)', 120], ['rgba(60,170,255,.35)', 70]];
        for (const [col, rad] of blobs) {
          const x = r() * W, y = r() * W;
          const ng = g.createRadialGradient(x, y, 0, x, y, rad);
          ng.addColorStop(0, col); ng.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = ng; g.fillRect(0, 0, W, W);
        }
        for (let k = 0; k < 4; k++) {         // 어두운 먼지띠
          const x = r() * W, y = r() * W, rad = 25 + r() * 35;
          const ng = g.createRadialGradient(x, y, 0, x, y, rad);
          ng.addColorStop(0, 'rgba(5,2,15,.7)'); ng.addColorStop(1, 'rgba(5,2,15,0)');
          g.fillStyle = ng; g.fillRect(0, 0, W, W);
        }
      }
      const rr = rng(v * 7 + 3);
      for (let k = 0; k < 140; k++) {
        const b = rr();
        g.fillStyle = `rgba(255,255,255,${0.35 + b * 0.65})`;
        const s = b > 0.93 ? 2.5 : 1.3;
        g.fillRect(rr() * W, rr() * W, s, s);
      }
      for (let k = 0; k < 5; k++) {         // 십자 빛줄기가 있는 밝은 별
        const x = rr() * W, y = rr() * W, L = 10 + rr() * 12;
        const sg = g.createRadialGradient(x, y, 0, x, y, L);
        sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(0.3, 'rgba(170,220,255,.6)'); sg.addColorStop(1, 'rgba(120,160,255,0)');
        g.fillStyle = sg; g.beginPath(); g.arc(x, y, L, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(220,240,255,.85)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x - L * 1.6, y); g.lineTo(x + L * 1.6, y); g.moveTo(x, y - L * 1.6); g.lineTo(x, y + L * 1.6); g.stroke();
      }
      // 눈: 빛나는 별빛 구슬
      for (const [x, y] of PIP_POS[v]) {
        const rad = v === 1 ? 34 : 22, px = x * W, py = y * W;
        const pg = g.createRadialGradient(px, py, 0, px, py, rad);
        if (v === 1) { pg.addColorStop(0, '#FFFFFF'); pg.addColorStop(0.45, '#FF8AE0'); pg.addColorStop(1, 'rgba(255,60,200,0)'); }
        else { pg.addColorStop(0, '#FFFFFF'); pg.addColorStop(0.45, '#9EEBFF'); pg.addColorStop(1, 'rgba(60,180,255,0)'); }
        g.fillStyle = pg; g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'black':
      radial('#34323C', '#060608');
      pips(g, v, ['#FFFFFF', '#CFCBD8'], ['#FF6B6B', '#B0122B'], W);
      break;
    case 'clear': {
      // 투명: 거의 비치는 면 + 반짝이는 테두리(흰·파랑·빨강 빛) + 유리알 눈 (1 만 빨강, 나머지 파랑)
      g.fillStyle = 'rgba(230,240,255,0.14)'; g.fillRect(0, 0, W, W);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 9; roundRect(g, 5, 5, W - 10, W - 10, 30); g.stroke();
      g.strokeStyle = 'rgba(190,215,255,0.45)'; g.lineWidth = 4; roundRect(g, 22, 22, W - 44, W - 44, 22); g.stroke();
      const rr = rng(v * 5 + 1);
      for (let k = 0; k < 10; k++) {          // 모서리에 맺힌 빛 알갱이
        const side = k % 4, t = rr() * (W - 40) + 20;
        const [x, y] = side === 0 ? [t, 8] : side === 1 ? [W - 8, t] : side === 2 ? [t, W - 8] : [8, t];
        const sg = g.createRadialGradient(x, y, 0, x, y, 9);
        sg.addColorStop(0, rr() < 0.3 ? 'rgba(255,90,90,.9)' : 'rgba(255,255,255,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sg; g.fillRect(x - 9, y - 9, 18, 18);
      }
      for (const [x, y] of PIP_POS[v]) {
        const rad = v === 1 ? 32 : 25, px = x * W, py = y * W, red = v === 1;
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
        g.beginPath(); g.arc(px, py, rad + 3, 0, Math.PI * 2); g.stroke();
        const pg = g.createRadialGradient(px - rad * .35, py - rad * .35, rad * .05, px, py, rad);
        if (red) { pg.addColorStop(0, '#FF7A7A'); pg.addColorStop(0.5, '#D8101E'); pg.addColorStop(1, '#6A0008'); }
        else { pg.addColorStop(0, '#6FA8FF'); pg.addColorStop(0.5, '#1447D6'); pg.addColorStop(1, '#061A66'); }
        g.fillStyle = pg; g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.9)';                  // 반짝 하이라이트
        g.beginPath(); g.arc(px - rad * .38, py - rad * .38, rad * .16, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(px + rad * .42, py + rad * .3, rad * .08, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'heart': {
      // 캔디처럼 반들반들한 분홍 + 도톰한 하트 눈 (둘레가 살짝 파인 테)
      g.fillStyle = '#E98AA4'; g.fillRect(0, 0, W, W);
      const body = g.createRadialGradient(96, 84, 20, 128, 128, 170);
      body.addColorStop(0, '#FFB0C4'); body.addColorStop(1, '#EE86A3');
      g.fillStyle = body; roundRect(g, 12, 12, W - 24, W - 24, 36); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(34, 26); g.lineTo(100, 22); g.stroke();
      for (const [x, y] of PIP_POS[v]) {
        const sz = v === 1 ? 64 : 32, px = x * W, py = y * W + sz * 0.2;
        g.fillStyle = 'rgba(150,20,60,.45)'; heartPath(g, px, py + 2, sz * 1.14); g.fill();   // 파인 테
        g.fillStyle = '#FF9DB8'; heartPath(g, px, py, sz * 1.06); g.fill();
        const hg = g.createLinearGradient(px, py - sz, px, py + sz * 0.4);
        hg.addColorStop(0, '#F03A6E'); hg.addColorStop(1, '#A80A3A');
        g.fillStyle = hg; heartPath(g, px, py, sz); g.fill();
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.beginPath(); g.ellipse(px - sz * 0.42, py - sz * 0.58, sz * 0.15, sz * 0.09, -0.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(px + sz * 0.38, py - sz * 0.62, sz * 0.08, sz * 0.05, 0.6, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'keycap': {
      // 키캡: 아래쪽 치마(어두운 옆벽) + 오목하게 휜 윗면 + 음각 숫자. 1 은 주황, 나머지는 회색
      const orange = v === 1;
      const top = orange ? ['#F48A3A', '#E0701E'] : ['#C4C6C9', '#AEB0B4'];
      const skirt = orange ? '#B8561A' : '#6E7074', edge = orange ? '#D06420' : '#8A8C90';
      g.fillStyle = skirt; g.fillRect(0, 0, W, W);
      g.fillStyle = edge;                                     // 좌우 옆벽 (위로 갈수록 좁아지는 사다리꼴)
      g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W - 22, W * 0.72); g.lineTo(22, W * 0.72); g.closePath(); g.fill();
      const tg = g.createLinearGradient(0, 20, 0, W * 0.74);
      tg.addColorStop(0, top[0]); tg.addColorStop(1, top[1]);
      g.fillStyle = tg;                                       // 윗면: 위 가장자리가 오목하게 휜 모양
      g.beginPath();
      g.moveTo(28, 26); g.quadraticCurveTo(W / 2, 46, W - 28, 26);
      g.lineTo(W - 34, W * 0.7); g.quadraticCurveTo(W / 2, W * 0.66, 34, W * 0.7); g.closePath(); g.fill();
      const dish = g.createRadialGradient(W / 2, W * 0.36, 10, W / 2, W * 0.36, 110);
      dish.addColorStop(0, 'rgba(0,0,0,.07)'); dish.addColorStop(1, 'rgba(255,255,255,.08)');
      g.fillStyle = dish; g.fill();
      for (let k = 0; k < 900; k++) {                          // PBT 결
        g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},.05)`;
        g.fillRect(Math.random() * W, Math.random() * W, 1.5, 1.5);
      }
      // 음각 숫자: 어두운 글자 + 아래쪽 밝은 테(파인 느낌)
      g.font = 'bold 118px "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const cy = W * 0.38;
      g.fillStyle = orange ? 'rgba(255,200,150,.6)' : 'rgba(255,255,255,.6)'; g.fillText(String(v), W / 2, cy + 3);
      g.fillStyle = orange ? '#8A3A0A' : '#2E2F33'; g.fillText(String(v), W / 2, cy);
      break;
    }
    default:
      radial('#FFFDF6', '#EDE3CF');
      pips(g, v, ['#4A3A6B', '#16102A'], ['#FF6B6B', '#B0122B'], W);
  }
  if (mode === 'glow' && id !== 'cosmic') { g.fillStyle = '#000'; g.fillRect(0, 0, W, W); }
  return c;
}

// 2D 대체 화면(dice2d)에 쓰는 색
const D2 = {
  classic: ['#FFFDF6', '#EDE3CF', '#16102A', '#B0122B'], openheart: ['#C8733A', '#4A2A12', '#1A1512', '#1A1512'],
  gold: ['#FFE68A', '#C8861A', '#5A3A08', '#5A3A08'], minimal: ['#FFFFFF', '#FFFFFF', '#111111', '#111111'],
  cosmic: ['#3A1A80', '#05030F', '#9EEBFF', '#FF8AE0'], black: ['#34323C', '#060608', '#FFFFFF', '#FF6B6B'],
  clear: ['#E8F2FF', '#B8D0F0', '#1230B0', '#B00020'], heart: ['#FFF3F7', '#FFB8CE', '#E0306A', '#C9184A'],
  keycap: ['#EEE6D4', '#C8C0AE', '#3A3A3E', '#F28C28'],
};
export function die2dColors(id) {
  const [a, b, pip, one] = D2[id] || D2.classic;
  return { bg: `radial-gradient(circle at 40% 35%, ${a}, ${b})`, pip, one };
}

// ── 트레이 ──────────────────────────────────────────────────────────────────
const TRAY_STYLE = {
  classic: { floor: ['#2E8F6E', '#0E4A3A'], line: 'rgba(255, 215, 120, .28)', rail: 0x6B3A1A, trim: 0xE0A93A, box: '#7A4520' },
  royal: { floor: ['#C8193A', '#4A0612'], line: 'rgba(255, 210, 110, .55)', rail: 0x3B1A0E, trim: 0xFFC83D, trimEnv: true, box: '#4A1A10', damask: true },
  deepsea: { floor: ['#1B6CA8', '#07233F'], line: 'rgba(160, 240, 255, .45)', rail: 0x2F5F70, trim: 0xCFE8F0, trimEnv: true, box: '#50606A', waves: true },
  demon: { floor: ['#3A2F4A', '#130E1C'], line: 'rgba(180, 110, 255, .5)', rail: 0x1A1424, trim: 0xB36BFF, trimGlow: true, box: '#2A2030', stone: true, circle: true, glow: 0.9 },
  sakura: { floor: ['#FAC4D2', '#D9738F'], line: 'rgba(255, 255, 255, .6)', rail: 0xF2E6D8, trim: 0xE8A0A0, trimEnv: true, box: '#D8B89A', petals: true },
  lava: { floor: ['#3B2A22', '#120A08'], line: 'rgba(255, 140, 40, .35)', rail: 0x3A3533, trim: 0xFF7A1A, trimGlow: true, box: '#2A1E18', cracks: true, glow: 1.2 },
  starry: { floor: ['#1E1650', '#03020C'], line: 'rgba(90, 240, 255, .55)', rail: 0x0E0C18, trim: 0x3EF0FF, trimGlow: true, box: '#1A1628', stars: true, glow: 0.8 },
};
// 그림 트레이 (v0.30, 디자인 시트에서 오림 · tools/make_trays_from_sheet.py): 바닥 · 발광 지도 · 함 바닥 · 목록 그림을
// assets/trays/<스킨>/ 의 파일로 쓰고, 테두리(rail)·장식(trim) 색만 여기서 정한다. glow: 바닥 발광 세기.
// 예전 코드 그림 트레이는 TRAY_STYLE 에 그대로 있다 — IMAGE_TRAY 에서 빼면 되돌아간다
const IMAGE_TRAY = {
  marble: { rail: 0xE9DFCB, trim: 0xD4A443, trimEnv: true, glow: 0.3 },
  royal: { rail: 0x7E1222, trim: 0xFFC83D, trimEnv: true, glow: 0.35 },
  deepsea: { rail: 0x1E4A52, trim: 0xD8B45A, trimEnv: true, glow: 0.55 },
  demon: { rail: 0x15101C, trim: 0xB36BFF, trimGlow: true, glow: 0.9 },   // 보라 · 검정 테마
  sakura: { rail: 0xA8744A, trim: 0xF5A8C0, trimEnv: true, glow: 0.35 },
  lava: { rail: 0x2B2422, trim: 0xFF7A1A, trimGlow: true, glow: 1.1 },
  starry: { rail: 0x161C52, trim: 0xE6C35C, trimEnv: true, glow: 0.8 },
};
export const trayStyle = id => (IMAGE_TRAY[id] ? { ...(TRAY_STYLE[id] || TRAY_STYLE.classic), ...IMAGE_TRAY[id], image: true } : TRAY_STYLE[id] || TRAY_STYLE.classic);
// 그림 트레이의 파일 주소 (kind: floor · glow · box · thumb). 코드로 그리는 트레이는 null
export const trayImage = (id, kind) => (IMAGE_TRAY[id] ? `assets/trays/${id}/${kind}.webp${AV}` : null);
// 트레이 그림도 미리 받아 둔다 (꾸미기에서 고르면 바닥이 비었다가 뒤늦게 뜨지 않게)
const trayImages = id => ['floor', 'glow', 'box'].map(k => trayImage(id, k)).filter(Boolean);
export const trayReady = id => trayImages(id).every(u => READY.has(u));
export const preloadTray = id => Promise.all(trayImages(id).map(loadImage));

// 트레이 바닥 (512×512). glowOnly: 빛나는 부분(마법진·용암·별)만 그린 발광 지도
export function drawTrayFloor(c, id = 'classic', glowOnly = false) {
  const st = trayStyle(id);
  const W = c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = rng(id.length * 31 + 7);
  if (glowOnly) { g.fillStyle = '#000'; g.fillRect(0, 0, W, W); }
  else {
    const grad = g.createRadialGradient(256, 220, 40, 256, 256, 380);
    grad.addColorStop(0, st.floor[0]);
    grad.addColorStop(1, st.floor[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, W);
    // 천 · 돌 결 (잡티)
    const img = g.getImageData(0, 0, W, W);
    const rough = st.stone ? 30 : 18;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * rough;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    if (st.damask) {                       // 왕실 문양: 금빛 마름모 격자 + 작은 문장
      g.strokeStyle = 'rgba(255, 200, 90, .16)'; g.lineWidth = 2;
      for (let k = -W; k < W * 2; k += 48) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k + W, W); g.stroke();
        g.beginPath(); g.moveTo(k, W); g.lineTo(k + W, 0); g.stroke();
      }
      g.fillStyle = 'rgba(255, 210, 110, .22)';
      for (let y = 24; y < W; y += 48) for (let x = (y / 48) % 2 ? 48 : 24; x < W; x += 48) {
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.fill();
      }
    }
    if (st.waves) {                        // 물결 + 물방울
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(150, 230, 255, ${0.08 + r() * 0.12})`;
        g.lineWidth = 2 + r() * 3;
        g.beginPath();
        const y0 = k * 38 + r() * 10, ph = r() * 6;
        for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + Math.sin(x / 40 + ph) * 8);
        g.stroke();
      }
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = 'rgba(220, 250, 255, .35)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(r() * W, r() * W, 2 + r() * 6, 0, Math.PI * 2); g.stroke();
      }
    }
    if (st.stone) {                        // 돌바닥 타일
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
      for (let y = 0; y < W; y += 64) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        for (let x = (y / 64) % 2 ? 32 : 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); }
      }
    }
    if (st.petals) {                       // 벚꽃잎
      for (let k = 0; k < 60; k++) {
        const x = r() * W, y = r() * W, a = r() * 6.3, s = 5 + r() * 7;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = r() < 0.5 ? 'rgba(255,240,245,.85)' : 'rgba(255,190,210,.9)';
        g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(230,110,150,.5)';
        g.beginPath(); g.arc(s * 0.7, 0, s * 0.18, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
  }
  if (st.circle) {                         // 마법진 (발광)
    g.save(); g.translate(W / 2, W / 2);
    g.strokeStyle = glowOnly ? '#B36BFF' : 'rgba(200, 140, 255, .75)';
    g.shadowColor = '#B36BFF'; g.shadowBlur = glowOnly ? 12 : 18;
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 170, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 145, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * (Math.PI * 4 / 5); g.lineTo(Math.cos(a) * 145, Math.sin(a) * 145); }
    g.stroke();
    g.font = 'bold 18px serif'; g.fillStyle = g.strokeStyle; g.textAlign = 'center';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ';
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; g.save(); g.rotate(a); g.fillText(runes[k], 0, -152); g.restore(); }
    g.restore();
  }
  if (st.cracks) {                         // 용암 틈 (발광)
    const rr = rng(99);
    g.strokeStyle = glowOnly ? '#FF7A1A' : '#FF9A3A';
    g.shadowColor = '#FF5A00'; g.shadowBlur = 14;
    for (let k = 0; k < 16; k++) {
      g.lineWidth = 2 + rr() * 5;
      g.beginPath();
      let x = rr() * W, y = rr() * W;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rr() - 0.5) * 110; y += (rr() - 0.5) * 110; g.lineTo(x, y); }
      g.stroke();
    }
    g.shadowBlur = 0;
  }
  if (st.stars) {                          // 별 + 성운 (발광)
    const rr = rng(7);
    if (!glowOnly) for (let k = 0; k < 6; k++) {
      const x = rr() * W, y = rr() * W, rad = 90 + rr() * 120;
      const ng = g.createRadialGradient(x, y, 0, x, y, rad);
      ng.addColorStop(0, k % 2 ? 'rgba(255,70,200,.28)' : 'rgba(60,200,255,.25)');
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(0, 0, W, W);
    }
    for (let k = 0; k < 220; k++) {
      const s = rr() < 0.92 ? 1.5 : 3.5;
      g.fillStyle = `rgba(255,255,255,${0.4 + rr() * 0.6})`;
      g.fillRect(rr() * W, rr() * W, s, s);
    }
  }
  // 가장자리 장식선
  g.strokeStyle = glowOnly ? (st.glow ? st.line : '#000') : st.line;
  g.lineWidth = 4;
  g.strokeRect(22, 22, W - 44, W - 44);
  g.lineWidth = 1.5;
  g.strokeRect(34, 34, W - 68, W - 68);
  return c;
}
export const trayGlows = id => !!trayStyle(id).glow;

// 주사위 함 바닥 나뭇결 (512×128)
export function drawBoxFloor(c, id = 'classic') {
  const st = trayStyle(id);
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const r = rng(5);
  g.fillStyle = st.box;
  g.fillRect(0, 0, 512, 128);
  for (let b = 0; b < 4; b++) {
    const y0 = b * 32;
    g.fillStyle = b % 2 ? 'rgba(0,0,0,.08)' : 'rgba(255,220,170,.05)';
    g.fillRect(0, y0, 512, 32);
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(${40 + k * 6}, 20, 5, ${0.18 + r() * 0.15})`;
      g.lineWidth = 1 + r();
      g.beginPath();
      const yy = y0 + 3 + r() * 26;
      g.moveTo(0, yy);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, yy + Math.sin(x / 60 + b * 2 + k) * 2.2);
      g.stroke();
    }
    g.fillStyle = 'rgba(30, 12, 2, .55)';
    g.fillRect(0, y0 + 31, 512, 1.5);
  }
  return c;
}

// 목록 미리보기 (작은 캔버스)
// 한 번 그린 목록 그림은 다시 쓴다 (고를 때마다 목록을 새로 그리므로)
const THUMBS = new Map();
const memo = (key, f) => THUMBS.get(key) ?? THUMBS.set(key, f()).get(key);
export const diceThumb = id => memo('d:' + id, () => drawDiceThumb(id));
export const trayThumb = id => memo('t:' + id, () => drawTrayThumb(id));
function drawDiceThumb(id) {
  if (dieImage(id, 5)) return dieImage(id, 5);
  const big = drawDieFace(document.createElement('canvas'), 5, id);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.beginPath(); g.roundRect(4, 4, 88, 88, 18); g.clip();
  if (id === 'clear') { g.fillStyle = '#2E8F6E'; g.fillRect(4, 4, 88, 88); }
  g.drawImage(big, 4, 4, 88, 88);
  return c.toDataURL();
}
function drawTrayThumb(id) {
  if (trayImage(id, 'thumb')) return trayImage(id, 'thumb');
  const st = trayStyle(id);
  const floor = drawTrayFloor(document.createElement('canvas'), id);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(st.rail); g.fillRect(0, 0, 128, 96);
  g.fillStyle = hex(st.trim); g.fillRect(3, 3, 122, 90);
  g.fillStyle = hex(st.rail); g.fillRect(6, 6, 116, 84);
  g.drawImage(floor, 0, 0, 512, 512, 10, 10, 108, 76);
  return c.toDataURL();
}
