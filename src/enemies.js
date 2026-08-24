// enemies.js — 적 액터 풀 + 웨이브 스포너 + 상태기계(절차 모션, 리깅 없음).
// TC 대원칙: 잡졸(화승병) 사격은 전부 연출탄(데미지 0). 위협은 명중탄 스케줄뿐.

import * as THREE from 'three';
import { ENEMIES, DANGER, SCORE, PLAYER } from './config.js';
import { state, now } from './state.js';
import { buildSoldier } from './assets.js';
import { registerHittable, unregisterActor, spawnDangerShot, creditKill, creditHit, creditShootdown, damagePlayer } from './combat.js';
import { SPAWN_PRESETS } from './leveldata.js';
import { rig } from './rail.js';

let scene = null;
const actors = [];        // 활성 적
const pool = { grunt: [], marksman: [], thrower: [], shield: [] };
const bombs = [];         // 격추 가능 진천뢰
let spawnQueue = [];      // { at(ms), entry, node }
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function initEnemies(sc) { scene = sc; }

function acquire(type) {
  let a = pool[type].pop();
  if (!a) {
    const group = buildSoldier(type);
    a = { type, group, alive: false, hp: 0, headOnly: type === 'shield',
          st: 'SPAWN', stT: 0, homeY: 0, seed: Math.random() * 10,
          nextFire: 0, aura: makeAura(group) };
    a.onHit = (part, dmg, info) => onActorHit(a, part, dmg, info);
    group.traverse(o => { if (o.name === 'hitBody' || o.name === 'hitHead') registerHittable(o, a); });
  } else {
    a.group.traverse(o => { if (o.name === 'hitBody' || o.name === 'hitHead') registerHittable(o, a); });
  }
  return a;
}

function makeAura(group) { // 명중탄 텔레그래프용 붉은 오라 (판독성 채널 1)
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.y = 1.1; aura.visible = false; aura.name = 'aura'; group.add(aura);
  return aura;
}

function nodeBasis(node) { // 노드 전방(-Z) 기준 로컬 → 월드 변환
  const pos = new THREE.Vector3(...node.pos);
  const look = new THREE.Vector3(...node.look);
  _m.lookAt(pos, look, new THREE.Vector3(0, 1, 0));
  return { pos, quat: _q.setFromRotationMatrix(_m).clone() };
}

export function spawnWave(node, entries) {
  const t = now();
  for (const e of entries) spawnQueue.push({ at: t + e.delay * 1000, entry: e, node });
}
export function clearAll() {
  for (const a of [...actors]) despawn(a, false);
  spawnQueue = [];
  for (const b of [...bombs]) killBomb(b, false);
}
export function aliveCount() { return actors.filter(a => a.alive).length + spawnQueue.length; }
export function getActors() { return actors; }

function doSpawn({ entry, node }) {
  const a = acquire(entry.type);
  const cfg = ENEMIES[entry.type];
  a.alive = true; a.hp = cfg.hp; a.st = 'SPAWN'; a.stT = now(); a.entry = entry;
  const basis = nodeBasis(node);
  const off = new THREE.Vector3(...(SPAWN_PRESETS[entry.dir] || SPAWN_PRESETS.FC));
  off.applyQuaternion(basis.quat);
  a.group.position.copy(basis.pos).add(off);
  a.homeY = a.group.position.y;
  a.group.position.y -= 1.6; // 지면 상승 연출
  a.group.lookAt(rig.dolly.position.x, a.homeY, rig.dolly.position.z);
  a.aura.visible = false;
  // 명중탄/투척 스케줄
  if (entry.type === 'marksman') {
    const first = entry.delay0 ?? cfg.firstDelayMs;
    a.nextFire = now() + first;
    a.aimInterval = entry.aimIntervalMs || cfg.aimIntervalMs;
    a.flightMs = entry.flightMs || (entry.firstUnfavRelief && shouldRelief() ? DANGER.tutorialFlightMs : DANGER.flightMs);
  }
  if (entry.type === 'thrower') a.nextFire = now() + 3000;
  if (entry.type === 'grunt') a.nextFire = now() + 1500 + Math.random() * 2000;
  scene.add(a.group);
  actors.push(a);
  state.emit('enemySpawned', a);
}

// 첫 역견착 완화: 아직 완화를 소모하지 않았고 현재 커버가 역견착일 때 1회
let reliefUsed = false;
function shouldRelief() {
  if (reliefUsed) return false;
  const node = state.node; if (!node) return false;
  const side = node.covers[state.coverIdx]?.peekSide;
  if (side !== 'TOP' && side !== state.hand) { reliefUsed = true; return true; }
  return false;
}

function onActorHit(a, part, dmg, info) {
  if (!a.alive) return;
  if (a.headOnly && part !== 'hitHead') return; // 팽배수: 머리만
  a.hp -= dmg;
  creditHit();
  a.hitFlash = now();
  if (a.hp <= 0) {
    a.alive = false; a.st = 'DIE'; a.stT = now();
    a.aura.visible = false;
    creditKill({ score: ENEMIES[a.type].score, weak: info?.weak });
    state.emit('enemyKilled', a);
    unregisterActor(a);
  }
}

function despawn(a, keepScene) {
  a.alive = false; unregisterActor(a);
  const i = actors.indexOf(a); if (i >= 0) actors.splice(i, 1);
  if (a.group.parent) a.group.parent.remove(a.group);
  a.group.rotation.set(0, 0, 0); a.group.scale.setScalar(1);
  const torso = a.group.getObjectByName('torsoPivot'); if (torso) torso.rotation.set(0, 0, 0);
  pool[a.type].push(a);
}

