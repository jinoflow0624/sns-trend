"""앱 아이콘 — 요트 히어로즈.

  python3 tools/make_icons.py sheet <폰트.ttf> <출력.png>   # 후보 모아 보기
  python3 tools/make_icons.py build <후보번호>              # icons/ 에 192 · 512 · maskable-512 쓰기

후보마다 배경(bg)과 앞그림(fg)을 따로 그린다. maskable 은 안드로이드가 원·둥근 사각으로 잘라 내므로
배경은 꽉 채우고 앞그림만 안전 영역(가운데 80%) 안으로 줄인다.
배경·주사위는 64칸 도트로 그려 8배로 키우고(512), 영웅은 assets/heroes 그림을 그대로 얹는다.
"""
import sys, os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
G = 64           # 도트 격자
S = 512          # 출력
K = S // G

INK = (26, 16, 48, 255)
FONT = None

def grid():
    return Image.new('RGBA', (G, G), (0, 0, 0, 0))
def up(im):
    return im.resize((S, S), Image.NEAREST)
def hero(name, h):
    im = Image.open(os.path.join(ROOT, 'assets', 'heroes', name + '.webp')).convert('RGBA')
    bb = im.getbbox(); im = im.crop(bb)
    w = round(im.width * h / im.height)
    return im.resize((w, h), Image.LANCZOS)

PIPS = {1: [(1, 1)], 2: [(0, 0), (2, 2)], 3: [(0, 0), (1, 1), (2, 2)], 4: [(0, 0), (2, 0), (0, 2), (2, 2)],
        5: [(0, 0), (2, 0), (1, 1), (0, 2), (2, 2)], 6: [(0, 0), (2, 0), (0, 1), (2, 1), (0, 2), (2, 2)]}

def die(d, x, y, s, v, face=(255, 248, 236), side=(214, 200, 232), pip=(232, 67, 90), depth=None, pipc=None):
    """도트 주사위: 앞면 s×s + 아래·오른쪽 두께(입체), 검은 외곽선. 칸 좌표"""
    dp = depth if depth is not None else max(1, s // 7)
    d.rectangle([x - 1, y - 1, x + s + dp, y + s + dp], fill=INK)
    d.rectangle([x + dp, y + dp, x + s + dp - 1, y + s + dp - 1], fill=side)      # 두께
    d.rectangle([x, y, x + s - 1, y + s - 1], fill=face)                          # 앞면
    d.line([x, y, x + s - 1, y], fill=(255, 255, 255)); d.line([x, y, x, y + s - 1], fill=(255, 255, 255))
    # 모서리 둥글게
    for cx, cy in [(x - 1, y - 1), (x + s + dp, y - 1), (x - 1, y + s + dp), (x + s + dp, y + s + dp)]:
        d.point((cx, cy), fill=(0, 0, 0, 0))
    ps = max(1, round(s / 6.5)); m = (s - 3 * ps) / 4
    for px, py in PIPS[v]:
        X = round(x + m + px * (ps + m)); Y = round(y + m + py * (ps + m))
        c = pipc or (pip if v in (1, 4) else (42, 30, 72))
        d.rectangle([X, Y, X + ps - 1, Y + ps - 1], fill=c)

def rays(im, cx, cy, c1, c2, n=14, rot=0.0):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, im.height], fill=c1)
    R = im.width * 2
    for i in range(n):
        a0 = rot + i * 2 * math.pi / n; a1 = a0 + math.pi / n
        d.polygon([(cx, cy), (cx + R * math.cos(a0), cy + R * math.sin(a0)), (cx + R * math.cos(a1), cy + R * math.sin(a1))], fill=c2)

def glow(im, cx, cy, r, color, a=150):
    g = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (a,))
    g = g.filter(ImageFilter.GaussianBlur(r * 0.45))
    return Image.alpha_composite(im, g)

