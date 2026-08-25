// ui.js — HUD DOM 갱신 + 오버레이 흐름 (타이틀 → 마패 수여식 → 인게임 → 장계).
// 견착 피드백 4채널 중 2채널(피크 배지, 노출 미터)이 여기 산다.

import { WEAPONS, SCORE, PLAYER, RAIL } from './config.js';
import { state, setHand, now } from './state.js';
import { exposedFraction, isFavorable } from './cover.js';
import { applyShoulder } from './rail.js';
import { unlockAudio } from './audio.js';

const $ = id => document.getElementById(id);
let bannerTimer = 0, recapTimer = 0, dangerUntil = 0, wheelFlashTimer = 0, bossHideTimer = 0;

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
    let holdStart = 0, iv = 0;
    const fill = card.querySelector('.holdfill');
    card.addEventListener('mousedown', () => {
      holdStart = performance.now(); card.classList.add('holding');
      clearInterval(iv);
      iv = setInterval(() => { // rAF 대신 interval — 탭 상태와 무관하게 동작
        const k = Math.min(1, (performance.now() - holdStart) / 1500);
        fill.style.width = (k * 100) + '%';
        if (k >= 1) { clearInterval(iv); confirmHand(hand); }
      }, 40);
    });
    const cancel = () => { clearInterval(iv); card.classList.remove('holding'); fill.style.width = '0%'; };
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
  state.on('recapLine', showRecap);
  state.on('wheelShow', (held) => {
    clearTimeout(wheelFlashTimer);
    $('wheel').classList.remove('flash');
    $('wheel').classList.toggle('hidden', !held);
    if (held) renderWheelHl();
  });
  state.on('wheelFlash', () => {  // Space 탭 전환 피드백 — 일시정지 없이 짧게 표시
    if (state.wheelOpen) return;
    renderWheelHl();
    const w = $('wheel'); w.classList.add('flash'); w.classList.remove('hidden');
    clearTimeout(wheelFlashTimer);
    wheelFlashTimer = setTimeout(() => { w.classList.add('hidden'); w.classList.remove('flash'); }, 700);
  });
  state.on('assassinPrompt', (on) => $('assassin').classList.toggle('hidden', !on));
  state.on('ultCastStart', () => { // 비거 융단폭격 컷씬
    const c = $('cutscene'); c.classList.remove('hidden');
    const img = c.querySelector('img'); img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    setTimeout(() => c.classList.add('hidden'), 2600);
  });
  // ── 보스 HP 바 (프레임 에셋) ──
  const showBossBar = (name, r) => {
    clearTimeout(bossHideTimer);
    $('bossname').textContent = name;
    $('bossbar').classList.remove('hidden');
    document.querySelector('#bossslot i').style.width = Math.max(0, r * 100) + '%';
    if (r <= 0) bossHideTimer = setTimeout(() => $('bossbar').classList.add('hidden'), 1200);
  };
  state.on('mulgitHp', (r) => showBossBar('멀 기 트', r));
  state.on('bossHpRatio', (r) => showBossBar('해 태', Math.max(0, r)));
  state.on('bossDefeated', () => showBossBar('해 태', 0));
  state.on('gateOpened', () => {});
  state.on('showEnding', showEnding);

  renderAll();
}

function renderAll() { renderHp(); renderAmmo(); renderItems(); renderUlt(); renderScore(); renderSlots(); }

