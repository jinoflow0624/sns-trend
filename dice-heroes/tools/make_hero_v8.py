"""직업 그림 v8 (도트 원화 · 16프레임 모션) → 게임용 webp.

  python3 tools/make_hero_v8.py

tools/hero-v8/ 에 원본 도트를 둔다 (픽셀 원래 크기):
  full/<id>.png    전신 96×96 (발끝은 바닥에서 약 4px 위)
  bust/<id>.png    상반신 96×80 (작은 초상화 칸 — 28~48px 에서도 얼굴이 읽힌다). 둘레 여백이 커서
                   머리 가운데를 기준으로 48×48 정사각(얼굴 · 모자 · 어깨)으로 잘라 쓴다 (아홉 직업 같은 높이 · 같은 크기)
  motion/<id>.png  모션 시트 512×512 = 128×128 칸 4×4 (0~3 대기 · 4~11 공격 · 12~15 피격). 기준점(발밑) (56,116), 오른쪽을 본다
→ assets/heroes/<id>.webp · <id>_bust.webp 는 4배(가장 가까운 점)로 키워 저장한다 — 화면에서 부드럽게 줄여도 도트가 번지지 않는다.
  <id>_motion.webp 는 원래 크기 그대로 (캔버스에 정수 배율 없이 도트로 그린다 · motion.js).
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'hero-v8')
OUT = os.path.join(HERE, '..', 'assets', 'heroes')
IDS = ['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper']

def bust_square(im, N=48, top=16):
    import numpy as np
    a = np.asarray(im)[:, :, 3] > 0
    head = a[top:top + 20]                      # 머리 쪽 줄만 보고 가로 가운데를 잡는다 (무기 · 소품에 끌려가지 않게)
    xs = np.nonzero(head.any(0))[0]
    cx = (xs.min() + xs.max()) // 2
    x0 = max(0, min(im.width - N, cx - N // 2))
    return im.crop((x0, top, x0 + N, top + N))

def save(im, path):
    im.save(path, 'WEBP', lossless=True, quality=100, method=6)
    return os.path.getsize(path)

for i in IDS:
    full = Image.open(os.path.join(SRC, 'full', f'{i}.png')).convert('RGBA')
    bust = Image.open(os.path.join(SRC, 'bust', f'{i}.png')).convert('RGBA')
    mo = Image.open(os.path.join(SRC, 'motion', f'{i}.png')).convert('RGBA')
    assert full.size == (96, 96) and bust.size == (96, 80) and mo.size == (512, 512), i
    a = save(full.resize((384, 384), Image.NEAREST), os.path.join(OUT, f'{i}.webp'))
    b = save(bust_square(bust).resize((288, 288), Image.NEAREST), os.path.join(OUT, f'{i}_bust.webp'))
    c = save(mo, os.path.join(OUT, f'{i}_motion.webp'))
    print(i, a, b, c)
