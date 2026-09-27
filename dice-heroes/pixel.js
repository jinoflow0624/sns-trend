// 도트 그림 — 16×16 스프라이트를 문자 격자로 적어 두고 캔버스로 그린다(이미지 파일 없음).
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
  ]
};

const PALETTE = {"k": "#1A1030", "s": "#F7C9A0", "S": "#DE9A74", "e": "#1A1030", "w": "#FFFFFF", "g": "#FFC83D", "d": "#5A3A2A", "b": "#D8ECFF", "h": "#6B3E26", "r": "#E8435A", "y": "#C9A36B", "o": "#E9B04E", "t": "#9CF2FF"};
const OWN = {"warrior": {"a": "#D9463E", "A": "#8E2226", "h": "#6B3E26"}, "rogue": {"m": "#2F8F6E", "h": "#2B2440"}, "mage": {"p": "#7B4BD6", "y": "#C9A36B"}, "bard": {"c": "#2F7FD6", "h": "#E3A546"}, "gambler": {"j": "#3A2E5C", "h": "#2B2440"}, "fairy": {"y": "#FFE27A"}};

const cache = new Map();

// 스프라이트를 확대한 캔버스 (도트가 번지지 않게 정수 배율)
export function spriteCanvas(name, scale = 4, flip = false) {
  const key = `${name}:${scale}:${flip}`;
  if (cache.has(key)) return cache.get(key);
  const rows = SPRITES[name];
  const pal = { ...PALETTE, ...(OWN[name] || {}) };
  const c = document.createElement('canvas');
  c.width = 16 * scale; c.height = 16 * scale;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = pal[ch];
    g.fillRect((flip ? 15 - x : x) * scale, y * scale, scale, scale);
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
