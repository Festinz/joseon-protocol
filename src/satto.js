// satto.js — 중간보스 사또 (기계 외골격을 두른 탐관오리).
// 근접 보스. 거리대마다 다른 답을 요구한다 — 아래 CFG 주석 참조. 전부 이동/회피로 흘릴 수 있다.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { registerHittable, damagePlayer, creditKill, creditHit } from './combat.js';
import { buildSoldier, MAT } from './assets.js';
import { burst, kick, shockwave } from './vfx.js';

// 거리대별로 대응이 갈리게 짠다.
//   근(<3.4m)  철퇴 내려찍기(엇박) · 3연격 콤보   → 붙으면 빠져나가거나 회피로 흘린다
//   중(3.4~8)  증기 충격파 · 회전 후려치기        → 거리를 벌리거나 뛰어넘을 수 없으니 물러선다
//   원(>8)     돌진 · 진천뢰 3연발 탄막           → 옆으로 피하거나 엄폐물을 낀다
const CFG = {
  hp: 320, speed: 2.6, meleeRange: 3.4,
  slam: { windup1: 900, offbeat: 420, dmgRadius: 3.6, dmg: 30 },     // 엇박: 정박에서 멈칫 → 0.42s 뒤 타격
  combo:  { swings: 3, windup: 560, gapMs: 470, range: 4.0, arcDeg: 150, dmg: 16, cooldown: 7000 },
  charge: { minDist: 8, tele: 800, speed: 11, durMs: 1100, halfWidth: 1.3, dmg: 25, cooldown: 6000 },
  wave: { interval: 11000, tele: 1200, radius: 7.5, dmg: 25 },
  sweep:  { tele: 720, radius: 6.2, dmg: 26, cooldown: 9000 },        // 회전 후려치기 — 중거리 원형
  barrage:{ tele: 780, shots: 3, gapMs: 340, flightMs: 1250, radius: 3.0, dmg: 22, cooldown: 12000 },
  staggerEvery: 80,     // 누적 피해마다 경직
};

let m = null;   // { group, hp, st, stT, lastCharge, lastWave, dmgAcc, mixer, clips }
let sc = null;
const _v = new THREE.Vector3(), _p = new THREE.Vector3();

export function initSattoScene(scene) { sc = scene; }
export function sattoActive() { return !!m && m.hp > 0; }

export function spawnSatto(pos = [0, 0, -103]) {
  if (m) despawn();
  const group = new THREE.Group();
  // 절차 폴백: 병사 ×1.75 진홍 틴트 — GLB(assets/models/satto.glb) 로드 시 교체
  const proc = buildSoldier('grunt');
  proc.scale.setScalar(1.75);
  proc.traverse(o => {
    if (o.isMesh && o.material && o.material.color && o.name !== 'hitBody' && o.name !== 'hitHead') {
      o.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { if (mm.color) mm.color.multiply(new THREE.Color(0xc06a4a)); });
    }
  });
  group.add(proc);
  new GLTFLoader().load('assets/models/satto.glb?v=5', (g) => {
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
        lastCombo: 0, lastSweep: 0, lastBarrage: now() - 6000,
        swingN: 0, shotN: 0, nextSub: 0,
        chargeDir: new THREE.Vector3(), mixer: null, clips: null, curClip: null, swung: false };
  state.emit('bannerShow', '중간보스 — 사또, 백성을 쥐어짜던 탐관오리');
  state.emit('sattoSpawned');
  return m;
}

// 같은 클립을 매 프레임 reset 하면 애니가 첫 프레임에 갇힌다 → 현재 클립을 기억해 두고
// 실제로 바뀔 때만 갈아탄다. force=true 는 같은 클립을 처음부터 다시 치고 싶을 때(연격).
function playClip(names, loop, force = false) {
  if (!m || !m.mixer || !m.clips) return;
  for (const n of names) {
    const key = Object.keys(m.clips).find(k => k.includes(n));
    if (key) {
      if (m.curClip === key && !force) return;
      m.curClip = key;
      m.mixer.stopAllAction();
      const a = m.mixer.clipAction(m.clips[key]);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop; a.reset().play();
      return;
    }
  }
}

