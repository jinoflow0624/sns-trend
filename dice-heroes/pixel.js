import { GAME } from './config.js';
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
  "outlaw": [
    "................",
    "......kkkk......",
    ".....kHHHHk.....",
    "..kkkHHHHHHkkk..",
    ".kHHHHHHHHHHHHk.",
    "..kkkssssssskk..",
    "....kseksesk....",
    "....krrrrrrrk...",
    "....kkrrrrrkk...",
    "..kooooooooook..",
    ".kooyyyyyyyyook.",
    ".kooooooooooooks",
    "..kOOOOOOOOOOk.k",
    "...kjjjk.kjjjk..",
    "...kddk...kddk..",
    "...kkkk...kkkk.."
  ],
  "sharper": [
    "................",
    "....kkkkkkkk....",
    "...khhhhhhhhk...",
    "...khhhhhhhhk...",
    "...ksssssssssk..",
    "...kKKKsKKKsk...",
    "...ksssssSssk...",
    "....kksssskk....",
    "..kkjjmrmjjkk...",
    "kwkjjjmrmjjjkwk.",
    "krkjjjmmmjjjkrk.",
    "kwkjjjmmmjjjkwk.",
    "..kjjjjjjjjjk...",
    "...kjjjkjjjk....",
    "...kjjk..kjjk...",
    "...kkkk..kkkk..."
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

// 강화 보스 임시 도트: 원래 보스 도트를 바꿔 쓴다 (512px 그림을 받으면 IMG_SPRITES 로 교체)
SPRITES.hydra = SPRITES.dragon;
SPRITES.overlord = SPRITES.lich;
// 키클롭스: 오크 얼굴의 두 눈을 지우고 가운데 큰 외눈 하나
SPRITES.cyclops = SPRITES.orc.map((row, y) => {
  if (y < 10 || y > 12) return row;
  const r = [...row];
  for (let x = 10; x <= 22; x++) if ('Ke'.includes(r[x])) r[x] = 'g';
  const eye = { 10: 'KKKK', 11: 'KwrK', 12: 'KKKK' }[y];
  for (let k = 0; k < 4; k++) r[14 + k] = eye[k];
  return r.join('');
});

const PALETTE = {"k": "#1A1030", "s": "#F7C9A0", "S": "#DE9A74", "e": "#1A1030", "w": "#FFFFFF", "g": "#FFC83D", "d": "#5A3A2A", "b": "#D8ECFF", "h": "#6B3E26", "r": "#E8435A", "y": "#C9A36B", "o": "#E9B04E", "t": "#9CF2FF"};
const OWN = {"hydra": {"r": "#7A5CFF", "R": "#3E2A9A", "m": "#2FA88C", "M": "#1A6A5A", "b": "#8FE0C8", "B": "#4FB39A", "y": "#B8F27A", "Y": "#7AC23A", "e": "#7CF2FF", "E": "#2FB8D8", "f": "#7CF2FF", "F": "#C8FFFF", "w": "#FFF3D6", "W": "#CFC0A0", "K": "#1A1030", "k": "#1A1030"}, "cyclops": {"g": "#8FB8D8", "G": "#4A7090", "a": "#6A5A48", "A": "#3E3428", "m": "#A8A090", "M": "#6A6458", "w": "#F2EEDD", "W": "#C9C2A6", "f": "#5A4A3A", "F": "#3A2E22", "y": "#FFC83D", "Y": "#B8801A", "d": "#4A3A2A", "D": "#2A2014", "e": "#FF3B3B", "r": "#E8152A", "R": "#9C1C33", "s": "#C8C0B0", "S": "#8A8070", "K": "#1A1030", "k": "#1A1030"}, "overlord": {"q": "#7A1428", "Q": "#4A0A18", "p": "#A8203E", "P": "#6A0E26", "w": "#E8E0D0", "W": "#A89E8A", "y": "#FFD24A", "Y": "#C8860E", "c": "#FF5A3A", "C": "#C21E1E", "r": "#FF3B6A", "d": "#3A2A3A", "D": "#1A1020", "K": "#1A1030", "k": "#1A1030"}, "warrior": {"a": "#D9463E", "A": "#8E2226", "h": "#6B3E26"}, "rogue": {"m": "#2F8F6E", "h": "#2B2440"}, "mage": {"p": "#7B4BD6", "y": "#C9A36B"}, "bard": {"c": "#2F7FD6", "h": "#E3A546"}, "gambler": {"j": "#3A2E5C", "h": "#2B2440"}, "monk": {"o": "#E07A1F", "O": "#A34F12", "n": "#8E2226"}, "dancer": {"v": "#E84FA0", "V": "#9E2F72", "l": "#FFC83D", "h": "#3A1E2E", "r": "#FF5A6A"}, "outlaw": {"H": "#9A6232", "r": "#D9463E", "o": "#E08A3C", "O": "#A85A1E", "y": "#FFC83D", "j": "#3A4A7A", "d": "#6B3E26"}, "sharper": {"h": "#14101E", "K": "#0A0812", "j": "#1E2A3A", "m": "#4FD6C8", "r": "#D9263E", "w": "#FFF6E8"}, "fairy": {"y": "#FFE27A"}, "demon": {"k": "#12081E", "T": "#5A5064", "u": "#3A0E22", "C": "#D8D4E4", "c": "#6A6478", "r": "#FF2A6A", "h": "#ECE8F4", "H": "#A8A2BC", "s": "#F4E4EA", "S": "#D2B8C6", "e": "#A8102C", "E": "#FF3050", "m": "#B0305A", "d": "#2A2036", "D": "#150E1E", "l": "#9A94A8", "w": "#F0ECF8"}, "dragon": {"m": "#7A1E3A", "M": "#4A0E24", "b": "#E8B87A", "B": "#B8864A", "r": "#D9463E", "R": "#8E2226", "y": "#FFB34D", "Y": "#D9822A", "w": "#FFF3D6", "W": "#CFC0A0", "e": "#FFE24A", "E": "#FF8A1A", "f": "#FF5A1F", "F": "#FFD24A", "K": "#1A1030", "k": "#1A1030"}, "orc": {"g": "#6BBE45", "G": "#3F7F2A", "a": "#5A5F78", "A": "#373A50", "m": "#8A90A8", "M": "#5A5F78", "w": "#F2EEDD", "W": "#C9C2A6", "f": "#7A4A2A", "F": "#4A2A14", "y": "#FFC83D", "Y": "#B8801A", "d": "#5A3A2A", "D": "#3A2414", "e": "#FF3B3B", "r": "#E8435A", "R": "#9C1C33", "s": "#D8E4F0", "S": "#8A9AB0", "K": "#1A1030", "k": "#1A1030"}, "lich": {"q": "#4A3290", "Q": "#3A2474", "p": "#5A3AA0", "P": "#3A2470", "w": "#EEE6D0", "W": "#B8AE92", "y": "#FFC83D", "Y": "#B8801A", "c": "#7CF2FF", "C": "#2FB8D8", "r": "#E8435A", "d": "#6B4A2A", "D": "#3A2414", "K": "#1A1030", "k": "#1A1030"}};

const cache = new Map();

// 직업 그림 — 'v2' 새 그림(assets/heroes, tools/make_hero_sprites.py) · 'v1' 예전 16×16 도트(위의 SPRITES).
// 예전 그림으로 되돌리려면 이 줄만 'v1' 로 바꾼다. 주소에 ?art=v1 을 붙이면 그 기기에서만 잠깐 예전 그림으로 볼 수 있다.
const HERO_ART_DEFAULT = 'v2';
export const HERO_ART = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('art')) || HERO_ART_DEFAULT;
export const HERO_IDS = ['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper'];
// 직업별 동작 그림(선택): 'assets/heroes/<직업>_<charge|attack|hurt>.webp' 를 넣고 여기에 적으면 그 동작에서 그 그림으로 바뀐다.
// 없으면 기본 그림 하나를 움직여 동작을 만든다 (style.css 의 .actor).
export const HERO_POSES = {};   // 예: { warrior: ['attack', 'hurt'] }

