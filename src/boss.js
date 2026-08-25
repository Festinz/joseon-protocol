// boss.js — 해태 (축소 2페이즈). P1: 포탑 4문 파괴 (중립 TOP 커버).
// P2: 견착 반대편 노드로 강제 이동 → 코어 사이클 + 좌우 교대 명중탄 + 격추 가능 박격.
// 막판: 천장 붕괴 → fieldType open 전환 → 궁극기 해금 (PPTX 규칙과 맞물리는 피날레).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER, DANGER } from './config.js';
import { state, now } from './state.js';
import { instantiate } from './assets.js';
import { registerHittable, spawnDangerShot, creditKill, creditShootdown, creditHit, damagePlayer } from './combat.js';
import { spawnWave } from './enemies.js';
import { rig } from './rail.js';
import { burst, shockwave, kick } from './vfx.js';

const CFG = {
  turretHp: 25, coreHp: 200,
  p1AimMs: 2500, p2CycleMs: 12000, coreOpenMs: 4000, coreMult: 3,
  mortarCount: 3, mortarFlightMs: 2600,
  volleyAltMs: 1500,
  p2AddsEvery: 2,           // 사이클 2회마다 화승병 2 지원
  finaleAt: 0.25,           // 코어 25% → open 전환 + 궁 해금
};

// ── 해태 근접 이동 AI (엘든링 신수 문법: 배회→돌진/도약/할퀴기, 전부 결정론 회피 가능) ──
// 해태 근접 패턴. 거리대마다 답이 다르다.
//   근(<5)    할퀴기 3연격 · 물어뜯기      → 옆으로 빠지거나 회피로 흘린다
//   중(5~11)  도약 강타 · 꼬리 후리기      → 착지 표시 밖으로 / 몸을 붙여 안쪽으로 파고든다
//   원(>11)   돌진 · 증기 브레스           → 옆으로 비켜서거나 기둥을 낀다
//   필살기    포효 후 3중 확장 링          → 링 사이 틈이 아니라 '멀리' 가 답 (텔레그래프가 길다)
const MELEE = {
  boundsX: 16.5, zMin: -139, zMax: -116.5,
  prowlSpeed: 2.4, prowlDist: 10,
  actEveryMs: 5200,
  charge: { teleMs: 850, speed: 15, maxMs: 1500, r: 3.2, dmg: 30, recoverMs: 900 },
  leap:   { teleMs: 950, flyMs: 720, r: 4.8, dmg: 28, recoverMs: 1100 },
  claw:   { range: 7.5, stepMs: 380, swipes: 3, r: 5.4, arcDeg: 140, dmg: 15, recoverMs: 800 },
  bite:   { range: 5.0, teleMs: 480, r: 3.6, arcDeg: 95, dmg: 34, recoverMs: 720, cooldown: 7000 },
  tail:   { teleMs: 620, r: 7.6, dmg: 24, recoverMs: 820, cooldown: 9500 },
  breath: { teleMs: 900, durMs: 1500, range: 17, arcDeg: 42, tickMs: 250, dmg: 8, recoverMs: 1000, cooldown: 12000 },
  nova:   { teleMs: 1600, rings: 3, r0: 5.5, dr: 4.6, gapMs: 340, dmg: 38, recoverMs: 1700 },
};

let aura = null, auraMesh = null;
function showAura(x, z, r, ms, color = 0xff5a2a) {
  if (!auraMesh) {
    auraMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.visible = false;
    sc.add(auraMesh);
  }
  auraMesh.material.color.set(color);
  auraMesh.position.set(x, 0.07, z);
  auraMesh.visible = true;
  aura = { start: now(), ms, r };
}
function updateAura() {
  if (!aura || !auraMesh) return;
  const k = (now() - aura.start) / aura.ms;
  if (k >= 1) { auraMesh.visible = false; aura = null; return; }
  auraMesh.scale.setScalar(aura.r * (0.35 + 0.65 * k));
  auraMesh.material.opacity = 0.9 - k * 0.5;
}

let boss = null; // { group, phase, turrets:[], core, coreOpen, timers... }
let sc = null;

export function initBossScene(scene) { sc = scene; }
export function bossActive() { return !!boss && boss.phase > 0; }

