// 인트로 · 메인 메뉴 · 저장 슬롯 · 캐릭터 만들기 · 세계 만들기 · 링크로 참가.
import { JOBS, STATS, SKILLS } from '../data.js';
import { charSheet, catSheet } from '../art/chars.js';
import { building, TS } from '../art/world.js';
import { hash2 } from '../logic/rng.js';
import { listSlots, clearSlot, SLOT_COUNT } from '../net/slots.js';
import { helpHtml, jobIcon } from './ui.js';
import { sfx } from '../game/sound.js';
import { APP_VERSION } from '../version.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = t => {
  if (!t) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
};

export const SKINS = ['#f6d2b0', '#f0c8a8', '#e0b088', '#c9905f', '#8d5a3a'];
export const HAIRS = ['#2c2c34', '#5a3a2a', '#8a5a32', '#e8c65a', '#c0584d', '#f4f4f4', '#6a5acd', '#ff8ac0'];
export const TOPS = ['#e0605a', '#4d7fbf', '#5aa04a', '#f0a03a', '#b06fd0', '#f4efe4', '#3a3a44', '#ff8ac0'];
export const STYLES = [['short', '짧은 머리'], ['long', '긴 머리'], ['bun', '올림 머리'], ['pony', '포니테일'], ['spiky', '삐죽 머리'], ['cap', '모자']];

// ── 배경 장면 (인트로 · 메뉴) ────────────────────────────────────────────────
export class TitleScene {
  constructor(canvas) {
    this.cv = canvas;
    this.walkers = [
      { look: { skin: '#f6d2b0', hair: '#5a3a2a', top: '#e0605a', bottom: '#4a5a8a', hairStyle: 'short' }, speed: 14, off: 0 },
      { look: { skin: '#f0c8a8', hair: '#e8c65a', top: '#b06fd0', bottom: '#5a4a3a', hairStyle: 'long' }, speed: 11, off: 60 },
      { look: { skin: '#e0b088', hair: '#2c2c34', top: '#5aa04a', bottom: '#3a3a44', hairStyle: 'cap', cap: '#e0605a' }, speed: 16, off: 130 },
    ];
    this.run = true;
    const loop = () => { if (!this.run) return; this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  stop() { this.run = false; }
  draw() {
    const cv = this.cv;
    const dpr = Math.min(3, devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr);
    const H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const Z = Math.max(2, Math.round(Math.min(W / 150, H / 190)));
    const w = Math.ceil(W / Z);
    const h = Math.ceil(H / Z);
    const c = cv.getContext('2d');
    c.setTransform(Z, 0, 0, Z, 0, 0);
    c.imageSmoothingEnabled = false;
    const t = performance.now() / 1000;
    // 하늘 (노을 → 낮 반복)
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7ec8f0'); g.addColorStop(0.55, '#ffd9b0'); g.addColorStop(1, '#ffb88a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff6d6';
    c.beginPath(); c.arc(w * 0.78, h * 0.28, 16, 0, Math.PI * 2); c.fill();
    // 구름
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 67 + t * (4 + i)) % (w + 60)) - 40;
      const y = 14 + i * 13 % 50;
      c.fillRect(Math.round(x), y, 26, 6); c.fillRect(Math.round(x) + 5, y - 4, 14, 5); c.fillRect(Math.round(x) + 16, y - 2, 12, 4);
    }
    // 언덕
    const ground = Math.round(h * 0.62);
    c.fillStyle = '#9ad06a';
    for (let x = 0; x < w; x++) { const y = ground - 18 + Math.round(Math.sin(x / 23) * 6 + Math.sin(x / 9) * 2); c.fillRect(x, y, 1, h); }
    c.fillStyle = '#7ec04e';
    c.fillRect(0, ground, w, h - ground);
    for (let x = 0; x < w; x += 3) if (hash2(x, 3, 9) < 0.4) { c.fillStyle = '#6aab40'; c.fillRect(x, ground + 2 + Math.floor(hash2(x, 1, 1) * 30), 1, 2); }
    // 집
    const house = building({ kind: 'house', w: 7, h: 5, x: 0, y: 0, door: { x: 3, y: 4 } }, false).c;
    const hx = Math.round(w / 2 - house.width / 2);
    c.drawImage(house, hx, ground - house.height + 22);
    // 굴뚝 연기
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.6 + i / 4) % 1;
      c.fillStyle = `rgba(255,255,255,${0.7 - p * 0.7})`;
      const s = 3 + Math.round(p * 4);
      c.fillRect(Math.round(hx + house.width - 16 + Math.sin(p * 6 + i) * 3), Math.round(ground - house.height + 18 - p * 30), s, s);
    }
    // 나무
    for (const [x, s] of [[0.1, 1], [0.88, 0.9], [0.22, 0.8]]) {
      const tx = Math.round(w * x); const sway = Math.sin(t * 1.4 + x * 9) > 0.4 ? 1 : 0;
      c.fillStyle = '#7a5230'; c.fillRect(tx - 2, ground - 12, 4, 14);
      c.fillStyle = '#3a7a30'; c.beginPath(); c.arc(tx + sway, ground - 20, 12 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#69b84d'; c.beginPath(); c.arc(tx - 3 + sway, ground - 23, 7 * s, 0, Math.PI * 2); c.fill();
    }
    // 밭
    for (let i = 0; i < 6; i++) {
      const px = Math.round(w / 2 - 45 + i * 15); const py = ground + 30;
      c.fillStyle = '#94693c'; c.fillRect(px, py, 13, 10);
      const grow = (Math.sin(t * 0.8 + i) + 1) / 2;
      c.fillStyle = '#4f9f3a'; c.fillRect(px + 5, py - Math.round(grow * 6), 3, Math.round(grow * 6) + 2);
      if (grow > 0.8) { c.fillStyle = ['#f08a2c', '#ff3c5a', '#9c5fc0'][i % 3]; c.fillRect(px + 4, py - 7, 5, 3); }
    }
    // 걷는 사람들
    this.walkers.forEach((wk, i) => {
      const x = ((t * wk.speed + wk.off) % (w + 40)) - 20;
      const sh = charSheet(wk.look);
      c.drawImage(sh.right.walk[Math.floor(t * 8 + i) % 4], Math.round(x), ground + 48 + i * 12 - 22);
    });
    const cat = catSheet();
    const cx = w - ((t * 9) % (w + 30));
    c.drawImage(cat.left[Math.floor(t * 6) % 2], Math.round(cx), ground + 70);
    // 나비
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#ffffff', '#ffd23c', '#ff8ac0', '#8ab8ff'][i];
      const bx = (hash2(i, 1, 5) * w + Math.sin(t + i) * 20) % w;
      const by = ground + 5 + hash2(i, 2, 5) * 40 + Math.cos(t * 1.3 + i) * 6;
      const f = Math.floor(t * 8 + i) % 2;
      c.fillRect(Math.round(bx) - 1 - f, Math.round(by), 1 + f, 2); c.fillRect(Math.round(bx) + 1, Math.round(by), 1 + f, 2);
    }
  }
}

