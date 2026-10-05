"""트레이 스킨 그림 — 디자인 시트 한 장(tools/dice-src/tray-sheet-v2.webp)에서 오려 게임 트레이 모양에 맞춘다.

  python3 tools/make_trays_from_sheet.py     →  assets/trays/<스킨>/{floor,glow,box,thumb}.webp
  필요: pip install pillow numpy opencv-python-headless

시트는 7칸(CLASSIC · ROYAL · DEEPSEA · DEMON · SAKURA · LAVA · STARRY) × (바닥 · 발광 지도 · 주사위 함 바닥).
시트 한 칸이 약 200px 라서 먼저 upscale_tray_sheet.py 로 4배 키운 그림(tools/dice-src/tray-hires/)을 쓴다 (없으면 시트에서 바로).
게임 트레이 바닥은 정사각이 아니라 10 : 6.4 라서
  바닥·발광: 그림 전체를 가로로 늘린 위에, 가운데 문양만 원래 비율로 다시 얹는다 (문양이 납작해지지 않게, 둘레는 부드럽게 섞음)
  함 바닥:   양 끝 장식과 가운데 장식은 그대로 두고 그 사이 테두리만 늘린다 (11 : 1.9)
시트의 CLASSIC 은 게임의 '기본'(초록 펠트)과 따로 '클래식(marble)' 스킨이 된다.
마왕성은 시안의 붉은 색을 보라 · 검정 테마로 돌린다 (RECOLOR).
"""
import os
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, 'dice-src', 'tray-sheet-v2.webp')
OUT = os.path.join(HERE, '..', 'assets', 'trays')
HIRES = os.path.join(HERE, 'dice-src', 'tray-hires')   # upscale_tray_sheet.py 로 4배 키운 칸 (있으면 이걸 쓴다)

IDS = ['marble', 'royal', 'deepsea', 'demon', 'sakura', 'lava', 'starry']
# 칸마다 실측한 위치 (x0, y0, 한 변) — 바닥 · 발광 지도는 정사각, 함 바닥은 (x0, y0, x1, y1)
FLOOR = [(14, 373, 197), (259, 375, 194), (479, 375, 193), (694, 375, 193), (909, 373, 195), (1122, 375, 193), (1336, 375, 194)]
GLOW = [(20, 612, 200), (258, 616, 194), (479, 615, 194), (693, 615, 195), (910, 614, 195), (1122, 616, 193), (1336, 616, 193)]
BOX = [(10, 872, 230, 949), (259, 870, 454, 951), (479, 873, 670, 948), (693, 869, 885, 952), (908, 872, 1100, 949), (1122, 873, 1312, 949), (1335, 873, 1527, 948)]
FW, FH = 1200, 768         # 바닥 (10 : 6.4)
BW, BH = 1536, 264         # 함 바닥 (11 : 1.9)
EMBLEM = 0.27              # 가운데 문양 반지름 (한 변 대비)
# 목록 미리보기 테두리 색 (skins.js TRAY_STYLE 의 rail · trim 과 같게)
FRAME = {'marble': ('#E9DFCB', '#D4A443'), 'royal': ('#7E1222', '#FFC83D'), 'deepsea': ('#1E4A52', '#D8B45A'), 'demon': ('#15101C', '#B36BFF'),
         'sakura': ('#A8744A', '#F5A8C0'), 'lava': ('#2B2422', '#FF7A1A'), 'starry': ('#161C52', '#E6C35C')}


# 가운데 문양 반지름 (한 변 대비) — 바늘이 긴 나침반·별은 넓게
EMBLEM_R = {'marble': 0.40, 'deepsea': 0.37}


