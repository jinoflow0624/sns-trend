"""보스 상반신 그림 (체력바 옆 칸) — assets/boss/<id>.webp(512) 에서 머리 · 어깨를 정사각으로 잘라 256px 로.

  python3 tools/make_boss_bust.py   → assets/boss/<id>_bust.webp

전신 그림은 보스가 공격할 때 크게 나오는 연출에만 쓴다 (app.js bossActor). 자리(BOX)는 512px 그림 기준 (왼쪽, 위, 한 변).
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, '..', 'assets', 'boss')
BOX = {   # 머리를 가운데 · 조금 위에 두고 어깨까지 (키클롭스 눈동자는 오른쪽 영웅 쪽으로 옮겨 그렸다)
    'dragon':    (150, 48, 236),
    'orc':       (192, 72, 256),
    'lich':      (150, 60, 236),
    'hydra':     (76, 70, 360),     # 머리 셋이 다 보이게 넓게
    'cyclops':   (160, 46, 256),
    'overlord':  (140, 100, 236),
    'demon':     (140, 46, 236),
    'archdemon': (140, 46, 236),
}
for i, (x, y, n) in BOX.items():
    im = Image.open(os.path.join(D, f'{i}.webp')).convert('RGBA')
    b = im.crop((x, y, x + n, y + n)).resize((256, 256), Image.LANCZOS)
    p = os.path.join(D, f'{i}_bust.webp')
    b.save(p, 'WEBP', quality=92, method=6)
    print(i, os.path.getsize(p))
