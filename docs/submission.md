# OpenAI Game Builders Seoul — Track 1 제출 자료 (openaigame2026.com)

## 필수 입력값

**게임 제목**
```
Steam Inspector: 朝鮮 프로토콜
```

**게임 소개 (200자 이내 — 아래 156자)**
```
조선 스팀펑크 암행어사가 되어 증기 요괴에게 점령된 경복궁을 수복하는 타임크라이시스식 레일 슈터. 시작 시 좌/우 견착을 한 번 선택하면 되돌릴 수 없고, 모든 엄폐 모서리의 유불리가 그 선택으로 갈린다. 숨으면 살고, 나가야 이긴다.
```

**플레이 링크 (무로그인·무설치 즉시 실행)**
```
https://festinz.github.io/joseon-protocol/
```

**썸네일 (16:9, PNG, 1.1MB)**
`docs/thumbnail.png`

## 가산점 자료

- **데모 영상 (≤3분)**: `docs/demo.mp4` — 녹화 절차는 아래
- **Codex 활용 문서**: `docs/codex/` — 블록 #1(전투 코어 리뷰) 프롬프트+출력 로그. 개발 요약: "Claude Code가 설계·구현을 주도하고, OpenAI Codex(gpt-5.2-codex)가 핵심 전투 코드의 독립 리뷰와 버그 헌트를 수행하는 이중 에이전트 워크플로"

## 데모 영상 녹화 (제출 전, 사용자 플레이 필요)

1. 게임 열기: https://festinz.github.io/joseon-protocol/ (전체화면 권장)
2. 녹화 시작 (아래 명령 또는 OBS):
```bash
ffmpeg -f gdigrab -framerate 60 -i desktop -t 780 -c:v libx264 -preset veryfast -crf 20 "C:/Users/scj94/Documents/Claude/amhaengeosa/docs/raw_capture.mp4"
```
3. 한 판 완주 (견착 의식부터 장계 화면까지, ~10분)
4. Claude 가 3분 컷 편집: 0:00 견착 의식(훅) → 0:30 광화문+궁극기 → 1:10 좌/우 견착 비교(?hand= 재현) → 1:50 관문 스왑 → 2:20 고붕이 피날레 → 2:50 장계

## 최종 체크리스트

- [ ] 클린 브라우저(시크릿)에서 URL 접속 → 완주 가능 확인
- [ ] 팀 3인 이하 (1인) ✓ / 8/31 서울 본선 참석 가능 ✓ (사용자 확인됨)
- [ ] 웹폼 제출 (Google 로그인 — 사용자 직접)
- [ ] 제출 후 접수 확인 스크린샷
