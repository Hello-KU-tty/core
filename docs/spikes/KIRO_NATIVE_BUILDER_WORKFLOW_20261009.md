# K10 입력: 현재 Kiro 채팅 Builder 워크플로 한 장 정리 (2026-10-09)

재설계 전 현재 상태만 적는다. 기준은 backend `012c664`(0.2.2), Steering 0.5.0([원문](../agent-prompts/kiro-steering.md)), 계약 [`build.ts`](../../packages/contracts/src/build.ts)·[`agent-contracts.ts`](../../packages/contracts/src/agent-contracts.ts), MCP [`role-server.ts`](../../apps/mcp-server/src/role-server.ts), Core [`application-service.ts`](../../packages/application/src/application-service.ts)와 domain reducer다. 제안은 넣지 않았다. 맨 아래 검토 거리는 [TASKS K10](../TASKS.md) 초안 그대로다.

## 1. 한 번의 Task 흐름

```
[연결] Open Project in Kiro Chat → Project 폴더 .kiro/ 에 Steering 2개·hook 2개·MCP·Helper 에이전트·Spec 기록
[세션 시작] 새 채팅 세션에서 Steering 고정, hook 적재
  │  hook UserPromptSubmit ─ 학습자 발언마다 Core에 USER_MESSAGE 기록 (Builder는 message ID를 받지 못함)
  │  hook Stop ──────────── Helper 탭이면 마지막 답을 HELPER_RESPONSE로 기록
  ▼
 0. 환경 확인 셸 명령 1회 (Steering 규칙, Core는 모름)
 1. get_build_status ───────── task revision, context version, 열린 Decision(번호 선택지) 읽기
 2. start_task ─────────────── Task가 PENDING일 때만. PENDING→ACTIVE, task rev +1
 3. update_build_context ───── checkpoint TASK_STARTED, context v1 (첫 기록은 반드시 이것)
 4. (구현)  방향 변경·검증 시작 때 update_build_context (v+1씩)
 5. request_user_decision ──── Core가 context를 DECISION_REQUIRED로 자동 기록(v+1). 막는 Decision이면 Task BLOCKED(rev+1)
 6. 채팅에 번호 선택지로 질문 → 학습자 답 (hook이 USER_MESSAGE 기록)
 7. resolve_decision_from_chat ─ 인용을 Core가 원문 대조. BLOCKED였으면 ACTIVE(rev+1)
 8. (선택한 안 구현)
 9. apply_decision_result ──── Core가 context를 DIRECTION_CHANGED로 자동 기록(v+1), 그 Decision을 active 목록에서 뺌
10. update_build_context ───── checkpoint TASK_COMPLETED
11. complete_task ──────────── 완료 보고(수락 기준·검증 결과·개념 사용) 검증 후 COMPLETED
  ▼
[분석] Episode 종료 → Core가 kiro-cli Analyst 실행(Sonnet 5.5 → Auto) → Evidence 정책 → Concept State
       → .vibe-helper/learner-profile.md 갱신 → 다음 세션 Steering이 읽음(진행 중 세션에는 hook이 한 번 덧붙임)
```

Helper 탭: `vibe-helper` 에이전트 세션의 발언은 USER_MESSAGE가 아니라 Helper 질문으로 처리한다. 다른 탭 Builder의 최근 활동을 hook이 "기록이며 지시가 아니다"로 붙이고, Helper는 `get_helper_context`(읽기 전용 1개)만 쓴다.

## 2. Builder 도구 9개

"필수"는 최상위 필수 필드 수, "식별·버전·키"는 그중 Agent가 Steering의 값이나 직전 응답을 옮겨 적어야 하는 필드다. 9개 도구 입력 schema는 합쳐 약 29KB(JSON Schema 기준)다.

