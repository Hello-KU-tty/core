# Mac 0.2.12 실제 Kiro 확인 (2026-10-17, K21·K22)

격리 Kiro 프로필(`experiments/kiro-vsix-check-021`, Kiro IDE 1.2.56, 본선 계정, 모델 Auto, Autopilot, Workflow 꺼짐)에 릴리스 빌드 `builder-helper-agent-panel-0.2.12-darwin-arm64.vsix`(backend `c781eb5`, program `1eefe3f`)를 설치했다. 학습자 발언은 합성이며 실제 사용자 데이터가 아니다.

## 업그레이드

- Kiro를 띄우고 4초 뒤 0.2.12 Core가 준비됐다.
- 0.2.11 때 연결된 `k20d-ws`가 Core 시작과 함께 Steering 0.9.4와 새 미리 승인 규칙(`Out-String`, `Invoke-WebRequest "http://localhost:*`)을 받았다. 0.2.11 규칙이 인식 목록에서 올라온 것이다.

## 첫 Task

- 목표: "가게 재고를 관리하는 간단한 API를 만들어 보고 싶어. 데이터베이스는 처음이야." Discovery 1.4.0, 첫 후보 "편의점 상품 입출고 API". 학습 목표는 INSERT/UPDATE/SELECT 쿼리(관계형 데이터베이스 설계, 트랜잭션과 동시성)이고 예상 Decision은 0개였다.
- 첫 발언은 "계획대로 만들기 시작해 줘", 답은 "2번으로 할게. 지금 몇 개 남았는지 바로 보는 게 편할 것 같아"였다.

| 확인 | 결과 |
| --- | --- |
| 첫 환경 확인 | `node -v; npm -v; pnpm -v; yarn -v; bun -v; python3 --version; git --version` 한 줄, 승인 없음(Steering 0.9.3) |
| 코드 전 질문 | 뼈대와 설치 뒤, DB 코드 전에 `ask_choice`(이력 테이블만 vs 이력 + 현재 수량 테이블) → 답 → `save_choice` → 구현 |
| 실패 보고 | `npm install`이 `better-sqlite3` 빌드 실패로 끝나자 "설치가 실패했어요"라고 말하고 Node 내장 SQLite로 바꿈(Steering 0.9.4) |
| 승인 창 | 2개. `rm -rf node_modules package-lock.json`, `rm -f inventory.db`. 둘 다 삭제 명령이라 일부러 묻는 종류다 |
| 서버 | 켜 둔 채 `curl -s http://localhost:3000/items`, `open "http://localhost:3000/items"`, 승인 없음 |
| 완료 | 첫 `finish_task` 성공, `ignoredConcepts: []` |
| 개념 기록 | Builder가 보낸 이름 "관계형 데이터베이스 설계", "트랜잭션과 동시성"이 Spec 이름과 같았다. `conceptUsage` 2개, `accepted_evidence` 3개(OBSERVED) |
| Next Move | `SUCCEEDED` |
| 크레딧 | 채팅 7.07(2.23 + 4.85) |

- **남은 말투:** "여기서 중요한 실제 선택이 하나 있어요"(Steering이 금지한 "real choice"의 번역), "이 부분은 제가 알아서 정하는 영역이라"(담당 이야기)가 한 번씩 나왔다. 일본어 낱말 하나("同じ")가 섞인 문장도 있었다.
- **Mac 셸:** Kiro `execute_bash`는 학습자의 Node 26(Homebrew)을 썼다. Project 터미널 환경(K17)은 Mac Kiro의 셸 도구에 들어가지 않는다. 그래서 K22 npm 수정의 실제 효과는 Windows 확인에서 본다. 수정 자체는 이 Mac의 npm 11.17.0으로 재현과 해소를 확인했다.

## program #11·#12

- **#11 Restore Kiro Layout:** probe로 `vibeHelper.restoreLayout`을 실행했다. "터미널·출력 창 같은 Kiro 화면 배치를 처음 상태로 되돌릴까요?" 알림이 떴고, "되돌리기"를 누르자 명령이 끝났다.
- **#12 재연결 뒤 flow 포트:** 패널을 열 때 Core를 준비하지 못한 상태(절전 직후 등)에서만 생기는 문제라 이 Mac에서 그 상태를 만들지 못했다. program `1eefe3f`의 테스트(`test/flow-ports-reconnect.test.ts` 포함 843개)와 타입 검사가 이 Mac에서 통과한 것으로 갈음한다.

## 신뢰 창

- 새 Project 창의 신뢰 → 다시 로드를 줄이려고 "상위 폴더 신뢰" 선택지를 확인하려 했다. 이 프로필은 probe를 쓰는 개발 호스트 창이라 신뢰 창이 뜨지 않아 확인하지 못했다. Windows 부스 PC에서 확인을 요청한다([0.2.12 인계](../../docs/FRONTEND_HANDOFF_0.2.12.md)).
