# 주사위 스킨 면 텍스처 만들기 — 디자인 렌더(tools/dice-src/*.webp)에서 눈(또는 숫자)을 지운 바탕을 만들고,
# 그 렌더에서 오려 낸 눈(또는 새로 새긴 숫자)을 1~6 배치로 다시 얹는다.
#   python3 tools/make_dice_textures.py   →  assets/dice/<스킨>/<1~6>.webp (256×256)
# 필요: pip install numpy opencv-python-headless pillow
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'dice-src')
OUT = os.path.join(HERE, '..', 'assets', 'dice')
SIZE = 256

# skins.js 와 같은 눈 배치 (면 비율)
PIP_POS = {
    1: [(.5, .5)], 2: [(.27, .27), (.73, .73)], 3: [(.27, .27), (.5, .5), (.73, .73)],
    4: [(.27, .27), (.73, .27), (.27, .73), (.73, .73)],
    5: [(.27, .27), (.73, .27), (.5, .5), (.27, .73), (.73, .73)],
    6: [(.27, .25), (.73, .25), (.27, .5), (.73, .5), (.27, .75), (.73, .75)],
}


def load(name):
    im = cv2.imread(os.path.join(SRC, name + '.webp'), cv2.IMREAD_UNCHANGED)
    return im[:, :, :3].copy()


def feather_circle(h, w, cx, cy, r, soft):
    m = np.zeros((h, w), np.float32)
    cv2.circle(m, (int(cx), int(cy)), int(r), 1.0, -1)
    k = int(soft) * 2 + 1
    return cv2.GaussianBlur(m, (k, k), soft / 2)[:, :, None]


def fill_holes(img, holes, donors, r, soft=18):
    """눈 자리를 같은 크기의 다른(눈 없는) 자리 조각으로 덮는다. 경계는 부드럽게."""
    out = img.astype(np.float32)
    h, w = img.shape[:2]
    for (cx, cy), (dx, dy) in zip(holes, donors):
        R = int(r + soft)
        patch = out[dy - R:dy + R, dx - R:dx + R].copy()   # 앞에서 메운 결과를 다시 재료로 (이웃 눈 조각이 섞이지 않게)
        canvas = out.copy()
        canvas[cy - R:cy + R, cx - R:cx + R] = patch
        m = feather_circle(h, w, cx, cy, r + soft * 0.5, soft)
        out = out * (1 - m) + canvas * m
    return out.clip(0, 255).astype(np.uint8)


def pip_sprite(img, cx, cy, r):
    """렌더에서 눈 하나를 둥글게 오려 낸다 (가장자리 부드럽게)."""
    R = int(r)
    crop = img[cy - R:cy + R, cx - R:cx + R]
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    m = feather_circle(2 * R, 2 * R, R, R, R - 6, 6)[:, :, 0]
    rgba[:, :, 3] = (m * 255).astype(np.uint8)
    return rgba


def paste(base, sprite, cx, cy, size):
    s = cv2.resize(sprite, (size, size), interpolation=cv2.INTER_AREA)
    x0, y0 = int(cx - size / 2), int(cy - size / 2)
    roi = base[y0:y0 + size, x0:x0 + size].astype(np.float32)
    a = s[:, :, 3:4].astype(np.float32) / 255
    base[y0:y0 + size, x0:x0 + size] = (roi * (1 - a) + s[:, :, :3] * a).astype(np.uint8)


def save(skin, v, img):
    os.makedirs(os.path.join(OUT, skin), exist_ok=True)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    Image.fromarray(rgb).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, skin, f'{v}.webp'), quality=86, method=6)


def inpaint_holes(img, pips, r):
    """매끈한 면(황금)은 주변 색을 번져 채운다."""
    mask = np.zeros(img.shape[:2], np.uint8)
    for cx, cy in pips:
        cv2.circle(mask, (cx, cy), int(r), 255, -1)
    filled = cv2.inpaint(img, mask, 25, cv2.INPAINT_TELEA)
    soft = cv2.GaussianBlur(filled, (0, 0), 14)
    m = np.zeros(img.shape[:2], np.float32)
    for cx, cy in pips:
        cv2.circle(m, (cx, cy), int(r + 10), 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), 10)[:, :, None]
    return (img * (1 - m) + soft * m).clip(0, 255).astype(np.uint8)


def pip_skin(skin, crop, pips, r, donors, sprite_at, sprite_r, pip_frac, one_scale=1.35, post=None, smooth=False, soft=18):
    img = load(skin)
    x0, y0, x1, y1 = crop
    blank = inpaint_holes(img, pips, r) if smooth else fill_holes(img, pips, donors, r, soft)
    sprite = pip_sprite(img, *sprite_at, sprite_r)
    face = blank[y0:y1, x0:x1]
    face = cv2.resize(face, (1024, 1024), interpolation=cv2.INTER_AREA)
    if post:
        face = post(face)
    for v in range(1, 7):
        f = face.copy()
        for (px, py) in PIP_POS[v]:
            size = int(1024 * pip_frac * 2 * (one_scale if v == 1 else 1))
            paste(f, sprite, px * 1024, py * 1024, size)
        save(skin, v, f)


# ── 황금: 6 면 렌더. 눈 자리는 가운데 세로줄(눈 없음)의 같은 높이 조각으로 덮는다
def gold():
    pips = [(376, 355), (375, 629), (380, 905), (875, 357), (872, 631), (875, 905)]
    donors = [(626, y) for _, y in pips]
    pip_skin('gold', (76, 78, 1176, 1178), pips, 132, donors, (376, 355), 128, pip_frac=0.113, smooth=True)