def sparkles(d, pts, c=(255, 243, 196)):
    for x, y, s in pts:
        d.rectangle([x - s, y, x + s, y], fill=c); d.rectangle([x, y - s, x, y + s], fill=c)
        d.point((x, y), fill=(255, 255, 255))

def outline(im, px=6, color=INK):
    """앞그림 둘레에 검은 외곽선 (작은 아이콘에서 배경과 떨어져 보이게)"""
    a = im.split()[3].point(lambda v: 255 if v > 40 else 0)
    o = a.filter(ImageFilter.MaxFilter(px * 2 + 1))
    sil = Image.new('RGBA', im.size, color); sil.putalpha(o)
    return Image.alpha_composite(sil, im)

def text(d_im, s, xy, size, fill, stroke=INK, sw=8, anchor='mm'):
    f = ImageFont.truetype(FONT, size)
    ImageDraw.Draw(d_im).text(xy, s, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)

# ── 후보들 ──────────────────────────────────────────────────────────────────
def c1():
    """영웅의 일격: 황금 햇살 + 큰 주사위(6) + 전사가 앞으로"""
    bg = grid(); rays(bg, 40, 22, (58, 28, 120), (84, 44, 160), 12, 0.1)
    bg = up(bg); bg = glow(bg, 330, 180, 170, (255, 200, 61), 170)
    fg = grid(); d = ImageDraw.Draw(fg)
    die(d, 28, 8, 26, 6, depth=4)
    sparkles(d, [(10, 10, 2), (58, 40, 2), (22, 30, 1), (52, 5, 1)])
    fg = up(fg)
    h = outline(hero('warrior', 330), 7)
    fg.alpha_composite(h, (14, S - h.height - 6))
    return bg, fg

def c2():
    """요트!: 다섯 주사위가 모두 6, 위에 왕관 · 아래 YACHT 리본"""
    bg = grid(); d = ImageDraw.Draw(bg)
    for y in range(G):
        t = y / G; d.line([0, y, G, y], fill=(int(20 + 40 * t), int(14 + 20 * t), int(60 + 70 * t)))
    bg = up(bg); bg = glow(bg, 256, 250, 200, (255, 190, 60), 120)
    fg = grid(); d = ImageDraw.Draw(fg)
    pos = [(5, 30), (17, 24), (29, 21), (41, 24), (53, 30)]
    for i, (x, y) in enumerate(pos):
        die(d, x - 5, y, 12, 6, depth=2, face=(255, 236, 160) if i == 2 else (255, 248, 236), pipc=(232, 67, 90) if i == 2 else None)
    # 왕관
    cx = 35
    d.rectangle([cx - 11, 12, cx + 9, 17], fill=INK)
    d.polygon([(cx - 11, 12), (cx - 11, 3), (cx - 6, 8), (cx - 1, 1), (cx + 4, 8), (cx + 9, 3), (cx + 9, 12)], fill=INK)
    d.polygon([(cx - 10, 13), (cx - 10, 5), (cx - 6, 9), (cx - 1, 3), (cx + 4, 9), (cx + 8, 5), (cx + 8, 13)], fill=(255, 200, 61))
    d.rectangle([cx - 10, 13, cx + 8, 16], fill=(232, 160, 30))
    d.rectangle([cx - 2, 13, cx, 15], fill=(232, 67, 90))
    sparkles(d, [(8, 10, 2), (56, 12, 2), (48, 4, 1), (14, 50, 1)])
    fg = up(fg)
    text(fg, 'YACHT!', (256, 432), 92, (255, 216, 74), sw=10)
    return bg, fg

