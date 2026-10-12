"""영웅 피격 도트 스프라이트 시트 → assets/run/fx/<종류>.webp (32×32 도트 6프레임 가로, 4배 확대 → 768×128)

    python3 tools/make_hit_fx.py

claw: 할퀸 자국 세 줄 · bite: 위아래 이빨이 맞물림 · star: 타격 별
"""
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'run' / 'fx'
G, F, S = 32, 6, 4
K = (26, 16, 48, 255)
W = (255, 255, 255, 255)
R1 = (255, 90, 106, 255)
R2 = (232, 67, 90, 255)
R3 = (142, 34, 38, 255)
Y = (255, 226, 122, 255)


def frame():
    return Image.new('RGBA', (G, G))


def put(im, x, y, c):
    if 0 <= x < G and 0 <= y < G:
        im.putpixel((int(x), int(y)), c)


def line(im, x0, y0, x1, y1, c, w=1):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n):
        t = i / max(1, n - 1)
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for dx in range(w):
            put(im, round(x) + dx, round(y), c)


def outline(im):
    """칠한 칸 둘레에 외곽선"""
    px = im.load()
    filled = {(x, y) for x in range(G) for y in range(G) if px[x, y][3]}
    for x, y in filled:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in filled and 0 <= q[0] < G and 0 <= q[1] < G and not px[q][3]:
                px[q] = K
    return im


def claw():
    out = []
    for f in range(F):
        im = frame()
        grow = min(1, (f + 1) / 3)
        for k, off in enumerate((-6, 0, 6)):
            x0, y0 = 24 + off, 4
            x1, y1 = 6 + off, 28
            ex, ey = x0 + (x1 - x0) * grow, y0 + (y1 - y0) * grow
            if f < 4:
                line(im, x0, y0, ex, ey, R2 if f >= 3 else R1, 3)
                line(im, x0 + 1, y0, ex + 1, ey, W if f < 3 else R1, 1)
            elif f == 4:
                line(im, x0, y0, x1, y1, R3, 2)
            else:
                for i in range(0, 24, 4):
                    put(im, x0 + (x1 - x0) * i / 24, y0 + (y1 - y0) * i / 24, R3)
        out.append(outline(im) if f < 5 else im)
    return out


def bite():
    out = []
    gaps = [12, 8, 3, 0, 0, 0]
    for f in range(F):
        im = frame()
        g = gaps[f]
        if f < 4:
            for side in (-1, 1):
                cy = 16 + side * (g + 2)
                for x in range(4, 28):
                    arc = int(3 * math.cos((x - 16) / 12 * math.pi / 2))
                    put(im, x, cy - side * arc, R3)
                for tx in range(6, 27, 5):   # 이빨
                    arc = int(3 * math.cos((tx - 16) / 12 * math.pi / 2))
                    by = cy - side * arc
                    for d in range(4):
                        put(im, tx, by - side * d, W)
                        if d < 2:
                            put(im, tx + 1, by - side * d, W)
            im = outline(im)
        else:
            r = (f - 3) * 5
            for a in range(0, 360, 30):   # 피 튀김
                put(im, 16 + r * math.cos(math.radians(a)), 16 + r * math.sin(math.radians(a)), R1 if f == 4 else R3)
                put(im, 16 + (r - 2) * math.cos(math.radians(a + 15)), 16 + (r - 2) * math.sin(math.radians(a + 15)), R2)
        out.append(im)
    return out


def star():
    out = []
    for f in range(F):
        im = frame()
        rad = [5, 9, 13, 14, 15, 15][f]
        inner = [2, 3, 5, 5, 4, 0][f]
        col = [W, W, Y, R1, R2, R3][f]
        for a in range(8):
            ang = a * math.pi / 4 + (math.pi / 8 if a % 2 else 0)
            rr = rad if a % 2 == 0 else rad * .6
            line(im, 16, 16, 16 + rr * math.cos(ang), 16 + rr * math.sin(ang), col, 2)
        for y in range(G):
            for x in range(G):
                if (x - 16) ** 2 + (y - 16) ** 2 <= inner ** 2:
                    put(im, x, y, W if f < 3 else Y)
        out.append(outline(im) if f < 5 else im)
    return out


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (('claw', claw), ('bite', bite), ('star', star)):
        frames = fn()
        sheet = Image.new('RGBA', (G * F, G))
        for i, fr in enumerate(frames):
            sheet.alpha_composite(fr, (i * G, 0))
        sheet.resize((G * F * S, G * S), Image.NEAREST).save(OUT / f'{name}.webp', lossless=True, method=6)
        print(name)
