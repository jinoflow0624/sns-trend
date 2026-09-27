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

const easeOut = t => 1 - Math.pow(1 - t, 3);

export class DiceTray {
  constructor(host, { onPick, onHit } = {}) {
    this.host = host;
    this.onPick = onPick || (() => {});
    this.onHit = onHit || (() => {});
    this.dice = [];
    this.anim = null;
    this.target = false;
    this.clock = new THREE.Clock();

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
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
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 1, far: 30 });
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
    const T = 0.5, H = 0.7;
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

    this.faceMats = {};
    for (let v = 1; v <= 6; v++) {
      this.faceMats[v] = new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.32, metalness: 0.02 });
    }
    this.geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.17);
    this.glowGold = new THREE.MeshBasicMaterial({ map: glowTexture('#FFC83D'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xFFC83D });
    this.glowBlue = new THREE.MeshBasicMaterial({ map: glowTexture('#4FB3FF'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.raycaster = new THREE.Raycaster();
    renderer.domElement.addEventListener('pointerdown', e => this.pick(e));
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
    const needD = (TRAY_D + 1.2) / 2 / Math.tan(vfov / 2);
    const dist = Math.max(needW, needD);
    this.camera.position.set(0, dist * 0.93, dist * 0.37);
    this.camera.lookAt(0, 0, 0.35);
    this.camera.updateProjectionMatrix();
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
      this.scene.add(mesh, glow, ring);
      this.dice.push({ mesh, glow, ring, faces: STD_FACES.slice(), held: false, value: 0, lift: 0 });
    }
    while (this.dice.length > n) {
      const d = this.dice.pop();
      this.scene.remove(d.mesh, d.glow, d.ring);
    }
  }

  setFaces(d, faces) {
    d.faces = faces;
    d.mesh.material = faces.map(v => this.faceMats[v]);
  }

  // 굴리지 않고 정렬된 상태로 보여준다 (새 턴, 이어하기, 화면 갱신)
  show(values, held = []) {
    if (this.anim) return;
    const n = values.length;
    this.ensure(n);
    this.dice.forEach((d, i) => {
      d.held = !!held[i];
      // 눈이 그대로면 굴러서 멈춘 자세를 유지한다 (다시 그릴 때 튀지 않게)
      if (values[i] && d.value === values[i] && !d.blank) {
        d.mesh.position.x = this.slotX(i, n);
        d.mesh.position.z = ROW_Z;
        return;
      }
      if (values[i] && d.value && d.value !== values[i] && !d.blank) d.lift = 1.4;  // 뒤집기·조정: 톡 튀었다 떨어진다
      const v = values[i] || ((i % 6) + 1);
      d.value = values[i];
      this.setFaces(d, remap(2, v));
      d.mesh.quaternion.identity();
      d.mesh.position.set(this.slotX(i, n), HALF, ROW_Z);
      d.mesh.material.forEach(m => (m.transparent = false));
      d.blank = !values[i];
    });
    this.refreshGlow();
  }

  setHeld(held) {
    this.dice.forEach((d, i) => (d.held = !!held[i]));
    this.refreshGlow();
  }

  setTarget(on) {
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
    const v = this.dice[i].mesh.position.clone().project(this.camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  pick(e) {
    if (this.anim) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObjects(this.dice.map(d => d.mesh))[0];
    if (!hit) return;
    const i = this.dice.findIndex(d => d.mesh === hit.object);
    if (i >= 0) this.onPick(i);
  }

  // values: 엔진이 정한 굴림 결과, rolling: 이번에 굴리는 주사위 여부
  roll(values, rolling, speed = 1) {
    const n = values.length;
    this.ensure(n);
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    world.allowSleep = true;
    const dieMat = new CANNON.Material('die');
    const floorMat = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: 0.28, restitution: 0.42 }));
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.2, restitution: 0.5 }));

    const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);
    const walls = [
      [[0, 0, -TRAY_D / 2], [0, 0, 0]], [[0, 0, TRAY_D / 2], [0, Math.PI, 0]],
      [[-TRAY_W / 2, 0, 0], [0, Math.PI / 2, 0]], [[TRAY_W / 2, 0, 0], [0, -Math.PI / 2, 0]],
    ];
    for (const [p, r] of walls) {
      const b = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
      b.position.set(...p);
      b.quaternion.setFromEuler(...r);
      world.addBody(b);
    }

    const bodies = [];
    const hits = [];
    const shape = new CANNON.Box(new CANNON.Vec3(HALF * 0.96, HALF * 0.96, HALF * 0.96));
    this.dice.forEach((d, i) => {
      if (!rolling[i]) {
        // 잡아 둔 주사위는 앞줄에 그대로 두고 장애물로만 쓴다
        const b = new CANNON.Body({ mass: 0, material: dieMat, shape });
        b.position.set(d.mesh.position.x, HALF, d.mesh.position.z);
        b.quaternion.set(...d.mesh.quaternion.toArray());
        world.addBody(b);
        return;
      }
      const b = new CANNON.Body({ mass: 1, material: dieMat, shape, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.25 });
      b.linearDamping = 0.08;
      b.angularDamping = 0.12;
      b.position.set(TRAY_W / 2 - 0.9 - Math.random() * 0.8, 2.4 + i * 0.55 + Math.random(), -1.9 + Math.random() * 2.2);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      b.quaternion.set(q.x, q.y, q.z, q.w);
      b.velocity.set(-11 - Math.random() * 6, 1 + Math.random() * 2, (Math.random() - 0.3) * 5);
      b.angularVelocity.set((Math.random() - 0.5) * 36, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 36);
      b.addEventListener('collide', e => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 2.2) hits.push({ f: frames.length, v });
      });
      world.addBody(b);
      bodies.push({ i, b });
    });

    const frames = [];
    const MAX = FPS * 4;
    let still = 0;
    for (let f = 0; f < MAX; f++) {
      world.step(1 / FPS);
      frames.push(bodies.map(({ b }) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
      const moving = bodies.some(({ b }) => b.velocity.length() > 0.08 || b.angularVelocity.length() > 0.12);
      still = moving ? 0 : still + 1;
      if (still > 8 && f > 30) break;
    }

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
      this.anim = { frames, bodies, hits, settle, speed, t0: performance.now(), hitIdx: 0, resolve, phase: 'fly' };
    });
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const t = performance.now();
    const a = this.anim;
    if (a && a.phase === 'fly') {
      const f = Math.min(a.frames.length - 1, Math.floor(((t - a.t0) / 1000) * FPS * a.speed));
      a.bodies.forEach(({ i }, k) => {
        const s = a.frames[f][k];
        this.dice[i].mesh.position.set(s[0], s[1], s[2]);
        this.dice[i].mesh.quaternion.set(s[3], s[4], s[5], s[6]);
      });
      while (a.hitIdx < a.hits.length && a.hits[a.hitIdx].f <= f) this.onHit(a.hits[a.hitIdx++].v);
      if (f >= a.frames.length - 1) {
        a.phase = 'settle';
        a.t1 = t + 120;
        a.settle.forEach(s => {
          const m = this.dice[s.i].mesh;
          s.from = { p: m.position.clone(), q: m.quaternion.clone() };
        });
      }
    } else if (a && a.phase === 'settle') {
      const k = easeOut(Math.min(1, Math.max(0, (t - a.t1) / 380)));
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
    this.dice.forEach(d => {
      if (!this.anim) {
        const want = d.held ? 0.45 : 0;
        d.lift += (want - d.lift) * 0.2;
        d.mesh.position.y = HALF + d.lift;
      }
      d.glow.position.x = d.ring.position.x = d.mesh.position.x;
      d.glow.position.z = d.ring.position.z = d.mesh.position.z;
      d.glow.material.opacity = pulse;
      d.mesh.material.forEach(m => { m.opacity = d.blank ? 0.5 : 1; m.transparent = !!d.blank; });
    });
    this.renderer.render(this.scene, this.camera);
  }
}