// ── 화면 전환 도우미 ─────────────────────────────────────────────────────────
export class Screens {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers; // { onContinue(i), onNew(data), onJoin(code, data), onDeleteSlot(i), firebase: bool, settings, saveSettings, lookupWorld(code) }
  }

  intro() {
    this.root.innerHTML = `
      <div class="title-screen" id="ts">
        <canvas class="title-bg"></canvas>
        <div class="logo"><span class="l1">하하호호</span><span class="l2">하우스 키우기</span></div>
        <p class="tap blink">화면을 눌러 시작</p>
        <p class="ver">v1.0 · 1~4인 방치형 협동 생활</p>
      </div>`;
    this.scene?.stop();
    this.scene = new TitleScene(this.root.querySelector('.title-bg'));
    this.root.querySelector('#ts').addEventListener('pointerdown', () => { this.h.onUnlock?.(); sfx('open'); this.menu(); }, { once: true });
  }

  frame(inner, cls = '') {
    if (!this.root.querySelector('.title-bg')) {
      this.root.innerHTML = '<div class="title-screen"><canvas class="title-bg"></canvas><div class="menu-wrap" id="mw"></div></div>';
      this.scene?.stop();
      this.scene = new TitleScene(this.root.querySelector('.title-bg'));
    } else if (!this.root.querySelector('#mw')) {
      this.root.querySelector('.title-screen').insertAdjacentHTML('beforeend', '<div class="menu-wrap" id="mw"></div>');
      this.root.querySelector('.tap')?.remove();
      this.root.querySelector('.ver')?.remove();
    }
    const logo = this.root.querySelector('.logo');
    if (logo) logo.classList.add('small');
    const mw = this.root.querySelector('#mw');
    mw.className = `menu-wrap ${cls}`;
    mw.innerHTML = inner;
    return mw;
  }

  menu(msg = '') {
    const slots = listSlots();
    const latest = slots.map((s, i) => [s, i]).filter(([s]) => s).sort((a, b) => (b[0].savedAt || 0) - (a[0].savedAt || 0))[0];
    const w = this.frame(`
      <div class="menu">
        ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
        ${latest ? `<button class="btn gold big" data-a="cont">이어하기<small>${esc(latest[0].name)} · ${esc(latest[0].world || '')}</small></button>` : ''}
        <button class="btn big ${latest ? '' : 'gold'}" data-a="new">새로 시작</button>
        <button class="btn" data-a="slots">저장 슬롯</button>
        <button class="btn" data-a="join">친구 세계 참가</button>
        <div class="row"><button class="btn ghost" data-a="help">게임 방법</button><button class="btn ghost" data-a="settings">설정</button></div>
        <p class="muted small center">${this.h.firebase ? '온라인 서버에 연결돼 있어요' : '서버 설정이 없어 이 기기에만 저장돼요'}</p>
        <p class="muted small center">버전 ${APP_VERSION} · <button class="linkbtn" data-a="refresh">최신 버전 받기</button></p>
      </div>`);
    const on = (a, fn) => w.querySelector(`[data-a="${a}"]`)?.addEventListener('click', () => { sfx('click'); fn(); });
    on('cont', () => this.h.onContinue(latest[1]));
    on('new', () => this.pickSlotForNew());
    on('slots', () => this.slots());
    on('join', () => this.joinCode());
    on('refresh', () => this.h.onRefresh?.());
    on('help', () => this.help());
    on('settings', () => this.settings());
  }

  slots(mode = 'view', after) {
    const slots = listSlots();
    const w = this.frame(`
      <div class="menu panel">
        <h2>저장 슬롯</h2>
        ${mode === 'pick' ? '<p class="muted small">새 캐릭터를 저장할 칸을 고르세요. 이미 있는 칸을 고르면 덮어써요.</p>' : ''}
        ${slots.map((s, i) => `
          <div class="slot-card ${s ? '' : 'empty'}">
            ${s ? `<canvas data-face="${i}" width="32" height="48"></canvas>
              <div class="grow"><b>${esc(s.name)}</b> <span class="muted small">${jobIcon(s.job)} ${JOBS[s.job]?.name || ''}</span>
              <div class="muted small">${esc(s.world || '')} · ${s.mode === 'online' ? '온라인' : '이 기기'} · ${ago(s.savedAt)}</div></div>`
              : `<div class="grow muted">슬롯 ${i + 1} — 비어 있음</div>`}
            <div class="col">
              ${mode === 'pick' ? `<button class="btn small gold" data-pick="${i}">여기에</button>` : s ? `<button class="btn small gold" data-load="${i}">불러오기</button><button class="btn small ghost" data-del="${i}">삭제</button>` : ''}
            </div>
          </div>`).join('')}
        <button class="btn ghost" data-back>← 돌아가기</button>
      </div>`);
    w.querySelectorAll('[data-face]').forEach(cv => {
      const s = slots[Number(cv.dataset.face)];
      const x = cv.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(charSheet({ bottom: '#4a5a8a', ...s.look }).down.walk[0], 0, 0, 32, 48);
    });
    w.querySelector('[data-back]').addEventListener('click', () => this.menu());
    w.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => this.h.onContinue(Number(b.dataset.load))));
    w.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.del);
      if (!confirm(`슬롯 ${i + 1}의 "${slots[i].name}"을(를) 삭제할까요?${slots[i].mode === 'local' ? '\n이 기기에만 있는 세계라 되돌릴 수 없어요.' : '\n온라인 세계에는 캐릭터가 남아 있어요.'}`)) return;
      this.h.onDeleteSlot(i);
      this.slots();
    }));
    w.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.pick);
      if (slots[i] && !confirm(`"${slots[i].name}" 슬롯을 덮어쓸까요?`)) return;
      after(i);
    }));
  }

  pickSlotForNew(after = i => this.createChar({ slot: i })) {
    const slots = listSlots();
    const empty = slots.findIndex(s => !s);
    if (empty >= 0) return after(empty);
    this.slots('pick', after);
  }

  // 캐릭터 만들기
  createChar({ slot, join = null, draft = null }) {
    const d = draft || {
      name: '', job: 'farmer',
      look: { skin: SKINS[0], hair: HAIRS[1], top: TOPS[0], bottom: '#4a5a8a', hairStyle: 'short' },
    };
    const J = JOBS[d.job];
    const w = this.frame(`
      <div class="menu panel create">
        <h2>${join ? `${esc(join.name)}에 참가` : '캐릭터 만들기'}</h2>
        <div class="create-top">
          <canvas id="cc-prev" width="96" height="144"></canvas>
          <div class="grow">
            <label class="field"><span>이름</span><input id="cc-name" maxlength="10" placeholder="예) 호호" value="${esc(d.name)}"></label>
            <div class="swatches"><span>피부</span>${SKINS.map(c => `<button style="--c:${c}" class="${d.look.skin === c ? 'on' : ''}" data-look="skin:${c}"></button>`).join('')}</div>
            <div class="swatches"><span>머리색</span>${HAIRS.map(c => `<button style="--c:${c}" class="${d.look.hair === c ? 'on' : ''}" data-look="hair:${c}"></button>`).join('')}</div>
            <div class="swatches"><span>옷</span>${TOPS.map(c => `<button style="--c:${c}" class="${d.look.top === c ? 'on' : ''}" data-look="top:${c}"></button>`).join('')}</div>
          </div>
        </div>
        <div class="chips">${STYLES.map(([k, n]) => `<button class="${d.look.hairStyle === k ? 'on' : ''}" data-look="hairStyle:${k}">${n}</button>`).join('')}</div>
        <h3>직업 <span class="muted small">— 초기 능력치와 특기가 달라요</span></h3>
        <div class="jobs">${Object.entries(JOBS).map(([k, j]) => `<button class="job-card ${d.job === k ? 'on' : ''}" data-job="${k}" style="--c:${j.color}">${jobIcon(k)}<b>${j.name}</b></button>`).join('')}</div>
        <div class="job-detail" style="--c:${J.color}">
          <p>${jobIcon(d.job)} <b>${J.name}</b> — ${J.desc}</p>
          <div class="statbars">${Object.entries(STATS).map(([k, n]) => {
            const v = J.stats[k];
            const max = k === 'hp' || k === 'en' ? 140 : 10;
            return `<div><span>${n}</span><i><em style="width:${Math.min(100, v / max * 100)}%"></em></i><b>${v}</b></div>`;
          }).join('')}</div>
          <p class="muted small">특기: ${Object.entries(J.skills).map(([k, v]) => `${SKILLS[k]} Lv.${v}`).join(', ')} · 시작 도구 강화: ${Object.keys(J.tools).length ? Object.keys(J.tools).map(t => ({ hoe: '괭이', can: '물뿌리개', pick: '곡괭이', rod: '낚싯대', sword: '검' })[t]).join(', ') : '없음 (대신 재료)'}</p>
        </div>
        ${join ? '' : `
          <h3>세계</h3>
          <label class="field"><span>세계 이름</span><input id="cc-world" maxlength="14" placeholder="예) 하하호호 마을" value="${esc(d.world || '')}"></label>
          ${this.h.firebase ? `<div class="seg wide"><button class="${d.mode !== 'local' ? 'on' : ''}" data-mode="online">온라인 (친구 초대 가능)</button><button class="${d.mode === 'local' ? 'on' : ''}" data-mode="local">혼자 (이 기기)</button></div>` : ''}`}
        <p class="err" id="cc-err"></p>
        <div class="row"><button class="btn ghost" data-back>← 뒤로</button><button class="btn gold" data-go>${join ? '참가하기' : '시작하기'}</button></div>
      </div>`, 'wide');
    const prev = w.querySelector('#cc-prev');
    const px = prev.getContext('2d');
    px.imageSmoothingEnabled = false;
    let alive = true;
    const loop = () => {
      if (!alive || !prev.isConnected) return;
      const t = performance.now();
      const dir = ['down', 'right', 'up', 'left'][Math.floor(t / 1500) % 4];
      px.clearRect(0, 0, 96, 144);
      px.drawImage(charSheet(d.look)[dir].walk[Math.floor(t / 140) % 4], 0, 0, 96, 144);
      requestAnimationFrame(loop);
    };
    loop();
    const keep = () => {
      d.name = w.querySelector('#cc-name').value;
      const wn = w.querySelector('#cc-world');
      if (wn) d.world = wn.value;
    };
    w.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => {
      keep();
      const [k, v] = b.dataset.look.split(':');
      d.look[k] = v;
      sfx('click');
      alive = false;
      this.createChar({ slot, join, draft: d });
    }));
    w.querySelectorAll('[data-job]').forEach(b => b.addEventListener('click', () => { keep(); d.job = b.dataset.job; sfx('click'); alive = false; this.createChar({ slot, join, draft: d }); }));
    w.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { keep(); d.mode = b.dataset.mode; alive = false; this.createChar({ slot, join, draft: d }); }));
    w.querySelector('[data-back]').addEventListener('click', () => { alive = false; this.menu(); });
    w.querySelector('[data-go]').addEventListener('click', async () => {
      keep();
      const name = d.name.trim();
      if (!name) { w.querySelector('#cc-err').textContent = '이름을 입력해 주세요'; return; }
      const btn = w.querySelector('[data-go]');
      btn.disabled = true;
      btn.textContent = '준비 중…';
      alive = false;
      const data = { name, job: d.job, look: d.look, world: (d.world || '').trim() || `${name}네 마을`, mode: this.h.firebase && d.mode !== 'local' ? 'online' : 'local' };
      const err = join ? await this.h.onJoin(join.code, slot, data) : await this.h.onNew(slot, data);
      if (err) { w.querySelector('#cc-err').textContent = err; btn.disabled = false; btn.textContent = '다시 시도'; }
    });
  }

  joinCode(prefill = '', msg = '') {
    const w = this.frame(`
      <div class="menu panel">
        <h2>친구 세계 참가</h2>
        <p class="muted small">친구에게 받은 초대 링크를 열면 바로 여기로 와요. 코드로 직접 들어갈 수도 있어요.</p>
        <label class="field"><span>세계 코드</span><input id="jc" maxlength="8" placeholder="예) K7PQ2M" value="${esc(prefill)}" autocapitalize="characters"></label>
        <p class="err" id="jerr">${esc(msg)}</p>
        <div class="row"><button class="btn ghost" data-back>← 뒤로</button><button class="btn gold" data-go>찾기</button></div>
      </div>`);
    w.querySelector('[data-back]').addEventListener('click', () => this.menu());
    const go = async () => {
      const code = w.querySelector('#jc').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) { w.querySelector('#jerr').textContent = '코드를 확인해 주세요'; return; }
      const b = w.querySelector('[data-go]');
      b.disabled = true; b.textContent = '찾는 중…';
      const r = await this.h.lookupWorld(code);
      b.disabled = false; b.textContent = '찾기';
      if (r.error) { w.querySelector('#jerr').textContent = r.error; return; }
      this.joinInfo(r);
    };
    w.querySelector('[data-go]').addEventListener('click', go);
    w.querySelector('#jc').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  joinInfo(world) {
    const w = this.frame(`
      <div class="menu panel">
        <h2>${esc(world.name)}</h2>
        <p>주민 ${world.members.length}/4명${world.members.length ? `: ${world.members.map(esc).join(', ')}` : ''}</p>
        <p class="muted small">세계 코드 ${esc(world.code)} · ${world.day}일차</p>
        ${world.full ? '<p class="err">이 세계는 이미 4명이 가득 찼어요.</p>' : ''}
        <div class="row"><button class="btn ghost" data-back>← 뒤로</button>${world.full ? '' : '<button class="btn gold" data-go>새 캐릭터로 참가</button>'}</div>
      </div>`);
    w.querySelector('[data-back]').addEventListener('click', () => this.menu());
    w.querySelector('[data-go]')?.addEventListener('click', () => this.pickSlotForNew(i => this.createChar({ slot: i, join: world })));
  }

  help() {
    const w = this.frame(`<div class="menu panel"><h2>게임 방법</h2>${helpHtml()}<button class="btn ghost" data-back>← 돌아가기</button></div>`, 'wide');
    w.querySelector('[data-back]').addEventListener('click', () => this.menu());
  }

  settings() {
    const S = this.h.settings;
    const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(S[k]) === String(v) ? 'on' : ''}" data-set="${k}:${v}">${l}</button>`).join('')}</div>`;
    const w = this.frame(`<div class="menu panel"><h2>설정</h2>
      <div class="opt"><span>이동 방식</span>${seg('control', [['tap', '터치'], ['joystick', '조이스틱']])}</div>
      <div class="opt"><span>조이스틱 위치</span>${seg('lefty', [[false, '왼쪽'], [true, '오른쪽']])}</div>
      <div class="opt"><span>효과음</span>${seg('sound', [[true, '켜기'], [false, '끄기']])}</div>
      <div class="opt"><span>배경음</span>${seg('music', [[true, '켜기'], [false, '끄기']])}</div>
      <div class="opt"><span>진동</span>${seg('vibrate', [[true, '켜기'], [false, '끄기']])}</div>
      <button class="btn ghost" data-back>← 돌아가기</button></div>`);
    w.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
      const [k, v] = b.dataset.set.split(':');
      S[k] = v === 'true' ? true : v === 'false' ? false : v;
      this.h.saveSettings(S);
      this.settings();
    }));
    w.querySelector('[data-back]').addEventListener('click', () => this.menu());
  }

  loading(text = '불러오는 중…') {
    this.frame(`<div class="menu"><p class="center loading">${esc(text)}</p></div>`);
  }

  stop() { this.scene?.stop(); this.scene = null; this.root.innerHTML = ''; }
}

export { SLOT_COUNT, clearSlot, TS };