function takeHit(dmg) {
  creditHit();          // 궁극기 게이지 — 중간보스 구간에도 충전 경로 확보
  if (!m || m.hp <= 0) return;
  m.hp -= dmg; m.dmgAcc += dmg;
  state.emit('bossPartHit');
  state.emit('sattoHp', m.hp / CFG.hp);
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
  state.emit('sattoDefeated');
  state.emit('bannerShow', '사또 격파 — 탐관오리를 처단했다');
  const g = m.group;
  const t0 = now();
  const iv = setInterval(() => {
    const k = Math.min(1, (now() - t0) / 1500);
    g.rotation.x = -k * 1.2; g.position.y = -k * 0.6;
    if (k >= 1) { clearInterval(iv); if (g.parent) g.parent.remove(g); }
  }, 33);
  setTimeout(() => { m = null; }, 1600);
}

function despawn() { clearBombs(); if (m?.group?.parent) m.group.parent.remove(m.group); m = null; }
export function resetSatto() { despawn(); }
export function sattoTakeDamage(pos, radius, dmg) {
  if (!m || m.hp <= 0) return;
  if (m.group.position.distanceTo(pos) < radius) takeHit(dmg);
}

export function updateSatto(dt) {
  if (!m || m.hp <= 0) { updateBombs(now()); return; }   // 남은 진천뢰는 마저 터뜨린다
  const dts = Math.min(0.05, dt / 1000);
  const t = now();
  updateBombs(t);                     // 예고된 진천뢰는 사또가 죽어도 터진다
  if (m.mixer) m.mixer.update(dts);
  const pp = rig.dolly.position;
  const dist = m.group.position.distanceTo(_p.set(pp.x, m.group.position.y, pp.z));

  // 플레이어 바라보기 (돌진 중 제외)
  if (m.st !== 'CHARGE') m.group.lookAt(pp.x, m.group.position.y, pp.z);

  switch (m.st) {
    case 'CHASE': {
      playClip(['walk', 'walking'], true);
      _v.subVectors(_p.set(pp.x, m.group.position.y, pp.z), m.group.position).normalize();
      m.group.position.addScaledVector(_v, CFG.speed * dts);
      // 패턴 선택 — 거리대 안에서 쿨다운이 돌아온 쪽을 고른다
      if (dist < CFG.meleeRange) {                                    // 근접
        if (t - m.lastCombo > CFG.combo.cooldown) {
          m.st = 'COMBO'; m.stT = t; m.swingN = 0; m.nextSub = t + CFG.combo.windup;
          m.lastCombo = t; auraOn(0xff8a30); playClip(['idle'], true);
        } else {
          m.st = 'SLAM_WINDUP'; m.stT = t; m.swung = false; auraOn(0xffa030); playClip(['idle'], true);
        }
      } else if (dist > CFG.charge.minDist) {                         // 원거리
        if (t - m.lastBarrage > CFG.barrage.cooldown) {
          m.st = 'BARRAGE_TELE'; m.stT = t; m.shotN = 0; m.lastBarrage = t;
          auraOn(0xffc040); playClip(['swing', 'hammer', 'idle'], false);
        } else if (t - m.lastCharge > CFG.charge.cooldown) {
          m.st = 'CHARGE_TELE'; m.stT = t; auraOn(0xff3020);
          m.chargeDir.subVectors(_p.set(pp.x, m.group.position.y, pp.z), m.group.position).normalize();
        }
      } else {                                                        // 중거리
        if (t - m.lastSweep > CFG.sweep.cooldown) {
          m.st = 'SWEEP_TELE'; m.stT = t; m.lastSweep = t; auraOn(0xff5a20);
          playClip(['swing', 'hammer', 'attack'], false, true);
        } else if (t - m.lastWave > CFG.wave.interval) {
          m.st = 'WAVE_TELE'; m.stT = t; auraOn(0x9fd8d4);
        }
      }
      break;
    }
    case 'SLAM_WINDUP': {  // 엇박: 정박(0.9s)에서 한 번 멈칫 → +0.42s 에 진짜 타격
      const el = t - m.stT;
      // 스윙 모션은 타격 0.36s 전에 시작해야 내려찍는 순간과 데미지가 맞는다.
      // (전에는 윈드업 시작에 걸어서 스윙이 끝난 한참 뒤에 데미지가 났다)
      if (!m.swung && el >= CFG.slam.windup1 + CFG.slam.offbeat - 360) {
        m.swung = true; playClip(['swing', 'hammer', 'attack', 'slam'], false, true);
      }
      if (el >= CFG.slam.windup1 + CFG.slam.offbeat) {
        auraOff();
        burst(m.group.position.clone(), 20, 0xffa050, 3, 400, 0.4);
        shockwave(m.group.position.clone(), CFG.slam.dmgRadius * 0.7);
        kick(1.8);
        state.emit('sattoSlam');
        if (dist < CFG.slam.dmgRadius && rig.dolly.position.y < 2) damagePlayer(CFG.slam.dmg, '사또의 철퇴 — 엇박에 당했다');
        m.st = 'RECOVER'; m.stT = t;
      }
      break;
    }
    case 'CHARGE_TELE': {   // 돌진 예고 — 몸을 낮추고 노려본다
      playClip(['idle'], true);
      if (t - m.stT >= CFG.charge.tele) { m.st = 'CHARGE'; m.stT = t; auraOff(); state.emit('sattoCharge'); playClip(['charge', 'run', 'sprint'], true); }
      break;
    }
    case 'CHARGE': {
      m.group.position.addScaledVector(m.chargeDir, CFG.charge.speed * dts);
      // 측면 거리로 명중 판정
      _v.subVectors(_p.set(pp.x, 0, pp.z), _p.clone().set(m.group.position.x, 0, m.group.position.z));
      const along = _v.dot(m.chargeDir);
      const lat = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
      if (along > -1 && along < 2.2 && lat < CFG.charge.halfWidth) {
        damagePlayer(CFG.charge.dmg, '사또의 돌진');
        m.st = 'RECOVER'; m.stT = t; m.lastCharge = t;
      }
      if (t - m.stT > CFG.charge.durMs) { m.st = 'RECOVER'; m.stT = t; m.lastCharge = t; }
      break;
    }
    case 'WAVE_TELE': {
      playClip(['swing', 'hammer', 'attack', 'idle'], false);   // 충격파 모으는 동작 (전엔 정지)
      if (t - m.stT >= CFG.wave.tele) {
        auraOff(); m.lastWave = t;
        shockwave(m.group.position.clone(), CFG.wave.radius);
        burst(m.group.position.clone().add(_v.set(0, 0.5, 0)), 30, 0x9fd8d4, 5, 600, 0.45);
        kick(2.2);
        state.emit('sattoWave');
        if (dist < CFG.wave.radius) damagePlayer(CFG.wave.dmg, '증기 충격파 — 거리를 벌려라');
        m.st = 'RECOVER'; m.stT = t;
      }
      break;
    }
    case 'COMBO': {   // 근접 3연격 — 짧은 간격으로 부채꼴을 연속으로 훑는다. 각 타는 약하지만 도망칠 틈이 없다
      if (t >= m.nextSub) {
        m.swingN += 1;
        auraOff();
        playClip(['swing', 'hammer', 'attack'], false, true);
        const c = CFG.combo;
        _v.subVectors(_p.set(pp.x, m.group.position.y, pp.z), m.group.position);
        const d2 = _v.length();
        _v.normalize();
        const fw = new THREE.Vector3(Math.sin(m.group.rotation.y), 0, Math.cos(m.group.rotation.y));
        if (d2 < c.range && _v.dot(fw) > Math.cos(c.arcDeg * Math.PI / 360)) {
          damagePlayer(c.dmg, `사또의 연격 ${m.swingN}타`);
        }
        burst(m.group.position.clone().addScaledVector(fw, 1.6).setY(1.2), 10, 0xffa050, 2.4, 300, 0.3);
        kick(1.0);
        state.emit('sattoSlam');
        if (m.swingN >= c.swings) { m.st = 'RECOVER'; m.stT = t; }
        else m.nextSub = t + c.gapMs;
      }
      break;
    }
    case 'SWEEP_TELE': {   // 중거리 회전 후려치기 — 자기 주변 원형. 뛰어넘을 수 없으니 물러서는 게 답
      if (t - m.stT >= CFG.sweep.tele) {
        auraOff();
        const c = CFG.sweep;
        shockwave(m.group.position.clone(), c.radius);
        burst(m.group.position.clone().setY(0.9), 24, 0xff7a30, 4.2, 520, 0.42);
        kick(2.0);
        state.emit('sattoSweep');
        if (dist < c.radius) damagePlayer(c.dmg, '사또의 회전 후려치기 — 물러섰어야 했다');
        m.st = 'RECOVER'; m.stT = t;
      }
      break;
    }
    case 'BARRAGE_TELE': {  // 원거리 진천뢰 3연발 — 착탄 지점을 미리 표시하고 순차 폭발
      if (t - m.stT >= CFG.barrage.tele) { m.st = 'BARRAGE'; m.stT = t; m.shotN = 0; m.nextSub = t; auraOff(); }
      break;
    }
    case 'BARRAGE': {
      if (t >= m.nextSub && m.shotN < CFG.barrage.shots) {
        m.shotN += 1;
        m.nextSub = t + CFG.barrage.gapMs;
        playClip(['swing', 'hammer', 'attack'], false, true);
        lobBomb(pp.x, pp.z);          // 발사 시점의 플레이어 위치로 — 이동하면 피한다
        state.emit('sattoBarrage', m.shotN);
      }
      if (m.shotN >= CFG.barrage.shots && t - m.stT > CFG.barrage.gapMs * CFG.barrage.shots) {
        m.st = 'RECOVER'; m.stT = t;
      }
      break;
    }
    case 'STAGGER': {       // 경직 — 맞고 휘청인다 (전엔 정지)
      playClip(['hit', 'damage', 'idle'], false);
      if (t - m.stT > 900) { m.st = 'CHASE'; }
      break;
    }
    case 'RECOVER': {       // 후딜 — 숨 고르기
      playClip(['idle'], true);
      if (t - m.stT > 800) { m.st = 'CHASE'; }
      break;
    }
  }
}


