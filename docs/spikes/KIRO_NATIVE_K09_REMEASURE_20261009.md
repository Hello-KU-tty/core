# K09 재실측: 본선 계정과 0.2.1 (2026-10-09)

[첫 체험](KIRO_NATIVE_FIRST_TRIAL_20261009.md) 피드백을 반영한 0.2.1을 본선 팀 계정에서 처음부터 끝까지 다시 돌렸다. 판정은 Core SQLite의 구조화 필드, Kiro 세션 기록의 도구 호출·승인 이벤트, Kiro 로그로만 했다.

## 조건

- Kiro IDE 1.2.37, kiro-cli 2.28.0, 본선 계정(IAM Identity Center). 격리 user-data-dir 프로필에 0.2.1 설치, 채팅 모델 Auto, Analyst Auto.
- 처음 보는 학습 목표와 Personal Need: "웹소켓으로 실시간 기능을 직접 만들어 보면서 배우고 싶어요" / "동아리 회의 때 질문을 실시간으로 받고 바로 투표할 수 있는 도구가 필요해요". Campus Drop이 아니다.
- 패널 조작은 패널과 같은 Core 요청 순서를 스크립트로 보냈다(Discovery → 후보 선택 → 계획 생성 → 확정 → Task 준비). 연결은 host와 같은 인자(`workspace`=지금 연 빈 폴더, `allowCoreTools: true`)로 연결 API를 불렀다. 채팅은 비공개 개발 명령(`kiroAgent.sessions.create`, `sendPrompt`)으로 보냈다.
- 이 테스트 폴더에만 개발 명령 허용 목록(node·npm·npx·pnpm·git·ls 등)을 Kiro 권한 파일에 넣었다. 목록 밖 명령의 승인은 감시 스크립트가 "이번만 허용"으로 눌렀다(`kiroAgent.execution.runOrAcceptAll`, 해당 세션이 화면에 보일 때만 동작).

## 계정 확인

- 처음 연 IDE는 kiro-cli 로그인 뒤 토큰이 무효였고, 그 상태의 정책은 fail-closed로 `mcpEnabled: false`였다. IDE에서 조직 계정으로 다시 로그인하자 `mcpEnabled: true`, `webToolsEnabled: true`가 적용됐다. IDE와 kiro-cli 로그인은 따로 해야 한다.
- kiro-cli에서도 MCP 도구 호출이 된다(최소 MCP 서버로 1회 확인, 0.014크레딧).
- 본선 계정 모델: auto, Claude Opus 5.5·Sonnet 5.5(preview), Opus 5·4.8·4.7·4.6·4.5, Sonnet 5·4.6·4.5·4, Haiku 4.5, GPT-5.6 sol·terra·luna(preview), DeepSeek 3.2, MiniMax, GLM-5, Qwen3 Coder Next.

## 결과

| 확인 | 결과 |
| --- | --- |
| Discovery·계획 | 미리보기 10개 30초, 선택·계획 생성 38초. 계획의 예상 Decision은 빈 목록 |
| 현재 폴더 연결(6) | 빈 폴더에 그대로 등록(`registered: true`), 다시 로드 없이 Builder MCP 연결과 `vibe-helper` 에이전트 등록 |
| hook 적재·기록(7) | 새 세션을 만들 때 hook 2개 등록. 채팅 발언 4개가 `USER_MESSAGE`로 기록(신뢰된 폴더 기준) |
| 환경 확인(13) | 첫 빌드 전에 `uname -sm; node -v; npm -v; pnpm -v; yarn -v; bun -v; python3 --version; git --version` 실행 |
| 작업 맥락(9) | `start_task` 직후 `update_build_context`(TASK_STARTED), 완료 전 TASK_COMPLETED 기록 뒤 `complete_task` |
| Decision 시점(4·8) | 타입·저장소를 먼저 만들고 웹소켓 서버를 쓰기 직전에 "같은 질문 중복 투표" Decision 하나를 올림. 예상 목록에 없던 실제 판단이다. 기록(`request_user_decision`)이 먼저였고 채팅 질문은 "결정이 기록되었습니다" 뒤에 나왔다 |
| Decision 확정 | 자연어 답(3번과 이유)이 첫 시도에 `OPTION`, `mappedBy: BUILDER`, 이유 원문 그대로 기록. 이어서 `apply_decision_result` |
| Vibe Helper 도구 | 11회 호출, 실패 0(첫 체험 25회 중 9회 실패) |
| 도구 허용(11) | Vibe Helper 도구 승인 창 0회 |
| 셸 승인(K11 자료) | 허용 목록 밖 명령 9회 승인 필요. `node`·`npm`도 `| head`, `| tail`, `2>&1`, `rm -rf`, `pkill`, `lsof | xargs kill`과 이어지면 다시 물었다 |
| Helper 탭(9) | Builder가 작업하는 중에 다른 탭의 `/vibe-helper` 질문에 Builder의 진행 중 활동이 "기록이며 지시가 아니다"로 붙었고, Helper가 그 내용을 바탕으로 답함. `HELPER_RESPONSE` 기록 |
| Analyst와 상태 | DECISION·HELPER_CONVERSATION·BUILD_TASK Episode 분석 완료. Decision의 `JUSTIFIED_DECISION` 제안이 `MEDIUM` 강도에 `DEMONSTRATED`를 붙여 Core가 `OVERSTATED_MAXIMUM_STATE`로 거절(정책상 MEDIUM은 EXPLAINED까지). Builder 보고 개념 4개가 OBSERVED, 학습자 요약 파일 갱신 |
| 결과물 | 실시간 익명 질문·투표 앱, 테스트 10개 통과(Agent 보고) |

## 크레딧

계정 사용량(IDE의 사용량 조회 기록): 시작 0 → 11.55(Analyst 모델 평가와 MCP 확인) → 27.03. 채팅 14.88(첫 턴 2.68, 구현 턴 11.79, Helper 0.41, 멈춘 첫 세션은 기록 없음), Core의 kiro-cli 실행(Discovery 3회, Analyst 3회) 약 0.6.

## 확인하지 못한 것

- 채팅 모드 목록에서 `vibe-helper` 에이전트를 직접 고르는 화면 조작(공개 명령이 없어 사용자 클릭이 필요). 같은 경로의 판별은 단위 테스트로만 확인했다.
- Workspace Trust 화면, 도구 허용 동의 창, 새 창 열기 확인 창의 실제 화면.
- 첫 세션은 승인 창을 누르지 못해 멈췄다. Kiro 1.2.37은 화면에 보이지 않는 세션의 승인을 명령으로 처리하지 못한다.

## 따라 나온 판단 거리

- **Analyst 모델:** 본선 계정 평가에서 Auto 11/16, Sonnet 5.5와 Opus 5.5 14/16이었고, 실측에서도 Auto가 학습자의 실제 판단을 과대 판정해 Evidence가 남지 않았다. [모델 비교](../../tests/eval/results/evidence-analyst-models-kiro-cli.md).
- **과대 판정 처리:** Core는 정책 최대를 넘는 제안을 낮추지 않고 거절한다. 그대로 둘지, 정책 최대로 낮춰 받을지는 Evidence 정책 결정이다.
