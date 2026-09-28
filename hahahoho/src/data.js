// 게임 데이터 — 아이템 · 직업 · 작물 · 레시피 · 몬스터 · NPC · 상점 · 집 레벨.
// 순수 데이터라 브라우저와 테스트(Node)가 함께 쓴다.

// ── 시간 ─────────────────────────────────────────────────────────────────────
// 게임 속 하루 = 현실 24분 (게임 1시간 = 현실 1분). 모든 사람이 같은 시계를 쓴다.
export const DAY_MS = 24 * 60 * 1000;
export const HOUR_MS = DAY_MS / 24;
export const MIN = 60 * 1000;
export const REAL_HOUR = 60 * MIN; // 현실 1시간 (방치·일꾼 시간은 현실 시간 기준)
// 하루는 오전 6시에 시작해 밤 12시에 끝난다. 그때까지 침대에서 자지 않으면 쓰러진다.
// 커피를 마신 날은 새벽 2시(26시)까지 버틸 수 있다. 모두가 잠들면 그 자리에서 하루가 끝난다.
export const DAY_START_H = 6;
export const BEDTIME_H = 24;
export const COFFEE_H = 26;

// ── 능력치 ───────────────────────────────────────────────────────────────────
export const STATS = {
  hp: '체력', en: '기력', str: '힘', dex: '민첩', luk: '행운', crf: '손재주',
};
export const SKILLS = {
  farm: '농사', mine: '채광', fish: '낚시', combat: '전투', cook: '요리', sew: '재봉',
};

// ── 직업 ─────────────────────────────────────────────────────────────────────
// 초기 능력치 합은 직업마다 비슷하게 맞추고(체력·기력 제외 25~26), 전문 분야에 몰아 준다.
export const JOBS = {
  farmer: {
    name: '농부', color: '#7fbf4d',
    desc: '작물이 10% 빨리 자라고, 수확할 때 가끔 한 개 더 얻습니다.',
    stats: { hp: 100, en: 130, str: 6, dex: 5, luk: 6, crf: 5 },
    skills: { farm: 3 },
    tools: { hoe: 2, can: 2 },
    items: [['seed_turnip', 12], ['seed_potato', 6], ['bread', 3]],
    perk: { growth: 0.10, bonusHarvest: 0.2 },
  },
  miner: {
    name: '광부', color: '#c08a55',
    desc: '곡괭이 한 번에 더 많이 캐고, 광석이 더 자주 나옵니다.',
    stats: { hp: 115, en: 115, str: 9, dex: 4, luk: 5, crf: 4 },
    skills: { mine: 3 },
    tools: { pick: 2 },
    items: [['bread', 4], ['copper_ore', 3]],
    perk: { mineDmg: 1, oreLuck: 0.15 },
  },
  fisher: {
    name: '어부', color: '#4d9fd6',
    desc: '입질이 빨리 오고, 낚시 판정 구간이 넓습니다.',
    stats: { hp: 95, en: 120, str: 5, dex: 8, luk: 8, crf: 4 },
    skills: { fish: 3 },
    tools: { rod: 2 },
    items: [['bait', 15], ['bread', 3]],
    perk: { biteSpeed: 0.3, zone: 0.25 },
  },
  hunter: {
    name: '사냥꾼', color: '#c0584d',
    desc: '공격력이 높고, 몬스터가 전리품을 더 많이 떨어뜨립니다.',
    stats: { hp: 125, en: 105, str: 9, dex: 8, luk: 5, crf: 3 },
    skills: { combat: 3 },
    tools: { sword: 2 },
    items: [['bread', 3], ['herb_salve', 3]],
    perk: { atk: 0.2, loot: 0.25 },
  },
  cook: {
    name: '요리사', color: '#e0a03a',
    desc: '요리가 두 개씩 나올 때가 있고, 음식 효과가 30% 셉니다.',
    stats: { hp: 100, en: 120, str: 4, dex: 6, luk: 7, crf: 8 },
    skills: { cook: 3 },
    tools: {},
    items: [['potato', 4], ['turnip', 4], ['wheat', 4], ['mushroom', 2]],
    perk: { foodPower: 0.3, doubleCook: 0.25 },
  },
  tailor: {
    name: '재봉사', color: '#b06fd0',
    desc: '옷을 만들 때 재료가 덜 들고, 옷 능력치가 +1 붙습니다.',
    stats: { hp: 95, en: 115, str: 4, dex: 7, luk: 6, crf: 9 },
    skills: { sew: 3 },
    tools: {},
    items: [['cloth', 4], ['cotton', 4], ['dye_red', 1], ['dye_blue', 1]],
    perk: { saveMat: 0.25, clothBonus: 1 },
  },
};

// ── 도구 ─────────────────────────────────────────────────────────────────────
export const TOOLS = {
  hoe: { name: '괭이', skill: 'farm' },
  can: { name: '물뿌리개', skill: 'farm' },
  pick: { name: '곡괭이', skill: 'mine' },
  axe: { name: '도끼', skill: 'farm' },
  rod: { name: '낚싯대', skill: 'fish' },
  sword: { name: '검', skill: 'combat' },
};
export const TOOL_TIERS = ['', '나무', '구리', '철', '금'];
export const TOOL_TIER_COLOR = ['', '#a57a4a', '#d98c4a', '#c8d0da', '#f2c94c'];
// 다음 단계로 올리는 비용 (현재 단계 → +1)
export const TOOL_UPGRADE = {
  1: { gold: 200, items: [['copper_ore', 5], ['wood', 5]] },
  2: { gold: 600, items: [['iron_ore', 6], ['coal', 3]] },
  3: { gold: 1500, items: [['gold_ore', 6], ['gem', 1]] },
};

