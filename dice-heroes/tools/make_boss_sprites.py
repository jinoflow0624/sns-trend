"""보스 그림(tools/boss-src/*.webp, 무손실)을 게임용 도트로 줄인다 → assets/boss/<id>.png

원본은 생성 그림이라 너무 촘촘해서, 보스 칸(68~96px)에서는 잔점이 뭉개져 화질이 나빠 보인다.
도트 한 칸을 굵게(GRID칸 격자) 만든다:
  1) 목표의 4배 크기로 줄여 경계 보존 평탄화로 미세 질감을 지운다
  2) 목표 크기로 평균 축소 → 살짝 샤픈
  3) Lab k-평균으로 COLORS색 (채도 축에 무게를 줘야 금빛 사슬·눈빛이 살아남는다)
  4) 외톨이 점 정리 → 바깥 테두리 한 칸 → SCALE배 최근접 확대

    python3 tools/make_boss_sprites.py            # 전부
    python3 tools/make_boss_sprites.py demon orc  # 일부
"""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'tools' / 'boss-src', ROOT / 'assets' / 'boss'
GRID, SCALE = 64, 8           # 64칸 × 8 = 512px
FIT = GRID - 4                # 그림이 차지하는 최대 칸
BOTTOM = GRID - 2             # 발밑(받침) 줄
COLORS = 32
CHROMA = 1.8                  # 색 묶을 때 채도(a·b) 가중치
SMOOTH = 2                    # 평탄화 횟수
SHARPEN = 0.6
OUTLINE = (26, 16, 48)        # #1A1030 · 다른 도트와 같은 외곽선 색
IDS = ['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon']


def area(pm, size):
    """알파를 곱한 채로 줄여야 가장자리가 검게 번지지 않는다"""
    pm = cv2.resize(pm, size, interpolation=cv2.INTER_AREA)
    al = pm[..., 3]
    rgb = np.where(al[..., None] > 1e-3, pm[..., :3] / np.maximum(al[..., None], 1e-3), 0)
    return np.clip(rgb, 0, 1).astype(np.float32), al


def pixelate(name):
    a = np.array(Image.open(SRC / f'{name}.webp').convert('RGBA'))
    box = Image.fromarray(a[..., 3]).point(lambda v: 255 if v > 24 else 0).getbbox()
    a = a[box[1]:box[3], box[0]:box[2]]
    h, w = a.shape[:2]
    k = FIT / max(w, h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    pm = a.astype(np.float32) / 255
    pm[..., :3] *= pm[..., 3:]
    # 1) 4배 크기에서 미세 질감 지우기
    rgb, al = area(pm, (nw * 4, nh * 4))
    rgb8 = (rgb * 255).astype(np.uint8)
    for _ in range(SMOOTH):
        rgb8 = cv2.bilateralFilter(rgb8, 7, 40, 5)
    # 2) 목표 크기로
    rgb, al = area(np.dstack([rgb8.astype(np.float32) / 255 * al[..., None], al]), (nw, nh))
    if SHARPEN:
        rgb = np.clip(rgb + SHARPEN * (rgb - cv2.GaussianBlur(rgb, (0, 0), 1.0)), 0, 1)
    # 3) 색 묶기
    solid = al > 0.5
    pts = (rgb[solid] * 255).astype(np.uint8)
    lab = cv2.cvtColor(pts.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    lab[:, 1:] = (lab[:, 1:] - 128) * CHROMA
    cv2.setRNGSeed(7)
    _, lbl, _ = cv2.kmeans(lab, COLORS, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 4, cv2.KMEANS_PP_CENTERS)
    lbl = lbl.reshape(-1)
    pal = np.array([np.median(pts[lbl == i], 0) if (lbl == i).any() else (0, 0, 0) for i in range(COLORS)], np.uint8)
    G = np.full((nh, nw), -1, int)
    G[solid] = lbl
    # 4) 외톨이 점(상하좌우에 같은 색이 없음)은 이웃 셋 이상이 같은 색이면 그 색으로
    P = np.pad(G, 1, constant_values=-1)
    N = np.stack([P[:-2, 1:-1], P[2:, 1:-1], P[1:-1, :-2], P[1:-1, 2:]], -1)
    out = G.copy()
    for y, x in zip(*np.nonzero((G >= 0) & ~(N == G[..., None]).any(-1))):
        v = N[y, x][N[y, x] >= 0]
        c = np.bincount(v) if len(v) else np.zeros(1, int)
        if c.max() >= 3:
            out[y, x] = c.argmax()
    G = out
    can = np.zeros((GRID, GRID, 4), np.uint8)
    x0, y0 = (GRID - nw) // 2, BOTTOM - nh
    sub = can[y0:y0 + nh, x0:x0 + nw]
    m = G >= 0
    sub[m, :3] = pal[G[m]]
    sub[m, 3] = 255
    on = can[..., 3] > 0
    p = np.pad(on, 1)
    can[(p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~on] = (*OUTLINE, 255)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(can).resize((GRID * SCALE,) * 2, Image.NEAREST).save(OUT / f'{name}.png', optimize=True)
    print(name, f'{nw}x{nh}칸')


if __name__ == '__main__':
    for n in sys.argv[1:] or IDS:
        pixelate(n)
