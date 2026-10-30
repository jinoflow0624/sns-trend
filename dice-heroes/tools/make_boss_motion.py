# 보스 40프레임 모션 시트 → 게임용 (assets/boss/<id>_motion.webp)
#   python3 tools/make_boss_motion.py <boss_motion_complete 폴더>
# 받은 시트: 640px 칸 4열 × 10행 (원본 생성 그림은 약 198px 칸을 최근접으로 키운 것) · 기준점(발밑) (260, 600)
# 게임용: 256px 칸 (원본 해상도 약 198px 보다 크게 — 디테일은 그대로) · 기준점 (104, 240) · webp
# 다듬기: 칸 가장자리에 붙은 작은 조각(이웃 칸에서 넘어온 부스러기)을 지운다. 반투명 가장자리의 검은 테두리 번짐도 정리
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'boss')
IDS = ['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon']
C0, C1, COLS, ROWS = 640, 256, 4, 10

def clean(cell):
    a = np.array(cell)
    alpha = a[..., 3]
    mask = alpha > 12
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        total = sizes.sum()
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        for k in range(1, n + 1):
            s = sizes[k - 1]
            # 가장자리에 닿은 작은 조각 · 아주 작은 먼지 조각
            if (k in edge and s < total * 0.04) or s < 40:
                a[lab == k, 3] = 0
    a[a[..., 3] <= 12, 3] = 0
    return Image.fromarray(a)

for id in IDS:
    sheet = Image.open(os.path.join(SRC, f'{id}_motion.png')).convert('RGBA')
    out = Image.new('RGBA', (C1 * COLS, C1 * ROWS), (0, 0, 0, 0))
    for f in range(COLS * ROWS):
        x, y = (f % COLS) * C0, (f // COLS) * C0
        cell = clean(sheet.crop((x, y, x + C0, y + C0)))
        # 미리 곱한 알파로 줄여야 반투명 가장자리가 검게 번지지 않는다
        cell = cell.convert('RGBa').resize((C1, C1), Image.LANCZOS).convert('RGBA')
        out.paste(cell, ((f % COLS) * C1, (f // COLS) * C1))
    p = os.path.join(OUT, f'{id}_motion.webp')
    out.save(p, 'WEBP', quality=86, method=6, alpha_quality=90)
    print(id, os.path.getsize(p) // 1024, 'KB')
