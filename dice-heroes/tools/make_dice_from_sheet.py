"""주사위 스킨 면 텍스처 — 디자인 시트 한 장(tools/dice-src/sheet-v2.webp)에서 오려 낸다.

  python3 tools/make_dice_from_sheet.py        →  assets/dice/<스킨>/<1~6>.webp (256×256)
  필요: pip install pillow numpy

시트는 1536×1024, 8줄(스킨) × 6칸(1~6면). 칸마다 주사위 앞면의 가운데를 정사각형으로 오려
256px 로 키운다(시트 한 칸이 약 110px 라 조금 부드럽다). 그림에 음영·반사가 이미 들어 있어서 따로 손대지 않는다.
키캡은 사다리꼴 옆면을 빼고 눈이 있는 윗면(오목한 판)만 쓴다.
"""
import os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, 'dice-src', 'sheet-v2.webp')
OUT = os.path.join(HERE, '..', 'assets', 'dice')
SIZE = 256

# 칸의 가운데 x (1~6면). 시트의 격자는 간격이 조금씩 달라서 실측했다
CX = [553, 714, 876, 1041, 1207, 1369]
# 스킨: 줄 번호 → (주사위 앞면 가운데 y, 오려 낼 한 변, 가로 어긋남)
#   한 변은 주사위 앞면 폭(약 110px)에 대한 픽셀 수. 모서리 둥근 바깥(배경)이 안 들어오게 조금 안쪽으로 잡는다
SKINS = {
    'heart':     dict(cy=66,  side=94,  dx=-3),
    'keycap':    dict(cy=186, box=(-46, -42, 46, 34)),     # 눈이 있는 윗면만 (가운데 기준 상대 좌표)
    'clear':     dict(cy=315, side=108, dx=0),
    'minimal':   dict(cy=435, side=102, dx=-2),
    'gold':      dict(cy=556, side=102, dx=-2),
    'cosmic':    dict(cy=676, side=106, dx=0),
    'black':     dict(cy=799, side=106, dx=0),
    'openheart': dict(cy=938, side=116, dx=0),
}


def crop_face(sheet, name, c):
    p = SKINS[name]
    cx = CX[c] + p.get('dx', 0)
    if 'box' in p:
        l, t, r, b = p['box']
        box = (cx + l, p['cy'] + t, cx + r, p['cy'] + b)
    else:
        h = p['side'] / 2
        box = (cx - h, p['cy'] - h, cx + h, p['cy'] + h)
    face = sheet.crop(tuple(int(round(v)) for v in box)).resize((SIZE, SIZE), Image.LANCZOS)
    return face.filter(ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2))


def main():
    sheet = Image.open(SHEET).convert('RGB')
    for name in SKINS:
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        for c in range(6):
            crop_face(sheet, name, c).save(os.path.join(d, f'{c + 1}.webp'), quality=92, method=6)
        print(name, 'ok')


if __name__ == '__main__':
    main()
