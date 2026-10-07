"""보스 그림 원본(tools/boss-src/<id>.webp, 무손실)을 게임용으로 맞춘다 → assets/boss/<id>.webp

도트화는 하지 않는다. 투명 여백을 잘라 같은 크기 · 같은 발밑 줄에 맞추고,
알파를 곱한 채로 고품질(Lanczos) 축소해 가장자리가 검게 번지거나 계단지지 않게 한다.
화면에서는 .spr-hi(부드럽게 줄임)로 보인다.

게임 중 보스 칸(68px)과 알림에는 상반신 그림(<id>_bust.webp)을 쓴다. 얼굴을 중심으로
정사각형으로 자르고, 잘린 가장자리(특히 아래)는 알파를 서서히 줄여 네모 테두리가 보이지 않게 한다.

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
# 상반신: 얼굴 위치(512px 그림에서의 비율 x, y). 한 변 BUST_SIDE, 얼굴이 위에서 BUST_FACE 지점에 오게
BUST = {
    'dragon': (.50, .29), 'orc': (.46, .22), 'lich': (.51, .29), 'hydra': (.48, .25),
    'cyclops': (.53, .31), 'overlord': (.50, .29), 'demon': (.50, .22), 'archdemon': (.52, .23),
}
BUST_SIDE, BUST_FACE, BUST_OUT = .56, .34, 288   # 288 ≈ 잘라 낸 크기 (키우지 않는다)
FADE = dict(bottom=.30, side=.12, top=.06)   # 가장자리에서 투명해지는 폭 (한 변 대비)
CORNER = 1.3
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
    bust(name, can)
    print(name, size)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def bust(name, im):
    fx, fy = BUST[name]
    side = round(SIZE * BUST_SIDE)
    x0 = min(max(0, round(SIZE * fx - side / 2)), SIZE - side)
    y0 = min(max(0, round(SIZE * fy - side * BUST_FACE)), SIZE - side)
    a = np.array(im.crop((x0, y0, x0 + side, y0 + side))).astype(np.float32)
    u = (np.arange(side) + .5) / side
    m = (smooth(u / FADE['top'])[:, None] * smooth((1 - u) / FADE['bottom'])[:, None]
         * smooth(u / FADE['side'])[None, :] * smooth((1 - u) / FADE['side'])[None, :])
    # 네 모서리도 둥글게 (가운데에서 모서리까지 1.41 — 1.0부터 줄여 모서리는 투명)
    r = np.hypot(*np.meshgrid((u - .5) / .5, (u - .5) / .5))
    m *= smooth((CORNER - r) / (CORNER - 1))
    a[..., 3] *= m
    out = Image.fromarray(a.clip(0, 255).astype(np.uint8)).resize((BUST_OUT, BUST_OUT), Image.LANCZOS)
    out.save(OUT / f'{name}_bust.webp', quality=QUALITY, alpha_quality=100, method=6)


if __name__ == '__main__':
    for n in sys.argv[1:] or IDS:
        fit(n)
