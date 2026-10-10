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
import { drawDieFace, dieMatParams, dieGlows, dieImage, READY, diceReady, preloadDice, drawTrayFloor, trayGlows, trayStyle, trayImage, trayReady, preloadTray, drawBoxFloor } from './skins.js';

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
function makeWorld(ceiling = 6.0, dieBounce = 0.08) {
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

  return { world, dieMat };
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
    }

    // 주사위 함 (트레이 앞 난간에 붙은 낮은 나무 상자)
    const boxFloor = this.boxFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(TRAY_W + 2 * T, BOX_D),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
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
  imageTex(url) {
    this.texCache ||= new Map();
    if (this.texCache.has(url)) return this.texCache.get(url);
    const img = READY.get(url);
    let t;
    if (img) { t = new THREE.Texture(img); t.needsUpdate = true; t.userData.cached = true; this.texCache.set(url, t); }
    else t = (this.loader ||= new THREE.TextureLoader()).load(url, () => { this.dirty = true; });
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
        const face = mode => (url && !mode ? this.imageTex(url) : this.canvasTex(drawDieFace(document.createElement('canvas'), v, diceId, mode)));
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
      const img = kind => trayImage(trayId, kind) && this.imageTex(trayImage(trayId, kind));
      fm.map = img('floor') || this.canvasTex(drawTrayFloor(document.createElement('canvas'), trayId));
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
      bm.map = img('box') || this.canvasTex(drawBoxFloor(document.createElement('canvas'), trayId));
      bm.needsUpdate = true;
    }
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
    // 앞쪽 주사위 함은 트레이보다 넓고 카메라에 가까워서(원근으로 더 커 보인다) 좁은 화면에선 양 끝 장식(보석)이 잘렸다.
    // 함 바닥 양 끝 장식 · 난간 모서리가 화면 안에 들어올 때까지 조금씩 물러난다 (함 바깥 벽까지 다 넣으면 주사위가 너무 작아진다)
    const XE = TRAY_W / 2 + RAIL_T - 0.15, XR = TRAY_W / 2 + RAIL_T;
    const corners = [[XE, 0, BOX_Z + BOX_D / 2], [XE, 0, BOX_Z - BOX_D / 2], [XR, 0.7, SCENE_Z0], [XR, 0.7, -SCENE_Z0]];
    const v = new THREE.Vector3();
    for (let k = 0; k < 40; k++) {
      const out = corners.some(([x, y, z]) => { v.set(x, y, z).project(this.camera); return Math.abs(v.x) > 0.985 || Math.abs(v.y) > 0.985; });
      if (!out) break;
      dist *= 1.025;
      place();
    }
    this.camBase = this.camera.position.clone();
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
      if (d.boxed && (!d.held || !values[i])) {
        // 고정을 풀었거나 새 차례: 함에서 트레이로 돌아온다
        if (values[i] && d.value === values[i]) this.hop(d, false);
        else { d.boxed = false; d.hop = null; }
      }
      // 고정하면 바로 주사위 함으로 (다른 기기에서 고정한 것도)
      if (d.held && !d.boxed && values[i] && d.value === values[i] && !d.blank && !this.live) this.hop(d, true);
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
      d.boxed = !!(d.held && values[i]);   // 처음부터 고정된 주사위(이어하기·다시 그리기)는 함 안에 둔다
      d.hop = null;
      this.setFaces(d, remap(2, v));
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
    const { world, dieMat } = makeWorld();

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
          if (v > 2.2) hits.push({ f: frames.length, v, i });
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
        if (v > 2.2) hits.push({ f: frames.length, v, i });
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
      const faces = remap(topFace(q), values[i]);
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

    return new Promise(resolve => {
      const now = performance.now();
      const hopLeft = Math.max(0, ...this.dice.map(d => (d.hop && d.boxed ? d.hop.t0 + d.hop.ms - now : 0)));
      const wait = boxing ? HOP_MS + 40 : hopLeft ? hopLeft + 40 : 0;
      this.live = null;
      if (boxing || hopLeft) setTimeout(() => this.onBox(), Math.max(0, wait - 80));
      this.anim = { frames, bodies, hits, settle, spins, speed, t0: performance.now() + wait, hitIdx: 0, swaps, pre, resolve, phase: wait ? 'wait' : 'fly', ids: new Set(bodies.map(b => b.i)) };
      if (!wait) this.throwNow();
    });
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
    const { world, dieMat } = makeWorld(3.4, 0.7);   // 흔드는 동안은 천장을 낮춰 트레이 안에서만 튀고, 주사위끼리는 통통 튕긴다
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
        if (v > 2.5 && t - lastHit > 45) { lastHit = t; this.onHit(v, i); }
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
    if (!moving && !this.dirty) {
      if (!glowing || t - (this.lastDraw || 0) < 100) return;
    }
    this.dirty = false;
    this.lastDraw = t;
    if (this.live) this.stepLive(t);
    const a = this.anim;
    if (a && a.phase === 'wait' && t >= a.t0) { a.phase = 'fly'; this.throwNow(); }
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
      for (const sw of a.swaps) if (!sw.done && (f >= sw.f || f >= a.frames.length - 1)) { sw.done = true; this.setFaces(this.dice[sw.i], sw.faces); }
      while (a.hitIdx < a.hits.length && a.hits[a.hitIdx].f <= f) { const h = a.hits[a.hitIdx++]; this.onHit(h.v, h.i); }
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
    });
    const jo = this.live?.jolt;
    if (jo) this.camera.position.set(this.camBase.x + jo.x, this.camBase.y, this.camBase.z - jo.y);
    else if (this.camBase) this.camera.position.copy(this.camBase);
    this.renderer.render(this.scene, this.camera);
  }
}
