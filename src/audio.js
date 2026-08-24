// audio.js — WebAudio 합성 SFX (다운로드 0, 저작권 0) + 절차 드론 앰비언트.
// 경고음은 Combat gate 요건 — 절대 컷 불가.

import { state } from './state.js';

let ctx = null, master, sfxGain, bgmGain, comp;
let droneNodes = null;

export function initAudio() {
  state.on('toggleMute', () => {
    state.muted = !state.muted;
    if (master) master.gain.value = state.muted ? 0 : 1;
    state.emit('muteChanged');
  });
  // 게임 이벤트 → SFX
  state.on('shotFired', () => sfxShot());
  state.on('decoyShot', () => sfxShot(0.35, 900));
  state.on('shotHit', ({ weak }) => sfxHit(weak));
  state.on('enemyKilled', () => sfxKill());
  state.on('dangerTelegraph', () => sfxWarn());
  state.on('dangerLaunched', () => sfxWhoosh());
  state.on('playerHit', () => sfxPain());
  state.on('reloadStart', () => sfxBolt());
  state.on('fireBlocked', () => sfxTick());
  state.on('ultLockedTry', () => sfxStatic());
  state.on('ultStrike', () => sfxBoom());
  state.on('bombThrown', () => sfxWhistle());
  state.on('bombExploded', () => sfxBoom(0.7));
  state.on('bombShotDown', () => sfxKill());
  state.on('bannerShow', () => sfxBlip());
  state.on('turretDestroyed', () => sfxBoom(0.5));
  state.on('bossDefeated', () => { sfxBoom(); setTimeout(sfxBoom, 400); setTimeout(sfxBoom, 900); });
}

export function unlockAudio() { // 첫 클릭에서 호출 (자동재생 정책)
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); comp = ctx.createDynamicsCompressor();
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

function sfxShot(vol = 0.9, cutoff = 1600) {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(0.25);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, ctx.currentTime);
  f.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.18);
  const g = ctx.createGain(); env(g, 0.002, vol, 0.2);
  src.connect(f); f.connect(g); g.connect(sfxGain); play(src, g, 0.25);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(140, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.12);
  const g2 = ctx.createGain(); env(g2, 0.002, vol * 0.7, 0.13); o.connect(g2); g2.connect(sfxGain); play(o, g2, 0.16);
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
function sfxBoom(vol = 1) {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(0.8);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(900, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.7);
  const g = ctx.createGain(); env(g, 0.005, 0.8 * vol, 0.75);
  src.connect(f); f.connect(g); g.connect(sfxGain); play(src, g, 0.8);
}
function sfxWhistle() {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(1900, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 1.8);
  const g = ctx.createGain(); env(g, 0.05, 0.12, 1.8); o.connect(g); g.connect(sfxGain); play(o, g, 1.9);
}
