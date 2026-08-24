// boss.js — 고붕이 (축소 2페이즈). P1: 포탑 4문 파괴 (중립 TOP 커버).
// P2: 견착 반대편 노드로 강제 이동 → 코어 사이클 + 좌우 교대 명중탄 + 격추 가능 박격.
// 막판: 천장 붕괴 → fieldType open 전환 → 궁극기 해금 (PPTX 규칙과 맞물리는 피날레).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER, DANGER } from './config.js';
import { state, now } from './state.js';
import { instantiate } from './assets.js';
import { registerHittable, spawnDangerShot, creditKill, creditShootdown, damagePlayer } from './combat.js';
import { swapCover } from './cover.js';
import { applyCoverOffset } from './rail.js';
import { spawnWave } from './enemies.js';

const CFG = {
  turretHp: 25, coreHp: 200,
  p1AimMs: 2500, p2CycleMs: 12000, coreOpenMs: 4000, coreMult: 3,
  mortarCount: 3, mortarFlightMs: 2600,
  volleyAltMs: 1500,
  p2AddsEvery: 2,           // 사이클 2회마다 화승병 2 지원
  finaleAt: 0.25,           // 코어 25% → open 전환 + 궁 해금
};

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
    new GLTFLoader().load('assets/models/gobungi_body.glb', (g) => {
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
             mortarsAlive: 0 };
    setCoreOpen(false);
  }
  boss.nextAct = now() + 2500;
  state.emit('bossStarted');
  state.emit('bannerShow', '고붕이 — 쇠 먹는 증기 자동인형');
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
  state.emit('bannerShow', '고붕이 격파');
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

export function updateBoss(dt) {
  if (!boss || boss.phase === 0 || state.player.state === 'DEAD') return;
  const t = now();

  // 미묘한 호흡
  boss.inner.position.y = Math.sin(t * 0.0012) * 0.15;

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

function startPhase2() {
  boss.phase = 2; boss.cycleN = 0;
  state.emit('bannerShow', '고붕이가 진노한다 — 엄폐를 옮겨라!');
  // 견착의 반대편이 유리한 노드로 강제 이동 → 반드시 1회 역견착 시험 후, 교대 볼리로 페이오프
  const targetIdx = state.hand === 'R' ? 1 : 2;   // covers[1]=rubble_L(peek L), covers[2]=rubble_R(peek R)
  state.player.invulnUntil = now() + 1400;
  setTimeout(() => { swapCover(targetIdx); applyCoverOffset(); }, 600);
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
  boss = null;
}