// ── 아이템 ───────────────────────────────────────────────────────────────────
// type: seed crop ore mat fish food forage drop cloth(옷) furniture
// sprite: sprites.js 가 그리는 아이콘 종류와 색
const I = (id, name, type, price, sprite, extra = {}) => ({ id, name, type, price, sprite, stack: 99, ...extra });

export const ITEMS = Object.fromEntries([
  // 씨앗
  I('seed_turnip', '순무 씨앗', 'seed', 15, { kind: 'seed', c: '#e8e0f0' }, { crop: 'turnip' }),
  I('seed_potato', '감자 씨앗', 'seed', 25, { kind: 'seed', c: '#c9a36b' }, { crop: 'potato' }),
  I('seed_carrot', '당근 씨앗', 'seed', 20, { kind: 'seed', c: '#f08a2c' }, { crop: 'carrot' }),
  I('seed_wheat', '밀 씨앗', 'seed', 15, { kind: 'seed', c: '#e8c65a' }, { crop: 'wheat' }),
  I('seed_tomato', '토마토 씨앗', 'seed', 35, { kind: 'seed', c: '#e04a3a' }, { crop: 'tomato' }),
  I('seed_cotton', '목화 씨앗', 'seed', 40, { kind: 'seed', c: '#f4f4f4' }, { crop: 'cotton' }),
  I('seed_strawberry', '딸기 씨앗', 'seed', 50, { kind: 'seed', c: '#ff5a78' }, { crop: 'strawberry' }),
  I('seed_pumpkin', '호박 씨앗', 'seed', 90, { kind: 'seed', c: '#f39c1f' }, { crop: 'pumpkin' }),
  I('seed_coffee', '커피 씨앗', 'seed', 45, { kind: 'seed', c: '#6a3a1a' }, { crop: 'coffee' }),
  // 작물
  I('turnip', '순무', 'crop', 35, { kind: 'turnip', c: '#f1e7f6', c2: '#9c5fc0' }),
  I('potato', '감자', 'crop', 55, { kind: 'potato', c: '#c9a36b' }),
  I('carrot', '당근', 'crop', 48, { kind: 'carrot', c: '#f08a2c' }),
  I('wheat', '밀', 'crop', 40, { kind: 'wheat', c: '#e8c65a' }),
  I('tomato', '토마토', 'crop', 75, { kind: 'round', c: '#e0412f', c2: '#3d8c3a' }),
  I('cotton', '목화', 'crop', 80, { kind: 'cotton', c: '#ffffff' }),
  I('strawberry', '딸기', 'crop', 120, { kind: 'berry', c: '#ff3c5a' }),
  I('pumpkin', '호박', 'crop', 260, { kind: 'round', c: '#f08a1c', c2: '#5f8c2a', big: 1 }),
  I('coffee_bean', '커피콩', 'crop', 40, { kind: 'bean', c: '#6a3a1a' }),
  // 채집
  I('wood', '나무', 'mat', 8, { kind: 'log', c: '#9a6a3c' }),
  I('stone', '돌', 'mat', 5, { kind: 'rock', c: '#9aa0a8' }),
  I('berry', '산딸기', 'forage', 30, { kind: 'berry', c: '#8a3cc8' }),
  I('mushroom', '버섯', 'forage', 45, { kind: 'mushroom', c: '#d6452f' }),
  I('flower', '들꽃', 'forage', 25, { kind: 'flower', c: '#ffd23c' }),
  I('herb', '약초', 'forage', 35, { kind: 'leaf', c: '#4cb24a' }),
  // 광석
  I('coal', '석탄', 'ore', 20, { kind: 'ore', c: '#2c2c34' }),
  I('copper_ore', '구리 광석', 'ore', 30, { kind: 'ore', c: '#e08a4a' }),
  I('iron_ore', '철광석', 'ore', 60, { kind: 'ore', c: '#d8dde6' }),
  I('gold_ore', '금광석', 'ore', 140, { kind: 'ore', c: '#ffd23c' }),
  I('gem', '자수정', 'ore', 320, { kind: 'gem', c: '#b565f0' }),
  I('ruby', '루비', 'ore', 600, { kind: 'gem', c: '#ff2d55' }),
  // 물고기
  I('fish_crucian', '붕어', 'fish', 40, { kind: 'fish', c: '#9aa66a' }, { fishLv: 1 }),
  I('fish_carp', '잉어', 'fish', 70, { kind: 'fish', c: '#d8894a' }, { fishLv: 2 }),
  I('fish_trout', '송어', 'fish', 110, { kind: 'fish', c: '#e89ab0' }, { fishLv: 3 }),
  I('fish_catfish', '메기', 'fish', 150, { kind: 'fish', c: '#6a6058' }, { fishLv: 4 }),
  I('fish_salmon', '연어', 'fish', 200, { kind: 'fish', c: '#ff8a64' }, { fishLv: 5 }),
  I('fish_gold', '황금 잉어', 'fish', 800, { kind: 'fish', c: '#ffd23c' }, { fishLv: 8 }),
  I('boot', '낡은 장화', 'mat', 1, { kind: 'boot', c: '#5a4a3a' }),
  I('bait', '미끼', 'mat', 5, { kind: 'bait', c: '#c07a5a' }),
  // 몬스터 전리품
  I('slime_gel', '슬라임 젤리', 'drop', 20, { kind: 'gel', c: '#6ad66a' }),
  I('fur', '토끼 털', 'drop', 45, { kind: 'fur', c: '#efe6d8' }),
  I('meat', '멧돼지 고기', 'drop', 90, { kind: 'meat', c: '#d6604a' }),
  I('bat_wing', '박쥐 날개', 'drop', 55, { kind: 'wing', c: '#5a4a7a' }),
  I('bone', '뼈 조각', 'drop', 70, { kind: 'bone', c: '#efe8d8' }),
  I('golem_core', '골렘의 심장', 'drop', 900, { kind: 'gem', c: '#46d6c8' }),
  // 가공 재료
  I('cloth', '천', 'mat', 120, { kind: 'cloth', c: '#f4efe4' }),
  I('wool', '털실', 'mat', 110, { kind: 'yarn', c: '#f0d6e8' }),
  I('flour', '밀가루', 'mat', 60, { kind: 'sack', c: '#f4efe4' }),
  I('dye_red', '빨간 염료', 'mat', 60, { kind: 'dye', c: '#e0412f' }),
  I('dye_blue', '파란 염료', 'mat', 60, { kind: 'dye', c: '#3a7ae0' }),
  I('dye_yellow', '노란 염료', 'mat', 60, { kind: 'dye', c: '#ffd23c' }),
  I('iron_bar', '철 주괴', 'mat', 220, { kind: 'bar', c: '#c8d0da' }),
  // 양동이: 물가에서 든 채로 물을 누르면 물 양동이가 된다. 물 양동이 하나로 커피 10잔.
  I('bucket', '양동이', 'mat', 240, { kind: 'bucket', c: '#9aa4b0' }, { stack: 20 }),
  I('water_bucket', '물 양동이', 'mat', 250, { kind: 'bucket', c: '#9aa4b0', c2: '#5ab4f0' }, { stack: 20 }),
  // 음식 (en: 기력 회복, hp: 체력 회복, buff: 30분 버프)
  I('bread', '빵', 'food', 30, { kind: 'bread', c: '#d8a45a' }, { en: 30, hp: 5 }),
  I('herb_salve', '약초 연고', 'food', 60, { kind: 'jar', c: '#4cb24a' }, { hp: 50 }),
  I('baked_potato', '구운 감자', 'food', 90, { kind: 'dish', c: '#c9a36b' }, { en: 45, hp: 10 }),
  I('veggie_soup', '채소 수프', 'food', 160, { kind: 'bowl', c: '#e8a04a' }, { en: 70, hp: 30 }),
  I('berry_toast', '딸기잼 토스트', 'food', 250, { kind: 'dish', c: '#ff3c5a' }, { en: 90, hp: 20, buff: { luk: 2 } }),
  I('grilled_fish', '생선구이', 'food', 130, { kind: 'dish', c: '#9aa66a' }, { en: 40, hp: 50 }),
  I('mushroom_stew', '버섯 스튜', 'food', 260, { kind: 'bowl', c: '#a85a3a' }, { en: 100, hp: 50 }),
  I('pumpkin_pie', '호박 파이', 'food', 620, { kind: 'pie', c: '#f08a1c' }, { en: 160, hp: 60, buff: { luk: 3, crf: 2 } }),
  I('bbq', '멧돼지 바비큐', 'food', 380, { kind: 'dish', c: '#b0402a' }, { en: 60, hp: 120, buff: { str: 3 } }),
  I('spicy_stew', '얼큰 매운탕', 'food', 420, { kind: 'bowl', c: '#e0412f' }, { en: 110, hp: 110, buff: { dex: 2 } }),
  I('tomato_pasta', '토마토 파스타', 'food', 300, { kind: 'bowl', c: '#e05a3a' }, { en: 110, hp: 40, buff: { crf: 2 } }),
  I('sushi', '연어 초밥', 'food', 520, { kind: 'dish', c: '#ff8a64' }, { en: 120, hp: 80, buff: { dex: 3 } }),
  // 커피: 마신 날은 새벽 2시까지 멀쩡하다 (하루 한 잔)
  I('coffee', '커피', 'food', 110, { kind: 'coffee', c: '#5a3218' }, { en: 25, caffeine: true }),
  // 옷 (slot: hat / top)
  I('straw_hat', '밀짚모자', 'cloth', 300, { kind: 'hat', c: '#e8c65a' }, { slot: 'hat', bonus: { farm: 1, luk: 1 }, look: '#e8c65a' }),
  I('work_shirt', '작업복 셔츠', 'cloth', 360, { kind: 'shirt', c: '#4d7fbf' }, { slot: 'top', bonus: { dex: 1, en: 10 }, look: '#4d7fbf' }),
  I('miner_helmet', '광부 헬멧', 'cloth', 480, { kind: 'hat', c: '#f2c94c' }, { slot: 'hat', bonus: { mine: 1, hp: 10 }, look: '#f2c94c' }),
  I('fisher_vest', '어부 조끼', 'cloth', 460, { kind: 'shirt', c: '#3a8c7a' }, { slot: 'top', bonus: { fish: 1, dex: 1 }, look: '#3a8c7a' }),
  I('hunter_cloak', '사냥꾼 망토', 'cloth', 620, { kind: 'shirt', c: '#7a3a2a' }, { slot: 'top', bonus: { combat: 1, str: 2 }, look: '#7a3a2a' }),
  I('chef_apron', '요리사 앞치마', 'cloth', 420, { kind: 'shirt', c: '#f4efe4' }, { slot: 'top', bonus: { cook: 1, crf: 1 }, look: '#f4efe4' }),
  I('red_dress', '빨간 원피스', 'cloth', 700, { kind: 'shirt', c: '#e0412f' }, { slot: 'top', bonus: { luk: 3 }, look: '#e0412f' }),
  I('wool_sweater', '털실 스웨터', 'cloth', 640, { kind: 'shirt', c: '#f0a6c8' }, { slot: 'top', bonus: { hp: 25, en: 15 }, look: '#f0a6c8' }),
  I('beret', '파란 베레모', 'cloth', 380, { kind: 'hat', c: '#3a7ae0' }, { slot: 'hat', bonus: { sew: 1, crf: 1 }, look: '#3a7ae0' }),
  I('flower_crown', '꽃 화관', 'cloth', 260, { kind: 'hat', c: '#ff8ac0' }, { slot: 'hat', bonus: { luk: 2 }, look: '#ff8ac0' }),
  // 가구 (w, h: 차지하는 칸)
  I('f_chair', '나무 의자', 'furniture', 150, { kind: 'f_chair', c: '#b07a4a' }, { w: 1, h: 1 }),
  I('f_table', '둥근 탁자', 'furniture', 280, { kind: 'f_table', c: '#b07a4a' }, { w: 2, h: 1 }),
  I('f_plant', '화분', 'furniture', 120, { kind: 'f_plant', c: '#4cb24a' }, { w: 1, h: 1 }),
  I('f_rug', '꽃무늬 러그', 'furniture', 240, { kind: 'f_rug', c: '#d0605a' }, { w: 2, h: 2, floor: true }),
  I('f_lamp', '스탠드 조명', 'furniture', 200, { kind: 'f_lamp', c: '#ffd88a' }, { w: 1, h: 1, light: true }),
  I('f_shelf', '책장', 'furniture', 350, { kind: 'f_shelf', c: '#8a5a32' }, { w: 2, h: 1 }),
  I('f_sofa', '폭신 소파', 'furniture', 520, { kind: 'f_sofa', c: '#5a8ad0' }, { w: 2, h: 1 }),
  I('f_tank', '어항', 'furniture', 400, { kind: 'f_tank', c: '#6ac6f0' }, { w: 1, h: 1 }),
  I('f_bear', '곰 인형', 'furniture', 180, { kind: 'f_bear', c: '#c08a55' }, { w: 1, h: 1 }),
  I('f_clock', '괘종시계', 'furniture', 450, { kind: 'f_clock', c: '#8a5a32' }, { w: 1, h: 1 }),
  I('f_fireplace', '벽난로', 'furniture', 800, { kind: 'f_fireplace', c: '#a85a3a' }, { w: 2, h: 1, light: true }),
  I('f_piano', '작은 피아노', 'furniture', 1200, { kind: 'f_piano', c: '#2c2c34' }, { w: 2, h: 1 }),
  // 쓰는 가구: 용광로(주괴 만들기) · 정수기(커피 내리기)
  I('f_furnace', '용광로', 'furniture', 420, { kind: 'f_furnace', c: '#8a8a94' }, { w: 1, h: 1, light: true, station: 'furnace' }),
  I('f_purifier', '정수기', 'furniture', 900, { kind: 'f_purifier', c: '#e8eef4' }, { w: 1, h: 1, purifier: true }),
].map(it => [it.id, it]));

