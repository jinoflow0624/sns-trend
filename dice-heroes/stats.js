// 유저 테스트 통계 화면 (배포판 ?stats · 관리자만) — telemetry.js 가 모은 tele/<번호> 를 읽어 한 화면에 모아 본다.
// 관리자 등록: 데이터베이스 admins/<로그인 번호> = true (Firebase 콘솔 또는 Actions 'KYBORIA 관리자 등록').
// 개발자용 화면이라 한국어만 쓴다 (번역표 대상 아님).
import { PROD, fireApp, myUid, signIn } from './fire.js';
import { dayOf } from './wallet-rules.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateOf = d => new Date(d * 86400000).toISOString().slice(5, 10).replace('-', '/');   // 일 번호(한국 자정 기준) → 월/일
const min = ms => Math.round((ms || 0) / 60000);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const sum = a => a.reduce((x, y) => x + y, 0);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const MODE_KO = { versus: '대전', coop: '협동 보스', run: '원정', classic: '클래식', tutorial: '튜토리얼' };
const FUNNEL = [
  ['tutorial_begin', '튜토리얼 시작'], ['tutorial_complete', '튜토리얼 완료'], ['game_start', '첫 판 시작'], ['game_end', '첫 판 끝까지'],
  ['run_start', '원정 시작'], ['run_end', '원정 끝까지'], ['run_win', '원정 클리어'], ['coop_win', '보스 토벌'], ['versus_win', '대전 승리'],
  ['room_create', '온라인 방 만들기'], ['room_join', '온라인 방 들어가기'], ['ticket_popup', '입장권 창 봄'], ['ticket_ad', '광고로 입장권'],
  ['daily_claim', '일일 보상'], ['shop_buy', '상점 구매'], ['ach_claim', '도전과제 보상'],
];

export async function showStats(root) {
  root.innerHTML = `<div class="stats-page"><h1>KYBORIA 유저 테스트 통계</h1><p class="st-note">불러오는 중…</p></div>`;
  const page = root.querySelector('.stats-page');
  if (!PROD) { page.querySelector('.st-note').textContent = '배포판에서만 볼 수 있어요 (테스트판은 통계를 모으지 않아요).'; return; }
  let data;
  try {
    await signIn();
    const { fb, app } = await fireApp();
    data = (await fb.get(fb.ref(fb.getDatabase(app), 'tele'))).val() || {};
  } catch (err) {
    const uid = myUid() || '(로그인 실패)';
    page.innerHTML = `<h1>KYBORIA 유저 테스트 통계</h1>
      <p class="st-note">관리자만 볼 수 있어요. 아래 이 기기의 번호를 관리자로 등록하면 열려요.</p>
      <p class="st-uid"><code>${esc(uid)}</code> <button class="pbtn small" id="st-copy">복사</button></p>
      <ol class="st-how"><li>Firebase 콘솔 → Realtime Database → 데이터</li><li>맨 위에 <code>admins</code> 추가 → 그 아래 <code>${esc(uid)}</code> : <code>true</code></li>
      <li>또는 이 번호를 Claude 에게 알려 주면 등록해 줘요</li></ol><p class="st-err">${esc(err?.message || err)}</p>`;
    page.querySelector('#st-copy')?.addEventListener('click', () => navigator.clipboard?.writeText(uid));
    return;
  }
  page.innerHTML = render(data);
}

