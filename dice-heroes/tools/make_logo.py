"""타이틀 로고 KYBORIA — 도트로 직접 그린 글자 (AI 글꼴 대신).

  python3 tools/make_logo.py            # assets/logo/logo.webp (1배 크기 · 화면에서 정수배로 키운다)
  python3 tools/make_logo.py preview    # 미리 보기 PNG (보라 바탕에 3배)

생각: 요트 주사위 RPG
- 글자는 주사위처럼 모서리를 깎은 굵은 블록. 앞면은 금빛(위는 흰빛), 옆면은 보라 (주사위 옆면처럼 아래 · 오른쪽으로 두께)
- O 는 흰 주사위 — 눈 5개(요트 = 다섯 개가 같은 눈), 가운데 눈은 금빛. 그 위에 왕관
- 색은 게임의 보라 · 노랑 · 흰색만 쓴다
"""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'logo', 'logo.webp')

G = {
'K': """
###....###
###...###.
###..###..
###.###...
######....
#####.....
####......
#####.....
######....
###.###...
###..###..
###...###.
###....###""",
'Y': """
###.....###
###.....###
.###...###.
.###...###.
..###.###..
...#####...
....###....
....###....
....###....
....###....
....###....
....###....
....###....""",
'B': """
########..
#########.
###...####
###....###
###...###.
########..
#########.
###....###
###....###
###....###
###...####
#########.
########..""",
'R': """
########..
#########.
###...####
###....###
###....###
###...####
#########.
########..
###.###...
###..###..
###..####.
###...####
###....###""",
'I': """
#######
#######
..###..
..###..
..###..
..###..
..###..
..###..
..###..
..###..
..###..
#######
#######""",
'A': """
....###....
...#####...
...#####...
..###.###..
..###.###..
.###...###.
.###...###.
.#########.
###########
###.....###
###.....###
###.....###
###.....###""",
}
SWORD = """
...W...
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
..WWS..
GGGGGGG
..PPP..
..GGG.."""
CROWN = """
#...#...#
##.###.##
#########
#########"""

INK = (26, 12, 58)          # 외곽선 (게임 --ink 쪽 어두운 남보라)
SIDE = [(92, 52, 196), (70, 36, 160), (52, 24, 124)]   # 옆면 보라 (위 → 아래)
FACE = [(255, 244, 190), (255, 236, 150), (255, 216, 92), (255, 196, 58), (246, 164, 40), (226, 134, 28)]
HI = (255, 255, 255)
DIE = (246, 242, 255); DIE_SH = (206, 194, 246); PIP = (60, 30, 140)
GOLD_PIP = (255, 204, 60)
CROWN_C = [(255, 244, 190), (255, 214, 80), (232, 150, 30)]
GEM = (255, 70, 120)

def bm(s):
    rows = [r for r in s.strip('\n').split('\n')]
    w = max(len(r) for r in rows)
    return np.array([[c == '#' for c in r.ljust(w, '.')] for r in rows])

H = 13; GAP = 2; DEPTH = 3; PAD = 3
DIE_N = 17   # 주사위 한 변 (글자보다 조금 크다)

def dil(m):
    o = m.copy(); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    o[1:, 1:] |= m[:-1, :-1]; o[1:, :-1] |= m[:-1, 1:]; o[:-1, 1:] |= m[1:, :-1]; o[:-1, :-1] |= m[1:, 1:]
    return o

