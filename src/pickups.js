// pickups.js — 처치 시 탄약/회복 드랍 → 걸어서 획득 (Witchfire arcana/파편 문법)
// 공유 지오메트리·재질만 사용 — 인스턴스별 new material 금지. 프레임당 할당 최소화.

import * as THREE from 'three';
import { state, now } from './state.js';
import { WEAPONS, ITEMS, PLAYER } from './config.js';
import { rig } from './rail.js';

const DROP_CHANCE = 0.35;
const LIFE_MS = 25000;          // 수명
const BLINK_MS = 4000;          // 마지막 4초 깜빡임
const PICK_DIST = 1.35;         // 획득 수평거리
const MAX_PICKUPS = 12;         // 동시 최대 (초과 시 가장 오래된 것 제거)
const BASE_Y = 0.35;            // 바운스 기준 높이
const BOB_AMP = 0.08;

let scene = null;
const pickups = [];             // { kind, group, born, seed }

// ── 공유 애셋 (initPickups 에서 1회 생성) ─────────────────────────────
let A = null;
function buildAssets() {
  const std = (color, emissive, intensity) =>
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.55, metalness: 0.35 });

  const ringGeo = new THREE.RingGeometry(0.55, 0.9, 24);
  const ringMat = (color) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
  });

  A = {
    // ammo — 황동 탄약함
    ammoBox: new THREE.BoxGeometry(0.32, 0.18, 0.22),
    ammoStripe: new THREE.BoxGeometry(0.34, 0.05, 0.24),
    brass: std(0xb08d3e, 0xd8b46a, 0.35),
    stripe: std(0xd8b46a, 0xd8b46a, 1.1),
    // heal — 붉은 물약병
    healBulb: new THREE.SphereGeometry(0.12, 12, 10),
    healNeck: new THREE.CylinderGeometry(0.05, 0.06, 0.14, 10),
    healMat: std(0x8a2020, 0xff5a50, 0.9),
    // grenade — 진회색 구 + 황동 밴드
    grenBody: new THREE.SphereGeometry(0.14, 12, 10),
    grenBand: new THREE.TorusGeometry(0.14, 0.025, 8, 20),
    grenMat: std(0x3a3d42, 0x101014, 0.15),
    // 바닥 이미시브 링 (시인성)
    ringGeo,
    ringAmmo: ringMat(0xd8b46a),
    ringHeal: ringMat(0xff5a50),
    ringGren: ringMat(0xb08d3e),
  };
}

function makeGroup(kind) {
  const g = new THREE.Group();
  if (kind === 'ammo') {
    g.add(new THREE.Mesh(A.ammoBox, A.brass));
    const s = new THREE.Mesh(A.ammoStripe, A.stripe); s.position.y = 0.02; g.add(s);
  } else if (kind === 'heal') {
    const bulb = new THREE.Mesh(A.healBulb, A.healMat); bulb.position.y = -0.02; g.add(bulb);
    const neck = new THREE.Mesh(A.healNeck, A.healMat); neck.position.y = 0.13; g.add(neck);
  } else {
    g.add(new THREE.Mesh(A.grenBody, A.grenMat));
    const band = new THREE.Mesh(A.grenBand, A.brass); band.rotation.x = Math.PI / 2; g.add(band);
  }
  const ring = new THREE.Mesh(A.ringGeo, kind === 'ammo' ? A.ringAmmo : kind === 'heal' ? A.ringHeal : A.ringGren);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

// ── 드랍 ─────────────────────────────────────────────────────────────
function rollKind() {
  const r = Math.random();                 // 탄약 55% / 회복 35% / 수류탄 10%
  return r < 0.55 ? 'ammo' : r < 0.90 ? 'heal' : 'grenade';
}

function spawnDrop(a) {
  if (!scene || Math.random() > DROP_CHANCE) return;
  if (pickups.length >= MAX_PICKUPS) removeAt(0);   // 가장 오래된 것 제거
  const kind = rollKind();
  const g = makeGroup(kind);
  const ang = Math.random() * Math.PI * 2, rad = Math.random() * 0.5;
  g.position.set(a.group.position.x + Math.cos(ang) * rad, BASE_Y, a.group.position.z + Math.sin(ang) * rad);
  g.userData.ring.position.y = 0.02 - BASE_Y;       // 링은 항상 바닥에 (그룹 바운스 상쇄는 update 에서)
  scene.add(g);
  pickups.push({ kind, group: g, born: now(), seed: Math.random() * 10 });
}

// ── 획득 효과 ────────────────────────────────────────────────────────
function applyPickup(kind) {
  if (kind === 'ammo') {
    const w = state.weapons[state.currentWeapon];
    const cfg = WEAPONS[state.currentWeapon];
    w.reserve = Math.min(cfg.reserve, w.reserve + Math.ceil(cfg.reserve * 0.35));
    state.emit('ammoChanged');
    state.emit('recapLine', '+ 탄약 보급');
  } else if (kind === 'heal') {
    if (state.player.hp < PLAYER.hp) {
      state.player.hp = Math.min(PLAYER.hp, state.player.hp + 22);
      state.emit('playerHealed');
      state.emit('recapLine', '+ 기력 회복');
    } else {                                        // 만피: 탕약으로 전환
      state.items.tonic = Math.min(ITEMS.tonic.max, state.items.tonic + 1);
      state.emit('itemsChanged');
      state.emit('recapLine', '+ 탕약 획득');
    }
  } else {
    state.items.grenade = Math.min(ITEMS.grenade.max, state.items.grenade + 1);
    state.emit('itemsChanged');
    state.emit('recapLine', '+ 수류탄 획득');
  }
  state.emit('pickupTaken', kind);
}

// ── 수명주기 ─────────────────────────────────────────────────────────
function removeAt(i) {
  const p = pickups[i];
  if (p.group.parent) p.group.parent.remove(p.group);
  pickups.splice(i, 1);
}

export function initPickups(sceneRef) {
  scene = sceneRef;
  if (!A) buildAssets();
  state.on('enemyKilled', spawnDrop);
  state.on('playerDead', clearPickups);
}

export function updatePickups(dt) {
  if (!pickups.length) return;
  const t = now();
  const px = rig.dolly.position.x, pz = rig.dolly.position.z;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const age = t - p.born;
    if (age >= LIFE_MS) { removeAt(i); continue; }

    // 획득 판정 (수평거리)
    const dx = p.group.position.x - px, dz = p.group.position.z - pz;
    if (dx * dx + dz * dz < PICK_DIST * PICK_DIST && state.player.state !== 'DEAD') {
      applyPickup(p.kind);
      removeAt(i);
      continue;
    }

    // 바운스 + 회전 (링은 그룹 로컬에서 상쇄해 바닥 고정)
    const bobY = BASE_Y + Math.sin(t * 0.003 + p.seed) * BOB_AMP;
    p.group.position.y = bobY;
    p.group.rotation.y += dt * 0.0012;
    p.group.userData.ring.position.y = 0.02 - bobY; // 그룹 요 회전은 평면 링 시각에 무해

    // 만료 임박 깜빡임
    p.group.visible = age < LIFE_MS - BLINK_MS || Math.floor(age / 130) % 2 === 0;
  }
}

export function clearPickups() {
  for (let i = pickups.length - 1; i >= 0; i--) removeAt(i);
}
