"""원정 로딩 화면 걷기 스프라이트 → assets/run/fx/walk_<id>.webp (지금 적 그림 assets/run/<id>.webp 에서 만든다)

    python3 tools/make_walk_sprites.py

적 그림은 64×64 도트(8px 블록)라서, 도트 격자로 내려 다리 · 몸을 옮기고 다시 2배로 올린다 (프레임 128px, 4프레임 가로 = 512×128).
- goblin: 굼바처럼 왼발 · 오른발을 번갈아 들고, 발을 들 때 몸이 1도트 들썩
- slime : 주저앉기 → 늘어나며 뛰기 → 공중 → 착지
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'run'
OUT = ROOT / 'assets' / 'run' / 'fx'
G, S = 64, 2


def grid(id_):
    a = np.array(Image.open(SRC / f'{id_}.webp').convert('RGBA'))
    return a[4::8, 4::8].copy()          # 8px 블록 가운데 = 도트 하나


def paste(dst, src, dx=0, dy=0, mask=None):
    """src 의 칠한 칸을 (dx, dy) 만큼 옮겨 dst 위에 덮는다"""
    m = src[..., 3] > 0 if mask is None else mask & (src[..., 3] > 0)
    ys, xs = np.where(m)
    ty, tx = ys + dy, xs + dx
    ok = (ty >= 0) & (ty < G) & (tx >= 0) & (tx < G)
    dst[ty[ok], tx[ok]] = src[ys[ok], xs[ok]]


def goblin():
    a = grid('goblin')
    yy, xx = np.mgrid[0:G, 0:G]
    SY, SX = 44, 34                      # 다리가 시작하는 줄 · 왼다리 | 오른다리 경계
    upper, legL, legR = yy < SY, (yy >= SY) & (xx < SX), (yy >= SY) & (xx >= SX)
    frames = []
    for lift_l, lift_r, bob in ((2, 0, 1), (0, 0, 0), (0, 2, 1), (0, 0, 0)):
        f = np.zeros_like(a)
        paste(f, a, 0, -lift_l, legL)
        paste(f, a, 0, -lift_r, legR)
        paste(f, a, 0, -bob, upper)
        frames.append(f)
    return frames


def resample(a, sx, sy):
    """도트 격자 그대로 가로 sx · 세로 sy 배 (발밑 · 가운데 기준)"""
    al = a[..., 3] > 0
    ys, xs = np.where(al)
    cx, by = (xs.min() + xs.max()) / 2, ys.max()
    out = np.zeros_like(a)
    yy, xx = np.mgrid[0:G, 0:G]
    srcx = np.round(cx + (xx - cx) / sx).astype(int)
    srcy = np.round(by - (by - yy) / sy).astype(int)
    ok = (srcx >= 0) & (srcx < G) & (srcy >= 0) & (srcy < G)
    out[ok] = a[srcy[ok], srcx[ok]]
    return out


def slime():
    a = grid('slime')
    frames = []
    for sx, sy, up in ((1.12, 0.84, 0), (0.92, 1.1, 3), (1.0, 1.0, 6), (1.04, 0.95, 0)):
        f = np.zeros_like(a)
        paste(f, resample(a, sx, sy), 0, -up)
        frames.append(f)
    return frames


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (('goblin', goblin), ('slime', slime)):
        sheet = np.concatenate(fn(), axis=1)
        Image.fromarray(sheet, 'RGBA').resize((G * 4 * S, G * S), Image.NEAREST).save(OUT / f'walk_{name}.webp', lossless=True, method=6)
        print(name, (OUT / f'walk_{name}.webp').stat().st_size // 1024, 'KB')
