// 아이템 아이콘 16×16. data.js 의 sprite { kind, c, c2 } 로 그린다.
import { makeCanvas, pen, outline, shade, cached, dataUrl } from './base.js';
import { ITEMS, TOOL_TIER_COLOR } from '../data.js';

function draw(kind, c, c2) {
  const cv = makeCanvas(16, 16);
  const P = pen(cv.getContext('2d'));
  const d = shade(c, -0.28);
  const l = shade(c, 0.35);
  const leaf = '#4cb24a';
  switch (kind) {
    case 'seed':
      P.r(4, 5, 8, 9, '#d8b27a'); P.r(4, 5, 8, 1, '#b08a52'); P.r(5, 3, 6, 2, '#c09a62');
      P.r(6, 8, 4, 4, c); P.p(7, 9, l); P.r(4, 13, 8, 1, '#b08a52');
      break;
    case 'turnip':
      P.oval(8, 10, 4, 4, c); P.r(5, 11, 7, 2, c2 || '#9c5fc0'); P.p(8, 15, d);
      P.r(6, 2, 1, 5, leaf); P.r(9, 2, 1, 5, leaf); P.r(7, 3, 2, 4, '#6fbf4a');
      P.p(6, 8, l);
      break;
    case 'potato':
      P.oval(8, 9, 5, 4, c); P.p(6, 8, d); P.p(10, 10, d); P.p(8, 11, d); P.r(5, 7, 2, 1, l);
      break;
    case 'carrot':
      for (let i = 0; i < 8; i++) P.r(5 + Math.floor(i / 3), 6 + i, 5 - Math.floor(i / 1.8), 1, c);
      P.p(6, 8, d); P.p(8, 11, d);
      P.r(6, 2, 1, 4, leaf); P.r(8, 1, 1, 5, leaf); P.r(10, 3, 1, 3, leaf);
      break;
    case 'wheat':
      P.line(8, 15, 8, 4, '#b8962e');
      for (let y = 2; y < 9; y += 2) { P.r(6, y, 2, 2, c); P.r(9, y + 1, 2, 2, c); }
      P.r(7, 1, 2, 2, l);
      break;
    case 'round': {
      const big = c2 === '#5f8c2a';
      if (big) { P.oval(8, 10, 6, 4, c); P.line(5, 7, 5, 13, d); P.line(8, 6, 8, 14, d); P.line(11, 7, 11, 13, d); P.r(7, 3, 2, 3, '#6a5a2a'); }
      else { P.oval(8, 9, 5, 5, c); P.r(5, 6, 2, 2, l); P.r(6, 3, 4, 2, c2); P.p(8, 2, c2); }
      break;
    }
    case 'cotton':
      P.oval(8, 8, 5, 4, c); P.oval(5, 10, 3, 3, c); P.oval(11, 10, 3, 3, c);
      P.r(6, 13, 4, 2, '#8a6a3a'); P.p(7, 7, '#e0e0e0'); P.p(10, 9, '#e0e0e0');
      break;
    case 'berry':
      for (const [x, y] of [[6, 8], [10, 8], [8, 11], [8, 6]]) { P.oval(x, y, 2, 2, c); P.p(x - 1, y - 1, l); }
      P.r(7, 2, 2, 3, leaf); P.r(9, 3, 2, 1, leaf);
      break;
    case 'log':
      P.r(2, 6, 11, 6, c); P.r(2, 6, 11, 1, l); P.r(2, 11, 11, 1, d);
      P.oval(13, 9, 2, 3, '#e8c88a'); P.p(13, 9, '#b08a52');
      break;
    case 'rock':
      P.oval(8, 10, 6, 4, c); P.r(4, 7, 5, 2, l); P.p(10, 12, d); P.p(6, 11, d);
      break;
    case 'mushroom':
      P.r(6, 9, 4, 6, '#f4ecd8'); P.oval(8, 7, 6, 4, c); P.r(3, 8, 11, 1, d);
      P.r(5, 5, 2, 2, '#ffffff'); P.r(10, 6, 2, 1, '#ffffff');
      break;
    case 'flower':
      P.line(8, 15, 8, 8, leaf); P.r(9, 11, 2, 1, leaf);
      for (const [x, y] of [[8, 3], [5, 6], [11, 6], [6, 9], [10, 9]]) P.r(x - 1, y - 1, 3, 3, c);
      P.r(7, 5, 3, 3, '#ff9a3c');
      break;
    case 'leaf':
      P.oval(8, 8, 4, 6, c); P.line(8, 3, 8, 14, d); P.p(6, 7, l);
      break;
    case 'ore':
      P.oval(8, 9, 6, 5, '#8a8a8e'); P.r(4, 6, 4, 2, '#a8a8ae');
      for (const [x, y] of [[6, 9], [10, 7], [9, 11], [5, 12]]) P.r(x, y, 2, 2, c);
      P.p(10, 7, l);
      break;
    case 'gem':
      P.r(5, 4, 6, 2, l); P.r(3, 6, 10, 3, c); P.r(4, 9, 8, 2, d); P.r(6, 11, 4, 2, d); P.p(7, 13, d);
      P.p(5, 6, '#ffffff'); P.p(6, 5, '#ffffff');
      break;
    case 'fish':
      P.oval(7, 8, 5, 3, c); P.r(12, 6, 3, 5, d); P.r(13, 5, 2, 1, d); P.r(13, 11, 2, 1, d);
      P.r(4, 7, 1, 1, '#2b1e1c'); P.r(5, 10, 6, 1, l); P.r(7, 5, 3, 1, d);
      break;
    case 'boot':
      P.r(5, 2, 5, 10, c); P.r(5, 10, 9, 4, c); P.r(5, 2, 5, 1, l); P.r(5, 13, 9, 1, d);
      break;
    case 'bait':
      P.line(4, 11, 7, 7, c); P.line(7, 7, 10, 10, c); P.line(10, 10, 12, 6, c); P.p(12, 6, d);
      break;
    case 'gel':
      P.oval(8, 10, 5, 4, c); P.r(5, 8, 2, 2, l); P.p(8, 5, c);
      break;
    case 'fur':
      P.oval(8, 9, 6, 4, c); for (let x = 3; x < 14; x += 2) P.p(x, 5 + (x % 3), c); P.p(6, 9, d); P.p(10, 10, d);
      break;
    case 'meat':
      P.oval(7, 8, 5, 4, c); P.r(4, 6, 3, 2, l); P.r(11, 10, 3, 2, '#f4ecd8'); P.r(13, 9, 2, 4, '#f4ecd8');
      break;
    case 'wing':
      P.line(2, 5, 8, 11, c); P.line(2, 6, 14, 6, c); P.r(3, 7, 10, 2, c); P.r(4, 9, 6, 1, c); P.p(8, 11, d);
      break;
    case 'bone':
      P.r(4, 7, 8, 2, c); P.r(2, 5, 3, 3, c); P.r(2, 8, 3, 3, c); P.r(11, 5, 3, 3, c); P.r(11, 8, 3, 3, c);
      break;
    case 'cloth':
      P.r(2, 6, 12, 7, c); P.r(2, 6, 12, 1, l); P.r(2, 9, 12, 1, shade(c, -0.1)); P.r(2, 12, 12, 1, d);
      P.r(3, 4, 10, 2, shade(c, -0.05));
      break;
    case 'yarn':
      P.oval(8, 8, 5, 5, c); P.line(4, 6, 11, 11, d); P.line(5, 11, 12, 6, d); P.line(12, 12, 15, 14, d);
      break;
    case 'sack':
      P.r(4, 6, 8, 8, c); P.r(5, 4, 6, 2, c); P.r(6, 3, 4, 1, d); P.r(4, 13, 8, 1, d); P.r(6, 8, 4, 3, '#e8c65a');
      break;
    case 'dye':
      P.r(6, 2, 4, 3, '#c0b0a0'); P.r(4, 5, 8, 9, '#e8f4ff'); P.r(5, 8, 6, 5, c); P.r(5, 6, 1, 3, '#ffffff');
      break;
    case 'bread':
      P.oval(8, 9, 6, 4, c); P.r(3, 11, 11, 2, d); P.line(5, 7, 6, 9, d); P.line(8, 6, 9, 8, d); P.line(11, 7, 12, 9, d);
      break;
    case 'jar':
      P.r(5, 3, 6, 2, '#b08a52'); P.r(4, 5, 8, 9, '#e8f4ff'); P.r(5, 7, 6, 6, c); P.p(5, 6, '#ffffff');
      break;
    case 'dish':
      P.oval(8, 11, 7, 3, '#f4f4f4'); P.oval(8, 11, 5, 2, '#dcdce4');
      P.oval(8, 9, 4, 3, c); P.r(6, 7, 2, 1, l);
      break;
    case 'bowl':
      P.r(3, 8, 10, 4, '#e8e8f0'); P.r(4, 12, 8, 2, '#c8c8d0'); P.r(3, 8, 10, 2, c); P.p(6, 8, l);
      P.p(6, 5, '#ffffff'); P.p(9, 4, '#ffffff'); P.p(8, 6, '#ffffff');
      break;
    case 'pie':
      P.oval(8, 10, 7, 4, '#d8a45a'); P.oval(8, 9, 6, 3, c); P.line(4, 9, 12, 9, '#d8a45a'); P.line(8, 6, 8, 12, '#d8a45a');
      break;
    case 'hat':
      P.r(2, 11, 12, 2, d); P.r(4, 5, 8, 6, c); P.r(4, 5, 8, 1, l); P.r(4, 9, 8, 1, '#c0504a');
      break;
    case 'shirt':
      P.r(4, 4, 8, 10, c); P.r(1, 4, 3, 5, c); P.r(12, 4, 3, 5, c); P.r(6, 4, 4, 2, d); P.r(4, 13, 8, 1, d); P.r(1, 8, 3, 1, d); P.r(12, 8, 3, 1, d);
      break;
    // 가구 아이콘
    case 'f_chair': P.r(4, 2, 8, 6, c); P.r(4, 8, 8, 2, l); P.r(4, 10, 2, 5, d); P.r(10, 10, 2, 5, d); break;
    case 'f_table': P.r(1, 5, 14, 3, l); P.r(1, 8, 14, 1, d); P.r(2, 9, 2, 6, d); P.r(12, 9, 2, 6, d); break;
    case 'f_plant': P.r(5, 10, 6, 5, '#c0604a'); P.oval(8, 6, 5, 4, c); P.p(6, 4, l); break;
    case 'f_rug': P.r(1, 4, 14, 9, c); P.r(3, 6, 10, 5, shade(c, 0.3)); P.r(6, 7, 4, 3, '#ffd23c'); break;
    case 'f_lamp': P.r(4, 2, 8, 5, c); P.r(7, 7, 2, 7, '#8a6a4a'); P.r(5, 14, 6, 1, '#6a4a3a'); break;
    case 'f_shelf': P.r(2, 1, 12, 14, c); for (let y = 4; y < 14; y += 4) { P.r(3, y - 2, 10, 2, '#e05a4a'); P.r(5, y - 2, 2, 2, '#4a8ae0'); P.r(3, y, 10, 1, d); } break;
    case 'f_sofa': P.r(1, 6, 14, 7, c); P.r(1, 4, 14, 3, d); P.r(3, 8, 10, 3, l); break;
    case 'f_tank': P.r(2, 3, 12, 11, c); P.r(2, 3, 12, 1, '#ffffff'); P.r(5, 7, 3, 2, '#ff8a3c'); P.r(9, 10, 2, 1, '#ffd23c'); P.r(2, 12, 12, 2, '#d8c89a'); break;
    case 'f_bear': P.oval(8, 10, 4, 4, c); P.oval(8, 5, 3, 3, c); P.p(5, 2, c); P.p(11, 2, c); P.p(7, 5, '#2b1e1c'); P.p(9, 5, '#2b1e1c'); P.r(6, 10, 4, 2, l); break;
    case 'f_clock': P.r(5, 1, 6, 14, c); P.oval(8, 5, 2, 2, '#fffbe0'); P.p(8, 4, '#2b1e1c'); P.r(7, 9, 2, 4, '#ffd23c'); break;
    case 'f_fireplace': P.r(1, 3, 14, 12, c); P.r(4, 7, 8, 8, '#2b1e1c'); P.r(5, 10, 6, 5, '#ff8a3c'); P.r(6, 12, 4, 3, '#ffd23c'); P.r(0, 2, 16, 2, d); break;
    case 'f_piano': P.r(1, 3, 14, 9, c); P.r(2, 9, 12, 2, '#ffffff'); for (let x = 3; x < 14; x += 2) P.p(x, 9, '#2b1e1c'); P.r(2, 12, 2, 3, c); P.r(12, 12, 2, 3, c); break;
    default:
      P.r(4, 4, 8, 8, c);
  }
  return outline(cv);
}

