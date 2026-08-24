// leveldata.js — 순수 데이터. 코드 없음. 스폰은 FL/FC/FR/HIGH 프리셋 오프셋만 사용.
// 공정성 원장 (부팅 assert 대상): 강제 L 2 (S3w2, S4) · 강제 R 2 (S3w1, S5) · 중립 2 (S1, S6 P1)
// 이 숫자는 견착 의식 화면 고지 문구와 반드시 일치해야 한다.

export const SPAWN_PRESETS = {
  FC:  [0, 0, -14], FL: [-5, 0, -12], FR: [5, 0, -12],
  FC2: [0, 0, -18], FL2: [-7, 0, -16], FR2: [7, 0, -16],
  HIGH_L: [-3.5, 3.2, -13], HIGH_R: [3.5, 3.2, -13],
};

// 웨이브 항목: { type, dir, delay(s), aimIntervalMs?, flightMs? }
export const LEVEL = [
  // ── S1 드랍지점 — 튜토리얼 (중립 TOP · 명중탄 없음 · 죽을 수 없는 구간) ──
  {
    id: 'S1_drop', name: '드랍지점', objective: '광화문 광장으로 진입하라',
    fieldType: 'open', timerSec: null,
    pos: [0, 0, 0], look: [0, 1.4, -20],
    covers: [{ id: 'crate_low', peekSide: 'TOP', prop: 'crateWall' }],
    tutorial: 'basic',
    waves: [
      [ { type: 'grunt', dir: 'FC',  delay: 0.5 },
        { type: 'grunt', dir: 'FL',  delay: 2.0 },
        { type: 'grunt', dir: 'FR',  delay: 3.5 } ],
    ],
  },

  // ── S2 광화문 광장 — open · 사수 데뷔(완화) · 궁극기 쇼케이스 ──
  {
    id: 'S2_plaza', name: '광화문 광장', objective: '광장의 요괴 군세를 소탕하라',
    fieldType: 'open', timerSec: 60,
    pos: [0, 0, -22], look: [0, 1.4, -42],
    covers: [{ id: 'wall_low', peekSide: 'TOP', prop: 'lowWall' }],
    waves: [
      [ { type: 'grunt', dir: 'FL',  delay: 0.0 },
        { type: 'grunt', dir: 'FC',  delay: 1.0 },
        { type: 'grunt', dir: 'FR',  delay: 2.0 },
        { type: 'grunt', dir: 'FC2', delay: 3.0 } ],
      [ { type: 'grunt', dir: 'FC',  delay: 0.0 },
        { type: 'marksman', dir: 'FL', delay: 1.5, flightMs: 1500, tutorialDanger: true },
        { type: 'grunt', dir: 'FR',  delay: 2.5 },
        { type: 'marksman', dir: 'FR2', delay: 6.0 } ],
      [ { type: 'grunt', dir: 'FL',  delay: 0.0 },
        { type: 'grunt', dir: 'FR',  delay: 0.6 },
        { type: 'grunt', dir: 'FC',  delay: 1.2 },
        { type: 'grunt', dir: 'FL2', delay: 1.8 },
        { type: 'grunt', dir: 'FR2', delay: 2.4 },
        { type: 'grunt', dir: 'FC2', delay: 3.0 },
        { type: 'marksman', dir: 'HIGH_L', delay: 4.0 },
        { type: 'marksman', dir: 'HIGH_R', delay: 4.0 } ],
    ],
    ultShowcase: 2,            // 웨이브 인덱스 2 시작 시 궁 게이지 스크립트 충전 + 배너
    clearReward: { ammoRefill: true },
  },

  // ── S3 폭풍의 관문 — 훅 선언문: w1 좌문설주(peek R) → 노드 교체 → w2 우문설주(peek L) ──
  {
    id: 'S3_gate', name: '폭풍의 관문', objective: '관문을 돌파하라',
    fieldType: 'close', timerSec: 60,
    pos: [0, 0, -46], look: [0, 1.5, -64],
    covers: [
      { id: 'jamb_L', peekSide: 'R', prop: 'gateJambL', offset: [-1.4, 0, 0] },
      { id: 'jamb_R', peekSide: 'L', prop: 'gateJambR', offset: [1.4, 0, 0] },
    ],
    waves: [
      { cover: 0, enemies: [
        { type: 'grunt', dir: 'FC',  delay: 0.0 },
        { type: 'grunt', dir: 'FR',  delay: 1.0 },
        { type: 'grunt', dir: 'FC2', delay: 2.0 },
        { type: 'marksman', dir: 'FR2', delay: 3.0, aimIntervalMs: 4000, firstUnfavRelief: true } ] },
      { cover: 1,
        preEvent: { fx: 'boilerBurst', banner: '반대편으로!', slideMs: 800 },
        enemies: [
        { type: 'grunt', dir: 'FC',  delay: 0.0 },
        { type: 'grunt', dir: 'FL',  delay: 0.8 },
        { type: 'grunt', dir: 'FC2', delay: 1.6 },
        { type: 'marksman', dir: 'FC',  delay: 2.5, aimIntervalMs: 3500, firstUnfavRelief: true },
        { type: 'marksman', dir: 'FL2', delay: 5.5, aimIntervalMs: 3500 } ] },
    ],
    clearReward: { item: 'tonic', count: 1 },
  },

  // ── S4 경복궁 회랑 A — 강제 L피크 (우견착의 고통 구간) ──
  {
    id: 'S4_corridorA', name: '경복궁 회랑', objective: '회랑을 지나 내전으로 향하라',
    fieldType: 'close', timerSec: 60,
    pos: [-6, 0, -70], look: [-9, 1.5, -88],
    covers: [{ id: 'pillar_A', peekSide: 'L', prop: 'pillarCorner' }],
    waves: [
      [ { type: 'grunt', dir: 'FC',  delay: 0.0 },
        { type: 'grunt', dir: 'FL',  delay: 1.2 },
        { type: 'grunt', dir: 'FC2', delay: 2.2 },
        { type: 'marksman', dir: 'FC', delay: 3.0, aimIntervalMs: 4000, firstUnfavRelief: true } ],
      [ { type: 'grunt', dir: 'FL',  delay: 0.0 },
        { type: 'grunt', dir: 'FC',  delay: 1.0 },
        { type: 'marksman', dir: 'FL2', delay: 2.0, aimIntervalMs: 3500 },
        { type: 'thrower', dir: 'HIGH_L', delay: 4.0 } ],
    ],
    clearReward: { item: 'smoke', count: 1 },
  },

  // ── S5 경복궁 회랑 C — 강제 R피크 (좌견착의 고통 구간 · S4의 미러 · 최고 밀도) ──
  {
    id: 'S5_corridorC', name: '후원 굽잇길', objective: '후원을 돌파해 보스룸에 도달하라',
    fieldType: 'close', timerSec: 60,
    pos: [2, 0, -92], look: [6, 1.5, -110],
    covers: [{ id: 'wall_C', peekSide: 'R', prop: 'wallCorner' }],
    waves: [
      [ { type: 'grunt', dir: 'FC',  delay: 0.0 },
        { type: 'grunt', dir: 'FR',  delay: 1.0 },
        { type: 'grunt', dir: 'FC2', delay: 2.0 },
        { type: 'marksman', dir: 'FC', delay: 3.0, aimIntervalMs: 4000, firstUnfavRelief: true } ],
      [ { type: 'shield', dir: 'FC2', delay: 0.0 },
        { type: 'grunt', dir: 'FR',  delay: 1.0 },
        { type: 'grunt', dir: 'FL',  delay: 2.0 },
        { type: 'marksman', dir: 'FR2', delay: 3.0, aimIntervalMs: 3500 } ],
      [ { type: 'marksman', dir: 'FC',  delay: 0.0, aimIntervalMs: 3200 },
        { type: 'marksman', dir: 'FR2', delay: 1.5, aimIntervalMs: 3200 },
        { type: 'thrower', dir: 'HIGH_R', delay: 3.0 },
        { type: 'grunt', dir: 'FL',  delay: 4.0 },
        { type: 'grunt', dir: 'FC2', delay: 5.0 } ],
    ],
    clearReward: { item: 'tonic', count: 1, ammoRefill: true, unlockWeapon: 'ritual',
                   vignette: '제단의 힘이 깃든 천마도를 얻었다 — 의식탄은 결정적 순간에만' },
  },

  // ── S6 보스룸 — 고붕이 (축소 2페이즈 · boss.js가 커버 전환 주도) ──
  {
    id: 'S6_boss', name: '근정전 보스룸', objective: '고붕이를 격파하라',
    fieldType: 'close', timerSec: null, boss: 'gobungi',
    pos: [0, 0, -118], look: [0, 2.2, -136],
    covers: [
      { id: 'altar_C', peekSide: 'TOP', prop: 'brokenAltar', offset: [0, 0, 0] },
      { id: 'rubble_L', peekSide: 'L', prop: 'rubbleL', offset: [-4, 0, 1] },
      { id: 'rubble_R', peekSide: 'R', prop: 'rubbleR', offset: [4, 0, 1] },
    ],
    waves: [],   // boss.js 가 스폰/페이즈 스크립트 전담
  },
];