// ── 진천뢰 (격추 가능 투사체) ──────────────────────────────────────
function throwBomb(a) {
  const cfg = ENEMIES.thrower;
  const start = a.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
  const target = rig.dolly.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.2, 0));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff5a20, emissiveIntensity: 0.9 }));
  mesh.name = 'hitBody';
  const b = { alive: true, headOnly: false, start, target, t0: now(), flightMs: cfg.bombFlightMs, mesh,
              onHit: () => { killBomb(b, true); creditShootdown(); state.emit('bombShotDown', b); } };
  mesh.userData.actor = b;
  registerHittable(mesh, b);
  scene.add(mesh); bombs.push(b);
  state.emit('bombThrown', b);
}
function killBomb(b, exploded) {
  b.alive = false; unregisterActor(b);
  if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
  const i = bombs.indexOf(b); if (i >= 0) bombs.splice(i, 1);
}

// ── 프레임 업데이트 ───────────────────────────────────────────────
export function updateEnemies(dt) {
  const t = now();
  // 스폰 큐
  for (let i = spawnQueue.length - 1; i >= 0; i--) {
    if (t >= spawnQueue[i].at) { doSpawn(spawnQueue[i]); spawnQueue.splice(i, 1); }
  }

  for (const a of [...actors]) {
    const el = t - a.stT;
    const torso = a.group.getObjectByName('torsoPivot');
    switch (a.st) {
      case 'SPAWN': {
        const k = Math.min(1, el / 400);
        a.group.position.y = a.homeY - 1.6 * (1 - k);
        if (k >= 1) { a.st = 'IDLE'; a.stT = t; }
        break;
      }
      case 'IDLE': {
        // sine 바브 + 살짝 좌우 이동, 방패병은 전진
        a.group.position.y = a.homeY + Math.sin(t * 0.003 + a.seed) * 0.04;
        if (a.type === 'shield') {
          a.group.position.addScaledVector(_v.subVectors(rig.dolly.position, a.group.position).setY(0).normalize(), dt * 0.0006);
          if (a.group.position.distanceTo(rig.dolly.position) < 2.2) { damagePlayer(PLAYER.dangerHit, '팽배수 근접 공격'); a.st = 'RECOIL'; a.stT = t; }
        }
        a.group.lookAt(rig.dolly.position.x, a.homeY, rig.dolly.position.z);
        // 사격 스케줄
        if (a.type === 'grunt' && t >= a.nextFire) {
          a.nextFire = t + 2500 + Math.random() * 2500;
          state.emit('decoyShot', a); // 연출탄: 머즐 플래시+소리만, 데미지 0
        }
        if (a.type === 'marksman' && t >= a.nextFire && t >= state.smokeUntil) {
          a.st = 'TELEGRAPH'; a.stT = t; a.aura.visible = true;
          state.emit('dangerTelegraph', a);
        }
        if (a.type === 'thrower' && t >= a.nextFire) {
          a.nextFire = t + ENEMIES.thrower.lobIntervalMs;
          throwBomb(a);
        }
        break;
      }
      case 'TELEGRAPH': {
        if (el >= DANGER.telegraphMs) {
          a.st = 'IDLE'; a.stT = t; a.aura.visible = false;
          a.nextFire = t + a.aimInterval;
          const from = a.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
          spawnDangerShot(from, { flightMs: a.flightMs });
          a.flightMs = a.entry.flightMs || DANGER.flightMs; // 완화는 첫 발만
        }
        break;
      }
      case 'RECOIL': { if (el > 800) { a.st = 'IDLE'; a.stT = t; } break; }
      case 'DIE': {
        const k = Math.min(1, el / 450);
        if (torso) torso.rotation.x = -k * 1.4;
        a.group.scale.setScalar(1 - k * 0.25);
        if (k >= 1) despawn(a, false);
        break;
      }
    }
    // 피격 플래시 (틴트 대신 살짝 움찔)
    if (a.hitFlash && t - a.hitFlash < 90 && torso) torso.rotation.x = 0.15;
    else if (a.st !== 'DIE' && torso) torso.rotation.x = 0;
  }

  // 진천뢰 비행 (포물선) — 임팩트 시 무조건 착탄 데미지 (엄폐 무관 아님: 숨어도 맞나? → TC 문법: 격추 실패 착탄은 노출 여부 무관 −25... 원안은 "숨기 vs 격추" 선택지이므로 숨으면 회피 가능해야 함)
  for (const b of [...bombs]) {
    const k = Math.min(1, (t - b.t0) / b.flightMs);
    _v.lerpVectors(b.start, b.target, k);
    _v.y += Math.sin(k * Math.PI) * 3.2; // 포물선
    b.mesh.position.copy(_v);
    if (k >= 1) {
      killBomb(b, true);
      state.emit('bombExploded', b);
      if (state.player.state !== 'COVERED' && !state.inTransit) damagePlayer(PLAYER.mortarHit, '진천뢰 폭발 (격추 가능했음)');
    }
  }
}

export function resetReliefFlag() { reliefUsed = false; }

export function debugCounts() { return { actors: actors.length, alive: actors.filter(a=>a.alive).length, queue: spawnQueue.length, bombs: bombs.length }; }

// 보스 박격 (격추 가능 — TC 투척물 문법). boss.js 의 'bossMortar' 이벤트에서 호출.
export function spawnMortars(count, fromPos) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      if (state.player.state === 'DEAD' || state.inTransit) return;
      const fake = { group: { position: (fromPos || new THREE.Vector3(0, 6, -132)).clone().add(new THREE.Vector3((i - 1) * 2, 0, 0)) } };
      throwBomb(fake);
    }, i * 500);
  }
}
