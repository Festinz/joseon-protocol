// vfx.js — 텍스처 0장 절차 VFX: 공유 소프트서클 1장 + 전역 Points 풀 + 명중탄 트레이서.
// 명중탄 가시성은 게임 규칙(판독성 4채널)이므로 이 파일에서 최우선 폴리시.

import * as THREE from 'three';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { getDangerShots } from './combat.js';

let scene = null;
const MAXP = 512;
let points, pPos, pVel, pLife, pMaxLife, pSize, geometry;
const tracers = new Map();  // dangerShot → mesh
const _v = new THREE.Vector3(), _cam = new THREE.Vector3();
let shake = 0;

// 공유 소프트 서클 텍스처
function makeSoftCircle() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let muzzleLight = null, muzzleLightT = -1;
const gunTracers = []; // 적 연출탄 스트릭 풀
const rings = [];      // 쇼크웨이브

export function initVfx(sc) {
  scene = sc;
  // 머즐 포인트라이트 (재사용 1개 — 0.09s 점멸, Claude-of-Duty 값)
  muzzleLight = new THREE.PointLight(0xffb35c, 0, 6, 2);
  muzzleLight.layers.enable(1);
  scene.add(muzzleLight);
  geometry = new THREE.BufferGeometry();
  pPos = new Float32Array(MAXP * 3); pVel = new Float32Array(MAXP * 3);
  pLife = new Float32Array(MAXP); pMaxLife = new Float32Array(MAXP); pSize = new Float32Array(MAXP);
  const colors = new Float32Array(MAXP * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.35, map: makeSoftCircle(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true, opacity: 0.9,
  });
  points = new THREE.Points(geometry, mat);
  points.frustumCulled = false;
  scene.add(points);
  pLife.fill(0);

  // 이벤트 구독
  state.on('shotFired', ({ muzzle }) => {
    burst(muzzle, 4, 0xffd890, 1.2, 120, 0.22); kick(0.5);
    muzzleLight.position.copy(muzzle); muzzleLightT = 0; // 0.09s 점멸
  });
  state.on('shotHit', ({ point, weak }) => point && burst(point, weak ? 10 : 6, weak ? 0xffe9a0 : 0xbfd8ff, 2.0, 260, 0.16));
  state.on('decoyShot', (a) => {
    const m = a.group.getObjectByName('muzzle'); if (!m) return;
    m.getWorldPosition(_v); burst(_v, 3, 0xffc070, 1.0, 100, 0.2);
    spawnGunTracer(_v); // 일부러 빗나가는 트레이서 — 총격전 체감
  });
  state.on('enemyKilled', (a) => { _v.copy(a.group.position); _v.y += 1; burst(_v, 14, 0x9fd8d4, 2.2, 500, 0.3); });
  state.on('bombShotDown', (b) => burst(b.mesh.position, 16, 0xffaa50, 3.0, 400, 0.3));
  state.on('bombExploded', (b) => { burst(b.mesh.position, 22, 0xff7a40, 3.6, 500, 0.4); kick(2.2); shockwave(b.mesh.position, 3); });
  state.on('dangerLaunched', (s) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4030 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: points.material.map, color: 0xff5040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.1); m.add(glow);
    scene.add(m); tracers.set(s, m);
  });
  state.on('dangerImpact', removeTracer);
  state.on('dangerAvoided', removeTracer);
  state.on('dangerCleared', () => { for (const [s, m] of tracers) scene.remove(m); tracers.clear(); });
  state.on('playerHit', () => kick(2.6));
  state.on('coverSwapFx', () => { _v.copy(rig.dolly.position); _v.y += 1.5; burst(_v, 26, 0xffb060, 3.2, 600, 0.4); kick(2.0); });
  state.on('smokeDeployed', () => {
    _v.copy(rig.dolly.position); _v.y += 1.2;
    const fwd = new THREE.Vector3(0, 0, -4).applyQuaternion(rig.dolly.quaternion);
    _v.add(fwd);
    for (let i = 0; i < 90; i++) burstOne(_v, 0xbfc8d8, 0.7, 3600, 0.9 + Math.random() * 0.7);
  });
  state.on('ultStrike', (i) => {
    const fwd = new THREE.Vector3((i - 2) * 4 + (Math.random() - 0.5) * 2, 0, -14 - Math.random() * 8).applyQuaternion(rig.dolly.quaternion);
    _v.copy(rig.dolly.position).add(fwd); _v.y = 0;
    shockwave(_v.clone(), 6);
    // 광기둥
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 26, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    pillar.position.copy(_v); pillar.position.y = 13; scene.add(pillar);
    setTimeout(() => scene.remove(pillar), 260);
    burst(new THREE.Vector3(_v.x, 1, _v.z), 30, 0xffd890, 4.5, 700, 0.5);
    kick(3.2);
  });
  state.on('turretDestroyed', () => kick(1.6));
  state.on('bossDefeated', () => { for (let i = 0; i < 5; i++) setTimeout(() => { _v.set((Math.random() - 0.5) * 6, 2 + Math.random() * 5, -132); burst(_v, 30, 0x9fd8d4, 4, 800, 0.5); kick(2); }, i * 350); });
}

