// 원정 안내 — 첫 원정에서 화면을 처음 볼 때 한 번씩, 요정 루루가 화면의 한 곳을 비추며 짧게 설명한다.
// (대전 · 협동 튜토리얼은 tutorial.js — 직접 해 보는 방식. 원정은 화면 구성이 많아서 '어디에 무엇이 있나'를 보여 준다)
// 한 번이라도 원정을 끝낸 사람에게는 나오지 않는다. 원정 메뉴의 「안내 다시 보기」로 다시 켤 수 있다. 시험 원정에서는 나오지 않는다.
// 단계: { sel: 비출 곳 (없으면 화면 가운데에 말만), text, pos: 'top' | 'bottom' (말풍선 자리, 없으면 비춘 곳 반대편) }
import { spriteURL } from '../pixel.js';

export const TOURS = {
  select: [
    { text: '원정에 온 걸 환영해! 나는 길잡이 요정 루루야.\n원정은 주사위와 카드로 3막을 돌파하는 모험이야.\n첫 화면부터 하나씩 알려 줄게.' },
    { sel: '.rs-dial', text: '먼저 직업을 골라. 좌우 화살표로 넘기고,\n가운데 영웅을 누르면 한마디 해.' },
    { sel: '.rs-info', text: '고른 직업의 체력 · 뒤집기 · 조정,\n고유 기술과 특별 카드가 여기 적혀 있어.' },
    { sel: '#rs-pile', text: '시작 덱이야. 카드마다 족보가 있고, 주사위로 그 족보를 맞추면\n점수만큼 공격하거나 막아. 길게 누르면 덱 전체가 보여.' },
    { sel: '.rs-go .meta-btn', text: '출정 채비: 원정에서 모은 별조각으로\n다음 원정을 더 든든하게 준비하는 가게야.' },
    { sel: '[data-act=run-go]', text: '준비됐으면 원정 떠나기!' },
  ],
  omens: [
    { sel: '.omen-picks', text: '막이 시작될 때마다 징조 두 장 중 하나를 골라.\n좋은 점과 나쁜 점이 함께 있으니, 내 직업에 맞는 쪽으로!' },
  ],
  reward: [
    { sel: '.rw-items', text: '보상이야. 골드 · 물약은 저절로 받고,\n카드 · 유물은 눌러서 골라.' },
    { sel: '[data-act=run-leave]', text: '다 받았으면 이 버튼으로 다음으로!' },
  ],
  map: [
    { sel: '.rhud', text: '맨 위: 지금 막 · 층, 물약 주머니, 덱.\n물약은 전투 중에 눌러서 써. 덱을 누르면 가진 카드가 보여.' },
    { sel: '.mnode.can', text: '지도에서 반짝이는 칸을 골라 한 층씩 올라가.\n갈 수 있는 칸만 이름이 떠.' },
    { sel: '.map-scroll', text: '칸 종류 — 칼: 전투 · 해골: 강한 엘리트(유물을 줘)\n두루마리: 이벤트 · 동전: 상점 · 모닥불: 휴식 · 보석: 보물' },
    { sel: '.mnode.t-boss', text: '맨 꼭대기엔 이 막의 보스가 기다려.\n보스를 쓰러뜨리면 다음 막으로!' },
    { sel: '.rhero', text: '아래는 내 영웅: 체력 · 골드 · 유물.\n유물을 누르면 효과가 보여. 체력은 막을 넘어가도 이어지니 아껴 써!' },
  ],
  combat: [
    { sel: '#foe', text: '전투 시작! 위쪽이 적이야.\n체력과 상태(힘 · 약화 · 격앙)가 보여.' },
    { sel: '#intent', text: '이건 적의 다음 행동이야.\n공격 숫자를 보고 막을지, 먼저 쓰러뜨릴지 정해.' },
    { sel: '[data-act=run-roll]', text: '주사위를 굴려! 한 턴에 세 번까지.\n주사위를 눌러 잡으면 나머지만 다시 굴려.' },
    { sel: '#hand', text: '손패의 카드마다 족보가 있어.\n굴린 주사위로 맞춘 만큼 카드에 점수가 떠.' },
    { sel: '#rctl', text: '뒤집기 · 조정 같은 도구로 주사위 눈을 고칠 수도 있어.' },
  ],
  play: [
    { sel: '#hand', text: '카드를 누르면 공격 · 방어 나누기 막대가 떠.\n위로 끌어 적에게 던지면 공격, 나에게 끌면 방어!' },
    { sel: '#r-hero', text: '방어로 얻은 보호막은 적의 공격을 먼저 막고,\n내 턴이 다시 오면 사라져.' },
  ],
  shop: [
    { sel: '.shop-stall', text: '떠돌이 상점이야. 골드로 카드 · 유물 · 물약을 사.\n카드 빼기로 약한 카드를 덜어내면 덱이 더 강해져.' },
  ],
  rest: [
    { sel: '.rest-opts', text: '모닥불: 쉬어서 체력을 채우거나,\n카드 한 장을 단련할 수 있어. 둘 중 하나만!' },
  ],
  event: [
    { sel: '.ev-box', text: '이벤트! 고르는 길에 따라 좋은 일도, 나쁜 일도 생겨.\n잘 읽고 골라.' },
  ],
};

