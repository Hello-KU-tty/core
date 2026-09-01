# Builder Agent v1.1.0 Decision lifecycle regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/builder.md` version `1.1.0`
- 경로: Task start → blocking Decision request → Helper context handoff → user recommendation resolution → Builder resume/application → Task completion
- 런타임: Kiro CLI 2.20.2 Agent Engine v2, `claude-haiku-4.5`, low effort
- 권한: Builder role-bound MCP 7개 tool과 생성 workspace로 제한된 native file/shell

## 결정론적 회귀

- `builder-v1.1-decision-webhook` fixture는 unknown-field 처리라는 사용자 가시 제품 동작 Decision, 최종 Context의 빈 active Decision 목록과 Completion Report의 동일 `appliedDecisionIds`를 strict contract로 재생했다.
- 기록된 사람 review는 이 선택이 forward compatibility와 runtime validation 동작을 바꾸므로 실제 Decision이라고 판정했다.
- 기존 `trivial-decision` 음성 fixture는 파일명 선택을 되돌리기 쉬운 내부 구현 세부사항으로 계속 거절한다.
- Application/MCP integration은 blocking·independent Decision, idempotent request, stale revision, Helper handoff, option/recommendation/custom resolution 계약, apply-before-complete gate와 재시작 가능한 durable aggregate를 검증한다.
- 이유 없는 recommendation resolution은 `DECISION_RESOLVED.rationaleProvided=false`로 정규화되며 사용자 이해 Evidence로 수용되지 않는다.

## Live Kiro 결과

2026-09-01 `pnpm test:eval:live-builder`가 실제 로그인된 Kiro 실행에서 통과했다.

- 첫 Agent turn이 Task revision 2와 Context version 1에서 blocking `PRODUCT_BEHAVIOR` Decision을 요청했다. Core는 stable Decision/option metadata를 채우고 Decision과 `DECISION_REQUIRED` Context version 2를 한 transaction에 저장했으며 Task를 revision 3 `BLOCKED`로 전이했다.
- Helper query에는 같은 active Decision ID가 전달됐다. user-authored recommendation resolution과 rationale 저장 뒤 Task가 revision 4 `ACTIVE`로 재개됐다.
- 두 번째 Agent turn은 durable resolution을 조회하고 선택된 DONE-title 동작을 구현한 뒤 `apply_decision_result`를 호출했다. DecisionApplication과 `DIRECTION_CHANGED` Context version 3이 함께 저장됐다.
- 초기 `node --test` 실패 뒤 구현 후 test가 통과했고, `VALIDATION_STARTED` version 4와 `TASK_COMPLETED` version 5, sole applied Decision이 있는 Completion Report를 저장해 Task revision 5로 완료했다.
- 독립 검증 test exit code는 0, workspace 밖 sentinel은 변경되지 않았고 Helper가 최종 Context version 5를 복원했다.
- redaction된 transient stream에는 message, tool call, file change, test result, status와 차단된 workspace escape error가 포함됐다. raw stream과 임시 경로는 repository에 저장하지 않았다.
