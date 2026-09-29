// 3D 주사위 트레이 — three.js 로 그리고 cannon-es 로 실제 물리 굴림을 계산한다.
//
// 결과는 룰 엔진이 먼저 정한다(온라인 동기화·재현을 위해). 여기서는
//   1) 물리 세계에서 주사위를 던져 멈출 때까지 미리 계산해 궤적을 녹화하고
//   2) 멈췄을 때 위를 향한 면에 엔진이 정한 눈이 오도록 면 배치를 바꿔 끼운 뒤
//   3) 녹화한 궤적을 재생한다.
// 그래서 굴러가는 모습은 진짜 물리이면서 결과는 항상 엔진과 일치한다.
import * as THREE from './vendor/three.module.min.js';
import * as CANNON from './vendor/cannon-es.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const SIZE = 1.3;                 // 주사위 한 변
const HALF = SIZE / 2;
const TRAY_W = 10, TRAY_D = 6.4;  // 트레이 안쪽 크기 (x, z)
const ROW_Z = 0.9;                // 정렬 줄 위치
// 주사위 함: 트레이 아래(화면 아래쪽)의 나무 상자. 고정한 주사위는 굴릴 때 여기로 옮겨 가서
// 다른 주사위가 굴러가는 길을 막지 않는다. 뒤집기·눈금 조정 같은 효과도 이 안에서 그대로 받는다.
const RAIL_T = 0.5;
const BOX_D = 1.9;                           // 함 안쪽 깊이
const BOX_Z = TRAY_D / 2 + RAIL_T + BOX_D / 2; // 함 안 주사위 줄 위치
const BOX_T = 0.35, BOX_H = 0.42;            // 함 벽 두께·높이
const SCENE_Z0 = -(TRAY_D / 2 + RAIL_T), SCENE_Z1 = BOX_Z + BOX_D / 2 + BOX_T;   // 화면에 담을 앞뒤 범위
const FPS = 60;
const UP = new THREE.Vector3(0, 1, 0);

// BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z. 마주 보는 면의 합은 7.
const STD_FACES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const PIP_POS = {
  1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]],
  4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
  5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
  6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]],
};

function faceTexture(v) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(100, 90, 20, 128, 128, 190);
  grad.addColorStop(0, '#FFFDF6');
  grad.addColorStop(1, '#EDE3CF');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (const [x, y] of PIP_POS[v]) {
    const r = v === 1 ? 40 : 25;
    const px = x * 256, py = y * 256;
    const pg = g.createRadialGradient(px - r * .3, py - r * .3, r * .1, px, py, r);
    if (v === 1) { pg.addColorStop(0, '#FF6B6B'); pg.addColorStop(1, '#B0122B'); }
    else { pg.addColorStop(0, '#4A3A6B'); pg.addColorStop(1, '#16102A'); }
    g.fillStyle = pg;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(px, py + 1.5, r, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function feltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 220, 40, 256, 256, 380);
  grad.addColorStop(0, '#2E8F6E');
  grad.addColorStop(1, '#0E4A3A');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 가장자리 금박 문양선
  g.strokeStyle = 'rgba(255, 215, 120, .28)';
  g.lineWidth = 4;
  g.strokeRect(22, 22, 468, 468);
  g.lineWidth = 1.5;
  g.strokeRect(34, 34, 444, 444);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.45, color + '88');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 위를 향한 면 번호
function topFace(q) {
  let best = 0, bestDot = -2;
  const v = new THREE.Vector3();
  FACE_NORMALS.forEach((n, i) => {
    const d = v.copy(n).applyQuaternion(q).dot(UP);
    if (d > bestDot) { bestDot = d; best = i; }
  });
  return best;
}

