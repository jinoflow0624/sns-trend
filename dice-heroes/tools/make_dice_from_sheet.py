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
    'heart':     dict(cy=67,  side=102, rim='bl', finish=dict(amp=0.10, line=(255, 235, 240, 0.45))),
    'keycap':    dict(cy=186, box=(-47, -40, 47, 40), redraw=True, finish=dict(amp=0.07, line=(255, 255, 255, 0.5))),   # 눈이 있는 윗면만 (가운데 기준). 판이 가로로 길어 눈을 다시 얹는다
    'clear':     dict(cy=315, side=112, finish=dict(amp=0.16, line=(200, 230, 255, 0.55), r0=0.125)),
    'minimal':   dict(cy=435, side=108, rim='bl', finish=dict(amp=0.05, line=(255, 255, 255, 0.5))),
    'gold':      dict(cy=556, side=108, rim='bl', finish=dict(amp=0.18, line=(255, 236, 160, 0.5))),
    'cosmic':    dict(cy=676, side=112, finish=dict(amp=0.14, line=(170, 140, 255, 0.55), base=(46, 22, 92), keep=0.6)),
    'black':     dict(cy=799, side=110, finish='obsidian'),
    'openheart': dict(cy=938, side=120),
}


# 눈 색 (그 칸 주사위 바탕과 구별되는 색)
def pip_mask(name, b):
    r, g, bl = b[..., 0], b[..., 1], b[..., 2]
    s, mn = r + g + bl, np.minimum(np.minimum(r, g), bl)
    return {'heart': (r > 150) & (g < 90) & (bl < 120), 'keycap': s < 160, 'minimal': s < 160,
            'clear': (r > 165) & (g > 175) & (bl > 190),     # 유리구슬 전체 (반사광만 잡으면 중심이 왼쪽 위로 쏠렸다)
            'cosmic': mn > 205, 'black': mn > 190, 'gold': (s < 260) & (r < 140),
            'openheart': (r > 235) & (g > 205) & (bl > 150)}[name]


def face_center(arr, name, c):
    """눈 v개(가장 큰 덩어리 v개 — 반사광·리벳은 작아서 빠진다)의 가운데. 못 찾으면 칸의 기본 위치"""
    cx, cy, R = CX[c], SKINS[name]['cy'], 40
    m = pip_mask(name, arr[cy - R:cy + R, cx - R:cx + R]).astype(np.uint8)
    if name == 'clear': m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))   # 구슬 안 무늬로 구멍 난 곳을 메운다
    k, _, st, cen = cv2.connectedComponentsWithStats(m)
    # 투명: 둥근 덩어리만 (가로세로 비슷하고 상자를 꽤 채우는 것) — 유리 테두리의 반사광 줄무늬는 빠진다
    round_ = lambda i: st[i, 4] >= 25 and (name != 'clear' or (0.6 < st[i, 2] / max(1, st[i, 3]) < 1.6 and st[i, 4] / (st[i, 2] * st[i, 3]) > 0.5))
    blobs = sorted(((st[i, 4], cen[i]) for i in range(1, k) if round_(i)), key=lambda t: -t[0])[:c + 1]
    if len(blobs) < c + 1: return cx, cy
    return (float(np.mean([p[0] for _, p in blobs])) + cx - R, float(np.mean([p[1] for _, p in blobs])) + cy - R)


def cell_box(name, c):
    cx, cy = CX[c], SKINS[name]['cy']
    return (cx - CELL, cy - CELL, cx + CELL, cy + CELL)


# 바깥쪽 어두운 띠(시안 렌더의 외곽선 · 모서리 그림자)를 이만큼(한 변 대비) 안쪽으로 잘라 낸다.
# 이 띠가 남아 있으면 3D 주사위의 둥근 모서리에 감겨 검은 테두리처럼 보였다 (모서리 음영은 3D 가 직접 만든다)
TRIM = {'heart': 0.055, 'clear': 0.055, 'minimal': 0.035, 'gold': 0.065, 'cosmic': 0.04, 'black': 0.035, 'openheart': 0.03, 'keycap': 0.0}