export const itemName = id => ITEMS[id]?.name || id;

// ── 작물 ─────────────────────────────────────────────────────────────────────
// grow: 물을 준 상태로 다 자라는 데 걸리는 현실 시간(분). 물이 마르면 절반 속도.
export const CROPS = {
  turnip: { name: '순무', grow: 3, yield: [1, 2], xp: 6, color: '#9c5fc0', leaf: '#6fbf4a' },
  potato: { name: '감자', grow: 6, yield: [1, 3], xp: 9, color: '#c9a36b', leaf: '#4f9f3a' },
  carrot: { name: '당근', grow: 5, yield: [1, 2], xp: 8, color: '#f08a2c', leaf: '#5fbf3a' },
  wheat: { name: '밀', grow: 4, yield: [2, 3], xp: 6, color: '#e8c65a', leaf: '#b8a03a' },
  tomato: { name: '토마토', grow: 9, yield: [2, 3], xp: 12, color: '#e0412f', leaf: '#3d8c3a' },
  cotton: { name: '목화', grow: 10, yield: [1, 2], xp: 12, color: '#ffffff', leaf: '#6a9a4a' },
  strawberry: { name: '딸기', grow: 14, yield: [2, 4], xp: 18, color: '#ff3c5a', leaf: '#3d9c3a' },
  pumpkin: { name: '호박', grow: 28, yield: [1, 1], xp: 40, color: '#f08a1c', leaf: '#5f8c2a' },
  coffee: { name: '커피', grow: 12, yield: [2, 4], xp: 14, color: '#b0302a', leaf: '#2f7a3a', item: 'coffee_bean' },
};
export const WET_MS = 20 * MIN; // 물을 주면 20분 동안 촉촉함