// 그림 파일로 된 스프라이트 — 마왕 릴리스 (512px 도트 그림: 평소 · 분노) · 새 직업 그림. 파일을 받기 전에는 위의 도트로 대신 그린다
// 주소 끝 ?v=게임 버전: 그림을 바꿔 배포하면 오프라인 캐시에 남은 예전 그림 대신 바로 새 그림을 받는다 (sw.js)
const AV = `?v=${GAME.version}`;
const BOSS_ART = ['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon'];
const IMG_SPRITES = {
  // 보스 8종 그림 (tools/make_boss_sprites.py로 도트화). 분노는 그림을 바꾸지 않고 연출로만 보여 준다
  ...Object.fromEntries(BOSS_ART.map(id => [id, `assets/boss/${id}.png${AV}`])),
  ...(HERO_ART === 'v1' ? {} : Object.fromEntries(HERO_IDS.flatMap(id => [[id, `assets/heroes/${id}.webp${AV}`],
    ...(HERO_POSES[id] || []).map(pose => [`${id}_${pose}`, `assets/heroes/${id}_${pose}.webp${AV}`])]))),
};
export const heroPoseURL = (id, pose) => (IMG_SPRITES[`${id}_${pose}`] || IMG_SPRITES[id] || null);
const imgs = {};
export const isImgSprite = name => !!IMG_SPRITES[name];
export function preloadSprites() {
  if (typeof Image === 'undefined') return;
  for (const [k, url] of Object.entries(IMG_SPRITES)) {
    if (imgs[k]) continue;
    const im = new Image();
    im.onload = () => {
      for (const key of [...cache.keys()]) if (key.startsWith(k + ':')) cache.delete(key);   // 대신 그린 도트는 지운다
      im.decode?.().catch(() => {});   // 처음 화면에 나올 때 압축을 푸느라 멈칫하지 않게 미리 풀어 둔다
    };
    im.decoding = 'async';
    im.src = url;
    imgs[k] = im;
  }
}
preloadSprites();