def c3():
    """주사위 용사(마스코트): 머리띠를 맨 주사위가 칼을 들고 윙크"""
    bg = grid(); rays(bg, 32, 34, (232, 67, 90), (255, 110, 96), 16, 0.05)
    bg = up(bg); bg = glow(bg, 256, 270, 190, (255, 230, 150), 140)
    fg = grid(); d = ImageDraw.Draw(fg)
    x, y, s = 14, 16, 34
    die(d, x, y, s, 1, depth=5, pipc=(255, 248, 236))
    # 얼굴: 눈(한쪽 윙크) · 웃는 입 · 볼
    d.rectangle([x + 8, y + 12, x + 11, y + 17], fill=INK)
    d.line([x + 21, y + 15, x + 26, y + 15], fill=INK, width=2)
    d.rectangle([x + 12, y + 22, x + 22, y + 23], fill=INK); d.rectangle([x + 14, y + 24, x + 20, y + 26], fill=(200, 40, 70))
    d.rectangle([x + 4, y + 19, x + 7, y + 21], fill=(255, 150, 160)); d.rectangle([x + 27, y + 19, x + 30, y + 21], fill=(255, 150, 160))
    # 머리띠
    d.rectangle([x - 1, y + 3, x + s + 4, y + 7], fill=INK); d.rectangle([x, y + 4, x + s + 3, y + 6], fill=(232, 67, 90))
    d.rectangle([x + s + 4, y + 5, x + s + 10, y + 7], fill=INK); d.rectangle([x + s + 5, y + 6, x + s + 9, y + 6], fill=(232, 67, 90))
    d.rectangle([x + s + 6, y + 8, x + s + 12, y + 10], fill=INK); d.rectangle([x + s + 7, y + 9, x + s + 11, y + 9], fill=(232, 67, 90))
    d.rectangle([x + 15, y + 4, x + 18, y + 6], fill=(255, 200, 61))
    # 칼 (왼쪽 위로)
    for i in range(16):
        d.rectangle([x - 3 - i, y + 22 - i, x - 1 - i, y + 24 - i], fill=INK)
    for i in range(14):
        d.point((x - 3 - i, y + 22 - i), fill=(230, 240, 255)); d.point((x - 2 - i, y + 22 - i), fill=(180, 200, 230))
    d.rectangle([x - 5, y + 22, x + 1, y + 24], fill=INK); d.rectangle([x - 4, y + 23, x, y + 23], fill=(255, 200, 61))
    d.rectangle([x - 2, y + 25, x + 0, y + 29], fill=(120, 70, 40))
    sparkles(d, [(8, 52, 2), (56, 50, 2), (6, 4, 1), (58, 8, 1)])
    return up(bg), up(fg)

def c4():
    """마왕 앞의 용사: 어두운 붉은 하늘에 마왕 실루엣, 앞에 빛나는 주사위를 든 전사"""
    bg = grid(); d = ImageDraw.Draw(bg)
    for y in range(G):
        t = y / G; d.line([0, y, G, y], fill=(int(30 + 90 * t), int(8 + 10 * t), int(40 + 20 * t)))
    bg = up(bg)
    dm = Image.open(os.path.join(ROOT, 'assets', 'boss', 'demon.png')).convert('RGBA').resize((440, 440), Image.LANCZOS)
    r, g_, b, a = dm.split(); dark = Image.new('RGBA', dm.size, (60, 10, 40, 255)); dark.putalpha(a.point(lambda v: int(v * 0.9)))
    bg.alpha_composite(dark, (90, -20))
    # 눈빛
    bg = glow(bg, 300, 170, 26, (255, 40, 80), 230)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg = glow(fg, 150, 300, 110, (255, 220, 120), 200)
    gd = grid(); d = ImageDraw.Draw(gd); die(d, 13, 30, 12, 6, depth=2)
    fg.alpha_composite(up(gd))
    h = outline(hero('warrior', 300), 6)
    fg.alpha_composite(h, (150, S - h.height - 4))
    return bg, fg

