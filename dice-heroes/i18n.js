// 다국어: 화면 글자는 모두 t('한국어 원문', 값…) 로 쓴다. 원문이 곧 번역표의 열쇠다.
//   · 원문 안의 {0} {1} … 자리에 값이 들어간다 (언어마다 어순이 달라서 문장째로 옮긴다)
//   · 번역표: lang/en.js · lang/ja.js (없는 문장은 한국어 그대로 — 깨지지 않게)
//   · 언어: 설정에서 고른 것 → 없으면 기기 언어 (한국어 → ko, 일본어 → ja, 그 밖 → en). 주소에 ?lang=en 로 시험
//   · 서버(Cloud Functions)와 node 시험은 언제나 한국어 — 판 결과 계산이 언어에 따라 달라지지 않는다
export const LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語']];
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
  return n.startsWith('ko') ? 'ko' : n.startsWith('ja') ? 'ja' : 'en';
}

export const LANG = typeof window === 'undefined' ? 'ko' : detect();
// 고른 언어 설정값 ('auto' = 기기 언어)
export function langPref() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }

let dict = null;
if (LANG !== 'ko') {
  try { dict = (await import(`./lang/${LANG}.js`)).default; } catch (e) { console.warn('[i18n]', e); }
}
if (typeof document !== 'undefined') document.documentElement.lang = LANG;

// 번역: 없으면 원문 그대로. {n} 자리에 값
export function t(s, ...a) {
  let o = (dict && dict[s]) ?? s;
  if (a.length) o = o.replace(/\{(\d+)\}/g, (m, i) => { const v = a[i]; return v == null ? '' : String(v); });
  return o;
}

// 언어 바꾸기: 저장하고 다시 불러온다 (모든 화면 · 데이터 표가 새 언어로 다시 만들어지게)
export function setLang(l) {
  try { if (l === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, l); } catch { /* 무시 */ }
  location.reload();
}
// 숫자 · 날짜 표시용 지역 코드
export const LOCALE = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' }[LANG];
