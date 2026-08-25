# OpenAI Game Builders Seoul — Track 1 제출 자료 (openaigame2026.com)

## 필수 입력값

**게임 제목**
```
Steam Inspector: 朝鮮 프로토콜
```

**게임 소개 (200자 이내 — 아래 약 160자)**
```
조선 스팀펑크 암행어사가 되어 증기 요괴에게 점령된 경복궁을 수복하는 1인칭 잠입 슈터. 시작 시 좌/우 견착을 한 번 고르면 되돌릴 수 없고, 리닝과 엄폐의 유불리가 그 선택으로 갈린다. 은신 암살, 마패 궁극기 '증기 폭격', 그리고 근정전을 지키는 증기 신수 해태와의 결전.
```

**플레이 링크 (무로그인·무설치 즉시 실행)**
```
https://festinz.github.io/joseon-protocol/
```

**썸네일 (16:9, PNG, 1.1MB)**
`docs/thumbnail.png`

## 가산점 자료

- **데모 영상 (≤3분)**: `docs/demo.mp4` — 녹화 절차는 아래

## 데모 영상 녹화 (제출 전, 사용자 플레이 필요)

1. 게임 열기: https://festinz.github.io/joseon-protocol/ (전체화면 권장)
2. 녹화 시작 (아래 명령 또는 OBS):
```bash
ffmpeg -f gdigrab -framerate 60 -i desktop -t 780 -c:v libx264 -preset veryfast -crf 20 "C:/Users/scj94/Documents/Claude/amhaengeosa/docs/raw_capture.mp4"
```
3. 한 판 완주 (견착 의식부터 장계 화면까지, ~10분)
4. Claude 가 3분 컷 편집: 0:00 견착 의식(훅) → 0:30 광화문 전투+은신 암살 → 1:10 무기 휠·수류탄·궁극기 폭격 → 1:50 멀기트 중간보스 → 2:20 해태 결전 피날레 → 2:50 장계

## 최종 체크리스트

- [ ] 클린 브라우저(시크릿)에서 URL 접속 → 완주 가능 확인
- [ ] 팀 3인 이하 (1인) ✓ / 8/31 서울 본선 참석 가능 ✓ (사용자 확인됨)
- [ ] 웹폼 제출 (Google 로그인 — 사용자 직접)
- [ ] 제출 후 접수 확인 스크린샷
