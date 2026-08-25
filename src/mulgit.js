// mulgit.js — 중간보스 멀기트 (기계 외골격 탐관오리 사또).
// 근접 보스: 추격 → 엇박 내려치기(1.3박 지연) / 원거리 돌진 / 광역 충격파. 전부 이동으로 회피.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { registerHittable, damagePlayer, creditKill } from './combat.js';
import { buildSoldier, MAT } from './assets.js';
import { burst, kick, shockwave } from './vfx.js';

const CFG = {
  hp: 320, speed: 2.6, meleeRange: 3.4,
  slam: { windup1: 900, offbeat: 420, dmgRadius: 3.6, dmg: 30 },     // 엇박: 정박에서 멈칫 → 0.42s 뒤 타격
  charge: { minDist: 8, tele: 800, speed: 11, durMs: 1100, halfWidth: 1.3, dmg: 25, cooldown: 6000 },
  wave: { interval: 11000, tele: 1200, radius: 7.5, dmg: 25 },
  staggerEvery: 80,     // 누적 피해마다 경직
};

let m = null;   // { group, hp, st, stT, lastCharge, lastWave, dmgAcc, mixer, clips }
let sc = null;
const _v = new THREE.Vector3(), _p = new THREE.Vector3();

export function initMulgitScene(scene) { sc = scene; }
export function mulgitActive() { return !!m && m.hp > 0; }

export function spawnMulgit(pos = [0, 0, -103]) {
  if (m) despawn();
  const group = new THREE.Group();
  // 절차 폴백: 병사 ×1.75 진홍 틴트 — GLB(assets/models/mulgit.glb) 로드 시 교체
  const proc = buildSoldier('grunt');
  proc.scale.setScalar(1.75);
  proc.traverse(o => {
    if (o.isMesh && o.material && o.material.color && o.name !== 'hitBody' && o.name !== 'hitHead') {
      o.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { if (mm.color) mm.color.multiply(new THREE.Color(0xc06a4a)); });
    }
  });
  group.add(proc);
  new GLTFLoader().load('assets/models/mulgit.glb?v=3', (g) => {
    proc.visible = false;
    g.scene.traverse(o => { if (o.isMesh && o.material) { o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveMap = o.material.map || null; o.material.emissiveIntensity = 0.35; } });
    group.add(g.scene);
    if (g.animations && g.animations.length) {
      m.mixer = new THREE.AnimationMixer(g.scene);
      m.clips = {};
      for (const c of g.animations) m.clips[c.name.toLowerCase()] = c;
      playClip(['idle', 'walking', 'walk'], true);
    }
  }, undefined, () => {});

  group.position.set(...pos);
  sc.add(group);

  const actor = { alive: true, headOnly: false,
    onHit: (part, dmg) => { if (m) takeHit(dmg); } };
  // 히트 프록시 (큰 몸통)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.0, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'hitBody'; hit.position.y = 1.5; hit.userData.actor = actor; group.add(hit);
  registerHittable(hit, actor);

  m = { group, actor, hp: CFG.hp, st: 'CHASE', stT: now(), lastCharge: 0, lastWave: now(), dmgAcc: 0,
        chargeDir: new THREE.Vector3(), mixer: null, clips: null };
  state.emit('bannerShow', '중간보스 — 멀기트, 탐관오리 사또');
  state.emit('mulgitSpawned');
  return m;
}

function playClip(names, loop) {
  if (!m || !m.mixer || !m.clips) return;
  for (const n of names) {
    const key = Object.keys(m.clips).find(k => k.includes(n));
    if (key) {
      m.mixer.stopAllAction();
      const a = m.mixer.clipAction(m.clips[key]);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop; a.reset().play();
      return;
    }
  }
}

function takeHit(dmg) {
  if (!m || m.hp <= 0) return;
  m.hp -= dmg; m.dmgAcc += dmg;
  state.emit('bossPartHit');
  state.emit('mulgitHp', m.hp / CFG.hp);
  if (m.dmgAcc >= CFG.staggerEvery && m.st !== 'STAGGER') {
    m.dmgAcc = 0; m.st = 'STAGGER'; m.stT = now();
    playClip(['hit', 'impact', 'damage'], false);
  }
  if (m.hp <= 0) die();
}

function die() {
  m.st = 'DEAD';
  playClip(['death', 'dying', 'fall'], false);
  creditKill({ score: 1500, weak: false });
  burst(m.group.position.clone().add(_v.set(0, 2, 0)), 40, 0x9fd8d4, 4, 900, 0.5);
  kick(2.5);
  state.emit('mulgitDefeated');
  state.emit('bannerShow', '멀기트 격파 — 탐관오리를 처단했다');
  const g = m.group;
  const t0 = now();
  const iv = setInterval(() => {
    const k = Math.min(1, (now() - t0) / 1500);
    g.rotation.x = -k * 1.2; g.position.y = -k * 0.6;
    if (k >= 1) { clearInterval(iv); if (g.parent) g.parent.remove(g); }
  }, 33);
  setTimeout(() => { m = null; }, 1600);
}

