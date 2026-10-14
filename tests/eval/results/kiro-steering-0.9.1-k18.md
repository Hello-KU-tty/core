# K18 실제 Kiro 확인: Core 실행 파일 이름, Core 재시작, Steering 0.9.1 (2026-10-14)

Mac VSIX 0.2.10(backend `dc5859e` 깨끗한 worktree, frontend `main` `324214e`)을 격리 Kiro 프로필(Kiro IDE 1.2.56, kiro-agent 1.1.343, 본선 계정, 채팅 모델 Auto)에 0.2.9에서 올려 설치했다. 프로필 설정에 `kiroAgent.workflows.enabled: true`를 켰다. frontend Windows 0.2.9 확인에서 Workflow 위임이 나온 조건이다. 확인 뒤에는 설정을 되돌렸다. 합성 학습자 발언이며 실제 사용자 데이터가 아니다. 화면 조작 없이 probe 확장으로 세션을 만들고 발언을 보냈다. 판정은 프로세스 목록, Core 파일(`connection.json`·`backend.*`), Kiro 세션 기록으로 했다.

## 실행 파일 이름

- 업그레이드 전(0.2.9) Project 폴더 `.kiro/settings/mcp.json`의 bridge 명령은 PATH에 있던 Node였다(이전 세션 scratchpad의 `node2419/bin/node`). PATH 탐색이 Core 런타임을 고르던 경로다.
- 0.2.10을 연 뒤:
  - Core와 MCP bridge가 `core-tools/runtime-cache/node-darwin-arm64-<sha>/vibe-helper-core`로 돌았다.
  - Core가 시작하면서 Project 폴더의 MCP 명령, hook 2개, Steering(0.9.1)을 새 경로로 다시 썼다.
- `pgrep -x node`(`killall node`가 고르는 대상)와 `pgrep node`(`pkill node`가 고르는 대상) 목록에 Core·bridge PID가 없었다. `pgrep -x vibe-helper-core`에는 둘 다 있었다.
- 이 Mac의 다른 node 프로세스(약 70개) 때문에 실제 `killall`·`pkill`은 돌리지 않았다. Windows의 `Get-Process -Name node | Stop-Process`는 frontend가 확인한다.

## Core 재시작

| 시험 | 결과 |
| --- | --- |
| Core만 PID로 강제 종료(`kill -9`) | host가 2초 만에 새 Core를 띄웠다. bridge는 그대로였다. 이어진 채팅 턴의 `check_progress`가 새 Core로 갔다 |
| 창 다시 로드(이전 host 종료) 뒤 80초 | Core가 그대로 살아 있었다. 새 host가 lease를 갱신했다 |
| 다시 로드 뒤 Core 강제 종료 | 3초 만에 새 Core, bridge 그대로 |
| Kiro 종료 | 마지막 host가 사라지고 23초 뒤 Core가 스스로 정상 종료(`backend.stopped-…`). 갱신 만료를 2분으로 늘려도 종료가 늦어지지 않는다 |

- 패널을 닫고 다시 로드하는 시험은 할 수 없었다. frontend 확장이 활성화될 때 패널을 직접 연다(`revealAgentPanel`). 그래서 실제 Kiro에서는 패널 없는 창이 생기지 않는다. 패널 없이 Core를 띄우는 경로, `FAILED` 뒤 다시 시도, 절전 뒤 유예는 단위 테스트로만 확인했다.
- 이 사실로 보면 Windows 사건 2(다시 로드 뒤 Core가 다시 뜨지 않음)는 패널이 닫혀서가 아니다. host의 `FAILED` 고착이나 절전 직후 lease 만료 쪽이다.

## Steering 0.9.1과 Workflow

Workflow를 켠 새 세션의 `session.json`은 `workflowsEnabled: true`였다. Kiro가 세션 시작에 넣는 지침에는 다음이 있다.

- "**Always** create and launch the workflow with a single `run_workflow` call carrying a `workflowPrompt` brief"
- 파일 내용을 읽어 문제를 이해하는 일도 workflow의 몫이고, 사소한 수정만 직접 하라는 내용

Workflow 안의 계획 에이전트는 "설계가 없으면 스스로 정하고, 여러 안이 가능하면 하나를 골라 이유를 적으라"는 지침을 받는다. 위임하면 학습자 선택이 빠지는 구조다. 이 지침의 강도는 서버 A/B 설정(`delegationEnabled`)으로 바뀐다.

| 세션 | Steering | 학습자 | Builder | 크레딧 |
| --- | --- | --- | --- | --- |
| A | 0.9.1 | "좌석이 다 찼을 때 대기 명단에 올릴 수 있게 해 줘. 누가 예약을 취소하면 다음 대기자에게 자리가 가도록 하고 싶어." | 환경 확인 → 코드 읽기 → `check_progress` → PLAN(후속 Task) → 기준선 테스트 → 코드 직전에 `ask_choice`(취소 시 바로 확정 1 추천 / 기회만 2) → 질문으로 끝냄. `run_workflow` 없음 | 1.56 |
| A | 0.9.1 | "1번으로 할게. 대기하던 사람이 따로 신경 안 써도 자리를 확실히 받는 게 좋을 것 같아." | `save_choice` 1 → 타입·저장소·엔드포인트·테스트 11개 → 빌드와 테스트 21개 통과 → `lsof -ti tcp:3100`으로 포트 확인 → `npm start`(백그라운드) → 자기 API를 curl로 확인(변수 `$B`가 든 명령이라 승인 창, 내용 확인 뒤 승인) → `finish_task` 첫 시도 성공 → 서버를 켜 둔 채 `open http://localhost:3100/seats`, 주소 안내, 다음 한 걸음 한 줄 | 5.07 |
| B(대조) | 0.9.1에서 workflow 문단만 뺌 | "이제 이 API를 쓰는 관리자용 웹 화면도 만들어 줘. 좌석 현황이랑 예약, 대기 명단을 한 화면에서 보고 직접 바꿀 수 있게." | 코드 읽기 → `check_progress` → PLAN → `ask_choice`(현황 갱신 방식). 여기서 취소했다. `run_workflow` 없음 | 1.22 |

- **판정:** 0.9.1은 Workflow가 켜진 세션에서 채팅 안에서 만들고, 선택을 코드 직전에 하나 묻고, 완료와 서버 유지까지 했다. 프로세스를 이름으로 끈 명령은 없었다.
- **결론이 나지 않은 것:** 대조 세션(B)도 위임하지 않았다. 이 계정·후속 Task 조건에서는 위임이 재현되지 않아, 0.9.1 규칙의 효과는 Mac에서 확인하지 못했다. Windows에서 위임이 나온 조건(첫 Task "계획대로 만들기 시작해 줘", Workflow 켬)의 재확인은 frontend Windows 0.2.10 확인 9·14가 맡는다.
- **기존 문제 재발(K14 범위):** 대조 세션 B의 중간 문장 "로그인/인증은 제가 알아서 정하는 영역이라"가 규칙 말하기 금지를 어겼다. 0.9.1에서 바뀐 부분이 아니다. 대조 세션에는 workflow 문단만 빠져 있었다.
- 채팅 크레딧 합계 약 7.85(계정 누적 157.22 → 약 165.1, Analyst·Next Move 몫 별도 약 0.3).
