// boss.js — 고붕이 (축소 2페이즈). P1: 포탑 4문 파괴 (중립 TOP 커버).
// P2: 견착 반대편 노드로 강제 이동 → 코어 사이클 + 좌우 교대 명중탄 + 격추 가능 박격.
// 막판: 천장 붕괴 → fieldType open 전환 → 궁극기 해금 (PPTX 규칙과 맞물리는 피날레).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER, DANGER } from './config.js';
import { state, now } from './state.js';
import { instantiate } from './assets.js';
import { registerHittable, spawnDangerShot, creditKill, creditShootdown, damagePlayer } from './combat.js';
import { spawnWave } from './enemies.js';
import { rig } from './rail.js';

const CFG = {
  turretHp: 25, coreHp: 200,
  p1AimMs: 2500, p2CycleMs: 12000, coreOpenMs: 4000, coreMult: 3,
  mortarCount: 3, mortarFlightMs: 2600,
  volleyAltMs: 1500,
  p2AddsEvery: 2,           // 사이클 2회마다 화승병 2 지원
  finaleAt: 0.25,           // 코어 25% → open 전환 + 궁 해금
};

// ── 해태 근접 이동 AI (엘든링 신수 문법: 배회→돌진/도약/할퀴기, 전부 결정론 회피 가능) ──
const MELEE = {
  boundsX: 16.5, zMin: -139, zMax: -116.5,
  prowlSpeed: 2.4, prowlDist: 10,
  actEveryMs: 5200,
  charge: { teleMs: 850, speed: 15, maxMs: 1500, r: 3.2, dmg: 30, recoverMs: 900 },
  leap:   { teleMs: 950, flyMs: 720, r: 4.8, dmg: 28, recoverMs: 1100 },
  claw:   { range: 7.5, stepMs: 380, swipes: 3, r: 5.4, arcDeg: 140, dmg: 15, recoverMs: 800 },
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
    // Meshy GLB 몸체 스왑 (게임플레이 파츠는 절차 유지 — 실패해도 무결)
    new GLTFLoader().load('assets/models/gobungi_body.glb?v=2', (g) => {
      const body = inner.getObjectByName('body'); if (body) body.visible = false;
      g.scene.scale.setScalar(0.78);
      g.scene.traverse(o => { if (o.isMesh && o.material) { o.material.roughness = Math.min(0.9, o.material.roughness ?? 0.8); } });
      inner.add(g.scene);
    }, undefined, () => {});
    const turrets = [];
    for (let i = 0; i < 4; i++) {
      const t = inner.getObjectByName('turret' + i);
      const hit = inner.getObjectByName('hitTurret' + i);
      const actor = { alive: true, headOnly: false, hp: CFG.turretHp, isTurret: true,
        onHit: (part, dmg) => { actor.hp -= dmg; state.emit('bossPartHit', t);
          if (actor.hp <= 0 && actor.alive) { actor.alive = false; t.visible = false;
            creditKill({ score: 300, weak: true }); state.emit('turretDestroyed', i);
          } } };
      hit.userData.actor = actor; registerHittable(hit, actor);
      turrets.push({ obj: t, actor });
    }
    const coreHit = inner.getObjectByName('hitCore');
    const coreLid = inner.getObjectByName('coreLid');
    const coreOrb = inner.getObjectByName('coreOrb');
    const headCore = inner.getObjectByName('headCore');
    const coreActor = { alive: true, headOnly: false, hp: CFG.coreHp, isCore: true,
      onHit: (part, dmg) => {
        if (!boss.coreOpen) { state.emit('shotBlockedByShield', {}); return; }
        coreActor.hp -= dmg * CFG.coreMult; // dmg 는 무기·콤보 반영값, 코어는 ×3
        state.emit('bossCoreHit', coreActor.hp / CFG.coreHp);
        checkFinale();
        if (coreActor.hp <= 0 && coreActor.alive) { coreActor.alive = false; defeat(); }
      } };
    coreHit.userData.actor = coreActor; registerHittable(coreHit, coreActor);
    boss = { group, inner, turrets, coreActor, coreLid, coreOrb, headCore,
             phase: 1, coreOpen: false, nextAct: now() + 2500, cycleN: 0, finale: false,
             mortarsAlive: 0,
             mv: { mode: 'PROWL', until: 0, nextMeleeAt: now() + 4200, target: new THREE.Vector3(),
                   from: new THREE.Vector3(), dir: new THREE.Vector3(), hitDone: false, swipeN: 0,
                   yaw: 0, bob: 0 } };
    setCoreOpen(false);
  }
  boss.nextAct = now() + 2500;
  state.emit('bossStarted');
  state.emit('bannerShow', '해태 — 궁을 삼킨 증기 신수');
}

