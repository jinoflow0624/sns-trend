// A* 길찾기 (터치로 이동할 때). 8방향, 모서리 끼기 금지, 결과는 직선 구간으로 다듬는다.

// 막힌 칸 판정 (ignore: 무시할 물건 — 예: 깰 수 있는 바위)
function blockedFn(m, ignore) {
  if (!ignore) return (x, y) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.solid[y * m.w + x] === 1;
  const free = new Set();
  for (const o of m.objects) if (ignore(o)) for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) free.add(j * m.w + i);
  return (x, y) => x < 0 || y < 0 || x >= m.w || y >= m.h || (m.solid[y * m.w + x] === 1 && !free.has(y * m.w + x));
}

class Heap {
  constructor() { this.a = []; }
  push(v, p) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1; const r = l + 1; let s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]]; i = s;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

// (sx,sy) → (tx,ty) 칸 중심 좌표 목록. adjacent: 목표 칸 옆까지만 (목표가 막혀 있어도 됨)
export function findPath(m, sx, sy, tx, ty, { adjacent = false, maxNodes = 4000, ignore = null } = {}) {
  const blocked = blockedFn(m, ignore);
  const x0 = Math.floor(sx); const y0 = Math.floor(sy);
  const x1 = Math.floor(tx); const y1 = Math.floor(ty);
  const W = m.w;
  const goal = (x, y) => (adjacent
    ? Math.abs(x - x1) + Math.abs(y - y1) === 1 || (x === x1 && y === y1 && !blocked(x, y))
    : x === x1 && y === y1);
  if (!adjacent && blocked(x1, y1)) return null;
  if (goal(x0, y0)) return [];
  const h = (x, y) => Math.hypot(x - x1, y - y1);
  const g = new Map([[y0 * W + x0, 0]]);
  const from = new Map();
  const open = new Heap();
  open.push(y0 * W + x0, h(x0, y0));
  let n = 0;
  while (open.size && n++ < maxNodes) {
    const cur = open.pop();
    const cx = cur % W; const cy = (cur - cx) / W;
    if (goal(cx, cy)) {
      const cells = [];
      let k = cur;
      while (k !== undefined && k !== y0 * W + x0) { cells.push(k); k = from.get(k); }
      cells.reverse();
      return smooth(m, blocked, sx, sy, cells.map(c => ({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 })));
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx; const ny = cy + dy;
      if (blocked(nx, ny)) continue;
      if (dx && dy && (blocked(cx + dx, cy) || blocked(cx, cy + dy))) continue; // 모서리 끼기 금지
      const ng = g.get(cur) + (dx && dy ? 1.414 : 1);
      const key = ny * W + nx;
      if (ng < (g.get(key) ?? Infinity)) {
        g.set(key, ng);
        from.set(key, cur);
        open.push(key, ng + h(nx, ny));
      }
    }
  }
  return null;
}

// 직선으로 갈 수 있는 중간 점은 건너뛴다 (지그재그 없이 부드럽게)
function clearLine(blocked, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d / 0.2);
  for (let i = 1; i <= steps; i++) {
    const x = ax + (bx - ax) * i / steps; const y = ay + (by - ay) * i / steps;
    for (const [ox, oy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      if (blocked(Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
  }
  return true;
}
function smooth(m, blocked, sx, sy, pts) {
  if (pts.length < 3) return pts;
  const out = [];
  let ax = sx; let ay = sy; let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearLine(blocked, ax, ay, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    ax = pts[j].x; ay = pts[j].y;
    i = j + 1;
  }
  return out;
}
