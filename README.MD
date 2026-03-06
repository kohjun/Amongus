[React Native 앱]
  ├── 로비 화면
  ├── 역할 화면 (개인화)
  ├── 메인 게임 화면
  │     ├── 미션 목록
  │     ├── 지도 (구역 표시)
  │     ├── 킬/신고 버튼
  │     └── AI 가이드 피드
  ├── 회의 화면
  └── 결과 화면

        ↕ WebSocket + REST API

[FastAPI 서버]
  ├── RoomManager     방 생성/입장/퇴장
  ├── GameEngine      규칙, 상태, 이벤트 처리
  ├── ProximityMgr    UWB/BLE 거리 관리
  ├── MissionSystem   미션 부여/완료 확인
  ├── ItemSystem      재화/아이템 관리
  ├── VoteSystem      회의/투표/추방
  └── AIDirector      LLM 해설/가이드

        ↕

  [Redis]              [PostgreSQL]
  게임 세션 상태        유저, 전적, 재화 영구저장

  Phase 1: 설계 (지금 여기)
  └── 요구사항 정의 → 시스템 설계 → DB 설계

Phase 2: 백엔드 코어
  └── 프로젝트 세팅 → GameEngine → WebSocket 서버

Phase 3: 근접 감지
  └── BLE 먼저 → UWB 추가

Phase 4: AI Director
  └── LLM 연동 → 이벤트별 해설 → 역할별 가이드

Phase 5: 클라이언트
  └── React Native 앱 → 역할 화면 → 회의/투표 UI

Phase 6: 통합 테스트
  └── 실제 기기 테스트 → 밸런싱 → 배포




  미션 타입 3가지
  ├── QR_SCAN    : 특정 구역 QR코드 스캔
  ├── MINI_GAME  : 앱 내 미니게임 (배선, 슬라이더)
  └── STAY       : 특정 구역에 N초 머물기

미션 상태
  PENDING → IN_PROGRESS → COMPLETED / FAILED

미션 배정 규칙
  ├── 크루원만 미션 배정 (임포스터는 가짜 미션)
  ├── 플레이어당 settings.missionPerCrew 개
  └── 구역별로 고르게 분배


## 전체 미션 흐름 정리
```
게임 시작
  ↓
assignMissions() → 크루원: 실제 미션 3개 / 임포스터: 가짜 미션 2개
  ↓
플레이어가 구역 이동 (move 이벤트)
  ↓
handleZoneEnter() → 해당 구역 미션 활성화
  ├── QR 미션    → "QR 스캔 가능" 알림
  ├── 미니게임   → 미니게임 UI 열림
  └── STAY 미션  → 타이머 자동 시작
  ↓
미션 완료
  ├── qr_scan 이벤트        → handleQRScan()
  ├── minigame_complete 이벤트 → handleMiniGameComplete()
  └── STAY 타이머 종료       → _completeMission()
  ↓
재화 지급 + 전체 진행도 업데이트
  ↓
모든 미션 완료 → 크루원 승리

## ProximitySystem 

기기별 전략
  ├── UWB 지원 기기   → Nearby Interaction (iOS) / UWB Jetpack (Android)
  └── UWB 미지원 기기 → BLE RSSI 기반 거리 추정

서버 역할
  ├── 토큰 교환 중개 (UWB 세션 맺기 전 필요)
  ├── 거리 행렬 관리 { playerA: { playerB: 거리 } }
  ├── 킬 가능 여부 판정
  └── 근접 이벤트 감지 (같은 구역 진입 등)

정확도
  ├── UWB: ~10cm 오차, 방향까지 감지
  └── BLE: ~1~3m 오차, RSSI로 추정


  ```

---

## 전체 흐름 정리
```
게임 시작
  ↓
각 기기: initUWB() → 내 토큰 생성
  ↓
서버에 토큰 등록 → 다른 플레이어에게 브로드캐스트
  ↓
모든 기기가 서로 UWB 세션 맺음 (n:n 1:1 세션)
  UWB 실패 시 → BLE 스캔으로 자동 폴백
  ↓
실시간 거리 측정 → proximity_update 이벤트 → 서버 행렬 갱신
  ↓
임포스터가 크루원에게 1.5m(UWB) / 3m(BLE) 이내 접근
  ↓
서버 → killable_targets 이벤트 → 킬 버튼 활성화
  ↓
임포스터가 킬 버튼 클릭 → 서버 검증 → 킬 확정


## 투표 시스템

회의 단계
  DISCUSSION (토론) → VOTING (투표) → RESULT (결과) → END (복귀)

회의 소집 조건
  ├── 시체 신고: 시체 근처(5m)에 있는 플레이어만 가능
  └── 긴급 버튼: 살아있는 플레이어 누구나 (게임당 1회)

투표 규칙
  ├── 자기 자신에게 투표 불가
  ├── 죽은 플레이어는 투표 불가
  ├── SKIP 가능 (추방 없음)
  ├── 동률이면 추방 없음
  └── 과반수 득표자 추방

추방 후
  ├── 역할 공개 (임포스터였는지)
  └── 승리 조건 체크


  ```

