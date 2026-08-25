// cover.js — (자유이동판) 구 엄폐 시스템의 호환 어댑터.
// 노출/유불리 개념은 리닝(rail.js)으로 이관됐다. 기존 임포트 경로를 살리기 위한 얇은 층.

import { state } from './state.js';
import { isFavorable as leanFav, leanAmount } from './rail.js';

export function isFavorable() { return leanFav(); }
export function exposedFraction() { return leanAmount(); }
export function forceCover() { /* 자유이동판: 강제 엄폐 없음 */ }
export function refreshPeekParams() { state.emit('peekChanged', {}); }
export function updateCover() { /* rail.js(플레이어)가 리닝 처리 */ }
export function swapCover() { }
export function currentPeek() { return null; }
