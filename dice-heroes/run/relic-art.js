// 원정 유물 그림 (16×16 도트). 그림이 없는 유물은 공용 12×12 아이콘(icons.js, RELICS 의 icon)을 쓴다.
// 그리는 규칙 · 유물별 콘셉트는 run/RELICS-ART.md. 큰 그림 파일(64px 이상)을 만들면 assets/run/relic/<id>.webp 로 넣고 FILES 에 id 를 적는다.
//
// 형식 (적 그림 run/art.js 의 MON 과 같다):
//   <유물 id>: { pal: { 글자: '#RRGGBB', ... }, rows: [16글자 × 16줄] }
//   '.' = 투명, 'k' = 외곽선 (#1A1030, pal 에 안 적어도 된다). 나머지 글자는 pal 에 적은 색.
import { GAME } from '../config.js';
import { ico } from '../icons.js';

const AV = `?v=${GAME.version}`;
// 그림 파일이 생긴 유물 (예: ['ace', 'flow'])
export const FILES = [];
const K = '#1A1030';
export const RELIC_ART = {
  // 여기에 유물 그림을 채운다 (run/RELICS-ART.md 의 목록 순서대로)
};

const cache = new Map();
function draw(id) {
  const m = RELIC_ART[id];
  const S = 4, c = document.createElement('canvas');
  c.width = c.height = 16 * S;
  const g = c.getContext('2d');
  const pal = { k: K, ...m.pal };
  m.rows.forEach((row, y) => [...row.padEnd(16, '.').slice(0, 16)].forEach((ch, x) => {
    if (ch === '.' || !pal[ch]) return;
    g.fillStyle = pal[ch];
    g.fillRect(x * S, y * S, S, S);
  }));
  return c.toDataURL();
}
// 유물 아이콘 <img>. cls: '' 24px · 'xs' 12px · 'lg' 48px (공용 아이콘과 같은 크기 규칙)
export function relicIco(r, cls = '') {
  const c = `ico relic-art${cls ? ' ' + cls : ''}`;
  if (FILES.includes(r.id)) return `<img class="${c}" src="assets/run/relic/${r.id}.webp${AV}" alt="">`;
  if (RELIC_ART[r.id]) {
    if (!cache.has(r.id)) cache.set(r.id, draw(r.id));
    return `<img class="${c}" src="${cache.get(r.id)}" alt="">`;
  }
  return ico(r.icon, cls);
}