// ── 레시피 ───────────────────────────────────────────────────────────────────
// station: stove(화덕) / sewing(재봉틀) / bench(작업대) / furnace(용광로)
export const RECIPES = [
  // 요리
  { id: 'r_baked_potato', out: ['baked_potato', 1], in: [['potato', 1]], station: 'stove', lv: 1, xp: 8 },
  { id: 'r_flour', out: ['flour', 1], in: [['wheat', 2]], station: 'stove', lv: 1, xp: 4 },
  { id: 'r_bread', out: ['bread', 2], in: [['flour', 1]], station: 'stove', lv: 1, xp: 5 },
  { id: 'r_veggie_soup', out: ['veggie_soup', 1], in: [['turnip', 1], ['carrot', 1]], station: 'stove', lv: 1, xp: 12 },
  { id: 'r_grilled_fish', out: ['grilled_fish', 1], in: [['fish_crucian', 1]], station: 'stove', lv: 1, xp: 10, alt: { fish_crucian: ['fish_carp', 'fish_trout'] } },
  { id: 'r_herb_salve', out: ['herb_salve', 1], in: [['herb', 2]], station: 'stove', lv: 1, xp: 6 },
  { id: 'r_berry_toast', out: ['berry_toast', 1], in: [['strawberry', 1], ['flour', 1]], station: 'stove', lv: 2, xp: 18 },
  { id: 'r_mushroom_stew', out: ['mushroom_stew', 1], in: [['mushroom', 2], ['potato', 1]], station: 'stove', lv: 2, xp: 20 },
  { id: 'r_tomato_pasta', out: ['tomato_pasta', 1], in: [['tomato', 2], ['flour', 1]], station: 'stove', lv: 3, xp: 24 },
  { id: 'r_bbq', out: ['bbq', 1], in: [['meat', 1], ['tomato', 1]], station: 'stove', lv: 3, xp: 28 },
  { id: 'r_spicy_stew', out: ['spicy_stew', 1], in: [['fish_catfish', 1], ['tomato', 1], ['mushroom', 1]], station: 'stove', lv: 4, xp: 34 },
  { id: 'r_sushi', out: ['sushi', 1], in: [['fish_salmon', 1], ['wheat', 1]], station: 'stove', lv: 4, xp: 36 },
  { id: 'r_pumpkin_pie', out: ['pumpkin_pie', 1], in: [['pumpkin', 1], ['flour', 2]], station: 'stove', lv: 5, xp: 50 },
  // 재봉
  { id: 'r_cloth', out: ['cloth', 1], in: [['cotton', 2]], station: 'sewing', lv: 1, xp: 6 },
  { id: 'r_wool', out: ['wool', 1], in: [['fur', 2]], station: 'sewing', lv: 1, xp: 6 },
  { id: 'r_dye_red', out: ['dye_red', 1], in: [['strawberry', 1], ['flower', 1]], station: 'sewing', lv: 1, xp: 4 },
  { id: 'r_dye_blue', out: ['dye_blue', 1], in: [['berry', 2]], station: 'sewing', lv: 1, xp: 4 },
  { id: 'r_dye_yellow', out: ['dye_yellow', 1], in: [['flower', 2]], station: 'sewing', lv: 1, xp: 4 },
  { id: 'r_flower_crown', out: ['flower_crown', 1], in: [['flower', 4], ['herb', 1]], station: 'sewing', lv: 1, xp: 10 },
  { id: 'r_straw_hat', out: ['straw_hat', 1], in: [['wheat', 4], ['cloth', 1]], station: 'sewing', lv: 1, xp: 14 },
  { id: 'r_work_shirt', out: ['work_shirt', 1], in: [['cloth', 2], ['dye_blue', 1]], station: 'sewing', lv: 2, xp: 18 },
  { id: 'r_chef_apron', out: ['chef_apron', 1], in: [['cloth', 3]], station: 'sewing', lv: 2, xp: 18 },
  { id: 'r_beret', out: ['beret', 1], in: [['wool', 1], ['dye_blue', 1]], station: 'sewing', lv: 2, xp: 20 },
  { id: 'r_fisher_vest', out: ['fisher_vest', 1], in: [['cloth', 2], ['wool', 1]], station: 'sewing', lv: 3, xp: 24 },
  { id: 'r_miner_helmet', out: ['miner_helmet', 1], in: [['iron_ore', 3], ['cloth', 1], ['dye_yellow', 1]], station: 'sewing', lv: 3, xp: 26 },
  { id: 'r_wool_sweater', out: ['wool_sweater', 1], in: [['wool', 3]], station: 'sewing', lv: 3, xp: 28 },
  { id: 'r_red_dress', out: ['red_dress', 1], in: [['cloth', 3], ['dye_red', 2]], station: 'sewing', lv: 4, xp: 34 },
  { id: 'r_hunter_cloak', out: ['hunter_cloak', 1], in: [['wool', 2], ['fur', 3], ['bone', 2]], station: 'sewing', lv: 4, xp: 36 },
  // 목공 (작업대)
  { id: 'r_f_chair', out: ['f_chair', 1], in: [['wood', 8]], station: 'bench', lv: 1, xp: 6 },
  { id: 'r_f_table', out: ['f_table', 1], in: [['wood', 14]], station: 'bench', lv: 1, xp: 8 },
  { id: 'r_f_plant', out: ['f_plant', 1], in: [['stone', 4], ['herb', 1]], station: 'bench', lv: 1, xp: 5 },
  { id: 'r_f_shelf', out: ['f_shelf', 1], in: [['wood', 20]], station: 'bench', lv: 1, xp: 10 },
  { id: 'r_f_lamp', out: ['f_lamp', 1], in: [['wood', 6], ['copper_ore', 3]], station: 'bench', lv: 1, xp: 8 },
  { id: 'r_f_rug', out: ['f_rug', 1], in: [['cloth', 2], ['dye_red', 1]], station: 'bench', lv: 1, xp: 10 },
  { id: 'r_f_bear', out: ['f_bear', 1], in: [['fur', 3], ['cloth', 1]], station: 'bench', lv: 1, xp: 10 },
  { id: 'r_f_tank', out: ['f_tank', 1], in: [['stone', 10], ['fish_carp', 1]], station: 'bench', lv: 1, xp: 12 },
  { id: 'r_f_fireplace', out: ['f_fireplace', 1], in: [['stone', 30], ['iron_ore', 4]], station: 'bench', lv: 1, xp: 20 },
  { id: 'r_f_furnace', out: ['f_furnace', 1], in: [['stone', 25], ['coal', 5]], station: 'bench', lv: 1, xp: 12 },
  { id: 'r_bucket', out: ['bucket', 1], in: [['iron_bar', 1]], station: 'bench', lv: 1, xp: 8 },
  { id: 'r_f_purifier', out: ['f_purifier', 1], in: [['iron_bar', 2], ['stone', 10], ['copper_ore', 3]], station: 'bench', lv: 1, xp: 16 },
  // 용광로 (집에 놓은 용광로를 누르면)
  { id: 'r_iron_bar', out: ['iron_bar', 1], in: [['iron_ore', 3], ['coal', 1]], station: 'furnace', lv: 1, xp: 10 },
];
export const STATION_NAME = { stove: '화덕 요리', sewing: '재봉틀', bench: '목공 작업대', furnace: '용광로' };
export const STATION_SKILL = { stove: 'cook', sewing: 'sew', bench: 'sew', furnace: 'mine' };