export function render(data) {
  const today = dayOf(Date.now());
  const users = Object.entries(data).map(([uid, u]) => {
    const d = u.d || {}, days = Object.keys(d).map(Number).filter(k => (d[k].s || 0) > 0 || (d[k].ms || 0) > 0).sort((a, b) => a - b);
    const first = u.p?.first ? dayOf(u.p.first) : days[0] ?? today;
    return { uid, p: u.p || {}, d, m: u.m || {}, x: u.x || {}, first, days, set: new Set(days), last: days[days.length - 1] ?? first,
      ms: sum(Object.values(d).map(r => r.ms || 0)), s: sum(Object.values(d).map(r => r.s || 0)) };
  }).filter(u => u.days.length);
  const N = users.length;
  if (!N) return `<h1>KYBORIA 유저 테스트 통계</h1><p class="st-note">아직 모인 데이터가 없어요. 테스터가 배포판(구글 플레이 테스트 앱)을 열면 1분 안에 쌓이기 시작해요.</p>`;

  // ── 요약 ──
  const dau = users.filter(u => u.set.has(today)).length;
  const wau = users.filter(u => u.days.some(k => k > today - 7)).length;
  const activeDays = users.flatMap(u => u.days.map(k => u.d[k]));
  const avgMin = activeDays.length ? min(sum(activeDays.map(r => r.ms || 0)) / activeDays.length) : 0;
  const avgSess = activeDays.length ? (sum(activeDays.map(r => r.s || 0)) / activeDays.length).toFixed(1) : 0;
  const sessions = activeDays.flatMap(r => (r.sl || []).filter(v => v > 0));
  const card = (k, v, sub = '') => `<div class="st-card"><small>${k}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  let h = `<h1>KYBORIA 유저 테스트 통계</h1><p class="st-note">기준: 한국 자정 · 플레이 시간 = 화면을 보며 1분 안에 만진 시간 · 마지막 갱신 ${new Date().toLocaleString()}</p>
  <div class="st-cards">${card('전체 테스터', N)}${card('오늘 접속 (DAU)', dau)}${card('최근 7일 접속', wau)}${card('접속일당 플레이', `${avgMin}분`)}${card('접속일당 세션', avgSess)}${card('세션 길이 (중앙값)', `${min(median(sessions))}분`, `${sessions.length}개 세션`)}</div>`;

  // ── 리텐션 ──
  const ret = n => { const el = users.filter(u => u.first + n <= today); const k = el.filter(u => u.set.has(u.first + n)).length; return { k, n: el.length }; };
  const retPlus = n => { const el = users.filter(u => u.first + n <= today); const k = el.filter(u => u.days.some(x => x >= u.first + n)).length; return { k, n: el.length }; };
  const R = [1, 2, 3, 7, 14, 30];
  h += `<h2>리텐션</h2><table class="st-t"><tr><th></th>${R.map(n => `<th>D${n}</th>`).join('')}</tr>
    <tr><td>그날 접속</td>${R.map(n => { const r = ret(n); return `<td>${pct(r.k, r.n)}<small>${r.k}/${r.n}</small></td>`; }).join('')}</tr>
    <tr><td>그날 이후 한 번이라도</td>${R.map(n => { const r = retPlus(n); return `<td>${pct(r.k, r.n)}<small>${r.k}/${r.n}</small></td>`; }).join('')}</tr></table>
    <p class="st-hint">캐주얼 게임 참고치: D1 35~40% · D7 15% 안팎 · D30 5% 이상이면 좋은 편</p>`;
  // 첫날 묶음별 (코호트)
  const cohorts = [...new Set(users.map(u => u.first))].sort((a, b) => b - a).slice(0, 14);
  const CN = [1, 2, 3, 4, 5, 6, 7];
  h += `<h3>시작한 날짜별 (코호트)</h3><table class="st-t"><tr><th>시작일</th><th>인원</th>${CN.map(n => `<th>D${n}</th>`).join('')}</tr>${cohorts.map(c => {
    const g = users.filter(u => u.first === c);
    return `<tr><td>${dateOf(c)}</td><td>${g.length}</td>${CN.map(n => (c + n > today ? '<td class="na">·</td>' : `<td>${pct(g.filter(u => u.set.has(c + n)).length, g.length)}</td>`)).join('')}</tr>`;
  }).join('')}</table>`;

  // ── 날짜별 ──
  const span = Array.from({ length: 14 }, (_, i) => today - i);
  h += `<h2>날짜별</h2><table class="st-t"><tr><th>날짜</th><th>신규</th><th>접속</th><th>플레이(분)</th><th>1인당(분)</th><th>세션</th><th>판 시작</th></tr>${span.map(k => {
    const act = users.filter(u => u.set.has(k)), rs = act.map(u => u.d[k]);
    const gs = {}; rs.forEach(r => Object.entries(r.gs || {}).forEach(([m, v]) => { gs[m] = (gs[m] || 0) + v; }));
    const tm = sum(rs.map(r => r.ms || 0));
    return `<tr><td>${dateOf(k)}</td><td>${users.filter(u => u.first === k).length}</td><td>${act.length}</td><td>${min(tm)}</td><td>${act.length ? min(tm / act.length) : 0}</td><td>${sum(rs.map(r => r.s || 0))}</td>
      <td class="l">${Object.entries(gs).map(([m, v]) => `${MODE_KO[m] || m} ${v}`).join(' · ') || '—'}</td></tr>`;
  }).join('')}</table>`;

  // ── 첫 경험 깔때기 ──
  h += `<h2>첫 경험 단계 (해 본 테스터 비율)</h2><table class="st-t">${FUNNEL.map(([k, ko]) => {
    const n = users.filter(u => u.m[k]).length;
    const t = users.filter(u => u.m[k] && u.p.first).map(u => (u.m[k] - u.p.first) / 60000).filter(v => v >= 0);
    return `<tr><td class="l">${ko}</td><td><span class="st-bar" style="--w:${N ? (n / N) * 100 : 0}%"></span>${pct(n, N)} <small>${n}명</small></td><td><small>${t.length ? `처음 연 뒤 ${Math.round(median(t))}분` : ''}</small></td></tr>`;
  }).join('')}</table>`;

  // ── 모드 ──
  const tot = key => { const o = {}; activeDays.forEach(r => Object.entries(r[key] || {}).forEach(([m, v]) => { o[m] = (o[m] || 0) + v; })); return o; };
  const gs = tot('gs'), ge = tot('ge'), w = tot('w');
  const modes = [...new Set([...Object.keys(gs), ...Object.keys(ge)])];
  h += `<h2>모드별</h2><table class="st-t"><tr><th>모드</th><th>시작</th><th>끝까지</th><th>완주율</th><th>승률</th><th>해 본 사람</th></tr>${modes.map(m => {
    const who = users.filter(u => u.days.some(k => (u.d[k].gs || {})[m])).length;
    return `<tr><td class="l">${MODE_KO[m] || m}</td><td>${gs[m] || 0}</td><td>${ge[m] || 0}</td><td>${pct(ge[m] || 0, gs[m] || 0)}</td><td>${pct(w[m] || 0, ge[m] || 0)}</td><td>${pct(who, N)}</td></tr>`;
  }).join('')}</table>`;
  const ev = tot('ev');
  h += `<p class="st-hint">판 도중에 나감: 대전 · 협동 ${ev.game_quit || 0}번 · 원정 포기 ${ev.run_giveup || 0}번</p>`;

  // ── 화면별 체류 · 이탈 ──
  const st = tot('st'), stAll = sum(Object.values(st));
  const exits = {}; users.forEach(u => Object.entries(u.x).forEach(([k, v]) => { exits[k] = (exits[k] || 0) + v; }));
  const exAll = sum(Object.values(exits));
  const scr = [...new Set([...Object.keys(st), ...Object.keys(exits)])].sort((a, b) => (st[b] || 0) - (st[a] || 0));
  h += `<h2>화면별 시간 · 앱을 내린 화면</h2><table class="st-t"><tr><th>화면</th><th>머문 시간</th><th></th><th>여기서 내림</th></tr>${scr.map(k => `<tr><td class="l">${esc(k)}</td><td>${min(st[k])}분</td><td><span class="st-bar" style="--w:${stAll ? ((st[k] || 0) / stAll) * 100 : 0}%"></span>${pct(st[k] || 0, stAll)}</td><td>${exits[k] || 0} <small>${pct(exits[k] || 0, exAll)}</small></td></tr>`).join('')}</table>`;

  // ── 기기 · 언어 · 버전 ──
  const split = f => { const o = {}; users.forEach(u => { const k = f(u) || '?'; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(' · '); };
  h += `<h2>기기 · 언어 · 버전</h2><p class="st-split">설치 형태: ${split(u => u.p.plat)}<br>기기: ${split(u => u.p.dev)}<br>언어: ${split(u => u.p.lang)}<br>버전: ${split(u => u.p.ver)}</p>`;

  // ── 테스터별 ──
  const rows = users.slice().sort((a, b) => b.last - a.last || b.ms - a.ms);
  h += `<h2>테스터별</h2><table class="st-t"><tr><th>번호</th><th>시작</th><th>마지막</th><th>접속일</th><th>플레이</th><th>세션</th><th>단계</th><th>마지막 이탈</th></tr>${rows.map(u => {
    const lastExit = Object.entries(u.x).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return `<tr><td><code>${esc(u.uid.slice(0, 6))}</code></td><td>${dateOf(u.first)}</td><td>${dateOf(u.last)}</td><td>${u.days.length}</td><td>${min(u.ms)}분</td><td>${u.s}</td><td>${FUNNEL.filter(([k]) => u.m[k]).length}/${FUNNEL.length}</td><td class="l"><small>${esc(lastExit)}</small></td></tr>`;
  }).join('')}</table>`;
  return h;
}

// 데이터 지우기 요청 (설정 → 내 데이터 지우기): 서버의 내 통계도 지운다
export async function deleteTele() {
  if (!PROD || !myUid()) return;
  try { const { fb, app } = await fireApp(); await fb.remove(fb.ref(fb.getDatabase(app), `tele/${myUid()}`)); } catch { /* 무시 */ }
}
