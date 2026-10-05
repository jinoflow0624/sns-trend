"""새 직업 그림 (무법자 · 타짜) — 40×40 도트를 코드로 그려 assets/heroes/<직업>.webp (320px, 8배) 로 뽑는다.

  python3 tools/draw_new_heroes.py

다른 직업 그림(assets/heroes, 40칸 남짓 도트 · 짙은 보라 외곽선 · 왼쪽 위 빛)과 같은 느낌으로 맞췄다.
도형(사각·타원·선)으로 색 면을 칠한 뒤, 바깥 둘레에 외곽선을 자동으로 두른다.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'heroes')
N, SCALE = 40, 8
INK = (26, 16, 48)

class Canvas:
    def __init__(self):
        self.px = {}
    def set(self, x, y, c):
        if 0 <= x < N and 0 <= y < N:
            self.px[(x, y)] = c
    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)
    def ell(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.set(x, y, c)
    def row(self, y, x0, x1, c):
        self.rect(x0, y, x1, y, c)
    def pts(self, c, *xy):
        for x, y in xy:
            self.set(x, y, c)
    def outline(self):
        add = {}
        for (x, y) in list(self.px):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in self.px and 0 <= q[0] < N and 0 <= q[1] < N:
                    add[q] = INK
        self.px.update(add)
    def save(self, name):
        im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            im.putpixel((x, y), (*c, 255))
        im = im.resize((N * SCALE, N * SCALE), Image.NEAREST)
        os.makedirs(OUT, exist_ok=True)
        out = os.path.join(OUT, name + '.webp')
        im.save(out, lossless=True, method=6)
        return im

hx = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
SKIN, SKIN2 = hx('#F7C9A0'), hx('#DE9A74')
WHITE = hx('#FFFFFF')

def outlaw():
    c = Canvas()
    HAT, HAT2, HAT3 = hx('#9A6232'), hx('#6B3E1E'), hx('#C08850')
    BAND = hx('#E08A3C')
    PON, PON2, PON3 = hx('#E08A3C'), hx('#A85A1E'), hx('#FFB86A')
    STR1, STR2 = hx('#FFC83D'), hx('#8E2226')
    RED, RED2 = hx('#D9463E'), hx('#8E2226')
    JEAN, JEAN2 = hx('#3A4A7A'), hx('#263258')
    BOOT, BOOT2 = hx('#6B3E26'), hx('#4A2A14')
    GUN, GUN2, GUNL = hx('#8A9AB0'), hx('#5A6478'), hx('#D8E4F0')
    HAIR = hx('#5A3420')
    # 다리 · 부츠
    c.rect(14, 29, 18, 35, JEAN); c.rect(21, 29, 25, 35, JEAN)
    c.rect(17, 29, 18, 35, JEAN2); c.rect(24, 29, 25, 35, JEAN2)
    c.rect(13, 35, 18, 38, BOOT); c.rect(21, 35, 26, 38, BOOT)
    c.row(38, 13, 18, BOOT2); c.row(38, 21, 26, BOOT2)
    c.pts(STR1, (12, 37), (27, 37))                               # 박차
    # 판초 (어깨에서 넓게 퍼진다)
    for i, y in enumerate(range(17, 30)):
        w = 6 + min(i, 7)
        c.row(y, 20 - w, 19 + w, PON)
    for y in range(17, 30):                                       # 오른쪽 그늘
        xs = [x for (x, yy) in c.px if yy == y]
        if xs:
            c.rect(max(xs) - 2, y, max(xs), y, PON2)
    c.row(23, 8, 31, STR1); c.row(24, 8, 31, STR2); c.row(27, 7, 32, STR1)   # 줄무늬
    for x in range(9, 31, 3):
        c.set(x, 24, STR1)
    c.row(29, 7, 32, PON2)
    for x in range(8, 32, 2):                                     # 술 장식
        c.set(x, 30, PON3)
    c.rect(16, 17, 23, 18, PON3)                                  # 어깨 빛
    # 두건(목에 두른 빨간 스카프 → 얼굴 아래를 가린다)
    c.rect(14, 14, 25, 17, RED); c.row(17, 15, 24, RED2)
    c.pts(RED, (19, 18), (20, 18), (19, 19)); c.set(20, 19, RED2)
    c.pts(WHITE, (16, 15), (21, 16), (23, 15))
    # 얼굴
    c.rect(14, 9, 25, 13, SKIN); c.rect(24, 9, 25, 13, SKIN2)
    c.rect(16, 11, 17, 12, INK); c.rect(21, 11, 22, 12, INK)       # 눈 (날카롭게)
    c.pts(WHITE, (16, 11), (21, 11))
    c.row(10, 15, 18, HAIR); c.row(10, 20, 23, HAIR)               # 짙은 눈썹
    c.rect(13, 9, 13, 13, HAIR); c.rect(26, 9, 26, 12, HAIR)       # 옆머리
    # 모자: 넓은 챙 + 움푹한 꼭대기
    c.rect(14, 2, 25, 7, HAT); c.rect(15, 1, 18, 1, HAT); c.rect(21, 1, 24, 1, HAT)
    c.rect(19, 1, 20, 2, HAT2)                                     # 움푹
    c.rect(14, 2, 15, 6, HAT3)
    c.rect(23, 2, 25, 7, HAT2)
    c.row(6, 14, 25, BAND); c.pts(STR1, (16, 6))
    c.row(8, 6, 33, HAT); c.row(7, 7, 13, HAT); c.row(7, 26, 32, HAT)
    c.pts(HAT, (5, 7), (34, 7))
    c.row(8, 26, 33, HAT2); c.row(7, 7, 10, HAT3)
    # 오른손: 리볼버를 옆으로 겨눈다
    c.rect(30, 19, 32, 21, SKIN)
    c.rect(32, 18, 38, 19, GUN); c.row(18, 33, 38, GUNL); c.rect(31, 20, 33, 22, GUN2)
    c.rect(34, 19, 35, 20, GUN2); c.set(38, 17, GUN)
    # 왼손: 허리 총집에 손
    c.rect(7, 22, 9, 24, SKIN)
    c.rect(9, 27, 11, 31, BOOT); c.set(10, 26, GUN2)
    c.outline()
    # 총구 섬광 · 연기 (외곽선 없이)
    c.pts(STR1, (39, 17), (39, 19)); c.pts(WHITE, (39, 18))
    return c.save('outlaw')

def sharper():
    c = Canvas()
    SUIT, SUIT2, SUIT3 = hx('#1E2A3A'), hx('#121A26'), hx('#34465E')
    SHIRT, SHIRT2 = hx('#4FD6C8'), hx('#2A9E94')
    HAIR, HAIR2 = hx('#14101E'), hx('#3A3450')
    SHADE, GLINT = hx('#0A0812'), hx('#9CF2FF')
    CARD, CARD2, CARDW = hx('#D9263E'), hx('#8E1426'), hx('#FFF6E8')
    GOLD = hx('#FFC83D')
    SHOE = hx('#2A2030')
    # 다리
    c.rect(14, 29, 18, 36, SUIT); c.rect(21, 29, 25, 36, SUIT)
    c.rect(17, 29, 18, 36, SUIT2); c.rect(24, 29, 25, 36, SUIT2)
    c.rect(13, 36, 18, 38, SHOE); c.rect(21, 36, 26, 38, SHOE)
    c.pts(WHITE, (14, 36), (22, 36))
    # 몸 (양복 · 열린 앞섶에 민트 셔츠)
    c.rect(12, 17, 27, 29, SUIT)
    c.rect(25, 18, 27, 29, SUIT2); c.rect(12, 17, 13, 28, SUIT3)
    c.rect(17, 17, 22, 26, SHIRT); c.rect(21, 18, 22, 26, SHIRT2)
    c.pts(SUIT3, (16, 17), (16, 18), (17, 19), (23, 17), (23, 18), (22, 19))   # 옷깃
    c.rect(19, 18, 20, 19, CARD)                                   # 붉은 넥타이 매듭
    c.rect(19, 20, 20, 23, CARD2)
    c.pts(GOLD, (24, 22), (25, 23), (26, 24))                      # 금 시곗줄
    c.row(29, 12, 27, SUIT2)
    # 목 · 얼굴
    c.rect(18, 15, 21, 16, SKIN2)
    c.rect(14, 7, 25, 14, SKIN); c.rect(24, 8, 25, 14, SKIN2)
    c.row(14, 15, 24, SKIN2)
    # 선글라스
    c.rect(14, 10, 18, 11, SHADE); c.rect(21, 10, 25, 11, SHADE); c.row(10, 19, 20, SHADE)
    c.pts(GLINT, (15, 10), (22, 10))
    c.rect(17, 13, 21, 13, SKIN2); c.pts(INK, (18, 13), (19, 13), (21, 12))   # 비스듬한 미소
    # 넘긴 머리 (올백 · 윤기)
    c.rect(13, 3, 26, 7, HAIR); c.rect(14, 2, 24, 2, HAIR)
    c.rect(13, 8, 13, 11, HAIR); c.rect(26, 8, 26, 10, HAIR)
    c.pts(HAIR2, (16, 3), (17, 3), (18, 4), (20, 3), (21, 3), (22, 4))
    c.pts(HAIR, (12, 4), (11, 5))
    # 왼손: 화투 패를 부채처럼 편다
    c.rect(8, 20, 11, 23, SKIN)
    for k, (x, y) in enumerate(((2, 14), (5, 13), (8, 13))):
        c.rect(x, y, x + 3, y + 5, CARDW)
        c.rect(x + 1, y + 1, x + 2, y + 4, CARD)
        c.set(x + 1, y + 1, GOLD if k == 1 else CARDW)
    c.pts(CARD2, (3, 18), (6, 17), (9, 17))
    # 오른손: 소매에서 밑장 한 장을 빼낸다
    c.rect(28, 22, 30, 25, SUIT); c.rect(30, 23, 32, 25, SKIN)
    c.rect(32, 19, 35, 25, CARDW); c.rect(33, 20, 34, 24, CARD); c.pts(GOLD, (33, 20))
    c.outline()
    # 반짝 (외곽선 없이)
    c.pts(WHITE, (37, 18), (38, 17), (36, 17), (37, 16))
    return c.save('sharper')

if __name__ == '__main__':
    a, b = outlaw(), sharper()
    print('ok')