// 정수기: 물 양동이 하나를 끼우면 커피 10잔. 커피콩을 넣으면 한 잔에 현실 30초씩 차례로 내린다.
export const BREW_MS = 30 * 1000;
export const CUPS_PER_BUCKET = 10;
// 정수기는 기본 2개, 집 6·11·16…단계마다 하나씩 더 놓을 수 있다
export const purifierLimit = houseLv => 2 + Math.floor(Math.max(0, (houseLv || 1) - 1) / 5);

// ── 몬스터 ───────────────────────────────────────────────────────────────────
// passive: 먼저 공격하지 않고 도망친다 (사냥감)
export const MONSTERS = {
  slime: { name: '슬라임', hp: 20, atk: 5, spd: 1.4, xp: 6, drops: [['slime_gel', 0.8, 1, 2]], color: '#6ad66a' },
  rabbit: { name: '산토끼', hp: 14, atk: 0, spd: 3.2, xp: 8, passive: true, drops: [['fur', 0.9, 1, 2]], color: '#efe6d8' },
  boar: { name: '멧돼지', hp: 55, atk: 12, spd: 2.2, xp: 18, passive: true, angry: true, drops: [['meat', 0.9, 1, 1], ['fur', 0.3, 1, 1]], color: '#8a5a3a' },
  bat: { name: '동굴 박쥐', hp: 22, atk: 8, spd: 2.8, xp: 10, fly: true, drops: [['bat_wing', 0.7, 1, 1]], color: '#5a4a7a' },
  skeleton: { name: '해골 병사', hp: 60, atk: 14, spd: 1.8, xp: 24, drops: [['bone', 0.8, 1, 2], ['iron_ore', 0.3, 1, 2]], color: '#efe8d8' },
  golem: { name: '이끼 골렘', hp: 260, atk: 22, spd: 1.2, xp: 120, boss: true, drops: [['golem_core', 1, 1, 1], ['gem', 0.8, 1, 2], ['gold_ore', 1, 2, 4]], color: '#6a8a5a' },
};