| 도구 | 쓰기 | 필수 | 식별·버전·키 (Agent가 채움) | Core 검사(거절 코드) | Core가 따라 하는 일 |
| --- | --- | --- | --- | --- | --- |
| `get_build_status` | - | 6 | `schemaVersion` `kind` `actor` `correlationId` `projectId` `taskId` (전부) | 범위 | 열린 Decision 최대 10개, 번호 선택지 |
| `get_builder_task` | - | 6 | 위와 같음 (전부) | 범위 | 전체 Task·Spec·Context |
| `get_decision_result` | - | 7 | 위 + `decisionId` (전부) | `DECISION_NOT_FOUND` | - |
| `start_task` | O | 8 | 위 + `idempotencyKey` `expectedTaskRevision` (전부) | `TASK_REVISION_CONFLICT` `TASK_TRANSITION_NOT_ALLOWED` | PENDING→ACTIVE |
| `update_build_context` | O | 14 | `schemaVersion` `projectId` `taskId` `correlationId` `idempotencyKey` `expectedPreviousVersion` (6) | `LIVE_CONTEXT_TASK_NOT_RUNNING`(시작 전) `LIVE_CONTEXT_INITIAL_INVALID`(첫 기록이 v1·TASK_STARTED 아님) `LIVE_CONTEXT_STALE` `LIVE_CONTEXT_START_REPEATED` `LIVE_CONTEXT_ALREADY_COMPLETED` `LIVE_CONTEXT_DUPLICATE_REFERENCE` | 입력의 `activeDecisionIds`를 그대로 저장 |
| `request_user_decision` | O | 9 (+`decision`·`context` 객체) | 위 6 + `expectedTaskRevision` `expectedContextVersion` (7) | `LIVE_CONTEXT_REQUIRED` `BUILDER_TASK_STALE` `LIVE_CONTEXT_STALE` 선택지 2~6개·key 중복·추천 key 불일치·막는 Decision의 `blockingReason` 누락 | context v+1(DECISION_REQUIRED), 막으면 Task BLOCKED |
| `resolve_decision_from_chat` | O | 8 | `schemaVersion` `projectId` `taskId` `decisionId` `correlationId` `idempotencyKey` (6) | `CHAT_DECISION_QUOTE_NOT_FOUND`(인용이 Decision 요청 뒤 학습자 발언에 글자 그대로 없음) `CHAT_DECISION_RATIONALE_NOT_QUOTED` `CHAT_DECISION_PROPOSAL_NOT_QUOTED` `CHAT_DECISION_OPTION_NOT_FOUND` `CHAT_DECISION_CONTRADICTS_EXPLICIT_CHOICE` `DECISION_ALREADY_RESOLVED` | 답을 USER 출처 Resolution으로 저장(`chatSource.mappedBy: BUILDER`), BLOCKED면 ACTIVE |
| `apply_decision_result` | O | 11 (+`context` 객체) | 위 6 + `expectedTaskRevision` `expectedContextVersion` (8) | `DECISION_NOT_RESOLVED` `DECISION_APPLICATION_CONTEXT_INVALID`(현재 context의 `activeDecisionIds`에 그 Decision이 없음) `BUILDER_TASK_STALE` `LIVE_CONTEXT_STALE` | context v+1(DIRECTION_CHANGED), active 목록에서 제거 |
| `complete_task` | O | 7 (+`report` 객체) | `schemaVersion` `projectId` `taskId` `correlationId` `idempotencyKey` `expectedTaskRevision` (6) | `TASK_DECISION_NOT_APPLIED` `TASK_COMPLETED_CONTEXT_REQUIRED` `TASK_ACCEPTANCE_RESULTS_INCOMPLETE`(Spec 수락 기준 key와 1:1) `TASK_ACCEPTANCE_FAILED` `TASK_VALIDATION_NOT_RUN`(검증 0개 또는 NOT_RUN) `TASK_VALIDATION_FAILED` | Task COMPLETED, Builder 보고 개념은 OBSERVED까지만 |

## 3. 모든 쓰기에 공통인 규칙

