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
import { TRAY_DECOR, drawDieFace, dieMatParams, dieGlows, dieImage, dieGlowImage, READY, loadImage, diceReady, preloadDice, drawTrayFloor, trayGlows, trayStyle, trayImage, trayReady, preloadTray, drawBoxFloor } from './skins.js';

// 원정 특수 주사위가 눈을 바꿀 때의 빛 색
const MORPH_COLOR = { gold: 0xFFC83D, twin: 0xFF9AD0, stair: 0x3EE6B4, heavy: 0x9AA4B8 };

const SIZE = 1.3;                 // 주사위 한 변
const HALF = SIZE / 2;
const TRAY_W = 10, TRAY_D = 6.4;  // 트레이 안쪽 크기 (x, z)
const ROW_Z = 0.9;                // 정렬 줄 위치
// 주사위 함: 트레이 아래(화면 아래쪽)의 나무 상자. 고정한 주사위는 굴릴 때 여기로 옮겨 가서
// 다른 주사위가 굴러가는 길을 막지 않는다. 뒤집기·눈금 조정 같은 효과도 이 안에서 그대로 받는다.
const RAIL_T = 0.5;
const HOP_MS = 380;               // 트레이 ↔ 함 이동 시간
const WALL_BOUNCE = 0.4, WALL_FRICTION = 0.8;    // 벽 탄력: 벽에서 튕겨 나오는 속도 +21% (시뮬레이션 600판: 입사 대비 0.44 → 0.54)
const BOX_D = 1.9;                           // 함 안쪽 깊이
const BOX_Z = TRAY_D / 2 + RAIL_T + BOX_D / 2; // 함 안 주사위 줄 위치
const BOX_T = 0.35, BOX_H = 0.42;            // 함 벽 두께·높이
const SCENE_Z0 = -(TRAY_D / 2 + RAIL_T), SCENE_Z1 = BOX_Z + BOX_D / 2 + BOX_T;   // 화면에 담을 앞뒤 범위
// 주사위 함 벽 [폭, 깊이, x, z]: 함 바깥 끝을 트레이 난간 바깥 끝에 맞춘다 (예전엔 벽 두께만큼 옆으로 삐져나와 계단이 졌다)
const BOX_OUT = TRAY_W / 2 + RAIL_T;
const BOX_WALLS = [
  [2 * BOX_OUT, BOX_T, 0, BOX_Z + BOX_D / 2 + BOX_T / 2],
  [BOX_T, BOX_D, -(BOX_OUT - BOX_T / 2), BOX_Z],
  [BOX_T, BOX_D, BOX_OUT - BOX_T / 2, BOX_Z],
];
const FPS = 60;
const UP = new THREE.Vector3(0, 1, 0);

// BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z. 마주 보는 면의 합은 7.
const STD_FACES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
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

// 각 면 그림의 '위쪽'이 주사위 몸체 기준으로 가리키는 방향 (BoxGeometry UV 의 v+ 방향)
const FACE_UPS = [
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0),
];

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

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = t => t * t * t;

// 트레이 물리 세계 (바닥·벽·천장). 굴림 녹화와 흔드는 동안의 실시간 물리가 같이 쓴다
// cornerR: 둥근 모서리 트레이(포커 테이블)는 네 모서리에 둥근 벽을 짧은 판 여러 개로 세운다
function makeWorld(ceiling = 6.0, dieBounce = 0.08, cornerR = 0) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
  world.allowSleep = true;
  const dieMat = new CANNON.Material('die');
  const floorMat = new CANNON.Material('floor');
  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: 1.5, restitution: 0.25 }));
  // 벽은 탄력 있게: 부딪히면 튕겨 나오는 속도가 바닥 기준보다 약 20% 크다 (WALL_BOUNCE 로 조절)
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, wallMat, { friction: WALL_FRICTION, restitution: WALL_BOUNCE }));
  // 주사위끼리는 미끄럽고 덜 튀게: 스치면 비껴가서 각자 제 갈 길을 간다
  // (흔드는 동안은 dieBounce 를 크게 줘서 서로 튕겨 낸다 — 한데 뭉치지 않게)
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.03, restitution: dieBounce }));

  const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const walls = [
    [[0, 0, -TRAY_D / 2], [0, 0, 0]], [[0, 0, TRAY_D / 2], [0, Math.PI, 0]],
    [[-TRAY_W / 2, 0, 0], [0, Math.PI / 2, 0]], [[TRAY_W / 2, 0, 0], [0, -Math.PI / 2, 0]],
    [[0, ceiling, 0], [Math.PI / 2, 0, 0]],   // 천장: 세게 튄 주사위가 화면 밖으로 날아가지 않게
  ];
  for (const [p, r] of walls) {
    const b = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
    b.position.set(...p);
    b.quaternion.setFromEuler(...r);
    world.addBody(b);
  }
  if (cornerR > 0) {
    const SEG = 9, th = 0.6, len = (Math.PI / 2) * cornerR / SEG + 0.08;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * (TRAY_W / 2 - cornerR), cz = sz * (TRAY_D / 2 - cornerR);
      for (let k = 0; k < SEG; k++) {
        const a = ((k + 0.5) / SEG) * (Math.PI / 2), nx = sx * Math.cos(a), nz = sz * Math.sin(a);   // 바깥을 향한 법선
        const r = cornerR + th / 2;
        const b = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Box(new CANNON.Vec3(len / 2, 3, th / 2)) });
        b.position.set(cx + nx * r, 3, cz + nz * r);
        b.quaternion.setFromEuler(0, Math.atan2(-nz, nx) + Math.PI / 2, 0);
        world.addBody(b);
      }
    }
  }

  return { world, dieMat };
}

// 장식 그림의 실제 그림 영역 (투명 여백 제외, uv 0~1 · 아래가 0). 그림을 아직 못 받았으면 예전 기준(아래 12% 여백)
const ALPHA_BOX = new WeakMap();
function alphaBox(img) {
  const def = { x0: 0, x1: 1, y0: 0.12, y1: 1 };
  if (!img || !(img.naturalWidth || img.width) || img.width <= 4) return def;
  if (ALPHA_BOX.has(img)) return ALPHA_BOX.get(img);
  const W = 96, H = Math.max(8, Math.round(96 * (img.naturalHeight || img.height) / (img.naturalWidth || img.width)));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  let d; try { d = g.getImageData(0, 0, W, H).data; } catch { return def; }
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const r = x1 < 0 ? def : { x0: Math.max(0, (x0 - 1) / W), x1: Math.min(1, (x1 + 2) / W), y0: Math.max(0, 1 - (y1 + 2) / H), y1: Math.min(1, 1 - (y0 - 1) / H) };
  ALPHA_BOX.set(img, r);
  return r;
}