// ── 상점 ─────────────────────────────────────────────────────────────────────
export const SHOPS = {
  market: {
    name: '봄이네 시장', npc: 'bomi',
    sells: ['seed_turnip', 'seed_potato', 'seed_carrot', 'seed_wheat', 'seed_tomato', 'seed_cotton', 'seed_strawberry', 'seed_pumpkin', 'seed_coffee', 'bread', 'bait', 'f_chair', 'f_plant', 'f_lamp', 'f_sofa', 'f_clock', 'f_piano', 'f_purifier'],
    buys: ['crop', 'forage', 'fish', 'ore', 'drop', 'food', 'mat', 'cloth', 'furniture'],
  },
  tailor: { name: '실비 의상실', npc: 'silvi', sells: ['cloth', 'dye_red', 'dye_blue', 'dye_yellow', 'wool'], buys: ['cloth', 'mat'] },
  diner: { name: '순자 할머니 식당', npc: 'sunja', sells: ['flour', 'mushroom', 'herb_salve', 'bread'], buys: ['food', 'crop'] },
  fisher: { name: '강태공 낚시점', npc: 'kang', sells: ['bait'], buys: ['fish'] },
  smith: { name: '철수 대장간', npc: 'chulsu', sells: ['coal', 'copper_ore', 'iron_bar', 'bucket'], buys: ['ore', 'drop', 'mat'] },
};

// ── 집 레벨 (모두가 함께 키운다) ─────────────────────────────────────────────
export const HOUSE_LEVELS = [
  null,
  { name: '작은 오두막', room: [9, 7], plots: 24, perks: '침대 · 보관함' },
  { name: '아늑한 집', room: [11, 8], plots: 36, perks: '집 안 화덕 · 가구 칸 확장', cost: { gold: 1500, items: [['wood', 60], ['stone', 40]] } },
  { name: '2층 집', room: [13, 9], plots: 48, perks: '집 안 재봉틀 · 작업대 · 작물 +5% 속도', cost: { gold: 5000, items: [['wood', 120], ['stone', 80], ['copper_ore', 20], ['cloth', 5]] } },
  { name: '정원 딸린 집', room: [15, 10], plots: 60, perks: '방치 보상 한도 16시간 · 작물 +10% 속도', cost: { gold: 15000, items: [['wood', 200], ['iron_ore', 30], ['gem', 2], ['wool', 5]] } },
  { name: '하하호호 대저택', room: [17, 11], plots: 72, perks: '모든 방치 보상 +25% · 작물 +15% 속도', cost: { gold: 40000, items: [['wood', 300], ['gold_ore', 20], ['ruby', 2], ['golem_core', 1]] } },
  // 6단계부터는 대저택을 계속 가꾼다. 6·11·16단계마다 정수기를 하나 더 놓을 수 있다.
  ...Array.from({ length: 15 }, (_, i) => {
    const lv = i + 6;
    const k = i + 1;
    const extra = (lv - 1) % 5 === 0;
    return {
      name: `하하호호 대저택 ${k}성`, room: [17, 11], plots: 72,
      perks: `${extra ? '정수기 +1 · ' : ''}작물 +${15 + k}% 속도`,
      cost: { gold: Math.round(50000 * 1.25 ** i / 1000) * 1000, items: [['wood', 200 + i * 40], ['iron_bar', 10 + i * 4], ['gold_ore', 10 + i * 3], ['gem', 2 + Math.floor(i / 2)]] },
    };
  }),
];
export const HOUSE_GROWTH = HOUSE_LEVELS.map((_, lv) => (lv < 3 ? 0 : (lv <= 5 ? (lv - 2) * 5 : 15 + (lv - 5)) / 100));

