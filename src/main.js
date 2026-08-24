// main.js — 부트스트랩 + 게임 루프. update 순서 고정:
// input(이벤트) → rail → cover → enemies/boss(flow) → combat → weapons → vfx → ui → debug
// 이 순서가 "임팩트 순간 COVERED 판정"의 결정론을 보장한다 (cover 가 combat 보다 먼저).

import * as THREE from 'three';
import { PERF, PALETTE } from './config.js';
import { state, resetRun, initWeapons } from './state.js';
import { LEVEL } from './leveldata.js';
import { initRail, updateRail, rig, snapToNode } from './rail.js';
import { updateCover, refreshPeekParams } from './cover.js';
import { initInput } from './input.js';
import { initWeapons3D, updateWeapons } from './weapons.js';
import { updateCombat, registerBlocker, clearDangerShots } from './combat.js';
import { initEnemies, updateEnemies, clearAll, getActors, spawnMortars, debugCounts } from './enemies.js';
import { initBossScene, resetBoss } from './boss.js';
import { initFlow, updateFlow, beginRun } from './flow.js';
import { initVfx, updateVfx } from './vfx.js';
import { initAudio } from './audio.js';
import { initUI, updateUI, showMobileWarn, showLoadError } from './ui.js';
import { applyDebugParams, autoStart, initDebugOverlay, updateDebug, params } from './debug.js';
import { buildEnvironment, buildCoverProp } from './assets.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

window.addEventListener('error', (e) => showLoadError(e.message));

// ── 렌더러/씬 ──────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, params.get('perf') === 'low' ? 1.0 : PERF.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c18);
scene.fog = new THREE.FogExp2(0x0a0c18, PERF.fogDensity);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, PERF.cameraFar);

// 블룸 컴포저 (야간 발광 — 등롱·증기·트레이서). ?perf=low 는 비활성.
let composer = null;
if (params.get('perf') !== 'low') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 0.62));
  composer.addPass(new OutputPass());
}

// 조명 — 밤의 경복궁: Hemi + 달빛 Dir (그림자 맵 0). 뷰모델 레이어(1)도 비추도록 설정.
const hemi = new THREE.HemisphereLight(0x5a6ea8, 0x2a2620, 2.2);
const moon = new THREE.DirectionalLight(0xaabbee, 1.7); moon.position.set(-20, 30, 10);
const bossGlow = new THREE.PointLight(0x9fd8d4, 2.6, 55); bossGlow.position.set(0, 7, -130);
for (const l of [hemi, moon, bossGlow]) { l.layers.enable(1); scene.add(l); }

// ── 환경 + 커버 프롭/사선 차단 콜라이더 ────────────────────────────
scene.add(buildEnvironment());

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
function nodeQuat(node) {
  _m.lookAt(new THREE.Vector3(...node.pos), new THREE.Vector3(...node.look), new THREE.Vector3(0, 1, 0));
  return _q.setFromRotationMatrix(_m).clone();
}
for (const node of LEVEL) {
  const q = nodeQuat(node);
  for (const cover of node.covers) {
    const base = new THREE.Vector3(...node.pos);
    const off = new THREE.Vector3(...(cover.offset || [0, 0, 0])).applyQuaternion(q);
    const anchor = base.add(off);
    // 시각 프롭 — 카메라 앞 0.8m, 좌/우 피크 커버는 피크 반대편으로 치우침 (모서리가 생기도록)
    const peekDir = cover.peekSide === 'R' ? 1 : cover.peekSide === 'L' ? -1 : 0;
    const prop = buildCoverProp(cover.prop);
    const fwd = new THREE.Vector3(-peekDir * 0.7, 0, -0.8).applyQuaternion(q);
    prop.position.copy(anchor).add(fwd);
    prop.quaternion.copy(q);
    scene.add(prop);
    // 판정 전용 블로커 (역견착 사선 차단의 물리 실체) — 피크 반대편으로 치우친 벽
    const h = cover.peekSide === 'TOP' ? 1.15 : 1.9;
    // 폭 1.1 · 피크 반대편 0.85 오프셋: 모서리 안쪽(커버 쪽) 조준만 차단, 중앙 조준은 통과
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    const bOff = new THREE.Vector3(-peekDir * 0.85, h / 2, -0.75).applyQuaternion(q);
    blocker.position.copy(new THREE.Vector3(...node.pos)).add(off).add(bOff);
    blocker.quaternion.copy(q);
    scene.add(blocker);
    registerBlocker(blocker);
  }
}

// ── 모듈 초기화 ────────────────────────────────────────────────────
resetRun();
applyDebugParams();
scene.add(initRail(camera));
initInput();
initWeapons3D();
initEnemies(scene);
initBossScene(scene);
initVfx(scene);
initAudio();
initFlow();
initDebugOverlay(renderer);

state.on('bossMortar', (n) => spawnMortars(n));
state.on('debugKillWave', () => { for (const a of [...getActors()]) if (a.alive) a.onHit(a.headOnly ? 'hitHead' : 'hitBody', 9999, {}); });
state.on('debugJump', (idx) => { clearAll(); clearDangerShots(); resetBoss(); snapToNode(idx); });

const startRun = () => { beginRun(); refreshPeekParams(); snapToNode(0); };
initUI({ onRunStart: startRun });

// 모바일 감지
if (matchMedia('(pointer: coarse)').matches && innerWidth < 900) showMobileWarn();

// 디버그: 헤드리스 캔버스 캡처 (같은 태스크 안에서 재렌더 → toDataURL 버퍼 보존)
if (params.get('debug') === '1') {
  window.SNAP = (q = 0.55) => { render(); return renderer.domElement.toDataURL('image/jpeg', q); };
}

// ?hand= 자동 시작 (디버그)
autoStart(startRun);

// ── 루프 ───────────────────────────────────────────────────────────
let last = performance.now();
function step(dt) {
  if (state.phase === 'play' && !state.paused) {
    if (state._god) state.player.hp = Math.max(state.player.hp, 100);
    updateRail();
    updateCover();
    updateEnemies(dt);
    updateFlow(dt);
    updateCombat(dt);
    updateWeapons(dt);
  }
  updateVfx(dt);
  updateUI();
  updateDebug(dt);
}
function render() {
  // 2-패스: 월드(0, 블룸 컴포저) → depth clear → 뷰모델(1, 직접)
  // 주의: 2패스에서 scene.background 를 비워야 월드 패스가 덮이지 않는다
  camera.layers.set(0);
  if (composer) composer.render();
  else { renderer.clear(); renderer.render(scene, camera); }
  renderer.clearDepth();
  const bg = scene.background; scene.background = null;
  camera.layers.set(1); renderer.render(scene, camera);
  scene.background = bg;
}
function loop(t) {
  requestAnimationFrame(loop);
  let dt = Math.min(50, t - last); last = t;
  dt *= (state._timescale || 1);
  step(dt);
  render();
}
requestAnimationFrame(loop);
if (params.get('debug') === '1') {
  window.STEP = (n = 60, ms = 16) => { for (let i = 0; i < n; i++) step(ms); }; // 렌더 없음 — SNAP 이 렌더
  window.SCENE = scene; window.CAM = camera; window.ACTORS = getActors;
  window.LIGHTS = { hemi, moon }; window.EN = debugCounts; window.R = renderer;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});