export function initBossFight(node, isContinue = false) {
  if (boss && !isContinue) return;
  if (!boss) {
    const group = instantiate('gobungi');
    group.position.set(0, 0, -134);
    group.scale.setScalar(1.5); // 위압감 — 히트 프록시·포탑 월드 좌표는 자동 반영
    sc.add(group);
    const inner = group.children[0];
    // Meshy 해태 GLB 스왑 (게임플레이 파츠는 절차 유지 — 실패 시 구 몸체 폴백)
    const repositionParts = () => {
      // 포탑 4문 → 해태 어깨/둔부 마운트, 코어 → 가슴 (텍스처의 발광 코어 위치)
      const mounts = [[-1.35, 2.35, 0.75], [1.35, 2.35, 0.75], [-1.15, 1.95, -1.0], [1.15, 1.95, -1.0]];
      for (let i = 0; i < 4; i++) {
        const t = inner.getObjectByName('turret' + i);
        const hit = inner.getObjectByName('hitTurret' + i);
        if (t) t.position.set(...mounts[i]);
        if (hit) hit.position.set(...mounts[i]);
      }
      // 코어를 해태 GLB 의 가슴 정중앙에 붙인다.
      // 이전에는 좌표를 chestCore(로컬 y3.0 / z-1.15) 기준으로 줘서 코어가 몸 위 허공에 떠 있었다.
      // → chestCore 자체를 옮기고, 자식들은 판(lid) 기준 로컬 오프셋만 갖게 한다.
      // 실측(런타임 레이캐스트): 몸통 전면 z≈-131.3, 몸 중심 y≈2.5, anchor(0,0,-133.6) · scale 1.5
      const chest = inner.getObjectByName('chestCore');
      if (chest) {
        chest.position.set(0, 1.67, 1.63);     // = 월드 (0, 2.5, -131.15) — 가슴 표면 바로 앞
        chest.rotation.set(0, 0, 0);
        // 치수도 함께 축소 — 원래 값은 절차 고붕이(≈7m)용이라 해태를 통째로 덮어버린다
        const lid = inner.getObjectByName('coreLid');
        if (lid) { lid.position.set(0, 0, 0); lid.scale.set(0.62, 0.62, 0.10); lid.userData.baseY = 0; lid.userData.rise = 0.6; }
        const orb = inner.getObjectByName('coreOrb');
        if (orb) { orb.position.set(0, 0, 0.10); orb.scale.set(0.36, 0.36, 0.26); } // 월드 지름 ≈0.54m
        const hc2 = inner.getObjectByName('hitCore');
        if (hc2) { hc2.position.set(0, 0, 0.05); hc2.scale.set(0.62, 0.62, 0.50); }   // 판정은 넉넉히
        const rg = inner.getObjectByName('coreRing');
        if (rg) { rg.position.set(0, 0, 0.14); rg.userData.base = 0.45; }             // 맥동 배율의 기준값
      }
      const hc = inner.getObjectByName('headCore'); if (hc) hc.visible = false;
    };
    const swapBody = (path, scale) => new GLTFLoader().load(path, (g) => {
      const body = inner.getObjectByName('body'); if (body) body.visible = false;
      g.scene.scale.setScalar(scale);
      g.scene.traverse(o => { if (o.isMesh && o.material) { o.material.roughness = Math.min(0.9, o.material.roughness ?? 0.8); } });
      inner.add(g.scene);
      if (path.includes('haetae')) repositionParts();
    }, undefined, () => { if (path.includes('haetae')) swapBody('assets/models/gobungi_body.glb?v=2', 0.78); });
    swapBody('assets/models/haetae.glb?v=2', 1.0);
    const turrets = [];
    for (let i = 0; i < 4; i++) {
      const t = inner.getObjectByName('turret' + i);
      const hit = inner.getObjectByName('hitTurret' + i);
      const actor = { alive: true, headOnly: false, hp: CFG.turretHp, isTurret: true,
        onHit: (part, dmg) => { actor.hp -= dmg; state.emit('bossPartHit', t); emitBossHp();
          if (actor.hp <= 0 && actor.alive) { actor.alive = false; t.visible = false;
            creditKill({ score: 300, weak: true }); state.emit('turretDestroyed', i);
          } } };
      hit.userData.actor = actor; registerHittable(hit, actor);
      turrets.push({ obj: t, actor });
    }
    const coreHit = inner.getObjectByName('hitCore');
    const coreLid = inner.getObjectByName('coreLid');
    const coreOrb = inner.getObjectByName('coreOrb');
    const coreRing = inner.getObjectByName('coreRing');
    const headCore = inner.getObjectByName('headCore');
    const coreActor = { alive: true, headOnly: false, hp: CFG.coreHp, isCore: true,
      onHit: (part, dmg) => {
        if (!boss.coreOpen) { state.emit('shotBlockedByShield', {}); return; }
        creditHit();                        // 궁극기 게이지 — 보스전에도 재충전 경로가 있어야 한다
        coreActor.hp -= dmg * CFG.coreMult; // dmg 는 무기·콤보 반영값, 코어는 ×3
        state.emit('bossCoreHit', coreActor.hp / CFG.coreHp);
        emitBossHp();
        checkFinale();
        if (coreActor.hp <= 0 && coreActor.alive) { coreActor.alive = false; defeat(); }
      } };
    coreHit.userData.actor = coreActor; registerHittable(coreHit, coreActor);
    // 해태 몸통(하체) 히트 프록시 — 아무데나 맞아도 피해가 든다 (코어 창 ×3 보너스는 유지)
    // 코어(y1.45 z1.35)·포탑(y≥1.95) 프록시를 가리지 않도록 하체 영역만 덮는다
    const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 3.0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    bodyHit.position.set(0, 0.8, -0.2);
    inner.add(bodyHit);
    const bodyActor = { alive: true, headOnly: false, isBossBody: true,
      onHit: (part, dmg) => {
        if (!boss || boss.phase === 0 || !coreActor.alive) return;
        creditHit();                        // 몸샷도 게이지는 준다 (코어 창을 못 잡아도 회복 가능)
        coreActor.hp -= dmg * (boss.coreOpen ? 1.2 : 0.35); // 몸샷 감쇠 — 코어 창이 항상 최적
        state.emit('bossPartHit', bodyHit);
        emitBossHp();
        checkFinale();
        if (coreActor.hp <= 0 && coreActor.alive) { coreActor.alive = false; defeat(); }
      } };
    bodyHit.userData.actor = bodyActor; registerHittable(bodyHit, bodyActor);
    boss = { group, inner, turrets, coreActor, coreLid, coreOrb, coreRing, headCore,
             phase: 1, coreOpen: false, nextAct: now() + 2500, cycleN: 0, finale: false,
             mortarsAlive: 0,
             mv: { mode: 'PROWL', until: 0, nextMeleeAt: now() + 4200, target: new THREE.Vector3(),
                   from: new THREE.Vector3(), dir: new THREE.Vector3(), hitDone: false, swipeN: 0,
                   yaw: 0, bob: 0,
                   lastBite: 0, lastTail: 0, lastBreath: 0, nextTick: 0, ringN: 0, novaUsed: 0 } };
    setCoreOpen(false);
  }
  boss.nextAct = now() + 2500;
  state.emit('bossStarted');
  emitBossHp();
  state.emit('bannerShow', '해태 — 궁을 삼킨 증기 신수');
}