def crop_face(sheet, arr, name, c):
    p = SKINS[name]
    cx, cy = face_center(arr, name, c)
    t = TRIM.get(name, 0.0)
    if 'box' in p:
        l, tp, r, b = p['box']
        box = (cx + l, cy + tp, cx + r, cy + b)
    else:
        h = p['side'] / 2 * (1 - 2 * t)
        box = (cx - h, cy - h, cx + h, cy + h)
    hi = os.path.join(HIRES, f'{name}_{c + 1}.webp')
    if os.path.exists(hi):                                   # 4배 키운 칸에서 같은 자리를 오린다
        x0, y0, _, _ = cell_box(name, c)
        big = Image.open(hi).convert('RGB')
        crop = big.crop(tuple(round((v - o) * SCALE) for v, o in zip(box, (x0, y0, x0, y0))))
        if p.get('redraw'):
            face = symmetric_rim(redraw_pips(name, crop, c + 1, sheet, arr), p.get('rim', 'tl'), t)
            return clean_rim(face, **p['finish'], key=name) if isinstance(p.get('finish'), dict) else face
        face = symmetric_rim(crop.resize((SIZE, SIZE), Image.LANCZOS), p.get('rim', 'tl'), t)
        f = p.get('finish')
        return obsidian(face) if f == 'obsidian' else clean_rim(face, **f, key=name) if f else face
    face = sheet.crop(tuple(int(round(v)) for v in box)).resize((SIZE, SIZE), Image.LANCZOS)
    face = symmetric_rim(face, p.get('rim', 'tl'), t)
    return face.filter(ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2))


# skins.js 와 같은 눈 배치 (면 비율)
PIP_POS = {
    1: [(.5, .5)], 2: [(.27, .27), (.73, .73)], 3: [(.27, .27), (.5, .5), (.73, .73)],
    4: [(.27, .27), (.73, .27), (.27, .73), (.73, .73)],
    5: [(.27, .27), (.73, .27), (.5, .5), (.27, .73), (.73, .73)],
    6: [(.27, .25), (.73, .25), (.27, .5), (.73, .5), (.27, .75), (.73, .75)],
}


def dark_pips(a):
    return (a.sum(2) < 200).astype(np.uint8)


_PIP = {}
def pip_sprite_of(name, sheet, arr):
    """1 면 가운데 눈을 원래 비율 그대로 오린 RGBA 조각과, 판 가로폭 대비 눈 지름"""
    if name in _PIP: return _PIP[name]
    p = SKINS[name]; cx, cy = face_center(arr, name, 0); x0, y0, _, _ = cell_box(name, 0)
    l, t, r, b = p['box']
    big = Image.open(os.path.join(HIRES, f'{name}_1.webp')).convert('RGB')
    crop = np.asarray(big.crop(tuple(round((v - o) * SCALE) for v, o in zip((cx + l, cy + t, cx + r, cy + b), (x0, y0, x0, y0))))).copy()
    k, _, st, cen = cv2.connectedComponentsWithStats(dark_pips(crop))
    i = 1 + int(np.argmax(st[1:, 4]))
    d = (st[i, 2] + st[i, 3]) / 2
    R = int(d * 0.72)                                       # 눈 둘레의 옅은 그림자까지
    px, py = int(cen[i][0]), int(cen[i][1])
    sp = crop[py - R:py + R, px - R:px + R]
    m = np.zeros((2 * R, 2 * R), np.float32); cv2.circle(m, (R, R), int(R * 0.92), 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), R * 0.08)
    rgba = Image.fromarray(np.dstack([sp, (m * 255).astype(np.uint8)]), 'RGBA')
    _PIP[name] = (rgba, d / crop.shape[1], R / d)
    return _PIP[name]


def redraw_pips(name, crop, v, sheet, arr):
    """판이 정사각이 아니라서(키캡 94×80) 그대로 늘리면 눈이 길쭉해진다 →
    눈을 지운 판(inpaint)만 정사각으로 늘리고, 원래 비율의 동그란 눈을 표준 자리(PIP_POS)에 다시 얹는다"""
    a = np.asarray(crop).copy()
    hole = cv2.dilate(dark_pips(a), np.ones((25, 25), np.uint8))
    base = Image.fromarray(cv2.inpaint(a, hole, 9, cv2.INPAINT_TELEA)).resize((SIZE, SIZE), Image.LANCZOS)
    sprite, dfrac, rr = pip_sprite_of(name, sheet, arr)
    D = dfrac * SIZE
    S2 = int(round(D * rr * 2))
    sp = sprite.resize((S2, S2), Image.LANCZOS)
    for fx, fy in PIP_POS[v]:
        base.paste(sp, (int(round(fx * SIZE - S2 / 2)), int(round(fy * SIZE - S2 / 2))), sp)
    return base


_RIM_BASE = {}


