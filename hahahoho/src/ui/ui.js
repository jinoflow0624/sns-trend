// 게임 화면 위의 HUD 와 창들 (DOM). 규칙 판정은 전부 game.js 에 있고 여기선 보여 주고 부르기만 한다.
import {
  ITEMS, JOBS, SKILLS, STATS, TOOLS, TOOL_TIERS, TOOL_UPGRADE, RECIPES, STATION_NAME, STATION_SKILL, SHOPS,
  HOUSE_LEVELS, NPCS, IDLE_JOBS, xpForLevel, MAX_SKILL,
} from '../data.js';
import { itemUrl, toolUrl } from '../art/items.js';
import { charSheet, catSheet } from '../art/chars.js';
import { lookOf, statsOf, totalLevel } from '../logic/player.js';
import { buyPrice, priceMult, hotItems } from '../logic/market.js';
import { WAYPOINTS, waypointInfo } from '../world/maps.js';
import { fmtClock } from '../game/clock.js';
import { count } from '../logic/inventory.js';
import { sfx } from '../game/sound.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<img class="ico ${cls}" src="${itemUrl(id)}" alt="">`;
const fmtN = n => n.toLocaleString('ko-KR');

export class UI {
  constructor(root, { settings, saveSettings, onExit, inviteLink, onSettings }) {
    this.root = root;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.onExit = onExit;
    this.inviteLink = inviteLink;
    this.onSettings = onSettings;
    this.panel = null;
    this.last = {};
    this.invSel = null;
  }