const CORE_OPEN_COL = 0x9fd8d4, CORE_SHUT_COL = 0xd8a03a;   // 열림=증기 청록 / 닫힘=잠긴 호박색
function setCoreOpen(open) {
  boss.coreOpen = open;
  // 뚜껑이 올라가는 높이 — 절차 고붕이는 1.3, 해태 GLB 는 몸집이 작아 덜 올린다 (repositionParts 가 지정)
  boss.coreLid.position.y = (boss.coreLid.userData.baseY || 0) + (open ? (boss.coreLid.userData.rise ?? 1.3) : 0);
  const col = open ? CORE_OPEN_COL : CORE_SHUT_COL;
  boss.coreOrb.material.color.setHex(col);
  boss.coreOrb.material.emissive.setHex(col);
  boss.coreOrb.material.emissiveIntensity = open ? 1.6 : 0.4;
  for (const n of ['coreGlow1', 'coreGlow2']) {
    const g = boss.coreOrb.getObjectByName(n); if (g) g.material.color.setHex(col);
  }
  if (boss.coreRing) boss.coreRing.material.color.setHex(col);
  state.emit('bossCoreState', open);
}

// 코어 맥동 — 열렸을 땐 빠르고 밝게(=쳐라), 닫혔을 땐 느리고 어둡게(=아직이다)
function updateCoreGlow(t) {
  const c = boss.coreOrb; if (!c) return;
  const open = boss.coreOpen;
  const pulse = 0.5 + 0.5 * Math.sin(t * (open ? 0.009 : 0.0034));
  c.material.emissiveIntensity = open ? 1.15 + pulse * 1.5 : 0.32 + pulse * 0.34;
  const g1 = c.getObjectByName('coreGlow1'), g2 = c.getObjectByName('coreGlow2');
  if (g1) { g1.material.opacity = (open ? 0.30 : 0.10) + pulse * (open ? 0.32 : 0.07); g1.scale.setScalar(1.95 + pulse * (open ? 0.45 : 0.12)); }
  if (g2) { g2.material.opacity = (open ? 0.14 : 0.05) + pulse * (open ? 0.18 : 0.04); g2.scale.setScalar(3.10 + pulse * (open ? 0.9 : 0.2)); }
  const r = boss.coreRing;
  if (r) {
    r.rotation.z = t * (open ? 0.0022 : 0.0007);
    r.material.opacity = (open ? 0.55 : 0.22) + pulse * (open ? 0.40 : 0.10);
    const s = ((open ? 1.9 : 1.65) + pulse * (open ? 0.55 : 0.12)) * (r.userData.base ?? 1);
    r.scale.set(s, s, s);
  }
}

