// 원정 그림. 적 · 엘리트는 512px 도트 그림(assets/run/<id>.webp), 보스는 협동 보스 그림(assets/boss)을 그대로 쓴다.
// 아래 MON 은 처음 쓰던 16×16 임시본 (그림 파일이 없는 적만 이것으로 그린다).
// 지도 · 키워드 · 물약 아이콘, 카드 틀, 장면, 막 배경도 여기서 주소를 만든다 (tools/make_run_art.py 로 변환).
import { spriteURL } from '../pixel.js';
import { ico } from '../icons.js';

// 원정 그림 주소의 버전 — 게임 버전이 아니다 (게임 버전으로 하면 업데이트마다 원정 그림 전부를 다시 받아 느려지고 검게 빈다).
// assets/run/ 의 그림 파일을 바꾸거나 더하면 이것을 올린다 (CLAUDE.md)
export const RUN_ART_VER = 'r6';
const AV = `?v=${RUN_ART_VER}`;
// 그림 파일이 생긴 적 (예: ['slime', 'goblin'])
const FILES = ['slime', 'goblin', 'bat', 'wolf', 'shaman', 'mimic', 'skeleton', 'ghost', 'wisp', 'knight', 'golem', 'imp', 'hound', 'gargoyle', 'shade', 'champion'];
const K = '#1A1030';
const MON = {
  slime: { pal: { g: '#6BE06B', G: '#2E9E4A', w: '#FFFFFF' }, rows: [
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkggggkk....',
    '...kgggggggGk...',
    '..kgwwggggggGk..',
    '..kgwggggggggk..',
    '.kggggggggggggk.',
    '.kggkkggggkkggk.',
    '.kggkwggggkwggk.',
    '.kgggggggggggGk.',
    '.kggggGGGGgggGk.',
    '..kGGGGGGGGGGk..',
    '...kkkkkkkkkk...',
    '................'] },
  goblin: { pal: { g: '#7CC24A', G: '#4A8A2A', r: '#FF3B3B', w: '#FFFFFF', d: '#8A5A2A', y: '#FFC83D', s: '#C8D0E0' }, rows: [
    '................',
    '....kkkkkkkk....',
    'k..kggggggggk..k',
    'kk.kggggggggk.kk',
    'kgkggrrggrrggkgk',
    '.kgggrkggkrgggk.',
    '..kggggggggggk..',
    '...kggwkkwggk...',
    '....kkggggkk..s.',
    '...kddddddddk.s.',
    '..kgkddddddkgks.',
    '..kgkdddyddkgkk.',
    '...kkddddddkk...',
    '....kdk..kdk....',
    '....kkk..kkk....',
    '................'] },
  bat: { pal: { p: '#8A5CC8', P: '#4A2A7A', r: '#FF3B3B', w: '#FFFFFF' }, rows: [
    '................',
    '................',
    'k..............k',
    'kk.....kk.....kk',
    'kpk...kppk...kpk',
    'kppk.kppppk.kppk',
    'kpppkprpprpkpppk',
    'kppppppppppppppk',
    'kpPpppkwwkpppPpk',
    '.kPPpPppppppPPk.',
    '..kk.kPpppPk.kk.',
    '......kPPk......',
    '.......kk.......',
    '................',
    '................',
    '................'] },
  wolf: { pal: { g: '#9AA4B8', G: '#5A6478', y: '#FFD24A', w: '#F2F2F2' }, rows: [
    '................',
    '..k..........k..',
    '.kGk........kGk.',
    '.kgGk......kGgk.',
    '.kggGkkkkkkGggk.',
    '..kggggggggggk..',
    '.kggggggggggggk.',
    '.kgyykggggkyygk.',
    '.kgykkggggkkygk.',
    '..kgggwwwwgggk..',
    '...kgwkkkkwgk...',
    '...kgwwkkwwgk...',
    '....kgwwwwgk....',
    '.....kkkkkk.....',
    '................',
    '................'] },
  shaman: { pal: { m: '#7A3AA8', g: '#7CC24A', r: '#FF3B3B', w: '#FFFFFF', c: '#7CF2FF', d: '#8A5A2A', y: '#FFC83D' }, rows: [
    '...........kk...',
    '....kkkk..kcck..',
    '...kmmmmk.kcck..',
    '..kmmmmmmk.kk...',
    '..kmgrgrmk..d...',
    '.kmggggggmk.d...',
    '.kmgwkkwgmk.d...',
    '..kkggggkk..d...',
    '.kmmmmmmmmk.d...',
    'kmmmmyymmmmkd...',
    'kgkmmmmmmkgkd...',
    'kgkmmmmmmkgkd...',
    '.k.kmmmmk.k.d...',
    '...kmk.kmk..d...',
    '...kkk.kkk..k...',
    '................'] },
  mimic: { pal: { d: '#9A5A2A', y: '#FFC83D', w: '#FFFFFF', r: '#E8435A', x: '#2A0A14' }, rows: [
    '................',
    '..kkkkkkkkkkkk..',
    '.kddddddddddddk.',
    '.kdydwrkddwrkdk.',
    '.kddddddddddddk.',
    '.kyyyyyyyyyyyyk.',
    '.kwxwxwxwxwxwxk.',
    '.kxxxxxxxxxxxxk.',
    '.kxxxxrrrrxxxxk.',
    '.kxxxrrrrrrxxxk.',
    '.kwxwxwxwxwxwxk.',
    '.kyyyyyyyyyyyyk.',
    '.kddddyyyyddddk.',
    '.kddddykkyddddk.',
    '.kkkkkkkkkkkkkk.',
    '................'] },
  skeleton: { pal: { w: '#EEE6D0', W: '#B8AE92', r: '#FF5A3A', s: '#C8D0E0' }, rows: [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwkkwwkkwk...',
    '...kwkrwwkrwk...',
    '...kwwwkkwwwk...',
    '....kwkwkwkk....',
    '.....kkkkkk..s..',
    '...kWkwwwwkWks..',
    '..kw.kwkkwk.wks.',
    '..kw.kwwwwk..kk.',
    '...k.kwkkwk.....',
    '.....kw..wk.....',
    '.....kw..wk.....',
    '.....kk..kk.....'] },
  ghost: { pal: { b: '#C8E8FF', B: '#7CA8D8', x: '#1A1030' }, rows: [
    '................',
    '.....kkkkkk.....',
    '....kbbbbbbk....',
    '...kbbbbbbbbk...',
    '..kbbkkbbkkbbk..',
    '..kbbkkbbkkbbk..',
    '..kbbbbbbbbbbk..',
    '..kbbbkkkkbbbk..',
    '..kbbbkxxkbbbk..',
    '..kbbbbkkbbbbk..',
    '..kbbbbbbbbbbk..',
    '..kbbBbbbbBbbk..',
    '..kbBkbBBbkBbk..',
    '..kBk.kBBk.kBk..',
    '...k...kk...k...',
    '................'] },
  wisp: { pal: { c: '#7CE0FF', b: '#3AA8FF', w: '#FFFFFF' }, rows: [
    '.......kk.......',
    '......kck.......',
    '.....kccck......',
    '....kcwccck.....',
    '...kcwwccbck....',
    '...kcwcccbbk....',
    '..kccccccbbbk...',
    '..kcckccckcbk...',
    '..kccwkcwkcbk...',
    '..kcccccccbbk...',
    '...kccckccbk....',
    '...kbcccccbk....',
    '....kbbcbbk.....',
    '.....kbbbk......',
    '......kkk.......',
    '................'] },
  knight: { pal: { a: '#4A4A6A', A: '#2A2A40', r: '#FF3B3B', s: '#A8B0C8' }, rows: [
    '................',
    '....kkkkkk...s..',
    '...kaaaaaak..s..',
    '..kaAaaaaAak.s..',
    '..kakkkkkkak.s..',
    '..kakrkkrkak.s..',
    '..kaAkkkkAak.s..',
    '...kaaaaaak.kkk.',
    '..kaaaAAaaaakk..',
    '.kaAaaaaaaAak...',
    '.kakaaaaaakak...',
    '.kakaAAAAakak...',
    '..k.kaaaak.k....',
    '....kak.kak.....',
    '....kak.kak.....',
    '....kkk.kkk.....'] },
  golem: { pal: { s: '#A8A090', S: '#6A6458', y: '#7CF2FF' }, rows: [
    '................',
    '....kkkkkkkk....',
    '...kssssssssk...',
    '...ksSyssySsk...',
    '...ksssssssSk...',
    '.kkkkSSSSSSkkkk.',
    'kssskssssssksssk',
    'ksSskssyysskssSk',
    'ksSskssyysskssSk',
    'kssskSssssSkssk.',
    '.kkkkssSSsskkk..',
    '....kssk.ssk....',
    '...ksssk.ksssk..',
    '...kSSSk.kSSSk..',
    '...kkkkk.kkkkk..',
    '................'] },
  imp: { pal: { r: '#E8435A', w: '#FFF3D6', y: '#FFD24A', p: '#7A1E3A' }, rows: [
    '................',
    '..k..........k..',
    '.kwk........kwk.',
    '.kwrk.kkkk.krwk.',
    '..krkkrrrrkkrk..',
    '...krrrrrrrrk...',
    '..kryykrrkyyrk..',
    '..krrrrrrrrrrk..',
    '...krrwkkwrrk...',
    '..k.krrrrrrk.k..',
    '.kpk.krrrrk.kpk.',
    '.kppkrrrrrrkppk.',
    '..kk.krrrrk.kk..',
    '....krk..krk..k.',
    '....kk....kk.kk.',
    '..............k.'] },
  hound: { pal: { f: '#FF8A1A', d: '#2A2030', r: '#FF3B3B', w: '#FFFFFF' }, rows: [
    '................',
    '.kk..........kk.',
    '.kfk........kfk.',
    '.kffk.kkkk.kffk.',
    '..kffkddddkffk..',
    '..kfddddddddfk..',
    '.kfddrrddrrddfk.',
    '.kfddrkddkrddfk.',
    '..kddddddddddk..',
    '..kdddwwwwdddk..',
    '...kdwkkkkwdk...',
    '...kdwwkkwwdk...',
    '....kdwwwwdk....',
    '.....kkkkkk.....',
    '................',
    '................'] },
  gargoyle: { pal: { s: '#8A8FA8', S: '#5A5F78', y: '#FF5A3A', w: '#FFFFFF' }, rows: [
    '................',
    'k...k......k...k',
    'kk..kk....kk..kk',
    'ksk.kskkkksk.ksk',
    'kssk.kssssk.kssk',
    'ksssksyssyskssk.',
    'kssssksssskssssk',
    '.ksssskwwkssssk.',
    '..kssssssssssk..',
    '...ksSssssSsk...',
    '..kssSkSSkSssk..',
    '..ksk.kSSk.ksk..',
    '..kk.kssssk.kk..',
    '....ksk..ksk....',
    '....kkk..kkk....',
    '................'] },
  shade: { pal: { x: '#2A1E3A', X: '#4A3A6A', v: '#C99BFF', s: '#D8E4F0' }, rows: [
    '................',
    '.....kkkkkk.....',
    '....kxxxxxxk....',
    '...kxxxxxxxxk...',
    '...kxkkkkkkxk...',
    '...kxkvkkvkxk...',
    '...kxkkkkkkxk...',
    '....kxxxxxxk....',
    '..kkxxxxxxxxkk..',
    '.ksxkxxxxxxkxsk.',
    '.kskxxxxxxxxksk.',
    '..k.kxxXXxxk.k..',
    '....kxxXXxxk....',
    '....kxk..kxk....',
    '....kkk..kkk....',
    '................'] },
  champion: { pal: { a: '#3A3A5A', A: '#6A6A8A', r: '#FF3B3B', w: '#FFF3D6', c: '#A8203E', y: '#FFC83D' }, rows: [
    '..k..........k..',
    '.kwk........kwk.',
    '.kwwk.kkkk.kwwk.',
    '..kwkkaaaakkwk..',
    '...kaaaaaaaak...',
    '...kakrkkrkak...',
    '...kaaaaaaaak...',
    '..kccaaaaaacck..',
    '.kcaaAAyyAAaack.',
    '.kcaaaaaaaaaack.',
    '.kcakaaaaaakack.',
    '..kckaaaaaakck..',
    '...k.kaaaak.k...',
    '.....kak.kak....',
    '.....kkk.kkk....',
    '................'] },
};
export const MON_IDS = Object.keys(MON);