// ── 방치 활동 ────────────────────────────────────────────────────────────────
// 접속하지 않은 동안 캐릭터가 계속하는 일. 시간당 기대 수확량(기본값).
export const IDLE_JOBS = {
  farm: { name: '밭일 돕기', skill: 'farm', table: [['turnip', 5], ['potato', 3], ['wheat', 4], ['carrot', 3]] },
  mine: { name: '광산 채굴', skill: 'mine', table: [['stone', 10], ['coal', 3], ['copper_ore', 4], ['iron_ore', 1.5], ['gem', 0.15]] },
  fish: { name: '호숫가 낚시', skill: 'fish', table: [['fish_crucian', 3], ['fish_carp', 1.5], ['fish_trout', 0.6], ['fish_catfish', 0.25], ['boot', 0.4]] },
  hunt: { name: '숲 사냥', skill: 'combat', table: [['fur', 3], ['meat', 1], ['slime_gel', 3], ['bone', 0.4]] },
  forage: { name: '숲 채집', skill: 'farm', table: [['wood', 12], ['berry', 2], ['mushroom', 1.5], ['flower', 2.5], ['herb', 2]] },
};
export const IDLE_CAP_H = 8;

// ── NPC ─────────────────────────────────────────────────────────────────────
export const NPCS = {
  bomi: {
    name: '봄이', role: '시장 상인', look: { skin: '#f6d2b0', hair: '#7a3a2a', top: '#f08aa0', hairStyle: 'bun' },
    lines: ['어서 와요! 오늘 시세 좋아요~', '신선한 작물은 언제든 사요!', '호박은 비싸게 쳐 드릴게요.', '씨앗 필요하면 말만 해요!', '가판대에 올린 건 밤 12시에 제가 싹 사 갈게요.', '커피 씨앗 들어왔어요! 밤샘엔 커피죠~', '오늘도 부지런하네요?'],
  },
  chulsu: {
    name: '철수', role: '대장장이', look: { skin: '#e0b088', hair: '#2c2c34', top: '#6a6a78', hairStyle: 'short', beard: true },
    lines: ['쇠는 뜨거울 때 두드려야지.', '광석만 가져오면 도구를 튼튼하게 해 주마.', '금 곡괭이? 그건 네 실력에 달렸지.', '철광석 세 개에 석탄 하나면 주괴 하나야. 용광로는 작업대에서 만들고.', '주괴 하나면 양동이 하나 뚝딱이지.'],
  },
  silvi: {
    name: '실비', role: '재봉사', look: { skin: '#f6d2b0', hair: '#e8c65a', top: '#b06fd0', hairStyle: 'long' },
    lines: ['목화 두 송이면 천 한 장!', '옷이 날개라니까요~', '빨간 원피스는 행운을 불러와요.', '오늘 옷 예쁘다! 어디서 샀어요?', '바느질은 밤에 해야 잘 된다니까요.'],
  },
  sunja: {
    name: '순자 할머니', role: '식당 주인', look: { skin: '#f0c8a8', hair: '#d8d8d8', top: '#d0605a', hairStyle: 'bun' },
    lines: ['배고프면 일을 못 해. 먹고 가!', '버섯 스튜는 우리 집 자랑이란다.', '호박 파이 굽는 법 알려줄까?', '밤 12시 전엔 꼭 들어가 자거라. 길에서 쓰러지면 큰일 나.', '커피는 하루 한 잔만 마시는 거야.'],
  },
  kang: {
    name: '강태공', role: '낚시꾼', look: { skin: '#d8a078', hair: '#5a4a3a', top: '#3a8c7a', hairStyle: 'cap' },
    lines: ['물고기는 기다리는 자에게 온다네.', '황금 잉어를 봤다는 소문이 있어.', '미끼는 넉넉히 챙기게.', '양동이 들고 물가를 누르면 물을 뜰 수 있다네.'],
  },
  rea: {
    name: '레아', role: '모험가', look: { skin: '#e8b890', hair: '#c0584d', top: '#4a6a3a', hairStyle: 'pony' },
    lines: ['숲 깊은 곳에 오래된 유적이 있어.', '유적 5층마다 강한 녀석이 기다리고 있지.', '조심해, 해골 병사는 끈질기거든.'],
  },
  mayor: {
    name: '촌장님', role: '마을 촌장', look: { skin: '#f0c8a8', hair: '#f4f4f4', top: '#3a5a8c', hairStyle: 'bald', beard: true },
    lines: ['하하호호 마을에 온 걸 환영하네!', '게시판에 오늘의 부탁이 붙어 있다네.', '집을 크게 키우면 마을도 기뻐할 걸세.', '일찍 자고 일찍 일어나는 게 건강의 비결이지.'],
  },
  minsu: {
    name: '꼬마 민수', role: '마을 아이', look: { skin: '#f6d2b0', hair: '#3a2a1a', top: '#ffd23c', hairStyle: 'short', small: true },
    lines: ['같이 놀자!', '분수대에 동전 던지면 소원이 이뤄진대.', '고양이 나비 못 봤어?', '어른들은 왜 쓴 커피를 마셔?', '보리가 오늘 내 신발 물어 갔어!'],
  },
  duri: {
    name: '숲지기 두리', role: '자연 되살리기', look: { skin: '#e0b088', hair: '#6a8a3a', top: '#5a7a3a', hairStyle: 'cap', cap: '#4a6a2a', beard: true },
    lines: ['베어 낸 나무와 캐낸 바위는 저절로 돌아오지 않아.', '조금만 보태 주면 숲과 들을 되살려 주지.', '자연은 아껴 써야 오래 간다네.'],
  },
  eunwoo: {
    name: '차은우', role: '가수 겸 배우', look: { skin: '#f8dcc4', hair: '#23232e', top: '#1f2a44', bottom: '#2c2c34', hairStyle: 'short' },
    lines: ['오, {name}! 오늘 버스킹 보러 왔어?', '사인? {name}한테는 특별히 두 장 해 줄게.', '광장 분수대 앞이 소리가 제일 잘 퍼져.', '커피 한 잔이면 새벽 촬영도 거뜬해.', '박자 맞춰서 박수 쳐 주면 힘 나!'],
  },
  karina: {
    name: '카리나', role: '가수 · 댄서', look: { skin: '#f8dcc4', hair: '#15151c', top: '#f4f0fa', bottom: '#3a3a4a', hairStyle: 'long' },
    lines: ['어, 왔어? 방금 안무 하나 완성했어!', '호숫가 바람 맞으면서 추는 게 제일 좋아.', '딸기 스무디 마시고 싶다…', '같이 스트레칭 할래?', '오늘 컨디션 최고야!'],
  },
};