def floor_fit(sq, er=EMBLEM):
    """1) 정사각 그림에서 가운데 문양을 지운 바탕을 만든다 (작게 줄여 inpaint → 다시 키움: 부드러운 바탕)
    2) 그 바탕을 가로로 늘리고 (둘레 링은 타원이 된다) 3) 문양을 원래 비율로 다시 얹는다.
    문양까지 같이 늘리면 원래 문양 양옆에 늘어난 문양의 잔상(왕관 날개 · 달 그림자)이 비쳤다."""
    n = 256
    small = np.asarray(sq.resize((n, n), Image.LANCZOS)).copy()
    hole = np.zeros((n, n), np.uint8)
    cv2.circle(hole, (n // 2, n // 2), int(n * (er + 0.03)), 255, -1)
    fill = Image.fromarray(cv2.inpaint(small, hole, 9, cv2.INPAINT_TELEA)).resize(sq.size, Image.BICUBIC)
    c, r = sq.width // 2, int(sq.width * (er + 0.03))
    mm = Image.new('L', sq.size, 0)
    ImageDraw.Draw(mm).ellipse([c - r, c - r, c + r, c + r], fill=255)
    clean = sq.copy(); clean.paste(fill, (0, 0), mm.filter(ImageFilter.GaussianBlur(r * 0.15)))
    base = clean.resize((FW, FH), Image.LANCZOS)
    mid = sq.resize((FH, FH), Image.LANCZOS)                      # 원래 비율
    r = int(FH * er)
    m = Image.new('L', (FH, FH), 0)
    ImageDraw.Draw(m).ellipse([FH // 2 - r, FH // 2 - r, FH // 2 + r, FH // 2 + r], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(r * 0.22))
    base.paste(mid, ((FW - FH) // 2, 0), m)
    return base


# 함 바닥 사이 무늬 잇는 법: 'mirror' 좌우로 번갈아 뒤집기 (테두리·꽃 장식이 대칭이라 자연스럽다)
#   'band' (y 위치) 같은 트레이 바닥에서 띠를 떼어 깔고, 위·아래 테두리선과 끝·가운데 장식만 시안에서 얹는다
#          (돌·물결처럼 불규칙한 무늬는 작은 조각을 되풀이하면 반복이 티 난다)
BOX_JOIN = {'deepsea': ('band', 0.70), 'lava': ('band', 0.08)}


def box_band(strip, floor, yf, edge=0.085, feather=50):
    s = strip.resize((round(strip.width * BH / strip.height), BH), Image.LANCZOS)
    W = s.width
    bh = round(FW * BH / BW)                                   # 바닥에서 떼어 낼 띠 높이 (가로 800 → 1024 비율)
    y0 = min(FH - bh, max(0, round(yf * FH)))
    out = floor.crop((0, y0, FW, y0 + bh)).resize((BW, BH), Image.LANCZOS)
    e = round(BH * edge)                                       # 위·아래 테두리선 (가로로 늘려도 선이라 자연스럽다)
    for y in (0, BH - e):
        band = s.crop((round(W * 0.3), y, round(W * 0.7), y + e)).resize((BW, e), Image.LANCZOS)
        m = Image.linear_gradient('L').resize((BW, e))
        if y == 0: m = ImageOps.flip(m)
        out.paste(band, (0, y), m.point(lambda v: min(255, v * 2)))
    def put(part, x, left_soft, right_soft):
        m = Image.new('L', part.size, 255)
        g = Image.linear_gradient('L').rotate(90).resize((feather, BH))
        if left_soft: m.paste(g, (0, 0))
        if right_soft: m.paste(ImageOps.mirror(g), (part.width - feather, 0))
        out.paste(part, (x, 0), m)
    L = s.crop((0, 0, round(W * 0.22), BH)); R = s.crop((round(W * 0.78), 0, W, BH)); C = s.crop((round(W * 0.37), 0, round(W * 0.63), BH))
    put(L, 0, False, True); put(R, BW - R.width, True, False); put(C, (BW - C.width) // 2, True, True)
    return out


def box_fit(strip, join='mirror'):
    """끝 장식 · 가운데 장식은 그대로, 그 사이는 원래 무늬 조각을 좌우로 번갈아 뒤집어 이어 붙인다.
    (예전처럼 한 조각을 길게 늘이면 무늬가 가로로 뭉개져 보였다)
    조각 수를 홀수로 맞춰 양쪽 끝이 원래 방향이 되게 해서 이웃 장식과 이음매가 맞는다."""
    s = strip.resize((round(strip.width * BH / strip.height), BH), Image.LANCZOS)
    W = s.width
    cut = [0, 0.22, 0.37, 0.63, 0.78, 1.0]                          # 끝 장식 | 사이 | 가운데 장식 | 사이 | 끝 장식
    parts = [s.crop((round(cut[i] * W), 0, round(cut[i + 1] * W), BH)) for i in range(5)]
    fixed = parts[0].width + parts[2].width + parts[4].width
    fills = [(BW - fixed) // 2, BW - fixed - (BW - fixed) // 2]
    def tile_blend(seg, F, ov=36):
        # 조각을 겹쳐(ov px) 이어 붙이고 겹친 곳은 서서히 섞는다. 첫 조각은 왼쪽 이웃과, 마지막은 오른쪽 이웃과 이어지게
        out = Image.new('RGB', (F, BH)); step = seg.width - ov
        n = max(1, -(-(F - ov) // step))
        xs = [round(k * (F - seg.width) / max(1, n - 1)) for k in range(n)] if n > 1 else [0]
        ramp = Image.linear_gradient('L').rotate(90).resize((ov, BH))   # 왼쪽 0 → 오른쪽 255
        for k, x in enumerate(xs):
            piece = seg if x + seg.width <= F else seg.crop((0, 0, F - x, BH))
            if k == 0: out.paste(piece, (x, 0)); continue
            m = Image.new('L', piece.size, 255); m.paste(ramp.crop((0, 0, min(ov, piece.width), BH)), (0, 0))
            out.paste(piece, (x, 0), m)
        return out
    def tile(seg, F):
        if join == 'blend': return tile_blend(seg, F)
        n = max(1, round(F / seg.width))
        if n % 2 == 0: n += 1 if F / seg.width > n else -1
        n = max(1, n)
        w = F / n
        out = Image.new('RGB', (F, BH)); x = 0
        for k in range(n):
            ww = round(w * (k + 1)) - round(w * k)
            piece = seg.resize((ww, BH), Image.LANCZOS)
            out.paste(piece if k % 2 == 0 else ImageOps.mirror(piece), (x, 0)); x += ww
        return out
    parts[1] = tile(parts[1], fills[0])
    parts[3] = tile(parts[3], fills[1])
    out = Image.new('RGB', (BW, BH)); x = 0
    for p in parts: out.paste(p, (x, 0)); x += p.width
    return out


def recolor(im, shift, sat=1.0):
    """색상만 돌린다 (밝기·무늬는 그대로) — 마왕성: 붉은 불꽃 → 보랏빛"""
    h, s_, v = im.convert('HSV').split()
    h = h.point(lambda x: (x + shift) % 256)
    if sat != 1.0: s_ = s_.point(lambda x: min(255, int(x * sat)))
    return Image.merge('HSV', (h, s_, v)).convert('RGB')


# 시안에서 색만 바꿀 스킨: (색상 이동 0~255, 채도 배율)
RECOLOR = {'demon': (192, 0.9)}


def thumb(floor, id_):
    # 목록 그림 256×192 (폰 화면에서 또렷하게 — 화면에는 그 절반 크기로 보인다)
    rail, trim = FRAME[id_]
    c = Image.new('RGB', (256, 192), rail)
    d = ImageDraw.Draw(c)
    d.rectangle([6, 6, 249, 185], fill=trim); d.rectangle([12, 12, 243, 179], fill=rail)
    c.paste(floor.resize((216, 152), Image.LANCZOS), (20, 20))
    return c


def main():
    sheet = Image.open(SHEET).convert('RGB')
    for i, id_ in enumerate(IDS):
        d = os.path.join(OUT, id_); os.makedirs(d, exist_ok=True)
        def src(kind, box):
            f = os.path.join(HIRES, f'{id_}_{kind}.webp')
            return Image.open(f).convert('RGB') if os.path.exists(f) else sheet.crop(box)
        er = EMBLEM_R.get(id_, EMBLEM)
        x, y, s = FLOOR[i]; fl = floor_fit(src('floor', (x, y, x + s, y + s)), er)
        x, y, s = GLOW[i]; gl = floor_fit(src('glow', (x, y, x + s, y + s)), er)
        j = BOX_JOIN.get(id_, 'mirror')
        bx = box_band(src('box', BOX[i]), fl, j[1]) if isinstance(j, tuple) else box_fit(src('box', BOX[i]), j)
        if id_ in RECOLOR:
            fl, gl, bx = (recolor(im, *RECOLOR[id_]) for im in (fl, gl, bx))
        fl.save(os.path.join(d, 'floor.webp'), quality=90, method=6)
        gl.save(os.path.join(d, 'glow.webp'), quality=88, method=6)
        bx.save(os.path.join(d, 'box.webp'), quality=90, method=6)
        thumb(fl, id_).save(os.path.join(d, 'thumb.webp'), quality=90, method=6)
        print(id_, 'ok')


if __name__ == '__main__':
    main()