def c5():
    """요트 히어로즈 로고형: '요트' 큰 글자 + 주사위 두 개 + 무희·전사"""
    bg = grid(); rays(bg, 32, 30, (40, 30, 110), (60, 46, 150), 18, 0.0)
    bg = up(bg); bg = glow(bg, 256, 200, 220, (120, 200, 255), 90)
    fg = grid(); d = ImageDraw.Draw(fg)
    die(d, 4, 4, 15, 5, depth=3); die(d, 45, 6, 14, 6, depth=3)
    fg = up(fg)
    text(fg, '요트', (256, 190), 170, (255, 216, 74), sw=14)
    h1 = outline(hero('warrior', 230), 6); h2 = outline(hero('dancer', 230), 6)
    fg.alpha_composite(h2, (S - h2.width - 10, S - h2.height - 4))
    fg.alpha_composite(h1, (10, S - h1.height - 4))
    return bg, fg

def c6():
    """초록 펠트 위 굴러가는 황금 주사위 + 도박사"""
    bg = grid(); d = ImageDraw.Draw(bg)
    d.rectangle([0, 0, G, G], fill=(20, 92, 66))
    for i in range(0, G, 4):
        d.line([i, 0, i - 30, G], fill=(24, 104, 74))
    d.rectangle([0, 0, G, 3], fill=(110, 60, 30)); d.rectangle([0, G - 4, G, G], fill=(110, 60, 30))
    bg = up(bg); bg = glow(bg, 360, 170, 150, (255, 210, 90), 150)
    fg = grid(); d = ImageDraw.Draw(fg)
    die(d, 34, 6, 22, 6, face=(255, 214, 74), side=(200, 130, 20), pipc=(120, 50, 10), depth=4)
    die(d, 44, 34, 14, 1, depth=3)
    sparkles(d, [(30, 4, 2), (60, 30, 2), (40, 30, 1)])
    fg = up(fg)
    h = outline(hero('gambler', 360), 7)
    fg.alpha_composite(h, (0, S - h.height - 2))
    return bg, fg

CANDS = [c1, c2, c3, c4, c5, c6]

def compose(bg, fg, safe=1.0, round_mask=False):
    im = bg.copy()
    if safe != 1.0:
        n = round(S * safe); f = fg.resize((n, n), Image.LANCZOS)
        im.alpha_composite(f, ((S - n) // 2, (S - n) // 2))
    else:
        im.alpha_composite(fg)
    if round_mask:
        m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(im, (0, 0), m); im = out
    return im

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'sheet':
        FONT = sys.argv[2]
        tiles = []
        for i, c in enumerate(CANDS):
            bg, fg = c(); big = compose(bg, fg, round_mask=True)
            tile = Image.new('RGBA', (560, 700), (245, 242, 250, 255))
            tile.alpha_composite(big, (24, 24))
            for j, px in enumerate([96, 64, 48]):          # 홈 화면 크기
                tile.alpha_composite(big.resize((px, px), Image.LANCZOS), (24 + j * 130, 560))
            ImageDraw.Draw(tile).text((540, 680), str(i + 1), font=ImageFont.truetype(FONT, 48), fill=(40, 30, 80), anchor='rd')
            tiles.append(tile)
        W = Image.new('RGBA', (560 * 3, 700 * 2), (245, 242, 250, 255))
        for i, t in enumerate(tiles): W.alpha_composite(t, ((i % 3) * 560, (i // 3) * 700))
        W.convert('RGB').save(sys.argv[3])
    elif mode == 'build':
        FONT = sys.argv[3] if len(sys.argv) > 3 else FONT
        c = CANDS[int(sys.argv[2]) - 1]
        bg, fg = c()
        full = compose(bg, fg).convert('RGB')
        full.save(os.path.join(ROOT, 'icons', 'icon-512.png'), optimize=True)
        full.resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, 'icons', 'icon-192.png'), optimize=True)
        compose(bg, fg, safe=0.8).convert('RGB').save(os.path.join(ROOT, 'icons', 'icon-maskable-512.png'), optimize=True)
        print('icons written')
