"""트레이 스킨 그림 — 디자인 시트 한 장(tools/dice-src/tray-sheet-v2.webp)에서 오려 게임 트레이 모양에 맞춘다.

  python3 tools/make_trays_from_sheet.py     →  assets/trays/<스킨>/{floor,glow,box,thumb}.webp
  필요: pip install pillow numpy

시트는 7칸(CLASSIC · ROYAL · DEEPSEA · DEMON · SAKURA · LAVA · STARRY) × (바닥 · 발광 지도 · 주사위 함 바닥).
게임 트레이 바닥은 정사각이 아니라 10 : 6.4 라서
  바닥·발광: 그림 전체를 가로로 늘린 위에, 가운데 문양만 원래 비율로 다시 얹는다 (문양이 납작해지지 않게, 둘레는 부드럽게 섞음)
  함 바닥:   양 끝 장식과 가운데 장식은 그대로 두고 그 사이 테두리만 늘린다 (11 : 1.9)
시트의 CLASSIC 은 게임의 '기본'(초록 펠트)과 따로 '클래식(marble)' 스킨이 된다.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, 'dice-src', 'tray-sheet-v2.webp')
OUT = os.path.join(HERE, '..', 'assets', 'trays')

IDS = ['marble', 'royal', 'deepsea', 'demon', 'sakura', 'lava', 'starry']
# 칸마다 실측한 위치 (x0, y0, 한 변) — 바닥 · 발광 지도는 정사각, 함 바닥은 (x0, y0, x1, y1)
FLOOR = [(14, 373, 197), (259, 375, 194), (479, 375, 193), (694, 375, 193), (909, 373, 195), (1122, 375, 193), (1336, 375, 194)]
GLOW = [(20, 612, 200), (258, 616, 194), (479, 615, 194), (693, 615, 195), (910, 614, 195), (1122, 616, 193), (1336, 616, 193)]
BOX = [(10, 872, 230, 949), (259, 870, 454, 951), (479, 873, 670, 948), (693, 869, 885, 952), (908, 872, 1100, 949), (1122, 873, 1312, 949), (1335, 873, 1527, 948)]
FW, FH = 800, 512          # 바닥 (10 : 6.4)
BW, BH = 1024, 176         # 함 바닥 (11 : 1.9)
EMBLEM = 0.27              # 가운데 문양 반지름 (한 변 대비)
# 목록 미리보기 테두리 색 (skins.js TRAY_STYLE 의 rail · trim 과 같게)
FRAME = {'marble': ('#E9DFCB', '#D4A443'), 'royal': ('#7E1222', '#FFC83D'), 'deepsea': ('#1E4A52', '#D8B45A'), 'demon': ('#231417', '#FF3B22'),
         'sakura': ('#A8744A', '#F5A8C0'), 'lava': ('#2B2422', '#FF7A1A'), 'starry': ('#161C52', '#E6C35C')}


def floor_fit(sq):
    base = sq.resize((FW, FH), Image.LANCZOS)                     # 전체를 가로로 늘림 (둘레 링은 타원이 된다)
    mid = sq.resize((FH, FH), Image.LANCZOS)                      # 원래 비율
    r = int(FH * EMBLEM)
    m = Image.new('L', (FH, FH), 0)
    ImageDraw.Draw(m).ellipse([FH // 2 - r, FH // 2 - r, FH // 2 + r, FH // 2 + r], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(r * 0.22))
    base.paste(mid, ((FW - FH) // 2, 0), m)
    return base.filter(ImageFilter.UnsharpMask(radius=1.2, percent=50, threshold=2))


def box_fit(strip):
    s = strip.resize((round(strip.width * BH / strip.height), BH), Image.LANCZOS)
    W = s.width
    cut = [0, 0.22, 0.37, 0.63, 0.78, 1.0]                          # 끝 장식 | 늘림 | 가운데 장식 | 늘림 | 끝 장식
    parts = [s.crop((round(cut[i] * W), 0, round(cut[i + 1] * W), BH)) for i in range(5)]
    fixed = parts[0].width + parts[2].width + parts[4].width
    fill = (BW - fixed) / 2
    parts[1] = parts[1].resize((round(fill), BH), Image.LANCZOS)
    parts[3] = parts[3].resize((BW - fixed - parts[1].width, BH), Image.LANCZOS)
    out = Image.new('RGB', (BW, BH)); x = 0
    for p in parts: out.paste(p, (x, 0)); x += p.width
    return out


def thumb(floor, id_):
    rail, trim = FRAME[id_]
    c = Image.new('RGB', (128, 96), rail)
    d = ImageDraw.Draw(c)
    d.rectangle([3, 3, 124, 92], fill=trim); d.rectangle([6, 6, 121, 89], fill=rail)
    c.paste(floor.resize((108, 76), Image.LANCZOS), (10, 10))
    return c


def main():
    sheet = Image.open(SHEET).convert('RGB')
    for i, id_ in enumerate(IDS):
        d = os.path.join(OUT, id_); os.makedirs(d, exist_ok=True)
        x, y, s = FLOOR[i]; fl = floor_fit(sheet.crop((x, y, x + s, y + s)))
        x, y, s = GLOW[i]; gl = floor_fit(sheet.crop((x, y, x + s, y + s)))
        bx = box_fit(sheet.crop(BOX[i]))
        fl.save(os.path.join(d, 'floor.webp'), quality=90, method=6)
        gl.save(os.path.join(d, 'glow.webp'), quality=88, method=6)
        bx.save(os.path.join(d, 'box.webp'), quality=90, method=6)
        thumb(fl, id_).save(os.path.join(d, 'thumb.webp'), quality=90, method=6)
        print(id_, 'ok')


if __name__ == '__main__':
    main()
