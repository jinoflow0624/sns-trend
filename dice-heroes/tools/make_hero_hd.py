"""직업 그림 HD (선화 원화 · 32프레임 모션) → 게임용 webp. 받은 묶음 크기의 약 1/4.

  python3 tools/make_hero_hd.py <묶음 폴더>     # hero_hd_half_motion_v1 를 푼 폴더 (fullbody/ upper_body/ motion/)

→ assets/heroes/<id>.webp         전신 512×512 정사각 (발끝은 바닥에서 2% 위 · 가로 가운데). 선택 다이얼 · 메뉴 · 결과 화면
  assets/heroes/<id>_bust.webp    상반신에서 머리 둘레를 정사각으로 192px. 28~48px 작은 초상화 칸
  assets/heroes/<id>_motion.webp  모션 시트: 512칸을 384칸으로 줄여 4열 × 8행 (0~3 대기 · 4~11 공격 · 12~15 피격 · 16~23 승리 · 24~31 패배).
                                  기준점(발밑) 512칸의 (232,476) → 384칸의 (174,357). 오른쪽을 본다. motion.js 가 캔버스에 부드럽게 그린다
원본(PNG · Aseprite)은 묶음에 그대로 두고 저장소에는 넣지 않는다 (모션 PNG 만 30MB).
"""
import os, sys
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'heroes')
IDS = ['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper']
FRAME_IN, FRAME = 512, 384

def save(im, name, q):
    p = os.path.join(OUT, name)
    im.save(p, 'WEBP', quality=q, method=6, alpha_quality=90)
    return os.path.getsize(p)

def bbox(im):
    a = np.asarray(im)[:, :, 3] > 16
    ys, xs = np.nonzero(a)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, a

tot = [0, 0, 0]
for i in IDS:
    full = Image.open(os.path.join(SRC, 'fullbody', f'{i}.png')).convert('RGBA')
    x0, y0, x1, y1, _ = bbox(full)
    fig = full.crop((x0, y0, x1, y1))
    N = int(max(fig.width, fig.height) * 1.04)
    sq = Image.new('RGBA', (N, N))
    sq.alpha_composite(fig, ((N - fig.width) // 2, N - fig.height - int(N * 0.02)))
    tot[0] += save(sq.resize((512, 512), Image.LANCZOS), f'{i}.webp', 86)

    up = Image.open(os.path.join(SRC, 'upper_body', f'{i}.png')).convert('RGBA')
    x0, y0, x1, y1, a = bbox(up)
    H = y1 - y0
    head = a[y0:y0 + int(H * 0.42)]
    xs = np.nonzero(head.any(0))[0]
    cx = (xs.min() + xs.max()) // 2
    n = int(H * 0.78)
    left = max(0, min(up.width - n, cx - n // 2)); top = max(0, y0 - int(n * 0.04))
    b = Image.new('RGBA', (n, n)); b.alpha_composite(up.crop((left, top, left + n, min(up.height, top + n))), (0, 0))
    tot[1] += save(b.resize((192, 192), Image.LANCZOS), f'{i}_bust.webp', 88)

    mo = Image.open(os.path.join(SRC, 'motion', 'sheets', f'{i}.png')).convert('RGBA')
    assert mo.size == (FRAME_IN * 4, FRAME_IN * 8), mo.size
    tot[2] += save(mo.resize((FRAME * 4, FRAME * 8), Image.LANCZOS), f'{i}_motion.webp', 84)
    print(i)
print('full', tot[0], 'bust', tot[1], 'motion', tot[2])
