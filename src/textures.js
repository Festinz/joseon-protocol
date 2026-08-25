// textures.js — 캔버스 절차 텍스처 (다운로드 0장). 박석 바닥, 기와, 한지 창, 밤하늘 돔.

import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 박석(薄石) 바닥 — 불규칙 돌판 그리드
export function stoneFloorTex() {
  return canvas(256, 256, (x) => {
    x.fillStyle = '#33364a'; x.fillRect(0, 0, 256, 256);
    let y = 0;
    while (y < 256) {
      const rowH = 38 + Math.random() * 22;
      let px = -Math.random() * 30;
      while (px < 256) {
        const w = 46 + Math.random() * 40;
        const shade = 46 + Math.floor(Math.random() * 22);
        x.fillStyle = `rgb(${shade+10},${shade+11},${shade+20})`;
        x.fillRect(px + 2, y + 2, w - 4, rowH - 4);
        x.fillStyle = 'rgba(255,255,255,0.06)';
        x.fillRect(px + 2, y + 2, w - 4, 3);
        px += w;
      }
      y += rowH;
    }
  });
}

// 기와 — 세로 골 + 처마 라인
export function roofTileTex() {
  return canvas(128, 128, (x) => {
    x.fillStyle = '#363c4c'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 16) {
      const g = x.createLinearGradient(i, 0, i + 16, 0);
      g.addColorStop(0, '#262b38'); g.addColorStop(0.5, '#4a5168'); g.addColorStop(1, '#262b38');
      x.fillStyle = g; x.fillRect(i, 0, 16, 128);
    }
    for (let j = 0; j < 128; j += 32) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, j, 128, 3); }
  });
}

// 담장 석축
export function stoneWallTex() {
  return canvas(128, 128, (x) => {
    x.fillStyle = '#55555e'; x.fillRect(0, 0, 128, 128);
    let y = 0, off = 0;
    while (y < 128) {
      for (let px = -off; px < 128; px += 32) {
        const s = 78 + Math.floor(Math.random() * 26);
        x.fillStyle = `rgb(${s},${s-3},${s-9})`;
        x.fillRect(px + 1, y + 1, 30, 18);
      }
      y += 20; off = off ? 0 : 16;
    }
  });
}

// 한지 창살 (발광 창문용)
export function hanjiWindowTex() {
  return canvas(64, 96, (x) => {
    x.fillStyle = '#e8d9b0'; x.fillRect(0, 0, 64, 96);
    x.strokeStyle = '#6b4a2e'; x.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 96); x.stroke(); }
    for (let j = 0; j <= 96; j += 16) { x.beginPath(); x.moveTo(0, j); x.lineTo(64, j); x.stroke(); }
    x.strokeRect(0, 0, 64, 96);
  });
}

// 밤하늘 돔 — 그라디언트 + 별 + 달무리 (고해상 + 원형 별 — 확대돼도 네모지지 않게)
export function skyTex() {
  const t = canvas(2048, 1024, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 1024);
    g.addColorStop(0, '#05060f'); g.addColorStop(0.55, '#0c1026'); g.addColorStop(0.8, '#1a2040'); g.addColorStop(1, '#232a4e');
    x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < 340; i++) {
      const sx = Math.random() * 2048, sy = Math.random() * 680;
      const a = 0.2 + Math.random() * 0.55;
      const r = Math.random() < 0.1 ? 2.2 : 1.1;
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, r * 2.4);
      sg.addColorStop(0, `rgba(230,238,255,${a})`); sg.addColorStop(1, 'rgba(230,238,255,0)');
      x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, r * 2.4, 0, 7); x.fill();
    }
    // 달 + 무리 (블룸 고려해 절제)
    const mg = x.createRadialGradient(1640, 264, 8, 1640, 264, 80);
    mg.addColorStop(0, 'rgba(235,235,220,0.7)'); mg.addColorStop(0.3, 'rgba(215,220,232,0.3)'); mg.addColorStop(1, 'rgba(200,210,235,0)');
    x.fillStyle = mg; x.beginPath(); x.arc(1640, 264, 80, 0, 7); x.fill();
    x.fillStyle = 'rgba(238,236,220,0.85)'; x.beginPath(); x.arc(1640, 264, 24, 0, 7); x.fill();
  });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
