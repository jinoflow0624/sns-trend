"""원정 특수 주사위 4종의 3D 면 그림 → assets/run/dice/<id>_<1~6>.webp (512px, 기존 스킨 면 그림과 같은 규격)

    python3 tools/make_special_dice.py

면 그림에 음영이 들어 있다 (빛은 왼쪽 위). 재질 메모는 DICE 의 mat 항목 (dice3d 의 DIE_MAT 형식).
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'run' / 'dice'
N = 512
PIPS = {
    1: [(.5, .5)], 2: [(.27, .27), (.73, .73)], 3: [(.27, .27), (.5, .5), (.73, .73)],
    4: [(.27, .27), (.73, .27), (.27, .73), (.73, .73)],
    5: [(.27, .27), (.73, .27), (.5, .5), (.27, .73), (.73, .73)],
    6: [(.27, .25), (.73, .25), (.27, .5), (.73, .5), (.27, .75), (.73, .75)],
}
DICE = {
    # base: 바탕(밝음 → 어두움), pip: 눈, rim: 테두리 홈, mat: 3D 재질 메모
    'gold':  dict(base=('#FFF0A0', '#F2B630', '#A86A0C'), pip=('#5A3A1E', '#2A1408'), rim='#C8860E',
                  mat="{ roughness: 0.22, metalness: 0.75, env: 1.1, image: true }  // 금박: 강한 금속 반사"),
    'heavy': dict(base=('#DCE2EC', '#9AA4B8', '#4A5266'), pip=('#1A1030', '#05030C'), rim='#5A6478',
                  mat="{ roughness: 0.5, metalness: 0.85, env: 0.6, image: true }   // 납: 무광 금속, 묵직하게 (굴림 속도를 조금 느리게 하면 더 좋음)"),
    'twin':  dict(base=('#FFE4F3', '#FF9AD0', '#C2508E'), pip=('#7A1E5A', '#3A0828'), rim='#C2508E',
                  mat="{ roughness: 0.15, metalness: 0.0, env: 0.8, image: true, clear: true, selfGlow: 0.15 }  // 분홍 반투명"),
    'stair': dict(base=('#D9F7E4', '#3EE6B4', '#139B74'), pip=('#0F4A38', '#05241A'), rim='#139B74',
                  mat="{ roughness: 0.3, metalness: 0.05, env: 0.5, image: true }  // 민트 도자기"),
}


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)


def mix(a, b, t):
    return a + (b - a) * t[..., None]


def face(kind, v):
    d = DICE[kind]
    y, x = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1)
    hi, mid, lo = (hexrgb(c) for c in d['base'])
    # 빛: 왼쪽 위에서 오른쪽 아래로
    t = np.clip((x + y) / 2, 0, 1)
    img = np.where(t[..., None] < .5, mix(hi, mid, t / .5), mix(mid, lo, (t - .5) / .5))
    img = mix(img, mid, np.full_like(t, .35))
    # 둥근 모서리 테두리 홈 (안쪽 사각 띠)
    m = .055
    inner = (np.abs(x - .5) < .5 - m) & (np.abs(y - .5) < .5 - m)
    band = (np.abs(x - .5) < .5 - m + .012) & (np.abs(y - .5) < .5 - m + .012) & ~inner
    img[band] = img[band] * .55 + hexrgb(d['rim']) * .45
    if kind == 'heavy':
        # 솔질한 금속 결
        rng = np.random.default_rng(7 + v)
        lines = np.repeat(rng.normal(0, 1, (N, 1)), N, 1).astype(np.float32)
        img += lines[..., None] * 6
        for cx, cy in ((.1, .1), (.9, .1), (.1, .9), (.9, .9)):   # 모서리 리벳
            r2 = (x - cx) ** 2 + (y - cy) ** 2
            rv = r2 < .022 ** 2
            img[rv] = mix(hexrgb('#E4E9F2'), hexrgb('#3A4050'), np.clip((x[rv] - cx + y[rv] - cy) * 20 + .5, 0, 1))
    if kind == 'stair':
        # 오른쪽 아래 모서리의 계단 무늬
        for k in range(4):
            s = .12 + k * .05
            step = (x > 1 - m - s) & (y > 1 - m - .05 * (k + 1)) & inner
            img[step] = img[step] * .55 + hexrgb('#0F7A5C') * .45
    if kind == 'twin':
        # 비치는 둘째 주사위 눈 (살짝 어긋난 그림자)
        for px, py in PIPS[7 - v]:
            r2 = (x - px - .04) ** 2 + (y - py - .04) ** 2
            g = r2 < .07 ** 2
            img[g] = img[g] * .78 + hexrgb('#C2508E') * .22
    if kind == 'gold':
        # 대각선 광택 띠
        sheen = np.exp(-(((x - y) + .25) ** 2) / .004)
        img += sheen[..., None] * 60
    # 눈: 오목한 구
    pc, pd = hexrgb(d['pip'][0]), hexrgb(d['pip'][1])
    R = .085 if v != 1 else .12
    for px, py in PIPS[v]:
        dx, dy = x - px, y - py
        r = np.sqrt(dx * dx + dy * dy) / R
        pip = r < 1
        # 오목: 왼쪽 위 가장자리가 어둡고, 오른쪽 아래 안쪽에 빛
        shade = np.clip(.55 - (dx + dy) / R * .35, 0, 1)
        col = mix(pc, pd, shade)
        img[pip] = col[pip]
        ring = (r >= 1) & (r < 1.12)
        img[ring] = img[ring] * .6 + np.array([255, 255, 255], np.float32) * .25
        spec = ((x - px - R * .35) ** 2 + (y - py - R * .35) ** 2) < (R * .22) ** 2
        img[spec & pip] = img[spec & pip] * .4 + 255 * .6
        if kind == 'gold' and v == 1:
            pass
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for kind in DICE:
        for v in range(1, 7):
            face(kind, v).save(OUT / f'{kind}_{v}.webp', quality=88, method=6)
        print(kind, DICE[kind]['mat'])