function turretsLeft() { return boss.turrets.filter(t => t.actor.alive).length; }

// 필살기는 HP 문턱(65% / 35%)을 지날 때 각 1회. 난사되면 회피 게임이 아니라 운이 된다.
const NOVA_AT = [0.65, 0.35];
function novaDue() {
  if (!boss || boss.phase !== 2) return false;              // P2 부터만
  const r = Math.max(0, boss.coreActor.hp) / CFG.coreHp;
  const idx = boss.mv.novaUsed;
  return idx < NOVA_AT.length && r <= NOVA_AT[idx];
}

// 통합 보스 HP: 포탑 30% + 코어 70% — "쏘면 바가 닳는다"를 항상 보장
function emitBossHp() {
  if (!boss) return;
  const t = boss.turrets.reduce((s, x) => s + Math.max(0, x.actor.hp), 0) / (4 * CFG.turretHp);
  const c = Math.max(0, boss.coreActor.hp) / CFG.coreHp;
  state.emit('bossHpRatio', t * 0.3 + c * 0.7);
}

function checkFinale() {
  if (boss.finale || boss.coreActor.hp / CFG.coreHp > CFG.finaleAt) return;
  boss.finale = true;
  state.node.fieldType = 'open';                  // 천장 붕괴 → 하늘 개방
  state.emit('fieldTypeChanged', 'open');
  state.emit('bannerShow', '하늘이 열렸다 — 폭격 유도 가능!');
  state.emit('bossFinale');
}

function defeat() {
  state.emit('bossDefeated');
  state.emit('bannerShow', '해태 격파 — 경복궁 수복');
  boss.phase = 0;
  // phase 0 이면 updateBoss 가 멈춰 코어가 켜진 채로 굳는다. 시체 가슴에 "여기를 쳐라" 가
  // 계속 빛나고 있으면 승리 신호가 흐려진다 → 코어를 꺼서 격파를 눈으로 확정한다.
  extinguishCore();
  setTimeout(() => state.emit('runComplete'), 2600);
}

function extinguishCore() {
  if (!boss) return;
  const c = boss.coreOrb;
  if (c) {
    c.material.emissiveIntensity = 0;
    c.material.color.setHex(0x2b2b2e);
    for (const n of ['coreGlow1', 'coreGlow2']) {
      const g = c.getObjectByName(n); if (g) g.visible = false;
    }
  }
  if (boss.coreRing) boss.coreRing.visible = false;
}

export function bossTakeUltDamage(dmg) {
  if (!boss || boss.phase === 0) return;
  if (boss.phase === 1) { // P1 궁: 남은 포탑 일괄 반파
    for (const t of boss.turrets) if (t.actor.alive) t.actor.onHit('hit', CFG.turretHp / 2);
  } else {
    boss.coreActor.hp -= dmg; state.emit('bossCoreHit', boss.coreActor.hp / CFG.coreHp);
    checkFinale();
    if (boss.coreActor.hp <= 0 && boss.coreActor.alive) { boss.coreActor.alive = false; defeat(); }
  }
  emitBossHp();
}

export function bossBodyPos() { return boss ? boss.group.position : null; }

export function updateBoss(dt) {
  if (!boss || boss.phase === 0 || state.player.state === 'DEAD') return;
  const t = now();

  updateMelee(dt);   // 해태 근접 이동/돌진/도약/할퀴기 — 사격 패턴과 병행
  updateAura();
  updateCoreGlow(t);  // 가슴 코어 발광 — 때릴 곳 유도

  if (boss.phase === 1) {
    // P1: 포탑 로테이션 명중탄
    if (t >= boss.nextAct) {
      const alive = boss.turrets.filter(x => x.actor.alive);
      if (alive.length) {
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        const from = new THREE.Vector3(); shooter.obj.getWorldPosition(from);
        state.emit('dangerTelegraph', { group: shooter.obj });
        setTimeout(() => { if (shooter.actor.alive) spawnDangerShot(from, {}); }, DANGER.telegraphMs);
      }
      boss.nextAct = t + CFG.p1AimMs;
    }
    if (turretsLeft() === 0) startPhase2();
  } else if (boss.phase === 2) {
    if (t >= boss.nextAct) runCycle();
  }
}