def clean_rim(face, amp=0.1, line=(255, 255, 255, 0.5), base=None, r0=0.10, soft=0.035, keep=0.0, key=None):
    """테두리 띠를 시안 렌더(반사광 얼룩 · 무지갯빛 번짐 · 두 겹 선)에서 깔끔한 베벨로 바꾼다.
    바탕색(테두리 바로 안쪽의 중간값, 또는 base)에 왼쪽 위는 밝고 오른쪽 아래는 어두운 음영(amp)을 주고,
    가장자리 안쪽에 가는 광택선(line: r,g,b,세기) 하나. 눈이 있는 안쪽은 원본 그대로"""
    a = np.asarray(face).astype(np.float32)
    n = a.shape[0]
    i = (np.arange(n) + 0.5) / n
    dx, dy = np.meshgrid(i - 0.5, i - 0.5)
    d = 0.5 - np.maximum(np.abs(dx), np.abs(dy))                   # 가장자리까지 거리 (네모)
    rc = CORNER                                                     # 모서리 둥근 판 기준 거리 (광택선이 모서리에서 둥글게 돈다)
    kx = np.maximum(np.abs(dx) - (0.5 - rc), 0); ky = np.maximum(np.abs(dy) - (0.5 - rc), 0)
    dr = np.where((kx > 0) & (ky > 0), rc - np.sqrt(kx ** 2 + ky ** 2), d)
    if base is None:                                                # 1 면(테두리 바로 안쪽에 눈이 없다)에서 재고, 같은 스킨의 다른 면도 그 색으로
        band = (d > r0 + 0.01) & (d < r0 + 0.05)
        base = _RIM_BASE.setdefault(key, np.median(a[band], 0))
    base = np.array(base, np.float32)
    wx = np.exp((np.abs(dx) - 0.5) / 0.05); wy = np.exp((np.abs(dy) - 0.5) / 0.05)
    nx, ny = np.sign(dx) * wx, np.sign(dy) * wy
    nl = np.sqrt(nx ** 2 + ny ** 2) + 1e-6
    light = -(nx + ny) / nl / np.sqrt(2)                            # 바깥쪽이 왼쪽 위를 향하면 +1
    prof = np.clip((r0 - d) / r0, 0, 1)
    shade = 1 + amp * light * (0.4 + 0.6 * prof)
    flat = np.broadcast_to(base, a.shape)
    if keep:                                                        # 무늬는 남기고 밝은 번짐만 눌러서 (우주)
        tex = np.minimum(a, base * 1.7)
        flat = flat * (1 - keep) + tex * keep
    synth = flat * shade[..., None]
    lr, lg, lb, la = line
    ln = np.exp(-((dr - 0.032) / 0.0065) ** 2) * la * (0.65 + 0.35 * np.clip(light, 0, 1))
    synth = synth * (1 - ln[..., None]) + np.array([lr, lg, lb], np.float32) * ln[..., None]
    m = np.clip((r0 + soft - d) / soft, 0, 1)[..., None]
    out = a * (1 - m) + synth * m
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def obsidian(face):
    """블랙: 시안의 하얀 유리 테두리를 흑요석처럼 — 테두리 띠는 거의 검게 눌러 아주 옅은 푸른 광택만 남기고,
    가장자리 안쪽에 가는 광택선 하나를 그어 각진 돌 느낌을 낸다. 바탕은 조금 더 어둡게, 하얀 눈은 그대로"""
    a = np.asarray(face).astype(np.float32)
    n = a.shape[0]
    i = np.arange(n); d = np.minimum(i, n - 1 - i) / n
    dist = np.minimum(d[:, None], d[None, :])
    rim = np.clip((0.15 - dist) / 0.03, 0, 1)[..., None]          # 0.12 안쪽은 테두리, 0.15 까지 섞임
    lum = a.mean(2, keepdims=True)
    dark = np.concatenate([lum * 0.16 + 6, lum * 0.17 + 7, lum * 0.20 + 10], 2)   # 검정 + 아주 옅은 남색 광
    body = a * 0.82                                                # 바탕 대리석 결도 조금 더 깊게
    white = (a.min(2, keepdims=True) > 175).astype(np.float32)     # 눈(하얀 구슬)은 그대로
    out = body * (1 - rim) + dark * rim
    out = out * (1 - white * (1 - rim)) + a * white * (1 - rim)
    line = np.exp(-((dist - 0.035) / 0.006) ** 2)[..., None]       # 가는 광택선
    out = out + line * np.array([24, 26, 34], np.float32)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


RIM, RIM_SOFT, CORNER = 0.12, 0.05, 0.13     # 테두리 띠 폭 · 섞이는 폭 · 모서리 둥글기 (한 변 대비)


def symmetric_rim(face, src='tl', trim=0.0):
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
    # 바깥 어두운 띠를 잘라 낸 만큼(trim) 같은 테두리가 그림에서 차지하는 비율도 달라진다 → 띠 폭을 맞춰 줄인다 (눈과 겹치지 않게)
    rim, soft = (RIM - trim) / (1 - 2 * trim), RIM_SOFT / (1 - 2 * trim)
    m = np.clip((rim + soft - dist) / soft, 0, 1)[..., None]
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