def build():
    word = 'KYBORIA'
    sw = [r for r in SWORD.strip('\n').split('\n')]
    widths = [DIE_N if c == 'O' else len(sw[0]) if c == 'I' else bm(G[c]).shape[1] for c in word]
    W = sum(widths) + GAP * (len(word) - 1) + PAD * 2 + DEPTH
    TOP = PAD + 7            # 왕관 자리
    Hh = TOP + DIE_N + DEPTH + PAD + 4
    face = np.zeros((Hh, W), bool); die = np.zeros((Hh, W), bool); crown = np.zeros((Hh, W), bool)
    col = np.zeros((Hh, W, 3), np.uint8)
    base = TOP + (DIE_N - H)   # 글자 바닥을 주사위 바닥에 맞춘다
    x = PAD; dpos = None; spos = None
    sword = np.zeros((Hh, W), bool)
    for c, w in zip(word, widths):
        if c == 'O':
            y0 = TOP; m = np.ones((DIE_N, DIE_N), bool)
            for (yy, xx) in [(0, 0), (0, -1), (-1, 0), (-1, -1)]: m[yy, xx] = False   # 둥근 모서리
            die[y0:y0 + DIE_N, x:x + DIE_N] |= m; dpos = (y0, x)
        elif c == 'I':
            sy = base + H + 2 - len(sw)   # 칼끝은 글자보다 위로, 손잡이 끝은 바닥 아래로 살짝
            for r, row in enumerate(sw):
                for q, ch in enumerate(row):
                    if ch != '.': sword[sy + r, x + q] = True
            spos = (sy, x)
        else:
            m = bm(G[c]); face[base:base + H, x:x + w] |= m
        x += w + GAP
    body = face | die | sword
    # 옆면(두께): 아래 · 오른쪽 아래로 DEPTH 칸
    side = np.zeros_like(body)
    for d in range(1, DEPTH + 1):
        side[d:, d // 2 + (1 if d == DEPTH else 0):] |= (face | die)[:-d, :W - (d // 2 + (1 if d == DEPTH else 0))]   # 칼은 두께 없이
    side &= ~body
    # 왕관: 주사위 위 가운데
    cm = bm(CROWN); cy = dpos[0] - cm.shape[0] - 1; cx = dpos[1] + (DIE_N - cm.shape[1]) // 2
    crown[cy:cy + cm.shape[0], cx:cx + cm.shape[1]] = cm
    allm = body | side | crown
    outline = dil(allm) & ~allm
    rgba = np.zeros((Hh, W, 4), np.uint8)
    def put(mask, c): rgba[mask, :3] = c; rgba[mask, 3] = 255
    put(outline, INK)
    # 옆면: 깊이에 따라 어둡게
    ys = np.arange(Hh)[:, None] * np.ones((1, W), int)
    for k, c in enumerate(SIDE):
        put(side & (ys >= base + k * 5) & (ys < base + (k + 1) * 5) | (side & (k == 2) & (ys >= base + 10)) | (side & (k == 0) & (ys < base)), c)
    # 앞면 금빛 그라데이션 (글자 높이 13 → 6단)
    for r in range(H):
        k = min(len(FACE) - 1, r * len(FACE) // H)
        put(face & (ys == base + r), FACE[k])
    # 앞면 윗가장자리 · 왼쪽 가장자리 흰 빛 (도톰한 느낌)
    up = face & ~np.vstack([np.zeros((1, W), bool), face[:-1]])
    lf = face & ~np.hstack([np.zeros((Hh, 1), bool), face[:, :-1]])
    put(up & (ys < base + 6), HI); put(lf & (ys < base + 4), HI)
    # 아랫가장자리 짙은 금
    dn = face & ~np.vstack([face[1:], np.zeros((1, W), bool)])
    put(dn, (196, 104, 20))
    # 주사위
    put(die, DIE)
    y0, x0 = dpos
    sh = die & ((ys >= y0 + DIE_N - 3) | (np.arange(W)[None, :] >= x0 + DIE_N - 2))
    put(sh, DIE_SH)
    put(die & (ys == y0) & (np.arange(W)[None, :] < x0 + DIE_N - 3), HI)
    for (py, px), c in [((3, 3), PIP), ((3, 11), PIP), ((11, 3), PIP), ((11, 11), PIP), ((7, 7), GOLD_PIP)]:
        m = np.zeros_like(die); m[y0 + py:y0 + py + 3, x0 + px:x0 + px + 3] = True
        put(m, c)
        if c == GOLD_PIP: rgba[y0 + py, x0 + px, :3] = (255, 250, 220); rgba[y0 + py + 2, x0 + px + 2, :3] = (226, 134, 28)
        else: rgba[y0 + py, x0 + px + 1, :3] = (34, 14, 90)
    sy, sx = spos
    SC = {'W': (248, 246, 255), 'S': (168, 152, 230), 'G': None, 'P': (92, 52, 196)}
    for r, row in enumerate(sw):
        for q, ch in enumerate(row):
            if ch == '.': continue
            c = SC[ch] or FACE[2 if r < len(sw) - 1 else 4]
            rgba[sy + r, sx + q, :3] = c; rgba[sy + r, sx + q, 3] = 255
    rgba[sy + 14, sx + 3, :3] = (255, 60, 110)   # 칼밑 보석
    for r in range(1, 14): rgba[sy + r, sx + 2, :3] = (255, 255, 255)   # 칼날 왼쪽 빛
    # 주사위 오른쪽 위 반짝 (네 갈래 별)
    for dy, dx in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1), (-2, 0), (2, 0), (0, -2), (0, 2)):
        yy, xx = y0 + 1 + dy, x0 + DIE_N - 2 + dx
        if 0 <= yy < Hh and 0 <= xx < W and (abs(dy) + abs(dx) <= 1 or rgba[yy, xx, 3] == 0 or die[yy, xx]):
            rgba[yy, xx, :3] = (255, 255, 255) if abs(dy) + abs(dx) <= 1 else (255, 236, 150); rgba[yy, xx, 3] = 255
    # 왕관 색 (위 → 아래)
    for r in range(cm.shape[0]):
        put(crown & (ys == cy + r), CROWN_C[min(2, r * 3 // cm.shape[0])])
    put(np.isin(np.arange(Hh)[:, None] * 1000 + np.arange(W)[None, :], [(cy + 2) * 1000 + cx + 4]), GEM)
    # 빈 줄 · 칸 잘라내기
    a = rgba[:, :, 3] > 0; yy, xx = np.nonzero(a)
    return rgba[yy.min():yy.max() + 1, xx.min():xx.max() + 1]

if __name__ == '__main__':
    img = build()
    if len(sys.argv) > 1 and sys.argv[1] == 'preview':
        out = sys.argv[2] if len(sys.argv) > 2 else 'logo_preview.png'
        h, w = img.shape[:2]; S = 4
        bg = np.zeros((h + 20, w + 20, 3), np.uint8); bg[:] = (36, 22, 90)
        a = img[:, :, 3:] / 255
        bg[10:10 + h, 10:10 + w] = (img[:, :, :3] * a + bg[10:10 + h, 10:10 + w] * (1 - a)).astype(np.uint8)
        Image.fromarray(bg).resize(((w + 20) * S, (h + 20) * S), Image.NEAREST).save(out)
        print(out, w, h)
    else:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        Image.fromarray(img, 'RGBA').save(OUT, lossless=True)
        print(OUT, img.shape[1], img.shape[0])