function setCoreOpen(open) {
  boss.coreOpen = open;
  boss.coreLid.position.y = open ? 1.3 : 0;
  boss.coreOrb.material.emissiveIntensity = open ? 1.6 : 0.4;
  state.emit('bossCoreState', open);
}

function turretsLeft() { return boss.turrets.filter(t => t.actor.alive).length; }

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
  setTimeout(() => state.emit('runComplete'), 2600);
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
}

export function bossBodyPos() { return boss ? boss.group.position : null; }

export function updateBoss(dt) {
  if (!boss || boss.phase === 0 || state.player.state === 'DEAD') return;
  const t = now();

  updateMelee(dt);   // 해태 근접 이동/돌진/도약/할퀴기 — 사격 패턴과 병행
  updateAura();

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
const _toP = new THREE.Vector3();
function updateMelee(dt) {
  const dts = Math.min(0.05, dt / 1000);
  const t = now();
  const g = boss.group, mv = boss.mv;
  const pp = rig.dolly.position;
  _toP.set(pp.x - g.position.x, 0, pp.z - g.position.z);
  const dist = _toP.length();

  // 기본은 플레이어를 바라본다 (돌진 중엔 돌진 방향)
  let faceYaw = Math.atan2(_toP.x, _toP.z);
  let tiltX = 0, crouchY = 0;

  if (mv.mode === 'PROWL') {
    // 스토킹: 선호 거리 유지 + 좌우 배회 — 살아있는 맹수의 문법
    const dirX = _toP.x / (dist || 1), dirZ = _toP.z / (dist || 1);
    const want = dist > MELEE.prowlDist + 1.5 ? 1 : (dist < MELEE.prowlDist - 2.5 ? -0.55 : 0.15);
    const sway = Math.sin(t * 0.0009) * 1.1;               // 측면 배회
    const vx = dirX * want * MELEE.prowlSpeed + (-dirZ) * sway;
    const vz = dirZ * want * MELEE.prowlSpeed + (dirX) * sway;
    g.position.x += vx * dts; g.position.z += vz * dts;
    mv.bob += dts * (2.5 + Math.abs(want) * 4);
    if (t >= mv.nextMeleeAt) {
      mv.target.copy(pp);
      if (dist < MELEE.claw.range) {                        // 근접: 할퀴기 연격 (엇박)
        mv.mode = 'CLAW'; mv.swipeN = 0; mv.until = t + MELEE.claw.stepMs;
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
    if (t >= mv.until) {
      mv.swipeN += 1;
      const dirX = _toP.x / (dist || 1), dirZ = _toP.z / (dist || 1);
      g.position.x += dirX * 1.3; g.position.z += dirZ * 1.3;             // 러닝 스텝
      const ang = Math.abs(((Math.atan2(_toP.x, _toP.z) - faceYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (dist < MELEE.claw.r && ang < MELEE.claw.arcDeg * Math.PI / 360) damagePlayer(MELEE.claw.dmg, '해태 할퀴기');
      showAura(g.position.x + dirX * 2.2, g.position.z + dirZ * 2.2, 2.6, 260, 0xff7040);
      // 엇박: 2타→3타 간격이 1.6배 (멀기트와 같은 문법)
      mv.until = t + MELEE.claw.stepMs * (mv.swipeN === 2 ? 1.6 : 1);
      if (mv.swipeN >= MELEE.claw.swipes) { mv.mode = 'RECOVER'; mv.until = t + MELEE.claw.recoverMs; }
    }
  } else if (mv.mode === 'RECOVER') {
    crouchY = -0.2;
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
  g.rotation.y = mv.yaw;
  boss.inner.rotation.x += (tiltX - boss.inner.rotation.x) * Math.min(1, dts * 8);
  boss.inner.rotation.z = Math.sin(mv.bob * 0.5) * 0.045;  // 몸통 롤 — 네발짐승 활보감
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