// 레일 스플라인 포인트 (노드 pos + 중간점) — rail.js 가 CatmullRom 으로 사용
export const RAIL_POINTS = [
  [0, 0, 6], [0, 0, 0], [0, 0, -12], [0, 0, -22], [0, 0, -35], [0, 0, -46],
  [-3, 0, -58], [-6, 0, -70], [-3, 0, -82], [2, 0, -92], [1, 0, -106], [0, 0, -118],
];

// 공정성 원장 — 부팅 시 실데이터와 대조 assert (debug.js)
// 중립 = S1 + S2 + S6 P1 (셋 다 TOP) — 의식 화면 고지 문구와 반드시 일치
export const EDGE_CENSUS = { L: 2, R: 2, NEUTRAL: 3 };

export function computeEdgeCensus() {
  // 강제 단일 엣지 세그먼트만 집계: S3 은 웨이브별 커버(R,L 각 1), 보스 노드는 P1 중립만 집계
  let L = 0, R = 0, NEUTRAL = 0;
  for (const node of LEVEL) {
    if (node.boss) { NEUTRAL += 1; continue; }               // S6 P1 (TOP)
    if (node.id === 'S3_gate') { R += 1; L += 1; continue; } // w1 peek R + w2 peek L → 양손 각 1회
    const side = node.covers[0].peekSide;
    if (side === 'TOP') NEUTRAL += 1;
    else if (side === 'L') L += 1;
    else if (side === 'R') R += 1;
  }
  // S3 는 L/R 각각에 1씩 이미 반영됨. 원장 정의: 강제 L = S3w2 + S4 = 2, 강제 R = S3w1 + S5 = 2
  return { L, R, NEUTRAL };
}
