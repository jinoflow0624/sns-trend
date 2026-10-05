"""주사위 스킨 면 텍스처 — 디자인 시트 한 장(tools/dice-src/sheet-v2.webp)에서 오려 낸다.

  python3 tools/make_dice_from_sheet.py        →  assets/dice/<스킨>/<1~6>.webp (512×512)
  필요: pip install pillow numpy opencv-python-headless

시트는 1536×1024, 8줄(스킨) × 6칸(1~6면). 칸마다 주사위 앞면의 가운데를 정사각형으로 오려 512px 로 만든다.
시트 한 칸이 약 110px 라 먼저 upscale_dice_sheet.py 로 4배 키운 칸(tools/dice-src/dice-hires/)에서 오린다 (없으면 시트에서 바로). 그림에 음영·반사가 이미 들어 있어서 따로 손대지 않는다.
키캡은 사다리꼴 옆면을 빼고 눈이 있는 윗면(오목한 판)만 쓴다.

가운데는 칸마다 눈(점)의 무게중심으로 잡는다 — 시트의 주사위가 칸마다 몇 px 씩 어긋나 있어서, 같은 좌표로 자르면
한쪽은 둥근 모서리·배경이 보이고 반대쪽은 잘려 상하좌우가 비대칭으로 보였다 (눈 배치는 1~6 모두 가운데 대칭).
"""
import os
import numpy as np
import cv2
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, 'dice-src', 'sheet-v2.webp')
OUT = os.path.join(HERE, '..', 'assets', 'dice')
HIRES = os.path.join(HERE, 'dice-src', 'dice-hires')   # upscale_dice_sheet.py 로 4배 키운 칸 (있으면 이걸 쓴다)
SCALE = 4
CELL = 74                     # 칸의 기본 가운데에서 둘레로 이만큼 (키워 둘 영역)
SIZE = 512

# 칸의 가운데 x (1~6면). 시트의 격자는 간격이 조금씩 달라서 실측했다
CX = [553, 714, 876, 1041, 1207, 1369]
# 스킨: 줄 번호 → (주사위 앞면 가운데 y, 오려 낼 한 변, 가로 어긋남)
#   한 변은 주사위 앞면 폭(약 110px)에 대한 픽셀 수. 모서리 둥근 바깥(배경)이 안 들어오게 조금 안쪽으로 잡는다
SKINS = {   # rim: 테두리를 대칭으로 만들 때 쓸 1/4 ('tl' 왼쪽 위 · 'bl' 왼쪽 아래)
    'heart':     dict(cy=67,  side=102, rim='bl'),
    'keycap':    dict(cy=186, box=(-47, -40, 47, 40)),     # 눈이 있는 윗면만 (가운데 기준 상대 좌표)
    'clear':     dict(cy=315, side=112),
    'minimal':   dict(cy=435, side=108, rim='bl'),
    'gold':      dict(cy=556, side=108, rim='bl'),
    'cosmic':    dict(cy=676, side=112),
    'black':     dict(cy=799, side=110),
    'openheart': dict(cy=938, side=120),
}


# 눈 색 (그 칸 주사위 바탕과 구별되는 색)
def pip_mask(name, b):
    r, g, bl = b[..., 0], b[..., 1], b[..., 2]
    s, mn = r + g + bl, np.minimum(np.minimum(r, g), bl)
    return {'heart': (r > 150) & (g < 90) & (bl < 120), 'keycap': s < 160, 'minimal': s < 160, 'clear': mn > 215,
            'cosmic': mn > 205, 'black': mn > 190, 'gold': (s < 260) & (r < 140),
            'openheart': (r > 235) & (g > 205) & (bl > 150)}[name]


def face_center(arr, name, c):
    """눈 v개(가장 큰 덩어리 v개 — 반사광·리벳은 작아서 빠진다)의 가운데. 못 찾으면 칸의 기본 위치"""
    cx, cy, R = CX[c], SKINS[name]['cy'], 40
    m = pip_mask(name, arr[cy - R:cy + R, cx - R:cx + R]).astype(np.uint8)
    k, _, st, cen = cv2.connectedComponentsWithStats(m)
    blobs = sorted(((st[i, 4], cen[i]) for i in range(1, k) if st[i, 4] >= 25), key=lambda t: -t[0])[:c + 1]
    if len(blobs) < c + 1: return cx, cy
    return (float(np.mean([p[0] for _, p in blobs])) + cx - R, float(np.mean([p[1] for _, p in blobs])) + cy - R)


