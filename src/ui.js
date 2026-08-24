// ui.js — HUD DOM 갱신 + 오버레이 흐름 (타이틀 → 마패 수여식 → 인게임 → 장계).
// 견착 피드백 4채널 중 2채널(피크 배지, 노출 미터)이 여기 산다.

import { WEAPONS, SCORE, PLAYER, RAIL } from './config.js';
import { state, setHand, now } from './state.js';
import { exposedFraction } from './cover.js';
import { applyShoulder } from './rail.js';
import { unlockAudio } from './audio.js';

const $ = id => document.getElementById(id);
let bannerTimer = 0, recapTimer = 0, dangerUntil = 0;

export function initUI({ onRunStart, onRestart }) {
  // ── 타이틀 → 의식 ──
  $('startbtn').addEventListener('click', () => {
    unlockAudio();
    $('title').classList.add('hidden');
    $('ceremony').classList.remove('hidden');
    state.phase = 'ceremony';
  });

  // ── 마패 수여식: 카드 1.5s 홀드 확정 ──
  for (const hand of ['L', 'R']) {
    const card = $('card-' + hand);
    let holdStart = 0, raf = 0;
    const fill = card.querySelector('.holdfill');
    const tick = () => {
      const k = Math.min(1, (performance.now() - holdStart) / 1500);
      fill.style.width = (k * 100) + '%';
      if (k >= 1) { confirmHand(hand); return; }
      raf = requestAnimationFrame(tick);
    };
    card.addEventListener('mousedown', () => { holdStart = performance.now(); card.classList.add('holding'); raf = requestAnimationFrame(tick); });
    const cancel = () => { cancelAnimationFrame(raf); card.classList.remove('holding'); fill.style.width = '0%'; };
    card.addEventListener('mouseup', cancel);
    card.addEventListener('mouseleave', cancel);
  }
  function confirmHand(hand) {
    if (!setHand(hand)) return;
    applyShoulder();
    $('ceremony').classList.add('hidden');
    showBanner(hand === 'L' ? '좌견착으로 총을 메었다' : '우견착으로 총을 메었다');
    onRunStart();
  }

  $('againbtn').addEventListener('click', () => { location.reload(); });

  // ── 일시정지 / 음소거 ──
  state.on('togglePause', () => {
    if (state.phase !== 'play') return;
    state.paused = !state.paused;
    $('pause').classList.toggle('hidden', !state.paused);
    $('pauseinfo').textContent = `견착: ${state.hand === 'L' ? '좌' : '우'} (변경 불가) · 점수 ${state.score.toLocaleString()}`;
  });
  state.on('muteChanged', () => showBanner(state.muted ? '음소거' : '소리 켬'));

  // ── HUD 이벤트 바인딩 ──
  state.on('ammoChanged', renderAmmo);
  state.on('weaponChanged', renderAmmo);
  state.on('weaponUnlocked', (k) => { renderSlots(); showBanner(`${WEAPONS[k].name} 획득 — ${k === 'ritual' ? '3' : '2'}번 키`); });
  state.on('reloadStart', () => { $('reloadmsg').textContent = '재장전…'; });
  state.on('reloadDone', () => { $('reloadmsg').textContent = ''; renderAmmo(); });
  state.on('magEmpty', renderAmmo);
  state.on('playerHit', ({ amount, cause }) => {
    renderHp();
    $('dmgflash').style.opacity = 1; setTimeout(() => $('dmgflash').style.opacity = 0, 240);
    showRecap(`${cause} −${amount}`);
  });
  state.on('playerHealed', renderHp);
  state.on('playerRevived', () => { renderHp(); renderAmmo(); });
  state.on('playerDead', () => showBanner('절 명'));
  state.on('itemsChanged', renderItems);
  state.on('ultChanged', renderUlt);
  state.on('fieldTypeChanged', renderUlt);
  state.on('ultLockedTry', () => showRecap('실내에서는 폭격 지원 불가 — 개활지 전용'));
  state.on('ultCastStart', () => { $('flash').style.opacity = 0.25; setTimeout(() => $('flash').style.opacity = 0, 200); });
  state.on('ultStrike', () => { $('flash').style.opacity = 0.7; setTimeout(() => $('flash').style.opacity = 0, 110); });
  state.on('scoreChanged', renderScore);
  state.on('comboChanged', renderScore);
  state.on('riskKill', (pts) => showRecap(`역견착 보너스 ×1.5 — +${pts}`));
  state.on('peekChanged', renderPeekBadge);
  state.on('objectiveChanged', (t) => { $('objtext').textContent = t; });
  state.on('timerTick', (sec) => {
    const el = $('timer');
    el.classList.remove('hidden');
    el.textContent = sec;
    el.classList.toggle('low', sec <= RAIL.timerLowSec);
    if (sec <= 0 || sec == null) el.classList.add('hidden');
  });
  state.on('nodeArrived', (node) => {
    if (node.timerSec == null) $('timer').classList.add('hidden');
    renderPeekBadge();
  });
  state.on('bannerShow', showBanner);
  state.on('dangerTelegraph', () => { dangerUntil = now() + 1400; });
  state.on('dangerLaunched', () => { dangerUntil = now() + 1100; });
  state.on('fireBlocked', () => showRecap('사선이 막혔다 — 반대쪽 견착의 대가'));
  state.on('shotBlockedByShield', () => showRecap('방패에 막혔다 — 머리를 노려라'));
  state.on('smokeDeployed', () => showBanner('연막 전개'));
  state.on('showEnding', showEnding);

  renderAll();
}

