// throwables.js — 플레이어 수류탄 (F): 포물선 투척 → 광역 폭발.
// VFX: 황동 밴드 + 점멸 도화선 투사체, 연기 트레일/스파크, 레이어드 폭발 (vfx.js 헬퍼 호출).

import * as THREE from 'three';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { getActors } from './enemies.js';
import { bossActive, bossTakeUltDamage, bossBodyPos } from './boss.js';
import { sattoTakeDamage, sattoActive } from './satto.js';
import { burst, shockwave, kick, trailPuff, fuseSpark, explosionFlash, scorch } from './vfx.js';

const GRENADE = { dmg: 45, radius: 4.2, bossDmg: 40, fuseMs: 1600, speed: 13, upBoost: 4.5, cooldownMs: 900 };
let scene = null;
const live = [];
let lastThrow = 0;
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

// 공유 지오메트리/재질 (모듈 로드 시 1회 생성 — 투척/프레임당 할당 금지)
const BODY_GEO = new THREE.SphereGeometry(0.11, 12, 10);
const BAND_GEO = new THREE.TorusGeometry(0.113, 0.02, 6, 18);
const FUSE_GEO = new THREE.SphereGeometry(0.032, 6, 5);
const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x2e3136, roughness: 0.5, metalness: 0.4 });
const BAND_MAT = new THREE.MeshStandardMaterial({ color: 0xb5883c, roughness: 0.3, metalness: 0.85 });
const FUSE_MAT = new THREE.MeshBasicMaterial({ color: 0xff7a24, fog: false });
const meshPool = []; // 폭발한 수류탄 그룹 재사용

function acquireMesh() {
  const cached = meshPool.pop();
  if (cached) return cached;
  const grp = new THREE.Group();
  const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
  const band = new THREE.Mesh(BAND_GEO, BAND_MAT);
  band.rotation.x = Math.PI / 2; // 적도 황동 밴드
  const fuse = new THREE.Mesh(FUSE_GEO, FUSE_MAT);
  fuse.position.y = 0.115;       // 상단 도화선 점
  grp.add(body, band, fuse);
  grp.userData.fuse = fuse;
  return grp;
}

export function initThrowables(sc) {
  scene = sc;
  state.on('grenadePressed', tryThrow);   // F — 무기와 무관하게 즉시 투척 (손에 든 무기는 그대로)
}

// 수류탄 전용. 무기를 바꿔 들 필요 없이 F 한 번이면 던진다.
function tryThrow() {
  if (state.phase !== 'play' || state.paused || state.player.state === 'DEAD' || state.ultCasting) return;
  if (now() - lastThrow < GRENADE.cooldownMs) return;
  if ((state.items.grenade || 0) <= 0) { state.emit('recapLine', '수류탄이 없다'); return; }
  lastThrow = now();
  state.items.grenade -= 1;
  state.emit('itemsChanged');
  state.emit('grenadeThrown');                     // 뷰모델 던지기 모션 (그대로 유지)
  spawnGrenade();
}

function spawnGrenade() {
  const mesh = acquireMesh();
  rig.camera.getWorldPosition(mesh.position);
  rig.camera.getWorldDirection(_f);
  mesh.position.addScaledVector(_f, 0.5); mesh.position.y -= 0.1;
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  const vel = _f.clone().multiplyScalar(GRENADE.speed); vel.y += GRENADE.upBoost;
  scene.add(mesh);
  live.push({ mesh, vel, born: now(), tick: 0 });
}

export function updateThrowables(dt) {
  const dts = Math.min(0.05, dt / 1000);
  for (let i = live.length - 1; i >= 0; i--) {
    const g = live[i];
    g.vel.y -= 18 * dts;
    g.mesh.position.addScaledVector(g.vel, dts);
    const grounded = g.mesh.position.y <= 0.12;
    if (grounded) { g.mesh.position.y = 0.12; g.vel.set(g.vel.x * 0.4, 0, g.vel.z * 0.4); }
    else { g.mesh.rotation.x += 7 * dts; g.mesh.rotation.z += 4 * dts; } // 비행 텀블링

    const age = now() - g.born;
    g.tick++;
    // 연기 트레일 (비행 중 7프레임 간격) + 도화선 스파크 (3프레임 간격)
    if (!grounded && g.tick % 7 === 0) trailPuff(g.mesh.position);
    if (g.tick % 3 === 0) { g.mesh.userData.fuse.getWorldPosition(_v); fuseSpark(_v); }
    // 도화선 가속 점멸 — 폭발 임박할수록 빨라진다
    const k = Math.min(1, age / GRENADE.fuseMs);
    g.mesh.userData.fuse.visible = Math.floor(age / (220 - 150 * k)) % 2 === 0;

    if (age >= GRENADE.fuseMs) {
      explode(g.mesh.position.clone());
      scene.remove(g.mesh);
      g.mesh.userData.fuse.visible = true;
      meshPool.push(g.mesh);
      live.splice(i, 1);
    }
  }
}

function explode(pos) {
  state.emit('grenadeExploded', pos);

  // ── 레이어드 폭발 VFX ──
  burst(pos, 12, 0xff7a30, 4.4, 520, 0.55);  // (a) 화염 코어 — 주황 대형
  burst(pos, 10, 0xffd24a, 3.6, 430, 0.48);  // (a) 화염 코어 — 노랑 대형 (합 22)
  burst(pos, 16, 0xfff2c8, 8.0, 280, 0.16);  // (b) 스파크 — 밝은 점, 빠른 속도
  burst(pos, 12, 0x8a9098, 0.8, 2400, 0.9);  // (c) 연기 퍼프 — 회색, 느리고 오래
  shockwave(pos, GRENADE.radius);            // (d) 쇼크웨이브 링
  explosionFlash(pos);                       // (e) 주황 라이트 플래시 (0.12s)
  kick(2.8);                                 // (f) 화면 흔들림 강화
  if (pos.y < 0.6) scorch(pos, GRENADE.radius * 0.55); // 지면 폭발 → 바닥 그을음 (8s 페이드)

  for (const a of [...getActors()]) {
    if (!a.alive) continue;
    if (a.group.position.distanceTo(pos) < GRENADE.radius) a.onHit('hitBody', GRENADE.dmg, {});
  }
  if (bossActive()) {
    // 보스 몸 근처 판정 (해태는 이동한다 — 실시간 위치)
    const bp = bossBodyPos();
    if (bp && pos.distanceTo(_v.set(bp.x, pos.y, bp.z)) < 8) bossTakeUltDamage(GRENADE.bossDmg);
  }
  if (sattoActive()) sattoTakeDamage(pos, GRENADE.radius + 1.2, GRENADE.bossDmg);
}