// ── 해태 이동 상태기계 ──────────────────────────────────────────
const _toP = new THREE.Vector3(), _v3 = new THREE.Vector3();
function updateMelee(dt) {
  const dts = Math.min(0.05, dt / 1000);
  const t = now();
  const g = boss.group, mv = boss.mv;
  const pp = rig.dolly.position;
  _toP.set(pp.x - g.position.x, 0, pp.z - g.position.z);
  const dist = _toP.length();

  // 기본은 플레이어를 바라본다 (돌진 중엔 돌진 방향)
  let faceYaw = Math.atan2(_toP.x, _toP.z);
  let tiltX = 0, crouchY = 0, rollZ = null, yawWhip = 0;

  if (mv.mode === 'PROWL') {
    // 스토킹: 선호 거리 유지 + 좌우 배회 — 살아있는 맹수의 문법
    const dirX = _toP.x / (dist || 1), dirZ = _toP.z / (dist || 1);
    const want = dist > MELEE.prowlDist + 1.5 ? 1 : (dist < MELEE.prowlDist - 2.5 ? -0.55 : 0.15);
    const sway = Math.sin(t * 0.0009) * 1.1;               // 측면 배회
    const vx = dirX * want * MELEE.prowlSpeed + (-dirZ) * sway;
    const vz = dirZ * want * MELEE.prowlSpeed + (dirX) * sway;
    g.position.x += vx * dts; g.position.z += vz * dts;
    mv.bob += dts * (2.5 + Math.abs(want) * 4);
    crouchY = -0.12;                                       // 스토킹 자세로 살짝 낮게
    rollZ = Math.sin(mv.bob * 0.5) * 0.085;                // 네발짐승 활보 — 롤을 깊게
    if (t >= mv.nextMeleeAt) {
      mv.target.copy(pp);
      if (novaDue()) {                                      // 필살기 — HP 문턱을 넘을 때 1회씩
        mv.mode = 'TELE_NOVA'; mv.until = t + MELEE.nova.teleMs; mv.ringN = 0; mv.novaUsed += 1;
        showAura(g.position.x, g.position.z, MELEE.nova.r0 + MELEE.nova.dr * MELEE.nova.rings,
                 MELEE.nova.teleMs, 0xff2a2a);
        state.emit('bossNovaTelegraph');
        state.emit('bannerShow', '해태가 포효한다 — 멀리 물러서라!');
      } else if (dist < MELEE.bite.range && t - mv.lastBite > MELEE.bite.cooldown) {
        mv.mode = 'TELE_BITE'; mv.until = t + MELEE.bite.teleMs; mv.lastBite = t;
        state.emit('dangerTelegraph', { group: boss.inner });
      } else if (dist < MELEE.claw.range) {                 // 근접: 할퀴기 연격 (엇박)
        mv.mode = 'CLAW'; mv.swipeN = 0; mv.until = t + MELEE.claw.stepMs;
      } else if (dist < 11 && t - mv.lastTail > MELEE.tail.cooldown) {
        mv.mode = 'TELE_TAIL'; mv.until = t + MELEE.tail.teleMs; mv.lastTail = t;
        showAura(g.position.x, g.position.z, MELEE.tail.r, MELEE.tail.teleMs, 0xffa030);
      } else if (dist > 11 && t - mv.lastBreath > MELEE.breath.cooldown) {
        mv.mode = 'TELE_BREATH'; mv.until = t + MELEE.breath.teleMs; mv.lastBreath = t;
        state.emit('dangerTelegraph', { group: boss.inner });
      } else if (dist > 13 || Math.random() < 0.55) {       // 원거리: 돌진
        mv.mode = 'TELE_CHARGE'; mv.until = t + MELEE.charge.teleMs;
        showAura(g.position.x, g.position.z, 3.4, MELEE.charge.teleMs);
        state.emit('dangerTelegraph', { group: boss.inner });
      } else {                                              // 중거리: 도약 강타
        mv.mode = 'TELE_LEAP'; mv.until = t + MELEE.leap.teleMs;
        showAura(mv.target.x, mv.target.z, MELEE.leap.r, MELEE.leap.teleMs, 0xffa030);
        state.emit('dangerTelegraph', { group: boss.inner });
      }
    }
  } else if (mv.mode === 'TELE_CHARGE') {
    crouchY = -0.45; tiltX = -0.1;                          // 웅크림 예고
    mv.bob += dts * 14;                                     // 부르르 떨림
    if (t >= mv.until) {
      mv.dir.set(pp.x - g.position.x, 0, pp.z - g.position.z).normalize(); // 발사 순간 방향 고정 → 옆으로 피한다
      mv.mode = 'CHARGE'; mv.until = t + MELEE.charge.maxMs; mv.hitDone = false;
    }
  } else if (mv.mode === 'CHARGE') {
    faceYaw = Math.atan2(mv.dir.x, mv.dir.z);
    tiltX = 0.16;                                           // 앞으로 쏠린 질주
    g.position.x += mv.dir.x * MELEE.charge.speed * dts;
    g.position.z += mv.dir.z * MELEE.charge.speed * dts;
    mv.bob += dts * 16;
    if (!mv.hitDone && dist < MELEE.charge.r) { mv.hitDone = true; damagePlayer(MELEE.charge.dmg, '해태 돌진'); }
    const hitWall = Math.abs(g.position.x) > MELEE.boundsX || g.position.z < MELEE.zMin || g.position.z > MELEE.zMax;
    if (t >= mv.until || hitWall) { mv.mode = 'RECOVER'; mv.until = t + MELEE.charge.recoverMs; }
  } else if (mv.mode === 'TELE_LEAP') {
    crouchY = -0.6; tiltX = -0.18;
    if (t >= mv.until) {
      mv.from.copy(g.position);
      mv.mode = 'LEAP'; mv.until = t + MELEE.leap.flyMs;
    }
  } else if (mv.mode === 'LEAP') {
    const k = 1 - Math.max(0, mv.until - t) / MELEE.leap.flyMs;
    g.position.x = mv.from.x + (mv.target.x - mv.from.x) * k;
    g.position.z = mv.from.z + (mv.target.z - mv.from.z) * k;
    boss.inner.position.y = Math.sin(Math.min(1, k) * Math.PI) * 5;
    tiltX = 0.22 - k * 0.4;
    rollZ = Math.sin(k * Math.PI) * 0.12;                  // 도약 중 몸을 살짝 비튼다
    faceYaw = Math.atan2(mv.target.x - mv.from.x, mv.target.z - mv.from.z);
    if (k >= 1) {
      boss.inner.position.y = 0;
      showAura(g.position.x, g.position.z, MELEE.leap.r, 340, 0xffd060);   // 착지 충격파
      state.emit('ultStrike');                                             // 화면 섬광 재사용
      const d2 = Math.hypot(pp.x - g.position.x, pp.z - g.position.z);
      if (d2 < MELEE.leap.r) damagePlayer(MELEE.leap.dmg, '해태 강하 충격파');
      mv.mode = 'RECOVER'; mv.until = t + MELEE.leap.recoverMs;
    }
  } else if (mv.mode === 'CLAW') {
    // 3연격 엇박: 한 발짝 파고들며 전방 부채꼴 휘두르기
    tiltX = 0.08;
    // 휘두른 직후 몸이 반대로 채이는 스냅 — 좌우 교대라 3연격이 눈으로 세어진다
    const sinceSwipe = Math.max(0, MELEE.claw.stepMs - (mv.until - t));
    const whip = Math.max(0, 1 - sinceSwipe / 240);
    const side = (mv.swipeN % 2) ? 1 : -1;
    yawWhip = side * whip * 0.42;
    rollZ = -side * whip * 0.30;
    crouchY = -0.15 * whip;
    if (t >= mv.until) {
      mv.swipeN += 1;
      const dirX = _toP.x / (dist || 1), dirZ = _toP.z / (dist || 1);
      g.position.x += dirX * 1.3; g.position.z += dirZ * 1.3;             // 러닝 스텝
      const ang = Math.abs(((Math.atan2(_toP.x, _toP.z) - faceYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (dist < MELEE.claw.r && ang < MELEE.claw.arcDeg * Math.PI / 360) damagePlayer(MELEE.claw.dmg, '해태 할퀴기');
      showAura(g.position.x + dirX * 2.2, g.position.z + dirZ * 2.2, 2.6, 260, 0xff7040);
      // 엇박: 2타→3타 간격이 1.6배 (사또와 같은 문법)
      mv.until = t + MELEE.claw.stepMs * (mv.swipeN === 2 ? 1.6 : 1);
      if (mv.swipeN >= MELEE.claw.swipes) { mv.mode = 'RECOVER'; mv.until = t + MELEE.claw.recoverMs; }
    }
  } else if (mv.mode === 'TELE_BITE') {      // 근접: 목을 뒤로 당겼다가
    crouchY = -0.3; tiltX = -0.22;
    if (t >= mv.until) {
      mv.mode = 'BITE'; mv.until = t + 160; mv.hitDone = false;
    }
  } else if (mv.mode === 'BITE') {           // 물어뜯기 — 전방 좁은 부채꼴 · 단발 고데미지
    tiltX = 0.3; crouchY = 0.15;
    if (!mv.hitDone) {
      mv.hitDone = true;
      const c = MELEE.bite;
      const ang = Math.abs(((Math.atan2(_toP.x, _toP.z) - faceYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (dist < c.r && ang < c.arcDeg * Math.PI / 360) damagePlayer(c.dmg, '해태의 이빨 — 옆으로 빠졌어야 했다');
      const dirX = _toP.x / (dist || 1), dirZ = _toP.z / (dist || 1);
      showAura(g.position.x + dirX * 2.0, g.position.z + dirZ * 2.0, 2.2, 220, 0xff3020);
      state.emit('bossBite');
    }
    if (t >= mv.until) { mv.mode = 'RECOVER'; mv.until = t + MELEE.bite.recoverMs; }
  } else if (mv.mode === 'TELE_TAIL') {      // 중거리: 몸을 비틀어 꼬리를 감는다
    crouchY = -0.18; rollZ = Math.sin((mv.until - t) * 0.02) * 0.18;
    if (t >= mv.until) {
      const c = MELEE.tail;
      shockwave(g.position.clone(), c.r);
      burst(g.position.clone().setY(1.0), 26, 0xffa050, 4.6, 520, 0.45);
      kick(2.4);
      if (dist < c.r) damagePlayer(c.dmg, '해태의 꼬리 후리기 — 안쪽으로 파고들었어야 했다');
      state.emit('bossTail');
      mv.mode = 'RECOVER'; mv.until = t + c.recoverMs;
    }
  } else if (mv.mode === 'TELE_BREATH') {    // 원거리: 목을 부풀리고 증기를 모은다
    crouchY = -0.1; tiltX = -0.16;
    if (t >= mv.until) { mv.mode = 'BREATH'; mv.until = t + MELEE.breath.durMs; mv.nextTick = t; }
  } else if (mv.mode === 'BREATH') {         // 증기 브레스 — 전방 원뿔 지속. 옆으로 비켜야 한다
    tiltX = 0.1;
    const c = MELEE.breath;
    if (t >= mv.nextTick) {
      mv.nextTick = t + c.tickMs;
      const dirX = Math.sin(mv.yaw), dirZ = Math.cos(mv.yaw);
      for (let s = 1; s <= 4; s++) {
        const d = s * (c.range / 5);
        burst(_v3.set(g.position.x + dirX * d, 1.4 + s * 0.1, g.position.z + dirZ * d),
              5, 0x9fd8d4, 2.6, 520, 0.5);
      }
      const ang = Math.abs(((Math.atan2(_toP.x, _toP.z) - faceYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (dist < c.range && ang < c.arcDeg * Math.PI / 360) damagePlayer(c.dmg, '증기 브레스 — 사선에서 비켜라');
      state.emit('bossBreath');
    }
    if (t >= mv.until) { mv.mode = 'RECOVER'; mv.until = t + c.recoverMs; }
  } else if (mv.mode === 'TELE_NOVA') {      // 필살기 예고 — 몸을 낮췄다가 부풀린다
    const k = 1 - (mv.until - t) / MELEE.nova.teleMs;
    crouchY = -0.55 + k * 0.9; tiltX = -0.25 + k * 0.35;
    mv.bob += dts * (6 + k * 20);
    if (t >= mv.until) { mv.mode = 'NOVA'; mv.ringN = 0; mv.nextTick = t; }
  } else if (mv.mode === 'NOVA') {           // 3중 확장 링 — 반경이 커지므로 '멀리' 가 유일한 답
    tiltX = 0.18;
    if (t >= mv.nextTick && mv.ringN < MELEE.nova.rings) {
      const c = MELEE.nova;
      const R = c.r0 + c.dr * mv.ringN;
      mv.ringN += 1;
      mv.nextTick = t + c.gapMs;
      shockwave(g.position.clone(), R);
      burst(g.position.clone().setY(0.8), 18, 0xff5a2a, R * 0.9, 560, 0.5);
      kick(3.0);
      // 링 폭 안에 있으면 피격 (안쪽은 이미 지나갔고, 바깥은 아직)
      if (Math.abs(dist - R) < 2.6) damagePlayer(c.dmg, '해태의 포효 — 링에 휩쓸렸다');
      state.emit('bossNovaRing', mv.ringN);
    }
    if (mv.ringN >= MELEE.nova.rings && t >= mv.nextTick) {
      mv.mode = 'RECOVER'; mv.until = t + MELEE.nova.recoverMs;
    }
  } else if (mv.mode === 'RECOVER') {
    crouchY = -0.2;
    mv.bob += dts * 1.4;                                   // 느리고 큰 숨 — 빈틈이라는 신호
    tiltX = 0.05 + Math.sin(t * 0.006) * 0.035;            // 어깨를 들썩인다
    rollZ = Math.sin(t * 0.005) * 0.03;
    if (t >= mv.until) {
      mv.mode = 'PROWL';
      mv.nextMeleeAt = t + MELEE.actEveryMs * (0.8 + Math.random() * 0.45) * (boss.finale ? 0.7 : 1);
    }
  }

  // 경기장 경계 클램프
  g.position.x = Math.max(-MELEE.boundsX, Math.min(MELEE.boundsX, g.position.x));
  g.position.z = Math.max(MELEE.zMin, Math.min(MELEE.zMax, g.position.z));

  // 절차 애니메이션: 갤럽 바운스 + 회전/기울기 보간 (GLB 무애니 대체)
  if (mv.mode !== 'LEAP') boss.inner.position.y = crouchY + Math.abs(Math.sin(mv.bob)) * 0.28 + Math.sin(t * 0.0012) * 0.1;
  const dy = ((faceYaw - mv.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  mv.yaw += dy * Math.min(1, dts * (mv.mode === 'CHARGE' ? 2.5 : 5));
  g.rotation.y = mv.yaw + yawWhip;                         // 할퀴기 스냅은 목표 조준과 별개로 얹는다
  boss.inner.rotation.x += (tiltX - boss.inner.rotation.x) * Math.min(1, dts * 8);
  const targetRoll = rollZ === null ? Math.sin(mv.bob * 0.5) * 0.045 : rollZ;
  boss.inner.rotation.z += (targetRoll - boss.inner.rotation.z) * Math.min(1, dts * 12);
}

function startPhase2() {
  boss.phase = 2; boss.cycleN = 0;
  state.emit('bannerShow', '해태가 진노한다 — 코어가 열릴 때 노려라!');
  state.player.invulnUntil = now() + 1400;
  boss.nextAct = now() + 3000;
}

function runCycle() {
  const t = now();
  boss.cycleN += 1;
  const c = boss.cycleN;

  // 1) 코어 개방 (딜 창)
  setCoreOpen(true);
  setTimeout(() => setCoreOpen(false), CFG.coreOpenMs);

  // 2) 좌우 교대 명중탄 볼리 (견착 페이오프 — 코어 창이 닫힌 후)
  const volleys = boss.finale ? 4 : 3;
  for (let i = 0; i < volleys; i++) {
    setTimeout(() => {
      if (!boss || boss.phase !== 2) return;
      const side = i % 2 === 0 ? -1 : 1;
      const from = boss.group.position.clone().add(new THREE.Vector3(side * 2.4, 3.4, 1));
      state.emit('dangerTelegraph', { group: boss.inner });
      setTimeout(() => spawnDangerShot(from, {}), DANGER.telegraphMs);
    }, CFG.coreOpenMs + 600 + i * CFG.volleyAltMs);
  }

  // 3) 격추 가능 박격 (TC 투척물 문법) — thrower 로직 재사용 대신 간이 스폰
  setTimeout(() => { if (boss && boss.phase === 2) state.emit('bossMortar', CFG.mortarCount); }, CFG.coreOpenMs + 1200);

  // 4) 지원 잡졸 (사이클 2회마다)
  if (c % CFG.p2AddsEvery === 0 && state.node) {
    spawnWave(state.node, [
      { type: 'grunt', dir: 'FL', delay: 0.5 },
      { type: 'grunt', dir: 'FR', delay: 1.0 },
    ]);
  }
  boss.nextAct = t + CFG.p2CycleMs;
}

export function resetBoss() {
  if (boss?.group?.parent) boss.group.parent.remove(boss.group);
  if (auraMesh) auraMesh.visible = false;
  aura = null;
  boss = null;
}
