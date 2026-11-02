// 도트 그림 도우미. 모든 그림은 코드로 그린다(이미지 파일 0개).

export const OUTLINE = '#2b1e1c';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 칠하기 도구 묶음
export function pen(ctx) {
  return {
    ctx,
    r(x, y, w, h, c) { if (!c) return; ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); },
    p(x, y, c) { if (!c) return; ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); },
    // 채운 타원 (도트 느낌을 살리려고 픽셀 단위로)
    oval(cx, cy, rx, ry, c) {
      ctx.fillStyle = c;
      for (let y = -ry; y <= ry; y++) {
        const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01))));
        ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
      }
    },
    line(x0, y0, x1, y1, c) {
      ctx.fillStyle = c;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
    },
  };
}

// 불투명 픽셀 둘레에 1px 외곽선을 그린다 (도트 그림 특유의 또렷함)
export function outline(c, color = OUTLINE) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const [r, g, b] = hexRgb(color);
  const a = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? d[(y * w + x) * 4 + 3] : 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 0) { o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = d[i + 3]; continue; }
      if (a(x - 1, y) > 100 || a(x + 1, y) > 100 || a(x, y - 1) > 100 || a(x, y + 1) > 100) {
        o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

export function hexRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
const toHex = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
// amt > 0 밝게, < 0 어둡게 (-1 ~ 1)
export function shade(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  const f = v => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `#${toHex(f(r))}${toHex(f(g))}${toHex(f(b))}`;
}
export function mix(a, b, t) {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return `#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(b1 + (b2 - b1) * t)}`;
}

export function flipX(c) {
  const f = makeCanvas(c.width, c.height);
  const x = f.getContext('2d');
  x.translate(c.width, 0);
  x.scale(-1, 1);
  x.drawImage(c, 0, 0);
  return f;
}

// 키별로 한 번만 그리는 캐시
const cache = new Map();
export function cached(key, draw) {
  let v = cache.get(key);
  if (!v) { v = draw(); cache.set(key, v); }
  return v;
}

// 캔버스 → <img> 용 dataURL (UI 아이콘)
const urlCache = new Map();
export function dataUrl(key, c) {
  let u = urlCache.get(key);
  if (!u) { u = c.toDataURL(); urlCache.set(key, u); }
  return u;
}