  attach(game) {
    this.g = game;
    game.ui = this;
    this.root.innerHTML = `
      <div class="hud">
        <div class="hud-top">
          <div class="clockbox" id="h-clock"><b id="h-day"></b><span id="h-time"></span></div>
          <div class="statbox">
            <div class="bar hp"><i id="h-hp"></i><span id="h-hpt"></span></div>
            <div class="bar en"><i id="h-en"></i><span id="h-ent"></span></div>
            <div class="gold" id="h-gold"></div>
          </div>
          <div class="top-btns">
            <button data-open="house" title="하우스">🏠</button>
            <button data-open="teleport" title="순간이동">✨</button>
            <button data-open="chat" title="대화">💬<i class="dot" id="h-chatdot"></i></button>
            <button data-open="menu" title="메뉴">☰</button>
          </div>
        </div>
        <div class="who" id="h-who"></div>
        <div class="map-banner" id="h-banner"></div>
        <div class="fishbar" id="h-fish"><div class="fb-label" id="h-fishlabel"></div><div class="fb-track"><i class="fb-zone" id="h-fzone"></i><i class="fb-mark" id="h-fmark"></i></div></div>
        <div class="decorbar" id="h-decor"></div>
        <div class="hud-bottom">
          <div class="hotbar" id="h-hotbar"></div>
          <div class="bottom-row">
            <button class="bag-btn" data-open="bag" title="가방">🎒<small>가방</small></button>
            <div class="sel-name" id="h-selname"></div>
            <div class="act-wrap">
              <button class="auto-btn" id="h-auto" title="자동 모드">🌙</button>
              <button class="act-btn" id="h-act"><span class="ai" id="h-acti"></span><small id="h-actl"></small></button>
            </div>
          </div>
        </div>
      </div>
      <div class="joy" id="joy"><i></i></div>
      <div class="sheet-bg" id="sheet" hidden></div>`;
    this.$ = id => this.root.querySelector(`#${id}`);
    this.root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { sfx('click'); this.open(b.dataset.open); }));
    this.$('h-act').addEventListener('pointerdown', e => { e.preventDefault(); this.g.action_(); });
    this.$('h-auto').addEventListener('click', () => { this.g.toggleAuto(); });
    this.$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') this.close(); });
    this.renderHotbar();
    this.applyControlClass();
  }

  applyControlClass() {
    this.root.classList.toggle('mode-joy', this.settings.control === 'joystick');
    this.root.classList.toggle('lefty', !!this.settings.lefty);
  }

  // ── 매 프레임 가벼운 갱신 ──────────────────────────────────────────────────
  frame() {
    const g = this.g;
    if (!g?.map) return;
    const me = g.me;
    const st = statsOf(me);
    const c = g.clock;
    const set = (id, v, fn) => { if (this.last[id] !== v) { this.last[id] = v; fn(this.$(id), v); } };
    set('h-day', `${c.day}일차`, (el, v) => { el.textContent = v; });
    set('h-time', `${c.h >= 6 && c.h < 19 ? '☀️' : '🌙'} ${fmtClock(c)}`, (el, v) => { el.textContent = v; });
    set('h-gold', `${fmtN(me.gold)}G`, (el, v) => { el.textContent = v; });
    set('h-hp', Math.round(me.hp / st.hp * 100), (el, v) => { el.style.width = `${v}%`; });
    set('h-en', Math.round(me.en / st.en * 100), (el, v) => { el.style.width = `${v}%`; });
    set('h-hpt', `❤ ${Math.max(0, Math.round(me.hp))}/${st.hp}`, (el, v) => { el.textContent = v; });
    set('h-ent', `⚡ ${Math.round(me.en)}/${st.en}`, (el, v) => { el.textContent = v; });
    const hint = g.contextHint();
    set('h-acti', hint.icon, (el, v) => { el.textContent = v; });
    set('h-actl', hint.label, (el, v) => { el.textContent = v; });
    set('h-auto', g.auto ? 1 : 0, (el, v) => el.classList.toggle('on', !!v));
    // 낚시
    const f = g.fishing;
    const fs = f ? f.state : '';
    set('h-fish', fs === 'bite' || fs === 'reel' ? fs : '', (el, v) => { el.className = `fishbar ${v}`; });
    if (fs === 'bite') set('h-fishlabel', '❗ 입질! 버튼을 누르세요', (el, v) => { el.textContent = v; });
    if (fs === 'reel') {
      set('h-fishlabel', '초록 칸에서 누르세요!', (el, v) => { el.textContent = v; });
      this.$('h-fzone').style.left = `${f.zoneAt * 100}%`;
      this.$('h-fzone').style.width = `${f.zone * 100}%`;
      this.$('h-fmark').style.left = `${f.pos * 100}%`;
    }
    // 접속 중인 사람
    const who = [me.name, ...Object.values(g.players).filter(o => o.online).map(o => o.pub.n)];
    set('h-who', who.join('|'), el => {
      el.innerHTML = who.map((n, i) => `<span class="${i ? '' : 'me'}">${esc(n)}</span>`).join('');
    });
    if (this.panel === 'char') this.drawPreview();
  }

  // ── 알림 ───────────────────────────────────────────────────────────────────
  toast(msg, kind = '') {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2400);
    setTimeout(() => el.remove(), 2900);
    if (kind === 'bad') sfx('error');
  }
  mapBanner(name) {
    const el = this.$('h-banner');
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  levelUp(u) { this.toast(`🎉 ${SKILLS[u.skill]} ${u.lv}레벨!`, 'good'); sfx('levelup'); }
  hurt() { sfx('hurt'); if (this.settings.vibrate) navigator.vibrate?.(40); document.body.classList.remove('hurt'); void document.body.offsetWidth; document.body.classList.add('hurt'); }
  caught(id) { sfx('catch'); this.toast(`🎣 ${ITEMS[id].name}을(를) 낚았어요!`, 'good'); }
  sfx(name) { sfx(name); }
  onChat(c) {
    if (this.panel === 'chat') this.render();
    else { this.$('h-chatdot').classList.add('on'); if (c.sys) this.toast(c.t); }
  }
  backup(me) { this.onBackup?.(me); }

  refresh(part) {
    if (part === 'hotbar' || !part) this.renderHotbar();
    if (part === 'decor' || !part) this.renderDecor();
    if (this.panel && part !== 'players' && part !== 'map') this.render();
    if (part === 'map' && this.panel === 'teleport') this.close();
    if (part === 'map') this.renderDecor();
  }

  renderHotbar() {
    const g = this.g;
    const el = this.$('h-hotbar');
    if (!el) return;
    el.innerHTML = g.me.inv.slice(0, 8).map((s, i) => `
      <button class="slot ${i === g.selected ? 'sel' : ''}" data-hb="${i}">
        ${s ? `${icon(s.id)}<b>${s.n > 1 ? s.n : ''}</b>` : ''}<em>${i + 1}</em>
      </button>`).join('');
    el.querySelectorAll('[data-hb]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.hb);
      if (g.selected === i && g.me.inv[i]) g.useSlot(i);
      else { g.select(i); this.flashSelName(); }
      sfx('click');
    }));
    this.flashSelName(false);
  }
  flashSelName(show = true) {
    const el = this.$('h-selname');
    const it = this.g.selectedItem();
    el.textContent = it ? `${it.name}${['food', 'cloth', 'furniture'].includes(it.type) ? ' · 한 번 더 누르면 사용' : ''}` : '';
    if (show && it) { el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  }

  renderDecor() {
    const g = this.g;
    const el = this.$('h-decor');
    if (!el) return;
    if (!g.decor) { el.className = 'decorbar'; el.innerHTML = ''; return; }
    const items = g.me.inv.map((s, i) => [s, i]).filter(([s]) => s && ITEMS[s.id].type === 'furniture');
    el.className = 'decorbar on';
    el.innerHTML = `
      <div class="db-title">🪑 꾸미기 — ${g.decor.slot != null ? '바닥을 눌러 놓으세요' : '가구를 고르거나, 놓인 가구를 눌러 가방에 넣으세요'}</div>
      <div class="db-list">${items.length ? items.map(([s, i]) => `<button class="slot ${g.decor.slot === i ? 'sel' : ''}" data-dslot="${i}">${icon(s.id)}<b>${s.n > 1 ? s.n : ''}</b></button>`).join('') : '<span class="muted">가방에 가구가 없어요. 시장이나 작업대에서 구해 보세요</span>'}</div>
      <button class="btn small" data-dexit>완료</button>`;
    el.querySelectorAll('[data-dslot]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.dslot);
      g.decor.slot = g.decor.slot === i ? null : i;
      g.decor.ghost = null;
      this.renderDecor();
    }));
    el.querySelector('[data-dexit]').addEventListener('click', () => g.stopDecor());
  }

  // ── 창 ─────────────────────────────────────────────────────────────────────
  open(name, arg) {
    this.panel = name;
    this.arg = arg;
    this.invSel = null;
    const sh = this.$('sheet');
    sh.hidden = false;
    if (name === 'chat') this.$('h-chatdot').classList.remove('on');
    sfx('open');
    this.render();
  }
  close() {
    this.panel = null;
    this.$('sheet').hidden = true;
    this.$('sheet').innerHTML = '';
  }
  // 게임이 부르는 창 열기
  openNpc(n) { this.open('npc', n); }
  openCraft(kind) { this.open('craft', kind); }
  openShop(shop, sellOnly = false) { this.open('shop', { shop, sellOnly, tab: sellOnly ? 'sell' : 'buy' }); }
  openChest() { this.open('chest'); }
  openBoard() { this.open('board'); }
  openTeleport() { this.open('teleport'); }
  showIdle(r) { this.idleReward = r; this.open('idle'); }

  render() {
    const sh = this.$('sheet');
    if (!this.panel) return;
    const map = {
      bag: () => this.pBag(), char: () => this.pChar(), craft: () => this.pCraft(), shop: () => this.pShop(), npc: () => this.pNpc(),
      board: () => this.pBoard(), teleport: () => this.pTeleport(), chest: () => this.pChest(), house: () => this.pHouse(),
      chat: () => this.pChat(), menu: () => this.pMenu(), idle: () => this.pIdle(), smithy: () => this.pSmithy(), gift: () => this.pGift(),
      stash: () => this.pStash(), help: () => this.pHelp(),
    };
    const { title, body, cls = '', noClose } = map[this.panel]();
    const scroll = sh.querySelector('.sheet-body')?.scrollTop || 0;
    sh.innerHTML = `<div class="sheet ${cls}" role="dialog">
      <header><h2>${title}</h2>${noClose ? '' : '<button class="x" data-close>✕</button>'}</header>
      <div class="sheet-body">${body}</div></div>`;
    sh.querySelector('.sheet-body').scrollTop = scroll;
    sh.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.close()));
    sh.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { sfx('click'); this.open(b.dataset.go, this.arg); }));
    this.bind?.(sh);
    this.bind = null;
  }

  tabs(active, list) {
    return `<nav class="tabs">${list.map(([k, label]) => `<button class="${k === active ? 'on' : ''}" data-go="${k}">${label}</button>`).join('')}</nav>`;
  }

  // 가방
  pBag() {
    const g = this.g;
    const inv = g.me.inv;
    const sel = this.invSel;
    const s = sel != null ? inv[sel] : null;
    const it = s ? ITEMS[s.id] : null;
    let detail = '<p class="muted center">칸을 눌러 자세히 보세요. 칸을 끌어서 옮길 수 있어요.</p>';
    if (it) {
      const acts = [];
      if (it.type === 'food') acts.push(['use', `먹기 (⚡+${it.en || 0}${it.hp ? ` ❤+${it.hp}` : ''})`]);
      if (it.type === 'cloth') acts.push(['use', '입기']);
      if (it.type === 'furniture') acts.push(['use', g.map.id === 'house' ? '집에 놓기' : '집에서 놓을 수 있어요']);
      if (sel >= 8) acts.push(['hot', '핫바로']);
      acts.push(['trash', '버리기']);
      const bonus = it.bonus ? Object.entries(it.bonus).map(([k, v]) => `${STATS[k] || SKILLS[k]} +${v}`).join(' · ') : '';
      const buff = it.buff ? `30분 버프: ${Object.entries(it.buff).map(([k, v]) => `${STATS[k]} +${v}`).join(' · ')}` : '';
      detail = `<div class="detail">${icon(s.id, 'big')}<div><b>${esc(it.name)}</b> <span class="muted">×${s.n}</span>
        <p class="muted">${typeLabel(it.type)} · 기본가 ${it.price}G${bonus ? ` · ${bonus}` : ''}${buff ? `<br>${buff}` : ''}${it.type === 'seed' ? `<br>밭을 갈고 이 씨앗을 선택한 채 밭을 누르세요` : ''}</p>
        <div class="row">${acts.map(([k, l]) => `<button class="btn small ${k === 'trash' ? 'ghost' : ''}" data-ia="${k}">${l}</button>`).join('')}</div></div></div>`;
    }
    const stashN = Object.values(g.me.stash).reduce((a, n) => a + n, 0);
    this.bind = sh => {
      this.bindInvGrid(sh);
      sh.querySelectorAll('[data-ia]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.ia;
        if (a === 'use') { g.useSlot(sel); if (ITEMS[s.id]?.type === 'furniture' && g.map.id === 'house') this.close(); }
        if (a === 'hot') { const to = inv.slice(0, 8).findIndex(x => !x); g.moveSlot(sel, to >= 0 ? to : g.selected); this.invSel = null; }
        if (a === 'trash') { if (confirm(`${it.name} ${s.n}개를 버릴까요?`)) { g.trashSlot(sel); this.invSel = null; } }
        this.renderHotbar();
        if (this.panel) this.render();
      }));
      sh.querySelector('[data-sort]')?.addEventListener('click', () => { g.sortBag(); this.render(); this.renderHotbar(); });
    };
    return {
      title: '🎒 가방',
      cls: 'wide',
      body: `${this.tabs('bag', [['bag', '가방'], ['char', '캐릭터'], ['stash', `보관함${stashN ? ` (${stashN})` : ''}`]])}
        <div class="inv-grid">${inv.map((x, i) => `<button class="slot ${i < 8 ? 'hb' : ''} ${i === sel ? 'sel' : ''}" data-inv="${i}">${x ? `${icon(x.id)}<b>${x.n > 1 ? x.n : ''}</b>` : ''}${i < 8 ? `<em>${i + 1}</em>` : ''}</button>`).join('')}</div>
        <div class="row between"><span class="muted">위 8칸이 핫바예요</span><button class="btn small ghost" data-sort>정리</button></div>
        ${detail}`,
    };
  }

  bindInvGrid(sh) {
    const g = this.g;
    let drag = null;
    sh.querySelectorAll('[data-inv]').forEach(b => {
      b.addEventListener('pointerdown', e => {
        const i = Number(b.dataset.inv);
        drag = { i, x: e.clientX, y: e.clientY, moved: false, el: null };
        b.setPointerCapture(e.pointerId);
      });
      b.addEventListener('pointermove', e => {
        if (!drag || !g.me.inv[drag.i]) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
          drag.moved = true;
          drag.el = document.createElement('img');
          drag.el.className = 'drag-ghost';
          drag.el.src = itemUrl(g.me.inv[drag.i].id);
          document.body.appendChild(drag.el);
        }
        if (drag.el) { drag.el.style.left = `${e.clientX}px`; drag.el.style.top = `${e.clientY}px`; }
      });
      b.addEventListener('pointerup', e => {
        if (!drag) return;
        const d = drag; drag = null;
        d.el?.remove();
        if (d.moved) {
          const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-inv]');
          if (t) { g.moveSlot(d.i, Number(t.dataset.inv)); this.invSel = Number(t.dataset.inv); sfx('click'); }
        } else { this.invSel = this.invSel === d.i ? null : d.i; sfx('click'); }
        this.renderHotbar();
        this.render();
      });
    });
  }

  pStash() {
    const g = this.g;
    const ids = Object.keys(g.me.stash).filter(id => g.me.stash[id] > 0);
    this.bind = sh => sh.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
      const n = g.takeFromStash(b.dataset.take, b.dataset.all ? 9999 : 1);
      if (!n) this.toast('가방에 자리가 없어요', 'bad');
      this.render(); this.renderHotbar();
    }));
    return {
      title: '📦 내 보관함',
      cls: 'wide',
      body: `${this.tabs('stash', [['bag', '가방'], ['char', '캐릭터'], ['stash', '보관함']])}
        <p class="muted">가방이 가득 찼을 때 넘친 물건과 방치 보상이 여기 모여요. 개수 제한이 없어요.</p>
        ${ids.length ? `<div class="list">${ids.map(id => `<div class="li">${icon(id)}<b>${esc(ITEMS[id].name)}</b><span class="muted">×${g.me.stash[id]}</span>
          <span class="grow"></span><button class="btn small" data-take="${id}">1개</button><button class="btn small" data-take="${id}" data-all="1">전부</button></div>`).join('')}</div>` : '<p class="center muted">비어 있어요</p>'}`,
    };
  }

  // 캐릭터
  pChar() {
    const g = this.g;
    const me = g.me;
    const st = statsOf(me);
    const J = JOBS[me.job];
    const bar = (v, max) => `<i style="width:${Math.min(100, v / max * 100)}%"></i>`;
    this.bind = sh => {
      this.previewCanvas = sh.querySelector('#preview');
      sh.querySelectorAll('[data-idle]').forEach(b => b.addEventListener('click', () => { g.setIdleJob(b.dataset.idle); this.render(); }));
      sh.querySelectorAll('[data-uneq]').forEach(b => b.addEventListener('click', () => g.unequip(b.dataset.uneq)));
    };
    const buffs = (me.buffs || []).filter(b => b.until > Date.now());
    return {
      title: '🧑‍🌾 캐릭터',
      cls: 'wide',
      body: `${this.tabs('char', [['bag', '가방'], ['char', '캐릭터'], ['stash', '보관함']])}
        <div class="char-top">
          <canvas id="preview" width="64" height="96"></canvas>
          <div><b class="big">${esc(me.name)}</b><div class="job" style="--c:${J.color}">${J.icon} ${J.name} · 종합 Lv.${totalLevel(me)}</div>
          <p class="muted small">${J.desc}</p>
          <div class="equip">${['hat', 'top'].map(s => `<button class="slot" data-uneq="${s}" title="${s === 'hat' ? '모자' : '옷'}">${me.equip[s] ? icon(me.equip[s]) : `<span class="muted">${s === 'hat' ? '모자' : '옷'}</span>`}</button>`).join('')}<span class="muted small">눌러서 벗기</span></div>
          </div>
        </div>
        <h3>능력치</h3>
        <div class="stats">${Object.entries(STATS).map(([k, n]) => `<div><span>${n}</span><b>${st[k]}</b><em>${k === 'hp' || k === 'en' ? '' : `기본 ${me.base[k]}`}</em></div>`).join('')}</div>
        ${buffs.length ? `<p class="buffs">✨ ${buffs.map(b => `${ITEMS[b.src]?.name || '분수 행운'}: ${Object.entries(b.stats).map(([k, v]) => `${STATS[k]}+${v}`).join(' ')} (${Math.ceil((b.until - Date.now()) / 60000)}분)`).join(' · ')}</p>` : ''}
        <h3>기술</h3>
        <div class="skills">${Object.entries(SKILLS).map(([k, n]) => {
          const s = me.skills[k];
          return `<div><span>${n}</span><b>Lv.${s.lv}</b><div class="xp">${s.lv >= MAX_SKILL ? '<i style="width:100%"></i>' : bar(s.xp, xpForLevel(s.lv))}</div></div>`;
        }).join('')}</div>
        <h3>🌙 방치 활동</h3>
        <p class="muted small">접속하지 않는 동안(최대 ${g.house.level >= 4 ? 16 : 8}시간) 캐릭터가 이 일을 계속해요. 직업과 맞으면 30% 더!</p>
        <div class="chips">${Object.entries(IDLE_JOBS).map(([k, j]) => `<button class="${me.idle === k ? 'on' : ''}" data-idle="${k}">${j.icon} ${j.name}</button>`).join('')}</div>
        <h3>도구</h3>
        <div class="tools">${Object.entries(TOOLS).map(([k, t]) => `<div><img class="ico" src="${toolUrl(k, me.tools[k])}"><span>${TOOL_TIERS[me.tools[k]]} ${t.name}</span></div>`).join('')}</div>
        <p class="muted small">도구는 마을 대장간의 철수에게 강화할 수 있어요.</p>
        <h3>기록</h3>
        <p class="muted small">수확 ${me.stats.harvested} · 채굴 ${me.stats.mined} · 낚시 ${me.stats.fished} · 사냥 ${me.stats.hunted} · 요리 ${me.stats.cooked} · 재봉 ${me.stats.sewn} · 광산 최고 ${me.done.mineMax || 0}층 · 유적 최고 ${me.done.ruinsMax || 0}층</p>`,
    };
  }
  drawPreview() {
    const c = this.previewCanvas;
    if (!c?.isConnected) return;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, 64, 96);
    const sh = charSheet(lookOf(this.g.me));
    const dirs = ['down', 'right', 'up', 'left'];
    const t = performance.now();
    const dir = dirs[Math.floor(t / 2000) % 4];
    x.drawImage(sh[dir].walk[Math.floor(t / 150) % 4], 0, 0, 64, 96);
  }

  // 제작
  pCraft() {
    const g = this.g;
    const kind = this.arg;
    const skill = STATION_SKILL[kind];
    const list = RECIPES.filter(r => r.station === kind);
    this.bind = sh => sh.querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => {
      const res = g.craft(b.dataset.craft);
      this.toast(res.msg, res.ok ? 'good' : 'bad');
      if (res.ok) sfx('harvest');
      this.render(); this.renderHotbar();
    }));
    return {
      title: `${kind === 'stove' ? '🍳' : kind === 'sewing' ? '🧵' : '🔨'} ${STATION_NAME[kind]}`,
      cls: 'wide',
      body: `<p class="muted">${SKILLS[skill]} Lv.${g.me.skills[skill].lv} · 재료는 가방에서 가져가요</p>
        <div class="list">${list.map(r => {
          const out = ITEMS[r.out[0]];
          const chk = g.canCraft(r.id);
          const lvOk = g.me.skills[skill].lv >= r.lv;
          return `<div class="li recipe ${chk.ok ? '' : 'dim'}">${icon(r.out[0], 'big')}
            <div class="grow"><b>${esc(out.name)}${r.out[1] > 1 ? ` ×${r.out[1]}` : ''}</b>${lvOk ? '' : ` <span class="bad">Lv.${r.lv}</span>`}
            <div class="needs">${r.in.map(([id, n]) => {
              const alts = [id, ...(r.alt?.[id] || [])];
              const have = Math.max(...alts.map(a => count(g.me.inv, a)));
              return `<span class="${have >= n ? 'ok' : 'no'}">${icon(id)}${esc(ITEMS[id].name)}${r.alt?.[id] ? ' 등' : ''} ${have}/${n}</span>`;
            }).join('')}</div>
            ${out.type === 'food' ? `<div class="muted small">⚡+${out.en || 0}${out.hp ? ` ❤+${out.hp}` : ''}${out.buff ? ' · 버프' : ''}</div>` : ''}
            ${out.bonus ? `<div class="muted small">${Object.entries(out.bonus).map(([k, v]) => `${STATS[k] || SKILLS[k]} +${v}`).join(' · ')}</div>` : ''}
            </div><button class="btn small" data-craft="${r.id}" ${chk.ok ? '' : 'disabled'}>만들기</button></div>`;
        }).join('')}</div>`,
    };
  }

  // 상점
  pShop() {
    const g = this.g;
    const { shop, sellOnly } = this.arg;
    const S = SHOPS[shop];
    const tab = this.arg.tab || 'buy';
    const hearts = g.hearts(S.npc);
    const day = g.day;
    this.bind = sh => {
      sh.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => { this.arg.tab = b.dataset.stab; this.render(); }));
      sh.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
        const r = g.buy(b.dataset.buy, Number(b.dataset.n));
        this.toast(r.msg, r.ok ? 'good' : 'bad');
        this.render(); this.renderHotbar();
      }));
      sh.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => {
        const slot = Number(b.dataset.sell);
        const n = b.dataset.all ? g.me.inv[slot].n : 1;
        const got = g.sell(slot, n, shop);
        this.toast(`💰 +${got}G`, 'good');
        this.render(); this.renderHotbar();
      }));
    };
    const sellable = g.me.inv.map((s, i) => [s, i]).filter(([s]) => s && S.buys.includes(ITEMS[s.id].type));
    const trend = id => { const m = priceMult(day, id); return m > 1.15 ? '<span class="up">▲</span>' : m < 0.85 ? '<span class="down">▼</span>' : ''; };
    return {
      title: `🛒 ${S.name}`,
      cls: 'wide',
      body: `${sellOnly ? '<p class="muted">📦 출하 상자 — 오늘 시장 시세로 바로 팔려요</p>' : `<nav class="tabs"><button class="${tab === 'buy' ? 'on' : ''}" data-stab="buy">사기</button><button class="${tab === 'sell' ? 'on' : ''}" data-stab="sell">팔기</button></nav>`}
        <p class="muted small">💰 ${fmtN(g.me.gold)}G${hearts ? ` · 친밀도 ♥${hearts} (판매가 +${hearts * 2}%)` : ''}</p>
        ${tab === 'buy' && !sellOnly ? `<div class="list">${S.sells.map(id => `<div class="li">${icon(id)}<b>${esc(ITEMS[id].name)}</b><span class="muted">${buyPrice(id)}G</span><span class="grow"></span>
            <button class="btn small" data-buy="${id}" data-n="1">1개</button>${ITEMS[id].type === 'furniture' ? '' : `<button class="btn small" data-buy="${id}" data-n="5">5개</button>`}</div>`).join('')}</div>`
          : sellable.length ? `<div class="list">${sellable.map(([s, i]) => `<div class="li">${icon(s.id)}<b>${esc(ITEMS[s.id].name)}</b><span class="muted">×${s.n}</span>
            <span class="price">${g.priceOf(s.id, shop)}G ${trend(s.id)}</span><span class="grow"></span>
            <button class="btn small" data-sell="${i}">1개</button><button class="btn small" data-sell="${i}" data-all="1">전부</button></div>`).join('')}</div>`
            : '<p class="center muted">팔 수 있는 물건이 없어요</p>'}`,
    };
  }

  pSmithy() {
    const g = this.g;
    this.bind = sh => {
      sh.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
        const r = g.upgradeTool(b.dataset.up);
        this.toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('levelup');
        this.render(); this.renderHotbar();
      }));
      sh.querySelector('[data-smithshop]').addEventListener('click', () => this.openShop('smith'));
    };
    return {
      title: '🔨 철수 대장간 — 도구 강화',
      cls: 'wide',
      body: `<p class="muted">강화할수록 기력이 덜 들고 더 세져요. 괭이·물뿌리개는 철부터 여러 칸을 한 번에!</p>
        <div class="list">${Object.entries(TOOLS).map(([k, t]) => {
          const tier = g.me.tools[k];
          const cost = TOOL_UPGRADE[tier];
          return `<div class="li"><img class="ico big" src="${toolUrl(k, tier)}"><div class="grow"><b>${TOOL_TIERS[tier]} ${t.name}</b>
            ${cost ? `<div class="needs"><span class="${g.me.gold >= cost.gold ? 'ok' : 'no'}">💰 ${fmtN(cost.gold)}G</span>${cost.items.map(([id, n]) => `<span class="${count(g.me.inv, id) >= n ? 'ok' : 'no'}">${icon(id)}${esc(ITEMS[id].name)} ${count(g.me.inv, id)}/${n}</span>`).join('')}</div>` : '<div class="muted">최고 단계 ✨</div>'}
            </div>${cost ? `<button class="btn small" data-up="${k}">→ ${TOOL_TIERS[tier + 1]}</button>` : ''}</div>`;
        }).join('')}</div>
        <button class="btn ghost wide" data-smithshop>광석 사고팔기</button>`,
    };
  }

  // NPC
  pNpc() {
    const g = this.g;
    const n = this.arg;
    const t = g.talk(n.id);
    const D = NPCS[n.id] || { name: '나비', role: '마을 고양이', lines: ['냐옹~'] };
    const shopKind = n.shop === 'smithy' ? 'smithy' : n.shop;
    this.bind = sh => {
      const pc = sh.querySelector('#npcface');
      if (pc) {
        const x = pc.getContext('2d');
        x.imageSmoothingEnabled = false;
        if (n.pet) x.drawImage(catSheet().right[0], 8, 20, 48, 36);
        else x.drawImage(charSheet({ bottom: '#5a4a3a', ...D.look }).down.walk[0], 0, -8, 64, 96);
      }
      sh.querySelector('[data-trade]')?.addEventListener('click', () => {
        if (shopKind === 'smithy') this.open('smithy');
        else this.openShop(shopKind);
      });
      sh.querySelector('[data-gift]')?.addEventListener('click', () => this.open('gift', n));
      sh.querySelector('[data-board]')?.addEventListener('click', () => this.open('board'));
    };
    if (n.pet) return { title: '🐱 나비', body: '<div class="npc"><canvas id="npcface" width="64" height="64"></canvas><p class="line">"냐아옹~" (골골골…)</p></div>' };
    const hearts = '♥'.repeat(t.hearts) + '♡'.repeat(Math.max(0, 5 - t.hearts));
    return {
      title: `💬 ${esc(D.name)}`,
      body: `<div class="npc"><canvas id="npcface" width="64" height="72"></canvas>
        <div><div class="muted">${esc(D.role)} · <span class="hearts">${hearts}</span></div><p class="line">"${esc(t.line)}"</p>${t.first ? '<p class="muted small">오늘 첫 대화! 친밀도 +10</p>' : ''}</div></div>
        <div class="row">
          ${shopKind ? `<button class="btn" data-trade>${shopKind === 'smithy' ? '🔨 도구 강화' : '🛒 거래하기'}</button>` : ''}
          ${n.id === 'mayor' ? '<button class="btn" data-board>📋 오늘의 부탁</button>' : ''}
          <button class="btn ghost" data-gift>🎁 선물하기</button>
        </div>
        ${n.id === 'rea' ? `<p class="muted small">레아의 탐험 수첩: 유적 최고 ${g.me.done.ruinsMax || 0}층 · 광산 최고 ${g.me.done.mineMax || 0}층. 5층마다 순간이동 문양/승강기가 있어요.</p>` : ''}`,
    };
  }
  pGift() {
    const g = this.g;
    const n = this.arg;
    this.bind = sh => sh.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      const r = g.gift(n.id, Number(b.dataset.g));
      if (r) this.toast(r.msg, r.ok ? 'good' : 'bad');
      this.open('npc', n);
    }));
    return {
      title: `🎁 ${esc(NPCS[n.id]?.name)}에게 선물`,
      cls: 'wide',
      body: `<p class="muted">하루에 한 번. 비싼 물건일수록 좋아해요.</p><div class="inv-grid">${g.me.inv.map((s, i) => `<button class="slot" data-g="${i}" ${s ? '' : 'disabled'}>${s ? `${icon(s.id)}<b>${s.n > 1 ? s.n : ''}</b>` : ''}</button>`).join('')}</div>`,
    };
  }

  // 게시판
  pBoard() {
    const g = this.g;
    const reqs = g.requests();
    this.bind = sh => sh.querySelectorAll('[data-req]').forEach(b => b.addEventListener('click', () => {
      const r = g.deliver(reqs[Number(b.dataset.req)]);
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) sfx('coin');
      this.render(); this.renderHotbar();
    }));
    return {
      title: '📋 마을 게시판',
      cls: 'wide',
      body: `<h3>오늘의 부탁 (${g.day}일차)</h3>
        <div class="list">${reqs.map((r, i) => {
          const done = g.me.done[`req-${r.key}`];
          const have = count(g.me.inv, r.id);
          return `<div class="li ${done ? 'dim' : ''}">${icon(r.id)}<div class="grow"><b>${esc(ITEMS[r.id].name)} ${r.n}개</b><div class="muted small">보상 ${fmtN(r.reward)}G · 촌장님 친밀도</div></div>
            ${done ? '<span class="ok">✔ 완료</span>' : `<span class="${have >= r.n ? 'ok' : 'no'}">${have}/${r.n}</span><button class="btn small" data-req="${i}" ${have >= r.n ? '' : 'disabled'}>전달</button>`}</div>`;
        }).join('')}</div>
        <h3>📈 오늘 시세가 좋은 물건</h3>
        <div class="chips">${hotItems(g.day, 4).map(([id, m]) => `<span>${icon(id)} ${esc(ITEMS[id].name)} ×${m.toFixed(2)}</span>`).join('')}</div>
        <p class="muted small">부탁은 매일 바뀌고, 각자 한 번씩 해결할 수 있어요.</p>`,
    };
  }

  // 순간이동
  pTeleport() {
    const g = this.g;
    const ids = [...Object.keys(WAYPOINTS), ...Object.keys(g.waypoints).filter(k => !WAYPOINTS[k]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))];
    this.bind = sh => sh.querySelectorAll('[data-tp]').forEach(b => b.addEventListener('click', () => { this.close(); g.teleport(b.dataset.tp); }));
    return {
      title: '✨ 순간이동 석상',
      body: `<p class="muted">한 번 찾아가 깨운 석상으로만 갈 수 있어요. (기력 3)</p>
        <div class="list">${ids.map(id => {
          const info = waypointInfo(id);
          const on = !!g.waypoints[id];
          const here = info.map === g.map.id;
          return `<div class="li ${on ? '' : 'dim'}"><span class="wp ${on ? 'on' : ''}">${on ? '✦' : '?'}</span><b>${on ? esc(info.name) : '??? (아직 못 찾음)'}</b>
            ${on && g.waypoints[id].by ? `<span class="muted small">${esc(g.waypoints[id].by)} 발견</span>` : ''}<span class="grow"></span>
            ${on ? `<button class="btn small" data-tp="${id}" ${here ? 'disabled' : ''}>${here ? '여기' : '이동'}</button>` : ''}</div>`;
        }).join('')}</div>`,
    };
  }

  // 공용 보관함
  pChest() {
    const g = this.g;
    const ids = Object.keys(g.chest || {}).filter(id => g.chest[id] > 0 && ITEMS[id]);
    this.bind = sh => {
      sh.querySelectorAll('[data-ct]').forEach(b => b.addEventListener('click', async () => { await g.chestTake(b.dataset.ct, b.dataset.all ? 999 : 1); this.renderHotbar(); }));
      sh.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', async () => { await g.chestPut(Number(b.dataset.cp), 999); this.renderHotbar(); this.render(); }));
    };
    return {
      title: '📦 공용 보관함',
      cls: 'wide',
      body: `<p class="muted">같은 세계의 모두가 함께 쓰는 상자예요. 필요한 사람이 꺼내 가요.</p>
        <h3>상자 안</h3>
        ${ids.length ? `<div class="list">${ids.map(id => `<div class="li">${icon(id)}<b>${esc(ITEMS[id].name)}</b><span class="muted">×${g.chest[id]}</span><span class="grow"></span>
          <button class="btn small" data-ct="${id}">1개</button><button class="btn small" data-ct="${id}" data-all="1">전부</button></div>`).join('')}</div>` : '<p class="center muted">비어 있어요</p>'}
        <h3>내 가방 → 상자 (누르면 한 묶음을 넣어요)</h3>
        <div class="inv-grid">${g.me.inv.map((s, i) => `<button class="slot" data-cp="${i}" ${s ? '' : 'disabled'}>${s ? `${icon(s.id)}<b>${s.n > 1 ? s.n : ''}</b>` : ''}</button>`).join('')}</div>`,
    };
  }

  // 하우스
  pHouse() {
    const g = this.g;
    const lv = g.house.level;
    const H = HOUSE_LEVELS[lv];
    const need = g.houseNeeds();
    const contrib = Object.values(g.house.contrib || {}).sort((a, b) => b.v - a.v).slice(0, 6);
    const ready = need && need.gold.have >= need.gold.need && need.items.every(x => x.have >= x.need);
    this.bind = sh => {
      sh.querySelectorAll('[data-dg]').forEach(b => b.addEventListener('click', async () => {
        const n = Math.min(Number(b.dataset.dg), g.me.gold, need ? Math.max(0, need.gold.need - need.gold.have) : 0);
        if (n <= 0) return this.toast('더 넣을 필요가 없거나 골드가 없어요');
        const r = await g.donate('gold', n);
        this.toast(r.msg, r.ok ? 'good' : 'bad');
      }));
      sh.querySelectorAll('[data-di]').forEach(b => b.addEventListener('click', async () => {
        const x = need.items.find(q => q.id === b.dataset.di);
        const n = Math.min(count(g.me.inv, x.id), x.need - x.have);
        if (n <= 0) return this.toast('가방에 없어요');
        const r = await g.donate(x.id, n);
        this.toast(r.msg, r.ok ? 'good' : 'bad');
        this.renderHotbar();
      }));
      sh.querySelector('[data-lvup]')?.addEventListener('click', async () => {
        const r = await g.levelUpHouse();
        this.toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('discover');
      });
      sh.querySelector('[data-decor]')?.addEventListener('click', () => { this.close(); g.startDecor(); });
      sh.querySelector('[data-invite]')?.addEventListener('click', () => this.copyInvite());
    };
    const pct = (a, b) => Math.min(100, Math.round(a / b * 100));
    return {
      title: '🏠 하하호호 하우스',
      cls: 'wide',
      body: `<div class="house-card"><div class="lv">Lv.${lv}</div><div><b class="big">${esc(H.name)}</b><div class="muted small">${esc(H.perks)} · 밭 ${H.plots}칸</div></div></div>
        ${need ? `<h3>다음 단계: ${esc(need.next.name)}</h3><p class="muted small">${esc(need.next.perks)} · 밭 ${need.next.plots}칸</p>
          <div class="list">
            <div class="li"><span class="ico">💰</span><div class="grow"><b>골드</b><div class="prog"><i style="width:${pct(need.gold.have, need.gold.need)}%"></i></div><span class="muted small">${fmtN(need.gold.have)} / ${fmtN(need.gold.need)}</span></div>
              <button class="btn small" data-dg="100">+100</button><button class="btn small" data-dg="1000">+1000</button></div>
            ${need.items.map(x => `<div class="li">${icon(x.id)}<div class="grow"><b>${esc(ITEMS[x.id].name)}</b><div class="prog"><i style="width:${pct(x.have, x.need)}%"></i></div><span class="muted small">${x.have} / ${x.need} · 내 가방 ${count(g.me.inv, x.id)}</span></div>
              <button class="btn small" data-di="${x.id}" ${x.have >= x.need ? 'disabled' : ''}>넣기</button></div>`).join('')}
          </div>
          <button class="btn wide ${ready ? 'gold' : ''}" data-lvup ${ready ? '' : 'disabled'}>${ready ? '🎉 집 키우기!' : '재료를 모두 모으면 키울 수 있어요'}</button>` : '<p class="center">🏰 최고 단계예요! 축하해요!</p>'}
        ${g.map.id === 'house' ? '<button class="btn wide" data-decor>🪑 집 꾸미기</button>' : '<p class="muted small center">집 안에서 🪑 꾸미기를 할 수 있어요</p>'}
        ${contrib.length ? `<h3>함께 키운 사람들</h3><div class="chips">${contrib.map(c => `<span>${esc(c.n)} · ${fmtN(c.v)}</span>`).join('')}</div>` : ''}
        <h3>친구 초대</h3><p class="muted small">최대 4명이 같은 세계에서 함께 살 수 있어요.</p>
        <button class="btn wide ghost" data-invite>🔗 초대 링크 복사</button>`,
    };
  }

  async copyInvite() {
    const link = this.inviteLink();
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: '하하호호 하우스 키우기', text: '같이 집 키우자! 🏠', url: link }); return; }
      await navigator.clipboard.writeText(link);
      this.toast('초대 링크를 복사했어요 🔗', 'good');
    } catch { prompt('이 링크를 친구에게 보내 주세요', link); }
  }

  // 대화
  pChat() {
    const g = this.g;
    const quick = ['안녕! 👋', '같이 하자!', '고마워 💕', '물 좀 줄게 💧', '광산 갈 사람?', '집 키우자 🏠', 'ㅋㅋㅋ', '잘 자 🌙'];
    this.bind = sh => {
      const inp = sh.querySelector('#chat-in');
      const send = () => { g.sendChat(inp.value); inp.value = ''; };
      sh.querySelector('[data-send]').addEventListener('click', send);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      sh.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { g.sendChat(b.dataset.q); this.close(); }));
      const log = sh.querySelector('.chat-log');
      log.scrollTop = log.scrollHeight;
    };
    return {
      title: '💬 대화',
      body: `<div class="chat-log">${g.chat.slice(-30).map(c => c.sys ? `<p class="sys">${esc(c.t)}</p>` : `<p><b>${esc(c.n)}</b> ${esc(c.t)}</p>`).join('') || '<p class="muted center">아직 조용해요</p>'}</div>
        <div class="row"><input id="chat-in" maxlength="60" placeholder="한마디 (말풍선으로 보여요)"><button class="btn small" data-send>보내기</button></div>
        <div class="chips">${quick.map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`,
    };
  }

  // 메뉴
  pMenu() {
    const g = this.g;
    const S = this.settings;
    const members = [g.me.name, ...Object.values(g.players).map(o => `${o.pub?.n}${o.online ? '' : ' (자리 비움)'}`)];
    this.bind = sh => {
      sh.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
        const [k, v] = b.dataset.set.split(':');
        S[k] = v === 'true' ? true : v === 'false' ? false : v;
        this.saveSettings(S);
        this.applyControlClass();
        this.onSettings?.(S);
        this.render();
      }));
      sh.querySelector('[data-invite]')?.addEventListener('click', () => this.copyInvite());
      sh.querySelector('[data-exit]').addEventListener('click', () => { this.close(); this.onExit(); });
      sh.querySelector('[data-auto]').addEventListener('click', () => { this.close(); g.toggleAuto(); });
    };
    const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(S[k]) === String(v) ? 'on' : ''}" data-set="${k}:${v}">${l}</button>`).join('')}</div>`;
    return {
      title: '☰ 메뉴',
      body: `<div class="world-info"><b>${esc(g.meta?.name || '')}</b><span class="muted small">세계 코드 ${esc(g.code)} · ${g.store.kind === 'online' ? '🌐 온라인' : '📱 이 기기에만 저장'} · ${g.day}일차</span>
          <span class="muted small">주민: ${members.map(esc).join(', ')}</span></div>
        ${g.store.kind === 'online' ? '<button class="btn wide" data-invite>🔗 친구 초대 링크</button>' : '<p class="muted small">혼자 하기 세계는 이 기기에만 저장돼요. 친구와 하려면 온라인 세계를 새로 만드세요.</p>'}
        <button class="btn wide ghost" data-auto>🌙 자동 모드 ${g.auto ? '끄기' : '켜기'} (${IDLE_JOBS[g.me.idle].name})</button>
        <h3>설정</h3>
        <div class="opt"><span>이동 방식</span>${seg('control', [['tap', '터치'], ['joystick', '조이스틱']])}</div>
        <div class="opt"><span>조이스틱 위치</span>${seg('lefty', [[false, '왼쪽'], [true, '오른쪽']])}</div>
        <div class="opt"><span>효과음</span>${seg('sound', [[true, '켜기'], [false, '끄기']])}</div>
        <div class="opt"><span>배경음</span>${seg('music', [[true, '켜기'], [false, '끄기']])}</div>
        <div class="opt"><span>진동</span>${seg('vibrate', [[true, '켜기'], [false, '끄기']])}</div>
        <button class="btn wide ghost" data-go="help">❓ 게임 방법</button>
        <button class="btn wide" data-exit>💾 저장하고 메인 화면으로</button>`,
    };
  }

  pHelp() {
    return {
      title: '❓ 게임 방법',
      body: helpHtml(),
    };
  }

  pIdle() {
    const g = this.g;
    const r = this.idleReward;
    const h = Math.floor(r.hours);
    const m = Math.round((r.hours - h) * 60);
    this.bind = sh => sh.querySelector('[data-take]').addEventListener('click', () => {
      g.acceptIdle(r);
      this.toast('🎁 방치 보상을 받았어요! (넘친 건 보관함으로)', 'good');
      sfx('discover');
      this.close();
      this.renderHotbar();
    });
    return {
      title: '🌙 다녀오셨군요!',
      noClose: true,
      body: `<p class="center">${h ? `${h}시간 ` : ''}${m}분 동안 <b>${esc(r.name)}</b>을(를) 했어요.</p>
        <div class="reward">${r.items.map(([id, n]) => `<span>${icon(id, 'big')}<b>×${n}</b><small>${esc(ITEMS[id].name)}</small></span>`).join('') || '<p class="muted">빈손…</p>'}</div>
        <p class="center muted small">${SKILLS[r.skill]} 경험치 +${r.xp}</p>
        <button class="btn gold wide" data-take>받기</button>`,
    };
  }
}

