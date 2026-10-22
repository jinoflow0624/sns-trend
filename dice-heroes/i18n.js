// 다국어: 화면 글자는 모두 t('한국어 원문', 값…) 로 쓴다. 원문이 곧 번역표의 열쇠다.
//   · 원문 안의 {0} {1} … 자리에 값이 들어간다 (언어마다 어순이 달라서 문장째로 옮긴다)
//   · 번역표: lang/<언어>.js (없는 문장은 한국어 그대로 — 깨지지 않게)
//   · 언어: 설정에서 고른 것 → 없으면 기기 언어 (LANGS 에 있으면 그 언어, 없으면 en). 주소에 ?lang=en 로 시험
//   · 서버(Cloud Functions)와 node 시험은 언제나 한국어 — 판 결과 계산이 언어에 따라 달라지지 않는다
export const LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'],
  ['es', 'Español'], ['pt', 'Português (Brasil)'], ['ru', 'Русский'], ['de', 'Deutsch'], ['fr', 'Français'], ['id', 'Bahasa Indonesia']];
const KEY = 'diceheroes.lang';

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.some(([k]) => k === q)) return q;
  } catch { /* 주소 없음 */ }
  try {
    const s = localStorage.getItem(KEY);
    if (LANGS.some(([k]) => k === s)) return s;
  } catch { /* 저장 불가 */ }
  const n = String((typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'ko').toLowerCase();
  return fromDevice(n);
}

// 기기 언어 코드 → 게임 언어 (중국어: 대만 · 홍콩 · 마카오 · Hant 는 번체, 그 밖은 간체 · 인도네시아어 옛 코드 in)
export function fromDevice(n) {
  n = String(n || '').toLowerCase();
  if (n.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(n) ? 'zh-Hant' : 'zh-Hans';
  if (n.startsWith('in')) return 'id';
  const base = n.split(/[-_]/)[0];
  return LANGS.some(([k]) => k === base) ? base : 'en';
}

export let LANG = typeof window === 'undefined' ? 'ko' : detect();
// 고른 언어 설정값 ('auto' = 기기 언어)
export function langPref() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }

let dict = null;
const cache = {};
const loadDict = async l => (l === 'ko' ? null : (cache[l] ||= (await import(`./lang/${l}.js`)).default));
if (LANG !== 'ko') {
  try { dict = await loadDict(LANG); } catch (e) { console.warn('[i18n]', e); }
}
function applyDoc() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LANG;
  // 중국어: 한자 서체를 미리 받아 둔다 (늦게 오면 글자가 바뀌어 보인다)
  if (LANG.startsWith('zh')) {
    const href = `fonts/KyboriaHanzi-${LANG === 'zh-Hant' ? 'TC' : 'SC'}.woff2`;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const l = document.createElement('link');
      Object.assign(l, { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', href });
      document.head.appendChild(l);
    }
  }
}
applyDoc();

// 번역: 없으면 원문 그대로. {n} 자리에 값
// 같은 한국어가 뜻이 둘이면 원문 끝에 ⟪문맥⟫ 을 붙여 열쇠를 나눈다 (예: '트레이⟪족보⟫' = 3 족보, '트레이' = 주사위 트레이). 화면엔 안 보인다
export function t(s, ...a) {
  let o = (dict && dict[s]) ?? (s.includes('⟪') ? s.replace(/⟪[^⟫]*⟫/g, '') : s);
  if (a.length) o = o.replace(/\{(\d+)\}/g, (m, i) => { const v = a[i]; return v == null ? '' : String(v); });
  return o;
}

// 살아 있는 글자: 파일을 불러올 때 만들어 두는 표(카드 · 유물 · 적 이름 등)는 이것으로 만든다 (tL).
// 글자로 쓰일 때마다(`${}` · + · .replace · textContent · JSON) 그때 언어로 번역하므로, 언어를 바꿔도 다시 불러올 필요가 없다.
//   · typeof 는 'object' · === 비교는 같은 객체끼리만 → 번역 글자를 === 로 비교하지 말 것 (id 로 비교)
//   · 서버 · node 시험에서는 그냥 글자(한국어)를 돌려준다
class Live {
  constructor(f) { this.f = f; }
  toString() { return this.f(); }
  valueOf() { return this.f(); }
  toJSON() { return this.f(); }
  [Symbol.toPrimitive]() { return this.f(); }
  get length() { return this.f().length; }
}
Object.setPrototypeOf(Live.prototype, String.prototype);   // .replace · .slice · .includes … 를 그대로 쓴다 (그때 글자로 바뀌어 돈다)
const LIVE = typeof window !== 'undefined';
export const tL = (s, ...a) => (LIVE ? new Live(() => t(s, ...a)) : t(s, ...a));
// 여러 글자를 이어 붙인 것도 살아 있게: live(() => `${a} ${b}`)
export const live = f => (LIVE ? new Live(f) : f());

// 숫자 · 날짜 표시용 지역 코드
const LOCALES = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU', de: 'de-DE', fr: 'fr-FR', id: 'id-ID' };
export let LOCALE = LOCALES[LANG];

// 언어 바꾸기: 다시 불러오지 않고 바로 바꾼다. 번역표를 받은 뒤 'langchange' 를 알리면 화면이 다시 그린다
export async function setLang(l) {
  try { if (l === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, l); } catch { /* 무시 */ }
  const next = l === 'auto' ? fromDevice((navigator.languages?.[0] || navigator.language)) : l;
  if (next === LANG) return false;
  dict = await loadDict(next);
  LANG = next; LOCALE = LOCALES[LANG];
  applyDoc();
  window.dispatchEvent(new CustomEvent('langchange', { detail: LANG }));
  return true;
}
