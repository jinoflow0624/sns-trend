// 도트 그림 — 스프라이트를 문자 격자로 적어 두고 캔버스로 그린다(이미지 파일 없음).
// 영웅·요정은 16×16, 보스는 32×32.
// 글자 하나가 픽셀 하나, '.'는 투명. 색은 PALETTE(공용) + 스프라이트별 색으로 정한다.

export const SPRITES = {
  "warrior": [
    "................",
    "..k..........k..",
    "..kwk.kkkkk.kwk.",
    "...kkkaaaaakkk..",
    "....kagggggak...",
    "...kaaaaaaaaak..",
    "...kkssssssskk.b",
    "...ksseksekssk.b",
    "...kssssssssk.kb",
    "....kksSSskk..gk",
    "...kaaakkaaak.s.",
    "..kaAaggggaAaks.",
    "..ksaaaaaaaaksk.",
    "...kaAakkaAak...",
    "...kkkk..kkkk...",
    "..kddk....kddk.."
  ],
  "rogue": [
    "................",
    ".....kkkkkk.....",
    "....kmmmmmmk....",
    "...kmmmmmmmmk...",
    "...kmmhhhhhmmk..",
    "...kmhssssshmk..",
    "...kmkkkkkkkmk..",
    "...kmseksekmk...",
    "....kmsssssmk...",
    "....kmmSSSmmk...",
    "...kmmkmmkmmmk..",
    "..kbmmmggmmmk...",
    "..kbkmmmmmmksk..",
    "...k.kmmmmk.k...",
    "....kkkkkkkk....",
    "....kdk..kdk...."
  ],
  "mage": [
    "........kk......",
    ".......kppk.....",
    "......kpppk.....",
    ".....kpppgpk....",
    "....kppppppk....",
    "..kkpppppppppkk.",
    "..kppppppppppk..",
    "...kssesseskk.y.",
    "...kssssssssk.y.",
    "...kwwSSSSwwkky.",
    "..kwwwwwwwwwwkyk",
    "..kpppwggwpppk.k",
    "..kpppppppppppk.",
    "..kppppppppppk..",
    "...kkkkkkkkkk...",
    "....kdk..kdk...."
  ],
  "bard": [
    "................",
    "....kkkkkkk.....",
    "...kcccccccrk...",
    "..kcccccccckrk..",
    "..kkkkkkkkkkk...",
    "...khhhhhhhhk...",
    "...khsssssshk...",
    "...kseksseksk...",
    "...ksssssssk....",
    "....kkSSSkk.....",
    "...kcckccckk..k.",
    "..kcckgggkcck.ok",
    "..ksccccccckoook",
    "...kccckccck.ok.",
    "...kkkk.kkkk.k..",
    "...kdk...kdk...."
  ],
  "gambler": [
    "................",
    "....kkkkkkkk....",
    "....kjjjjjjk....",
    "....kjjjjjjk....",
    "..kkkggggggkkk..",
    "..kjjjjjjjjjjk..",
    "...khhssssshk...",
    "...kseksseksk...",
    "...ksssssssk....",
    "....kkSrSkk.....",
    "...kjjwrwjjk....",
    "..kjjjwrwjjjk.kk",
    "..ksjjwwwjjjskwk",
    "...kjjjkjjjk.kk.",
    "...kkkk.kkkk....",
    "...kdk...kdk...."
  ],
  "monk": [
    "................",
    "......kkkk......",
    ".....kssssk.....",
    "....kssssssk....",
    "....ksessesk....",
    "....kssSSssk....",
    ".....kssssk.....",
    "...kooonnoook...",
    "..koooonnooook..",
    "..ksooonnooosk..",
    "..kOooonnoooOk..",
    "...kOooooooOk...",
    "...kooooooook...",
    "...kkkkkkkkkk...",
    "....kdk..kdk....",
    "................"
  ],
  "dancer": [
    "......kkk.......",
    ".....krrrk......",
    "....khhhhhk.....",
    "...khhsssshk....",
    "...khseksesk..k.",
    "...khsssSssk.kv.",
    "k...kksSskk.kv..",
    "vk..kvlvvlk.kk..",
    ".vk.kvvvvvvk.k..",
    "..kkvvvlvvvvkk..",
    "...kvvVvvVvvk...",
    "..kvvVvvvvVvvk..",
    ".kvvVvvvvvvVvvk.",
    ".kkkkkkkkkkkkkk.",
    "......kdk.......",
    ".....kdk........"
  ],
  "demon": [
    "................................",
    "....kkkkkkkkkkkkkkkkkkkkkkkk....",
    "...kTTTTTTTTkTTkkTTkTTTTTTTTk...",
    "..kTuuuuuuukCkkCCkkCkuuuuuuuTk..",
    "..kTuuuuuukCCCkCCkCCCkuuuuuuTk..",
    "..kTuuuuuukCCCCCCCCCCkuuuuuuTk..",
    "..kTuuuuuukcrcCccCcrckuuuuuuTk..",
    "..kTuuuuuukCcCcCCcCcCkuuuuuuTk..",
    "..kTuuuuukkkkkkkkkkkkkkuuuuuTk..",
    "..kTuuuukhhhhhhhhhhhhhhkuuuuTk..",
    "..kTuuukhhHhhhhhhhhhhHhhkuuuTk..",
    "..kTuuukhHhhsssssssshhHhkuuuTk..",
    "..kTuuukhHhsssssssssshHhkuuuTk..",
    "..kTuuukhHhskkksskkkshHhkuuuTk..",
    "..kTuuukhHhsseEssEesshHhkuuuTk..",
    "..kTuuukhHhsseesseesshHhkuuuTk..",
    "..kTuuukhHhhsssssssshhHhkuuuTk..",
    "..kTuuukhHhhhksmmskhhhHhkuuuTk..",
    "..kTuuukhHhhhhkllkhhhhHhkuuuTk..",
    "..kTuukhHhhkddlwwlddkhhHhkuuTk..",
    "..kTukhHhhkdddlwwldddkhhHhkuTk..",
    "..kTkhHhhkddddlwwlddddkhhHhkTk..",
    "kkkkkkhHhkddDdlwwldDddkhHhkkkkkk",
    "kTTTTkhHhkdDddwllwddDdkhHhkTTTTk",
    "kkkkkkkhHkdddDdwwdDdddkHhkkkkkkk",
    ".kTTk.khkdDddddllddddDdkhk.kTTk.",
    ".kTTk..kdDdddDddddDdddDdk..kTTk.",
    ".kTTk..kdDddDddddddDddDdk..kTTk.",
    ".kTTk.kdDdddDddddddDdddDdk.kTTk.",
    ".kTTk.kdDddDddddddddDddDdk.kTTk.",
    ".kTTkkdDdddDddddddddDdddDdkkTTk.",
    ".kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk."
  ],
  "fairy": [
    "................",
    "..kk........kk..",
    ".kttk......kttk.",
    ".kttk.kkkk.kttk.",
    "..kttkyyyykttk..",
    "...kkyyyyyykk...",
    "....kyssssyk....",
    "....ksekeskk....",
    "....kssrsssk....",
    ".....kssssk.....",
    "....kttttttk....",
    "...kttkwwkttk...",
    "....kttttttk....",
    ".....ktttk......",
    "......kkk.......",
    "................"
  ],
  "dragon": [
    "........kk............kk........",
    ".......kWWk..........kwWk.......",
    ".k......kwWk...kk...kwWk......k.",
    "kBk.....kwWk..kbBk.kkwWk.....kBk",
    "kMBk....kWwWk.kbBkkbwWk.....kbMk",
    ".kmBk....kwwBkbbbbbbwWk....kbMk.",
    ".kmmBk...kWwbrrrrrrbwWk...kbmMk.",
    ".kMmmBkk..kwrrrrrrrrWk..kkbmmMk.",
    "..kmmmbBk.krrrrrrrrrRk.kbbmmMk..",
    "..kmmmmmBkrrKKrrrrrKKRkbmmmmMk..",
    ".kmmmmmmmbrrKeKrrrKeKrbmmmmmmMk.",
    "kmmmmmmmmmrrrErrrrrErrmmmmmmmmMk",
    "BBmmmmmmmmrrrrrrrrrrrrmmmmmmmmBB",
    "kkBbbbmmmmmrrrrrrrrrrmmmmmbbbBkk",
    "..kMmmbbbbmrrrKrrrKrrmbbbbmmMk..",
    "...kmmmmmmbbrrrrrrrrbbmmmmmMk...",
    "..kmmmmmmmmrrwfwfwfwrmmmmmmmMk..",
    ".kmmmmmmmbrrrrFrFrFrrrbmmmmmmMk.",
    "kmmmBBBbrrrrrrrfFfrrrrrrbBBBmmMk",
    "kBBBkkkrrrrrrrrrfrrrrrrrRkkkBBBk",
    ".kkk..krrrrrrrrrrrrrrrrrRk..kkk.",
    ".....krrrrrryrrrrrrYrrrrrRk.....",
    ".....kRrrrrryrrrrrryrrrrrRk.....",
    "......krrrrryyyyyyyyrrrrRk......",
    "......kRrrRryYYYYYYYrrRrRk......",
    ".......wRwrryyyyyyyyrrwRw.......",
    ".......kkrrryyyyyyyyrrRk........",
    "......kRkRrryYYYYYYYrrRR........",
    ".....krrRkrryyyyyyyyrRkkkk......",
    "....krrrrrrRRyyyyyyRRrrrrRk.....",
    "...kRRrrrrRkkRYYYYRkkrrrrRk.....",
    "....kkRwRwRk.kkkkkk.kRwRwRk....."
  ],
  "orc": [
    "..kWWk...................kwwWk..",
    "...kWWk.................kwkWk...",
    "....kWWk....kkkkkkkk...kwwWss...",
    ".....kWWk.kkmmmmmmmMkkkwwWsss...",
    "......kWWkmmmmmmmmmmmmwwWssssd..",
    ".......kWwmmmmmmmmmmmwwksssssd..",
    "........kwmmmmmmmmmmmmwksssssd..",
    "........kmmmmmmmmmmmmmmksssssd..",
    ".......kkmmmmmmmrmmmmmmksssssd.k",
    "k.....kWkMmmmmmmrmmrmmMksssssdkW",
    "Wk....kWkkgKgggggggGgKkkWssssdWk",
    "kWk...kWkgggKKgggggKKgGkWksssdWk",
    "kwWkkkkwWgggeegggggeeggWWkkssdWk",
    "kWwwmmmMkggggggggggGggGkmmkwwdk.",
    ".kwmmmmmmgggwggggggGwggmmmmmwdk.",
    "kmmmmmmmmmggwgggggggwgmmmmmmmdMk",
    "kmmmmmmmmmggKKKKKKKKKgmmmmmmmdMk",
    "kmmmmmmmmmmggRRRRRRRgmmmmmmmmdMk",
    "kMmmmmmmmmmaggggggggammmmmmmmdMk",
    ".kMmmmmmmmaaaaaaaaaaaammmmmmmdk.",
    "..kgmmmmgaaaaaaaaaaaaaagmmmmGd..",
    "..kgggggaammmmmmmmmmmmmaggggGd..",
    ".kggggggaaaaaaaaMaaaaaaagggggdk.",
    ".kggggggaamaaaaaMaaaaamagggggdk.",
    ".kggggggaaaaaaaaMaaaaaaagggggdk.",
    ".kGgggggaaaamaaaMaaamaaagggggdk.",
    "..kgggggaaaaaaaaMaaaaaaaggggGd..",
    "..kggggggaaaaayyyyyaaaagggggGd..",
    "..kggggggfaaaayyryyaaafgggggGd..",
    "..kggggggffaaayyyyyaaffgggggGd..",
    "..kGgggggfffaaaaaaaafffgggggGd..",
    "...kGGGGFFFFFFFFFFFFFFFFGGGGkd.."
  ],
  "lich": [
    "................................",
    "...........k..k.k.k..k..........",
    "...c......kYkkYkYkYkkYk.........",
    ".cCccc....kYkkYkYkYkkYk.........",
    ".ccccc....kyyyyyryyyyYk.........",
    ".ccccc....kyyyyyyyyyyYk.........",
    ".ccccc....kYyyyyyyyyYYk.........",
    "...c.......kwwwwwwwWkk..........",
    "...d......kwwwwwwwwwWk..........",
    "...d......kwwwcwwwcwWk..........",
    "...d......kwwKcwwwcKWk..........",
    "...d......kwwKCwwwCKWk..........",
    "...d......kwwwwwwwwwWk..........",
    "...d......qwwwwwKwwwwq..........",
    "...d....qqqqwwwwwwwwqqqq........",
    "...d...qqqppwKWKWKWKppqqq.......",
    "...d..qqqpppppwwwwpppppqqq......",
    "...dkqqqppppppppppppppppqqq.....",
    "...dwwqqppppppppppppppppqqq.....",
    "..kdwwwqypppppppypppppppqqqq....",
    "..kdwwwpppppppppyppppppppqqq....",
    "...dwwppppppppppypppppppppqq....",
    "...dqyppppppppppyppppppppppq....",
    "...dyppqppppppppyppppppppppPk...",
    "...dqqqqyppppPPPyPPPppppqqqq....",
    "...d.qqqyppppPPPyPPPppppqqq.....",
    "...d.qqypppppPPPyPPPpppppqq.....",
    "...d..qypppppPPPyPPPpppppq......",
    "...d..kypppppPPPyPPPppppPk......",
    "...d.kyppppppPPPyPPPpppppPk.....",
    "...d.kyPPPPPpPPPPPPPPPPPPPk.....",
    "......kkqkqkqPqPqPqPqkqkqk......"
  ]
};

