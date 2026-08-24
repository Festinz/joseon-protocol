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

export function initVfx(sc) {
  scene = sc;
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
  state.on('shotFired', ({ muzzle }) => { burst(muzzle, 4, 0xffd890, 1.2, 120, 0.22); kick(0.5); });
  state.on('shotHit', ({ point, weak }) => point && burst(point, weak ? 10 : 6, weak ? 0xffe9a0 : 0xbfd8ff, 2.0, 260, 0.16));
  state.on('decoyShot', (a) => { const m = a.group.getObjectByName('muzzle'); if (m) { m.getWorldPosition(_v); burst(_v, 3, 0xffc070, 1.0, 100, 0.2); } });
  state.on('enemyKilled', (a) => { _v.copy(a.group.position); _v.y += 1; burst(_v, 14, 0x9fd8d4, 2.2, 500, 0.3); });
  state.on('bombShotDown', (b) => burst(b.mesh.position, 16, 0xffaa50, 3.0, 400, 0.3));
  state.on('bombExploded', (b) => { burst(b.mesh.position, 22, 0xff7a40, 3.6, 500, 0.4); kick(2.2); });
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

  // 명중탄 트레이서 — 카메라를 향해 lerp (가시성 최우선)
  rig.camera.getWorldPosition(_cam);
  for (const [s, m] of tracers) {
    const k = Math.min(1, (now() - s.t0) / s.flightMs);
    m.position.lerpVectors(s.from, _cam, k);
    m.position.y += Math.sin(k * Math.PI) * 0.5; // 살짝 호
    const sc = 1 + k * 1.2; m.scale.setScalar(sc);
  }

  // 화면 흔들림 (카메라 로컬 지터, 감쇠)
  if (shake > 0.01) {
    shake *= Math.pow(0.0025, dt / 1000) ; // 빠른 감쇠
    rig.camera.position.x = (Math.random() - 0.5) * 0.02 * shake;
    rig.camera.position.y = (Math.random() - 0.5) * 0.02 * shake;
  } else { rig.camera.position.x = 0; rig.camera.position.y = 0; shake = 0; }
}
