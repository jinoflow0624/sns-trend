// 게임 화면 위의 HUD 와 창들 (DOM). 규칙 판정은 전부 game.js 에 있고 여기선 보여 주고 부르기만 한다.
import {
  ITEMS, JOBS, SKILLS, STATS, TOOLS, TOOL_TIERS, TOOL_UPGRADE, RECIPES, STATION_NAME, STATION_SKILL, SHOPS,
  HOUSE_LEVELS, NPCS, IDLE_JOBS, xpForLevel, MAX_SKILL, HELPER_PLANS, TASTE_HINT, CUPS_PER_BUCKET, BREW_MS, purifierLimit,
} from '../data.js';
import { brewState, brewProgress } from '../logic/purifier.js';
import { itemUrl, toolUrl } from '../art/items.js';
import { iconImg, uiIconUrl } from '../art/icons.js';
import { charSheet } from '../art/chars.js';
import { lookOf, statsOf, totalLevel } from '../logic/player.js';
import { buyPrice, priceMult, hotItems } from '../logic/market.js';
import { WAYPOINTS, waypointInfo } from '../world/maps.js';
import { fmtClock } from '../game/clock.js';
import { count } from '../logic/inventory.js';
import { sfx } from '../game/sound.js';
import { APP_VERSION } from '../version.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<img class="ico ${cls}" src="${itemUrl(id)}" alt="">`;
const fmtN = n => Math.round(n).toLocaleString('ko-KR');
const TYPE = { seed: '씨앗', crop: '작물', ore: '광석', mat: '재료', fish: '물고기', food: '음식', forage: '채집물', drop: '전리품', cloth: '옷', furniture: '가구' };
const JOB_ICON = { farmer: ['tool', 'hoe'], miner: ['tool', 'pick'], fisher: ['tool', 'rod'], hunter: ['tool', 'sword'], cook: ['item', 'veggie_soup'], tailor: ['item', 'cloth'] };
export const jobIcon = job => {
  const [k, id] = JOB_ICON[job] || JOB_ICON.farmer;
  return `<img class="ico sm" src="${k === 'tool' ? toolUrl(id, 2) : itemUrl(id)}" alt="">`;
};
const IDLE_ICON = { farm: 'turnip', mine: 'copper_ore', fish: 'fish_carp', hunt: 'fur', forage: 'mushroom' };
const PANELS_WITH_BAG = new Set(['bag', 'stash', 'chest', 'craft', 'shop', 'smithy', 'gift', 'house', 'char', 'board', 'stall', 'purifier']);
// NPC 대사: {heart} 는 도트 하트로
const lineHtml = t => esc(t).replace('{heart}', iconImg('heart', 'sm'));

export class UI {
  constructor(root, { settings, saveSettings, onExit, inviteLink, onSettings, onRefresh }) {
    this.onRefresh = onRefresh;
    this.root = root;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.onExit = onExit;
    this.inviteLink = inviteLink;
    this.onSettings = onSettings;
    this.panel = null;
    this.last = {};
    this.sel = null;          // 격자에서 고른 칸 { from: 'inv'|'chest'|'stash', key }
    this.openedAt = 0;
    this.lastSavedToast = 0;
  }