# ── 우주: 6 면 렌더. 가운데 은하띠에서 조각을 가져와 덮는다
def cosmic():
    pips = [(375, 361), (375, 617), (375, 875), (879, 362), (877, 617), (874, 879)]
    donors = [(626, y) for _, y in pips]

    def sparkle(face):   # 덮은 자리에 작은 별을 조금 더 뿌려 매끈한 얼룩을 숨긴다
        rng = np.random.default_rng(7)
        for _ in range(160):
            x, y = rng.integers(20, 1004, 2)
            b = int(rng.integers(150, 255))
            cv2.circle(face, (int(x), int(y)), int(rng.choice([1, 1, 1, 2])), (b, b, 255), -1)
        return face
    pip_skin('cosmic', (104, 104, 1150, 1150), pips, 124, donors, (375, 617), 112, pip_frac=0.107, post=sparkle)


# ── 블랙: 5 면(정면) 렌더. 앞면만 잘라 쓰고, 눈 자리는 대리석 결이 비슷한 빈 곳에서 가져온다
def black():
    # 가운데 눈부터 메우고, 그 자리를 재료로 아래 두 눈을 메운다
    pips = [(627, 724), (381, 487), (872, 490), (385, 929), (867, 929)]
    donors = [(627, 487), (627, 487), (627, 490), (627, 929), (627, 929)]
    pip_skin('black', (190, 296, 1090, 1196), pips, 124, donors, (627, 724), 122, pip_frac=0.118, soft=12)


# ── 오픈하츠: 6 면(정면) 렌더를 통째로 쓰고, 가운데 숫자만 지운 뒤 같은 구리 질감으로 새 숫자를 새긴다
FONT = '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf'


def openheart():
    img = load('openheart')
    x0, y0, x1, y1 = 225, 345, 1035, 1155
    face = cv2.resize(img[y0:y1, x0:x1], (1024, 1024), interpolation=cv2.INTER_AREA)
    # 숫자·밑줄 = 가운데 원 안의 밝은 구리색 → 지우기(주변 기계장치로 메움)
    hsv = cv2.cvtColor(face, cv2.COLOR_BGR2HSV)
    cx, cy = 512, 505
    circ = np.zeros(face.shape[:2], np.uint8)
    cv2.ellipse(circ, (cx, cy), (175, 215), 0, 0, 360, 255, -1)
    copper = ((hsv[:, :, 1] > 70) & (hsv[:, :, 2] > 120)).astype(np.uint8) * 255
    mask = cv2.bitwise_and(copper, circ)
    mask = cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=2)
    blank = cv2.inpaint(face, mask, 9, cv2.INPAINT_TELEA)
    blank = cv2.GaussianBlur(blank, (0, 0), 1.2) * 0 + blank   # (그대로)
    # 새 숫자: 구리 질감(테두리 막대에서 떠 온 결) + 어두운 음각 테두리 + 밝은 윗모서리
    tex = cv2.resize(face[40:110, 150:870], (1024, 1024))   # 윗 가로 테
    tex = cv2.cvtColor(tex, cv2.COLOR_BGR2RGB)
    font = ImageFont.truetype(FONT, 400)
    for v in range(1, 7):
        base = Image.fromarray(cv2.cvtColor(blank, cv2.COLOR_BGR2RGB))
        # 숫자 아래 어두운 원판 (기계장치 앞에 숫자가 또렷하게)
        shade = Image.new('L', (1024, 1024), 0)
        ImageDraw.Draw(shade).ellipse((cx - 165, cy - 200, cx + 165, cy + 200), fill=120)
        shade = shade.filter(ImageFilter.GaussianBlur(40))
        base = Image.composite(Image.new('RGB', (1024, 1024), (22, 16, 12)), base, shade)
        m_in = Image.new('L', (1024, 1024), 0)
        d = ImageDraw.Draw(m_in)
        text = str(v)
        bb = d.textbbox((0, 0), text, font=font)
        tx = cx - (bb[0] + bb[2]) / 2
        ty = cy - (bb[1] + bb[3]) / 2 - 10
        d.text((tx, ty), text, font=font, fill=255)
        if v == 6:
            d.rectangle((cx - 95, cy + 185, cx + 95, cy + 205), fill=255)   # 6 밑줄 (렌더와 같게)
        m_out = m_in.filter(ImageFilter.MaxFilter(13))
        base.paste(Image.new('RGB', (1024, 1024), (30, 18, 10)), (0, 0), m_out)
        copper_img = Image.fromarray(tex)
        base.paste(copper_img, (0, 0), m_in)
        # 윗모서리 반짝임
        hi = Image.new('L', (1024, 1024), 0)
        hi.paste(m_in, (0, 0))
        edge = Image.eval(Image.fromarray(np.clip(np.array(m_in, np.int16) - np.roll(np.array(m_in, np.int16), 5, axis=0), 0, 255).astype(np.uint8)), lambda p: int(p * 0.7))
        base.paste(Image.new('RGB', (1024, 1024), (255, 214, 170)), (0, 0), edge)
        save('openheart', v, cv2.cvtColor(np.array(base), cv2.COLOR_RGB2BGR))


if __name__ == '__main__':
    gold()
    cosmic()
    black()
    openheart()
    print('done →', os.path.normpath(OUT))
