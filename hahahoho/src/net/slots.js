// 저장 슬롯 (이 기기). 슬롯 = 어느 세계의 어느 캐릭터인지 가리키는 책갈피.
// 실제 진행 상황은 세계 저장소(서버 또는 로컬)에 있고, 여기엔 캐릭터 사본도 백업으로 둔다.
// 저장 키는 모두 hahahoho.* 로 아콰이어(acquire.*)와 겹치지 않는다.

export const SLOT_COUNT = 3;
const KEY = 'hahahoho.slots';
const SETTINGS = 'hahahoho.settings';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export function listSlots() {
  const s = read(KEY, []);
  return Array.from({ length: SLOT_COUNT }, (_, i) => s[i] || null);
}
export function saveSlot(i, slot) {
  const s = listSlots();
  s[i] = { ...s[i], ...slot, savedAt: Date.now() };
  write(KEY, s);
}
export function clearSlot(i) {
  const s = listSlots();
  s[i] = null;
  write(KEY, s);
}
export const firstEmptySlot = () => listSlots().findIndex(s => !s);
export function latestSlot() {
  const s = listSlots();
  let best = -1;
  s.forEach((x, i) => { if (x && (best < 0 || (x.savedAt || 0) > (s[best].savedAt || 0))) best = i; });
  return best;
}
export const findSlotByWorld = code => listSlots().findIndex(s => s?.code === code);

export const DEFAULT_SETTINGS = { control: 'tap', sound: true, music: true, vibrate: true, lefty: false };
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS, {}) });
export const saveSettings = s => write(SETTINGS, s);