// 도구 아이콘 (단계 색)
function drawTool(tool, tier) {
  const cv = makeCanvas(16, 16);
  const P = pen(cv.getContext('2d'));
  const m = TOOL_TIER_COLOR[tier] || '#a57a4a';
  const md = shade(m, -0.3);
  const wood = '#8a5a32';
  switch (tool) {
    case 'hoe': P.line(3, 14, 11, 4, wood); P.r(9, 2, 5, 2, m); P.r(12, 4, 2, 2, md); break;
    case 'can': P.r(3, 7, 8, 6, m); P.r(3, 7, 8, 1, shade(m, 0.3)); P.line(11, 9, 14, 6, md); P.r(5, 4, 4, 1, md); P.r(4, 5, 1, 2, md); P.r(9, 5, 1, 2, md); P.p(14, 5, '#6ac6f0'); break;
    case 'pick': P.line(4, 14, 10, 5, wood); P.line(4, 4, 8, 3, m); P.line(8, 3, 12, 4, m); P.line(12, 4, 14, 7, m); P.p(4, 5, md); break;
    case 'axe': P.line(4, 14, 10, 3, wood); P.r(9, 2, 4, 5, m); P.r(12, 3, 2, 3, shade(m, 0.3)); P.p(9, 6, md); break;
    case 'rod': P.line(2, 14, 13, 2, wood); P.line(13, 2, 14, 10, '#e8e8e8'); P.r(13, 10, 2, 2, '#e04a3a'); P.r(3, 11, 3, 2, m); break;
    case 'sword': P.line(4, 12, 12, 4, m); P.line(5, 12, 13, 4, shade(m, 0.3)); P.line(3, 10, 6, 13, md); P.r(2, 13, 2, 2, wood); break;
  }
  return outline(cv);
}

