// audio.js — WebAudio 합성 SFX (다운로드 0, 저작권 0) + 절차 드론 앰비언트.
// 경고음은 Combat gate 요건 — 절대 컷 불가.

import { state } from './state.js';
import { WEAPONS } from './config.js';

let ctx = null, master, sfxGain, bgmGain, comp;
let droneNodes = null;

export function initAudio() {
  state.on('toggleMute', () => {
    state.muted = !state.muted;
    if (master) master.gain.value = state.muted ? 0 : 1;
    state.emit('muteChanged');
  });
  // 게임 이벤트 → SFX
  state.on('shotFired', () => {
    if (WEAPONS[state.currentWeapon]?.silent) sfxShot(0.28, 1500);  // 활 — 낮은 시위 튕김
    else sfxShot();
  });
  state.on('decoyShot', () => sfxShot(0.35, 900));
  state.on('shotHit', ({ weak }) => sfxHit(weak));
  state.on('enemyKilled', () => sfxKill());
  state.on('dangerTelegraph', () => sfxWarn());
  state.on('dangerLaunched', () => sfxWhoosh());
  state.on('playerHit', () => sfxPain());
  state.on('reloadStart', (key) => {   // 3단 볼트 액션: 철컥 - 삽탄 - 철컥
    sfxBolt();
    const ms = (WEAPONS[key || state.currentWeapon]?.reloadMs || 600) + 250;
    setTimeout(() => sfxTick(), ms * 0.5);
    setTimeout(() => sfxBolt(), ms * 0.88);
  });
  state.on('meleeSwing', () => sfxWhoosh());
  state.on('meleeHeavy', () => { sfxWhoosh(); setTimeout(() => sfxWhoosh(), 220); }); // 강공: 치켜듦 → 내리침
  state.on('meleeHeavyImpact', (hits) => { if (hits) sfxBoom(0.35); });
  state.on('evadeStart', () => sfxWhoosh());          // 회피 스텝
  state.on('evadeNegated', () => sfxTick());          // 무적으로 흘려낸 피격
  state.on('evadeBlocked', () => sfxTick());          // 쿨다운 중
  state.on('fireBlocked', () => sfxTick());
  state.on('ultLockedTry', () => sfxStatic());
  state.on('ultStrike', () => sfxBoom());
  state.on('singijeonLaunch', () => sfxWhistle());     // 발사 — 화전 특유의 쉬익
  state.on('singijeonImpact', () => sfxBoom(0.8));
  state.on('bombThrown', () => sfxWhistle());
  state.on('bombExploded', () => sfxBoom(0.7));
  state.on('bombShotDown', () => sfxKill());
  state.on('bannerShow', () => sfxBlip());
  state.on('turretDestroyed', () => sfxBoom(0.5));
  state.on('bossDefeated', () => { sfxBoom(); setTimeout(sfxBoom, 400); setTimeout(sfxBoom, 900); });
  state.on('grenadeExploded', () => sfxBoom(0.85));
  state.on('grenadeThrown', () => sfxTick());
  state.on('assassinateDone', () => sfxKill());
  state.on('sattoSlam', () => sfxBoom(0.7));
  state.on('sattoWave', () => sfxBoom(0.9));
  state.on('sattoCharge', () => sfxWhoosh());
  state.on('sattoDefeated', () => { sfxBoom(); setTimeout(sfxBoom, 500); });
  // 사또 추가 패턴
  state.on('sattoSweep', () => sfxBoom(0.75));
  state.on('sattoBarrage', () => sfxWhistle());
  state.on('sattoBombExploded', () => sfxBoom(0.8));
  // 해태 추가 패턴
  state.on('bossBite', () => sfxKill());
  state.on('bossTail', () => sfxBoom(0.7));
  state.on('bossBreath', () => sfxStatic());
  state.on('bossNovaTelegraph', () => { sfxWarn(); setTimeout(sfxWarn, 420); setTimeout(sfxWarn, 840); });
  state.on('bossNovaRing', () => sfxBoom(1.0));
  state.on('pickupTaken', () => sfxBlip());   // 드랍 아이템 획득
}

export function unlockAudio() { // 첫 클릭에서 호출 (자동재생 정책)
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8; comp.ratio.value = 9; comp.attack.value = 0.002; comp.release.value = 0.18; // 리미터 (레이어드 총성 클리핑 방지)
  sfxGain = ctx.createGain(); bgmGain = ctx.createGain();
  sfxGain.gain.value = 0.5; bgmGain.gain.value = 0.16;
  sfxGain.connect(master); bgmGain.connect(master);
  master.connect(comp); comp.connect(ctx.destination);
  startDrone();
}

function startDrone() { // 밤 궁궐 앰비언트 — detune 오실레이터 2 + LFO
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o1.type = 'sine'; o1.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 55 * 1.007;
  g.gain.value = 0.5;
  lfo.frequency.value = 0.07; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220;
  o1.connect(g); o2.connect(g); g.connect(filt); filt.connect(bgmGain);
  o1.start(); o2.start(); lfo.start();
  droneNodes = { o1, o2, lfo };
}

// ── SFX 프리미티브 ──
function noiseBuf(len = 0.3) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function env(g, a, peak, d) {
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.001, t + a + d);
}
function play(node, g, dur) { node.start(); node.stop(ctx.currentTime + dur); node.onended = () => { node.disconnect(); g.disconnect(); }; }