function imgCanvas(name, scale, flip) {
  const im = imgs[name];
  if (!im?.complete || !im.naturalWidth) return null;
  // 그림은 도트보다 촘촘해서 2배 크기로 뽑는다 (화면에서는 부드럽게 줄여 보인다 · .spr-hi)
  const size = Math.min(im.naturalWidth, 32 * scale * 2);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = size < im.naturalWidth;
  g.imageSmoothingQuality = 'high';
  if (flip) { g.translate(size, 0); g.scale(-1, 1); }
  g.drawImage(im, 0, 0, size, size);
  return c;
}

// 스프라이트를 확대한 캔버스 (도트가 번지지 않게 정수 배율)
export function spriteCanvas(name, scale = 4, flip = false) {
  const key = `${name}:${scale}:${flip}`;
  if (cache.has(key)) return cache.get(key);
  if (IMG_SPRITES[name]) {
    const c = imgCanvas(name, scale, flip);
    if (c) { cache.set(key, c); return c; }
    if (!SPRITES[name]) return spriteCanvas(/^(arch)?demon/.test(name) ? 'demon' : name.split('_')[0], scale, flip);   // 분노·동작 그림을 받기 전: 평소 도트로
  }
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

// <img src> 용 주소. 그림 파일은 파일 주소 그대로 (브라우저가 한 번 풀어 두고 다시 쓴다).
// 예전엔 화면을 다시 그릴 때마다 256~512px 캔버스를 PNG 글자로 다시 만들어(toDataURL) 폰에서 버벅였다 — 도트도 한 번만 만든다
const urls = new Map();
export function spriteURL(name, scale = 4) {
  if (IMG_SPRITES[name]) return IMG_SPRITES[name];
  const key = `${name}:${scale}`;
  if (!urls.has(key)) urls.set(key, spriteCanvas(name, scale).toDataURL());
  return urls.get(key);
}

export function drawSprite(g, name, x, y, scale = 4, flip = false) {
  g.drawImage(spriteCanvas(name, scale, flip), Math.round(x), Math.round(y));
}