function renderAll() { renderHp(); renderAmmo(); renderItems(); renderUlt(); renderScore(); renderSlots(); }

function renderHp() {
  const pct = Math.max(0, state.player.hp / PLAYER.hp * 100);
  document.querySelector('#hpbar .fill').style.width = pct + '%';
  setTimeout(() => { document.querySelector('#hpbar .ghost').style.width = pct + '%'; }, 250);
}
function renderAmmo() {
  const w = state.weapons[state.currentWeapon]; const cfg = WEAPONS[state.currentWeapon];
  $('wname').textContent = cfg.name;
  const el = $('ammoval');
  el.textContent = `${w.mag}/${w.reserve}`;                 // PPTX {0}/{1} 표기
  el.classList.toggle('empty', w.mag === 0);
  $('reloadmsg').textContent = w.reloading ? '재장전…' : (w.mag === 0 && w.reserve === 0 ? '탄약 소진' : (w.mag === 0 ? '재장전 필요 — 엄폐하라' : ''));
  renderSlots();
}
function renderSlots() {
  $('ws2').style.opacity = state.unlockedWeapons.includes('carbine') ? 1 : 0.3;
  $('ws3').style.opacity = state.unlockedWeapons.includes('ritual') ? 1 : 0.3;
}
function renderItems() {
  $('it-tonic').innerHTML = `탕약 <b>×${state.items.tonic}</b> <span style="opacity:.6">F</span>`;
  $('it-smoke').innerHTML = `연막 <b>×${state.items.smoke}</b> <span style="opacity:.6">C</span>`;
  $('it-tonic').classList.toggle('none', state.items.tonic === 0);
  $('it-smoke').classList.toggle('none', state.items.smoke === 0);
}
function renderUlt() {
  const open = state.node?.fieldType === 'open';
  const el = $('ult');
  el.classList.toggle('locked', !open);
  el.classList.toggle('ready', open && state.ult >= 100);
  $('ultlock').textContent = open ? (state.ult >= 100 ? 'Q — 폭격 지원' : Math.round(state.ult) + '%') : '🔒 개활지 전용';
  document.querySelector('#ultbar i').style.width = state.ult + '%';
}
function renderScore() {
  document.querySelector('#score .pts').textContent = state.score.toLocaleString();
  document.querySelector('#score .combo').textContent = state.comboMult > 1 ? `콤보 ×${state.comboMult} (${state.combo})` : (state.combo >= 4 ? `연속 명중 ${state.combo}` : '');
}
function renderPeekBadge() {
  const node = state.node; if (!node) return;
  const side = node.covers[state.coverIdx]?.peekSide;
  const badge = $('peek');
  badge.classList.remove('fav', 'unfav', 'neutral');
  const arrow = badge.querySelector('.arrow'), lb = badge.querySelector('.lb');
  if (side === 'TOP') { badge.classList.add('neutral'); arrow.textContent = '▲'; lb.textContent = '중립 엄폐 — 상단 사격'; }
  else {
    const fav = side === state.hand;
    badge.classList.add(fav ? 'fav' : 'unfav');
    arrow.textContent = side === 'R' ? '▶' : '◀';
    lb.textContent = fav ? `${side === 'R' ? '우' : '좌'}피크 — 유리한 견착` : `${side === 'R' ? '우' : '좌'}피크 — 역견착 · 노출 큼`;
  }
}

function showBanner(text) {
  const b = $('banner'); b.textContent = text; b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 1600);
}
function showRecap(text) {
  const r = $('recap'); r.textContent = text;
  clearTimeout(recapTimer);
  recapTimer = setTimeout(() => { r.textContent = ''; }, 2200);
}

// 매 프레임: 노출 미터 + 위험 비네트
export function updateUI() {
  document.querySelector('#exposure i').style.height = Math.round(exposedFraction() * 100) + '%';
  const danger = now() < dangerUntil;
  $('vignette').classList.toggle('warn', danger);
  $('dangermark').classList.toggle('show', danger);
}

function showEnding() {
  state.phase = 'ending';
  const acc = state.shotsFired ? Math.round(state.shotsHit / state.shotsFired * 100) : 0;
  const timeSec = Math.round((now() - state.startedAt) / 1000);
  const mm = String(Math.floor(timeSec / 60)), ss = String(timeSec % 60).padStart(2, '0');
  let grade = SCORE.grades[SCORE.grades.length - 1];
  for (const g of SCORE.grades) { if (state.score >= g[0] && (g[0] !== SCORE.grades[0][0] || state.deaths === 0)) { grade = g; break; } }
  document.querySelector('#ending .grade').textContent = grade[1];
  document.querySelector('#ending .gradeword').textContent = `${grade[2]} — ${grade[3]}`;
  const best = Number(localStorage.getItem('joseon_best') || 0);
  if (state.score > best) localStorage.setItem('joseon_best', state.score);
  $('endstats').innerHTML =
    `총점 <b>${state.score.toLocaleString()}</b> (최고 ${Math.max(best, state.score).toLocaleString()})<br>` +
    `명중률 <b>${acc}%</b> · 클리어 <b>${mm}:${ss}</b> · 사망 <b>${state.deaths}</b><br>` +
    `견착 <b>${state.hand === 'L' ? '좌' : '우'}견착</b> · 역견착 킬 <b>${state.riskKills}</b>`;
  $('ending').classList.remove('hidden');
}

export function showMobileWarn() { $('mobilewarn').classList.remove('hidden'); }
export function showLoadError(msg) { const el = $('loaderr'); if (el) el.textContent = '오류: ' + msg; }