// 주어진 면에 v가 오도록 면 배치를 바꾼다 (마주 보는 면 합 7 유지)
function remap(faceIdx, v) {
  const faces = STD_FACES.slice();
  const u = faces[faceIdx];
  if (u === v) return faces;
  const map = { [u]: v, [v]: u, [7 - u]: 7 - v, [7 - v]: 7 - u };
  return faces.map(x => map[x] ?? x);
}

// 주사위 함 바닥 나뭇결
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7A4520';
  g.fillRect(0, 0, 512, 128);
  // 널빤지 네 장 + 결무늬
  for (let b = 0; b < 4; b++) {
    const y0 = b * 32;
    g.fillStyle = b % 2 ? 'rgba(0,0,0,.08)' : 'rgba(255,220,170,.05)';
    g.fillRect(0, y0, 512, 32);
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(${40 + k * 6}, 20, 5, ${0.18 + Math.random() * 0.15})`;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      const yy = y0 + 3 + Math.random() * 26;
      g.moveTo(0, yy);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, yy + Math.sin(x / 60 + b * 2 + k) * 2.2);
      g.stroke();
    }
    g.fillStyle = 'rgba(30, 12, 2, .55)';
    g.fillRect(0, y0 + 31, 512, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = t => t * t * t;

export class DiceTray {
  constructor(host, { onPick, onHit, onLong, lowGfx = false } = {}) {
    this.host = host;
    this.onPick = onPick || (() => {});
    this.onHit = onHit || (() => {});
    this.onLong = onLong || (() => {});      // 주사위를 꾹 누름 (정보 보기)
    this.dice = [];
    this.anim = null;
    this.target = false;
    this.clock = new THREE.Clock();

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 저사양 모드: 해상도 1배 · 그림자 끔 (배터리·발열)
    renderer.setPixelRatio(lowGfx ? 1 : Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = !lowGfx;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

    scene.add(new THREE.HemisphereLight(0xE8E4FF, 0x1A1030, 0.9));
    const key = new THREE.DirectionalLight(0xFFF1D6, 2.1);
    key.position.set(-4, 12, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    key.shadow.radius = 4;
    key.shadow.bias = -0.0008;
    scene.add(key);
    const rim = new THREE.PointLight(0xB36BFF, 18, 20);
    rim.position.set(5, 4, -4);
    scene.add(rim);

    // 펠트 바닥
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(TRAY_W, TRAY_D),
      new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 나무 테두리
    const wood = new THREE.MeshStandardMaterial({ color: 0x6B3A1A, roughness: 0.55, metalness: 0.1 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xE0A93A, roughness: 0.3, metalness: 0.8 });
    const T = RAIL_T, H = 0.7;
    const rails = [
      [TRAY_W + 2 * T, TRAY_D / 2 + T / 2, 0], [TRAY_W + 2 * T, -(TRAY_D / 2 + T / 2), 0],
      [TRAY_D, TRAY_W / 2 + T / 2, Math.PI / 2], [TRAY_D, -(TRAY_W / 2 + T / 2), Math.PI / 2],
    ];
    for (const [len, off, rot] of rails) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, T), wood);
      m.position.y = H / 2; m.castShadow = true; m.receiveShadow = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, T * 0.35), trim);
      t.position.y = H + 0.03;
      g.add(m, t);
      g.rotation.y = rot;
      if (rot) g.position.x = off; else g.position.z = off;
      scene.add(g);
    }

    // 주사위 함 (트레이 앞 난간에 붙은 낮은 나무 상자)
    const boxFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(TRAY_W + 2 * T, BOX_D),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 }),
    );
    boxFloor.rotation.x = -Math.PI / 2;
    boxFloor.position.set(0, 0.001, BOX_Z);
    boxFloor.receiveShadow = true;
    scene.add(boxFloor);
    const boxWalls = [
      [TRAY_W + 2 * T + 2 * BOX_T, BOX_T, 0, BOX_Z + BOX_D / 2 + BOX_T / 2],
      [BOX_T, BOX_D, -(TRAY_W / 2 + T + BOX_T / 2), BOX_Z],
      [BOX_T, BOX_D, TRAY_W / 2 + T + BOX_T / 2, BOX_Z],
    ];
    for (const [w, d, x, z] of boxWalls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, BOX_H, d), wood);
      m.position.set(x, BOX_H / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), trim);
      t.position.set(x, BOX_H + 0.025, z);
      scene.add(m, t);
    }

    this.faceMats = {};
    for (let v = 1; v <= 6; v++) {
      this.faceMats[v] = new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.32, metalness: 0.02 });
    }
    this.geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.17);
    this.glowGold = new THREE.MeshBasicMaterial({ map: glowTexture('#FFC83D'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xFFC83D });
    this.glowBlue = new THREE.MeshBasicMaterial({ map: glowTexture('#4FB3FF'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.raycaster = new THREE.Raycaster();
    // 짧게 누르면 잡기, 0.45초 이상 꾹 누르면 정보
    renderer.domElement.addEventListener('pointerdown', e => {
      const i = this.hitIndex(e);
      if (i < 0 || this.anim) return;
      this.press = { i, long: false, timer: setTimeout(() => { if (this.press?.i === i) { this.press.long = true; this.onLong(i, e); } }, 450) };
    });
    const end = pick => () => {
      const p = this.press;
      this.press = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (pick && !p.long && !this.anim) this.onPick(p.i);
    };
    renderer.domElement.addEventListener('pointerup', end(true));
    renderer.domElement.addEventListener('pointerleave', end(false));
    renderer.domElement.addEventListener('pointercancel', end(false));
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    this.dirty = true;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    this.running = true;
    requestAnimationFrame(this.loop);
  }

  // 컨테이너를 옮겨 붙일 때 (화면을 다시 그려도 캔버스는 재사용)
  attach(host) {
    if (this.host === host) return;
    this.resizeObs.unobserve(this.host);
    this.host = host;
    host.appendChild(this.renderer.domElement);
    this.resizeObs.observe(host);
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || 360;
    const h = this.host.clientHeight || 240;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // 트레이 가로가 화면에 꽉 차도록 카메라 거리를 맞춘다
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const needW = (TRAY_W + 1.4) / 2 / Math.tan(hfov / 2);
    const needD = (SCENE_Z1 - SCENE_Z0 + 0.9) / 2 / Math.tan(vfov / 2);
    const dist = Math.max(needW, needD);
    const cz = (SCENE_Z0 + SCENE_Z1) / 2 + 0.25;   // 트레이 + 주사위 함 가운데 (가까운 함 쪽이 원근으로 더 아래로 내려가는 만큼)
    this.camera.position.set(0, dist * 0.93, cz - 0.35 + dist * 0.37);
    this.camera.lookAt(0, 0, cz);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  slotX(i, n) {
    const gap = Math.min(1.75, (TRAY_W - 1.6) / Math.max(1, n - 1));
    return (i - (n - 1) / 2) * gap;
  }

  ensure(n) {
    while (this.dice.length < n) {
      const mesh = new THREE.Mesh(this.geo, STD_FACES.map(v => this.faceMats[v]));
      mesh.castShadow = true;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), this.glowGold);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      glow.visible = false;
      // 잡은 주사위 바닥의 금색 고리
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 4, 1), this.ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.y = 0.03;
      ring.visible = false;
      // 보스 스킬에 휩싸일 때 주사위를 감싸는 빛 (불길·저주)
      const aura = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xFF5A1F, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      aura.scale.setScalar(1.14);
      aura.visible = false;
      this.scene.add(mesh, glow, ring, aura);
      this.dice.push({ mesh, glow, ring, aura, auraI: 0, faces: STD_FACES.slice(), held: false, boxed: false, hop: null, value: 0, lift: 0, morph: null });
    }
    while (this.dice.length > n) {
      const d = this.dice.pop();
      this.scene.remove(d.mesh, d.glow, d.ring, d.aura);
    }
  }

  setFaces(d, faces) {
    d.faces = faces;
    d.mesh.material = faces.map(v => this.faceMats[v]);
  }

  // 굴리지 않고 정렬된 상태로 보여준다 (새 턴, 이어하기, 화면 갱신)
  show(values, held = []) {
    if (this.anim) return;
    this.dirty = true;
    const n = values.length;
    this.ensure(n);
    this.dice.forEach((d, i) => {
      d.held = !!held[i];
      if (d.boxed && (!d.held || !values[i])) {
        // 고정을 풀었거나 새 차례: 함에서 트레이로 돌아온다
        if (values[i] && d.value === values[i]) this.hop(d, false);
        else { d.boxed = false; d.hop = null; }
      }
      if (d.morph) return;          // 보스 스킬 연출 중인 주사위는 연출이 끝나면 눈을 바꾼다
      // 눈이 그대로면 굴러서 멈춘 자세를 유지한다 (다시 그릴 때 튀지 않게)
      if (values[i] && d.value === values[i] && !d.blank) {
        d.mesh.position.x = this.slotX(i, n);
        if (!d.hop) d.mesh.position.z = this.homeZ(d);
        return;
      }
      if (values[i] && d.value && d.value !== values[i] && !d.blank) d.lift = 1.4;  // 뒤집기·조정: 톡 튀었다 떨어진다
      const v = values[i] || ((i % 6) + 1);
      d.value = values[i];
      this.setFaces(d, remap(2, v));
      d.mesh.quaternion.identity();
      d.mesh.position.set(this.slotX(i, n), HALF, this.homeZ(d));
      d.mesh.material.forEach(m => (m.transparent = false));
      d.blank = !values[i];
    });
    this.refreshGlow();
  }

  setHeld(held) {
    this.dirty = true;
    this.dice.forEach((d, i) => {
      d.held = !!held[i];
      if (d.boxed && !d.held) this.hop(d, false);   // 함 안의 주사위를 풀면 트레이로 폴짝
    });
    this.refreshGlow();
  }

  homeZ(d) { return d.boxed ? BOX_Z : ROW_Z; }

  // 트레이 ↔ 주사위 함 사이를 포물선으로 폴짝 옮긴다
  hop(d, toBox, ms = 460) {
    if (d.boxed === toBox && !d.hop) return;
    d.boxed = toBox;
    d.hop = { z0: d.mesh.position.z, z1: toBox ? BOX_Z : ROW_Z, t0: performance.now(), ms };
    this.dirty = true;
  }

  setTarget(on) {
    this.dirty = true;
    this.target = on;
    this.refreshGlow();
  }

  refreshGlow() {
    this.dice.forEach(d => {
      const show = !d.blank && (d.held || this.target);
      d.glow.visible = show;
      d.glow.material = d.held ? this.glowGold : this.glowBlue;
      d.ring.visible = !d.blank && d.held;
    });
  }

  // 주사위가 화면에서 어디 있는지 (자동 점검용)
  screenPos(i) {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!this.dice[i]) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };   // 주사위 수가 달라진 순간 (여섯 번째 주사위)
    const v = this.dice[i].mesh.position.clone().project(this.camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  hitIndex(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObjects(this.dice.map(d => d.mesh))[0];
    return hit ? this.dice.findIndex(d => d.mesh === hit.object) : -1;
  }

  // ── 연출 ────────────────────────────────────────────────────────────────
  // 점수를 기록하면 주사위가 에너지로 빨려 들어간다 (작아져 사라짐 → restore 로 다시 나타남)
  absorb(ms = 380) { this.shrink = { t0: performance.now(), ms, dir: -1 }; }
  restore(ms = 220) { if (this.shrink) this.shrink = { t0: performance.now(), ms, dir: 1 }; }

  // 보스 스킬로 주사위 눈이 바뀐다. kind: 'burn' (불타며 흔들림) | 'twist' (허공에서 뒤집힘)
  morph(i, v, kind, ms = 900) {
    const d = this.dice[i];
    if (!d) return Promise.resolve();
    return new Promise(resolve => {
      d.morph = { t0: performance.now(), ms, kind, v, swapped: false, resolve, base: d.mesh.quaternion.clone() };
      d.aura.material.color.set(kind === 'burn' ? 0xFF5A1F : 0x9A5BFF);
      d.auraI = 1;
    });
  }

  // 전쟁의 북: 모든 주사위가 쿵 하고 튄다
  quake() {
    this.dirty = true;
    this.dice.forEach((d, i) => { d.lift = Math.max(d.lift, 0.9 + (i % 2) * 0.35); d.wobble = 1; });
  }

  // values: 엔진이 정한 굴림 결과, rolling: 이번에 굴리는 주사위 여부
  roll(values, rolling, speed = 1) {
    speed *= 1.2;                  // 굴러가는 모습 1.2배속
    const n = values.length;
    this.ensure(n);
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    world.allowSleep = true;
    const dieMat = new CANNON.Material('die');
    const floorMat = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: 1.5, restitution: 0.25 }));
    // 주사위끼리는 미끄럽고 덜 튀게: 스치면 비껴가서 각자 제 갈 길을 간다
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.03, restitution: 0.08 }));

    const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);
    const walls = [
      [[0, 0, -TRAY_D / 2], [0, 0, 0]], [[0, 0, TRAY_D / 2], [0, Math.PI, 0]],
      [[-TRAY_W / 2, 0, 0], [0, Math.PI / 2, 0]], [[TRAY_W / 2, 0, 0], [0, -Math.PI / 2, 0]],
      [[0, 6.0, 0], [Math.PI / 2, 0, 0]],   // 천장: 세게 튄 주사위가 화면 밖으로 날아가지 않게
    ];
    for (const [p, r] of walls) {
      const b = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
      b.position.set(...p);
      b.quaternion.setFromEuler(...r);
      world.addBody(b);
    }

    const bodies = [];
    // 던질 자리: 앞줄·뒷줄 두 줄로 나누고, 줄 안에서는 왼쪽에서 출발한 주사위가 더 멀리 가게 한다
    // → 날아가는 길이 엇갈리거나 앞지르지 않아 주사위끼리 덜 부딪히고 넓게 흩어진다 (서로 부딪힌 쌍 7.6 → 4.6 / 판)
    const nRoll = rolling.filter(Boolean).length;
    const flip = Math.random() < 0.5 ? 1 : -1;
    const rowZ = [-(1.9 + Math.random() * 0.4) * flip, (1.9 + Math.random() * 0.4) * flip];
    const three = Math.random() < 0.5 ? 0 : 1;
    const ROW3 = { tx: [-3.4, 0, 3.2], sx: [0.9, 2.55, 4.2] }, ROW2 = { tx: [-1.8, 1.7], sx: [2.0, 4.0] };
    let cells = [];
    for (const r of [0, 1]) {
      const row = r === three || nRoll > 5 ? ROW3 : ROW2;
      row.tx.forEach((tx, c) => cells.push({ z: rowZ[r], tx, sx: row.sx[c] }));
    }
    while (cells.length > Math.max(1, nRoll)) cells.splice(Math.floor(Math.random() * cells.length), 1);
    let k = 0;
    const hits = [];
    const shape = new CANNON.Box(new CANNON.Vec3(HALF * 0.96, HALF * 0.96, HALF * 0.96));
    this.dice.forEach((d, i) => {
      if (!rolling[i]) {
        // 고정한 주사위는 주사위 함으로 옮긴다 → 트레이가 비어 굴리는 주사위를 막지 않는다
        if (!d.blank) this.hop(d, true);
        return;
      }
      d.boxed = false;
      d.hop = null;
      const b = new CANNON.Body({ mass: 1, material: dieMat, shape, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.1 });
      // 바닥을 움켜쥐고(마찰 큼) 모서리로 넘어가며 데굴데굴 구르게: 회전은 오래 유지, 던지는 힘·회전은 크게
      b.linearDamping = 0.08;
      b.angularDamping = 0.06;
      // 오른쪽 위에서 한 줌 던지되, 주사위마다 트레이 가운데 기준으로 고르게 흩어진 목표 지점을 향해 알맞은 힘으로
      // (예전엔 모두 같은 방향으로 세게 던져 왼쪽 벽에 몰렸다: 평균 x -1.9, 왼쪽 벽 25%)
      const cell = cells[k % cells.length];
      const sx = cell.sx + (Math.random() - 0.5) * 0.3, sz = cell.z + (Math.random() - 0.5) * 0.3;
      b.position.set(sx, 3.3 + Math.random() * 0.6, sz);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      b.quaternion.set(q.x, q.y, q.z, q.w);
      const tx = cell.tx + (Math.random() - 0.5) * 0.8 + 2.0, tz = cell.z + (Math.random() - 0.5) * 0.6;   // +2.0: 세게 던지면 조금 더 미끄러져 가는 만큼
      k++;
      // 세게 던진다: 옆으로 2배 속도 + 펠트에 내리꽂는 힘. 세게 내리꽂을수록 첫 착지 마찰이 커서 목표 근처에서 멈춘다
      const AIM = 4.2;   // 목표까지 거리 × 이 값 = 옆으로 던지는 속도 (시뮬레이션으로 맞춤)
      b.velocity.set((tx - sx) * AIM * (0.95 + Math.random() * 0.1), -24 - Math.random() * 3, (tz - sz) * AIM);
      // 굴러가는 방향으로 앞구르기 회전을 크게, 옆으로 새는 회전은 작게 (옆 주사위 쪽으로 튀지 않게)
      b.angularVelocity.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 30, 35 + Math.random() * 30);
      b.addEventListener('collide', e => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 2.2) hits.push({ f: frames.length, v });
      });
      world.addBody(b);
      bodies.push({ i, b });
    });

    const frames = [];
    // 오래 걸리지 않게: 2.2초(물리 시간)에서 끊고, 거의 멈추면(미세한 흔들림은 정렬 연출이 흡수) 바로 끝낸다
    const MAX = FPS * 2.6;
    let still = 0;
    for (let f = 0; f < MAX; f++) {
      world.step(1 / FPS);
      frames.push(bodies.map(({ b }) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
      const moving = bodies.some(({ b }) => b.velocity.length() > 0.35 || b.angularVelocity.length() > 0.7);
      still = moving ? 0 : still + 1;
      if (still > 5 && f > 30) break;
    }

    // 공중 회전 더하기: 주사위가 떠 있는 동안에만 정확히 한 바퀴(360°)를 더 돌린다.
    // 한 바퀴라 착지 자세는 물리 결과 그대로 — 나오는 눈은 바뀌지 않는다. 약 절반의 주사위에만 줘서 제각각 돌게.
    const AIR = HALF + 0.6;   // 이보다 높으면 공중 (모서리가 바닥을 뚫지 않는 높이)
    const spins = bodies.map((_, k) => {
      const cum = [];
      let n = 0;
      for (const fr of frames) { if (fr[k][1] > AIR) n++; cum.push(n); }
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      return { cum, total: n, axis, turns: n > 3 && Math.random() < 0.55 ? 1 : 0 };
    });

    // 멈춘 자세에서 위를 향한 면에 엔진 결과를 입힌다
    const last = frames[frames.length - 1];
    bodies.forEach(({ i }, k) => {
      const q = new THREE.Quaternion(last[k][3], last[k][4], last[k][5], last[k][6]);
      this.setFaces(this.dice[i], remap(topFace(q), values[i]));
      this.dice[i].value = values[i];
      this.dice[i].blank = false;
      this.dice[i].held = false;
    });
    this.refreshGlow();

    // 합치기 연출: 정렬 줄 위치 + 윗면은 그대로, 90° 단위로 가장 가까운 방향으로 반듯하게
    const settle = bodies.map(({ i }, k) => {
      const q = new THREE.Quaternion(last[k][3], last[k][4], last[k][5], last[k][6]);
      const top = FACE_NORMALS[topFace(q)].clone().applyQuaternion(q);
      const upright = new THREE.Quaternion().setFromUnitVectors(top, UP).multiply(q);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(upright);
      if (Math.abs(side.y) > 0.7) side.set(0, 0, 1).applyQuaternion(upright);
      const yaw = Math.atan2(-side.z, side.x);
      const snap = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
      const fix = new THREE.Quaternion().setFromAxisAngle(UP, snap - yaw);
      return { i, from: null, to: fix.multiply(upright) };
    });

    return new Promise(resolve => {
      this.anim = { frames, bodies, hits, settle, spins, speed, t0: performance.now(), hitIdx: 0, resolve, phase: 'fly', ids: new Set(bodies.map(b => b.i)) };
    });
  }

  // 보스 스킬 연출 한 프레임
  stepMorph(d, i, n, t) {
    const m = d.morph;
    const k = Math.min(1, (t - m.t0) / m.ms);
    const x = this.slotX(i, n);
    if (m.kind === 'burn') {
      // 부들부들 떨다가 절반쯤에 눈이 타 버린다
      d.mesh.position.x = x + Math.sin(t / 22) * 0.07 * (1 - k);
      if (k > 0.55 && !m.swapped) { m.swapped = true; this.setFaces(d, remap(2, m.v)); d.mesh.quaternion.identity(); d.lift = 0.8; }
    } else {
      // 떠올라 한 바퀴 반 돌며 뒤집힌다
      d.lift = Math.sin(k * Math.PI) * 1.6;
      d.mesh.position.y = HALF + d.lift;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0.35).normalize(), easeOut(k) * Math.PI * 3);
      d.mesh.quaternion.copy(m.base).premultiply(q);
      if (k > 0.5 && !m.swapped) { m.swapped = true; this.setFaces(d, remap(2, m.v)); m.base.identity(); }
    }
    if (k >= 1) {
      d.mesh.position.x = x;
      d.mesh.quaternion.identity();
      this.setFaces(d, remap(2, m.v));
      d.value = m.v;
      d.morph = null;
      m.resolve();
    }
  }

  // 잡은 주사위는 살짝 떠 있다 (함 안에서는 조금만)
  liftWant(d) { return d.held ? (d.boxed ? 0.15 : 0.45) : 0; }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (document.hidden) return;              // 다른 앱을 보는 동안은 그리지 않는다
    const t = performance.now();
    // 배터리 절약: 움직이는 게 없으면 그리기를 쉰다 (빛나는 주사위만 있으면 초당 10번)
    const moving = this.anim || this.shrink || this.dice.some(d => d.morph || d.wobble || d.hop || d.auraI > 0.01 || Math.abs(this.liftWant(d) - d.lift) > 0.002);
    const glowing = this.dice.some(d => d.glow.visible);
    if (!moving && !this.dirty) {
      if (!glowing || t - (this.lastDraw || 0) < 100) return;
    }
    this.dirty = false;
    this.lastDraw = t;
    const a = this.anim;
    if (a && a.phase === 'fly') {
      const f = Math.min(a.frames.length - 1, Math.floor(((t - a.t0) / 1000) * FPS * a.speed));
      a.bodies.forEach(({ i }, k) => {
        const s = a.frames[f][k];
        this.dice[i].mesh.position.set(s[0], s[1], s[2]);
        this.dice[i].mesh.quaternion.set(s[3], s[4], s[5], s[6]);
        const sp = a.spins[k];
        if (sp.turns) {
          const w = sp.cum[f] / sp.total;
          this.dice[i].mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(sp.axis, Math.PI * 2 * sp.turns * w));
        }
      });
      while (a.hitIdx < a.hits.length && a.hits[a.hitIdx].f <= f) this.onHit(a.hits[a.hitIdx++].v);
      if (f >= a.frames.length - 1) {
        a.phase = 'settle';
        a.t1 = t + 50;
        a.settle.forEach(s => {
          const m = this.dice[s.i].mesh;
          s.from = { p: m.position.clone(), q: m.quaternion.clone() };
        });
      }
    } else if (a && a.phase === 'settle') {
      const k = easeOut(Math.min(1, Math.max(0, (t - a.t1) / 260)));
      const n = this.dice.length;
      a.settle.forEach(s => {
        const m = this.dice[s.i].mesh;
        const to = new THREE.Vector3(this.slotX(s.i, n), HALF, ROW_Z);
        m.position.lerpVectors(s.from.p, to, k);
        m.position.y += Math.sin(k * Math.PI) * 0.6;
        m.quaternion.slerpQuaternions(s.from.q, s.to, k);
      });
      if (k >= 1) {
        this.anim = null;
        a.resolve();
      }
    }
    // 잡은 주사위는 살짝 떠서 숨 쉬듯 빛난다
    const pulse = 0.75 + Math.sin(t / 260) * 0.25;
    let scale = 1;
    if (this.shrink) {
      const k = Math.min(1, (t - this.shrink.t0) / this.shrink.ms);
      scale = this.shrink.dir < 0 ? 1 - easeIn(k) : easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.25);
      if (this.shrink.dir > 0 && k >= 1) { this.shrink = null; scale = 1; }
    }
    const n = this.dice.length;
    this.dice.forEach((d, i) => {
      if (!this.anim?.ids.has(i)) {        // 굴러가는 중이 아닌 주사위 (고정한 주사위는 굴리는 동안 함으로 옮겨 간다)
        d.lift += (this.liftWant(d) - d.lift) * 0.2;
        let hopY = 0;
        if (d.hop) {
          const k = Math.min(1, (t - d.hop.t0) / d.hop.ms);
          d.mesh.position.z = d.hop.z0 + (d.hop.z1 - d.hop.z0) * easeInOut(k);
          hopY = Math.sin(k * Math.PI) * 1.5;
          if (k >= 1) d.hop = null;
        }
        d.mesh.position.y = HALF + d.lift + hopY;
      }
      if (d.morph) this.stepMorph(d, i, n, t);
      if (d.wobble && !this.anim) {
        d.wobble = Math.max(0, d.wobble - 0.04);
        d.mesh.position.x = this.slotX(i, n) + Math.sin(t / 30) * 0.1 * d.wobble;
      }
      d.mesh.scale.setScalar(Math.max(0.001, scale));
      d.glow.visible = scale > 0.5 && !d.blank && (d.held || this.target);
      d.ring.visible = scale > 0.5 && !d.blank && d.held;
      d.glow.position.x = d.ring.position.x = d.mesh.position.x;
      d.glow.position.z = d.ring.position.z = d.mesh.position.z;
      d.glow.material.opacity = pulse;
      d.auraI = Math.max(0, d.auraI - (d.morph ? 0 : 0.03));
      d.aura.visible = d.auraI > 0.01 && scale > 0.01;
      d.aura.material.opacity = d.auraI * (0.45 + Math.sin(t / 50) * 0.15);
      d.aura.position.copy(d.mesh.position);
      d.aura.quaternion.copy(d.mesh.quaternion);
      d.aura.scale.setScalar(1.14 * scale);
      d.mesh.material.forEach(m => { m.opacity = d.blank ? 0.5 : 1; m.transparent = !!d.blank; });
    });
    this.renderer.render(this.scene, this.camera);
  }
}
