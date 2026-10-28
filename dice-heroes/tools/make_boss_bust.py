"""보스 상반신 그림 (체력바 옆 칸) — assets/boss/<id>.webp(512) 에서 머리 · 어깨를 정사각으로 잘라 256px 로.

  python3 tools/make_boss_bust.py   → assets/boss/<id>_bust.webp

전신 그림은 보스가 공격할 때 크게 나오는 연출에만 쓴다 (app.js bossActor). 자리(BOX)는 512px 그림 기준 (왼쪽, 위, 한 변).
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, '..', 'assets', 'boss')
# 얼굴 중심 (512px 그림 기준 x, y)과 잘라낼 한 변. 둥근 초상화 메달 가운데에 얼굴이 오게 (키클롭스 눈동자는 오른쪽 영웅 쪽으로 옮겨 그렸다)
FACE = {
    'dragon':    (296, 220, 210),
    'orc':       (266, 238, 210),
    'lich':      (256, 230, 210),
    'hydra':     (262, 238, 330),   # 머리 셋이 다 들어가게 넓게
    'cyclops':   (290, 218, 210),
    'overlord':  (264, 234, 210),
    'demon':     (254, 196, 180),
    'archdemon': (244, 192, 180),
}
BOX = {i: (cx - n // 2, cy - n // 2, n) for i, (cx, cy, n) in FACE.items()}
for i, (x, y, n) in BOX.items():
    im = Image.open(os.path.join(D, f'{i}.webp')).convert('RGBA')
    b = Image.new('RGBA', (n, n)); b.alpha_composite(im.crop((x, y, x + n, y + n)))   # 그림 밖은 투명
    b = b.resize((256, 256), Image.LANCZOS)
    p = os.path.join(D, f'{i}_bust.webp')
    b.save(p, 'WEBP', quality=92, method=6)
    print(i, os.path.getsize(p))