// 가끔 섞여 나오는 이스터에그 인사. {N} 은 지노·하영 기념일(2019-05-28 = 1일차) 날수, {heart} 는 하트 아이콘.
export const NPC_SECRET_LINES = {
  bomi: ['그 소문 알아? 지노가 하영한테 고백편지 썼대~!', '오늘은 지노랑 하영이 {N}일차 되는 날이래용'],
  silvi: ['그 소문 알아? 지노가 하영한테 고백편지 썼대~!', '혜규이 최공 {heart}'],
  minsu: ['오늘은 지노랑 하영이 {N}일차 되는 날이래용', '혜규이 최공 {heart}'],
  sunja: ['오늘은 지노랑 하영이 {N}일차 되는 날이래용'],
};
export const SECRET_CHANCE = 0.2;
export const COUPLE_START = [2019, 5, 28];

// NPC 취향: love(아주 좋아함) · like(좋아함) · dislike(싫어함). 아이템 id 또는 'type:종류'
export const NPC_TASTE = {
  bomi: { love: ['strawberry', 'pumpkin', 'flower_crown'], like: ['type:crop', 'flower'], dislike: ['boot', 'slime_gel'] },
  chulsu: { love: ['gold_ore', 'gem', 'ruby', 'bbq'], like: ['type:ore', 'meat'], dislike: ['flower', 'flower_crown'] },
  silvi: { love: ['cloth', 'wool', 'red_dress', 'dye_red', 'dye_blue', 'dye_yellow'], like: ['type:cloth', 'cotton', 'flower'], dislike: ['slime_gel', 'boot'] },
  sunja: { love: ['pumpkin_pie', 'mushroom_stew', 'fish_salmon'], like: ['type:food', 'mushroom', 'tomato'], dislike: ['bone', 'bat_wing'] },
  kang: { love: ['fish_gold', 'fish_catfish', 'sushi', 'spicy_stew'], like: ['type:fish', 'bait', 'boot'], dislike: ['flower_crown'] },
  rea: { love: ['golem_core', 'gem', 'herb_salve', 'bbq'], like: ['type:drop', 'bread'], dislike: ['flower_crown', 'boot'] },
  // 촌장님은 건강을 챙긴다
  mayor: { love: ['herb_salve', 'veggie_soup', 'mushroom_stew', 'herb'], like: ['type:crop', 'grilled_fish', 'baked_potato'], dislike: ['slime_gel', 'bbq', 'pumpkin_pie'] },
  minsu: { love: ['strawberry', 'berry_toast', 'f_bear'], like: ['flower', 'berry', 'type:furniture'], dislike: ['mushroom', 'bone'] },
  duri: { love: ['herb', 'flower', 'f_plant'], like: ['type:forage', 'wood'], dislike: ['slime_gel', 'bone'] },
  eunwoo: { love: ['coffee', 'berry_toast', 'sushi'], like: ['type:food', 'flower'], dislike: ['boot', 'slime_gel'] },
  karina: { love: ['strawberry', 'flower_crown', 'red_dress'], like: ['type:cloth', 'flower', 'coffee'], dislike: ['bone', 'bat_wing'] },
};
export const TASTE_POINTS = { love: 80, like: 40, neutral: 15, dislike: -20 };
export const TASTE_HINT = {
  bomi: '딸기나 커다란 호박', chulsu: '반짝이는 광석이나 고기 요리', silvi: '천과 염료', sunja: '정성 들인 요리',
  kang: '귀한 물고기', rea: '유적의 전리품이나 약초 연고', mayor: '몸에 좋은 음식이나 약초', minsu: '달콤한 것이나 곰 인형', duri: '약초와 들꽃',
  eunwoo: '커피나 힘이 나는 음식', karina: '딸기나 예쁜 옷',
};

// 애완동물 (누르면 울음소리)
export const PETS = {
  cat: { name: '고양이 나비', cry: '야옹~', sound: 'meow' },
  dog: { name: '강아지 보리', cry: '멍멍!', sound: 'bark' },
  duck: { name: '오리 꽥이', cry: '꽥꽥!', sound: 'quack' },
};

// 밭 일꾼: 고용한 동안 밭이 늘 촉촉하고, 다 자란 작물은 수확해서 공용 보관함에 넣고 다시 심는다
export const HELPER_PLANS = [
  { hours: 4, gold: 300 },
  { hours: 12, gold: 800 },
  { hours: 24, gold: 1500 },
];

// 숲지기 두리: 베어 낸 자원을 되살리는 값 (자원 하나당)
export const REGROW_COST = { perNode: 25, min: 60 };

// ── 오늘의 부탁 (게시판) ─────────────────────────────────────────────────────
export const REQUEST_POOL = [
  ['turnip', 5], ['potato', 5], ['carrot', 4], ['wheat', 8], ['tomato', 3], ['strawberry', 3],
  ['fish_crucian', 3], ['fish_carp', 2], ['copper_ore', 6], ['iron_ore', 4], ['wood', 20], ['stone', 25],
  ['mushroom', 3], ['fur', 3], ['slime_gel', 5], ['veggie_soup', 1], ['grilled_fish', 2], ['cloth', 2],
];

// ── 레벨 ─────────────────────────────────────────────────────────────────────
export const xpForLevel = lv => Math.round(40 * lv ** 1.6);
export const MAX_SKILL = 10;