// 범용 레이어 프리미티브 (연구 레시피 이식)
function nzL(t0, { type, f0, f1, q = 1, peak, att, dec, delay = 0 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(att + dec + 0.1);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0 + delay);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + delay + dec);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0 + delay);
  g.gain.linearRampToValueAtTime(peak, t0 + delay + att);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + delay + att + dec);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(t0 + delay); s.stop(t0 + delay + att + dec + 0.05);
  s.onended = () => { s.disconnect(); g.disconnect(); };
}
function oscL(t0, { type, f0, f1, peak, att, dec, delay = 0 }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0 + delay);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + delay + dec);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0 + delay);
  g.gain.linearRampToValueAtTime(peak, t0 + delay + att);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + delay + att + dec);
  o.connect(g); g.connect(sfxGain);
  o.start(t0 + delay); o.stop(t0 + delay + att + dec + 0.05);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}

// 총성 — 5레이어 (blast/body/sub/mech/room slap)
function sfxShot(vol = 0.8) {
  if (!ctx) return;
  const t = ctx.currentTime;
  nzL(t, { type: 'bandpass', f0: 2400, f1: 700, peak: 1.0 * vol, att: 0.0006, dec: 0.075 });
  oscL(t, { type: 'sine', f0: 320, f1: 58, peak: 0.85 * vol, att: 0.001, dec: 0.13 });
  oscL(t, { type: 'triangle', f0: 150, f1: 44, peak: 0.5 * vol, att: 0.002, dec: 0.18 });
  nzL(t, { type: 'highpass', f0: 2600, peak: 0.22 * vol, att: 0.001, dec: 0.07, delay: 0.008 });
  nzL(t, { type: 'bandpass', f0: 900, q: 0.7, peak: 0.3 * vol, att: 0.01, dec: 0.4, delay: 0.02 });
}
function sfxHit(weak) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(weak ? 1250 : 850, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(weak ? 700 : 420, ctx.currentTime + 0.06);
  const g = ctx.createGain(); env(g, 0.001, 0.25, 0.07); o.connect(g); g.connect(sfxGain); play(o, g, 0.09);
}
function sfxKill() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(0.35);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.7;
  const g = ctx.createGain(); env(g, 0.01, 0.35, 0.32);
  src.connect(f); f.connect(g); g.connect(sfxGain); play(src, g, 0.36);
}
function sfxWarn() { // 명중탄 경고 — 사각파 2연 블립 (판독성 채널)
  if (!ctx) return;
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1180;
    const g = ctx.createGain(); const t = ctx.currentTime + i * 0.11;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.1);
  }
}
function sfxWhoosh() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(1.0); src.playbackRate.value = 0.6;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(600, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.9);
  const g = ctx.createGain(); env(g, 0.05, 0.22, 0.9);
  src.connect(f); f.connect(g); g.connect(sfxGain); play(src, g, 1.0);
}
function sfxPain() {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.25);
  const g = ctx.createGain(); env(g, 0.002, 0.5, 0.3); o.connect(g); g.connect(sfxGain); play(o, g, 0.32);
}
function sfxBolt() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(0.12);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2800;
  const g = ctx.createGain(); env(g, 0.005, 0.2, 0.1);
  src.connect(f); f.connect(g); g.connect(sfxGain); play(src, g, 0.13);
  setTimeout(() => { if (!ctx) return;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 520;
    const g2 = ctx.createGain(); env(g2, 0.002, 0.15, 0.06); o.connect(g2); g2.connect(sfxGain); play(o, g2, 0.08);
  }, 300);
}
function sfxTick() { if (!ctx) return; const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 300; const g = ctx.createGain(); env(g, 0.001, 0.12, 0.03); o.connect(g); g.connect(sfxGain); play(o, g, 0.05); }
function sfxBlip() { if (!ctx) return; const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 880; const g = ctx.createGain(); env(g, 0.002, 0.12, 0.09); o.connect(g); g.connect(sfxGain); play(o, g, 0.12); }
function sfxStatic() { if (!ctx) return; const src = ctx.createBufferSource(); src.buffer = noiseBuf(0.3); const g = ctx.createGain(); env(g, 0.01, 0.15, 0.28); src.connect(g); g.connect(sfxGain); play(src, g, 0.3); }
// 폭발 — crack/thump/sub/body/rumble 5레이어
function sfxBoom(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  nzL(t, { type: 'highpass', f0: 1800, f1: 600, peak: 0.9 * vol, att: 0.0015, dec: 0.11 });
  oscL(t, { type: 'sine', f0: 155, f1: 24, peak: 1.0 * vol, att: 0.003, dec: 0.75 });
  oscL(t, { type: 'sine', f0: 64, f1: 19, peak: 0.72 * vol, att: 0.01, dec: 0.95 });
  nzL(t, { type: 'lowpass', f0: 9000, f1: 300, peak: 0.85 * vol, att: 0.004, dec: 0.8 });
  nzL(t, { type: 'bandpass', f0: 430, f1: 110, q: 0.35, peak: 0.4 * vol, att: 0.1, dec: 2.1 });
}
function sfxWhistle() {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(1900, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 1.8);
  const g = ctx.createGain(); env(g, 0.05, 0.12, 1.8); o.connect(g); g.connect(sfxGain); play(o, g, 1.9);
}