function removeTracer(s) { const m = tracers.get(s); if (m) { scene.remove(m); tracers.delete(s); } }

let pi = 0;
function burstOne(pos, color, speed, life, size) {
  const i = pi = (pi + 1) % MAXP;
  pPos[i * 3] = pos.x; pPos[i * 3 + 1] = pos.y; pPos[i * 3 + 2] = pos.z;
  pVel[i * 3] = (Math.random() - 0.5) * speed;
  pVel[i * 3 + 1] = Math.random() * speed * 0.8 + 0.3;
  pVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
  pLife[i] = pMaxLife[i] = life; pSize[i] = size;
  const c = new THREE.Color(color);
  geometry.attributes.color.setXYZ(i, c.r, c.g, c.b);
}
export function burst(pos, n, color, speed, life, size) {
  for (let k = 0; k < n; k++) burstOne(pos, color, speed, life + Math.random() * life * 0.4, size);
}
export function kick(n) { shake = Math.min(4, shake + n); }

// 쇼크웨이브 링 (0.2s 확산 — Claude-of-Duty explosions 레시피)
export function shockwave(pos, R = 4) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe6c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.06;
  scene.add(m); rings.push({ m, t: 0, R });
}

// 적 연출탄 트레이서 — 카메라 근처를 스치고 지나가는 빗나감 (풀 8)
function spawnGunTracer(from) {
  let t = gunTracers.find(x => !x.mesh.visible);
  if (!t) {
    if (gunTracers.length >= 8) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    t = { mesh, vel: new THREE.Vector3(), t: 0, ttl: 0 };
    scene.add(mesh); gunTracers.push(t);
  }
  const camPos = rig.camera.getWorldPosition(new THREE.Vector3());
  // 카메라에서 1.5~3.5m 벗어난 지점을 향해
  const miss = camPos.add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2), (Math.random() - 0.3) * 2, 0));
  const dir = miss.sub(from).normalize();
  t.mesh.visible = true;
  t.mesh.position.copy(from);
  t.vel.copy(dir).multiplyScalar(90); // 화면에서 읽히는 클램프 속도
  t.ttl = 0.5; t.t = 0;
  t.mesh.lookAt(t.mesh.position.clone().add(dir)); t.mesh.rotateY(Math.PI / 2);
}

export function updateVfx(dt) {
  // 파티클
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pLife[i] -= dt;
    pPos[i * 3] += pVel[i * 3] * dt * 0.001;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt * 0.001;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt * 0.001;
    pVel[i * 3 + 1] -= dt * 0.0016; // 중력 약간
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;

  // 명중탄 트레이서 — 발사 순간의 착탄점(고정)을 향해 lerp → 무빙 회피가 눈에 보인다
  for (const [s, m] of tracers) {
    const k = Math.min(1, (now() - s.t0) / s.flightMs);
    m.position.lerpVectors(s.from, s.target || _cam, k);
    m.position.y += Math.sin(k * Math.PI) * 0.5; // 살짝 호
    const sc = 1 + k * 1.2; m.scale.setScalar(sc);
  }

  // 머즐 라이트 점멸 (90ms)
  if (muzzleLightT >= 0) {
    muzzleLightT += dt;
    muzzleLight.intensity = muzzleLightT < 90 ? 14 * (1 - muzzleLightT / 90) : 0;
    if (muzzleLightT > 90) muzzleLightT = -1;
  }
  // 쇼크웨이브
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt / 200;
    const k = 1 - Math.pow(1 - Math.min(1, r.t), 2);
    r.m.scale.setScalar(r.R * (0.35 + 2.05 * k));
    r.m.material.opacity = 1 - Math.min(1, r.t);
    if (r.t >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }
  // 적 트레이서
  for (const t of gunTracers) {
    if (!t.mesh.visible) continue;
    t.t += dt / 1000;
    t.mesh.position.addScaledVector(t.vel, dt / 1000);
    t.mesh.material.opacity = Math.max(0, 1 - t.t / t.ttl);
    if (t.t >= t.ttl) t.mesh.visible = false;
  }

  // 화면 흔들림 (카메라 로컬 지터, 감쇠)
  if (shake > 0.01) {
    shake *= Math.pow(0.0025, dt / 1000) ; // 빠른 감쇠
    rig.camera.position.x = (Math.random() - 0.5) * 0.02 * shake;
    rig.camera.position.y = (Math.random() - 0.5) * 0.02 * shake;
  } else { rig.camera.position.x = 0; rig.camera.position.y = 0; shake = 0; }
}
