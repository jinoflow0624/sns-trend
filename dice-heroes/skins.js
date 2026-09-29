// 꾸미기 — 주사위 스킨 · 트레이 스킨.
// 그림은 모두 캔버스로 그린다(이미지 파일 없음). three.js 에 의존하지 않아서 목록 미리보기(2D)에도 같은 그림을 쓴다.
//
// 나중에 유료 해금을 붙일 자리: 각 스킨의 tier ('free' | 'special'). 지금은 모두 열려 있다(isUnlocked).
// 결제를 붙일 때 isUnlocked 만 바꾸면 목록·선택 화면은 그대로 동작한다.

export const DICE_SKINS = [
  { id: 'classic', name: '기본', desc: '상아색 기본 주사위', tier: 'free' },
  { id: 'ruby', name: '루비', desc: '붉은 보석에 금빛 눈', tier: 'special' },
  { id: 'obsidian', name: '흑요석 금장', desc: '검은 돌에 금박 테두리', tier: 'special' },
  { id: 'jade', name: '비취', desc: '결이 흐르는 초록 옥', tier: 'special' },
  { id: 'galaxy', name: '은하수', desc: '별이 반짝이는 밤하늘 · 빛나는 눈', tier: 'special' },
  { id: 'ice', name: '얼음 수정', desc: '금이 간 푸른 얼음', tier: 'special' },
  { id: 'gold', name: '황금', desc: '반짝이는 순금 주사위', tier: 'special' },
];

export const TRAY_SKINS = [
  { id: 'classic', name: '기본', desc: '초록 펠트 · 나무 테두리', tier: 'free' },
  { id: 'royal', name: '왕실', desc: '진홍 벨벳 · 금 장식', tier: 'special' },
  { id: 'deepsea', name: '심해', desc: '물결치는 바다 · 은빛 테두리', tier: 'special' },
  { id: 'demon', name: '마왕성', desc: '돌바닥에 빛나는 마법진', tier: 'special' },
  { id: 'sakura', name: '벚꽃', desc: '꽃잎이 흩날리는 분홍 펠트', tier: 'special' },
  { id: 'lava', name: '용암', desc: '갈라진 현무암 · 끓는 용암', tier: 'special' },
  { id: 'starry', name: '은하', desc: '우주 바닥 · 네온 테두리', tier: 'special' },
];

export const isUnlocked = () => true;   // TODO(유료화): 구매 기록을 보고 판단
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

// 스킨별 바탕 · 눈 색 · 재질
const DIE_STYLE = {
  classic: { bg: ['#FFFDF6', '#EDE3CF'], pip: ['#4A3A6B', '#16102A'], one: ['#FF6B6B', '#B0122B'], mat: { roughness: 0.32, metalness: 0.02 } },
  ruby: { bg: ['#FF3355', '#5A0010'], pip: ['#FFF3B0', '#C8901E'], one: ['#FFFFFF', '#FFD76A'], mat: { roughness: 0.12, metalness: 0.25, env: 0.7, emissive: 0x2A0008 }, facets: true },
  obsidian: { bg: ['#3A3350', '#07060C'], pip: ['#FFE9A0', '#B8860B'], one: ['#FF6B6B', '#B0122B'], mat: { roughness: 0.18, metalness: 0.3, env: 1.0 }, border: '#E8B84A' },
  jade: { bg: ['#5FCB8E', '#0E5A36'], pip: ['#0E2E20', '#021208'], one: ['#FF6B6B', '#9E0F24'], mat: { roughness: 0.22, metalness: 0.05, env: 0.5 }, veins: true },
  galaxy: { bg: ['#3A2A7A', '#07051A'], pip: ['#B8FFFF', '#26C6FF'], one: ['#FFB8F0', '#FF3DB8'], mat: { roughness: 0.3, metalness: 0.1, env: 0.6, glow: 0.9 }, stars: true, glowPips: true },
  ice: { bg: ['#E0F7FF', '#4FA8E0'], pip: ['#1A4F90', '#061E44'], one: ['#FF6B8A', '#B0122B'], mat: { roughness: 0.08, metalness: 0.05, env: 0.9, emissive: 0x0A2030 }, cracks: true },
  gold: { bg: ['#FFD84A', '#A8640A'], pip: ['#4A2800', '#1E1000'], one: ['#FF4B4B', '#8E0A1C'], mat: { roughness: 0.25, metalness: 0.7, env: 1.1 }, brushed: true },
};
export const dieMatParams = id => DIE_STYLE[id]?.mat || DIE_STYLE.classic.mat;