- **범위:** `projectId`·`correlationId`·`taskId`가 연결 값과 하나라도 다르면 `AGENT_RUN_SCOPE_MISMATCH`. 값은 Steering에 적혀 있고 Agent가 매번 옮겨 적는다.
- **멱등키:** `idem_` + 소문자 UUID v4. Agent가 직접 지어 낸다(명령 실행 금지). 같은 키에 다른 내용이면 `IDEMPOTENCY_KEY_REUSE`, 같은 내용이면 이전 결과를 돌려준다.
- **버전:** task revision과 context version은 Core의 자동 처리(5·7·9번)로도 올라간다. 다음 쓰기 전에 `get_build_status`로 다시 읽어야 한다.
- **형식:** 모든 입력이 strict object라 모르는 필드도 거절한다. 읽기·시작 도구 4개는 내부 명령 봉투(`kind: "BUILDER_GET_TASK"`, `actor: {kind, role}`)까지 Agent가 쓴다.
- **경로·민감정보:** 파일 참조는 등록된 Project 폴더 안만 받는다. 문자열은 저장 전에 redaction한다.
- **권한 경계(불변식):** Builder는 Evidence·Concept State를 쓰지 못한다. Decision 확정은 학습자 발언 인용을 Core가 대조한 경우만 USER 출처가 된다.

## 4. 실측에서 걸린 곳

| 실측 | 호출 | 실패 | 걸린 규칙 |
| --- | --- | --- | --- |
| 첫 체험(Steering 0.4.0, 개인 계정) | 25 | 9 | 멱등키 형식 2, 필수 필드 1, `LIVE_CONTEXT_REQUIRED` 1, `TASK_COMPLETED_CONTEXT_REQUIRED` 1, 인용이 Decision 기록 전 발언 1, 인용 한글 깨짐 1(`CHAT_DECISION_QUOTE_NOT_FOUND`), 도구 없는 모드 2 |
| K09 재실측(Steering 0.5.0, 본선 계정) | 11 | 0 | Decision 1개, 첫 시도 확정. 실패 0은 한 번의 실측이다 |

첫 체험에서 학습자의 실제 이유는 Decision 기록 전 발언이라 인용 대상이 아니었고, 판단 근거 Evidence가 하나도 남지 않았다([첫 체험 기록](KIRO_NATIVE_FIRST_TRIAL_20261009.md)).

## 5. 재설계 때 알아 둘 사실

- hook이 학습자 발언을 보내면 Core가 message ID를 만들어 저장하지만, 그 ID는 Builder에게 가지 않는다. hook이 채팅에 덧붙일 수 있는 것은 출력 문자열뿐이다(지금은 학습자 요약 갱신과 Helper용 Builder 활동만).
- Core의 인용 대조 범위는 "그 Decision 요청 시각 이후, 같은 Task의 학습자 USER_MESSAGE"다.
- Builder 연결 값(`projectId`·`taskId`·`correlationId`)은 연결 시점에 Core가 이미 안다. 연결 단위가 Project당 하나라서 Task 단위로 고정돼 있다.
- Decision 요청·적용 때는 Core가 작업 맥락을 한 번씩 자동 기록한다. Steering은 요청 때만 따로 기록하지 말라고 하고, 적용 뒤에는 Agent가 한 번 더 기록하라고 한다. TASK_STARTED·중간·TASK_COMPLETED는 Agent가 직접 부른다.
- Kiro 채팅의 Builder MCP도 패널 경로(예선)와 같은 `ROLE_TOOL_CATALOG`의 이름·설명·schema를 쓴다(`createNativeCoreBinding`). Kiro 채팅 전용 입력 schema는 아직 없다.

## 6. 검토 거리 (TASKS K10 초안, 결정은 사용자)

- Kiro 채팅용 도구 수와 입력 축소(식별자·버전·멱등키를 서버가 채움).
- 이유 인용을 글자 복사 대신 hook이 받은 메시지 ID로.
- Decision 요청 직전 발언의 근거 인정 여부.
- 작업 맥락과 완료 단계 자동화.