export const itemIcon = id => cached(`it:${id}`, () => {
  const it = ITEMS[id];
  if (!it) return draw('x', '#ff00ff');
  if (it.type === 'seed' && ITEMS[it.crop]) {
    // 씨앗 봉투: 봉투 위에 어떤 작물인지 작게 그려 준다
    const cv = makeCanvas(16, 16);
    const P = pen(cv.getContext('2d'));
    P.r(3, 4, 10, 11, '#d8b27a'); P.r(3, 4, 10, 1, '#b08a52'); P.r(4, 2, 8, 2, '#c09a62'); P.r(3, 14, 10, 1, '#b08a52');
    P.r(4, 6, 8, 7, '#f4ead4');
    const crop = draw(ITEMS[it.crop].sprite.kind, ITEMS[it.crop].sprite.c, ITEMS[it.crop].sprite.c2);
    cv.getContext('2d').drawImage(crop, 0, 0, 16, 16, 4, 5, 8, 8);
    return outline(cv);
  }
  return draw(it.sprite.kind, it.sprite.c, it.sprite.c2);
});
export const toolIcon = (tool, tier) => cached(`tool:${tool}:${tier}`, () => drawTool(tool, tier));
export const itemUrl = id => dataUrl(`it:${id}`, itemIcon(id));
export const toolUrl = (tool, tier) => dataUrl(`tool:${tool}:${tier}`, toolIcon(tool, tier));