const PALETTE = {"k": "#1A1030", "s": "#F7C9A0", "S": "#DE9A74", "e": "#1A1030", "w": "#FFFFFF", "g": "#FFC83D", "d": "#5A3A2A", "b": "#D8ECFF", "h": "#6B3E26", "r": "#E8435A", "y": "#C9A36B", "o": "#E9B04E", "t": "#9CF2FF"};
const OWN = {"warrior": {"a": "#D9463E", "A": "#8E2226", "h": "#6B3E26"}, "rogue": {"m": "#2F8F6E", "h": "#2B2440"}, "mage": {"p": "#7B4BD6", "y": "#C9A36B"}, "bard": {"c": "#2F7FD6", "h": "#E3A546"}, "gambler": {"j": "#3A2E5C", "h": "#2B2440"}, "monk": {"o": "#E07A1F", "O": "#A34F12", "n": "#8E2226"}, "dancer": {"v": "#E84FA0", "V": "#9E2F72", "l": "#FFC83D", "h": "#3A1E2E", "r": "#FF5A6A"}, "fairy": {"y": "#FFE27A"}, "demon": {"k": "#12081E", "T": "#5A5064", "u": "#3A0E22", "C": "#D8D4E4", "c": "#6A6478", "r": "#FF2A6A", "h": "#ECE8F4", "H": "#A8A2BC", "s": "#F4E4EA", "S": "#D2B8C6", "e": "#A8102C", "E": "#FF3050", "m": "#B0305A", "d": "#2A2036", "D": "#150E1E", "l": "#9A94A8", "w": "#F0ECF8"}, "dragon": {"m": "#7A1E3A", "M": "#4A0E24", "b": "#E8B87A", "B": "#B8864A", "r": "#D9463E", "R": "#8E2226", "y": "#FFB34D", "Y": "#D9822A", "w": "#FFF3D6", "W": "#CFC0A0", "e": "#FFE24A", "E": "#FF8A1A", "f": "#FF5A1F", "F": "#FFD24A", "K": "#1A1030", "k": "#1A1030"}, "orc": {"g": "#6BBE45", "G": "#3F7F2A", "a": "#5A5F78", "A": "#373A50", "m": "#8A90A8", "M": "#5A5F78", "w": "#F2EEDD", "W": "#C9C2A6", "f": "#7A4A2A", "F": "#4A2A14", "y": "#FFC83D", "Y": "#B8801A", "d": "#5A3A2A", "D": "#3A2414", "e": "#FF3B3B", "r": "#E8435A", "R": "#9C1C33", "s": "#D8E4F0", "S": "#8A9AB0", "K": "#1A1030", "k": "#1A1030"}, "lich": {"q": "#4A3290", "Q": "#3A2474", "p": "#5A3AA0", "P": "#3A2470", "w": "#EEE6D0", "W": "#B8AE92", "y": "#FFC83D", "Y": "#B8801A", "c": "#7CF2FF", "C": "#2FB8D8", "r": "#E8435A", "d": "#6B4A2A", "D": "#3A2414", "K": "#1A1030", "k": "#1A1030"}};

const cache = new Map();

// 스프라이트를 확대한 캔버스 (도트가 번지지 않게 정수 배율)
export function spriteCanvas(name, scale = 4, flip = false) {
  const key = `${name}:${scale}:${flip}`;
  if (cache.has(key)) return cache.get(key);
  const rows = SPRITES[name];
  const pal = { ...PALETTE, ...(OWN[name] || {}) };
  const c = document.createElement('canvas');
  const w = rows[0].length;
  c.width = w * scale; c.height = rows.length * scale;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = pal[ch] || pal[ch.toLowerCase()];
    g.fillRect((flip ? w - 1 - x : x) * scale, y * scale, scale, scale);
  }));
  cache.set(key, c);
  return c;
}

export function spriteURL(name, scale = 4) {
  return spriteCanvas(name, scale).toDataURL();
}

export function drawSprite(g, name, x, y, scale = 4, flip = false) {
  g.drawImage(spriteCanvas(name, scale, flip), Math.round(x), Math.round(y));
}