def cell_box(name, c):
    cx, cy = CX[c], SKINS[name]['cy']
    return (cx - CELL, cy - CELL, cx + CELL, cy + CELL)


def crop_face(sheet, arr, name, c):
    p = SKINS[name]
    cx, cy = face_center(arr, name, c)
    if 'box' in p:
        l, t, r, b = p['box']
        box = (cx + l, cy + t, cx + r, cy + b)
    else:
        h = p['side'] / 2
        box = (cx - h, cy - h, cx + h, cy + h)
    hi = os.path.join(HIRES, f'{name}_{c + 1}.webp')
    if os.path.exists(hi):                                   # 4배 키운 칸에서 같은 자리를 오린다
        x0, y0, _, _ = cell_box(name, c)
        big = Image.open(hi).convert('RGB')
        face = big.crop(tuple(round((v - o) * SCALE) for v, o in zip(box, (x0, y0, x0, y0)))).resize((SIZE, SIZE), Image.LANCZOS)
        return symmetric_rim(face, p.get('rim', 'tl'))
    face = sheet.crop(tuple(int(round(v)) for v in box)).resize((SIZE, SIZE), Image.LANCZOS)
    face = symmetric_rim(face, p.get('rim', 'tl'))
    return face.filter(ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2))


RIM, RIM_SOFT, CORNER = 0.12, 0.05, 0.13     # 테두리 띠 폭 · 섞이는 폭 · 모서리 둥글기 (한 변 대비)


def symmetric_rim(face, src='tl'):
    """시트의 주사위는 살짝 비스듬해서 테두리 광택·두께가 한쪽으로 쏠려 있다.
    바깥 테두리 띠만 왼쪽 위 1/4 을 상하좌우로 뒤집어 붙여 대칭으로 만든다 (평균을 내면 테두리선이 두 겹으로 흐려졌다) (눈이 있는 안쪽은 그대로 —
    눈은 가장자리에서 한 변의 0.19 안쪽부터라 띠와 겹치지 않는다).
    둥근 모서리 바깥(시트의 배경)은 이웃 색으로 메워 3D 주사위 모서리에 검은 점이 생기지 않게 한다."""
    a = np.asarray(face).astype(np.float32)
    n = a.shape[0]
    h = n // 2
    # 왼쪽 위 1/4 (빛을 받는 쪽이라 테두리가 가장 또렷하다) 을 네 방향으로 뒤집어 붙인다.
    # rim='bl': 윗변에 윗면 눈이 살짝 비치는 스킨(하트·미니멀·황금)은 왼쪽 아래 1/4 을 쓴다
    q = a[:h, :h] if src == 'tl' else a[n - h:, :h][::-1]
    sym = np.empty_like(a)
    sym[:h, :h] = q; sym[:h, n - h:] = q[:, ::-1]; sym[n - h:, :h] = q[::-1]; sym[n - h:, n - h:] = q[::-1, ::-1]
    i = np.arange(n)
    d = np.minimum(i, n - 1 - i) / n                                  # 가장자리까지 거리
    dist = np.minimum(d[:, None], d[None, :])
    m = np.clip((RIM + RIM_SOFT - dist) / RIM_SOFT, 0, 1)[..., None]
    out = (a * (1 - m) + sym * m).clip(0, 255).astype(np.uint8)
    r = int(n * CORNER)
    hole = np.zeros((n, n), np.uint8)
    cv2.rectangle(hole, (0, 0), (n - 1, n - 1), 255, -1)
    keep = np.zeros((n, n), np.uint8)
    cv2.rectangle(keep, (r, 0), (n - 1 - r, n - 1), 255, -1); cv2.rectangle(keep, (0, r), (n - 1, n - 1 - r), 255, -1)
    for cx, cy in ((r, r), (n - 1 - r, r), (r, n - 1 - r), (n - 1 - r, n - 1 - r)):
        cv2.circle(keep, (cx, cy), r, 255, -1)
    out = cv2.inpaint(out, cv2.subtract(hole, keep), 5, cv2.INPAINT_TELEA)
    return Image.fromarray(out)


def main():
    sheet = Image.open(SHEET).convert('RGB')
    arr = np.asarray(sheet).astype(int)
    for name in SKINS:
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        for c in range(6):
            crop_face(sheet, arr, name, c).save(os.path.join(d, f'{c + 1}.webp'), quality=92, method=6)
        print(name, 'ok')


if __name__ == '__main__':
    main()