function typeLabel(t) {
  return { seed: '씨앗', crop: '작물', ore: '광석', mat: '재료', fish: '물고기', food: '음식', forage: '채집물', drop: '전리품', cloth: '옷', furniture: '가구' }[t] || t;
}

export function helpHtml() {
  return `<div class="help">
    <p><b>이동</b> — 가고 싶은 곳을 누르면 걸어가요. 누른 채 끌면 그쪽으로 걸어요. 메뉴에서 조이스틱으로 바꿀 수 있어요.</p>
    <p><b>상호작용</b> — 나무·바위·밭·사람을 누르면 다가가서 알아서 해요. 오른쪽 아래 큰 버튼은 바라보는 것과 상호작용해요.</p>
    <p><b>🌱 농사</b> — 괭이로 밭 갈기 → 씨앗 선택 후 심기 → 물 주기 → 수확. 물이 마르면 절반 속도로 자라요. 밭은 모두가 함께 써요.</p>
    <p><b>⛏️ 광업</b> — 농장 위쪽 광산. 깊이 갈수록 귀한 광석. 5층마다 승강기.</p>
    <p><b>🎣 낚시</b> — 물가에서 물을 바라보고 던지기 → 입질(!) 때 누르기 → 초록 칸에서 한 번 더.</p>
    <p><b>🏹 사냥 · 모험</b> — 숲에는 토끼·멧돼지·슬라임, 숲 남쪽 유적에는 해골과 5층마다 골렘이 있어요.</p>
    <p><b>🍳 요리 · 🧵 재봉 · 🔨 목공</b> — 마을 식당·의상실·대장간 옆, 또는 집을 키우면 집 안에서. 옷을 입으면 모습과 능력치가 바뀌어요.</p>
    <p><b>🛒 시장</b> — 시세는 날마다 바뀌어요. 농장의 출하 상자로도 팔 수 있어요.</p>
    <p><b>✨ 순간이동</b> — 각 지역의 석상을 한 번 깨우면 어디서든 이동할 수 있어요 (세계 공용).</p>
    <p><b>🏠 집 키우기</b> — 모두가 골드와 재료를 모아 집을 키워요. 집이 크면 밭이 넓어지고 작물이 빨리 자라요. 집 안에서 가구를 놓아 꾸며요.</p>
    <p><b>🌙 방치</b> — 접속하지 않는 동안 캐릭터가 고른 활동을 계속해요 (최대 8시간, 집 4단계부터 16시간). 작물도 계속 자라요.</p>
    <p><b>👥 함께 하기</b> — 초대 링크를 보내면 최대 4명이 같은 세계에서 놀 수 있어요.</p>
  </div>`;
}