function despawn() { if (m?.group?.parent) m.group.parent.remove(m.group); m = null; }
export function resetMulgit() { despawn(); }
export function mulgitTakeDamage(pos, radius, dmg) {
  if (!m || m.hp <= 0) return;
  if (m.group.position.distanceTo(pos) < radius) takeHit(dmg);
}

export function updateMulgit(dt) {
  if (!m || m.hp <= 0) return;
  const dts = Math.min(0.05, dt / 1000);
  const t = now();
  if (m.mixer) m.mixer.update(dts);
  const pp = rig.dolly.position;
  const dist = m.group.position.distanceTo(_p.set(pp.x, m.group.position.y, pp.z));

  // 플레이어 바라보기 (돌진 중 제외)
  if (m.st !== 'CHARGE') m.group.lookAt(pp.x, m.group.position.y, pp.z);

  switch (m.st) {
    case 'CHASE': {
      playClipOnce_('walk');
      _v.subVectors(_p.set(pp.x, m.group.position.y, pp.z), m.group.position).normalize();
      m.group.position.addScaledVector(_v, CFG.speed * dts);
      // 패턴 선택
      if (dist < CFG.meleeRange) { m.st = 'SLAM_WINDUP'; m.stT = t; auraOn(0xffa030); playClip(['attack', 'swing', 'slam'], false); }
      else if (dist > CFG.charge.minDist && t - m.lastCharge > CFG.charge.cooldown) {
        m.st = 'CHARGE_TELE'; m.stT = t; auraOn(0xff3020);
        m.chargeDir.subVectors(_p.set(pp.x, m.group.position.y, pp.z), m.group.position).normalize();
      }
      else if (t - m.lastWave > CFG.wave.interval) { m.st = 'WAVE_TELE'; m.stT = t; auraOn(0x9fd8d4); }
      break;
    }
    case 'SLAM_WINDUP': {  // 엇박: 정박(0.9s)에서 한 번 멈칫 → +0.42s 에 진짜 타격
      const el = t - m.stT;
      if (el >= CFG.slam.windup1 + CFG.slam.offbeat) {
        auraOff();
        burst(m.group.position.clone(), 20, 0xffa050, 3, 400, 0.4);
        shockwave(m.group.position.clone(), CFG.slam.dmgRadius * 0.7);
        kick(1.8);
        state.emit('mulgitSlam');
        if (dist < CFG.slam.dmgRadius && rig.dolly.position.y < 2) damagePlayer(CFG.slam.dmg, '멀기트의 철퇴 — 엇박에 당했다');
        m.st = 'RECOVER'; m.stT = t;
      }
      break;
    }
    case 'CHARGE_TELE': {
      if (t - m.stT >= CFG.charge.tele) { m.st = 'CHARGE'; m.stT = t; auraOff(); state.emit('mulgitCharge'); playClip(['run', 'sprint', 'charge'], true); }
      break;
    }
    case 'CHARGE': {
      m.group.position.addScaledVector(m.chargeDir, CFG.charge.speed * dts);
      // 측면 거리로 명중 판정
      _v.subVectors(_p.set(pp.x, 0, pp.z), _p.clone().set(m.group.position.x, 0, m.group.position.z));
      const along = _v.dot(m.chargeDir);
      const lat = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
      if (along > -1 && along < 2.2 && lat < CFG.charge.halfWidth) {
        damagePlayer(CFG.charge.dmg, '멀기트의 돌진');
        m.st = 'RECOVER'; m.stT = t; m.lastCharge = t;
      }
      if (t - m.stT > CFG.charge.durMs) { m.st = 'RECOVER'; m.stT = t; m.lastCharge = t; }
      break;
    }
    case 'WAVE_TELE': {
      if (t - m.stT >= CFG.wave.tele) {
        auraOff(); m.lastWave = t;
        shockwave(m.group.position.clone(), CFG.wave.radius);
        burst(m.group.position.clone().add(_v.set(0, 0.5, 0)), 30, 0x9fd8d4, 5, 600, 0.45);
        kick(2.2);
        state.emit('mulgitWave');
        if (dist < CFG.wave.radius) damagePlayer(CFG.wave.dmg, '증기 충격파 — 거리를 벌려라');
        m.st = 'RECOVER'; m.stT = t;
      }
      break;
    }
    case 'STAGGER': { if (t - m.stT > 900) { m.st = 'CHASE'; } break; }
    case 'RECOVER': { if (t - m.stT > 800) { m.st = 'CHASE'; playClip(['idle', 'walk'], true); } break; }
  }
}

let lastWalk = 0;
function playClipOnce_(n) { const t = now(); if (t - lastWalk > 2000) { lastWalk = t; playClip([n, 'walking'], true); } }

// 텔레그래프 오라
let aura = null;
function auraOn(color) {
  auraOff();
  aura = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.y = 1.8; m.group.add(aura);
  state.emit('dangerTelegraph', { group: m.group });
}
function auraOff() { if (aura && aura.parent) aura.parent.remove(aura); aura = null; }