  attach(game) {
    this.g = game;
    game.ui = this;
    this.root.innerHTML = `
      <div class="hud">
        <div class="hud-top">
          <div class="clockbox"><b id="h-day"></b><span><img class="pix sm" id="h-sky" alt=""><span id="h-time"></span><img class="pix sm caff" id="h-caff" src="${uiIconUrl('coffee')}" alt="카페인" title="커피를 마셨어요 (새벽 2시까지)" hidden></span></div>
          <div class="statbox">
            <div class="bar hp"><i id="h-hp"></i><span id="h-hpt"></span></div>
            <div class="bar en"><i id="h-en"></i><span id="h-ent"></span></div>
            <div class="gold"><img class="pix sm" src="${uiIconUrl('coin')}" alt=""><span id="h-gold"></span></div>
          </div>
          <div class="top-btns">
            <button data-open="house" title="하우스">${iconImg('house')}</button>
            <button data-open="teleport" title="순간이동">${iconImg('portal')}</button>
            <button data-open="chat" title="대화">${iconImg('chat')}<i class="dot" id="h-chatdot"></i></button>
            <button data-open="menu" title="메뉴">${iconImg('menu')}</button>
          </div>
        </div>
        <div class="who" id="h-who"></div>
        <div class="map-banner" id="h-banner"></div>
        <div class="fishbar" id="h-fish"><div class="fb-label" id="h-fishlabel"></div><div class="fb-track"><i class="fb-zone" id="h-fzone"></i><i class="fb-mark" id="h-fmark"></i></div></div>
        <div class="decorbar" id="h-decor"></div>
        <div class="hud-bottom">
          <div class="hotbar" id="h-hotbar"></div>
          <div class="bottom-row">
            <button class="bag-btn" data-open="bag" title="가방">${iconImg('bag', 'lg')}<small>가방</small></button>
            <div class="sel-name" id="h-selname"></div>
            <div class="act-wrap">
              <button class="idle-btn" data-open="idle" title="방치 창고">${iconImg('idle')}<i class="fill"><em id="h-idlefill"></em></i></button>
              <button class="act-btn" id="h-act"><img class="pix lg" id="h-acti" alt=""><small id="h-actl"></small></button>
            </div>
          </div>
        </div>
      </div>
      <div class="joy" id="joy"><i></i></div>
      <div class="sleep-ov" id="sleepov" hidden></div>
      <div class="sheet-bg" id="sheet" hidden></div>
      <div class="dayend" id="dayend" hidden></div>`;
    this.$ = id => this.root.querySelector(`#${id}`);
    this.root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { sfx('click'); this.open(b.dataset.open); }));
    this.$('h-act').addEventListener('pointerdown', e => { e.preventDefault(); this.g.action_(); });
    const sheet = this.$('sheet');
    // 창이 열리자마자 따라오는 "유령 클릭"(창을 연 그 터치의 click 이벤트)은 무시한다 → 창이 두 번 뜨던 문제
    sheet.addEventListener('click', e => {
      if (performance.now() - this.openedAt < 450) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    sheet.addEventListener('click', e => { if (e.target.id === 'sheet') this.close(); });
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
    set('h-sky', c.h >= 6 && c.h < 19 ? 'sun' : 'moon', (el, v) => { el.src = uiIconUrl(v); });
    set('h-time', fmtClock(c), (el, v) => { el.textContent = v; });
    set('h-caff', g.hasCaffeine(), (el, v) => { el.hidden = !v; });
    if (g.sleeping && performance.now() - (this.sleepDrawn || 0) > 500) this.renderSleep();
    set('h-gold', `${fmtN(me.gold)}G`, (el, v) => { el.textContent = v; });
    set('h-hp', Math.round(me.hp / st.hp * 100), (el, v) => { el.style.width = `${v}%`; });
    set('h-en', Math.round(me.en / st.en * 100), (el, v) => { el.style.width = `${v}%`; });
    set('h-hpt', `체력 ${Math.max(0, Math.round(me.hp))}/${st.hp}`, (el, v) => { el.textContent = v; });
    set('h-ent', `기력 ${Math.round(me.en)}/${st.en}`, (el, v) => { el.textContent = v; });
    const hint = g.contextHint();
    set('h-acti', hint.icon, (el, v) => { el.src = uiIconUrl(v); });
    set('h-actl', hint.label, (el, v) => { el.textContent = v; });
    set('h-idlefill', Math.round(g.idleFill() * 100), (el, v) => { el.style.width = `${v}%`; el.parentElement.parentElement.classList.toggle('full', v >= 100); });
    // 낚시
    const f = g.fishing;
    const fs = f ? f.state : '';
    set('h-fish', fs === 'bite' || fs === 'reel' ? fs : '', (el, v) => { el.className = `fishbar ${v}`; });
    if (fs === 'bite') set('h-fishlabel', '입질! 버튼을 누르세요', (el, v) => { el.textContent = v; });
    if (fs === 'reel') {
      set('h-fishlabel', '초록 칸에서 누르세요', (el, v) => { el.textContent = v; });
      this.$('h-fzone').style.left = `${f.zoneAt * 100}%`;
      this.$('h-fzone').style.width = `${f.zone * 100}%`;
      this.$('h-fmark').style.left = `${f.pos * 100}%`;
    }
    // 접속 중인 사람
    const who = [me.name, ...Object.values(g.players).filter(o => o.online).map(o => o.pub.n)];
    set('h-who', who.join('|'), el => { el.innerHTML = who.map((n, i) => `<span class="${i ? '' : 'me'}">${esc(n)}</span>`).join(''); });
    // 가방이 바뀌면 핫바와 열린 창을 바로 다시 그린다
    const sig = JSON.stringify([me.inv, me.gold, me.stash, me.equip, me.tools, g.chest, g.selected]);
    if (sig !== this.invSig) {
      this.invSig = sig;
      this.renderHotbar();
      if (PANELS_WITH_BAG.has(this.panel)) this.render();
    }
    if (this.panel === 'idle' && performance.now() - (this.idleDrawn || 0) > 3000) this.render();
    if (this.panel === 'purifier' && performance.now() - (this.purDrawn || 0) > 500) this.render();
    // 캐릭터가 화면 위쪽이면 알림은 아래에, 아래쪽이면 위에
    if (this.renderer) {
      const y = this.renderer.toScreen(g.px, g.py).y / innerHeight;
      const low = y < 0.42;
      if (low !== this.toastLow) { this.toastLow = low; document.getElementById('toasts').classList.toggle('low', low); }
    }
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
    setTimeout(() => el.classList.add('out'), kind === 'save' ? 1200 : 2400);
    setTimeout(() => el.remove(), kind === 'save' ? 1700 : 2900);
    if (kind === 'bad') sfx('error');
  }
  // 자동 저장 알림 (너무 자주 뜨지 않게 30초에 한 번)
  saved() {
    const now = performance.now();
    if (now - this.lastSavedToast < 30000) return;
    this.lastSavedToast = now;
    this.toast('자동 저장됨', 'save');
  }
  mapBanner(name) {
    const el = this.$('h-banner');
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  levelUp(u) { this.toast(`${SKILLS[u.skill]} ${u.lv}레벨이 되었어요`, 'good'); sfx('levelup'); }
  hurt() { sfx('hurt'); if (this.settings.vibrate) navigator.vibrate?.(40); document.body.classList.remove('hurt'); void document.body.offsetWidth; document.body.classList.add('hurt'); }
  caught(id) { sfx('catch'); this.toast(`${ITEMS[id].name}을(를) 낚았어요`, 'good'); }
  sfx(name) { sfx(name); }
  onChat(c) {
    if (this.panel === 'chat') this.render();
    else { this.$('h-chatdot').classList.add('on'); if (c.sys) this.toast(c.t); }
  }
  backup(me) { this.onBackup?.(me); }

  refresh(part) {
    if (part === 'hotbar' || !part) this.renderHotbar();
    if (part === 'decor' || part === 'map' || !part) this.renderDecor();
    if (part === 'map' && this.panel === 'teleport') this.close();
    else if (part === 'stall' && this.panel !== 'stall') return;
    else if (this.panel && part !== 'players' && part !== 'map' && part !== 'hotbar') this.render();
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
  }
  flashSelName() {
    const el = this.$('h-selname');
    const it = this.g.selectedItem();
    el.textContent = it ? `${it.name}${['food', 'cloth', 'furniture'].includes(it.type) ? ' · 한 번 더 누르면 사용' : ''}` : '';
    if (it) { el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  }

  renderDecor() {
    const g = this.g;
    const el = this.$('h-decor');
    if (!el) return;
    if (!g.decor) { el.className = 'decorbar'; el.innerHTML = ''; return; }
    const items = g.me.inv.map((s, i) => [s, i]).filter(([s]) => s && ITEMS[s.id].type === 'furniture');
    el.className = 'decorbar on';
    el.innerHTML = `
      <div class="db-title">꾸미기: ${g.decor.slot != null ? '바닥을 누르면 놓여요' : '가구를 고르거나, 놓인 가구를 눌러 가방에 넣으세요'}</div>
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
    this.sel = null;
    this.openedAt = performance.now();
    this.$('sheet').hidden = false;
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
  // 인사는 말을 걸 때 한 번 정한다 (창을 다시 그려도 바뀌지 않게)
  openNpc(n) { this.open(n.shop === 'regrow' ? 'regrow' : 'npc', { ...n, talk: this.g.talk(n.id) }); }
  openStall() { this.open('stall'); }
  openPurifier(fid) { this.open('purifier', fid); }
  askSleep() { this.open('bed'); }
  openCraft(kind) { this.open('craft', kind); }
  openShop(shop, sellOnly = false) { this.open('shop', { shop, sellOnly, tab: sellOnly ? 'sell' : 'buy' }); }
  openChest() { this.open('chest'); }
  openBoard() { this.open('board'); }
  openTeleport() { this.open('teleport'); }
  showIdle() { this.open('idle', { welcome: true }); }

  render() {
    const sh = this.$('sheet');
    if (!this.panel) return;
    const map = {
      bag: () => this.pBag(), char: () => this.pChar(), craft: () => this.pCraft(), shop: () => this.pShop(), npc: () => this.pNpc(),
      board: () => this.pBoard(), teleport: () => this.pTeleport(), chest: () => this.pChest(), house: () => this.pHouse(),
      chat: () => this.pChat(), menu: () => this.pMenu(), idle: () => this.pIdle(), smithy: () => this.pSmithy(), gift: () => this.pGift(),
      stash: () => this.pStash(), help: () => this.pHelp(), regrow: () => this.pRegrow(),
      stall: () => this.pStall(), purifier: () => this.pPurifier(), bed: () => this.pBed(),
    };
    const { title, body, cls = '' } = map[this.panel]();
    const scroll = sh.querySelector('.sheet-body')?.scrollTop || 0;
    sh.innerHTML = `<div class="sheet ${cls}" role="dialog">
      <header><h2>${title}</h2><button class="x" data-close aria-label="닫기">×</button></header>
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

  // 바둑판 칸들. cells: [{ key, id, n }] (id 가 없으면 빈 칸)
  grid(from, cells, { hot = 0, min = 0 } = {}) {
    const list = [...cells];
    while (list.length < min) list.push({ key: `empty${list.length}` });
    return `<div class="inv-grid">${list.map((c, i) => {
      const on = this.sel && this.sel.from === from && String(this.sel.key) === String(c.key);
      return `<button class="slot ${i < hot ? 'hb' : ''} ${on ? 'sel' : ''}" data-cell="${from}:${c.key}" ${c.id ? '' : 'data-empty="1"'}>
        ${c.id ? `${icon(c.id)}<b>${c.n > 1 ? c.n : ''}</b>` : ''}${i < hot ? `<em>${i + 1}</em>` : ''}</button>`;
    }).join('')}</div>`;
  }
  bindGrid(sh, { drag = false } = {}) {
    const g = this.g;
    let d = null;
    sh.querySelectorAll('[data-cell]').forEach(b => {
      const [from, key] = b.dataset.cell.split(':');
      const pick = () => {
        if (b.dataset.empty) return;
        this.sel = this.sel && this.sel.from === from && String(this.sel.key) === key ? null : { from, key };
        sfx('click');
        this.render();
      };
      if (!drag || from !== 'inv') { b.addEventListener('click', pick); return; }
      // 가방은 끌어서 칸 옮기기도 된다
      b.addEventListener('pointerdown', e => { d = { i: Number(key), x: e.clientX, y: e.clientY, moved: false }; b.setPointerCapture(e.pointerId); });
      b.addEventListener('pointermove', e => {
        if (!d || !g.me.inv[d.i]) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
          d.moved = true;
          d.el = document.createElement('img');
          d.el.className = 'drag-ghost';
          d.el.src = itemUrl(g.me.inv[d.i].id);
          document.body.appendChild(d.el);
        }
        if (d.el) { d.el.style.left = `${e.clientX}px`; d.el.style.top = `${e.clientY}px`; }
      });
      b.addEventListener('pointerup', e => {
        if (!d) return;
        const cur = d; d = null;
        cur.el?.remove();
        if (!cur.moved) return pick();
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell^="inv:"]');
        if (t) { g.moveSlot(cur.i, Number(t.dataset.cell.split(':')[1])); this.sel = { from: 'inv', key: t.dataset.cell.split(':')[1] }; sfx('click'); }
        this.render();
      });
    });
  }
  // 고른 칸의 설명 카드
  detail(id, n, actions = '') {
    const it = ITEMS[id];
    if (!it) return '';
    const bonus = it.bonus ? Object.entries(it.bonus).map(([k, v]) => `${STATS[k] || SKILLS[k]} +${v}`).join(' · ') : '';
    const buff = it.buff ? `먹으면 30분 동안 ${Object.entries(it.buff).map(([k, v]) => `${STATS[k]} +${v}`).join(' · ')}` : '';
    const eat = it.type === 'food' ? `기력 +${it.en || 0}${it.hp ? ` · 체력 +${it.hp}` : ''}` : '';
    return `<div class="detail">${icon(id, 'big')}<div class="grow"><b>${esc(it.name)}</b> <span class="muted">${n}개 · ${TYPE[it.type] || ''} · 기본가 ${it.price}G</span>
      ${eat || bonus || buff ? `<p>${[eat, bonus, buff].filter(Boolean).join('<br>')}</p>` : ''}
      ${it.type === 'seed' ? '<p>밭을 갈고 이 씨앗을 고른 채 밭을 누르면 심어요</p>' : ''}
      ${it.caffeine ? '<p>마신 날은 새벽 2시까지 쓰러지지 않아요. 하루 한 잔만 마실 수 있어요</p>' : ''}
      ${id === 'bucket' ? '<p>핫바에서 고른 채 물가를 누르면 물을 떠요</p>' : ''}
      ${id === 'water_bucket' ? `<p>집의 정수기에 끼우면 커피 ${CUPS_PER_BUCKET}잔을 내릴 수 있어요</p>` : ''}
      ${id === 'coffee_bean' ? '<p>물을 채운 정수기에 넣으면 30초 뒤 커피 한 잔이 돼요</p>' : ''}
      ${it.station ? `<p>집에 놓고 누르면 ${esc(STATION_NAME[it.station])}로 쓸 수 있어요</p>` : ''}
      ${it.purifier ? '<p>집에 놓고 물 양동이를 끼운 뒤 커피콩을 넣으면 커피를 내려요</p>' : ''}
      ${actions ? `<div class="row left">${actions}</div>` : ''}</div></div>`;
  }

  // 가방
  pBag() {
    const g = this.g;
    const inv = g.me.inv;
    const cells = inv.map((s, i) => ({ key: i, id: s?.id, n: s?.n }));
    const i = this.sel?.from === 'inv' ? Number(this.sel.key) : -1;
    const s = inv[i];
    const it = s && ITEMS[s.id];
    let actions = '';
    if (it) {
      if (it.type === 'food') actions += '<button class="btn small" data-ia="use">먹기</button>';
      if (it.type === 'cloth') actions += '<button class="btn small" data-ia="use">입기</button>';
      if (it.type === 'furniture' && g.map.id === 'house') actions += '<button class="btn small" data-ia="use">집에 놓기</button>';
      if (i >= 8) actions += '<button class="btn small" data-ia="hot">핫바로</button>';
      actions += '<button class="btn small ghost" data-ia="trash">버리기</button>';
    }
    const stashN = Object.values(g.me.stash).reduce((a, n) => a + n, 0);
    this.bind = sh => {
      this.bindGrid(sh, { drag: true });
      sh.querySelectorAll('[data-ia]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.ia;
        if (a === 'use') { g.useSlot(i); if (it.type === 'furniture') this.close(); }
        if (a === 'hot') { const to = inv.slice(0, 8).findIndex(x => !x); g.moveSlot(i, to >= 0 ? to : g.selected); this.sel = null; }
        if (a === 'trash' && confirm(`${it.name} ${s.n}개를 버릴까요?`)) { g.trashSlot(i); this.sel = null; }
        if (this.panel) this.render();
      }));
      sh.querySelector('[data-sort]')?.addEventListener('click', () => { g.sortBag(); this.sel = null; this.render(); });
    };
    return {
      title: '가방',
      cls: 'wide',
      body: `${this.tabs('bag', [['bag', '가방'], ['char', '캐릭터'], ['stash', `보관함${stashN ? ` ${stashN}` : ''}`]])}
        ${this.grid('inv', cells, { hot: 8 })}
        ${it ? this.detail(s.id, s.n, actions) : '<p class="muted small">칸을 누르면 설명이 나와요. 끌어서 자리를 옮길 수 있어요. 윗줄 8칸이 핫바예요.</p>'}
        <div class="row right"><button class="btn small ghost" data-sort>정리하기</button></div>`,
    };
  }

  pStash() {
    const g = this.g;
    const ids = Object.keys(g.me.stash).filter(id => g.me.stash[id] > 0 && ITEMS[id]);
    const sel = this.sel?.from === 'stash' ? this.sel.key : null;
    this.bind = sh => {
      this.bindGrid(sh);
      sh.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
        const n = g.takeFromStash(sel, b.dataset.take === 'all' ? 9999 : 1);
        if (!n) this.toast('가방에 자리가 없어요', 'bad');
        if (!g.me.stash[sel]) this.sel = null;
        this.render();
      }));
    };
    return {
      title: '내 보관함',
      cls: 'wide',
      body: `${this.tabs('stash', [['bag', '가방'], ['char', '캐릭터'], ['stash', '보관함']])}
        <p class="muted small">가방이 가득 찼을 때 넘친 물건과 방치 창고에서 받은 물건이 모여요. 개수 제한이 없어요.</p>
        ${ids.length ? this.grid('stash', ids.map(id => ({ key: id, id, n: g.me.stash[id] })), { min: 8 }) : '<p class="center muted">비어 있어요</p>'}
        ${sel && g.me.stash[sel] ? this.detail(sel, g.me.stash[sel], '<button class="btn small" data-take="1">가방으로 1개</button><button class="btn small" data-take="all">전부</button>') : ''}`,
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
      sh.querySelectorAll('[data-uneq]').forEach(b => b.addEventListener('click', () => g.unequip(b.dataset.uneq)));
    };
    const buffs = (me.buffs || []).filter(b => b.until > Date.now());
    return {
      title: '캐릭터',
      cls: 'wide',
      body: `${this.tabs('char', [['bag', '가방'], ['char', '캐릭터'], ['stash', '보관함']])}
        <div class="char-top">
          <canvas id="preview" width="64" height="96"></canvas>
          <div><b class="big">${esc(me.name)}</b><div class="job" style="--c:${J.color}">${jobIcon(me.job)} ${J.name} · 종합 Lv.${totalLevel(me)}</div>
          <p class="muted small">${J.desc}</p>
          <div class="equip">${['hat', 'top'].map(s => `<button class="slot" data-uneq="${s}" title="${s === 'hat' ? '모자' : '옷'}">${me.equip[s] ? icon(me.equip[s]) : `<span class="muted">${s === 'hat' ? '모자' : '옷'}</span>`}</button>`).join('')}<span class="muted small">누르면 벗어요</span></div>
          </div>
        </div>
        <h3>능력치</h3>
        <div class="stats">${Object.entries(STATS).map(([k, n]) => `<div><span>${n}</span><b>${st[k]}</b><em>${k === 'hp' || k === 'en' ? '' : `기본 ${me.base[k]}`}</em></div>`).join('')}</div>
        ${buffs.length ? `<p class="buffs">버프: ${buffs.map(b => `${ITEMS[b.src]?.name || '분수 행운'} ${Object.entries(b.stats).map(([k, v]) => `${STATS[k]}+${v}`).join(' ')} (${Math.ceil((b.until - Date.now()) / 60000)}분)`).join(' · ')}</p>` : ''}
        <h3>기술</h3>
        <div class="skills">${Object.entries(SKILLS).map(([k, n]) => {
          const s = me.skills[k];
          return `<div><span>${n}</span><b>Lv.${s.lv}</b><div class="xp">${s.lv >= MAX_SKILL ? '<i style="width:100%"></i>' : bar(s.xp, xpForLevel(s.lv))}</div></div>`;
        }).join('')}</div>
        <h3>도구</h3>
        <div class="tools">${Object.entries(TOOLS).map(([k, t]) => `<div><img class="ico" src="${toolUrl(k, me.tools[k])}"><span>${TOOL_TIERS[me.tools[k]]} ${t.name}</span></div>`).join('')}</div>
        <p class="muted small">도구는 마을 대장간의 철수 아저씨에게 강화할 수 있어요.</p>
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
    const t = performance.now();
    const dir = ['down', 'right', 'up', 'left'][Math.floor(t / 2000) % 4];
    x.drawImage(sh[dir].walk[Math.floor(t / 150) % 4], 0, 0, 64, 96);
  }

  // 방치 창고
  pIdle() {
    const g = this.g;
    this.idleDrawn = performance.now();
    const r = g.idleNow();
    const job = IDLE_JOBS[g.me.idle];
    const fill = g.idleFill();
    const capH = g.idleCapMs() / 3600000;
    const since = Date.now() - (g.me.idleAt || Date.now());
    const h = Math.floor(since / 3600000);
    const m = Math.floor((since % 3600000) / 60000);
    const helperLeft = g.helperActive() ? Math.ceil((g.helper.until - Date.now()) / 60000) : 0;
    this.bind = sh => {
      sh.querySelectorAll('[data-idle]').forEach(b => b.addEventListener('click', () => { g.setIdleJob(b.dataset.idle); this.render(); }));
      sh.querySelector('[data-collect]')?.addEventListener('click', () => {
        const got = g.collectIdle();
        if (!got) return;
        this.toast(`방치 창고에서 ${got.items.length}가지를 받았어요${got.stashed ? ' (넘친 건 내 보관함으로)' : ''}`, 'good');
        sfx('discover');
        this.render();
      });
      sh.querySelectorAll('[data-hire]').forEach(b => b.addEventListener('click', async () => {
        const res = await g.hireHelper(Number(b.dataset.hire));
        this.toast(res.msg, res.ok ? 'good' : 'bad');
        this.render();
      }));
    };
    return {
      title: this.arg?.welcome ? '다녀오셨군요' : '방치 창고',
      cls: 'wide',
      body: `<p class="small">접속해 있든 아니든, 캐릭터가 고른 일을 계속하며 수확물이 여기 쌓여요. 최대 ${capH}시간치까지 쌓이니 가끔 비워 주세요.</p>
        <div class="idle-card">
          <img class="ico big" src="${itemUrl(IDLE_ICON[g.me.idle])}" alt="">
          <div class="grow"><b>${esc(job.name)}</b> <span class="muted small">${h ? `${h}시간 ` : ''}${m}분째</span>
            <div class="prog"><i style="width:${Math.round(fill * 100)}%"></i></div>
            <span class="muted small">${fill >= 1 ? '가득 찼어요. 받지 않으면 더 쌓이지 않아요' : `${Math.round(fill * 100)}% 찼어요`}</span></div>
        </div>
        <div class="reward">${r?.items.length ? r.items.map(([id, n]) => `<span>${icon(id, 'big')}<b>${n}</b><small>${esc(ITEMS[id].name)}</small></span>`).join('') : '<p class="muted small">아직 쌓인 게 없어요. 조금만 기다려 주세요.</p>'}</div>
        ${r?.items.length ? `<p class="center muted small">${SKILLS[r.skill]} 경험치 +${r.xp}</p><button class="btn gold wide" data-collect>모두 받기</button>` : ''}
        <h3>할 일 고르기</h3>
        <p class="muted small">직업과 맞는 일을 하면 30% 더 모여요. 바꾸면 지금까지 쌓인 건 먼저 받아요.</p>
        <div class="chips">${Object.entries(IDLE_JOBS).map(([k, j]) => `<button class="${g.me.idle === k ? 'on' : ''}" data-idle="${k}"><img class="ico sm" src="${itemUrl(IDLE_ICON[k])}" alt="">${j.name}</button>`).join('')}</div>
        <h3>밭 일꾼</h3>
        <p class="muted small">고용한 동안 밭이 늘 촉촉하고, 다 자란 작물은 일꾼이 거둬 공용 보관함에 넣은 뒤 같은 씨앗을 다시 심어요. 모두가 함께 쓰는 일꾼이에요.</p>
        ${helperLeft ? `<p class="ok small">일하는 중: ${helperLeft >= 60 ? `${Math.floor(helperLeft / 60)}시간 ` : ''}${helperLeft % 60}분 남음 (${esc(g.helper.by || '')} 님이 고용)</p>` : ''}
        <div class="row left">${HELPER_PLANS.map((p, i) => `<button class="btn small" data-hire="${i}">${p.hours}시간 · ${fmtN(p.gold)}G</button>`).join('')}</div>`,
    };
  }

  // 제작
  pCraft() {
    const g = this.g;
    const kind = this.arg;
    const skill = STATION_SKILL[kind];
    const list = RECIPES.filter(r => r.station === kind);
    this.bind = sh => sh.querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => {
      const n = b.dataset.n === 'max' ? g.maxCraftable(b.dataset.craft) : Number(b.dataset.n);
      const res = g.craftMany(b.dataset.craft, Math.max(1, n));
      this.toast(res.msg, res.ok ? 'good' : 'bad');
      if (res.ok) sfx('harvest');
      this.render();
    }));
    return {
      title: STATION_NAME[kind],
      cls: 'wide',
      body: `<p class="muted small">${SKILLS[skill]} Lv.${g.me.skills[skill].lv} · 재료는 가방에서 가져가요</p>
        <div class="list">${list.map(r => {
          const out = ITEMS[r.out[0]];
          const chk = g.canCraft(r.id);
          const max = chk.ok ? g.maxCraftable(r.id) : 0;
          const lvOk = g.me.skills[skill].lv >= r.lv;
          return `<div class="li recipe ${chk.ok ? '' : 'dim'}">${icon(r.out[0], 'big')}
            <div class="grow"><b>${esc(out.name)}${r.out[1] > 1 ? ` ×${r.out[1]}` : ''}</b>${lvOk ? '' : ` <span class="no small">Lv.${r.lv} 필요</span>`}
            <div class="needs">${r.in.map(([id, n]) => {
              const alts = [id, ...(r.alt?.[id] || [])];
              const have = Math.max(...alts.map(a => count(g.me.inv, a)));
              return `<span class="${have >= n ? 'ok' : 'no'}">${icon(id)}${esc(ITEMS[id].name)}${r.alt?.[id] ? ' 등' : ''} ${have}/${n}</span>`;
            }).join('')}</div>
            ${out.type === 'food' ? `<div class="muted small">기력 +${out.en || 0}${out.hp ? ` · 체력 +${out.hp}` : ''}${out.buff ? ' · 버프' : ''}</div>` : ''}
            ${out.bonus ? `<div class="muted small">${Object.entries(out.bonus).map(([k, v]) => `${STATS[k] || SKILLS[k]} +${v}`).join(' · ')}</div>` : ''}
            </div>
            <div class="qty">
              <button class="btn small" data-craft="${r.id}" data-n="1" ${chk.ok ? '' : 'disabled'}>1개</button>
              <button class="btn small" data-craft="${r.id}" data-n="5" ${max >= 2 ? '' : 'disabled'}>5개</button>
              <button class="btn small" data-craft="${r.id}" data-n="max" ${max >= 2 ? '' : 'disabled'}>최대${max >= 2 ? ` ${max}` : ''}</button>
            </div></div>`;
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
        this.render();
      }));
      sh.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => {
        const slot = Number(b.dataset.sell);
        const n = b.dataset.all ? g.me.inv[slot].n : 1;
        const got = g.sell(slot, n, shop);
        this.toast(`${fmtN(got)}G에 팔았어요`, 'good');
        this.render();
      }));
    };
    const sellable = g.me.inv.map((s, i) => [s, i]).filter(([s]) => s && S.buys.includes(ITEMS[s.id].type));
    const trend = id => { const m = priceMult(day, id); return m > 1.15 ? '<span class="up">▲</span>' : m < 0.85 ? '<span class="down">▼</span>' : ''; };
    return {
      title: sellOnly ? '출하 상자' : S.name,
      cls: 'wide',
      body: `${sellOnly ? '<p class="muted small">오늘 시장 시세로 바로 팔려요</p>' : `<nav class="tabs"><button class="${tab === 'buy' ? 'on' : ''}" data-stab="buy">사기</button><button class="${tab === 'sell' ? 'on' : ''}" data-stab="sell">팔기</button></nav>`}
        <p class="muted small">가진 돈 ${fmtN(g.me.gold)}G${hearts ? ` · 친밀도 ${hearts}단계 (판매가 +${hearts * 2}%)` : ''}</p>
        ${tab === 'buy' && !sellOnly ? `<div class="list">${S.sells.map(id => `<div class="li">${icon(id)}<b>${esc(ITEMS[id].name)}</b><span class="price">${buyPrice(id)}G</span><span class="grow"></span>
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
        this.render();
      }));
      sh.querySelector('[data-smithshop]').addEventListener('click', () => this.openShop('smith'));
    };
    return {
      title: '철수 대장간 · 도구 강화',
      cls: 'wide',
      body: `<p class="muted small">강화할수록 기력이 덜 들고 더 세져요. 괭이와 물뿌리개는 철 단계부터 여러 칸을 한 번에 다뤄요.</p>
        <div class="list">${Object.entries(TOOLS).map(([k, t]) => {
          const tier = g.me.tools[k];
          const cost = TOOL_UPGRADE[tier];
          return `<div class="li"><img class="ico big" src="${toolUrl(k, tier)}"><div class="grow"><b>${TOOL_TIERS[tier]} ${t.name}</b>
            ${cost ? `<div class="needs"><span class="${g.me.gold >= cost.gold ? 'ok' : 'no'}">${fmtN(cost.gold)}G</span>${cost.items.map(([id, n]) => `<span class="${count(g.me.inv, id) >= n ? 'ok' : 'no'}">${icon(id)}${esc(ITEMS[id].name)} ${count(g.me.inv, id)}/${n}</span>`).join('')}</div>` : '<div class="muted small">최고 단계예요</div>'}
            </div>${cost ? `<button class="btn small" data-up="${k}">${TOOL_TIERS[tier + 1]}로 강화</button>` : ''}</div>`;
        }).join('')}</div>
        <button class="btn ghost wide" data-smithshop>광석 사고팔기</button>`,
    };
  }

  // NPC
  npcFace(sh, n) {
    const pc = sh.querySelector('#npcface');
    if (!pc) return;
    const x = pc.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(charSheet({ bottom: '#5a4a3a', ...NPCS[n.id].look }).down.walk[0], 0, -8, 64, 96);
  }
  pNpc() {
    const g = this.g;
    const n = this.arg;
    const t = n.talk || g.talk(n.id);
    const D = NPCS[n.id];
    const shopKind = n.shop === 'smithy' ? 'smithy' : n.shop;
    const known = g.me.friends[n.id]?.known || {};
    const loved = Object.entries(known).filter(([, v]) => v === 'love').map(([id]) => ITEMS[id]?.name).filter(Boolean);
    this.bind = sh => {
      this.npcFace(sh, n);
      sh.querySelector('[data-trade]')?.addEventListener('click', () => (shopKind === 'smithy' ? this.open('smithy') : this.openShop(shopKind)));
      sh.querySelector('[data-gift]')?.addEventListener('click', () => this.open('gift', n));
      sh.querySelector('[data-board]')?.addEventListener('click', () => this.open('board'));
    };
    const hearts = '♥'.repeat(Math.min(5, t.hearts)) + '♡'.repeat(Math.max(0, 5 - t.hearts));
    return {
      title: esc(D.name),
      body: `<div class="npc"><canvas id="npcface" width="64" height="72"></canvas>
        <div><div class="muted small">${esc(D.role)} · <span class="hearts">${hearts}</span></div><p class="line">"${lineHtml(t.line)}"</p>${t.first ? '<p class="muted small">오늘 첫 대화라 친밀도가 올랐어요.</p>' : ''}</div></div>
        <p class="muted small">좋아할 것 같은 것: ${esc(TASTE_HINT[n.id] || '글쎄요')}${loved.length ? ` · 확실히 좋아하는 것: ${loved.map(esc).join(', ')}` : ''}</p>
        <div class="row">
          ${shopKind ? `<button class="btn" data-trade>${shopKind === 'smithy' ? '도구 강화' : '거래하기'}</button>` : ''}
          ${n.id === 'mayor' ? '<button class="btn" data-board>오늘의 부탁</button>' : ''}
          <button class="btn ghost" data-gift>선물하기</button>
        </div>
        ${n.id === 'rea' ? `<p class="muted small">레아의 탐험 수첩: 유적 최고 ${g.me.done.ruinsMax || 0}층, 광산 최고 ${g.me.done.mineMax || 0}층. 5층마다 순간이동 문양과 승강기가 있어요.</p>` : ''}`,
    };
  }
  pGift() {
    const g = this.g;
    const n = this.arg;
    const i = this.sel?.from === 'inv' ? Number(this.sel.key) : -1;
    const s = g.me.inv[i];
    this.bind = sh => {
      this.bindGrid(sh);
      sh.querySelector('[data-give]')?.addEventListener('click', () => {
        const r = g.gift(n.id, i);
        if (r) this.toast(r.msg, r.ok ? 'good' : 'bad');
        this.open(n.shop === 'regrow' ? 'regrow' : 'npc', n);
      });
    };
    return {
      title: `${esc(NPCS[n.id]?.name)}에게 선물`,
      cls: 'wide',
      body: `<p class="muted small">하루에 한 번 줄 수 있어요. 좋아하는 걸 주면 친밀도가 크게 오르고, 싫어하는 걸 주면 떨어져요.</p>
        ${this.grid('inv', g.me.inv.map((x, k) => ({ key: k, id: x?.id, n: x?.n })))}
        ${s ? this.detail(s.id, s.n, '<button class="btn small gold" data-give>이걸 선물하기</button>') : ''}`,
    };
  }

  // 숲지기 두리
  pRegrow() {
    const g = this.g;
    const n = this.arg;
    if (!this.regrowCache || (this.regrowCache.list && performance.now() - this.regrowCache.at > 2000)) {
      this.regrowCache = { at: performance.now(), list: null };
      g.regrowInfo().then(list => { this.regrowCache = { at: performance.now(), list }; if (this.panel === 'regrow') this.render(); });
    }
    const list = this.regrowCache.list;
    const t = n.talk || g.talk(n.id);
    this.bind = sh => {
      this.npcFace(sh, n);
      sh.querySelectorAll('[data-regrow]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await g.regrow(b.dataset.regrow);
        this.toast(r.msg, r.ok ? 'good' : 'bad');
        this.regrowCache = null;
        this.render();
      }));
      sh.querySelector('[data-gift]')?.addEventListener('click', () => this.open('gift', n));
    };
    return {
      title: '숲지기 두리',
      cls: 'wide',
      body: `<div class="npc"><canvas id="npcface" width="64" height="72"></canvas><div><div class="muted small">${esc(NPCS.duri.role)}</div><p class="line">"${lineHtml(t.line)}"</p></div></div>
        <p class="small">베어 낸 나무와 캐낸 바위는 저절로 다시 나지 않아요. 두리에게 값을 치르면 그 지역의 나무와 바위를 전부 되살려 줘요. (광산 층은 매일 새로 생겨요)</p>
        ${list ? `<div class="list">${list.map(x => `<div class="li ${x.gone ? '' : 'dim'}"><b>${esc(x.name)}</b><span class="muted small">${x.gone ? `${x.gone}개 사라짐` : '그대로예요'}</span><span class="grow"></span>
          ${x.gone ? `<button class="btn small" data-regrow="${x.id}" ${g.me.gold >= x.cost ? '' : 'disabled'}>${fmtN(x.cost)}G 되살리기</button>` : ''}</div>`).join('')}</div>` : '<p class="muted center">살펴보는 중…</p>'}
        <div class="row"><button class="btn ghost" data-gift>선물하기</button></div>`,
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
      this.render();
    }));
    return {
      title: '마을 게시판',
      cls: 'wide',
      body: `<h3>오늘의 부탁 (${g.day}일차)</h3>
        <div class="list">${reqs.map((r, i) => {
          const done = g.me.done[`req-${r.key}`];
          const have = count(g.me.inv, r.id);
          return `<div class="li ${done ? 'dim' : ''}">${icon(r.id)}<div class="grow"><b>${esc(ITEMS[r.id].name)} ${r.n}개</b><div class="muted small">보상 ${fmtN(r.reward)}G · 촌장님 친밀도</div></div>
            ${done ? '<span class="ok small">완료</span>' : `<span class="${have >= r.n ? 'ok' : 'no'}">${have}/${r.n}</span><button class="btn small" data-req="${i}" ${have >= r.n ? '' : 'disabled'}>전달</button>`}</div>`;
        }).join('')}</div>
        <h3>오늘 시세가 좋은 물건</h3>
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
      title: '순간이동',
      body: `<p class="muted small">한 번 찾아가 깨운 석상으로만 갈 수 있어요. 기력 3이 들어요.</p>
        <div class="list">${ids.map(id => {
          const info = waypointInfo(id);
          const on = !!g.waypoints[id];
          const here = info.map === g.map.id;
          return `<div class="li ${on ? '' : 'dim'}">${on ? iconImg('portal') : iconImg('lock')}<b>${on ? esc(info.name) : '아직 못 찾은 곳'}</b>
            ${on && g.waypoints[id].by ? `<span class="muted small">${esc(g.waypoints[id].by)} 님이 발견</span>` : ''}<span class="grow"></span>
            ${on ? `<button class="btn small" data-tp="${id}" ${here ? 'disabled' : ''}>${here ? '여기예요' : '이동'}</button>` : ''}</div>`;
        }).join('')}</div>`,
    };
  }

  // 공용 보관함
  pChest() {
    const g = this.g;
    const ids = Object.keys(g.chest || {}).filter(id => g.chest[id] > 0 && ITEMS[id]);
    const sel = this.sel;
    let detail = '';
    if (sel?.from === 'chest' && g.chest[sel.key]) {
      detail = this.detail(sel.key, g.chest[sel.key], '<button class="btn small" data-ct="1">꺼내기 1개</button><button class="btn small" data-ct="all">전부 꺼내기</button>');
    } else if (sel?.from === 'inv' && g.me.inv[sel.key]) {
      const s = g.me.inv[sel.key];
      detail = this.detail(s.id, s.n, '<button class="btn small" data-cp="1">넣기 1개</button><button class="btn small" data-cp="all">전부 넣기</button>');
    }
    this.bind = sh => {
      this.bindGrid(sh);
      sh.querySelectorAll('[data-ct]').forEach(b => b.addEventListener('click', async () => {
        await g.chestTake(sel.key, b.dataset.ct === 'all' ? 999 : 1);
        if (!g.chest[sel.key]) this.sel = null;
        this.render();
      }));
      sh.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', async () => {
        await g.chestPut(Number(sel.key), b.dataset.cp === 'all' ? 999 : 1);
        if (!g.me.inv[sel.key]) this.sel = null;
        this.render();
      }));
    };
    return {
      title: '공용 보관함',
      cls: 'wide',
      body: `<p class="muted small">같은 세계의 모두가 함께 쓰는 상자예요. 밭 일꾼이 거둔 작물도 여기로 들어와요.</p>
        <h3>상자 안</h3>
        ${ids.length ? this.grid('chest', ids.map(id => ({ key: id, id, n: g.chest[id] })), { min: 8 }) : '<p class="center muted small">비어 있어요</p>'}
        <h3>내 가방</h3>
        ${this.grid('inv', g.me.inv.map((x, k) => ({ key: k, id: x?.id, n: x?.n })))}
        ${detail || '<p class="muted small">칸을 누르면 꺼내거나 넣을 수 있어요.</p>'}`,
    };
  }

  // 가판대 (각자 자기 칸)
  pStall() {
    const g = this.g;
    const items = g.stall?.items || {};
    const ids = Object.keys(items).filter(id => items[id] > 0 && ITEMS[id]);
    const est = g.stallEstimate();
    const each = id => est.lines.find(l => l.id === id)?.each ?? g.priceOf(id, 'market');
    const sel = this.sel;
    const sellable = id => SHOPS.market.buys.includes(ITEMS[id]?.type);
    let detail = '';
    if (sel?.from === 'stall' && items[sel.key]) {
      detail = this.detail(sel.key, items[sel.key], `<span class="muted small">개당 약 ${fmtN(each(sel.key))}G</span><button class="btn small" data-st="1">내리기 1개</button><button class="btn small" data-st="all">전부 내리기</button>`);
    } else if (sel?.from === 'inv' && g.me.inv[sel.key]) {
      const s = g.me.inv[sel.key];
      detail = this.detail(s.id, s.n, sellable(s.id)
        ? `<span class="muted small">오늘 시세 개당 ${fmtN(g.priceOf(s.id, 'market'))}G</span><button class="btn small" data-sp="1">올리기 1개</button><button class="btn small gold" data-sp="all">전부 올리기</button>`
        : '<span class="no small">가판대에서는 팔 수 없어요</span>');
    }
    this.bind = sh => {
      this.bindGrid(sh);
      sh.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', async () => {
        const r = await g.stallPut(Number(sel.key), b.dataset.sp === 'all' ? 999 : 1);
        if (!r.ok) this.toast(r.msg, 'bad');
        if (!g.me.inv[sel.key]) this.sel = null;
        this.render();
      }));
      sh.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', async () => {
        await g.stallTake(sel.key, b.dataset.st === 'all' ? 9999 : 1);
        if (!g.stall?.items?.[sel.key]) this.sel = null;
        this.render();
      }));
    };
    return {
      title: '가판대',
      cls: 'wide',
      body: `<p class="small">여기 올린 물건은 <b>하루가 끝날 때</b>(모두 잠들거나 밤 12시) 오늘 시세로 팔리고, 판 돈은 올린 사람에게 들어와요. 그 전에는 다시 내릴 수 있어요.</p>
        <h3>내가 올린 물건</h3>
        ${ids.length ? this.grid('stall', ids.map(id => ({ key: id, id, n: items[id] })), { min: 8 }) : '<p class="center muted small">아직 아무것도 없어요</p>'}
        ${ids.length ? `<p class="stall-sum">오늘 밤 예상 <b>${fmtN(est.total)}G</b></p>` : ''}
        <h3>내 가방</h3>
        ${this.grid('inv', g.me.inv.map((x, k) => ({ key: k, id: x?.id, n: x?.n })))}
        ${detail || '<p class="muted small">칸을 누르면 올리거나 내릴 수 있어요.</p>'}`,
    };
  }

  // 정수기
  pPurifier() {
    const g = this.g;
    const fid = this.arg;
    const f = g.purifier(fid);
    this.purDrawn = performance.now();
    if (!f) return { title: '정수기', body: '<p class="center muted">정수기가 치워졌어요</p>' };
    const now = Date.now();
    const st = brewState(f, now);
    const prog = brewProgress(f, now);
    const beans = count(g.me.inv, 'coffee_bean');
    const buckets = count(g.me.inv, 'water_bucket');
    const left = st.b ? Math.ceil((1 - prog) * BREW_MS / 1000) : 0;
    const act = async fn => { const r = await fn(); this.toast(r.msg, r.ok ? 'good' : 'bad'); this.render(); };
    this.bind = sh => {
      sh.querySelector('[data-load]')?.addEventListener('click', () => act(() => g.purifierLoad(fid)));
      sh.querySelectorAll('[data-bean]').forEach(b => b.addEventListener('click', () => act(() => g.purifierBrew(fid, b.dataset.bean === 'all' ? 999 : 1))));
      sh.querySelector('[data-cup]')?.addEventListener('click', () => act(() => g.purifierTake(fid)));
    };
    const cups = Array.from({ length: CUPS_PER_BUCKET }, (_, i) => `<i class="${i < st.w ? 'on' : ''}"></i>`).join('');
    return {
      title: '정수기',
      cls: 'wide',
      body: `<div class="idle-card">${icon('f_purifier', 'big')}<div class="grow">
          <b>남은 물</b> <span class="muted small">${st.w}/${CUPS_PER_BUCKET}잔</span><div class="cups">${cups}</div>
          ${st.b ? `<span class="small">커피 내리는 중 · ${st.b}잔 남음 (이번 잔 ${left}초)</span><div class="prog brew"><i style="width:${Math.round(prog * 100)}%"></i></div>` : '<span class="muted small">내리는 커피가 없어요</span>'}
        </div></div>
        ${st.r ? `<button class="btn gold wide" data-cup>${icon('coffee')} 다 내린 커피 ${st.r}잔 꺼내기</button>` : ''}
        <div class="row">
          <button class="btn small" data-load ${st.w === 0 && buckets ? '' : 'disabled'}>물 양동이 끼우기 (${buckets})</button>
          <button class="btn small" data-bean="1" ${st.w && beans ? '' : 'disabled'}>커피콩 넣기 (${beans})</button>
          <button class="btn small" data-bean="all" ${st.w && beans > 1 ? '' : 'disabled'}>넣을 수 있는 만큼</button>
        </div>
        <p class="muted small">물 양동이 하나로 커피 ${CUPS_PER_BUCKET}잔. 커피콩 한 개에 한 잔씩, 한 잔에 30초 걸려요. 양동이는 대장간에서 사거나 작업대에서 철 주괴로 만들고, 물가에서 들고 누르면 물을 떠요.</p>
        <p class="muted small">정수기 ${g.purifierCount()}/${purifierLimit(g.house.level)}대 (집 6·11·16…단계마다 1대 더)</p>`,
    };
  }

  // 침대
  pBed() {
    const g = this.g;
    const c = g.clock;
    const others = g.roster().filter(p => !p.me);
    this.bind = sh => {
      sh.querySelector('[data-sleep]').addEventListener('click', () => { this.close(); g.goToBed(); });
    };
    return {
      title: '잠자리',
      body: `<p>지금 ${fmtClock(c)}. 잘까요?</p>
        <p class="muted small">${others.length ? '함께 있는 사람이 모두 잠들면' : '잠들면'} 하루가 끝나요. 가판대 물건이 팔리고, 다음 날 아침 6시에 체력과 기력이 가득 찬 채로 일어나요.</p>
        ${others.length ? `<p class="muted small">먼저 자면 다른 사람을 기다려요. 기다리다 일어날 수도 있어요.</p>` : ''}
        <div class="row"><button class="btn gold" data-sleep>${iconImg('bed')} 자기</button><button class="btn ghost" data-close>아니요</button></div>`,
    };
  }

  // 잠든 동안 화면 가운데 표시 (누가 아직 깨어 있는지)
  sleepChanged() { this.sleepDrawn = 0; this.renderSleep(); }
  renderSleep() {
    const g = this.g;
    const el = this.$('sleepov');
    if (!el) return;
    this.sleepDrawn = performance.now();
    if (!g.sleeping) { el.hidden = true; el.innerHTML = ''; this.sleepSig = ''; return; }
    const list = g.roster();
    const asleep = list.filter(p => p.z).length;
    const status = p => (p.z === 1 ? '<span class="muted">잠듦</span>' : p.z === 2 ? '<span class="no">쓰러짐</span>' : `<span class="ok">깨어 있음</span>${p.caff ? ` ${iconImg('coffee', 'sm')}` : ''}`);
    const sig = JSON.stringify([g.sleeping, list, fmtClock(g.clock)]);
    if (sig === this.sleepSig && !el.hidden) return;
    this.sleepSig = sig;
    const first = el.hidden;
    el.hidden = false;
    el.innerHTML = `<div class="sleep-card ${first ? 'in' : ''}">
      <b>${g.sleeping === 'bed' ? 'Zzz… 잠자는 중' : '정신을 잃었어요…'}</b>
      <p class="small">${g.sleeping === 'bed' ? '모두 잠들면 하루가 끝나요' : '모두 잠들면 다음 날 아침 집에서 깨어나요'} · ${fmtClock(g.clock)}</p>
      ${list.length > 1 ? `<div class="sleep-list">${list.map(p => `<div><span>${esc(p.name)}</span>${status(p)}</div>`).join('')}</div><p class="muted small">잠든 사람 ${asleep}/${list.length}</p>` : ''}
      ${g.sleeping === 'bed' ? '<button class="btn small ghost" data-wake>일어나기</button>' : ''}</div>`;
    el.querySelector('[data-wake]')?.addEventListener('click', () => g.wakeUp());
  }

  // 하루 마무리 요약: 한 줄씩 나타나고, 누르면 한꺼번에 다 보인다
  showDayEnd(sum) {
    const el = this.$('dayend');
    if (!el) return;
    this.close();
    const L = [];
    const outcome = {
      slept: `${iconImg('bed')} 푹 잤어요. 체력과 기력이 가득 찼어요`,
      faint: `${iconImg('heart')} 밤늦게 쓰러졌어요… 체력 ${sum.hp}/${sum.st.hp}, 기력 ${sum.en}/${sum.st.en}로 시작해요`,
      away: `${iconImg('bed')} 자리를 비운 사이 날이 밝았어요`,
    }[sum.outcome];
    L.push(`<li class="de-out">${outcome}</li>`);
    L.push('<li class="de-h">가판대에서 팔린 물건</li>');
    if (sum.sold.lines.length) {
      for (const x of sum.sold.lines) L.push(`<li class="de-item">${icon(x.id)}<span class="grow">${esc(ITEMS[x.id].name)} ×${x.n}</span><b>${fmtN(x.gold)}G</b></li>`);
      L.push(`<li class="de-sum"><span class="grow">판매 합계</span><b>+${fmtN(sum.sold.total)}G</b></li>`);
    } else L.push('<li class="muted">가판대에 올린 물건이 없었어요</li>');
    L.push(`<li class="de-sum"><span class="grow">오늘 번 돈</span><b class="${sum.earned < 0 ? 'no' : 'ok'}">${sum.earned < 0 ? '-' : '+'}${fmtN(Math.abs(sum.earned))}G</b></li>`);
    L.push(`<li class="de-sum"><img class="pix sm" src="${uiIconUrl('coin')}" alt=""><span class="grow">가진 돈</span><b>${fmtN(sum.gold)}G</b></li>`);
    L.push(`<li class="de-next">${iconImg('sun')} ${sum.next}일차 오전 6:00</li>`);
    el.hidden = false;
    el.innerHTML = `<div class="de-card">
      <h2>${sum.day}일차 마무리</h2>
      <ul class="de-lines">${L.join('')}</ul>
      <p class="muted small de-hint">누르면 한 번에 다 보여요</p>
      <button class="btn gold wide" data-denext hidden>${sum.next}일차 아침으로</button></div>`;
    const lines = [...el.querySelectorAll('.de-lines li')];
    const btn = el.querySelector('[data-denext]');
    let i = 0;
    const showAll = () => {
      clearInterval(this.deTimer);
      lines.forEach(li => li.classList.add('show'));
      btn.hidden = false;
      el.querySelector('.de-hint').hidden = true;
      el.querySelector('.de-lines').scrollTop = 1e6;
    };
    clearInterval(this.deTimer);
    this.deTimer = setInterval(() => {
      if (i >= lines.length) return showAll();
      lines[i++].classList.add('show');
      el.querySelector('.de-lines').scrollTop = 1e6;
      sfx(i === lines.length ? 'coin' : 'click');
    }, 420);
    const openedAt = performance.now();
    el.onclick = e => {
      if (performance.now() - openedAt < 400) return;
      if (e.target.closest('[data-denext]')) { clearInterval(this.deTimer); el.hidden = true; el.innerHTML = ''; sfx('open'); return; }
      showAll();
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
      title: '하하호호 하우스',
      cls: 'wide',
      body: `<div class="house-card"><div class="lv">Lv.${lv}</div><div><b class="big">${esc(H.name)}</b><div class="muted small">${esc(H.perks)} · 밭 ${H.plots}칸</div></div></div>
        ${need ? `<h3>다음 단계: ${esc(need.next.name)}</h3><p class="muted small">${esc(need.next.perks)} · 밭 ${need.next.plots}칸</p>
          <div class="list">
            <div class="li"><img class="pix" src="${uiIconUrl('coin')}" alt=""><div class="grow"><b>골드</b><div class="prog"><i style="width:${pct(need.gold.have, need.gold.need)}%"></i></div><span class="muted small">${fmtN(need.gold.have)} / ${fmtN(need.gold.need)}</span></div>
              <button class="btn small" data-dg="100">+100</button><button class="btn small" data-dg="1000">+1000</button></div>
            ${need.items.map(x => `<div class="li">${icon(x.id)}<div class="grow"><b>${esc(ITEMS[x.id].name)}</b><div class="prog"><i style="width:${pct(x.have, x.need)}%"></i></div><span class="muted small">${x.have} / ${x.need} · 내 가방 ${count(g.me.inv, x.id)}</span></div>
              <button class="btn small" data-di="${x.id}" ${x.have >= x.need ? 'disabled' : ''}>넣기</button></div>`).join('')}
          </div>
          <button class="btn wide ${ready ? 'gold' : ''}" data-lvup ${ready ? '' : 'disabled'}>${ready ? '집 키우기' : '재료를 모두 모으면 키울 수 있어요'}</button>` : '<p class="center">최고 단계까지 키웠어요.</p>'}
        ${g.map.id === 'house' ? '<button class="btn wide" data-decor>집 꾸미기</button>' : '<p class="muted small center">집 안에서 꾸미기를 할 수 있어요</p>'}
        ${contrib.length ? `<h3>함께 키운 사람들</h3><div class="chips">${contrib.map(c => `<span>${esc(c.n)} · ${fmtN(c.v)}</span>`).join('')}</div>` : ''}
        ${g.store.kind === 'online' ? '<h3>친구 초대</h3><p class="muted small">최대 4명이 같은 세계에서 함께 살 수 있어요.</p><button class="btn wide ghost" data-invite>초대 링크 복사</button>' : ''}`,
    };
  }

  async copyInvite() {
    const link = this.inviteLink();
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: '하하호호 하우스 키우기', text: '같이 집 키우자!', url: link }); return; }
      await navigator.clipboard.writeText(link);
      this.toast('초대 링크를 복사했어요', 'good');
    } catch { prompt('이 링크를 친구에게 보내 주세요', link); }
  }

  // 대화
  pChat() {
    const g = this.g;
    const quick = ['안녕!', '같이 하자', '고마워', '물 줄게', '광산 갈 사람?', '집 키우자', 'ㅋㅋㅋ', '잘 자'];
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
      title: '대화',
      body: `<div class="chat-log">${g.chat.slice(-30).map(c => (c.sys ? `<p class="sys">${esc(c.t)}</p>` : `<p><b>${esc(c.n)}</b> ${esc(c.t)}</p>`)).join('') || '<p class="muted center">아직 조용해요</p>'}</div>
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
      sh.querySelector('[data-refresh]')?.addEventListener('click', b => { b.currentTarget.disabled = true; b.currentTarget.textContent = '받는 중…'; this.onRefresh?.(); });
    };
    const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(S[k]) === String(v) ? 'on' : ''}" data-set="${k}:${v}">${l}</button>`).join('')}</div>`;
    return {
      title: '메뉴',
      body: `<div class="world-info"><b>${esc(g.meta?.name || '')}</b><span class="muted small">세계 코드 ${esc(g.code)} · ${g.store.kind === 'online' ? '온라인' : '이 기기에만 저장'} · ${g.day}일차</span>
          <span class="muted small">주민: ${members.map(esc).join(', ')}</span></div>
        ${g.store.kind === 'online' ? '<button class="btn wide" data-invite>친구 초대 링크</button>' : '<p class="muted small">혼자 하기 세계는 이 기기에만 저장돼요. 친구와 하려면 온라인 세계를 새로 만드세요.</p>'}
        <h3>설정</h3>
        <div class="opt"><span>이동 방식</span>${seg('control', [['tap', '터치'], ['joystick', '조이스틱']])}</div>
        <div class="opt"><span>조이스틱 위치</span>${seg('lefty', [[false, '왼쪽'], [true, '오른쪽']])}</div>
        <div class="opt"><span>효과음</span>${seg('sound', [[true, '켜기'], [false, '끄기']])}</div>
        <div class="opt"><span>배경음</span>${seg('music', [[true, '켜기'], [false, '끄기']])}</div>
        <div class="opt"><span>진동</span>${seg('vibrate', [[true, '켜기'], [false, '끄기']])}</div>
        <button class="btn wide ghost" data-go="help">게임 방법</button>
        <button class="btn wide" data-exit>저장하고 메인 화면으로</button>
        <button class="btn wide ghost" data-refresh>저장하고 최신 버전 받기</button>
        <p class="muted small center">버전 ${APP_VERSION}</p>`,
    };
  }

  pHelp() { return { title: '게임 방법', body: helpHtml() }; }
}

export function helpHtml() {
  return `<div class="help">
    <p><b>이동</b> — 가고 싶은 곳을 누르면 걸어가요. 누른 채 끌면 그쪽으로 걸어요. 메뉴에서 조이스틱으로 바꿀 수 있어요.</p>
    <p><b>상호작용</b> — 나무·바위·밭·사람·건물을 누르면 다가가서 알아서 해요. 우리 집을 누르면 들어가요. 오른쪽 아래 큰 버튼은 바라보는 것과 상호작용해요.</p>
    <p><b>농사</b> — 괭이로 밭 갈기, 씨앗 심기, 물 주기, 수확. 물이 마르면 절반 속도로 자라요. 밭은 모두가 함께 써요.</p>
    <p><b>하루</b> — 아침 6시에 시작해 밤 12시에 끝나요. 12시 전에 집 침대에서 자야 해요. 깨어 있다가 12시가 되면 쓰러져서 다음 날 체력 절반·기력 3분의 1로 시작해요. 함께 있는 사람이 모두 잠들면 바로 다음 날 아침이 돼요.</p>
    <p><b>가판대</b> — 농장의 가판대에 물건을 올려 두면 하루가 끝날 때 팔리고, 하루 요약에서 판 물건과 돈을 보여 줘요. 마을 가게에서는 바로 팔 수 있어요.</p>
    <p><b>커피</b> — 커피 씨앗을 심어 커피콩을 거두고, 집에 놓은 정수기에 물 양동이를 끼운 뒤 콩을 넣으면 30초에 한 잔씩 내려요. 마신 날은 새벽 2시까지 버틸 수 있어요(하루 한 잔). 양동이는 철 주괴로 작업대에서 만들고, 주괴는 용광로에서 만들어요.</p>
    <p><b>방치 창고</b> — 오른쪽 아래 바구니 버튼. 접속해 있든 아니든 캐릭터가 고른 일을 하며 수확물이 쌓여요(최대 8시간, 집 4단계부터 16시간). 밭 일꾼을 고용하면 물 주기와 수확도 알아서 해요.</p>
    <p><b>광업</b> — 농장 위쪽 광산. 깊이 갈수록 귀한 광석이 나와요. 5층마다 승강기가 있어요.</p>
    <p><b>낚시</b> — 물을 바라보고 던지고, 입질 때 누른 뒤 초록 칸에서 한 번 더 누르세요.</p>
    <p><b>사냥 · 모험</b> — 숲에는 토끼·멧돼지·슬라임, 숲 남쪽 유적에는 해골과 5층마다 골렘이 있어요.</p>
    <p><b>요리 · 재봉 · 목공</b> — 마을 식당·의상실·대장간 옆, 또는 집을 키우면 집 안에서. 한 번에 여러 개 만들 수 있어요.</p>
    <p><b>자연</b> — 베어 낸 나무와 캐낸 바위는 다시 나지 않아요. 농장의 숲지기 두리에게 값을 치르면 되살려 줘요.</p>
    <p><b>친밀도</b> — 사람마다 좋아하는 선물이 달라요. 좋아하는 걸 주면 크게 올라요.</p>
    <p><b>순간이동</b> — 각 지역의 석상을 한 번 깨우면 어디서든 이동할 수 있어요 (세계 공용).</p>
    <p><b>집 키우기</b> — 모두가 골드와 재료를 모아 집을 키워요. 집이 크면 밭이 넓어지고 작물이 빨리 자라요.</p>
    <p><b>함께 하기</b> — 초대 링크를 보내면 최대 4명이 같은 세계에서 놀 수 있어요.</p>
  </div>`;
}
