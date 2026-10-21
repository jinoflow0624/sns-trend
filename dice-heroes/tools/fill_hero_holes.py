"""직업 그림 안쪽의 투명한 구멍을 메운다 (해금 연출 · 잠긴 직업의 검은 실루엣에 구멍이 비치지 않게).

  python3 tools/fill_hero_holes.py        # assets/heroes/<직업>.webp 를 그 자리에서 고친다 (여러 번 돌려도 같다)

- 바깥(배경)과 이어지지 않은 투명 칸 = 구멍 (눈 · 입 · 안경알 · 지팡이와 몸 사이 등)
  → 그 그림의 외곽선 색(가장 많이 쓴 어두운 색)으로 채운다. 눈 · 입 · 안경알은 원래 어두운 색이라 자연스럽다
  → 춤꾼의 리본 고리 안쪽처럼 큰 구멍은 OVR 의 색(머리카락 색)으로 채운다
- 바깥에서 2px 넘게 안쪽에 있는 반투명 칸(칸 사이 이음매)은 불투명하게 한다. 바깥 가장자리의 부드러운 테두리는 그대로
make_hero_sprites.py 로 그림을 새로 만들었으면 이것도 다시 돌린다.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, '..', 'assets', 'heroes')
IDS = ['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper']
OVR = {'dancer': (0x60, 0x28, 0x40)}   # 1000칸이 넘는 큰 구멍에 쓸 색
BIG = 1000

def dil(m):
    o = m.copy(); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]; return o

def outside(free):
    r = np.zeros_like(free); r[0] = free[0]; r[-1] = free[-1]; r[:, 0] = free[:, 0]; r[:, -1] = free[:, -1]
    while True:
        n = dil(r) & free
        if (n == r).all(): return r
        r = n

def comps(m):
    m = m.copy(); H, W = m.shape; out = []
    for y, x in zip(*np.nonzero(m)):
        if not m[y, x]: continue
        st = [(y, x)]; m[y, x] = False; px = []
        while st:
            a, b = st.pop(); px.append((a, b))
            for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                if 0 <= c < H and 0 <= d < W and m[c, d]: m[c, d] = False; st.append((c, d))
        out.append(np.array(px))
    return out

def fix(name):
    path = os.path.join(DIR, name + '.webp')
    im = np.array(Image.open(path).convert('RGBA')).astype(float)
    a = im[:, :, 3]; rgb = im[:, :, :3]
    op = a > 250; lum = rgb.mean(2)
    d = rgb[op & (lum < 45)].astype(int) // 4 * 4
    u, c = np.unique(d, axis=0, return_counts=True); dark = u[c.argmax()].astype(float)
    solid = a >= 128; out = outside(~solid); hole = ~solid & ~out
    fillc = np.zeros_like(rgb); fillc[:] = dark
    for comp in comps(hole):
        fillc[comp[:, 0], comp[:, 1]] = OVR[name] if len(comp) > BIG and name in OVR else dark
    near = out.copy()
    for _ in range(2): near = dil(near)
    semi = ~near & (a < 255)
    al = (a / 255)[:, :, None]
    mix = rgb * al + fillc * (1 - al)
    rgb[semi] = mix[semi]; a[semi] = 255
    rgb[hole] = fillc[hole]; a[hole] = 255
    Image.fromarray(np.dstack([rgb, a]).clip(0, 255).astype(np.uint8), 'RGBA').save(path, lossless=True)
    print(name, '구멍', int(hole.sum()), '이음매', int(semi.sum()))

if __name__ == '__main__':
    for n in IDS: fix(n)
