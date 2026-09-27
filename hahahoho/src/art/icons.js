// UI 도트 아이콘 16×16. 화면의 버튼·액션 버튼에 이모지 대신 쓴다.
import { makeCanvas, pen, outline, cached, dataUrl } from './base.js';
import { toolIcon, itemIcon } from './items.js';

const TOOLS = { hoe: 'hoe', can: 'can', pick: 'pick', axe: 'axe', rod: 'rod', sword: 'sword' };

function draw(name, frame = 0) {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  switch (name) {
    case 'house':
      P.r(2, 7, 12, 8, '#f0dcb4'); P.r(2, 7, 12, 1, '#d8c090');
      for (let i = 0; i < 6; i++) P.r(1 + i, 7 - i, 14 - i * 2, 1, i % 2 ? '#c0504a' : '#d8604a');
      P.r(7, 10, 3, 5, '#9a6a3c'); P.r(3, 9, 3, 3, '#a8dcff'); P.r(11, 2, 2, 3, '#8a7a6a');
      break;
    case 'portal': {
      // 소용돌이치는 문 + 오른쪽으로 빠져나가는 화살표
      P.oval(7, 8, 6, 7, '#3a2a6a'); P.oval(7, 8, 5, 6, '#6a4ae0'); P.oval(7, 8, 3, 4, '#9ad8ff'); P.oval(7, 8, 1, 2, '#ffffff');
      const sp = [[3, 4], [11, 5], [12, 11], [4, 12]];
      const [sx, sy] = sp[frame % 4];
      P.p(sx, sy, '#ffffff');
      P.r(11, 7, 4, 2, '#ffd23c'); P.p(14, 6, '#ffd23c'); P.p(14, 9, '#ffd23c'); P.p(13, 5, '#ffd23c'); P.p(13, 10, '#ffd23c');
      break;
    }
    case 'chat':
      P.r(1, 2, 14, 9, '#ffffff'); P.r(3, 11, 3, 2, '#ffffff'); P.p(3, 13, '#ffffff');
      P.r(4, 6, 2, 2, '#8a6a48'); P.r(7, 6, 2, 2, '#8a6a48'); P.r(10, 6, 2, 2, '#8a6a48');
      break;
    case 'talk':
      P.r(1, 2, 14, 9, '#fff4c8'); P.r(10, 11, 3, 2, '#fff4c8'); P.p(12, 13, '#fff4c8');
      P.r(4, 5, 8, 1, '#8a6a48'); P.r(4, 8, 5, 1, '#8a6a48');
      break;
    case 'menu':
      for (const y of [3, 7, 11]) { P.r(2, y, 12, 2, '#6a4a2a'); P.r(2, y, 12, 1, '#9a6a3c'); }
      break;
    case 'bag':
      P.r(3, 5, 10, 10, '#c0703a'); P.r(3, 5, 10, 2, '#d8884a'); P.r(5, 2, 6, 3, '#8a4a22'); P.r(6, 3, 4, 1, '#f0dcb4');
      P.r(5, 9, 6, 4, '#a85a2a'); P.r(7, 10, 2, 1, '#ffd23c');
      break;
    case 'idle': {
      // 방치 창고: 달이 걸린 바구니
      P.r(2, 9, 12, 6, '#c89a5a'); P.r(2, 9, 12, 1, '#e0b87a');
      for (let x = 3; x < 14; x += 3) P.r(x, 10, 1, 5, '#a07a42');
      P.r(4, 6, 3, 3, '#ffd23c'); P.r(8, 7, 3, 2, '#9c5fc0'); P.r(10, 5, 2, 2, '#e04a3a');
      P.r(11, 1, 3, 3, '#fff4c0');
      break;
    }
    case 'hand':
      P.r(4, 6, 8, 8, '#f6d2b0'); for (const x of [4, 6, 8, 10]) P.r(x, 2 + (x === 4 ? 2 : 0), 2, 5, '#f6d2b0');
      P.r(12, 8, 2, 3, '#f6d2b0'); P.r(4, 13, 8, 1, '#e0b088');
      break;
    case 'heart':
      P.r(2, 4, 5, 5, '#ff5a78'); P.r(9, 4, 5, 5, '#ff5a78'); P.r(3, 3, 3, 1, '#ff5a78'); P.r(10, 3, 3, 1, '#ff5a78');
      for (let i = 0; i < 5; i++) P.r(2 + i, 9 + i, 12 - i * 2, 1, '#ff5a78');
      P.r(4, 5, 2, 2, '#ffc0cc');
      break;
    case 'lock':
      P.r(3, 7, 10, 8, '#f2c94c'); P.r(3, 7, 10, 1, '#fff0a0'); P.r(5, 3, 1, 4, '#8a8a94'); P.r(10, 3, 1, 4, '#8a8a94'); P.r(5, 2, 6, 1, '#8a8a94');
      P.r(7, 10, 2, 3, '#6a4a2a');
      break;
    case 'clock':
      P.oval(8, 8, 6, 6, '#fff4c8'); P.r(8, 4, 1, 5, '#6a4a2a'); P.r(8, 8, 3, 1, '#6a4a2a');
      break;
    case 'seed': return itemIcon('seed_turnip');
    case 'basket':
      P.r(2, 8, 12, 7, '#c89a5a'); P.r(2, 8, 12, 1, '#e0b87a'); for (let x = 3; x < 14; x += 3) P.r(x, 9, 1, 6, '#a07a42');
      P.r(3, 3, 1, 5, '#a07a42'); P.r(12, 3, 1, 5, '#a07a42'); P.r(3, 3, 10, 1, '#a07a42');
      P.r(5, 6, 3, 2, '#f08a2c'); P.r(8, 5, 3, 3, '#9c5fc0');
      break;
    case 'chair': return itemIcon('f_chair');
    case 'box': return drawBox();
    case 'bed':
      P.r(1, 7, 14, 6, '#e0605a'); P.r(1, 5, 5, 4, '#ffffff'); P.r(1, 13, 2, 2, '#8a5a32'); P.r(13, 13, 2, 2, '#8a5a32'); P.r(0, 4, 2, 11, '#8a5a32');
      P.r(9, 2, 2, 1, '#8ab8ff'); P.r(11, 1, 2, 1, '#8ab8ff'); P.r(12, 3, 2, 1, '#8ab8ff');
      break;
    case 'board':
      P.r(1, 2, 14, 10, '#c89060'); P.r(3, 4, 5, 5, '#fffbe8'); P.r(9, 4, 4, 6, '#fff0f0'); P.r(3, 12, 2, 4, '#7a5230'); P.r(11, 12, 2, 4, '#7a5230');
      break;
    case 'coin':
      P.oval(8, 8, 6, 6, '#f2c94c'); P.oval(8, 8, 4, 4, '#ffe38a'); P.r(7, 5, 2, 6, '#c89a2a');
      break;
    case 'craft':
      P.r(2, 10, 12, 3, '#b07a4a'); P.r(3, 13, 2, 3, '#7a5230'); P.r(11, 13, 2, 3, '#7a5230');
      P.r(9, 2, 5, 3, '#8a8a94'); P.r(10, 5, 2, 5, '#7a5230');
      break;
    case 'gift':
      P.r(2, 6, 12, 9, '#e0605a'); P.r(1, 5, 14, 3, '#f08a80'); P.r(7, 5, 2, 10, '#ffd23c'); P.r(4, 2, 3, 3, '#ffd23c'); P.r(9, 2, 3, 3, '#ffd23c');
      break;
    case 'sun':
      P.oval(8, 8, 4, 4, '#ffd23c'); for (const [x, y] of [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [12, 3], [3, 12], [12, 12]]) P.r(x, y, 1, 1, '#ffb13c');
      break;
    default: {
      if (TOOLS[name]) return toolIcon(name, 2);
      P.r(4, 4, 8, 8, '#ff00ff');
    }
  }
  return outline(c);
}

function drawBox() {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  P.r(1, 5, 14, 10, '#9a5a2e'); P.r(1, 5, 14, 4, '#b06a3a'); P.r(1, 9, 14, 1, '#6a4a2e'); P.r(7, 8, 2, 3, '#d8c07a');
  return outline(c);
}

// 달처럼 일부를 파내야 하는 아이콘은 지우기 합성으로
function moon() {
  const c = makeCanvas(16, 16);
  const x = c.getContext('2d');
  const P = pen(x);
  P.oval(8, 8, 6, 6, '#fff4c0');
  x.globalCompositeOperation = 'destination-out';
  P.oval(11, 6, 5, 5, '#000');
  x.globalCompositeOperation = 'source-over';
  return outline(c);
}

export const uiIcon = (name, frame = 0) => cached(`ui:${name}:${frame}`, () => (name === 'moon' ? moon() : draw(name, frame)));
export const uiIconUrl = (name, frame = 0) => dataUrl(`ui:${name}:${frame}`, uiIcon(name, frame));
export const iconImg = (name, cls = '') => `<img class="pix ${cls}" src="${uiIconUrl(name)}" alt="">`;