const KEY = 'diceheroes.runTour';
let store = null, wantFn = () => false, el = null, queue = Promise.resolve();
// app 의 store 와 '지금 안내를 보여도 되나' (첫 원정인가 · 시험 원정이 아닌가)
export function initTour(s, want) { store = s; wantFn = want; }
const state = () => store?.get(KEY) || { seen: {} };
export const tourForced = () => !!state().force;
// 「안내 다시 보기」: 본 것을 지우고, 이번 원정이 끝날 때까지 다시 보인다
export function replayTours() { store?.set(KEY, { seen: {}, force: true }); }
// 원정이 끝나면 다시 보기는 꺼진다
export function tourRunEnded() { const s = state(); if (s.force) { s.force = false; store?.set(KEY, s); } }

// 이 화면 안내 (처음 한 번). 화면이 그려진 뒤 조금 기다렸다가 띄운다. 끝나면 풀린다
export function tour(key, delay = 350) {
  queue = queue.then(() => run(key, delay));
  return queue;
}
async function run(key, delay) {
  const steps = TOURS[key];
  if (!steps || !store || !wantFn()) return;
  const s = state();
  if (s.seen[key]) return;
  await new Promise(r => setTimeout(r, delay));
  if (!wantFn()) return;
  // 다른 창(징조 고르기 등)이 떠 있으면 그 화면 안내는 다음에 (창이 닫히고 화면이 다시 그려질 때)
  if (key !== 'omens' && document.querySelector('#layer .overlay')) return;
  s.seen[key] = 1;
  store.set(KEY, s);
  const list = steps.filter(st => !st.sel || document.querySelector(st.sel));
  for (let k = 0; k < list.length; k++) {
    const go = await show(list[k], k, list.length);
    if (!go) break;
  }
  close();
}

function close() {
  el?.remove(); el = null;
  cancelAnimationFrame(follow);
}
let follow = 0;
// 단계 하나: 비춘 곳 둘레를 어둡게 하고 말풍선. 다음 → true, 건너뛰기 → false
function show(st, k, n) {
  return new Promise(done => {
    if (!el) {
      el = document.createElement('div');
      el.className = 'run-tour';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="rt-spot"></div>
      <div class="rt-box">
        <img class="rt-fairy" src="${spriteURL('fairy', 4)}" alt="">
        <div class="rt-text"><b>루루</b><p>${st.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
          <div class="rt-row"><button class="rt-skip">건너뛰기</button><span class="rt-step">${k + 1} / ${n}</span><button class="pbtn gold small rt-next">${k + 1 < n ? '다음' : '알겠어!'}</button></div></div>
      </div>`;
    const spot = el.querySelector('.rt-spot'), box = el.querySelector('.rt-box');
    const place = () => {
      const t = st.sel && document.querySelector(st.sel);
      if (t) {
        const r = t.getBoundingClientRect(), pad = 6;
        Object.assign(spot.style, { display: '', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        const below = (st.pos || (r.top + r.height / 2 < innerHeight / 2 ? 'bottom' : 'top')) === 'bottom';
        box.classList.toggle('top', !below); box.classList.toggle('bottom', below); box.classList.remove('center');
      } else {
        spot.style.display = 'none';
        box.classList.remove('top', 'bottom'); box.classList.add('center');
      }
      follow = requestAnimationFrame(place);
    };
    cancelAnimationFrame(follow);
    place();
    const next = e => { e?.stopPropagation(); done(true); };
    el.querySelector('.rt-next').onclick = next;
    el.querySelector('.rt-skip').onclick = e => { e.stopPropagation(); done(false); };
    el.onclick = next;                       // 아무 곳이나 눌러도 다음
  });
}
