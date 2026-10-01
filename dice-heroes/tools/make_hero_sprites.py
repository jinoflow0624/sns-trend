"""직업 그림(512px 정사각, 검은 배경) → 게임용 투명 배경 PNG.

  python3 tools/make_hero_sprites.py            # tools/hero-src/*.png → assets/heroes/<직업>.webp

1) 테두리에서 이어진 검은 배경 + 순검정을 지운다 (외곽선은 아주 어두운 보라라 검정과 구분된다)
2) 그림 둘레를 잘라 정사각 캔버스에 담는다 — 발끝은 바닥에서 조금 위, 가로는 가운데
3) SIZE px 로 부드럽게 줄인다. 화면에서는 .spr-hi 로 부드럽게 그린다 (마왕 그림과 같은 방식)

도트 칸에 맞춰 단순화(격자 맞춤 · 색 줄이기)도 해 봤지만, AI 그림은 칸 크기가 고르지 않아
얼굴·주사위 눈 같은 작은 부분이 깨졌다. 원본을 그대로 줄인 쪽이 28px 초상화에서도 더 또렷했다.
"""
import os, glob
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'hero-src')
OUT = os.path.join(HERE, '..', 'assets', 'heroes')
SIZE = 320

def cut(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    h, w, _ = a.shape
    s = a.sum(2)
    dark = s < 75
    bg = np.zeros((h, w), bool)
    stack = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while stack:
        y, x = stack.pop()
        if 0 <= y < h and 0 <= x < w and dark[y, x] and not bg[y, x]:
            bg[y, x] = True
            stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    fg = ~(bg | (s < 48))
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    ch, cw = y1 - y0, x1 - x0
    N = int(max(ch, cw) * 1.06)
    img = np.zeros((N, N, 4), np.uint8)
    oy = N - ch - int(N * 0.02); ox = (N - cw) // 2
    img[oy:oy + ch, ox:ox + cw, :3] = a[y0:y1, x0:x1]
    img[oy:oy + ch, ox:ox + cw, 3] = fg[y0:y1, x0:x1] * 255
    im = Image.fromarray(img, 'RGBA')
    # 투명 칸의 색이 번져 테두리가 검게 뜨지 않게, 미리 곱한 알파로 줄인다
    im = im.convert('RGBa').resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
    return im

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        name = os.path.splitext(os.path.basename(f))[0]
        out = os.path.join(OUT, name + '.webp')
        cut(f).save(out, lossless=True, method=6)
        print(name, os.path.getsize(out) // 1024, 'KB')

if __name__ == '__main__':
    main()
