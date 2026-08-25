// throwables.js — 플레이어 수류탄 (F): 포물선 투척 → 광역 폭발.

import * as THREE from 'three';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { getActors } from './enemies.js';
import { bossActive, bossTakeUltDamage } from './boss.js';
import { mulgitTakeDamage, mulgitActive } from './mulgit.js';

const GRENADE = { dmg: 45, radius: 4.2, bossDmg: 40, fuseMs: 1600, speed: 13, upBoost: 4.5, cooldownMs: 900 };
let scene = null;
const live = [];
let lastThrow = 0;
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export function initThrowables(sc) {
  scene = sc;
  state.on('grenadePressed', tryThrow);
}

function tryThrow() {
  if (state.phase !== 'play' || state.paused || state.player.state === 'DEAD' || state.ultCasting) return;
  if ((state.items.grenade || 0) <= 0) { state.emit('recapLine', '수류탄이 없다'); return; }
  if (now() - lastThrow < GRENADE.cooldownMs) return;
  lastThrow = now();
  state.items.grenade -= 1;
  state.emit('itemsChanged');
  state.emit('grenadeThrown');

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2c30, emissive: 0xff5a20, emissiveIntensity: 0.8 }));
  rig.camera.getWorldPosition(mesh.position);
  rig.camera.getWorldDirection(_f);
  mesh.position.addScaledVector(_f, 0.5); mesh.position.y -= 0.1;
  const vel = _f.clone().multiplyScalar(GRENADE.speed); vel.y += GRENADE.upBoost;
  scene.add(mesh);
  live.push({ mesh, vel, born: now() });
}

export function updateThrowables(dt) {
  const dts = Math.min(0.05, dt / 1000);
  for (let i = live.length - 1; i >= 0; i--) {
    const g = live[i];
    g.vel.y -= 18 * dts;
    g.mesh.position.addScaledVector(g.vel, dts);
    const grounded = g.mesh.position.y <= 0.12;
    if (grounded) { g.mesh.position.y = 0.12; g.vel.set(g.vel.x * 0.4, 0, g.vel.z * 0.4); }
    if (now() - g.born >= GRENADE.fuseMs) {
      explode(g.mesh.position.clone());
      scene.remove(g.mesh);
      live.splice(i, 1);
    }
  }
}

function explode(pos) {
  state.emit('grenadeExploded', pos);
  for (const a of [...getActors()]) {
    if (!a.alive) continue;
    if (a.group.position.distanceTo(pos) < GRENADE.radius) a.onHit('hitBody', GRENADE.dmg, {});
  }
  if (bossActive()) {
    // 보스 몸 근처 판정 (보스룸 중심 -134 부근)
    if (pos.distanceTo(_v.set(0, pos.y, -134)) < 8) bossTakeUltDamage(GRENADE.bossDmg);
  }
  if (mulgitActive()) mulgitTakeDamage(pos, GRENADE.radius + 1.2, GRENADE.bossDmg);
}