function renderHp() {
  const pct = Math.max(0, state.player.hp / PLAYER.hp * 100);
  document.querySelector('#hpbar .fill').style.width = pct + '%';
  setTimeout(() => { document.querySelector('#hpbar .ghost').style.width = pct + '%'; }, 250);
  $('hptext').textContent = `${Math.max(0, Math.round(state.player.hp))}/${PLAYER.hp}`;
}
function renderAmmo() {
  const w = state.weapons[state.currentWeapon]; const cfg = WEAPONS[state.currentWeapon];
  $('wname').textContent = cfg.name;
  $('magval').textContent = w.mag;                          // PPTX {0}/{1} 표기 — 주머니 좌/우
  $('resval').textContent = w.reserve;
  $('magchip').classList.toggle('empty', w.mag === 0);
  $('reloadmsg').textContent = w.reloading ? '재장전…' : (w.mag === 0 && w.reserve === 0 ? '탄약 소진' : (w.mag === 0 ? '재장전 필요 — 엄폐하라' : ''));
  renderSlots();
  renderWheelHl();
}
const WHEEL_ANGLE = { rifle: 0, carbine: 180, ritual: 240 }; // 휠 아트 섹터: 승자총통/신기전/비격진천뢰
function renderWheelHl() {
  $('wheelhl').style.setProperty('--a', (WHEEL_ANGLE[state.currentWeapon] || 0) + 'deg');
  $('wheelname').textContent = `${WEAPONS[state.currentWeapon].name} — Space 탭 전환 · 홀드 휠 · 1/2/3 선택`;
}
function renderSlots() {
  $('ws2').style.opacity = state.unlockedWeapons.includes('carbine') ? 1 : 0.3;
  $('ws3').style.opacity = state.unlockedWeapons.includes('ritual') ? 1 : 0.3;
}
function renderItems() {
  $('it-tonic').innerHTML = `탕약 <b>×${state.items.tonic}</b> <span style="opacity:.6">T</span>`;
  const selG = state.selectedThrowable === 'grenade';
  $('it-smoke').innerHTML =
    `<b style="${selG ? 'color:#ffd24a' : 'opacity:.55'}">수류탄 ×${state.items.grenade}</b> · ` +
    `<b style="${!selG ? 'color:#ffd24a' : 'opacity:.55'}">연막 ×${state.items.smoke}</b> ` +
    `<span style="opacity:.6">F 투척 · G 전환</span>`;
  $('it-tonic').classList.toggle('none', state.items.tonic === 0);
  $('it-smoke').classList.toggle('none', state.items.smoke === 0 && state.items.grenade === 0);
}
function renderUlt() {
  const el = $('ult');
  el.classList.toggle('ready', state.ult >= 100);
  $('ultlock').textContent = state.ult >= 100 ? 'Q — 폭격' : Math.round(state.ult) + '%';
  document.querySelector('#ultbar i').style.width = state.ult + '%';
  // 실물 게이지 바늘: 0%=좌하(-135°) → 100%=우하(+135°), 스프링 이징
  $('ultneedle').style.transform =
    `translateX(-50%) rotate(${-135 + 270 * Math.min(100, Math.max(0, state.ult)) / 100}deg)`;
}
function renderScore() {
  document.querySelector('#score .pts').textContent = state.score.toLocaleString();
  document.querySelector('#score .combo').textContent = state.comboMult > 1 ? `콤보 ×${state.comboMult} (${state.combo})` : (state.combo >= 4 ? `연속 명중 ${state.combo}` : '');
}
function renderPeekBadge() { // (자유이동판) 견착·리닝 배지 — updateUI 에서 매 프레임 갱신
  const badge = $('peek');
  badge.classList.remove('fav', 'unfav', 'neutral');
  const arrow = badge.querySelector('.arrow'), lb = badge.querySelector('.lb');
  const fav = isFavorable();
  if (fav === null) {
    badge.classList.add('neutral');
    arrow.textContent = state.hand === 'L' ? '◀' : '▶';
    lb.textContent = `${state.hand === 'L' ? '좌' : '우'}견착 — Z/X 좌우 기울이기 (${state.hand === 'L' ? 'Z' : 'X'} 쪽이 유리)`;
  } else if (fav) {
    badge.classList.add('fav');
    arrow.textContent = state.hand === 'L' ? '◀' : '▶';
    lb.textContent = '유리한 기울이기 — 빠르고 깊다';
  } else {
    badge.classList.add('unfav');
    arrow.textContent = state.hand === 'L' ? '▶' : '◀';
    lb.textContent = '역견착 기울이기 — 느리고 얕다 (킬 ×1.5)';
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

// 매 프레임: 리닝 미터 + 견착 배지 + 위험 비네트
export function updateUI() {
  document.querySelector('#exposure i').style.height = Math.round(exposedFraction() * 100) + '%';
  if (state.phase === 'play') renderPeekBadge();
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