export class DiceTray {
  constructor(host, { onPick, onHit, onLong, onThrow, onBox, onFail, lowGfx = false, diceSkin = 'classic', traySkin = 'classic' } = {}) {
    this.host = host;
    this.onThrow = onThrow || (() => {});   // 주사위가 손을 떠나는 순간 (흔드는 소리)
    this.onBox = onBox || (() => {});       // 고정한 주사위가 함에 들어가는 순간
    this.onPick = onPick || (() => {});
    this.onHit = onHit || (() => {});
    this.onLong = onLong || (() => {});      // 주사위를 꾹 누름 (정보 보기)
    this.onFail = onFail || (() => {});      // 그래픽 오류로 3D를 계속 그릴 수 없을 때
    this.dice = [];
    this.anim = null;
    this.target = false;
    this.clock = new THREE.Clock();

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 그래픽 절약(설정): 해상도 1배 · 그림자 끔 (배터리·발열).
    // 'auto' = 저사양 폰을 알아채 자동으로: 그림자는 그대로 두고 해상도만 1.5배까지 (2배와 눈으로 거의 같고 그리는 양은 약 44% 줄어든다)
    renderer.setPixelRatio(lowGfx === true ? 1 : Math.min(lowGfx === 'auto' ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = lowGfx !== true;
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
    const floor = this.floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TRAY_W, TRAY_D),
      new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 나무 테두리
    const wood = this.woodMat = new THREE.MeshStandardMaterial({ color: 0x6B3A1A, roughness: 0.55, metalness: 0.1 });
    const trim = this.trimMat = new THREE.MeshStandardMaterial({ color: 0xE0A93A, roughness: 0.3, metalness: 0.8 });
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
      (this.plainFrame ||= []).push(g);
    }

    // 주사위 함 (트레이 앞 난간에 붙은 낮은 나무 상자)
    const boxFloor = this.boxFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * (BOX_OUT - BOX_T), BOX_D),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    );
    boxFloor.rotation.x = -Math.PI / 2;
    boxFloor.position.set(0, 0.001, BOX_Z);
    boxFloor.receiveShadow = true;
    scene.add(boxFloor);
    for (const [w, d, x, z] of BOX_WALLS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, BOX_H, d), wood);
      m.position.set(x, BOX_H / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), trim);
      t.position.set(x, BOX_H + 0.025, z);
      scene.add(m, t);
      this.plainFrame.push(m, t);
    }

    this.faceMats = {};
    this.setSkin(diceSkin, traySkin);
    this.geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.17);
    this.glowGold = new THREE.MeshBasicMaterial({ map: glowTexture('#FFC83D'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xFFC83D });
    this.glowBlue = new THREE.MeshBasicMaterial({ map: glowTexture('#4FB3FF'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.raycaster = new THREE.Raycaster();
    // 짧게 누르면 잡기, 0.45초 이상 꾹 누르면 정보
    renderer.domElement.addEventListener('pointerdown', e => {
      const i = this.hitIndex(e);
      if (i < 0 || this.anim || this.live) return;
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

  // ── 꾸미기 ──────────────────────────────────────────────────────────────
  // 반짝이는 스킨(보석·금속·얼음)이 비춰 보일 주변 풍경. 기본 스킨에는 쓰지 않는다(예전 모습 그대로)
  envMap() {
    if (this.env) return this.env;
    const sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const pos = geo.attributes.position, col = [];
    const top = new THREE.Color(0xFFF4E0), bottom = new THREE.Color(0x2A1850), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.lerpColors(bottom, top, (pos.getY(i) / 10 + 1) / 2); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    for (const [x, y, z, w, h, k] of [[-5, 6, 3, 5, 2, 5], [6, 4, -4, 3, 3, 3], [0, 8, -6, 8, 1, 4], [-7, 1, -3, 1, 4, 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.95), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0);
      sc.add(m);
    }
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(sc, 0.02).texture;
    pm.dispose();
    return this.env;
  }

  coreMat() {
    if (this.coreM) return this.coreM;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1C1815'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#4A3A2C'; g.lineWidth = 3;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(20 + k * 22, 64 + (k % 2 ? 20 : -20), 14, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = '#8A5A34'; g.lineWidth = 2;
    g.strokeRect(8, 8, 112, 112);
    this.coreM = new THREE.MeshStandardMaterial({ map: this.canvasTex(c), roughness: 0.45, metalness: 0.9, envMap: this.envMap(), envMapIntensity: 0.6 });
    return this.coreM;
  }

  // 세머리 용의 얼음 숨결: 주사위를 감싸는 얼음 껍질 (가장자리는 하얀 성에, 가운데는 비쳐 보이는 얼음, 금 몇 줄)
  iceMat() {
    if (this.iceM) return this.iceM;
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // 가운데는 옅은 푸른빛, 가장자리로 갈수록 짙은 성에
    const rg = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.72);
    rg.addColorStop(0, 'rgba(150,215,255,0.30)');
    rg.addColorStop(0.6, 'rgba(170,228,255,0.50)');
    rg.addColorStop(1, 'rgba(240,250,255,0.95)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    // 테두리 성에 알갱이
    for (let k = 0; k < 900; k++) {
      const side = k % 4, t = rnd() * S, d = Math.pow(rnd(), 2.2) * S * 0.2;
      const [x, y] = side === 0 ? [t, d] : side === 1 ? [S - d, t] : side === 2 ? [t, S - d] : [d, t];
      g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.55})`;
      g.beginPath(); g.arc(x, y, 1 + rnd() * 3.2, 0, Math.PI * 2); g.fill();
    }
    // 얼음 금
    g.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      let x = S * (0.15 + rnd() * 0.7), y = S * (0.15 + rnd() * 0.7), a = rnd() * Math.PI * 2;
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 4; s++) { a += (rnd() - 0.5) * 1.4; x += Math.cos(a) * S * 0.09; y += Math.sin(a) * S * 0.09; g.lineTo(x, y); }
      g.stroke();
    }
    // 반사광 띠
    const sh = g.createLinearGradient(0, 0, S, S);
    sh.addColorStop(0.18, 'rgba(255,255,255,0)'); sh.addColorStop(0.26, 'rgba(255,255,255,0.45)'); sh.addColorStop(0.34, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S);
    const tex = this.canvasTex(c);
    this.iceM = new THREE.MeshStandardMaterial({ map: tex, color: 0xCDEFFF, transparent: true, depthWrite: false, roughness: 0.12, metalness: 0,
      envMap: this.envMap(), envMapIntensity: 1.3, emissive: new THREE.Color(0x3FA8F0), emissiveIntensity: 0.35 });
    return this.iceM;
  }

  // 만화풍 음영 3단계
  toonRamp() {
    if (this.ramp) return this.ramp;
    const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return (this.ramp = t);
  }

  // 디자인 렌더로 만든 면 그림 (불러오면 다시 그린다)
  // 받아 둔 그림의 텍스처는 버리지 않고 다시 쓴다 (스킨을 다시 고를 때 GPU에 또 올리느라 늦게 뜨지 않게)
  // 아직 못 받은 그림은 검게 비지 않게 대신 그림(fallback 캔버스 — 없으면 어두운 나무색)을 먼저 입히고,
  // 받으면 같은 텍스처에 바꿔 끼운다 (복제한 난간 텍스처도 같은 원본을 써서 함께 바뀐다)
  imageTex(url, fallback = null) {
    this.texCache ||= new Map();
    if (this.texCache.has(url)) return this.texCache.get(url);
    const img = READY.get(url);
    let t;
    if (img) t = new THREE.Texture(img);
    else {
      let ph = fallback?.();
      if (!ph) { ph = document.createElement('canvas'); ph.width = ph.height = 4; const g = ph.getContext('2d'); g.fillStyle = '#5A4636'; g.fillRect(0, 0, 4, 4); }
      t = new THREE.Texture(ph);
      loadImage(url).then(im => { t.image = im; t.needsUpdate = true; this.dirty = true; }, () => {});
    }
    t.needsUpdate = true; t.userData.cached = true; this.texCache.set(url, t);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  drop(t) { if (t && !t.userData?.cached) t.dispose(); }

  canvasTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // 주사위·트레이 스킨을 바꾼다 (스킨 이름은 skins.js)
  setSkin(diceId = 'classic', trayId = 'classic') {
    this.dirty = true;
    if (diceId !== this.diceSkin) {
      this.diceSkin = diceId;
      // 그림 스킨은 그림을 다 받은 뒤에 한 번에 바꾼다 (그 사이엔 지금 주사위 그대로 — 빈 면이 번쩍이지 않게)
      if (this.faceMats[1] && !diceReady(diceId)) {
        const go = () => { if (this.diceSkin === diceId && this.running) this.applyDice(diceId); };
        preloadDice(diceId).then(go, go);
      } else this.applyDice(diceId);
    }
    if (trayId !== this.traySkin && this.floorMesh?.material.map && !trayReady(trayId)) {
      // 트레이도 그림을 다 받은 뒤에 바꾼다 (그 사이엔 지금 트레이 그대로)
      this.wantTray = trayId;
      const go = () => { if (this.wantTray === trayId && this.running) { this.applyTray(trayId); this.dirty = true; } };
      preloadTray(trayId).then(go, go);
    } else { this.wantTray = trayId; this.applyTray(trayId); }
  }

  applyDice(diceId) {
    this.dirty = true;
    {
      const p = dieMatParams(diceId);
      for (let v = 1; v <= 6; v++) {
        const old = this.faceMats[v];
        const url = dieImage(diceId, v);
        const draw = mode => drawDieFace(document.createElement('canvas'), v, diceId, mode);
        const face = mode => (url && !mode ? this.imageTex(url, () => draw(mode)) : this.canvasTex(draw(mode)));
        let m;
        if (p.toon) {
          m = new THREE.MeshToonMaterial({ map: face(''), gradientMap: this.toonRamp() });
        } else {
          m = new THREE.MeshStandardMaterial({ map: face(''), roughness: p.roughness, metalness: p.metalness });
          if (p.env) { m.envMap = this.envMap(); m.envMapIntensity = p.env; }
          if (p.emissive) m.emissive = new THREE.Color(p.emissive);
          if (p.glow) { m.emissive = new THREE.Color(0xFFFFFF); m.emissiveMap = face('glow'); m.emissiveIntensity = p.glow; }
          if (p.bump) { m.bumpMap = face('bump'); m.bumpScale = p.bump; }
          if (p.selfGlow) { m.emissive = new THREE.Color(0xFFFFFF); m.emissiveMap = m.map; m.emissiveIntensity = p.selfGlow; }
          // 발광 지도 그림 (드래곤 · 용암): 받기 전엔 빛 없음(검정)으로 둔다
          if (p.glowImage) { m.emissive = new THREE.Color(p.glowColor ?? 0xFFFFFF); m.emissiveMap = this.imageTex(dieGlowImage(diceId, v), () => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 4); return c; }); m.emissiveIntensity = p.glowImage; }
          m.userData.glowBase = m.emissiveIntensity;
        }
        if (p.cutout) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }        // 구멍 뚫린 금속 골조: 반대편 면이 비쳐 보인다
        if (p.clear) { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; }   // 투명: 반대편 눈까지 비친다
        m.userData.baseTransparent = !!p.clear;
        this.faceMats[v] = m;
        if (this.ghostMats) this.ghostMats[v] = null;    // 스킨이 바뀌면 봉인용 반투명 재질도 새로
        if (old) { this.drop(old.map); if (old.emissiveMap !== old.map) this.drop(old.emissiveMap); this.drop(old.bumpMap); old.dispose(); }
      }
      this.outlineOn = !!p.outline;
      this.coreOn = !!p.core;
      this.twinkle = !!p.twinkle;
      this.dice?.forEach(d => { d.outline.visible = this.outlineOn; d.core.visible = this.coreOn; d.mesh.castShadow = !p.clear; });
      this.dice?.forEach(d => this.setFaces(d, d.faces));
    }
  }

  applyTray(trayId) {
    if (trayId !== this.traySkin) {
      this.traySkin = trayId;
      const st = trayStyle(trayId);
      const fm = this.floorMesh.material;
      this.drop(fm.map); this.drop(fm.emissiveMap);
      // 그림 트레이는 파일(바닥·발광 지도), 나머지는 캔버스로 그린 바닥
      const img = (kind, fb) => trayImage(trayId, kind) && this.imageTex(trayImage(trayId, kind), fb);
      fm.map = img('floor', () => drawTrayFloor(document.createElement('canvas'), trayId)) || this.canvasTex(drawTrayFloor(document.createElement('canvas'), trayId));
      if (trayGlows(trayId)) {
        fm.emissive = new THREE.Color(0xFFFFFF);
        fm.emissiveMap = img('glow') || this.canvasTex(drawTrayFloor(document.createElement('canvas'), trayId, true));
        fm.emissiveIntensity = st.glow;
      } else { fm.emissive = new THREE.Color(0); fm.emissiveMap = null; }
      fm.needsUpdate = true;
      this.woodMat.color.set(st.rail);
      this.trimMat.color.set(st.trim);
      this.trimMat.emissive = new THREE.Color(st.trimGlow ? st.trim : 0);
      this.trimMat.emissiveIntensity = st.trimGlow ? 0.9 : 1;
      this.trimMat.envMap = st.trimEnv ? this.envMap() : null;
      this.trimMat.needsUpdate = true;
      const bm = this.boxFloor.material;
      this.drop(bm.map);
      bm.map = img('box', () => drawBoxFloor(document.createElement('canvas'), trayId)) || this.canvasTex(drawBoxFloor(document.createElement('canvas'), trayId));
      bm.needsUpdate = true;
      // 그림 난간이 있는 스킨: 단색 나무 테두리 대신 울퉁불퉁한 그림 난간 · 모서리 기둥 · 보석 장식 (기본 트레이는 그대로)
      const frame = st.oval ? (this.fancyFrames ||= {})[trayId] ||= this.buildOvalFrame(trayId, st)
        : st.rails ? (this.fancyFrames ||= {})[trayId] ||= this.buildFancyFrame(trayId, st) : null;
      Object.values(this.fancyFrames || {}).forEach(f => { f.visible = f === frame; });
      this.plainFrame.forEach(o => { o.visible = !frame; });
      this.cornerR = st.oval || 0;
      this.floorMesh.visible = this.boxFloor.visible = !st.oval;   // 둥근 트레이는 모서리를 깎은 바닥 · 칸 바닥을 따로 쓴다 (같은 재질)
    }
  }

  // 그림 난간 (assets/trays/<스킨>/rail_top · rail_side [· rail_glow]).
  // 트레이 둘레 · 주사위 칸 둘레를 각각 "하나로 이어진 고리"로 만든다: 안쪽 경계를 따라 단면(안벽 · 둥근 윗면 · 바깥벽)을 쓸어서,
  // 난간 4개 · 모서리 기둥을 따로 붙이던 예전 방식의 끊김 · 겹침 · 무늬 이음매가 없다. 윗면 모양(파도 · 톱니 · 바위)도 한 바퀴에 꼭 맞게 반복한다.
  // 트레이 앞 난간 = 주사위 칸 뒷벽 (칸 고리의 뒤쪽은 그 안에 묻힌다). 두 고리가 만나는 옆면은 바깥 출렁임을 0 으로 줄여 한 면으로 이어 붙인다.
  // 물리 벽은 따로 있어서(평면) 겉모양만 바뀐다
  buildFancyFrame(id, st) {
    const S = st.rails, grp = new THREE.Group();
    this.railPts = [];
    const tex = (kind) => {
      const t = this.imageTex(trayImage(id, kind)).clone();
      t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      if (st.pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
      return t;
    };
    const mat = (kind, glow) => {
      const m = new THREE.MeshStandardMaterial({ map: tex(kind), roughness: S.rough ?? 0.5, metalness: S.metal ?? 0.2 });
      if (st.envRail !== false && st.trimEnv) { m.envMap = this.envMap(); m.envMapIntensity = 0.5; }
      if (glow && st.railGlow) { m.emissive = new THREE.Color(0xFFFFFF); m.emissiveMap = tex('rail_glow'); m.emissiveIntensity = st.glow ?? 0.8; }
      return m;
    };
    const mats = [mat('rail_side', true), mat('rail_top', false), mat('rail_side', true)];
    const r0 = S.round ?? (st.pixel || st.flags ? 0 : 0.2);
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // 트레이 고리: 앞 모서리는 각지게 (칸 고리와 맞붙는다), 앞쪽은 바깥으로 출렁이지 않게
    grp.add(this.railRing({ hw: TRAY_W / 2, hd: TRAY_D / 2, cz: 0, T: RAIL_T, H: 0.7, round: [r0, r0, 0, 0], S, id, mats,
      bulgeW: (x, z) => 1 - sm(TRAY_D / 2 - 1.1, TRAY_D / 2 - 0.15, z), amp: 1 }));
    // 주사위 칸 고리: 뒤 모서리는 각지게 (트레이 앞 난간 속에 묻힌다), 낮게 · 출렁임도 작게
    const bhw = BOX_OUT - BOX_T, bhd = BOX_D / 2;
    grp.add(this.railRing({ hw: bhw, hd: bhd, cz: BOX_Z, T: BOX_T, H: BOX_H, round: [0, 0, r0 * 0.8, r0 * 0.8], S, id, mats,
      bulgeW: (x, z) => sm(BOX_Z - bhd + 0.15, BOX_Z - bhd + 1.0, z), amp: 0.55, seat: (x, z) => z > BOX_Z - bhd + 0.02 }));
    this.addDecor(grp, id, st);
    this.scene.add(grp);
    return grp;
  }
  // 고리 하나: hw · hd 안쪽 반폭 · 반깊이, cz 가운데 z, T 두께, H 높이, round [뒤왼 · 뒤오 · 앞오 · 앞왼] 모서리 반지름 (0 = 각진 모서리)
  railRing({ hw, hd, cz, T, H, round, S, id, mats, bulgeW, amp, seat = () => true }) {
    const step = 0.04, pts = [];
    // 안쪽 경계 위의 점 + 바깥 방향 (각진 모서리는 두 방향의 합 = 비스듬히 잘린 모서리)
    const corners = [[-1, -1, round[0]], [1, -1, round[1]], [1, 1, round[2]], [-1, 1, round[3]]];
    const line = (ax, az, bx, bz, nx, nz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)); for (let i = 1; i < n; i++) pts.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, nx, nz }); };
    const cornerPts = k => {
      const [sx, sz, r] = corners[k], a0 = Math.atan2(k === 0 ? 0 : k === 1 ? -1 : k === 2 ? 0 : 1, k === 0 ? -1 : k === 1 ? 0 : k === 2 ? 1 : 0);
      if (!r) { pts.push({ x: sx * hw, z: cz + sz * hd, nx: sx, nz: sz }); return; }
      const ox = sx * (hw - r), oz = cz + sz * (hd - r), n = Math.max(3, Math.ceil(r * Math.PI / 2 / step * 2));
      for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * i / n; pts.push({ x: ox + Math.cos(a) * r, z: oz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) }); }
    };
    // 뒤왼 → 뒤 변 → 뒤오 → 오른쪽 변 → 앞오 → 앞 변 → 앞왼 → 왼쪽 변 순서로 한 바퀴
    const C = corners.map(([sx, sz, r]) => ({ sx, sz, r }));
    // 각 모서리의 시작 · 끝 (둥근 모서리는 호의 양 끝)
    const cs = k => { const { sx, sz, r } = C[k]; return k % 2 === 0 ? [sx * hw, cz + sz * (hd - r)] : [sx * (hw - r), cz + sz * hd]; };
    const ce = k => { const { sx, sz, r } = C[k]; return k % 2 === 0 ? [sx * (hw - r), cz + sz * hd] : [sx * hw, cz + sz * (hd - r)]; };
    const nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]];       // 모서리 k 다음 변의 바깥 방향 (뒤 · 오른쪽 · 앞 · 왼쪽)
    for (let k = 0; k < 4; k++) {
      cornerPts(k);
      const [ax, az] = ce(k), [bx, bz] = cs((k + 1) % 4);
      line(ax, az, bx, bz, nrm[k][0], nrm[k][1]);
    }
    // 가운데 선 길이로 무늬 좌표 · 한 바퀴 길이
    let s = 0;
    pts.forEach((p, i) => { if (i) { const q = pts[i - 1]; s += Math.hypot(p.x + p.nx * T / 2 - q.x - q.nx * T / 2, p.z + p.nz * T / 2 - q.z - q.nz * T / 2); } p.s = s; });
    const P = s + Math.hypot(pts[0].x + pts[0].nx * T / 2 - pts.at(-1).x - pts.at(-1).nx * T / 2, pts[0].z + pts[0].nz * T / 2 - pts.at(-1).z - pts.at(-1).nz * T / 2);
    pts.push({ ...pts[0], s: P });
    // 윗면 높이: 한 바퀴(θ 0 → 2π)에 정수 번 반복하는 물결이라 이음매가 없다
    const seed = id.length * 7.3, TAU2 = Math.PI * 2;
    const m = f => Math.max(1, Math.round(f * P / TAU2));
    const a = (S.amp || 0) * amp, f = S.freq || 2;
    const bump = th => {
      if (!S.fancy) return 0;
      if (S.shape === 'scallop') { const k = Math.max(1, Math.round(f * P / Math.PI)); return a * Math.abs(Math.sin(k * th / 2)); }
      if (S.shape === 'jag') { const k = Math.max(1, Math.round(f * P / Math.PI)), q = (k * th / TAU2) % 1; return a * (q < 0.5 ? q * 2 : (1 - q) * 2) + a * 0.3 * Math.sin(m(7.1) * th + seed); }
      if (S.shape === 'rock') return a * (0.5 + 0.5 * Math.sin(m(f) * th + seed) * Math.sin(m(f * 2.3) * th + 1.7) + 0.25 * Math.sin(m(9.3) * th));
      return a * (0.5 + 0.5 * Math.sin(m(f) * th + seed));
    };
    // 단면 [안쪽에서 바깥으로 거리, 높이] — 0 안벽 · 1 윗면(둥근 모서리 포함) · 2 바깥벽
    const e = Math.min(0.08, T * 0.2), c = 0.29;
    const prof = [
      [[0, 0], [0, H * 0.5], [0, H - e]],
      [[0, H - e], [e * c, H - e * c], [e, H], [T / 2, H], [T - e, H], [T - e * c, H - e * c], [T, H - e]],
      [[T, H - e], [T, H * 0.5], [T, 0]],
    ];
    const kTop = Math.max(1, Math.round(P / (T * 16))) / P, kSide = Math.max(1, Math.round(P / (H * 8))) / P;
    const pos = [], uv = [], idx = [], geo = new THREE.BufferGeometry();
    const bulge = S.bulge ?? 1.2;
    let base = 0;
    prof.forEach((pr, gi) => {
      const start = idx.length;
      for (const p of pts) {
        const b = bump(p.s / P * TAU2), w = bulgeW(p.x, p.z);
        for (let j = 0; j < pr.length; j++) {
          const [d0, y0] = pr[j];
          const d = d0 + bulge * b * w * (d0 / T), y = y0 + b * (y0 / H);
          pos.push(p.x + p.nx * d, y, p.z + p.nz * d);
          uv.push(p.s * (gi === 1 ? kTop : kSide), gi === 1 ? 1 - d0 / T : y0 / H);
        }
        if (gi === 1 && seat(p.x, p.z)) this.railPts.push({ x: p.x + p.nx * T / 2, z: p.z + p.nz * T / 2, y: H + b, nx: p.nx, nz: p.nz });
      }
      const n = pr.length;
      for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < n - 1; j++) {
        const A = base + i * n + j, B = A + n, Cc = B + 1, D = A + 1;
        idx.push(A, D, B, B, D, Cc);
      }
      geo.addGroup(start, idx.length - start, gi);
      base += pts.length * n;
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    // 감는 방향 확인: 윗면 삼각형이 위(+y)를 보게
    {
      const g1 = geo.groups[1], ia = idx[g1.start], ib = idx[g1.start + 1], ic = idx[g1.start + 2];
      const v = k => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      const nn = new THREE.Vector3().crossVectors(v(ib).sub(v(ia)), v(ic).sub(v(ia)));
      if (nn.y < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  // 둥근 포커 테이블 (카지노): 모서리를 깎은 펠트 바닥 + 둘레를 감싸는 볼록한 검은 가죽 쿠션, 앞쪽 주사위 칸도 쿠션으로 두른다
  buildOvalFrame(id, st) {
    const R = st.oval, grp = new THREE.Group();
    const rr = (hw, hd, r) => {        // 가운데 기준 둥근 사각형 Shape
      const s = new THREE.Shape();
      s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0);
      s.lineTo(hw, hd - r); s.absarc(hw - r, hd - r, r, 0, Math.PI / 2);
      s.lineTo(-hw + r, hd); s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI);
      s.lineTo(-hw, -hd + r); s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5);
      return s;
    };
    // 바닥은 둘레 관의 한가운데까지 넓혀 깐다 (예전엔 벽 선까지만 깔아 관과 바닥 사이로 배경이 비쳤다). 그림 좌표는 원래 크기 기준 그대로
    const FO = (st.tube?.rad || 0.3) - 0.02;
    const fg = new THREE.ShapeGeometry(rr(TRAY_W / 2 + FO, TRAY_D / 2 + FO, R + FO), 24);
    const p = fg.attributes.position, uv = fg.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / TRAY_W + 0.5, p.getY(i) / TRAY_D + 0.5);
    const floor = new THREE.Mesh(fg, this.floorMesh.material);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    grp.add(floor);
    const TB = st.tube || {};
    const tex = this.imageTex(trayImage(id, TB.tex || 'cushion')).clone();
    tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const leather = new THREE.MeshStandardMaterial({ map: tex, roughness: TB.rough ?? 0.42, metalness: TB.metal ?? 0.05, envMap: this.envMap(), envMapIntensity: 0.55 });
    if (TB.glow && st.railGlow) {
      const gt = this.imageTex(trayImage(id, 'rail_glow')).clone(); gt.wrapS = THREE.RepeatWrapping; gt.needsUpdate = true;
      leather.emissive = new THREE.Color(0xFFFFFF); leather.emissiveMap = gt; leather.emissiveIntensity = TB.glow;
    }
    // 둥근 사각형 둘레를 따라 가는 관 (단면은 위아래로 조금 납작한 원)
    this.railPts = [];
    const cushion = (hw, hd, r, rad, h, rep, cz = 0) => {
      const pts = rr(hw, hd, r).getSpacedPoints(220).map(q => new THREE.Vector3(q.x, 0, -q.y));
      for (const q of pts) this.railPts.push({ x: q.x, z: q.z + cz, y: h + rad * 0.85 });
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 440, rad, 18, true);
      // 그림 난간 질감(가로 8 : 세로 1)을 관에 감을 때는 둘레 비율에 맞춰 반복 수를 정한다 (예전엔 길이 방향으로 5배쯤 눌려 세로 줄무늬처럼 보였다)
      if (TB.tex && TB.tex !== 'cushion') { const len = g.parameters.path.getLength(); rep = Math.max(2, Math.round(len / (2 * Math.PI * rad * 8 * 0.75))); }
      const m = new THREE.Mesh(g, leather.clone());
      m.material.map = tex.clone(); m.material.map.repeat.set(rep, 1); m.material.map.needsUpdate = true;
      if (m.material.emissiveMap) { m.material.emissiveMap = m.material.emissiveMap.clone(); m.material.emissiveMap.repeat.set(rep, 1); m.material.emissiveMap.needsUpdate = true; }
      m.scale.y = 0.85; m.position.y = h; m.castShadow = m.receiveShadow = true;
      return m;
    };
    const CR = TB.rad || 0.3, off = CR - 0.02;   // 쿠션 안쪽 면이 벽(바닥 가장자리)에 닿게
    grp.add(cushion(TRAY_W / 2 + off, TRAY_D / 2 + off, R + off, CR, CR * 0.95, TB.rep || 22));
    if (st.nest) this.nestTwigs(grp, rr(TRAY_W / 2 + off, TRAY_D / 2 + off, R + off), 0, CR, CR * 0.95, tex, 3);
    // 앞쪽 주사위 칸: 얇은 쿠션 고리
    const bz0 = TRAY_D / 2 + 2 * CR, bz1 = BOX_Z + BOX_D / 2 + BOX_T, bc = 0.17;
    const ring = cushion(BOX_OUT - bc, (bz1 - bz0) / 2 - bc, 0.55, bc, bc * 0.95, 18, (bz0 + bz1) / 2);
    if (st.nest) this.nestTwigs(grp, rr(BOX_OUT - bc, (bz1 - bz0) / 2 - bc, 0.55), (bz0 + bz1) / 2, bc, bc * 0.95, tex, 2);
    ring.position.z = (bz0 + bz1) / 2;
    grp.add(ring);
    // 주사위 칸 바닥도 쿠션 고리 안쪽에 맞춘 둥근 바닥 (네모 바닥이 쿠션 밖으로 삐져나오지 않게)
    const bhw = BOX_OUT - bc, bhd = (bz1 - bz0) / 2 - bc;   // 고리 한가운데까지 (틈이 안 보이게)
    const bg = new THREE.ShapeGeometry(rr(bhw, bhd, 0.42), 16), bp = bg.attributes.position, buv = bg.attributes.uv;
    for (let i = 0; i < bp.count; i++) buv.setXY(i, bp.getX(i) / (2 * bhw) + 0.5, bp.getY(i) / (2 * bhd) + 0.5);
    const bf = new THREE.Mesh(bg, this.boxFloor.material);
    bf.rotation.x = -Math.PI / 2; bf.position.set(0, 0.002, (bz0 + bz1) / 2); bf.receiveShadow = true;
    grp.add(bf);
    this.addDecor(grp, id, st);
    if (st.nest) this.nestProps(grp);
    this.scene.add(grp);
    return grp;
  }
  // 드래곤 둥지: 굵은 가지 둘레를 가는 가지 여러 줄이 꼬며 감는다 (엮어 쌓은 둥지처럼). n: 감는 가지 수
  nestTwigs(grp, shape, cz, rad, h, tex, n) {
    const path = shape.getSpacedPoints(400).map(q => new THREE.Vector2(q.x, -q.y + cz));
    const L = path.reduce((a, p, i) => a + (i ? p.distanceTo(path[i - 1]) : 0), 0);
    const cols = [0xFFF0D8, 0xE8C8A0, 0xFFFFFF];
    for (let k = 0; k < n; k++) {
      const turns = Math.round(L / (1.6 + k * 0.35)), ph = k * 2.1, rr = rad * (0.92 + 0.08 * k), tr = rad * (0.2 + 0.05 * ((k + 1) % 2));
      const pts = [];
      let s = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const p = path[i], q = path[i + 1];
        if (i) s += p.distanceTo(path[i - 1]);
        const tx = q.x - p.x, tz = q.y - p.y, tl = Math.hypot(tx, tz) || 1;
        const nx = tz / tl, nz = -tx / tl;                       // 바깥쪽 (둥근 사각형은 시계 반대 방향)
        const a = ph + (s / L) * turns * Math.PI * 2;
        // 아래쪽 반 바퀴(바닥 속)는 안 보이니 위쪽으로 치우쳐 감는다
        const c = Math.cos(a), sn = Math.sin(a) * 0.5 + 0.5;
        pts.push(new THREE.Vector3(p.x + nx * c * rr, h * 0.85 + sn * rr * 0.95, p.y + nz * c * rr));
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 900, tr, 7, true);
      const t = tex.clone(); t.repeat.set(Math.round(L / 0.9), 1); t.needsUpdate = true;
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, color: cols[k % 3], roughness: 0.85, metalness: 0 }));
      m.castShadow = m.receiveShadow = true;
      grp.add(m);
    }
  }
  // 드래곤 둥지 소품: 뒤쪽 난간에 반짝이는 용의 알 무리 · 금화 더미 (그림판이 아닌 진짜 3D — 빛 · 그림자를 받는다)
  nestProps(grp) {
    const eggTex = (hue) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, hue[0]); gr.addColorStop(0.55, hue[1]); gr.addColorStop(1, hue[2]);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      // 비늘 무늬
      g.strokeStyle = 'rgba(255, 220, 140, .35)'; g.lineWidth = 2;
      for (let y = 0; y < 256; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < 256; x += 18) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
      return t;
    };
    const eggMats = [['#FFD27A', '#B8261A', '#3A0608'], ['#FFF0B0', '#C8861E', '#4A2A08'], ['#D8C8FF', '#5A2A8A', '#14081E']].map(h => {
      const t = eggTex(h);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.28, metalness: 0.25, envMap: this.envMap(), envMapIntensity: 0.9, emissive: 0xFF5A1A, emissiveMap: t, emissiveIntensity: 0.06 });
    });
    const gold = new THREE.MeshStandardMaterial({ color: 0xFFC83D, roughness: 0.22, metalness: 0.95, envMap: this.envMap(), envMapIntensity: 1.2, emissive: 0x5A3A00, emissiveIntensity: 0.25 });
    const egg = new THREE.SphereGeometry(1, 24, 18), coin = new THREE.CylinderGeometry(1, 1, 0.16, 18);
    const seat = (x, z) => {
      let best = null, bd = Infinity;
      for (const q of this.railPts || []) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
      return best || { x, z, y: 0.6 };
    };
    const put = (mesh, x, z, dy = 0) => { const q = seat(x, z); mesh.position.set(q.x + (x - q.x) * 0.0, q.y + dy, q.z); mesh.castShadow = true; grp.add(mesh); return mesh; };
    const rnd = (k => () => (k = (k * 16807) % 2147483647) / 2147483647)(7);
    // 알 무리 (뒤 왼쪽 · 뒤 오른쪽)
    for (const [cx, mi] of [[-2.3, 0], [2.4, 1]]) {
      [[0, 0, 0.27], [0.42, 0.08, 0.21], [-0.38, 0.06, 0.2]].forEach(([dx, dz, r], j) => {
        const m = new THREE.Mesh(egg, eggMats[(mi + j) % 3]);
        m.scale.set(r, r * 1.35, r);
        m.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.6);
        put(m, cx + dx, -4 + dz, r * 0.95);
      });
      // 알 둘레 금화
      for (let k = 0; k < 7; k++) {
        const m = new THREE.Mesh(coin, gold), r = 0.075 + rnd() * 0.02;
        m.scale.set(r, 1, r); m.rotation.set((rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2);
        put(m, cx + (rnd() - 0.5) * 1.1, -4 + (rnd() - 0.5) * 0.3, 0.02 + rnd() * 0.05);
      }
    }
    // 가운데 금화 더미 (낮게 쌓인)
    for (let k = 0; k < 16; k++) {
      const m = new THREE.Mesh(coin, gold), r = 0.08 + rnd() * 0.025, u = rnd() - 0.5;
      m.scale.set(r, 1, r); m.rotation.set((rnd() - 0.5) * 1.1, rnd() * 6, (rnd() - 0.5) * 1.1);
      put(m, u * 1.5, -4, 0.02 + (0.5 - Math.abs(u)) * 0.12 + rnd() * 0.03);
    }
  }
  // 테두리 장식 그림 (skins.js TRAY_DECOR): 배치도 자리에서 가장 가까운 난간 윗면에 "올려 앉힌다" (높이도 그 자리 난간 높이).
  // 예전엔 빛을 받지 않는 스프라이트를 난간 위에 덮어 그려서 스티커처럼 떠 보였다 — 이제 조명 · 그림자를 받고, 난간 · 바닥에 그림자를 드리우며,
  // 밑동에 옅은 접지 그림자가 깔린다. 그림판은 카메라를 향해 세우고(faceDecor), 그림의 투명한 아래 여백은 잘라서 밑동이 난간에 닿게 한다.
  addDecor(grp, id, st) {
    const list = TRAY_DECOR[id];
    if (!list) return;
    const wx = px => (px - 160) / 120 - TRAY_W / 2;
    const wz = py => (py >= 1000 ? TRAY_D / 2 + RAIL_T + (py - 1050) / 120 : (py - 160) / 120 - TRAY_D / 2);
    const seatAt = (x, z) => {
      let best = null, bd = Infinity;
      for (const q of this.railPts || []) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
      return best || { x, z, y: 0.7 };
    };
    const posts = [];
    for (const [n, asp, px, py, front] of list) {
      if (n === 'flagpole') continue;
      const q = seatAt(wx(px), wz(py));
      if (n === 'flag_cloth') { const f = this.makeFlag(id, q.x, q.z, front, q.y); grp.add(f); posts.push(f); continue; }
      const h = front ? 0.5 : (n.match(/point|spike|horn|icicle|fissure|crystal/) ? 0.95 : 0.8);
      const tex = this.imageTex(trayImage(id, `decor_${n}`)); tex.colorSpace = THREE.SRGBColorSpace;
      if (st.pixel) { tex.magFilter = THREE.NearestFilter; }
      const box = alphaBox(tex.image);       // 그림 속 실제 그림 영역 (투명 여백 빼고)
      const geo = new THREE.PlaneGeometry(1, 1);
      const uvA = geo.attributes.uv, pA = geo.attributes.position;
      for (let i = 0; i < uvA.count; i++) {
        const u = uvA.getX(i), v = uvA.getY(i);
        uvA.setXY(i, box.x0 + u * (box.x1 - box.x0), box.y0 + v * (box.y1 - box.y0));
        pA.setXY(i, u - 0.5, v);
      }
      const bw = (box.x1 - box.x0) * asp / (box.y1 - box.y0);     // 잘라 낸 그림의 가로/세로 비
      const hh = h * (box.y1 - box.y0) * 0.92;                     // 예전 크기와 비슷하게 (예전엔 그림판 전체가 h, 그 안의 그림은 더 작았다)
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
        emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.18 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.scale.set(hh * bw, hh, 1);
      mesh.userData.h = hh;
      mesh.position.set(q.x, q.y - 0.03, q.z);
      mesh.castShadow = true;
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
      mesh.renderOrder = 2;
      (this.decorMeshes ||= []).push(mesh);
      grp.add(mesh);
      // 밑동 접지 그림자 (난간 윗면에 납작하게)
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.blobTex(), transparent: true, depthWrite: false, opacity: 0.55, color: 0x000000 }));
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(hh * bw * 0.95, Math.min(0.5, hh * bw * 0.45), 1);
      blob.position.set(q.x, q.y + 0.006, q.z);
      blob.renderOrder = 1;
      grp.add(blob);
    }
    if (st.ropes) this.ringRopes(grp, posts, seatAt);
    this.faceDecor();
  }
  // 해적선 갑판: 권투 링처럼 양옆 · 뒤 난간 위로 굵은 밧줄 두 가닥을 길게 두른다.
  // 뒤 두 모서리는 깃대, 앞 두 모서리는 짧은 나무 기둥에 묶는다 (앞쪽은 트여 있어 주사위가 가리지 않는다)
  ringRopes(grp, flagGroups, seatAt) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#B8915A'; g.fillRect(0, 0, 128, 32);
    for (let i = -32; i < 160; i += 16) {          // 꼬인 밧줄 결 (비스듬한 줄)
      g.fillStyle = '#8A6634'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 + 32, 32); g.lineTo(i + 32, 32); g.fill();
      g.fillStyle = 'rgba(255, 236, 190, .35)'; g.fillRect(i + 10, 0, 2, 32);
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ color: 0x3A2618, roughness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xC8A060, roughness: 0.35, metalness: 0.7 });
    // 앞 모서리 기둥
    const fz = TRAY_D / 2 + RAIL_T / 2, fx = TRAY_W / 2 + RAIL_T / 2, PH = 0.62;
    const front = [-1, 1].map(sx => {
      const q = seatAt(sx * fx, fz), p = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, PH, 10), wood); pole.position.y = PH / 2; pole.castShadow = true; p.add(pole);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), brass); knob.position.y = PH; p.add(knob);
      p.position.set(q.x, q.y - 0.04, q.z); p.rotation.x = -0.5;
      grp.add(p);
      return p;
    });
    // 기둥 위 높이 h 지점 (기울어진 깃대 · 기둥을 따라)
    const at = (post, h) => { post.updateMatrix(); return new THREE.Vector3(0, h, 0).applyMatrix4(post.matrix); };
    const [bl, br] = flagGroups.length >= 2 ? [...flagGroups].sort((a, b) => a.position.x - b.position.x) : [];
    if (!bl) return;
    const [fl, fr] = front;
    const ropeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
    const rope = (a, b, sag) => {
      const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const len = curve.getLength();
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(len * 12)), 0.07, 10, false), ropeMat.clone());
      m.material.map = tex.clone(); m.material.map.repeat.set(Math.round(len * 3.5), 1); m.material.map.needsUpdate = true;
      m.castShadow = true;
      grp.add(m);
    };
    for (const [hb, hf] of [[0.3, 0.26], [0.55, 0.5]]) {
      rope(at(bl, hb), at(fl, hf), 0.05);        // 왼쪽
      rope(at(br, hb), at(fr, hf), 0.05);        // 오른쪽
      rope(at(bl, hb), at(br, hb), 0.1);         // 뒤
    }
    // 묶은 자리 매듭 (작은 공)
    for (const post of [bl, br, fl, fr]) for (const h of post === fl || post === fr ? [0.26, 0.5] : [0.3, 0.55]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), ropeMat); k.position.copy(at(post, h)); grp.add(k);
    }
  }
  // 장식 그림판: 카메라 쪽으로 돌리되 똑바로 서지도 · 완전히 눕지도 않게 40° 만 뒤로 기울인다
  // (카메라를 똑바로 보면 판이 난간 위에 납작하게 깔려 그림자 · 입체감이 없고, 똑바로 서면 위에서 내려다봐 짧아 보인다 — 짧아지는 만큼 세로로 늘린다)
  faceDecor() {
    if (!this.camera) return;
    const c = this.camera.position, TILT = 0.7;
    for (const m of this.decorMeshes || []) {
      const dx = c.x - m.position.x, dz = c.z - m.position.z, dy = c.y - m.position.y;
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      m.rotation.set(-TILT, Math.atan2(dx, dz), 0, 'YXZ');
      m.scale.y = m.userData.h / Math.max(0.8, Math.cos(pitch - TILT)) * 0.9;
    }
  }
  blobTex() {
    if (this._blob) return this._blob;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this._blob = new THREE.CanvasTexture(c); this._blob.userData.cached = true;
    return this._blob;
  }
  makeFlag(id, x, z, front, top) {
    const g = new THREE.Group(), s = front ? 0.55 : 1;
    const ph = 0.95 * s;
    const wood = new THREE.MeshStandardMaterial({ color: 0x3A2618, roughness: 0.7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s + 0.01, 0.045 * s + 0.01, ph, 10), wood);
    pole.position.y = ph / 2; pole.castShadow = true; g.add(pole);
    // 깃대 밑동: 난간에 박아 넣은 쇠 고리 (막대가 그냥 꽂혀 떠 보이지 않게)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * s + 0.02, 0.09 * s + 0.025, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x2A2420, roughness: 0.45, metalness: 0.7 }));
    collar.position.y = 0.02; collar.castShadow = true; g.add(collar);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s + 0.02, 12, 10), new THREE.MeshStandardMaterial({ color: 0xC8A060, roughness: 0.35, metalness: 0.7 }));
    knob.position.y = ph; g.add(knob);
    const fw = 1.1 * s, fh = 0.75 * s, dir = (x < 0 ? -1 : 1) * (front ? 1 : -1);   // 뒤 깃발은 안쪽(트레이 위 하늘)으로, 앞 깃발은 바깥쪽으로 휘날린다
    const geo = new THREE.PlaneGeometry(fw, fh, 14, 6);
    geo.translate(fw / 2, 0, 0);
    const tex = this.imageTex(trayImage(id, 'decor_flag_cloth')); tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.9 }));
    cloth.castShadow = true;
    cloth.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    cloth.position.y = ph - fh / 2 - 0.04;
    cloth.scale.x = dir;
    cloth.userData.base = Float32Array.from(geo.attributes.position.array);
    cloth.userData.fw = fw; cloth.userData.seed = x * 1.7 + z;
    g.add(cloth);
    g.position.set(x, top - 0.04, z);
    g.rotation.z = (x < 0 ? 1 : -1) * (front ? 0.2 : 0.04);   // 깃대는 바깥쪽으로 살짝 (앞 깃발은 더)
    g.rotation.x = front ? -0.5 : -0.85;   // 카메라가 위에서 내려다봐서 똑바로 서면 납작해 보인다 — 뒤로 눕혀 깃발 면이 화면을 향하게
    (this.flags ||= []).push(cloth);
    return g;
  }
  // 깃발 천 펄럭임: 깃대에서 멀수록 크게 출렁이는 물결 (초당 30번만 다시 그린다)
  flagTick(t) {
    for (const c of this.flags || []) {
      if (!c.parent?.parent?.visible) continue;
      const p = c.geometry.attributes.position, b = c.userData.base, fw = c.userData.fw, sd = c.userData.seed;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1], k = x / fw;
        p.setZ(i, Math.sin(x * 7 - t * 0.006 + sd) * 0.09 * k + Math.sin(x * 3.1 - t * 0.0037 + y * 4) * 0.05 * k);
        p.setY(i, y - k * k * 0.06 + Math.sin(t * 0.004 + x * 5) * 0.02 * k);
      }
      p.needsUpdate = true; c.geometry.computeVertexNormals();
    }
  }
  // 난간 장식 보석: 스킨 색의 팔면체(진주는 구), 빛나는 스킨은 스스로 빛난다
  frameGem(S, r) {
    const geo = S.gem === 'pearl' ? new THREE.SphereGeometry(r * 0.85, 16, 12) : new THREE.OctahedronGeometry(r, 0);
    const m = new THREE.MeshStandardMaterial({ color: S.gemColor, roughness: 0.2, metalness: S.gem === 'pearl' ? 0.1 : 0.4, envMap: this.envMap(), envMapIntensity: 1 });
    if (S.gemGlow) { m.emissive = new THREE.Color(S.gemColor); m.emissiveIntensity = 0.8; }
    const g = new THREE.Mesh(geo, m);
    if (S.gem !== 'pearl') g.scale.y = 1.35;
    g.castShadow = true;
    return g;
  }

  // 미리보기 창을 닫을 때 (WebGL 자원을 돌려준다)
  destroy() {
    this.running = false;
    this.resizeObs.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }

  // 컨테이너를 옮겨 붙일 때 (화면을 다시 그려도 캔버스는 재사용)
  attach(host) {
    if (this.host === host) return;
    this.resizeObs.unobserve(this.host);
    this.host = host;
    host.appendChild(this.renderer.domElement);
    // 크기는 ResizeObserver 가 레이아웃 뒤에 알려 준다 (여기서 바로 재면 innerHTML 직후라 강제 레이아웃이 생긴다)
    this.resizeObs.observe(host);
    this.dirty = true;
  }

  resize() {
    const w = this.host.clientWidth || 360;
    const h = this.host.clientHeight || 240;
    // 화면을 다시 그릴 때마다 붙여 넣으며 불린다 — 크기가 같으면 버퍼를 새로 잡지 않는다
    // (setSize 는 캔버스 크기를 다시 넣어 WebGL 버퍼를 비우고 새로 잡아서 폰에서 멈칫했다)
    if (w === this.lastW && h === this.lastH) { this.dirty = true; return; }
    this.lastW = w; this.lastH = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // 트레이 가로가 화면에 꽉 차도록 카메라 거리를 맞춘다
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const needW = (TRAY_W + 1.4) / 2 / Math.tan(hfov / 2);
    const needD = (SCENE_Z1 - SCENE_Z0 + 0.9) / 2 / Math.tan(vfov / 2);
    let dist = Math.max(needW, needD);
    const cz = (SCENE_Z0 + SCENE_Z1) / 2 + 0.25;   // 트레이 + 주사위 함 가운데 (가까운 함 쪽이 원근으로 더 아래로 내려가는 만큼)
    const place = () => {
      this.camera.position.set(0, dist * 0.93, cz - 0.35 + dist * 0.37);
      this.camera.lookAt(0, 0, cz);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
    };
    place();
    // 앞쪽 주사위 함은 카메라에 가까워서(원근으로 더 커 보인다) 좁은 화면에선 양 끝이 잘렸다.
    // 함 바닥 양 끝 · 난간 모서리가 화면 안에 들어올 때까지 조금씩 물러난다 (함 바깥 끝은 이제 난간 바깥 끝과 같은 선)
    const XE = BOX_OUT - 0.15, XR = BOX_OUT;
    // 모든 트레이가 같은 화면 맞춤 (장식이 있든 없든 주사위 · 굴리는 면이 같은 크기로 보이게). 뒤쪽 장식(깃발 · 왕관 · 뿔)이 들어갈 만큼 위쪽 여유를 늘 둔다
    const DECOR_TOP = 1.45;
    const corners = [[XE, 0, BOX_Z + BOX_D / 2], [XE, 0, BOX_Z - BOX_D / 2], [XR, DECOR_TOP, SCENE_Z0], [XR, 0.7, -SCENE_Z0]];
    const v = new THREE.Vector3();
    for (let k = 0; k < 40; k++) {
      const out = corners.some(([x, y, z]) => { v.set(x, y, z).project(this.camera); return Math.abs(v.x) > 0.985 || Math.abs(v.y) > 0.985; });
      if (!out) break;
      dist *= 1.025;
      place();
    }
    this.camBase = this.camera.position.clone();
    this.faceDecor();
    this.dirty = true;
  }

  slotX(i, n) {
    const gap = Math.min(1.75, (TRAY_W - 1.6) / Math.max(1, n - 1));
    return (i - (n - 1) / 2) * gap;
  }

  ensure(n) {
    while (this.dice.length < n) {
      const mesh = new THREE.Mesh(this.geo, STD_FACES.map(v => this.faceMats[v]));
      mesh.castShadow = !this.faceMats[1].userData.baseTransparent;
      // 만화풍 스킨의 굵은 외곽선 (뒷면만 그린 조금 큰 검은 상자)
      this.outlineMat ||= new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
      const outline = new THREE.Mesh(this.geo, this.outlineMat);
      outline.scale.setScalar(1.07);
      outline.visible = !!this.outlineOn;
      mesh.add(outline);
      // 오픈하츠 스킨의 속 기계장치 (어두운 금속 심)
      const core = new THREE.Mesh(this.geo, this.coreMat());
      core.scale.setScalar(0.58);
      core.visible = !!this.coreOn;
      mesh.add(core);
      // 얼음 껍질: 주사위의 자식이라 뒤집거나 튀어도 그대로 붙어 다닌다 (setFrozen)
      const ice = new THREE.Mesh(this.geo, this.iceMat());
      ice.scale.setScalar(1.1);
      ice.visible = false;
      ice.renderOrder = 2;
      mesh.add(ice);
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
      this.dice.push({ mesh, outline, core, ice, glow, ring, aura, auraI: 0, faces: STD_FACES.slice(), held: false, boxed: false, hop: null, value: 0, lift: 0, morph: null });
    }
    while (this.dice.length > n) {
      const d = this.dice.pop();
      this.scene.remove(d.mesh, d.glow, d.ring, d.aura);
    }
  }

  // 원정 「주사위 깎는 노인」: 주사위마다 6면의 눈 (list[i] = [원래 1의 면, 2의 면, … 6의 면] 에 새긴 눈, 없으면 보통 주사위)
  setCustom(list = null) {
    const next = list && list.some(Boolean) ? list.map(f => (f ? f.slice() : null)) : null;
    if (JSON.stringify(next) === JSON.stringify(this.custom || null)) return;
    this.custom = next;
    this.dice.forEach(d => { d.value = 0; });   // 다음 show() 에서 새 면으로 다시 입힌다
    this.dirty = true;
  }
  // i 번째 주사위의 면 배치: faceIdx 면(위)에 눈 v 가 오게. 깎은 주사위는 그 눈이 새겨진 원래 면을 위로 보내고 면마다 새긴 눈을 입힌다
  arr(i, faceIdx, v) {
    const cf = this.custom?.[i];
    if (!cf) return remap(faceIdx, v);
    const f = cf.indexOf(v);
    if (f < 0) return remap(faceIdx, v);          // 새긴 눈에 없는 눈(뒤집기 · 조정 결과): 그 순간만 보통 주사위로
    return remap(faceIdx, f + 1).map(x => cf[x - 1]);
  }

  setFaces(d, faces) {
    d.faces = faces;
    d.mesh.material = faces.map(v => this.faceMats[v]);
  }

  // 굴리지 않고 정렬된 상태로 보여준다 (새 턴, 이어하기, 화면 갱신)
  show(values, held = []) {
    if (this.anim) return;
    this.dirty = true;
    this.shown = [values.slice(), held.slice()];
    const n = values.length;
    this.ensure(n);
    this.dice.forEach((d, i) => {
      d.held = !!held[i];
      if (this.live?.ids.has(i)) return;   // 흔드는 중인 주사위는 물리가 움직인다
      // 새 차례(아직 안 굴림 · 값 0)인데 앞서 굴린 눈이 있으면: 눈은 그대로 두고 자리로만 돌아온다
      // (예전엔 1 · 2 · 3 · 4 · 5 자리표시 눈으로 갑자기 바뀌어 부자연스러웠다)
      const keep = !values[i] && d.value && !d.blank;
      if (d.boxed && (!d.held || !values[i])) {
        // 고정을 풀었거나 새 차례: 함에서 트레이로 돌아온다
        if ((values[i] && d.value === values[i]) || keep) this.hop(d, false);
        else { d.boxed = false; d.hop = null; }
      }
      // 고정하면 바로 주사위 함으로 (다른 기기에서 고정한 것도)
      if (d.held && !d.boxed && values[i] && d.value === values[i] && !d.blank && !this.live) this.hop(d, true);
      if (d.morph) return;          // 보스 스킬 연출 중인 주사위는 연출이 끝나면 눈을 바꾼다
      if (keep) {
        if (!d.hop) { d.mesh.position.x = this.slotX(i, n); d.mesh.position.z = this.homeZ(d); }
        return;
      }
      // 눈이 그대로면 굴러서 멈춘 자세를 유지한다 (다시 그릴 때 튀지 않게)
      if (values[i] && d.value === values[i] && !d.blank) {
        d.mesh.position.x = this.slotX(i, n);
        if (!d.hop) d.mesh.position.z = this.homeZ(d);
        return;
      }
      if (values[i] && d.value && d.value !== values[i] && !d.blank) d.lift = 1.4;  // 뒤집기·조정: 톡 튀었다 떨어진다
      const v = values[i] || ((i % 6) + 1);
      d.value = values[i];
      d.boxed = !!(d.held && values[i]);   // 처음부터 고정된 주사위(이어하기·다시 그리기)는 함 안에 둔다
      d.hop = null;
      this.setFaces(d, this.arr(i, 2, v));
      d.mesh.quaternion.identity();
      d.mesh.position.set(this.slotX(i, n), HALF, this.homeZ(d));
      d.mesh.material.forEach(m => (m.transparent = !!m.userData.baseTransparent));
      d.blank = !values[i];
    });
    this.refreshGlow();
  }

  setHeld(held) {
    this.dirty = true;
    this.dice.forEach((d, i) => {
      d.held = !!held[i];
      if (d.boxed && !d.held) this.hop(d, false);   // 함 안의 주사위를 풀면 트레이로 폴짝
      else if (d.held && !d.boxed && !d.blank && !this.live) this.hop(d, true);   // 고정하면 바로 함으로
    });
    this.refreshGlow();
  }

  // 마왕의 봉인: 봉인된 주사위는 굴리지도 함으로 옮기지도 않고 트레이 제자리에 둔다.
  // 다른 주사위가 구르는 동안은 반투명해져(물리에도 넣지 않는다) 장애물이 되지 않고 그대로 통과한다
  setSealed(idx = []) {
    this.sealed = new Set(idx);
    this.dirty = true;
  }
  // 세머리 용의 얼음: 언 주사위는 얼음 껍질을 입는다
  setFrozen(idx = []) {
    const s = new Set(idx);
    if (this.frozen && s.size === this.frozen.size && [...s].every(i => this.frozen.has(i))) return;
    this.frozen = s;
    this.dirty = true;
  }
  // 원정 특수 주사위: 주사위마다 색 테두리 껍질을 입힌다 (marks[i] = { kind, color } 또는 null). 부르지 않으면 아무것도 바뀌지 않는다
  // kind 'twin' 은 구르는 동안 반투명 잔상이 따라오고, 'heavy' 는 조금 둔하게 구른다. 'heavy' 가 바닥 · 벽에 부딪히면 onMarkHit(v, i)
  setMarks(marks = null) {
    this.marks = marks && marks.some(Boolean) ? marks : null;
    this.dirty = true;
  }
  markMat(kind, color) {
    this.markMats ||= {};
    const key = `${kind}:${color}`;
    if (this.markMats[key]) return this.markMats[key];
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    // 가운데는 비우고 가장자리만 그 색 띠 (어두운 선으로 감싸 상아색 · 흰 스킨 위에서도 또렷하게), 안쪽으로 옅게 번진다
    const B = 9;
    g.fillStyle = 'rgba(26,16,48,0.85)'; g.fillRect(0, 0, S, S);
    g.clearRect(B + 3, B + 3, S - (B + 3) * 2, S - (B + 3) * 2);
    g.fillStyle = color; g.fillRect(1, 1, S - 2, B);  g.fillRect(1, S - 1 - B, S - 2, B); g.fillRect(1, 1, B, S - 2); g.fillRect(S - 1 - B, 1, B, S - 2);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(2, 2, S - 4, 2); g.fillRect(2, 2, 2, S - 4);       // 왼쪽 위 빛
    for (let k = 0; k < 8; k++) { g.strokeStyle = color; g.globalAlpha = 0.28 * (1 - k / 8); g.lineWidth = 2; g.strokeRect(B + 4 + k * 2, B + 4 + k * 2, S - (B + 4 + k * 2) * 2, S - (B + 4 + k * 2) * 2); }
    g.globalAlpha = 1;
    g.fillStyle = '#FFFFFF';
    if (kind === 'gold') for (const [x, y] of [[6, 6], [122, 6], [6, 122], [122, 122]]) { g.fillRect(x - 1, y - 7, 3, 15); g.fillRect(x - 7, y - 1, 15, 3); }   // 모서리 반짝
    if (kind === 'heavy') { g.fillStyle = '#3A4050'; for (const [x, y] of [[5, 5], [119, 5], [5, 119], [119, 119]]) g.fillRect(x, y, 5, 5); }      // 리벳
    if (kind === 'stair') { g.fillStyle = '#0F7A5C'; for (let k = 0; k < 4; k++) g.fillRect(S - B - 1, S - B - 1 - k * 7, -k * 7 - 7, 4); }       // 계단 무늬
    const t = this.canvasTex(c);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    return (this.markMats[key] = m);
  }
  ghostMat(v) {
    this.ghostMats ||= {};
    return (this.ghostMats[v] ||= Object.assign(this.faceMats[v].clone(), { transparent: true, opacity: 0.28, depthWrite: false }));
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
  // 윗면 한가운데 (봉인 문양처럼 주사위 윗면에 올리는 표시용). 주사위 몸통 가운데보다 반 칸 위
  topPos(i) {
    const d = this.dice[i];
    if (!d) return this.screenPos(i);
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = d.mesh.position.clone().add(new THREE.Vector3(0, HALF * d.mesh.scale.y, 0)).project(this.camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  hitIndex(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    // 주사위에 붙은 얼음 껍질 등 자식 메시에 맞아도 그 주사위로 친다 (예전엔 -1 이 돼 잡기가 안 됐다)
    const hit = this.raycaster.intersectObjects(this.dice.map(d => d.mesh), true)[0];
    if (!hit) return -1;
    return this.dice.findIndex(d => { for (let o = hit.object; o; o = o.parent) if (o === d.mesh) return true; return false; });
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
      d.aura.material.color.set(kind === 'burn' ? 0xFF5A1F : kind === 'lucky' ? 0x3EE6B4 : MORPH_COLOR[kind] ?? 0x9A5BFF);
      d.auraI = 1;
    });
  }

  // 못 고르는 주사위를 누르면 도리도리 떤다
  nope(i) {
    const d = this.dice[i];
    if (!d) return;
    d.wobble = 1;
    this.dirty = true;
  }

  // 전쟁의 북: 모든 주사위가 쿵 하고 튄다
  quake() {
    this.dirty = true;
    this.dice.forEach((d, i) => { d.lift = Math.max(d.lift, 0.9 + (i % 2) * 0.35); d.wobble = 1; });
  }

  // values: 엔진이 정한 굴림 결과, rolling: 이번에 굴리는 주사위 여부
  roll(values, rolling, speed = 1) {
    const baseSpeed = speed;
    speed *= 1.2;                  // 굴러가는 모습 1.2배속
    const n = values.length;
    this.ensure(n);
    const { world, dieMat } = makeWorld(6.0, 0.08, this.cornerR || 0);

    const bodies = [];
    let boxing = false;   // 고정한 주사위를 함으로 옮기는 중이면, 다 옮긴 다음에 던진다
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
        if (this.sealed?.has(i)) return;           // 봉인된 주사위: 제자리에서 반투명 (frame 참고)
        // 고정한 주사위는 주사위 함으로 옮긴다 → 트레이가 비어 굴리는 주사위를 막지 않는다
        if (!d.blank && !d.boxed) { this.hop(d, true, HOP_MS); boxing = true; }
        return;
      }
      d.boxed = false;
      d.hop = null;
      const b = new CANNON.Body({ mass: 1, material: dieMat, shape, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.1 });
      const live = this.live?.bodies.find(x => x.i === i)?.b;
      // 바닥을 움켜쥐고(마찰 큼) 모서리로 넘어가며 데굴데굴 구르게: 회전은 오래 유지, 던지는 힘·회전은 크게
      b.linearDamping = 0.08;
      b.angularDamping = 0.06;
      const heavy = this.marks?.[i]?.kind === 'heavy';
      if (heavy) { b.linearDamping = 0.14; b.angularDamping = 0.12; }     // 무거운 주사위: 덜 미끄러지고 덜 돈다
      // 오른쪽 위에서 한 줌 던지되, 주사위마다 트레이 가운데 기준으로 고르게 흩어진 목표 지점을 향해 알맞은 힘으로
      // (예전엔 모두 같은 방향으로 세게 던져 왼쪽 벽에 몰렸다: 평균 x -1.9, 왼쪽 벽 25%)
      if (live) {
        // 흔드는 중이던 주사위: 지금 자세·속도 그대로 이어서, 마지막으로 한 번 더 툭 튀겨 굴린다
        b.linearDamping = 0.08; b.angularDamping = 0.06;
        b.position.copy(live.position);
        b.quaternion.copy(live.quaternion);
        // 흔들기를 멈추면 더 던지지 않는다: 지금 속도 그대로 굴러가다 멈춘다.
        // 거의 서 있던 주사위만 제자리에서 한 번 톡 넘어가게 (윗면이 바뀌는 순간이 굴러가는 중에 묻히도록)
        b.velocity.copy(live.velocity);
        b.angularVelocity.copy(live.angularVelocity);
        if (live.velocity.length() < 2.5 && live.angularVelocity.length() < 6) {
          b.velocity.y = 3.2 + Math.random() * 1.2;
          const ax = Math.random() * Math.PI * 2;
          b.angularVelocity.set(Math.cos(ax) * 13, (Math.random() - 0.5) * 4, Math.sin(ax) * 13);
        }
        b.addEventListener('collide', e => {
          const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
          if (v > 2.2) hits.push({ f: frames.length, v, i, floor: e.body.material?.name === 'floor' });
        });
        world.addBody(b);
        bodies.push({ i, b });
        return;
      }
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
        if (v > 2.2) hits.push({ f: frames.length, v, i, floor: e.body.material?.name === 'floor' });
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
    const liveIds = new Set(this.live ? this.live.bodies.map(x => x.i) : []), swaps = [], pre = [];
    const fastest = k => {
      let best = 0, bf = 0;
      const n = Math.max(2, Math.floor(frames.length * 0.6));
      for (let f = 1; f < n; f++) {
        const a = frames[f - 1][k], b = frames[f][k];
        const dot = Math.abs(a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6]);
        const turn = 1 - dot + Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.002;
        if (turn > best) { best = turn; bf = f; }
      }
      return bf;
    };
    bodies.forEach(({ i }, k) => {
      const q = new THREE.Quaternion(last[k][3], last[k][4], last[k][5], last[k][6]);
      const faces = this.arr(i, topFace(q), values[i]);
      // 흔들다 이어서 굴린 주사위: 처음부터 보이던 주사위라 윗면을 곧바로 바꾸면 눈이 확 바뀌어 보인다 → 가장 빨리 도는 순간에 바꾼다
      if (liveIds.has(i)) swaps.push({ i, faces, f: fastest(k) });
      else pre.push({ i, faces });   // 던지는 순간 입힌다 (고정한 주사위가 함으로 가는 동안 제자리에서 눈이 바뀌어 보이지 않게)
      this.dice[i].value = values[i];
      this.dice[i].blank = false;
      this.dice[i].held = false;
    });
    this.refreshGlow();

    // 합치기 연출: 정렬 줄 위치 + 윗면은 그대로, 90° 단위로 가장 가까운 방향으로 반듯하게.
    // 숫자가 그려진 스킨(upright)은 윗면 숫자의 머리가 화면 위쪽(-z)을 향하도록 돌린다
    const upright = dieMatParams(this.diceSkin).upright;
    const settle = bodies.map(({ i }, k) => {
      const q = new THREE.Quaternion(last[k][3], last[k][4], last[k][5], last[k][6]);
      const tf = topFace(q);
      const top = FACE_NORMALS[tf].clone().applyQuaternion(q);
      const level = new THREE.Quaternion().setFromUnitVectors(top, UP).multiply(q);
      let fix;
      if (upright) {
        const head = FACE_UPS[tf].clone().applyQuaternion(level);
        fix = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2 - Math.atan2(-head.z, head.x));
      } else {
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(level);
        if (Math.abs(side.y) > 0.7) side.set(0, 0, 1).applyQuaternion(level);
        const yaw = Math.atan2(-side.z, side.x);
        const snap = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
        fix = new THREE.Quaternion().setFromAxisAngle(UP, snap - yaw);
      }
      return { i, from: null, to: fix.multiply(level) };
    });

    // 마지막 주사위 슬로모션: 나머지가 다 멈췄는데 마지막 하나가 아직 구르고, 그 하나로 요트 · 스트레이트가 될 수 있으면
    // 그 주사위가 멈출 때까지 느리게 보여 준다 (빨리 감기 중이면 하지 않는다)
    const slow = this.slowmo === false || baseSpeed > 1 ? null : this.slowPlan(frames, bodies, values);

    return new Promise(resolve => {
      const now = performance.now();
      const hopLeft = Math.max(0, ...this.dice.map(d => (d.hop && d.boxed ? d.hop.t0 + d.hop.ms - now : 0)));
      const wait = boxing ? HOP_MS + 40 : hopLeft ? hopLeft + 40 : 0;
      this.live = null;
      if (boxing || hopLeft) setTimeout(() => this.onBox(), Math.max(0, wait - 80));
      this.anim = { frames, bodies, hits, settle, spins, speed, slow, t0: performance.now() + wait, hitIdx: 0, swaps, pre, resolve, phase: wait ? 'wait' : 'fly', ids: new Set(bodies.map(b => b.i)) };
      if (!wait) this.throwNow();
    });
  }

  // 슬로모션 계획: 가장 늦게 멈추는 주사위 하나만 남은 순간부터 그 주사위가 멈출 때까지 느리게.
  // 다른 네 주사위(고정한 것 포함)가 같은 눈 4개거나 스트레이트 4칸이면 — 마지막 하나에 요트 · 라지 스트레이트가 걸려 있다
  slowPlan(frames, bodies, values) {
    if (!bodies.length || values.length !== 5) return null;
    const stopF = bodies.map((_, k) => {
      for (let f = frames.length - 1; f > 0; f--) {
        const a = frames[f - 1][k], b = frames[f][k];
        if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 0.004) return f;
      }
      return 0;
    });
    const order = stopF.map((f, k) => [f, k]).sort((x, y) => y[0] - x[0]);
    const [lastF, k0] = order[0];
    const from = order.length > 1 ? order[1][0] : Math.floor(lastF * 0.35);
    if (lastF - from < 14) return null;                       // 혼자 남아 구르는 시간이 너무 짧다
    const i = bodies[k0].i;
    const rest = values.filter((_, j) => j !== i);
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    rest.forEach(v => cnt[v]++);
    const set = new Set(rest);
    const four = cnt.some(c => c >= 4);
    const run = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].some(r => r.every(v => set.has(v)));
    if (!four && !run) return null;
    // 느린 구간은 길어도 약 1.6초
    const k = Math.max(0.3, (lastF - from) / (FPS * 1.2 * 1.6));
    return { from, to: lastF, k, k0 };
  }

  // 던지는 순간: 굴리는 주사위에 결과 눈을 입히고 던지는 소리
  throwNow() {
    for (const { i, faces } of this.anim?.pre || []) this.setFaces(this.dice[i], faces);
    this.dirty = true;
    this.onThrow();
  }

  // ── 흔들어 굴리기: 트레이가 요트 주사위 통처럼 흔들린다 ──
  // 폰이 움직이는 반대쪽으로 주사위가 쏠려 벽에 부딪힌다(관성). 흔드는 만큼 화면(통)도 함께 덜컹인다.
  // 흔들기를 멈추면 앱이 roll() 을 부르고, roll() 은 지금 자세·속도 그대로 이어서 멈출 때까지 굴린다
  startShake(rolling) {
    if (this.anim || this.live) return false;
    const { world, dieMat } = makeWorld(3.4, 0.7, this.cornerR || 0);   // 흔드는 동안은 천장을 낮춰 트레이 안에서만 튀고, 주사위끼리는 통통 튕긴다
    const shape = new CANNON.Box(new CANNON.Vec3(HALF * 0.96, HALF * 0.96, HALF * 0.96));
    const bodies = [];
    let lastHit = 0;
    this.dice.forEach((d, i) => {
      if (!rolling[i]) { if (!d.blank && !d.boxed && !this.sealed?.has(i)) this.hop(d, true); return; }
      d.boxed = false; d.hop = null; d.lift = 0;
      const b = new CANNON.Body({ mass: 1, material: dieMat, shape });
      b.allowSleep = false;
      b.linearDamping = 0.12; b.angularDamping = 0.1;
      b.position.set(d.mesh.position.x, Math.max(HALF, d.mesh.position.y), Math.max(-TRAY_D / 2 + HALF, Math.min(TRAY_D / 2 - HALF, d.mesh.position.z)));
      b.quaternion.set(...d.mesh.quaternion.toArray());
      // 처음 흔드는 순간 통 안에서 한 번 붕 떠오른다
      b.velocity.set((Math.random() - 0.5) * 4, 5 + Math.random() * 3, (Math.random() - 0.5) * 4);
      b.angularVelocity.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      b.addEventListener('collide', e => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        const t = performance.now();
        if (v > 2.5 && t - lastHit > 45) { lastHit = t; this.onHit(v, i); if (e.body.material?.name === 'floor') this.onLand?.(v, i, this.traySkin); }
        // 벽에 부딪히면 모서리로 넘어가며 데굴데굴 (미끄러지기만 하지 않게)
        // 주사위끼리 부딪히면 옆으로 튕겨 나간다
        if (v > 1.5 && e.body.mass > 0) { b.velocity.x += (Math.random() - 0.5) * v * 1.6; b.velocity.z += (Math.random() - 0.5) * v * 1.6; b.velocity.y = Math.max(b.velocity.y, Math.min(5, v * 0.5)); }
        if (v > 3 && e.body.mass === 0) b.angularVelocity.set(b.angularVelocity.x + (Math.random() - 0.5) * v * 2.2, b.angularVelocity.y + (Math.random() - 0.5) * v * 1.2, b.angularVelocity.z + (Math.random() - 0.5) * v * 2.2);
      });
      world.addBody(b);
      bodies.push({ i, b, w: 0.65 + Math.random() * 0.7 });
    });
    this.live = { world, bodies, ids: new Set(bodies.map(x => x.i)), last: performance.now(), t0: performance.now(), acc: { x: 0, y: 0, z: 0 }, accT: 0, jolt: { x: 0, y: 0, vx: 0, vy: 0 } };
    return true;
  }

  // 폰 가속도(중력 제외, 폰 기준 x·y·z m/s²). 폰을 세워 든 기준: 화면 오른쪽 = x, 화면 위쪽 = 트레이 안쪽, 화면 밖 = 위
  kick(ax, ay, az) {
    if (!this.live) return;
    const c = v => Math.max(-30, Math.min(30, v || 0));
    this.live.acc = { x: c(ax), y: c(ay), z: c(az) };
    this.live.accT = performance.now();
  }

  // 흔들다가 굴리지 않고 그만둘 때: 주사위를 정렬 줄로 되돌린다
  cancelShake() {
    if (!this.live) return;
    for (const { i } of this.live.bodies) this.dice[i].value = -1;   // 다음 show() 가 반듯하게 다시 놓는다
    this.live = null;
    this.camera.position.copy(this.camBase || this.camera.position);
    this.dirty = true;
  }

  stepLive(t) {
    const L = this.live;
    // 안전장치: 흔들기가 끝났는데 굴림이 오지 않고 8초가 지나면(연결 지연 등) 주사위를 제자리로
    if (t - Math.max(L.accT, L.t0) > 8000) { this.cancelShake(); if (this.shown) this.show(...this.shown); return; }
    const dt = Math.min(1 / 30, (t - L.last) / 1000);
    L.last = t;
    // 센서 값이 끊기면(흔들기를 멈춤) 힘이 금방 사라진다
    const fade = t - L.accT < 90 ? 1 : Math.max(0, 1 - (t - L.accT - 90) / 120);
    const a = L.acc, K = 2.1 * fade;
    const cap = 15;
    for (const { b, w } of L.bodies) {
      // 관성: 폰(통)이 가는 반대쪽으로 주사위가 쏠린다 (주사위마다 쏠리는 정도가 조금씩 달라 한 줄로 몰려다니지 않게)
      b.velocity.x = Math.max(-cap, Math.min(cap, b.velocity.x - a.x * K * w * dt * 10));
      b.velocity.z = Math.max(-cap, Math.min(cap, b.velocity.z + a.y * K * w * dt * 10));
      // 통을 위로 들어 올리면 바닥에 눌리고, 내리면 떠오른다 (떠오르는 쪽만 조금)
      if (a.z < -4 && b.position.y < HALF + 0.3) b.velocity.y = Math.min(8, b.velocity.y - a.z * K * dt * 6);
    }
    // 서로 붙어 있는 주사위는 살짝 밀어 낸다 (벽 한쪽에 한 덩어리로 뭉치지 않게)
    const B = L.bodies, NEAR = SIZE * 1.5;
    for (let p = 0; p < B.length; p++) for (let q = p + 1; q < B.length; q++) {
      const a1 = B[p].b.position, a2 = B[q].b.position;
      const dx = a2.x - a1.x, dz = a2.z - a1.z, d = Math.hypot(dx, dz);
      if (d >= NEAR || d < 1e-4) continue;
      const push = (NEAR - d) / NEAR * 170 * dt, nx = dx / d, nz = dz / d;
      B[p].b.velocity.x -= nx * push; B[p].b.velocity.z -= nz * push;
      B[q].b.velocity.x += nx * push; B[q].b.velocity.z += nz * push;
    }
    L.world.step(1 / 60, dt, 3);
    for (const { i, b } of L.bodies) {
      const m = this.dice[i].mesh;
      m.position.set(b.position.x, b.position.y, b.position.z);
      m.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    // 통(화면)이 폰 움직임을 따라 덜컹인다: 용수철로 따라가다 제자리로
    const j = L.jolt, S = 0.012 * fade;
    j.vx += ((a.x * S) - j.x) * 0.5 - j.vx * 0.35;
    j.vy += ((-a.y * S) - j.y) * 0.5 - j.vy * 0.35;
    j.x += j.vx; j.y += j.vy;
    j.x = Math.max(-0.25, Math.min(0.25, j.x)); j.y = Math.max(-0.25, Math.min(0.25, j.y));
  }

  // 보스 스킬 연출 한 프레임
  stepMorph(d, i, n, t) {
    const m = d.morph;
    const k = Math.min(1, (t - m.t0) / m.ms);
    const x = this.slotX(i, n);
    if (m.kind === 'burn') {
      // 부들부들 떨다가 절반쯤에 눈이 타 버린다
      d.mesh.position.x = x + Math.sin(t / 22) * 0.07 * (1 - k);
      if (k > 0.55 && !m.swapped) { m.swapped = true; this.setFaces(d, this.arr(i, 2, m.v)); d.mesh.quaternion.identity(); d.lift = 0.8; }
    } else {
      // 떠올라 한 바퀴 반 돌며 뒤집힌다
      d.lift = Math.sin(k * Math.PI) * 1.6;
      d.mesh.position.y = HALF + d.lift;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0.35).normalize(), easeOut(k) * Math.PI * 3);
      d.mesh.quaternion.copy(m.base).premultiply(q);
      if (k > 0.5 && !m.swapped) { m.swapped = true; this.setFaces(d, this.arr(i, 2, m.v)); m.base.identity(); }
    }
    if (k >= 1) {
      d.mesh.position.x = x;
      d.mesh.quaternion.identity();
      this.setFaces(d, this.arr(i, 2, m.v));
      d.value = m.v;
      d.morph = null;
      m.resolve();
    }
  }

  // 잡은 주사위는 살짝 떠 있다 (함 안에서는 조금만)
  liftWant(d) { return d.held ? (d.boxed ? 0.15 : 0.45) : 0; }

  // 그리기 루프. 기기 그래픽 오류로 계속 실패하면(5초 안에 3번) 멈추고 앱에 알린다 → 앱이 2D 주사위로 바꾼다
  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    try { this.frame(); }
    catch (err) {
      console.error('[3d frame]', err);
      const now = performance.now();
      this.errT = (this.errT || []).filter(t => now - t < 5000).concat(now);
      if (this.errT.length >= 3) this.fail(err);
    }
  }

  fail(err) {
    if (this.failed) return;
    this.failed = true;
    this.running = false;
    this.live = null;
    const a = this.anim;
    this.anim = null;
    a?.resolve?.();                             // 굴리던 중이면 기다리던 쪽을 풀어 준다 (게임은 계속)
    this.dice?.forEach(d => { d.morph?.resolve?.(); d.morph = null; });
    this.onFail(err);
  }

  frame() {
    if (document.hidden) return;              // 다른 앱을 보는 동안은 그리지 않는다
    const t = performance.now();
    // 배터리 절약: 움직이는 게 없으면 그리기를 쉰다 (빛나는 주사위만 있으면 초당 10번)
    const moving = this.anim || this.live || this.shrink || this.dice.some(d => d.morph || d.wobble || d.hop || d.auraI > 0.01 || Math.abs(this.liftWant(d) - d.lift) > 0.002);
    const glowing = this.twinkle || this.dice.some(d => d.glow.visible);
    if (this.twinkle) for (let v = 1; v <= 6; v++) { const m = this.faceMats[v]; m.emissiveIntensity = (m.userData.glowBase || 0.5) * (0.85 + Math.sin(t / 380 + v * 1.7) * 0.35); }   // 별빛이 반짝인다
    const flags = this.flags?.some(c => c.parent?.parent?.visible);
    if (!moving && !this.dirty) {
      if (flags && t - (this.lastDraw || 0) >= 33) { /* 깃발이 펄럭인다 */ }
      else if (!glowing || t - (this.lastDraw || 0) < 100) return;
    }
    if (flags) this.flagTick(t);
    this.dirty = false;
    this.lastDraw = t;
    if (this.live) this.stepLive(t);
    const a = this.anim;
    if (a && a.phase === 'wait' && t >= a.t0) { a.phase = 'fly'; this.throwNow(); }
    if (a && a.phase === 'fly') {
      let e = ((t - a.t0) / 1000) * FPS * a.speed;
      const sl = a.slow;
      if (sl && e > sl.from) {
        const span = (sl.to - sl.from) / sl.k;                 // 느린 구간을 보여 주는 데 드는 (원래 속도 기준) 프레임 수
        const inSlow = e - sl.from < span;
        e = inSlow ? sl.from + (e - sl.from) * sl.k : sl.to + (e - sl.from - span);
        if (inSlow && !sl.on) { sl.on = true; this.onSlow?.(a.bodies[sl.k0].i, true); }
        if (!inSlow && sl.on && !sl.off) { sl.off = true; this.onSlow?.(a.bodies[sl.k0].i, false); }
      }
      const zoomTo = sl?.on && !sl.off ? 1.07 : 1;
      if (Math.abs(this.camera.zoom - zoomTo) > 0.001) { this.camera.zoom += (zoomTo - this.camera.zoom) * 0.12; this.camera.updateProjectionMatrix(); }
      const f = Math.min(a.frames.length - 1, Math.floor(e));
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
      // 굴러가는 궤적 (스킨마다 아주 옅은 이펙트 — app.js 가 onTrail 을 붙인다). 두 프레임마다, 움직이는 주사위만
      if (this.onTrail && f !== a.trailF && f % 2 === 0) {
        a.trailF = f;
        a.bodies.forEach(({ i }, k) => {
          const s0 = a.frames[Math.max(0, f - 2)][k], s1 = a.frames[f][k];
          const sp = Math.hypot(s1[0] - s0[0], s1[1] - s0[1], s1[2] - s0[2]);
          if (sp > 0.06) this.onTrail(i, this.screenPos(i), sp);
        });
      }
      for (const sw of a.swaps) if (!sw.done && (f >= sw.f || f >= a.frames.length - 1)) { sw.done = true; this.setFaces(this.dice[sw.i], sw.faces); }
      while (a.hitIdx < a.hits.length && a.hits[a.hitIdx].f <= f) { const h = a.hits[a.hitIdx++]; this.onHit(h.v, h.i); if (h.floor) this.onLand?.(h.v, h.i, this.traySkin); if (this.marks?.[h.i]?.kind === 'heavy') this.onMarkHit?.(h.v, h.i); }
      if (f >= a.frames.length - 1) {
        a.phase = 'settle';
        a.t1 = t + 50;
        a.settle.forEach(s => {
          const m = this.dice[s.i].mesh;
          s.from = { p: m.position.clone(), q: m.quaternion.clone() };
        });
      }
    } else if (a && a.phase === 'settle') {
      if (a.slow?.on && !a.slow.off) { a.slow.off = true; this.onSlow?.(a.bodies[a.slow.k0].i, false); }
      if (this.camera.zoom !== 1) { this.camera.zoom = Math.abs(this.camera.zoom - 1) < 0.004 ? 1 : this.camera.zoom + (1 - this.camera.zoom) * 0.2; this.camera.updateProjectionMatrix(); }
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
        this.dirty = true;                          // 반투명했던 봉인 주사위를 되돌린다
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
      if (!this.anim?.ids.has(i) && !this.live?.ids.has(i)) {        // 굴러가는 중이 아닌 주사위 (고정한 주사위는 굴리는 동안 함으로 옮겨 간다)
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
      d.ice.visible = !!this.frozen?.has(i) && !d.blank;
      const ghost = !!(this.sealed?.has(i) && (this.anim || this.live) && !d.blank);
      if (ghost !== !!d.ghost) {
        d.ghost = ghost;
        d.mesh.material = ghost ? d.faces.map(v => this.ghostMat(v)) : d.faces.map(v => this.faceMats[v]);
        d.outline.visible = !ghost && !!this.outlineOn;
        d.core.visible = !ghost && !!this.coreOn;
        d.mesh.castShadow = !ghost && !this.faceMats[1].userData.baseTransparent;
      }
      if (ghost) {                                  // 봉인의 보랏빛이 은은하게 맥박친다
        d.aura.material.color.set(0x9A5BFF);
        d.auraI = Math.max(d.auraI, 0.55 + Math.sin(t / 140) * 0.2);
      } else d.mesh.material.forEach(m => { m.opacity = d.blank ? 0.5 : 1; m.transparent = !!d.blank || !!m.userData.baseTransparent; });
      // 원정 특수 주사위 표시 (setMarks)
      const mk = this.marks?.[i];
      if (mk && !d.mark) { d.mark = new THREE.Mesh(this.geo, this.markMat(mk.kind, mk.color)); d.mark.userData.key = `${mk.kind}:${mk.color}`; d.mark.scale.setScalar(1.045); d.mark.renderOrder = 3; d.mesh.add(d.mark); }
      if (d.mark) {
        if (mk && d.mark.userData.key !== `${mk.kind}:${mk.color}`) { d.mark.material = this.markMat(mk.kind, mk.color); d.mark.userData.key = `${mk.kind}:${mk.color}`; }
        d.mark.visible = !!mk && !d.blank && !ghost;
      }
      const trail = mk?.kind === 'twin' && this.anim && this.anim.ids?.has(i) && !d.blank;
      if (trail && !d.trail) { d.trail = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(mk.color), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })); this.scene.add(d.trail); d.trail.position.copy(d.mesh.position); }
      if (d.trail) {
        d.trail.visible = !!trail;
        if (trail) {                                 // 쌍둥이: 반 박자 늦게 따라오는 분홍 잔상
          d.trail.position.lerp(d.mesh.position, 0.22);
          d.trail.quaternion.slerp(d.mesh.quaternion, 0.25);
          d.trail.scale.setScalar(0.98 * scale);
        } else d.trail.position.copy(d.mesh.position);
      }
    });
    const jo = this.live?.jolt;
    if (jo) this.camera.position.set(this.camBase.x + jo.x, this.camBase.y, this.camBase.z - jo.y);
    else if (this.camBase) this.camera.position.copy(this.camBase);
    this.renderer.render(this.scene, this.camera);
  }
}