---

## 전체 투표 흐름
```
시체 발견 or 긴급버튼
  ↓
validateMeeting() → 조건 검증
  ├── 시체 신고: 신고자가 시체 5m 이내인지 체크
  └── 긴급버튼: 게임당 1회 사용 여부 체크
  ↓
startMeeting() → VoteSession 생성
  ↓
meeting_started 이벤트 → 전체 브로드캐스트
  ↓
[토론 단계 90초] - 매초 tick 이벤트
  ↓
voting_started 이벤트
  ↓
[투표 단계 30초] - 모두 투표하면 즉시 마감
  ↓
tally() → 집계
  ├── 동률 or SKIP → 추방 없음
  └── 최다 득표자 → 추방 + 역할 공개
  ↓
vote_result 이벤트 → 결과 5초 표시
  ↓
meeting_ended 이벤트
  ├── 승리 조건 충족 → 게임 종료
  └── 미충족 → 게임 복귀
```



AIDirector가 하는 일
  ├── 게임 이벤트 해설 (킬, 회의, 추방, 게임 종료)
  ├── 역할별 개인 가이드 (임포스터 전략 / 크루원 조언)
  ├── 회의 진행 (토론 유도, 분위기 조성)
  └── 긴장감 연출 (미션 진행도, 위기 상황)

핵심 원칙
  ├── 크루원에게 임포스터 정보 절대 누설 금지
  ├── 임포스터에게는 은밀한 전략 조언
  ├── 게임 맥락(킬 수, 미션 진행도, 인원)에 맞는 톤 유지
  └── 짧고 임팩트 있게 (모바일 화면 기준)

LLM 호출 전략
  ├── 공개 해설: GPT-4o-mini (빠름, 저렴)
  └── 개인 가이드: GPT-4o (정확, 맥락 이해)

```

---

## AI 메시지 흐름 정리
```
게임 이벤트 발생
  ↓
EventBus 이벤트 emit
  ↓
EventSubscriber가 감지
  ↓
AIDirector.on이벤트() 비동기 호출
  ├── 공개 해설 → LLMClient.chat() → gpt-4o-mini
  └── 개인 가이드 → LLMClient.chat() → gpt-4o
  ↓
생성된 메시지
  ├── 공개 해설 → io.to(roomId).emit('ai_message')  → 전체
  └── 개인 가이드 → socket.emit('ai_guide')          → 본인만
  ↓
클라이언트 AIMessageFeed 컴포넌트
  ├── 공개 메시지 → 피드에 쌓임
  └── 개인 가이드 → 상단 팝업 8초 후 사라짐


재화 획득 경로
  ├── 미션 완료          +10~20 코인
  ├── 회의에서 무고 투표  +15 코인
  ├── 임포스터 추방 기여  +30 코인
  └── 게임 승리          +50 코인

아이템 목록
  ├── 공용
  │   └── 연막탄: 5초간 내 위치 숨김
  ├── 크루원 전용
  │   ├── 지도:     30초간 모든 플레이어 구역 표시
  │   ├── 방탄조끼: 다음 킬 1회 무효
  │   └── 탐지기:   30초간 주변 5m 임포스터 감지
  └── 임포스터 전용
      ├── 변장:     30초간 크루원으로 위장
      └── 방해전파: 30초간 특정 구역 미션 불가

아이템 효과 적용 시점
  ├── 즉시 효과: 사용 즉시 적용 (연막탄, 변장)
  └── 수동 효과: 조건 충족 시 자동 발동 (방탄조끼)

  ```

---

## 전체 아이템 흐름
```
재화 획득
  ├── 미션 완료          MissionSystem._completeMission()
  ├── 회의 무고 투표     VoteSystem._processResult()
  ├── 조건 달성          ItemSystem.checkConditions()
  └── 게임 종료          ItemSystem.grantEndGameRewards()
         ↓
      player.currency 증가 → currency_updated 이벤트

아이템 구매
  purchase_item 소켓 → ItemSystem.purchaseItem()
  → 역할/잔액 검증 → player.items 업데이트

아이템 사용
  use_item 소켓 → ItemSystem.useItem()
  → ActiveEffect 생성 → 타이머 설정
  → 효과별 즉시 처리 (지도, 탐지기, 방해전파)

킬 시도 시
  GameEngine.handleKill()
  → ItemSystem.checkBulletproof() 호출
  → 방탄조끼 있으면 킬 무효 처리
```
단계별 테스트
  ├── 1. 환경 세팅 & 서버 실행 확인
  ├── 2. 단위 테스트 (각 시스템 독립 검증)
  ├── 3. 통합 테스트 (시스템 간 연동)
  └── 4. E2E 테스트 (실제 소켓 시뮬레이션)