// 주사위 한 면 (256×256). glowOnly: 빛나는 눈만 그린 발광 지도
export function drawDieFace(c, v, id = 'classic', glowOnly = false) {
  const st = DIE_STYLE[id] || DIE_STYLE.classic;
  const W = c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = rng(v * 97 + id.length * 13);
  if (glowOnly) { g.fillStyle = '#000'; g.fillRect(0, 0, W, W); }
  else {
    const grad = g.createRadialGradient(100, 90, 20, 128, 128, 190);
    grad.addColorStop(0, st.bg[0]);
    grad.addColorStop(1, st.bg[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, W);
    if (st.facets) {                       // 보석 면: 빛이 꺾인 조각
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.1})`;
        g.beginPath();
        g.moveTo(128, 128);
        const a = r() * 6.3, b = a + 0.5 + r() * 0.6;
        g.lineTo(128 + Math.cos(a) * 200, 128 + Math.sin(a) * 200);
        g.lineTo(128 + Math.cos(b) * 200, 128 + Math.sin(b) * 200);
        g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      g.strokeRect(30, 30, 196, 196);
    }
    if (st.veins) {                        // 옥의 결
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = `rgba(${r() < .5 ? '240,255,245' : '10,60,35'},${0.12 + r() * 0.2})`;
        g.lineWidth = 1 + r() * 4;
        g.beginPath();
        let x = r() * W, y = 0;
        g.moveTo(x, y);
        while (y < W) { x += (r() - 0.5) * 60; y += 20 + r() * 30; g.lineTo(x, y); }
        g.stroke();
      }
    }
    if (st.stars) {                        // 성운 + 별
      for (let k = 0; k < 4; k++) {
        const x = r() * W, y = r() * W, rad = 50 + r() * 70;
        const ng = g.createRadialGradient(x, y, 0, x, y, rad);
        ng.addColorStop(0, k % 2 ? 'rgba(255,80,200,.35)' : 'rgba(60,200,255,.3)');
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ng; g.fillRect(0, 0, W, W);
      }
      for (let k = 0; k < 70; k++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
        const s = r() < 0.9 ? 1.5 : 3;
        g.fillRect(r() * W, r() * W, s, s);
      }
    }
    if (st.cracks) {                       // 얼음 금
      g.strokeStyle = 'rgba(255,255,255,.8)';
      for (let k = 0; k < 6; k++) {
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        let x = r() * W, y = r() * W;
        g.moveTo(x, y);
        for (let s = 0; s < 4; s++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); }
        g.stroke();
      }
      const sh = g.createLinearGradient(0, 0, W, W);
      sh.addColorStop(0, 'rgba(255,255,255,.45)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.fillRect(0, 0, W, W);
    }
    if (st.brushed) {                      // 금 결
      for (let y = 0; y < W; y += 2) {
        g.fillStyle = `rgba(${r() < .5 ? '255,255,220' : '120,70,0'},${r() * 0.08})`;
        g.fillRect(0, y, W, 1);
      }
      const sh = g.createLinearGradient(0, 0, W, W);
      sh.addColorStop(0.2, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,240,.45)'); sh.addColorStop(0.8, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.fillRect(0, 0, W, W);
    }
    if (st.border) {
      g.strokeStyle = st.border; g.lineWidth = 7;
      g.strokeRect(22, 22, 212, 212);
      g.lineWidth = 2;
      g.strokeRect(34, 34, 188, 188);
    }
  }
  for (const [x, y] of PIP_POS[v]) {
    const rad = v === 1 ? 40 : 25;
    const px = x * W, py = y * W;
    const col = v === 1 ? st.one : st.pip;
    if (glowOnly && !st.glowPips) continue;
    if (st.glowPips) { g.shadowColor = col[1]; g.shadowBlur = 24; }
    const pg = g.createRadialGradient(px - rad * .3, py - rad * .3, rad * .1, px, py, rad);
    pg.addColorStop(0, col[0]);
    pg.addColorStop(1, col[1]);
    g.fillStyle = pg;
    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    if (!glowOnly) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py + 1.5, rad, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
  }
  return c;
}
export const dieGlows = id => !!DIE_STYLE[id]?.glowPips;

// 2D 대체 화면(dice2d)에 쓰는 색
export function die2dColors(id) {
  const st = DIE_STYLE[id] || DIE_STYLE.classic;
  return { bg: `radial-gradient(circle at 40% 35%, ${st.bg[0]}, ${st.bg[1]})`, pip: st.pip[1], one: st.one[1] };
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
export const trayStyle = id => TRAY_STYLE[id] || TRAY_STYLE.classic;

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
export function diceThumb(id) {
  const big = drawDieFace(document.createElement('canvas'), 5, id);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.beginPath(); g.roundRect(4, 4, 88, 88, 18); g.clip();
  g.drawImage(big, 4, 4, 88, 88);
  return c.toDataURL();
}
export function trayThumb(id) {
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
