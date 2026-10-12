"""원정 UI 도트 아이콘 (16×16) → assets/run/ui/<이름>.webp (128px, 8배 확대 · 무손실)

    python3 tools/run_icons.py            # 전부 만들기
    python3 tools/run_icons.py --sheet x.png   # 미리보기 시트도 저장

규칙은 run/RELICS-ART.md 와 같다: 'k' = 외곽선 #1A1030, '.' = 투명, 빛은 왼쪽 위에서, 가장자리 1px 비움.
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'run' / 'ui'
K = '#1A1030'

# 공용 색
GOLD = {'y': '#FFC83D', 'Y': '#C8860E', 'w': '#FFFFFF', 'l': '#FFE27A'}
ICONS = {
  # 보존: 보랏빛 리본으로 묶어 둔 카드
  'kw_keep': ({'c': '#F1DDAE', 'C': '#C9A46A', 'v': '#C8A2FF', 'V': '#7A4AD0', 'y': '#FFC83D', 'Y': '#C8860E', 'w': '#FFFFFF'}, [
    '................',
    '...kkkkkkkkk....',
    '...kwccccccCk...',
    '...kcccccccCk...',
    '...kcccccccCk...',
    '.kkkkkkkkkkkkkk.',
    'kvvvvvkyykvvvvVk',
    'kvwvvkywYykvvvVk',
    'kVVVVkyYYykVVVVk',
    '.kkkkkkyykkkkkk.',
    '...kcccvVcccCk..',
    '...kccvVkVcCCk..',
    '...kcvVk.kVCCk..',
    '...kkkk...kkkk..',
    '................',
    '................']),
  # 별조각: 금빛 별 결정
  'star': ({'y': '#FFC83D', 'Y': '#C8860E', 'l': '#FFE27A', 'w': '#FFFFFF', 'o': '#FF8A1A'}, [
    '.......kk.......',
    '......klyk......',
    '......klyk......',
    '.....klwyYk.....',
    'kkkkkklwyYkkkkkk',
    'kllllllwyyyyyYYk',
    '.kllwwwlyyyyYYk.',
    '..kllllyyyyyYk..',
    '...klllyyyYYk...',
    '...klllyyyYYk...',
    '..kllyyykyyyYk..',
    '..klyyYk.kyyYk..',
    '.klyYYk...kYYYk.',
    '.kyYkk.....kkYk.',
    '.kkk.........kk.',
    '................']),
  # 원정 준비 7종
  'meta_hp': ({'r': '#E8435A', 'R': '#8E2226', 'w': '#FFFFFF', 's': '#C9D3E8', 'S': '#7A86A8'}, [
    '................',
    '..kkkk...kkkk...',
    '.krrrrk.krrrRk..',
    'krwwrrrkrrrrRRk.',
    'krwrrrrrrrrrRRk.',
    'krrrrrrrrrrRRRk.',
    'kkkkkkkkkkkkkRk.',
    'kssssssssssSkk..',
    'kswsssssssSSk...',
    '.ksssssssSSk....',
    '.kkSSSSSSSkk....',
    '..krrRRRRk......',
    '...krRRRk.......',
    '....kRRk........',
    '.....kk.........',
    '................']),
  'meta_gold': ({'b': '#9A6232', 'B': '#5A3A1E', 'y': '#FFC83D', 'Y': '#C8860E', 'w': '#FFFFFF', 'r': '#E8435A'}, [
    '................',
    '......kkkk......',
    '.....kbbbBk.....',
    '......kkkk......',
    '.....krrrrk.....',
    '....kkbbbbkk....',
    '...kbbbbbbbBk...',
    '..kbwbbbbbbbBk..',
    '..kbbbbyybbbBk..',
    '.kbbbbykkybbbBk.',
    '.kbbbbyYYybbBBk.',
    '.kbbbbbyybbbBBk.',
    '.kBbbbbbbbbBBBk.',
    '..kBBBBBBBBBBk..',
    '...kkkkkkkkkk...',
    '................']),
  'meta_tools': ({'b': '#9A6232', 'B': '#5A3A1E', 'm': '#3EE6B4', 'M': '#139B74', 's': '#4FB3FF', 'w': '#FFFFFF'}, [
    '................',
    '....kkk..kkk....',
    '...kmmMk.kssk...',
    '..kmk.kMkswsk...',
    '..kmk..kkssk....',
    '..kmMk.kswsk....',
    '...kMMk.kssk....',
    '..kkkkkkkkkkkk..',
    '.kbbbbbbbbbbbBk.',
    '.kbwbbbbbbbbbBk.',
    '.kbbbbkkkkbbbBk.',
    '.kbbbbbkkbbbBBk.',
    '.kbbbbbbbbbbBBk.',
    '.kBBBBBBBBBBBBk.',
    '..kkkkkkkkkkkk..',
    '................']),
  'meta_potion': ({'b': '#9A6232', 'B': '#5A3A1E', 'r': '#E8435A', 'R': '#8E2226', 'g': '#C9D3E8', 'w': '#FFFFFF', 'c': '#C8860E'}, [
    '................',
    '......kkkk......',
    '......kcck......',
    '......kggk......',
    '.....kgwggk.....',
    '....kgwrrrgk....',
    'kkkkkrrrrrRkkkkk',
    'kbbbkrwrrrRkbbBk',
    'kBBBkrrrrRRkBBBk',
    'kkkkkrrrrRRkkkkk',
    '....kRrrRRRk....',
    '.....kRRRRk.....',
    '......kkkk......',
    '................',
    '................',
    '................']),
  'meta_relic': ({'p': '#F1DDAE', 'P': '#C9A46A', 'r': '#E8435A', 'R': '#8E2226', 'B': '#9A6232', 'w': '#FFFFFF', 'd': '#9A6232'}, [
    '................',
    '.kkkkkkkkkkkkk..',
    'kBkpppppppppPkk.',
    'kBkpwppppppppkBk',
    'kBkpdpppppRpRkBk',
    'kBkppdppppprpkBk',
    'kBkpppdpppRpRkBk',
    'kBkppppdpppppkBk',
    'kBkpppppdppdpkBk',
    'kBkPppppppdppkBk',
    'kBkppPppppppPkBk',
    'kBkpppPpppPPpkBk',
    'kBkppppppPPPpkBk',
    '.kkkkkkkkkkkkkBk',
    '..kBBBBBBBBBBBk.',
    '...kkkkkkkkkkk..']),
  'meta_sharp': ({'c': '#F1DDAE', 'C': '#C9A46A', 's': '#C9D3E8', 'S': '#7A86A8', 'y': '#FFE27A', 'w': '#FFFFFF'}, [
    '.....y.......y..',
    '..y..kkkkkkk.y..',
    '....kwcccccCk...',
    '....kcckkccCk.y.',
    '.y..kckkkkcCk...',
    '....kcckkccCk...',
    '....kccccccCk...',
    '....kcccccCCk...',
    '....kCCCCCCCk...',
    '..kkkkkkkkkkkkk.',
    '.kswswswswswsSk.',
    '.ksssssssssssSk.',
    '.kSSSSSSSSSSSSk.',
    '..kkkkkkkkkkkk..',
    '................',
    '................']),
  'meta_slot': ({'s': '#9A6232', 'S': '#5A3A1E', 'd': '#2A1A10', 'D': '#4A3020', 'v': '#B98CFF', 'V': '#5645D0', 'w': '#FFFFFF', 'y': '#FFC83D', 'Y': '#C8860E'}, [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kswsssssssssSk.',
    '.kskkkkkkkkksSk.',
    '.kskdddddddksSk.',
    '.kskdDDDDDdksSk.',
    '.kykdDdddDdkySk.',
    '.kYkdDdddDdkYSk.',
    '.kskdDDDDDdksSk.',
    '.kskdddddddksSk.',
    '.kskkkkkkkkksSk.',
    '.ksssskvksssSSk.',
    '.kSSSSkVkSSSSSk.',
    '..kkkkkkkkkkkk..',
    '................']),
}


def die(face, edge, pip, hi, top, mark='', mc=None):
    """정면에서 살짝 위로 본 주사위: 위 면(top) + 앞 면(face, 5의 눈) + 오른쪽 그늘(edge). mark 로 종류별 무늬를 얹는다"""
    rows = [
      '................',
      '....kkkkkkkk....',
      '...kwtttttttk...',
      '..kttttpttttek..',
      '.kkkkkkkkkkkeek.',
      '.kwffffffffkeek.',
      '.kfppffffppkeek.',
      '.kfppffffppkeek.',
      '.kffffppfffkeek.',
      '.kffffppfffkeek.',
      '.kfppffffppkeek.',
      '.kfppffffppkeek.',
      '.kffffffffffkek.',
      '.kkkkkkkkkkkkkk.',
      '................',
      '................']
    rows = [list(r) for r in rows]
    for x, y, ch in MARKS.get(mark, []):
        rows[y][x] = ch
    pal = {'t': top, 'f': face, 'e': edge, 'p': pip, 'w': hi}
    if mc:
        pal['m'] = mc
    return (pal, [''.join(r) for r in rows])


MARKS = {
  # 금: 반짝임 두 개
  'gold': [(1, 1, 'w'), (0, 2, 'w'), (2, 2, 'w'), (1, 3, 'w'), (14, 14, 'w'), (13, 14, 'm')],
  # 무거운: 아래에 납 띠, 6 눈 자리 무게감
  'heavy': [(x, 12, 'm') for x in range(2, 11)] + [(13, 2, 'm'), (14, 3, 'm')],
  # 쌍둥이: 뒤에 비치는 둘째 주사위 그림자
  'twin': [(13, 1, 'k'), (14, 1, 'k'), (14, 2, 'k'), (14, 3, 'm'), (14, 4, 'm'), (15, 5, 'k'), (15, 6, 'k'), (15, 7, 'k'), (15, 8, 'k'), (15, 9, 'k'), (15, 10, 'k')],
  # 계단: 위 면에 계단 무늬
  'stair': [(4, 2, 'm'), (5, 2, 'm'), (7, 2, 'm'), (8, 2, 'm'), (9, 2, 'm'), (10, 2, 'm'), (3, 3, 'm'), (8, 3, 'm'), (9, 3, 'm'), (10, 3, 'm'), (11, 3, 'm')],
}

ICONS['die_gold'] = die('#FFC83D', '#C8860E', '#5A3A1E', '#FFF6C8', '#FFE27A', 'gold', '#FFE27A')
ICONS['die_heavy'] = die('#9AA4B8', '#5A6478', '#1A1030', '#E4E9F2', '#C2C9D8', 'heavy', '#3A4050')
ICONS['die_twin'] = die('#FF9AD0', '#C2508E', '#7A1E5A', '#FFE4F3', '#FFC4E6', 'twin', '#FF9AD0')
ICONS['die_stair'] = die('#3EE6B4', '#139B74', '#0F4A38', '#D9F7E4', '#8FF2D2', 'stair', '#139B74')


ICONS.update({
  # 승천 휘장: 해골 위 붉은 왕관 (단계 숫자는 화면이 겹쳐 그린다)
  'asc': ({'r': '#E8435A', 'R': '#8E2226', 'y': '#FFC83D', 'Y': '#C8860E', 'w': '#F2EEDD', 'W': '#B8AE92', 'x': '#1A1030'}, [
    '................',
    '..k...kk...k....',
    '.kyk.kyyk.kyk...',
    '.kyykyrrykyyyk..',
    '.kyyyyyyyyyyk...',
    '.kYYYYYYYYYYk...',
    '..kkkkkkkkkk....',
    '..kwwwwwwwwWk...',
    '.kwwkkwwkkwWWk..',
    '.kwwkrwwkrwWWk..',
    '.kwwwwkkwwwWWk..',
    '..kwwwwwwwWWk...',
    '...kwkwkwkWk....',
    '...kRkRkRkRk....',
    '....kkkkkkk.....',
    '................']),
  # 대장장이: 모루 위 망치
  'smith': ({'s': '#C9D3E8', 'S': '#7A86A8', 'b': '#9A6232', 'B': '#5A3A1E', 'o': '#FF8A1A', 'y': '#FFE27A', 'w': '#FFFFFF'}, [
    '..........y.....',
    '...kkkkk...o.y..',
    '..kswssSk.......',
    '..ksssSSk..y....',
    '...kkbkkk.......',
    '.....kbk........',
    '.....kbk........',
    '.....kBk........',
    '.kkkkkkkkkkkkk..',
    'kswssssssssssSk.',
    '.kSSSSSSSSSSSk..',
    '...kkssssSSkk...',
    '....kssssSSk....',
    '...kSSSSSSSSk...',
    '...kkkkkkkkkk...',
    '................']),
  # 나누기 막대 손잡이: 검과 방패가 맞물린 모양
  'split_knob': ({'s': '#C9D3E8', 'S': '#7A86A8', 'b': '#4FB3FF', 'B': '#2F5FB0', 'y': '#FFC83D', 'r': '#FF8A3D', 'w': '#FFFFFF'}, [
    '.............kk.',
    '............kwsk',
    '...........kwsSk',
    '..kkkkkk..kwsSk.',
    '.kbwbbbBkkwsSk..',
    '.kbbbbbBkwsSk...',
    '.kbbyybBwsSk....',
    '.kbyyyyksSk.....',
    '.kbbyykySk......',
    '..kbbkyykk......',
    '..kbBkyk.kk.....',
    '...kkrk.........',
    '....krk.........',
    '...kkk..........',
    '................',
    '................']),
  # 적 보호막 칸
  'shield': ({'b': '#4FB3FF', 'B': '#2F5FB0', 's': '#C9D3E8', 'S': '#7A86A8', 'w': '#FFFFFF'}, [
    '................',
    '..kkkkkkkkkkkk..',
    '.ksssssssssssSk.',
    '.kswbbbbbbbbBsk.',
    '.ksbwbbbbbbbBsk.',
    '.ksbbbbbbbbbBsk.',
    '.ksbbbbbbbbBBsk.',
    '.ksbbbbbbbbBBsk.',
    '..ksbbbbbbBBsk..',
    '..ksbbbbbbBBsk..',
    '...ksbbbbBBsk...',
    '....ksbbBBsk....',
    '.....kssssk.....',
    '......kkkk......',
    '................',
    '................']),
})

# 도전과제 메달 12종: 같은 메달 틀(리본 · 금 원판)에 가운데 문양 5×5만 다르다
MEDAL = [
  '..kkk....kkk....',
  '..krRk..kRrk....',
  '...krRkkRrk.....',
  '....krRRrk......',
  '....kkkkkk......',
  '...kyyyyyYk.....',
  '..kylllllyYk....',
  '.kyl#####lYYk...',
  '.kyl#####lYYk...',
  '.kyl#####lYYk...',
  '.kyl#####lYYk...',
  '.kyl#####lYYk...',
  '..kylllllYYk....',
  '...kYYYYYYk.....',
  '....kkkkkk......',
  '................',
]
EMBLEM = {   # (리본 색, 문양 색, 문양 5×5)
  'act1':     ('#8A8FA8', '#1A1030', ['.xxx.', 'x.x.x', 'xxxxx', '.x.x.', '.xxx.']),     # 해골
  'clear':    ('#E8435A', '#8E2226', ['x.x.x', 'xxxxx', 'xxxxx', 'x.x.x', 'xxxxx']),     # 왕관
  'flawless': ('#FF9AD0', '#E8435A', ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..']),     # 하트
  'ace30':    ('#E8435A', '#E8435A', ['xxxxx', 'x...x', 'x.x.x', 'x...x', 'xxxxx']),     # 1의 눈
  'lstr60':   ('#3EE6B4', '#139B74', ['...xx', '..xx.', 'xxxxx', '..xx.', '...xx']),     # 질주 화살
  'yacht':    ('#4FB3FF', '#2F5FB0', ['..x..', '.xx..', 'xxx..', '..x..', 'xxxxx']),     # 돛단배
  'wall':     ('#4FB3FF', '#2F5FB0', ['xxxxx', 'x.x.x', 'xxxxx', '.x.x.', '..x..']),     # 방패
  'rich':     ('#FFC83D', '#C8860E', ['.xxx.', 'x.x.x', 'xx.xx', 'x.x.x', '.xxx.']),     # 동전
  'hoard':    ('#B98CFF', '#5645D0', ['xxx..', 'x.xx.', 'x.x.x', 'xxx.x', '..xxx']),     # 겹친 카드
  'asc5':     ('#E8435A', '#8E2226', ['..x..', '.xxx.', 'xxxxx', '..x..', '..x..']),     # 위 화살
  'asc10':    ('#1A1030', '#8E2226', ['x.x.x', 'xxxxx', '.xxx.', '..x..', '.xxx.']),     # 트로피
  'five':     ('#6BBE45', '#3F7F2A', ['x.x.x', '.....', 'x.x.x', '.....', 'xx.xx']),     # 다섯 점
}
for fid, (rib, ink, glyph) in EMBLEM.items():
    rows = []
    for y, row in enumerate(MEDAL):
        if '#' in row:
            gy = y - 7
            row = row.replace('#####', ''.join('x' if c == 'x' else 'l' for c in glyph[gy]))
        rows.append(row)
    ICONS[f'feat_{fid}'] = ({'r': rib, 'R': '#1A1030' if rib != '#1A1030' else '#5A5290', 'y': '#FFC83D', 'Y': '#C8860E', 'l': '#FFE27A', 'x': ink}, rows)


# 승천 1~10단계: 같은 붉은 문장(방패꼴 · 금테)에 단계마다 8×8 문양
ASC_GLYPH = [   # (이름, 주색 a, 보조색 b, 문양)
  ('정예의 갑옷', '#C9D3E8', '#5A6478', ['..aaaa..', '.aaaaaa.', 'aawaaaaa', 'aabbbbaa', 'aab..baa', 'aab..baa', '.aa..aa.', '..a..a..']),
  ('거친 길',     '#B8AE92', '#6A5A48', ['........', '...a....', '..aaa...', '..aaaa.a', '.aaaaaaa', '.awaaaaa', 'aaaaaaaa', 'bbbbbbbb']),
  ('두꺼운 가죽', '#C8864A', '#6A3A1E', ['.a....a.', 'aaaaaaaa', '.aawaaa.', '.aaaaaa.', '.aabbaa.', '.aaaaaa.', 'aa....aa', 'a......a']),
  ('짧은 휴식',   '#FF8A1A', '#9A6232', ['...a....', '...aa...', '..aawa..', '..aaaa..', '.aaaaaa.', '..aaaa..', 'bb.bb.bb', '.bbbbbb.']),
  ('고된 행군',   '#9A6232', '#5A3A1E', ['..aaa...', '..aaa...', '..aaa...', '..aaa...', '..aaaa..', '..awaaaa', '.aaaaaaa', '.bbbbbbb']),
  ('오래된 상처', '#FF5A6A', '#1A1030', ['.aa..aa.', 'aaaaaaaa', 'aaawaaaa', 'aaaabaaa', '.aabaaa.', '..aaba..', '...aa...', '........']),
  ('바가지',      '#FFC83D', '#3EE6B4', ['...b....', '..bbb...', '...b....', '.aaaaa..', 'aawaaaa.', 'aaa.aaa.', 'aaaaaaa.', '.aaaaa..']),
  ('정예의 칼날', '#E4E9F2', '#C8860E', ['......aa', '.....aaw', '....aaa.', '.b.aaa..', '..bba...', '..bb....', '.b..b...', 'b.......']),
  ('폭군',        '#FFC83D', '#E8435A', ['a..a..a.', 'a..a..a.', 'aa.aa.aa', 'aaaaaaaa', 'awaaaaaa', 'abababab', 'aaaaaaaa', '........']),
  ('마왕의 시대', '#F2EEDD', '#E8435A', ['a......a', 'aa....aa', '.aaaaaa.', '.abaaba.', '.aaaaaa.', '..awwa..', '..a..a..', '........']),
]


def crest(glyph):
    """방패꼴 문장 16×16: 외곽선 k · 금테 y/Y · 안쪽 짙은 붉은색 R, 가운데 8×8 문양"""
    W = [(1, 14)] * 10 + [(2, 13), (3, 12), (5, 10), (7, 8)]           # 줄마다 좌우 끝 (1~14행)
    rows = [['.'] * 16 for _ in range(16)]
    for k, (l, r) in enumerate(W):
        y = 1 + k
        for x in range(l, r + 1):
            edge = x in (l, r) or y in (1, 14)
            rim = x in (l + 1, r - 1) or y == 2 or (k >= 10 and (x == l + 1 or x == r - 1))
            rows[y][x] = 'k' if edge else ('y' if (rim and (x <= 7 or y == 2)) else 'Y' if rim else 'R')
    for gy, line in enumerate(glyph):
        for gx, ch in enumerate(line):
            if ch != '.':
                rows[3 + gy][4 + gx] = {'a': 'a', 'b': 'b', 'w': 'w'}[ch]
    return [''.join(r) for r in rows]


def ornate(lv, glyph):
    """24×24: 가운데 16×16 문장에 단계가 오를수록 장식이 붙는다
    1 문장만 · 2 위 보석 · 3 모서리 징 · 4 작은 은 날개 · 5 큰 은 날개 · 6 금 날개
    7 작은 왕관 · 8 큰 왕관 + 보석 · 9 뒤에 붉은 불꽃 · 10 큰 보랏빛 불꽃 + 반짝임, 테가 흰 금"""
    N, OX, OY = 24, 4, 6
    g = [['.'] * N for _ in range(N)]
    def put(x, y, ch):
        if 0 <= x < N and 0 <= y < N:
            g[y][x] = ch
    # 4~6: 날개 (문장 양옆)
    if lv >= 4:
        col = 'G' if lv >= 6 else 's'
        dark = 'Y' if lv >= 6 else 'S'
        wing = ['..xx', '.xxx', 'xxxd', 'xxdd', '.xd.', '..d.'] if lv == 4 else ['...xx', '..xxx', '.xxxx', 'xxxxd', 'xxxdd', '.xxd.', '..xd.', '...d.']
        for dy, line in enumerate(wing):
            for dx, ch in enumerate(line):
                if ch == '.':
                    continue
                c = col if ch == 'x' else dark
                put(OX + 1 - len(line) + dx, OY + 2 + dy, c)        # 왼쪽 (문장 테에 붙여)
                put(OX + 14 + len(line) - dx, OY + 2 + dy, c)       # 오른쪽 (거울)
    # 문장
    rows = crest(glyph)
    for y, line in enumerate(rows):
        for x, ch in enumerate(line):
            if ch != '.':
                put(OX + x, OY + y, ch)
    if lv >= 10:                                   # 테를 흰 금으로
        for y in range(N):
            for x in range(N):
                if g[y][x] == 'y':
                    g[y][x] = 'l'
    # 2: 위 가운데 보석 · 3: 모서리 징
    if lv >= 2 and lv < 7:                         # 위 가운데 보석 (7부터는 왕관이 그 자리)
        for dx, ch in enumerate('.kk.'):
            if ch != '.': put(OX + 6 + dx, OY - 1, ch)
        for dx, ch in enumerate('kwrk'):
            put(OX + 6 + dx, OY, ch)
        for dx, ch in enumerate('krRk'):
            put(OX + 6 + dx, OY + 1, ch if ch != 'R' else 'r')
    if lv >= 3:
        for x, y in ((OX + 2, OY + 2), (OX + 13, OY + 2), (OX + 2, OY + 10), (OX + 13, OY + 10)):
            put(x, y, 'w')
    # 7~8: 왕관 (문장 위)
    if lv >= 7:
        crown = ['.k.k.k.', 'kykykyk', 'kyyyyyk', 'kkkkkkk'] if lv == 7 else ['k..k..k..k', 'yk.kyk.ky.', 'yykyyykyyk', 'yryyryyryk', 'kkkkkkkkkk']
        if lv >= 8:
            crown = ['.k..k..k.', 'kyk.kyk.kyk'[:9], 'kyykyyky', 'kryyryyrk', 'kkkkkkkkk']
            crown = ['..k..k..k..', '.kyk.kyk.ky', 'kyyykyyykyk', 'kyryyryyryk', 'kkkkkkkkkkk']
        w = len(crown[0])
        for dy, line in enumerate(crown):
            for dx, ch in enumerate(line):
                if ch != '.':
                    put(OX + 8 - w // 2 + dx, OY - len(crown) + 1 + dy, ch)
    # 9~10: 둘레에 일렁이는 불꽃 (빈 칸만, 위쪽은 혀처럼 더 길게)
    if lv >= 9:
        filled = {(x, y) for y in range(N) for x in range(N) if g[y][x] != '.'}
        ring1 = {(x + dx, y + dy) for x, y in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))} - filled
        for x, y in ring1:
            if y < OY + 13: put(x, y, 'F')
        reach = 3 if lv >= 10 else 2
        for x, y in ring1:
            if y < OY + 11 and (x + y) % 2 == 0:
                for k in range(1, reach + (1 if (x % 3 == 0) else 0)):
                    if 0 <= y - k < N and 0 <= x < N and g[y - k][x] == '.': put(x, y - k, 'f')
    # 10: 반짝임
    if lv >= 10:
        for x, y in ((1, 2), (22, 3), (0, 15), (23, 14), (12, 0)):
            put(x, y, 'w')
    return [''.join(r) for r in g]


for lv, (_, ca, cb, glyph) in enumerate(ASC_GLYPH, 1):
    ICONS[f'asc_{lv}'] = ({'y': '#FFC83D', 'Y': '#C8860E', 'R': '#5A0A1C', 'a': ca, 'b': cb, 'w': '#FFFFFF',
                           'l': '#FFF6C8', 'r': '#E8435A', 's': '#C9D3E8', 'S': '#7A86A8', 'G': '#FFD24A',
                           'f': '#FF5A3A' if lv < 10 else '#C04AFF', 'F': '#FFC83D' if lv < 10 else '#FF5AC8'}, ornate(lv, glyph))


def render(pal, rows):
    """N×N 도트 → 128px 안에 정수 배로 확대해 가운데 (16 → 8배, 24 → 5배)"""
    n = len(rows)
    assert all(len(r) == n for r in rows), rows
    pal = {'k': K, **pal}
    im = Image.new('RGBA', (n, n))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                im.putpixel((x, y), Image.new('RGB', (1, 1), pal[ch]).getpixel((0, 0)) + (255,))
    sc = 128 // n
    big = im.resize((n * sc, n * sc), Image.NEAREST)
    out = Image.new('RGBA', (128, 128))
    out.alpha_composite(big, ((128 - n * sc) // 2, (128 - n * sc) // 2))
    return out


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    ims = {}
    for name, (pal, rows) in ICONS.items():
        ims[name] = im = render(pal, rows)
        im.save(OUT / f'{name}.webp', lossless=True, method=6)
    if '--sheet' in sys.argv:
        W = 8
        sh = Image.new('RGBA', (W * 140, ((len(ims) + W - 1) // W) * 140), (36, 36, 52, 255))
        for i, im in enumerate(ims.values()):
            sh.alpha_composite(im, ((i % W) * 140 + 6, (i // W) * 140 + 6))
        sh.save(sys.argv[sys.argv.index('--sheet') + 1])
    print(len(ims), 'icons')