const cache = new Map();
function draw(id, scale) {
  const m = MON[id];
  const c = document.createElement('canvas');
  c.width = c.height = 16 * scale;
  const g = c.getContext('2d');
  const pal = { k: K, ...m.pal };
  m.rows.forEach((row, y) => [...row.padEnd(16, '.').slice(0, 16)].forEach((ch, x) => {
    if (ch === '.' || !pal[ch]) return;
    g.fillStyle = pal[ch];
    g.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c.toDataURL();
}
// 적 그림 주소: 보스는 협동 보스 그림, 그림 파일이 생긴 적은 그 파일, 나머지는 위 도트
// 히든 보스 「시공 광대」: 평소 · 비아냥 · 분노 (디자인 세션 그림, 512px)
export const JESTER_ART = ['jester', 'jester_taunt', 'jester_rage'];
export const jesterURL = (mode = '') => `assets/run/jester/${JESTER_ART.includes(`jester_${mode}`) ? `jester_${mode}` : 'jester'}.webp${AV}`;
// 미래 카드 가운데 그림 (assets/run/jester/icon_<id>.webp — 그림이 오면 id 를 적는다)
export const FUTURE_ICON = ['xpar', 'xpause', 'xrent'];
export const futureIconURL = id => (FUTURE_ICON.includes(id) ? `assets/run/jester/icon_${id}.webp${AV}` : null);
export function foeURL(id, scale = 6) {
  if (id === 'jester') return jesterURL();
  if (!MON[id]) return spriteURL(id, 4);
  if (FILES.includes(id)) return `assets/run/${id}.webp${AV}`;
  const key = `${id}:${scale}`;
  if (!cache.has(key)) cache.set(key, draw(id, scale));
  return cache.get(key);
}
// 왼쪽을 보는 적 그림: 화면 오른쪽 아래에 서는 영웅과 마주 보게 좌우를 뒤집어 그린다 (정면을 보는 그림은 그대로)
export const FACE_LEFT = [];   // 리스타일(r6) 그림은 모두 오른쪽(영웅 쪽)을 본다
export const facesLeft = id => FACE_LEFT.includes(id);
export const isPixelFoe = id => !!MON[id] && !FILES.includes(id) && id !== 'jester';

// 원정 전용 아이콘 그림 (assets/run/ui/<kind>_<id>.webp, 128px). 그림이 없으면 공용 12×12 아이콘
const UI = {
  node: ['fight', 'elite', 'event', 'shop', 'rest', 'treasure', 'boss'],
  kw: ['guard', 'vamp', 'burn', 'pierce', 'quick', 'lucky', 'weak', 'gold', 'echo', 'keep'],
  potion: ['heal', 'block', 'fire', 'time', 'power', 'pure'],
  meta: ['hp', 'gold', 'tools', 'potion', 'relic', 'sharp', 'seal', 'reshop', 'repick'],
  spec: ['ones', 'twos', 'threes'],      // 특별 카드 휘장 (에이스 주인공 · 듀스 두배 · 트레이 삼위일체)
  asc: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],   // 승천 단계 문장 (asc_<n>.webp)
  ui: ['star', 'asc', 'smith', 'shield', 'split_knob', 'deck', 'card_back', 'pouch',
    ...['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper'].map(k => `card_back_${k}`)],   // 직업 색 카드 뒷면
  seal: ['cloud', 'moon', 'star', 'sun'],
  omen: ['bounty', 'drought', 'feast', 'fog', 'forbid', 'glass', 'merchant', 'rift', 'rush', 'sealrain', 'war', 'regular', 'wish'],
  hex: ['burn', 'drums', 'freeze', 'gaze', 'haki', 'poison', 'reverse', 'seal', 'twist'],
  feat: ['act1', 'clear', 'flawless', 'ace30', 'lstr60', 'yacht', 'wall', 'rich', 'hoard', 'asc5', 'asc10', 'five'],                                   // 종류 없이 이름 그대로인 그림 (assets/run/ui/<id>.webp)
};
// 징조 창문 그림 (타로 카드풍 도트, assets/run/omen/<id>.webp — 디자인 세션이 만들면 id 를 적는다). 없으면 하늘색 + 아이콘
export const OMEN_WIN = ['feast', 'bounty', 'fog', 'forbid', 'rush', 'merchant', 'war', 'rift', 'sealrain', 'drought', 'glass', 'regular', 'wish'];
export const omenWinURL = id => (OMEN_WIN.includes(id) ? `assets/run/omen/${id}.webp${AV}` : null);
export function runIco(kind, id, fallback, cls = '') {
  if (!UI[kind]?.includes(id)) return ico(fallback, cls);
  return `<img class="ico run-ico${cls ? ' ' + cls : ''}" src="assets/run/ui/${kind === 'ui' ? id : `${kind}_${id}`}.webp${AV}" alt="">`;
}
// 아이콘이 아닌 원정 UI 그림 주소 (카드 뒷면 · 물약 주머니 — CSS background 로 쓴다)
export const uiArtURL = id => `assets/run/ui/${id}.webp${AV}`;
// 카드 뒷면: 직업 고유 색 (무희 분홍 · 도적 초록 …), 없는 직업이면 기본 빨강
export const cardBackURL = cls => uiArtURL(UI.ui.includes(`card_back_${cls}`) ? `card_back_${cls}` : 'card_back');
// 별조각 아이콘 (원정 밖 성장 화폐)
export const starIco = (cls = 'xs') => runIco('ui', 'star', 'star', cls);
// 상점 · 휴식 · 보물 · 이벤트 장면 그림 (assets/run/scene/<id>.webp, 512px)
const SCENES = ['start', 'shop', 'rest', 'treasure', 'chest', 'spring', 'altar', 'smith', 'gamble', 'shrine', 'library', 'trap', 'fairy', 'carver'];
export const sceneURL = id => (SCENES.includes(id) ? `assets/run/scene/${id}.webp${AV}` : null);
export const actBgURL = act => `assets/run/bg_act${Math.min(3, Math.max(1, act))}.webp${AV}`;

// 원정 시작 전에 미리 받아 둘 그림 · 글꼴 주소 전부 (로딩 화면). bosses: 보스 id (협동 보스 그림)
// 엘리트 공격 · 피격 자세 (assets/run/<id>_attack|_hurt.webp · tools/make_run_art_v2.py). 적이 덤빌 때 · 맞을 때 잠깐 그 그림으로
export const FOE_POSES = ['shaman', 'mimic', 'knight', 'golem', 'shade', 'champion'];
export const foePoseURL = (id, pose) => (FOE_POSES.includes(id) ? `assets/run/${id}_${pose}.webp${AV}` : null);
export function runAssetURLs(bosses = []) {
  const out = [
    ...FILES.map(id => `assets/run/${id}.webp${AV}`),
    ...FOE_POSES.flatMap(id => ['attack', 'hurt'].map(p => foePoseURL(id, p))),
    ...[1, 2, 3].map(actBgURL),
    ...SCENES.map(sceneURL),
    ...OMEN_WIN.map(omenWinURL),
    ...Object.entries(UI).flatMap(([kind, ids]) => ids.map(id => `assets/run/ui/${kind === 'ui' ? id : `${kind}_${id}`}.webp${AV}`)),
    ...['card_common', 'card_rare', 'card_legend'].map(n => `assets/run/ui/${n}.webp`),
    ...['claw', 'bite', 'star'].map(n => `assets/run/fx/${n}.webp`),
    ...bosses.map(id => foeURL(id)),
    ...JESTER_ART.map(n => `assets/run/jester/${n}.webp${AV}`),
    ...FUTURE_ICON.map(futureIconURL),
  ];
  return [...new Set(out)];
}
export const RUN_FONT = 'assets/run/fonts/Galmuri9-cards.woff2';
