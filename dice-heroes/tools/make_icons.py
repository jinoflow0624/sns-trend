"""앱 아이콘 — 키보리아.

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
    """키보리아 로고형: '요트' 큰 글자 + 주사위 두 개 + 무희·전사"""
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

# ── 7~10: KYBORIA 로고(assets/logo/logo.webp · 타이틀 화면과 같은 그림)가 들어간 안 ──
def logo(scale):
    im = Image.open(os.path.join(ROOT, 'assets', 'logo', 'logo.webp')).convert('RGBA')
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)

def place_logo(fg, scale, cy, halo=True):
    lg = logo(scale); x = (S - lg.width) // 2; y = cy - lg.height // 2
    if halo:   # 뒤에 어두운 번짐 (배경 위에서 글자가 또렷하게)
        sh = Image.new('RGBA', fg.size, (0, 0, 0, 0)); a = Image.new('L', fg.size, 0); a.paste(lg.split()[3], (x, y))
        a = a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .75))
        sh.paste((10, 4, 34, 255), (0, 0), a); fg.alpha_composite(sh)
    fg.alpha_composite(lg, (x, y))
    return fg

def night(top=(10, 6, 34), low=(70, 40, 140)):
    bg = grid(); d = ImageDraw.Draw(bg)
    for y in range(G):
        t = y / G; d.line([0, y, G, y], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, low)))
    r = random.Random(5)
    for _ in range(26): d.point((r.randrange(G), r.randrange(int(G * .7))), fill=(200, 190, 255))
    return bg

def c7():
    """왕관 로고 + 금빛 햇살: 보라 햇살 가운데 로고, 위아래로 굴러가는 주사위"""
    bg = grid(); rays(bg, 32, 34, (52, 26, 116), (78, 42, 156), 14, 0.12)
    bg = up(bg); bg = glow(bg, 256, 270, 210, (255, 196, 70), 150)
    fg = grid(); d = ImageDraw.Draw(fg)
    die(d, 6, 6, 13, 5, depth=3); die(d, 45, 44, 13, 6, depth=3)
    sparkles(d, [(54, 10, 2), (10, 52, 2), (40, 6, 1), (24, 56, 1)])
    fg = up(fg)
    return bg, place_logo(fg, 5, 262)

def c8():
    """영웅들과 로고: 전사 · 마법사 · 춤꾼이 뒤에 서고 앞에 로고 띠"""
    bg = night(); bg = up(bg); bg = glow(bg, 256, 230, 230, (150, 110, 255), 110)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for name, h, x in [('mage', 250, 10), ('dancer', 250, 262), ('warrior', 300, 106)]:
        im = outline(hero(name, h), 6); fg.alpha_composite(im, (x if name != 'dancer' else S - im.width - 8, 300 - im.height + 20))
    band = Image.new('RGBA', (S, S), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
    bd.rectangle([0, 312, S, 452], fill=INK); bd.rectangle([0, 320, S, 444], fill=(40, 24, 96, 255)); bd.rectangle([0, 320, S, 326], fill=(92, 52, 196, 255))
    fg.alpha_composite(band)
    return bg, place_logo(fg, 5, 384, halo=False)

def c9():
    """타이틀 화면 그대로: 밤하늘 · 달 · 성 실루엣 위에 로고"""
    bg = night((8, 5, 30), (100, 56, 150)); d = ImageDraw.Draw(bg)
    d.ellipse([8, 8, 20, 20], fill=(255, 238, 180)); d.ellipse([11, 10, 15, 13], fill=(240, 214, 150))
    d.polygon([(0, 50), (10, 45), (20, 49), (32, 44), (44, 48), (56, 44), (64, 47), (64, 64), (0, 64)], fill=(34, 22, 80))
    cx = 50   # 성: 오른쪽 아래, 로고 아래로 비켜서
    d.rectangle([cx - 5, 44, cx + 5, 56], fill=(20, 14, 52)); d.rectangle([cx - 7, 47, cx - 5, 56], fill=(20, 14, 52)); d.rectangle([cx + 5, 47, cx + 7, 56], fill=(20, 14, 52))
    for k in (-5, -1, 3): d.rectangle([cx + k, 42, cx + k + 1, 44], fill=(20, 14, 52))
    d.rectangle([cx, 38, cx, 42], fill=(20, 14, 52)); d.rectangle([cx + 1, 38, cx + 3, 39], fill=(232, 67, 90))
    d.point((cx - 2, 49), fill=(255, 200, 61)); d.point((cx + 2, 49), fill=(255, 200, 61)); d.rectangle([cx - 1, 53, cx + 1, 56], fill=(255, 170, 50))
    d.rectangle([0, 56, 64, 64], fill=(22, 50, 40))
    bg = up(bg); bg = glow(bg, 112, 112, 80, (255, 230, 150), 110); bg = glow(bg, 400, 400, 60, (255, 180, 60), 90)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    return bg, place_logo(fg, 5, 236)

def c10():
    """요트! 다섯 주사위: 위에 로고, 아래에 6 다섯 개가 활처럼 (가운데는 금빛)"""
    bg = grid(); d = ImageDraw.Draw(bg)
    for y in range(G):
        t = y / G; d.line([0, y, G, y], fill=(int(30 + 30 * t), int(16 + 16 * t), int(80 + 60 * t)))
    bg = up(bg); bg = glow(bg, 256, 330, 200, (255, 200, 70), 130)
    fg = grid(); d = ImageDraw.Draw(fg)
    pos = [(7, 42), (18, 38), (29, 36), (40, 38), (51, 42)]
    for i in (0, 4, 1, 3, 2):   # 가운데(금빛)를 맨 위에
        x, y = pos[i]
        die(d, x - 5, y, 11, 6, depth=2, face=(255, 222, 110) if i == 2 else (250, 246, 255), side=(220, 140, 30) if i == 2 else (214, 200, 232), pipc=(200, 40, 70) if i == 2 else (60, 30, 140))
    sparkles(d, [(8, 30, 2), (56, 30, 2), (32, 58, 1)])
    fg = up(fg)
    return bg, place_logo(fg, 5, 176)

def die_hd(size, v, rot=0, face=(255, 253, 248), side=(190, 172, 236), pip=(56, 30, 120), px=4):
    """새 주사위: 둥근 모서리 · 위쪽 빛 · 아래 · 오른쪽 두께 · 둥근 눈 → 살짝 기울여 도트(px 칸)로"""
    k = 4; n = size * k; pad = n // 5
    im = Image.new('RGBA', (n + pad * 2, n + pad * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    o = pad; r = int(n * 0.2); dep = int(n * 0.1); ln = max(4, int(n * 0.045))
    d.rounded_rectangle([o - ln, o - ln, o + n + dep + ln, o + n + dep + ln], radius=r + ln, fill=INK)        # 외곽선
    d.rounded_rectangle([o + dep, o + dep, o + n + dep, o + n + dep], radius=r, fill=side)                     # 두께
    d.rounded_rectangle([o, o, o + n, o + n], radius=r, fill=face)                                            # 앞면
    d.rounded_rectangle([o + ln, o + ln, o + n - ln * 2, o + n * 0.42], radius=r, fill=(255, 255, 255))       # 위쪽 빛
    d.rounded_rectangle([o + ln * 0.6, o + n * 0.55, o + n - ln, o + n - ln * 0.6], radius=r, fill=(240, 234, 252))   # 아래쪽 옅은 그늘
    pr = n * 0.085; m = n * 0.27
    for gx, gy in PIPS[v]:
        cx = o + n / 2 + (gx - 1) * m; cy = o + n / 2 + (gy - 1) * m
        c = (226, 52, 84) if v == 1 else pip; rr = pr * (1.35 if v == 1 else 1)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=c)
        d.ellipse([cx - rr * 0.45, cy - rr * 0.6, cx + rr * 0.05, cy - rr * 0.1], fill=(255, 255, 255, 110) if v == 1 else (120, 96, 190))
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    w, h = im.size
    small = im.resize((max(1, w // k // px), max(1, h // k // px)), Image.LANCZOS)   # 도트 칸(px)으로 줄였다가
    small.putalpha(small.split()[3].point(lambda v: 255 if v > 110 else 0))
    return small.resize((small.width * px, small.height * px), Image.NEAREST)         # 칸째로 키운다

def logo_w(width):
    """로고를 가로 width 로 (도트가 고르게 — 칸 크기를 정수 근처로)"""
    im = Image.open(os.path.join(ROOT, 'assets', 'logo', 'logo.webp')).convert('RGBA')
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.NEAREST)

def c11(mask=False):
    """7번 개선: 밝고 채도 높은 보라 햇살, 앱 테두리에 꽉 차는 로고, 작고 둥근 새 주사위 두 개"""
    bg = grid(); rays(bg, 32, 33, (104, 54, 222), (134, 84, 250), 14, 0.12)
    bg = up(bg)
    bg = glow(bg, 256, 258, 240, (226, 150, 255), 120)   # 가운데 분홍빛 보라 (금빛을 넓게 깔면 보라와 섞여 칙칙한 베이지가 됐다)
    bg = glow(bg, 256, 256, 96, (255, 232, 150), 95)     # 로고 뒤 작은 금빛
    vg = Image.new('L', (S, S), 0); ImageDraw.Draw(vg).ellipse([-90, -90, S + 90, S + 90], fill=255)   # 가장자리만 살짝 어둡게 (깊이)
    vg = vg.filter(ImageFilter.GaussianBlur(60)); edge = Image.new('RGBA', (S, S), (54, 20, 130, 150)); edge.putalpha(vg.point(lambda v: int((255 - v) * .55)))
    bg = Image.alpha_composite(bg, edge)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sz, (ax, ay), (bx, by) = (66, (126, 112), (386, 400)) if mask else (78, (92, 86), (420, 424))
    for (cx, cy), v, rot in [((ax, ay), 5, 14), ((bx, by), 6, -12)]:
        dd = die_hd(sz, v, rot); fg.alpha_composite(dd, (cx - dd.width // 2, cy - dd.height // 2))
    sp = grid(); sparkles(ImageDraw.Draw(sp), [(52, 12, 2), (12, 50, 2), (44, 54, 1), (20, 8, 1)]); fg.alpha_composite(up(sp))
    lg = logo_w(440 if mask else 492); x = (S - lg.width) // 2; y = 256 - lg.height // 2
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); a = Image.new('L', (S, S), 0); a.paste(lg.split()[3], (x, y))
    a = a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(12)).point(lambda v: int(v * .8))
    sh.paste((26, 8, 70, 255), (0, 0), a); fg.alpha_composite(sh)
    fg.alpha_composite(lg, (x, y))
    return bg, fg
c11.maskable = True

# ── 12~14: 마왕(릴리스) 얼굴 · 상반신 + 주사위, 글자 없음 ──
def demon_bust(w, box=(118, 24, 410, 292)):
    """마왕 그림에서 얼굴 · 상반신만 잘라 가로 w 로 (도트는 부드럽게 키운다)"""
    im = Image.open(os.path.join(ROOT, 'assets', 'boss', 'demon.webp')).convert('RGBA').crop(box)
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

def hell_bg(top=(40, 6, 30), mid=(150, 18, 52), hi=(255, 90, 70)):
    """붉은 지옥 하늘: 위는 검붉게, 가운데 뒤로 붉은 빛 · 아래에서 올라오는 불빛"""
    bg = grid(); d = ImageDraw.Draw(bg)
    for y in range(G):
        t = y / G; c = tuple(int(a + (b - a) * min(1, t * 1.3)) for a, b in zip(top, mid)); d.line([0, y, G, y], fill=c)
    bg = up(bg)
    bg = glow(bg, 256, 210, 230, hi, 120)
    bg = glow(bg, 256, 520, 200, (255, 150, 40), 140)
    return bg

def glow_die(sz, v, rot, ring=(255, 80, 60)):
    """붉게 빛나는 주사위 (둘레에 불빛)"""
    dd = die_hd(sz, v, rot, pip=(150, 14, 40))
    pad = 40; out = Image.new('RGBA', (dd.width + pad * 2, dd.height + pad * 2), (0, 0, 0, 0))
    a = Image.new('L', out.size, 0); a.paste(dd.split()[3], (pad, pad)); a = a.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(14))
    g = Image.new('RGBA', out.size, ring + (255,)); g.putalpha(a.point(lambda v: int(v * .85)))
    out.alpha_composite(g); out.alpha_composite(dd, (pad, pad))
    return out

def paste_c(fg, im, cx, cy): fg.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))

def embers(fg, n=26, seed=3, ymin=40):
    r = random.Random(seed); d = ImageDraw.Draw(fg)
    for _ in range(n):
        x, y, s = r.randrange(20, S - 20), r.randrange(ymin, S - 30), r.choice([4, 4, 6, 8])
        c = r.choice([(255, 200, 80), (255, 120, 60), (255, 236, 170)])
        d.rectangle([x, y, x + s - 1, y + s - 1], fill=c + (220,))

def c12(mask=False):
    """마왕 상반신 정면 + 앞에 붉게 빛나는 주사위 둘"""
    bg = hell_bg(); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    b = demon_bust(470 if mask else 580); paste_c(fg, outline(b, 5), 256, (238 if mask else 250))
    embers(fg)
    sz = 104 if mask else 126
    paste_c(fg, glow_die(sz, 6, 12), 178 if mask else 160, 392 if mask else 420)
    paste_c(fg, glow_die(sz, 1, -14), 336 if mask else 356, 396 if mask else 426)
    return bg, fg
c12.maskable = True

def c13(mask=False):
    """마왕이 손 위에 불타는 주사위를 띄운다 (불꽃 자리에 주사위)"""
    bg = hell_bg(mid=(110, 12, 60), hi=(220, 60, 120)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    w = 480 if mask else 590; b = demon_bust(w); bx, by = (240, 262) if mask else (232, 282)
    paste_c(fg, outline(b, 5), bx, by)
    # 오른손(그림 기준) 불꽃 자리 = 원본 (382, 190) → 잘린 그림 안 좌표로
    hx, hy = (330, 392) if mask else (346, 410)   # 가슴 앞에서 두 손 위로 떠오른 주사위
    fg = glow(fg, int(hx), int(hy), 90, (255, 120, 40), 200)
    paste_c(fg, glow_die(120 if mask else 146, 6, -10, ring=(255, 140, 40)), hx, hy - 10)
    embers(fg, 20, 7)
    return bg, fg
c13.maskable = True

def c14(mask=False):
    """마왕 상반신 + 아래 활처럼 늘어선 6 다섯 개 (요트)"""
    bg = hell_bg(top=(26, 6, 40), mid=(96, 20, 120), hi=(255, 70, 110)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    b = demon_bust(460 if mask else 560); paste_c(fg, outline(b, 5), 256, 226 if mask else 232)
    embers(fg, 18, 11)
    sz = 66 if mask else 80; span = 330 if mask else 404; base = 404 if mask else 432
    for i in (0, 4, 1, 3, 2):
        t = i / 4; x = 256 - span / 2 + span * t; y = base - (1 - (2 * t - 1) ** 2) * (26 if mask else 34)
        paste_c(fg, glow_die(sz, 6, (i - 2) * 7), x, y)
    return bg, fg
c14.maskable = True

# ── 15~16: 마왕 얼굴 클로즈업(아이콘을 거의 다 채운다) + 마왕과 어울리는 흑요석 주사위 ──
def demon_face(box):
    im = Image.open(os.path.join(ROOT, 'assets', 'boss', 'demon.webp')).convert('RGBA').crop(box)
    bg = Image.new('RGBA', im.size, (0, 0, 0, 0)); bg.alpha_composite(im)
    big = bg.resize((S, S), Image.LANCZOS)
    return big.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))

def obsidian_die(sz, v, rot, px=3):
    """흑요석 주사위: 검붉은 몸(위가 조금 밝은 그라데이션) · 은빛 테두리 · 붉게 빛나는 눈 · 둘레 붉은 빛 — 마왕의 뿔 · 왕관 색"""
    k = 4; n = sz * k; pad = n // 3
    W = n + pad * 2; im = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    o = pad; r = int(n * 0.2); dep = int(n * 0.11); ln = max(5, int(n * 0.05))
    d.rounded_rectangle([o - ln, o - ln, o + n + dep + ln, o + n + dep + ln], radius=r + ln, fill=(14, 4, 12))          # 외곽선
    d.rounded_rectangle([o + dep, o + dep, o + n + dep, o + n + dep], radius=r, fill=(104, 14, 38))                     # 두께 (검붉은)
    grad = Image.new('RGBA', (n, n)); gd = ImageDraw.Draw(grad)
    for y in range(n):
        t = y / n; gd.line([0, y, n, y], fill=(int(70 - 34 * t), int(42 - 24 * t), int(74 - 38 * t), 255))
    m = Image.new('L', (n, n), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, n - 1, n - 1], radius=r, fill=255)
    im.paste(grad, (o, o), m)                                                                                           # 앞면
    d.rounded_rectangle([o + ln, o + ln, o + n - ln, o + n - ln], radius=r - ln, outline=(206, 200, 226), width=ln)    # 은빛 테두리
    d.rounded_rectangle([o + ln * 3, o + ln * 2.6, o + n * 0.62, o + ln * 4.2], radius=ln, fill=(170, 150, 190))       # 위쪽 윤기 한 줄
    glow_l = Image.new('L', (W, W), 0); gl = ImageDraw.Draw(glow_l)
    pr = n * 0.09; mm = n * 0.25
    pts = [(o + n / 2 + (gx - 1) * mm, o + n / 2 + (gy - 1) * mm) for gx, gy in PIPS[v]]
    for cx, cy in pts: gl.ellipse([cx - pr * 2, cy - pr * 2, cx + pr * 2, cy + pr * 2], fill=200)
    glow_l = glow_l.filter(ImageFilter.GaussianBlur(pr))
    red = Image.new('RGBA', (W, W), (255, 50, 70, 255)); red.putalpha(Image.composite(glow_l, Image.new('L', (W, W), 0), m.resize((W, W)) if False else glow_l))
    im.alpha_composite(red)
    for cx, cy in pts:
        rr = pr * (1.4 if v == 1 else 1)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 62, 76))
        d.ellipse([cx - rr * .45, cy - rr * .55, cx + rr * .15, cy + rr * .05], fill=(255, 200, 200))
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    w, h = im.size
    small = im.resize((max(1, w // k // px), max(1, h // k // px)), Image.LANCZOS)
    small.putalpha(small.split()[3].point(lambda a: 255 if a > 120 else (a if a > 30 else 0)))
    dd = small.resize((small.width * px, small.height * px), Image.NEAREST)
    # 둘레 붉은 빛
    p2 = 40; out = Image.new('RGBA', (dd.width + p2 * 2, dd.height + p2 * 2), (0, 0, 0, 0))
    a = Image.new('L', out.size, 0); a.paste(dd.split()[3].point(lambda v: 255 if v > 200 else 0), (p2, p2)); a = a.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(14))
    g = Image.new('RGBA', out.size, (255, 40, 60, 255)); g.putalpha(a.point(lambda v: int(v * .8)))
    out.alpha_composite(g); out.alpha_composite(dd, (p2, p2))
    return out

def c15(mask=False):
    """마왕 얼굴 클로즈업 + 아래 두 구석에 흑요석 주사위"""
    bg = hell_bg(top=(30, 4, 24), mid=(120, 14, 44)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg.alpha_composite(demon_face((168, 58, 362, 252) if mask else (182, 72, 348, 238)))
    sz = 78 if mask else 92
    paste_c(fg, obsidian_die(sz, 6, 14), 120 if mask else 90, 408 if mask else 432)
    paste_c(fg, obsidian_die(sz, 1, -12), 392 if mask else 422, 412 if mask else 436)
    return bg, fg
c15.maskable = True

def c16(mask=False):
    """마왕 얼굴 클로즈업 + 오른쪽 아래 불빛 두른 흑요석 주사위 하나"""
    bg = hell_bg(top=(30, 4, 24), mid=(120, 14, 44)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg.alpha_composite(demon_face((164, 58, 358, 252) if mask else (176, 72, 342, 238)))
    paste_c(fg, obsidian_die(100 if mask else 120, 6, -12), 380 if mask else 412, 400 if mask else 422)
    return bg, fg
c16.maskable = True

# ── 17: 입체 흑요석 주사위(앞 · 윗면 · 옆면 3면) + 더 가까운 마왕 얼굴(가운데보다 조금 위) ──
def cube_die(sz, front=6, top=2, right=3, px=3, tilt=0):
    """세 면이 보이는 흑요석 주사위. 윗면은 빛을 받아 밝고 옆면은 그늘, 모서리에 빛 한 줄. 눈은 면마다 원근에 맞게"""
    k = 4; n = sz * k; t = int(n * 0.44)                      # 앞면 한 변 · 깊이
    dx, dy = int(t * 0.78), int(t * 0.86)
    pad = n // 4; W = n + dx + pad * 2; H = n + dy + pad * 2
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ox, oy = pad, pad + dy
    F = [(ox, oy), (ox + n, oy), (ox + n, oy + n), (ox, oy + n)]                       # 앞면
    T = [(ox, oy), (ox + dx, oy - dy), (ox + n + dx, oy - dy), (ox + n, oy)]           # 윗면
    Rr = [(ox + n, oy), (ox + n + dx, oy - dy), (ox + n + dx, oy + n - dy), (ox + n, oy + n)]   # 옆면
    ln = max(6, n // 22)
    d.polygon([(ox, oy + n), (ox, oy), (ox + dx, oy - dy), (ox + n + dx, oy - dy), (ox + n + dx, oy + n - dy), (ox + n, oy + n)], fill=(12, 3, 10), outline=(12, 3, 10), width=ln * 2)
    def shade(poly, c0, c1):   # 위→아래 그라데이션 면
        xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
        g = Image.new('RGBA', (W, H)); gd = ImageDraw.Draw(g); y0, y1 = min(ys), max(ys)
        for y in range(y0, y1 + 1):
            q = (y - y0) / max(1, y1 - y0); gd.line([0, y, W, y], fill=tuple(int(a + (b - a) * q) for a, b in zip(c0, c1)) + (255,))
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(poly, fill=255); im.paste(g, (0, 0), m)
    shade(T, (168, 128, 178), (112, 78, 124))   # 윗면: 빛
    shade(F, (86, 52, 90), (42, 22, 46))        # 앞면
    shade(Rr, (74, 14, 40), (32, 6, 20))        # 옆면: 그늘 (검붉은)
    # 모서리 빛: 윗면과 앞면이 만나는 선 · 윗면 왼쪽 선 · 위 오른쪽 모서리 (은빛 한 줄 대신 빛이 걸린 모서리)
    d.line([F[0], F[1]], fill=(226, 206, 236), width=ln); d.line([T[0], T[1]], fill=(170, 140, 186), width=max(3, ln // 2))
    d.line([F[1], Rr[1]], fill=(150, 90, 130), width=max(3, ln // 2)); d.line([F[1], F[2]], fill=(120, 40, 70), width=max(3, ln // 2))
    # 면 위 눈: 단위 사각형 좌표 → 면 평행사변형 (원근)
    def pips(poly, v, scale=1.0, glowc=(255, 50, 70)):
        A, B, _, D = poly[0], poly[1], poly[2], poly[3]
        if poly is T: A, B, D = poly[0], poly[3], poly[1]      # 윗면: 앞 모서리 기준
        def P(u, w): return (A[0] + (B[0] - A[0]) * u + (D[0] - A[0]) * w, A[1] + (B[1] - A[1]) * u + (D[1] - A[1]) * w)
        r = 0.095 * scale
        for gx, gy in PIPS[v]:
            cu, cw = 0.5 + (gx - 1) * 0.25, 0.5 + (gy - 1) * 0.25
            rr = r * (1.35 if v == 1 else 1)
            pts = [P(cu + rr * math.cos(a), cw + rr * math.sin(a)) for a in [i * math.pi / 10 for i in range(20)]]
            hl = [P(cu - rr * .35 + rr * .3 * math.cos(a), cw - rr * .35 + rr * .3 * math.sin(a)) for a in [i * math.pi / 6 for i in range(12)]]
            d.polygon(pts, fill=glowc); d.polygon(hl, fill=(255, 196, 196))
    pips(F, front); pips(T, top, glowc=(255, 92, 104)); pips(Rr, right, glowc=(200, 30, 54))
    # 눈 둘레 붉은 빛 (앞면만 은은하게)
    if tilt: im = im.rotate(tilt, resample=Image.BICUBIC, expand=True)
    w, h = im.size
    small = im.resize((max(1, w // k // px), max(1, h // k // px)), Image.LANCZOS)
    small.putalpha(small.split()[3].point(lambda a: 255 if a > 120 else 0))
    dd = small.resize((small.width * px, small.height * px), Image.NEAREST)
    p2 = 40; out = Image.new('RGBA', (dd.width + p2 * 2, dd.height + p2 * 2), (0, 0, 0, 0))
    a = Image.new('L', out.size, 0); a.paste(dd.split()[3], (p2, p2)); a = a.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(16))
    g = Image.new('RGBA', out.size, (255, 40, 60, 255)); g.putalpha(a.point(lambda v: int(v * .95)))
    out.alpha_composite(g); out.alpha_composite(dd, (p2, p2))
    return out

def c17(mask=False):
    """마왕 얼굴 더 가까이 (얼굴 가운데가 아이콘 높이 45% 쯤) + 아래 가운데 입체 흑요석 주사위 둘"""
    bg = hell_bg(top=(30, 4, 24), mid=(120, 14, 44)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg.alpha_composite(demon_face((182, 110, 348, 276) if mask else (190, 118, 340, 268)))
    sz = 92 if mask else 108
    paste_c(fg, cube_die(sz, 6, 2, 3, tilt=6), 186 if mask else 176, 404 if mask else 430)
    paste_c(fg, cube_die(sz, 1, 3, 2, tilt=-5), 330 if mask else 344, 410 if mask else 436)
    return bg, fg
c17.maskable = True

# ── 18: 17 개선 — 원본(1254px)에서 잘라 선명한 마왕 얼굴 · 배경과 같은 그림체(부드럽게 칠한) 진홍 주사위를 좌우에 ──
def demon_face_hi(box):
    """게임 그림(512) 좌표 box 를 원본 tools/boss-src/demon.webp(1254) 좌표로 바꿔 자른다 → 크게 키워도 깨지지 않는다
    (make_boss_sprites.py: 원본 테두리 (0,13)~ 를 k = 480/1241 로 줄여 (16, 20) 에 놓았다)"""
    src = Image.open(os.path.join(HERE, 'boss-src', 'demon.webp')).convert('RGBA')
    k = 480 / 1241
    sb = tuple(round(v) for v in ((box[0] - 16) / k, (box[1] - 20) / k + 13, (box[2] - 16) / k, (box[3] - 20) / k + 13))
    im = src.crop(sb)
    bg = Image.new('RGBA', im.size, (0, 0, 0, 0)); bg.alpha_composite(im)
    return bg.resize((S, S), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.4, percent=40, threshold=2))

def paint_die(sz, front=6, top=2, right=3, tilt=0):
    """배경과 같은 그림체의 진홍 주사위: 부드럽게 칠한 세 면 (윗면은 붉은 빛을 받고 옆면은 어둡게),
    모서리에 따뜻한 빛, 눈은 불꽃처럼 주황 · 금빛으로 빛난다. 도트로 바꾸지 않는다"""
    k = 4; n = sz * k; t = int(n * 0.44); dx, dy = int(t * 0.78), int(t * 0.86)
    pad = n // 3; W = n + dx + pad * 2; H = n + dy + pad * 2
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ox, oy = pad, pad + dy
    F = [(ox, oy), (ox + n, oy), (ox + n, oy + n), (ox, oy + n)]
    T = [(ox, oy), (ox + dx, oy - dy), (ox + n + dx, oy - dy), (ox + n, oy)]
    Rr = [(ox + n, oy), (ox + n + dx, oy - dy), (ox + n + dx, oy + n - dy), (ox + n, oy + n)]
    ln = max(5, n // 30)
    hull = [(ox, oy + n), (ox, oy), (ox + dx, oy - dy), (ox + n + dx, oy - dy), (ox + n + dx, oy + n - dy), (ox + n, oy + n)]
    d.polygon(hull, fill=(22, 2, 8), outline=(22, 2, 8), width=ln * 2)
    def shade(poly, c0, c1, horiz=False):
        xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
        g = Image.new('RGBA', (W, H)); gd = ImageDraw.Draw(g)
        a0, a1 = (min(xs), max(xs)) if horiz else (min(ys), max(ys))
        for v in range(a0, a1 + 1):
            q = (v - a0) / max(1, a1 - a0); c = tuple(int(x + (y - x) * q) for x, y in zip(c0, c1)) + (255,)
            gd.line([v, 0, v, H] if horiz else [0, v, W, v], fill=c)
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(poly, fill=255); im.paste(g, (0, 0), m)
    shade(T, (196, 70, 84), (120, 26, 46))          # 윗면: 위 붉은 빛을 받아 밝은 진홍
    shade(F, (92, 16, 36), (36, 4, 16))             # 앞면: 검붉은 (아래로 어둡게)
    shade(Rr, (52, 8, 24), (20, 2, 10), True)       # 옆면: 더 어두운 그늘
    # 윗면 윤기 (부드러운 빛 덩어리)
    gl = Image.new('L', (W, H), 0); ImageDraw.Draw(gl).ellipse([ox + n * .1, oy - dy * .9, ox + n * .75, oy - dy * .25], fill=110)
    gl = gl.filter(ImageFilter.GaussianBlur(n * .05)); m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(T, fill=255)
    gl = Image.composite(gl, Image.new('L', (W, H), 0), m); wht = Image.new('RGBA', (W, H), (255, 214, 200, 255)); wht.putalpha(gl); im.alpha_composite(wht)
    # 모서리 빛 (따뜻한 색 · 부드럽게)
    edge = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ed = ImageDraw.Draw(edge)
    ed.line([F[0], F[1]], fill=(255, 176, 150, 255), width=ln * 2); ed.line([F[1], Rr[1]], fill=(255, 120, 110, 200), width=ln)
    ed.line([T[0], T[1]], fill=(230, 120, 120, 180), width=ln); ed.line([F[1], F[2]], fill=(170, 40, 60, 200), width=ln)
    im.alpha_composite(edge.filter(ImageFilter.GaussianBlur(ln * .5)))
    # 눈: 면마다 원근, 주황 · 금빛 불씨 + 은은한 빛
    glowL = Image.new('L', (W, H), 0); glD = ImageDraw.Draw(glowL)
    def pips(poly, v, top_face=False, dim=1.0):
        A, B, D = (poly[0], poly[3], poly[1]) if top_face else (poly[0], poly[1], poly[3])
        def P(u, w): return (A[0] + (B[0] - A[0]) * u + (D[0] - A[0]) * w, A[1] + (B[1] - A[1]) * u + (D[1] - A[1]) * w)
        for gx, gy in PIPS[v]:
            cu, cw = 0.5 + (gx - 1) * 0.25, 0.5 + (gy - 1) * 0.25; rr = 0.095 * (1.35 if v == 1 else 1)
            ring = [P(cu + rr * math.cos(a), cw + rr * math.sin(a)) for a in [i * math.pi / 12 for i in range(24)]]
            core = [P(cu - rr * .25 + rr * .45 * math.cos(a), cw - rr * .25 + rr * .45 * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]]
            d.polygon(ring, fill=(int(255 * dim), int(58 * dim), int(76 * dim))); d.polygon(core, fill=(255, int(210 * dim), int(214 * dim)))
            glD.polygon([P(cu + rr * 1.8 * math.cos(a), cw + rr * 1.8 * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]], fill=int(170 * dim))
    pips(F, front); pips(T, top, True, .95); pips(Rr, right, dim=.7)
    glowL = glowL.filter(ImageFilter.GaussianBlur(n * .03)); og = Image.new('RGBA', (W, H), (255, 50, 70, 255)); og.putalpha(glowL)
    im = Image.alpha_composite(og, im) if False else im; im.alpha_composite(og)
    if tilt: im = im.rotate(tilt, resample=Image.BICUBIC, expand=True)
    w, h = im.size; dd = im.resize((w // k, h // k), Image.LANCZOS)
    p2 = 44; out = Image.new('RGBA', (dd.width + p2 * 2, dd.height + p2 * 2), (0, 0, 0, 0))
    a = Image.new('L', out.size, 0); a.paste(dd.split()[3], (p2, p2)); a = a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(18))
    g = Image.new('RGBA', out.size, (255, 50, 50, 255)); g.putalpha(a.point(lambda v: int(v * .7)))
    out.alpha_composite(g); out.alpha_composite(dd, (p2, p2))
    return out

def c18(mask=False):
    """마왕 얼굴(원본에서 잘라 선명) 가운데보다 조금 위 + 좌우 양옆에 배경과 같은 그림체의 진홍 주사위 하나씩"""
    bg = hell_bg(top=(30, 4, 24), mid=(120, 14, 44)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg.alpha_composite(demon_face_hi((182, 110, 348, 276) if mask else (190, 118, 340, 268)))
    # 목 아래(옷깃 아래)는 검붉은 어둠 · 불티로 덮는다 — 얼굴에 시선이 모이고 몸은 보이지 않게
    y0 = 300 if mask else 316          # 옷깃 바로 아래부터 (얼굴 · 목걸이 보석은 남긴다)
    sh = Image.new('L', (S, S), 0); sd = ImageDraw.Draw(sh)
    for y in range(y0, S): sd.line([0, y, S, y], fill=min(250, int(255 * ((y - y0) / 120) ** 0.75)))
    sh = sh.filter(ImageFilter.GaussianBlur(10)); dark = Image.new('RGBA', (S, S), (44, 4, 16, 255)); dark.putalpha(sh); fg.alpha_composite(dark)
    fg = glow(fg, 256, S + 30, 150, (255, 90, 40), 120)
    embers(fg, 22, 5, ymin=340)   # 불티는 아래쪽에만 (얼굴 위에 점처럼 보이지 않게)
    sz = 84 if mask else 98
    paste_c(fg, paint_die(sz, 6, 2, 3, tilt=10), 112 if mask else 74, 372 if mask else 380)
    paste_c(fg, paint_die(sz, 5, 3, 1, tilt=-9), 400 if mask else 438, 368 if mask else 376)
    return bg, fg
c18.maskable = True

def c19(mask=False):
    """18 에서: 주사위 · 가슴 그늘 빼고, 얼굴 30% 더 가까이(가운데보다 조금 위), 가슴께에 KYBORIA 로고"""
    bg = hell_bg(top=(30, 4, 24), mid=(120, 14, 44)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # 18 의 잘라낸 칸(150px)을 1/1.3 로 → 115px. 얼굴 가운데(265, 185)가 위에서 45% 쯤
    fg.alpha_composite(demon_face_hi((201, 128, 329, 256) if mask else (207, 133, 322, 248)))
    lg = logo_w(410 if mask else 470); x = (S - lg.width) // 2; y = (404 if mask else 408) - lg.height // 2
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); a = Image.new('L', (S, S), 0); a.paste(lg.split()[3], (x, y))
    a = a.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .85))
    sh.paste((30, 4, 14, 255), (0, 0), a); fg.alpha_composite(sh)       # 로고 뒤 어두운 번짐 (글자가 또렷하게)
    fg.alpha_composite(lg, (x, y))
    return bg, fg
c19.maskable = True

def c20(mask=False, box=None):
    """19 에서 KYBORIA 글자도 뺀다: 마왕 얼굴 클로즈업만"""
    bg = hell_bg(top=(30, 4, 24), mid=(120, 14, 44)); fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg.alpha_composite(demon_face_hi(box or ((201, 128, 329, 256) if mask else (207, 133, 322, 248))))
    return bg, fg
c20.maskable = True

CANDS = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20]

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
        pick = [int(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else list(range(1, len(CANDS) + 1))
        for i, c in [(k - 1, CANDS[k - 1]) for k in pick]:
            bg, fg = c(); big = compose(bg, fg, round_mask=True)
            tile = Image.new('RGBA', (560, 700), (245, 242, 250, 255))
            tile.alpha_composite(big, (24, 24))
            for j, px in enumerate([96, 64, 48]):          # 홈 화면 크기
                tile.alpha_composite(big.resize((px, px), Image.LANCZOS), (24 + j * 130, 560))
            ImageDraw.Draw(tile).text((540, 680), str(i + 1), font=ImageFont.truetype(FONT, 48), fill=(40, 30, 80), anchor='rd')
            tiles.append(tile)
        W = Image.new('RGBA', (560 * min(len(tiles), 4), 700 * ((len(tiles) + 3) // 4)), (245, 242, 250, 255))
        for i, t in enumerate(tiles): W.alpha_composite(t, ((i % 4) * 560, (i // 4) * 700))
        W.convert('RGB').save(sys.argv[3])
    elif mode == 'build':
        FONT = sys.argv[3] if len(sys.argv) > 3 else FONT
        c = CANDS[int(sys.argv[2]) - 1]
        bg, fg = c()
        full = compose(bg, fg).convert('RGB')
        full.save(os.path.join(ROOT, 'icons', 'icon-512.png'), optimize=True)
        full.resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, 'icons', 'icon-192.png'), optimize=True)
        if getattr(c, 'maskable', False):   # 안드로이드 둥근 잘림용을 따로 그린다 (로고는 크게 · 주사위는 안쪽으로)
            bm, fm = c(mask=True); compose(bm, fm).convert('RGB').save(os.path.join(ROOT, 'icons', 'icon-maskable-512.png'), optimize=True)
        else: compose(bg, fg, safe=0.8).convert('RGB').save(os.path.join(ROOT, 'icons', 'icon-maskable-512.png'), optimize=True)
        print('icons written')
