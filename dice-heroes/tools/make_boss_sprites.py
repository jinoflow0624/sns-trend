"""보스 그림 원본(tools/boss-src/<id>.webp, 무손실)을 게임용으로 맞춘다 → assets/boss/<id>.webp

도트화는 하지 않는다. 투명 여백을 잘라 같은 크기 · 같은 발밑 줄에 맞추고,
알파를 곱한 채로 고품질(Lanczos) 축소해 가장자리가 검게 번지거나 계단지지 않게 한다.
화면에서는 .spr-hi(부드럽게 줄임)로 보인다.

    python3 tools/make_boss_sprites.py            # 전부
    python3 tools/make_boss_sprites.py demon orc  # 일부
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'tools' / 'boss-src', ROOT / 'assets' / 'boss'
SIZE = 512
FIT = 480                     # 그림이 차지하는 최대 크기 (위·좌우 여백)
BOTTOM = 500                  # 발밑(받침) 줄
QUALITY = 92
IDS = ['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon']


def fit(name):
    im = Image.open(SRC / f'{name}.webp').convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    k = FIT / max(im.size)
    size = (max(1, round(im.width * k)), max(1, round(im.height * k)))
    # 알파를 곱해서 줄이고 다시 나눈다 (투명한 칸의 색이 가장자리에 스며들지 않게)
    a = np.array(im).astype(np.float32) / 255
    a[..., :3] *= a[..., 3:]
    ch = [np.array(Image.fromarray(a[..., i]).resize(size, Image.LANCZOS)) for i in range(4)]
    s = np.clip(np.stack(ch, -1), 0, 1)
    al = s[..., 3:]
    s[..., :3] = np.where(al > 1e-4, s[..., :3] / np.maximum(al, 1e-4), 0)
    small = Image.fromarray((np.clip(s, 0, 1) * 255 + 0.5).astype(np.uint8))
    can = Image.new('RGBA', (SIZE, SIZE))
    can.alpha_composite(small, ((SIZE - size[0]) // 2, BOTTOM - size[1]))
    OUT.mkdir(parents=True, exist_ok=True)
    can.save(OUT / f'{name}.webp', quality=QUALITY, alpha_quality=100, method=6)
    print(name, size)


if __name__ == '__main__':
    for n in sys.argv[1:] or IDS:
        fit(n)
