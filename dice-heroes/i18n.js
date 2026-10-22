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

export const LANG = typeof window === 'undefined' ? 'ko' : detect();
// 고른 언어 설정값 ('auto' = 기기 언어)
export function langPref() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }

let dict = null;
if (LANG !== 'ko') {
  try { dict = (await import(`./lang/${LANG}.js`)).default; } catch (e) { console.warn('[i18n]', e); }
}
if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG;
  // 중국어: 한자 서체를 첫 화면 전에 받아 둔다 (늦게 오면 글자가 바뀌어 보인다)
  if (LANG.startsWith('zh')) {
    const l = document.createElement('link');
    Object.assign(l, { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', href: `fonts/KyboriaHanzi-${LANG === 'zh-Hant' ? 'TC' : 'SC'}.woff2` });
    document.head.appendChild(l);
  }
}

// 번역: 없으면 원문 그대로. {n} 자리에 값
// 같은 한국어가 뜻이 둘이면 원문 끝에 ⟪문맥⟫ 을 붙여 열쇠를 나눈다 (예: '트레이⟪족보⟫' = 3 족보, '트레이' = 주사위 트레이). 화면엔 안 보인다
export function t(s, ...a) {
  let o = (dict && dict[s]) ?? (s.includes('⟪') ? s.replace(/⟪[^⟫]*⟫/g, '') : s);
  if (a.length) o = o.replace(/\{(\d+)\}/g, (m, i) => { const v = a[i]; return v == null ? '' : String(v); });
  return o;
}

// 언어 바꾸기: 저장하고 다시 불러온다 (모든 화면 · 데이터 표가 새 언어로 다시 만들어지게)
export function setLang(l) {
  try { if (l === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, l); } catch { /* 무시 */ }
  location.reload();
}
// 숫자 · 날짜 표시용 지역 코드
export const LOCALE = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU', de: 'de-DE', fr: 'fr-FR', id: 'id-ID' }[LANG];