// 텔레그래프 오라
// ── 진천뢰: 지면 예고 원 → flightMs 뒤 폭발. 예고를 보고 비켜서면 피한다 ──
const bombs = [];
const MARK_GEO = new THREE.RingGeometry(0.86, 1, 28);
function lobBomb(x, z) {
  const c = CFG.barrage;
  const mark = new THREE.Mesh(MARK_GEO, new THREE.MeshBasicMaterial({
    color: 0xff5a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(x, 0.06, z);
  mark.scale.setScalar(c.radius);
  sc.add(mark);
  bombs.push({ mark, x, z, at: now() + c.flightMs });
}
function updateBombs(t) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    const left = b.at - t;
    if (left > 0) {
      const k = 1 - left / CFG.barrage.flightMs;
      b.mark.material.opacity = 0.35 + 0.55 * Math.abs(Math.sin(k * Math.PI * 6));   // 임박할수록 빠른 점멸
      continue;
    }
    const pos = new THREE.Vector3(b.x, 0.4, b.z);
    burst(pos, 16, 0xff7a30, 4.4, 480, 0.5);
    burst(pos, 12, 0xffd24a, 3.4, 400, 0.42);
    shockwave(pos, CFG.barrage.radius);
    kick(1.8);
    state.emit('sattoBombExploded', pos);
    const d = Math.hypot(rig.dolly.position.x - b.x, rig.dolly.position.z - b.z);
    if (d < CFG.barrage.radius) damagePlayer(CFG.barrage.dmg, '진천뢰 착탄 — 표시된 자리를 비웠어야 했다');
    if (b.mark.parent) b.mark.parent.remove(b.mark);
    b.mark.material.dispose();
    bombs.splice(i, 1);
  }
}
function clearBombs() {
  for (const b of bombs) { if (b.mark.parent) b.mark.parent.remove(b.mark); b.mark.material.dispose(); }
  bombs.length = 0;
}

let aura = null;
function auraOn(color) {
  auraOff();
  aura = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.y = 1.8; m.group.add(aura);
  state.emit('dangerTelegraph', { group: m.group });
}
function auraOff() { if (aura && aura.parent) aura.parent.remove(aura); aura = null; }
