# Vibe Helper 기술 아키텍처

## 1. 상태

- 상태: 사용자 승인 완료, T16 conversation-first Agent Session 재설계·target 검증 완료
- 기준 입력: [PROJECT_BRIEF.md](../PROJECT_BRIEF.md), [SPEC.md](SPEC.md)
- T03 versioned contract와 Agent/UI runtime validation, T04 pure reducer와 Evidence policy v1.0.0, T05 SQLite schema/repository/migration, T06 application use case와 역할 고정 MCP server, T07 criterion 기반 evaluation contract와 harness, T08 Candidate loop, T09 Discovery Agent prompt v1.1.0과 Learning Spec revision flow, T10 native workspace lifecycle, T11 Builder prompt v1.1.0과 Decision gate, T12 Helper prompt v1.0.0과 bounded context/refresh, T13 Evidence Analyst prompt v1.0.1과 durable Analysis Job, T14 Crew Node backend와 Project History/session restore UI, T15 Discovery/Spec UI와 target Crew Agent 연결, T16 Agent Mode package와 target 설치까지 구현됐다.
- Kiro/Crew 세부 연결은 capability spike 결과에 따라 이 문서를 갱신한다.

## 2. 선택한 기술 스택과 선택 이유

### 2.1 승인된 기술 경계

| 영역 | 선택 | 이유 |
|---|---|---|
| Domain과 application | TypeScript | 대회 MVP와 실제 생성 project의 단일 언어, 공통 계약 공유 |
| Agent host | Kiro/Crew | 대회 제공 token과 Kiro-native 사용자 경험 활용 |
| Agent integration | MCP + 제한된 Crew API | 구조화된 proposal, 최소 권한, Core stable ID 기반 context 공유 |
| UI | React 기반 Crew App, Kiro 내장 Agent panel | Agent 중심과 Code 중심 두 취향 surface 검증 |
| Persistence | local SQLite | local-first, 단일 사용자 MVP, audit 가능한 관계 데이터 |
| Generated project | TypeScript | 실행·테스트·배포 고려 범위 제한 |

### 2.2 승인된 개발 도구와 세부 선택

T02에서 active LTS와 macOS/Windows 호환성을 검토해 세부 도구를 확정했다. 정확한 근거와 대안은 [DECISIONS.md](DECISIONS.md)에 보존한다.

| 영역 | 선택 | 비고 |
|---|---|---|
| Runtime | Node.js 24.19.0 LTS | `.node-version`과 engine preflight로 고정 |
| Workspace | pnpm 11.12.0 workspace | apps/packages 분리와 단일 lockfile |
| Language | TypeScript 7.0.2 strict ESM | project reference와 package public export 사용 |
| Unit/integration test | Vitest 4.1.11 | TypeScript domain과 adapter test |
| Browser test | Playwright 1.62.1 | Crew App 핵심 flow와 접근성 smoke |
| Formatting/lint | Biome 2.5.10 | formatting과 정적 lint를 한 설정에서 수행 |
| Schema validation | Zod 4.4.3 | Agent/UI 외부 입력과 MCP contract validation |
| SQLite adapter | better-sqlite3 12.11.1 + Drizzle ORM 0.45.2 | local driver, typed query와 SQL migration |
| Migration tooling | Drizzle Kit 0.31.10 | versioned SQL migration 생성·검사 |

존재하지 않는 package script와 command는 아직 문서화하지 않는다.

### 2.3 사용하지 않는 기술

- 별도 Electron IDE
- Crew App 내부의 완전한 Monaco IDE
- Graph DB
- Bedrock provider
- 여러 deployment provider
- 자체 ACP editor client
- cloud database와 user account backend

## 3. 시스템 구성과 데이터 흐름

### 3.1 전체 구성

```text
┌──────────────────── User Surfaces ────────────────────┐
│                                                       │
│  Crew App Agent Mode        Kiro IDE Code Mode        │
│  - Discovery                - Builder/Helper access   │
│  - Builder stream           - Current context         │
│  - Helper chat              - Shared decisions        │
│  - Decision/Evidence UI     - Native editor/diff      │
│                                                       │
└───────────────────────┬───────────────────────────────┘
                        │ Application API / events
┌───────────────────────▼───────────────────────────────┐
│              Personal Developer Application           │
│  Discovery · Spec · Task · Decision · Context         │
│  Episode · Concept · Evidence · Retrieval             │
└───────────────┬──────────────────────┬────────────────┘
                │                      │
       ┌────────▼────────┐    ┌────────▼─────────┐
       │ TypeScript Core│    │ Agent Adapters   │
       │ validation     │    │ Discovery       │
       │ normalization  │    │ Builder         │
       │ reducer        │    │ Helper          │
       │ policy         │    │ Analyst         │
       └────────┬────────┘    └────────┬─────────┘
                │                      │ Kiro/Crew + MCP
       ┌────────▼────────┐             │
       │ SQLite Adapter │◀────────────┘
       │ local data     │
       └─────────────────┘
```

### 3.2 Agent 판단과 상태 처리

```text
Agent Prompt / Skill
→ Kiro LLM semantic proposal
→ typed MCP tool call
→ application validation
→ domain policy / deterministic reducer
→ SQLite transaction
→ emitted application event
→ UI or Agent context refresh
```

의미 판단과 상태 변경을 분리한다.

- LLM: Candidate, Concept, Evidence처럼 비정형 의미를 제안
- Core: schema, permission, reference와 state invariant를 검증
- Reducer: 같은 입력과 version에서 같은 결과 생성
- Storage: proposal과 채택 결과를 함께 기록

### 3.3 Build와 Helper context

```text
Builder checkpoint
→ update_build_context
→ Live Project Context version N
→ request_user_decision과 DECISION_REQUIRED Context atomic write
→ user resolution과 blocking Task resume
→ apply_decision_result와 DIRECTION_CHANGED Context atomic write
→ Helper get_helper_context
→ 관련 Task/Decision/Concept/코드 package
→ Helper answer
```

Helper는 전체 Builder transcript와 전체 Ledger를 기본으로 읽지 않는다. Application layer가 질문과 관련된 context package를 만든다.

### 3.4 Evidence flow

```text
normalized Activity Events
→ Episode assembler
→ Episode closed
→ durable AnalysisJob PENDING
→ Evidence Analyst dispatch
→ Evidence Proposals
→ Core validation
→ accepted/rejected Evidence
→ Concept State reducer
→ Evidence Trace + personalization event
```

Evidence 분석 실패는 Builder result와 Project History를 롤백하지 않는다. 분석은 재시도 가능한 별도 상태다.

## 4. 주요 모듈과 책임

### 4.1 제안 repository 경계

실제 directory는 repository skeleton 작업에서 확정한다.

```text
apps/
  crew-app/              # Agent 중심 primary UI
  crew-backend/          # Crew reverse proxy와 role-bound HTTP MCP composition root
  mcp-server/            # Agent용 typed tool/resource 실행 process
packages/
  contracts/             # runtime schema와 shared DTO
  domain/                # entity, value object, reducer, policy
  application/           # use case와 transaction boundary
  storage-sqlite/        # repository, migration, query
  kiro-adapter/          # Crew session/event/dispatch 연결
tests/
  eval/                  # fixture, baseline, scorer, report
docs/agent-prompts/      # Agent prompt source of truth
```

실제 package 경계는 T02에서 위 구조로 확정했다. Campus Drop fixture와 `.kiro/agents/` product config는 각각 T18과 T19에서 추가한다. 현재 원문 Prompt는 `docs/agent-prompts/`에 유지한다. 구현 package가 생겨도 이 문서를 임의 복사해 drift시키지 않고 source 또는 build input 관계를 명시한다.

### 4.2 contracts

- Agent와 Core 사이 DTO
- UI와 Application 사이 command/query
- runtime validation schema
- version field와 backward compatibility
- redaction된 error contract

Contract 변경은 관련 fixture와 migration 계획 없이 병합하지 않는다.

### 4.3 domain

- ProjectCandidate revision과 lineage invariant
- Learning Spec scope invariant
- Builder Task와 Decision state machine
- Episode lifecycle
- Canonical Concept와 alias proposal
- Evidence acceptance policy
- Concept State reducer
- possible_misconception lifecycle

Domain은 Kiro SDK, React와 SQLite library에 의존하지 않는다.

### 4.4 application

- Discovery session use case
- Spec finalize
- Task start/update/complete
- Decision request/resolve/apply
- Helper context packaging
- Episode assembly/close
- Analyst dispatch와 retry
- Evidence proposal apply
- Personalization retrieval

Application transaction은 SQLite repository interface를 통해 상태를 변경한다.

T06의 application handler는 Agent와 UI transport가 공유하는 검증·transaction 경계다. T08은 현재 round의 latest Candidate에만 user feedback을 허용하고, SELECT가 아닌 미적용 feedback 전체를 다음 Candidate Round의 `appliedFeedbackIds`로 연결한다. Application은 pin/reject/merge/revise/shrink/expand/regenerate와 기존 후보를 carry한 추가 생성별 다음 revision, 정확한 round 구성, stale selection과 SELECT 이후 terminal 상태를 transaction 안에서 검증한다. T09은 selected Candidate에 대한 current Spec draft만 연속 revision으로 조정하고, user confirmation에서 내용 변경을 금지한다. 직접 UI 수정과 Discovery Agent 재작성은 같은 domain policy를 사용한다. Spec에서 뒤로 이동하는 것 자체는 상태 변경이나 Agent 호출이 아니며 selected Session의 이전 후보를 즉시 보여준다. 사용자가 입력을 수정하거나 새 후보 생성을 명시적으로 요청할 때만 draft를 `SUPERSEDED`로 만들고 새 Discovery Session을 연다. 확정 Spec은 Task를 생성한 immutable provenance 기준선이지만 이후 사용자 권한의 상한은 아니다. Build 중의 최신 명시적 사용자 메시지와 durable Decision Resolution이 개별 세부사항을 supersede할 수 있고, Builder는 변경 영향과 Spec 이탈을 Live Context·Decision Application·Completion Report에 남긴다. 안전·workspace·secret·외부 비용 경계는 이 변경 가능성과 별개로 계속 강제한다. T10은 확정과 Task 준비를 분리한 `UI_PREPARE_BUILDER_TASK` command에서 Spec을 deterministic acceptance criteria로 변환하고, Core가 `projects/<projectId>` 상대 workspace를 발급한다. T11은 semantic Decision draft를 stable metadata가 있는 Request로 만들면서 다음 `DECISION_REQUIRED` Context를 같은 transaction에 저장한다. blocking Request는 Task를 `BLOCKED`로 만들고 마지막 blocking Resolution 뒤 Core가 `ACTIVE`로 재개한다. Builder application은 DecisionApplication과 해당 ID를 제거한 `DIRECTION_CHANGED` Context를 함께 저장하며, 요청된 모든 Decision을 적용하기 전에는 completion을 거절한다.

T12는 Helper가 활성 Task가 없는 완료 Project에서도 마지막 current Task를 읽게 하고, Live Context freshness를 `CURRENT`, `STALE`, `MISSING`으로 구분한다. Helper context에는 confirmed Learning Spec과 Task가 이미 포함되며, Helper는 이를 현재 기준선과 과거 합의의 근거로 사용하되 사용자가 다시 논의할 수 없는 권한 경계로 해석하지 않는다. 질문에 명시된 Concept, 현재 Context와 active Decision Concept만 최대 5개까지 선택하며 무관한 Ledger fallback을 만들지 않는다. 관련 과거 Episode와 redaction된 사용자 발화·Helper 요약은 기존 Event 저장 경계에서 제한적으로 조회하고, Builder가 명시한 workspace-contained code reference는 질문 시점에만 bounded excerpt로 읽어 응답에 포함하되 DB에는 복제하지 않는다. raw diff와 Builder transcript는 저장하지 않으며 사용할 수 없는 reference를 내용처럼 추측하지 않는다.

stale/missing Context refresh는 audit-only 신호가 아니라 versioned `ContextRefreshRequest`로 저장한다. Helper는 요청만 만들고 Builder-owned Context를 변경하지 않는다. Builder의 다음 더 새로운 Context update가 pending request를 같은 transaction에서 `FULFILLED`로 닫고, Builder Task context는 pending request를 노출한다.

T13은 raw Crew transcript가 아니라 검증된 Application 상태 전이에서 `TASK_STARTED`, `LIVE_CONTEXT_UPDATED`, `DECISION_REQUESTED/RESOLVED`, `USER_MESSAGE`, `HELPER_RESPONSE`, `CONCEPT_REPORTED`, `VALIDATION_RESULT`, `TASK_COMPLETED` Event를 만든다. BUILD_TASK는 Task 시작→완료, DECISION은 Request→사용자 Resolution, HELPER_CONVERSATION은 첫 사용자 발화→명시적 종료·관련 Decision 해결·Task 완료로 닫는다. 닫힌 Episode와 initial `AnalysisJob`은 같은 transaction에 저장하므로 Event마다 Analyst를 호출하지 않는다. FINAL_UPGRADE type과 assembler 경계는 유지하되 실제 개인화 적용 source는 T18 flow에서 연결한다.

### 4.5 storage-sqlite

- immutable append history와 stable head/current projection
- revision·관계 key의 relational column, composite foreign key와 strict DTO canonical JSON
- application-owned repository port와 Unit of Work의 SQLite implementation
- Project restart recovery query와 audit/Evidence Trace query
- Drizzle schema, forward SQL migration과 `drizzle-kit check`
- `quick_check`, foreign-key integrity check, pending migration 전 verified backup
- contract 재검증과 credential-like payload 최종 거부선

file DB는 host가 명시한 절대 data directory 아래 `vibe-helper.sqlite` 고정 이름을 사용한다. OS별 production app-data 기본 위치는 T28 packaging에서 정한다. corruption이나 migration 실패 시 기존 DB를 자동 삭제·교체하지 않는다. Drizzle 0.45의 전체 declaration surface는 TypeScript 7 strict build와 호환되지 않으므로 schema는 migration input으로 격리하고 `drizzle-kit check`로 검사한다. runtime repository는 bound `better-sqlite3` statement만 내부에서 사용하며 application이나 MCP에 raw SQL을 노출하지 않는다.

### 4.6 mcp-server

- Agent별 allowlist가 적용된 tool 제공
- input schema validation
- workspace path 재검증
- domain/application command 호출
- raw SQL과 arbitrary file operation 미노출
- correlation id 반환

T06 MCP process는 시작 시 하나의 Agent role에 고정하고 그 role의 tool만 등록한다. payload 안의 actor claim은 process role과 다시 대조하되 authorization source로 신뢰하지 않는다. validated request의 canonical JSON UTF-8 크기는 2 MiB로 제한하고, 더 작은 contract별 array/text 제한도 그대로 적용한다.

T15 Crew App의 Discovery MCP는 같은 role server factory를 Crew가 감독하는 Node backend의 고정 `/mcp/discovery-round`, `/mcp/discovery-merge`, `/mcp/discovery-spec`에 Streamable HTTP handler로 조합한다. 각 route는 같은 `DISCOVERY` role 안에서도 phase에 필요한 read/submit tool만 노출한다. manifest의 illustrative loopback port는 backend health 통과 뒤 Crew가 실제 자동 할당 포트로 바꾸며, 외부 network permission이나 범용 MCP route는 없다. UI HMAC application route와 Agent MCP route는 transport가 다르지만 둘 다 같은 Application/SQLite transaction 경계로 들어간다.

T08의 Discovery `submit_candidate_round` 외부 schema는 의미 후보 draft, lineage, 적용 feedback과 carried Candidate reference만 받는다. 첫 스캔에서는 UI에 표시할 의미 필드가 필수이고 상세 evaluation과 risks는 선택이다. role-bound adapter가 검증된 최신 Discovery context를 조회해 Candidate/Round ID, revision, timestamp, source, input snapshot과 redaction 상태를 채운 뒤 공통 Application command를 호출한다. Kiro가 tool input에 주입하는 `__tool_use_purpose`는 이 transport 경계에서만 허용하고 Application payload에는 전달하지 않는다. target host가 array를 JSON string으로 한 번 더 인코딩한 경우 adapter는 512 KiB 이하 문자열만 한 번 parse한 뒤 동일한 strict Candidate schema로 재검증한다. parse 실패·중첩 인코딩·크기 초과는 거절하며 Core contract를 느슨하게 만들지 않는다.

T15의 빠른 `submit_candidate_merge` 외부 schema는 MERGE의 의미 Candidate 하나만 받는다. role-bound adapter가 현재 Core context에서 pending MERGE Feedback 하나와 두 target revision을 확인하고 `appliedFeedbackIds`, 결과 Candidate ID/revision, 두 parent revision, 새 Round ID/index와 input snapshot을 결정적으로 조립한 뒤 기존 strict Candidate Round Application command를 호출한다. pending MERGE가 없거나 둘 이상이면 fail closed하며 일반 `submit_candidate_round` 계약과 immutable history는 그대로 유지한다.

첫 Candidate만 prompt v1.2.0의 staged 경로를 사용한다. `submit_candidate_previews`는 정확히 10개의 제목·요약·매력 이유·핵심 상호작용·기술 필요성과 generation tag를 받고 role-bound adapter가 Candidate ID 10개, Preview Round ID와 eventual Candidate Round ID를 발급해 별도 immutable table에 저장한다. Session revision은 이때 올리지 않는다. 이후 두 `submit_candidate_enrichments` run이 고정된 위치 1~5, 6~10을 각각 완전한 Candidate revision으로 순차 보강한다. enrichment context에는 Preview Round identity와 해당 batch의 5개 preview만 넣어 전체 10개를 중복 전송하지 않는다. Core는 preview의 ID·제목·핵심 의미가 변하지 않았는지 검증하고 batch를 독립적으로 저장한다. 마지막 누락 batch를 받은 같은 SQLite transaction에서 10개 기존 Candidate revision과 Candidate Round를 materialize하고 Session revision을 한 번만 올린다. 따라서 UI는 preview 저장 직후 10개 방향을 보여주고, 일부 enrichment 실패 뒤에는 저장된 절반을 버리지 않는다.

background enrichment는 선택 gate가 아니다. 사용자가 complete Round 전에 preview를 SELECT하거나 refinement 대상으로 참조하면 UI는 해당 identity만 `SELECTED` enrichment Agent에 전달한다. Core는 참조된 preview가 모두 보강된 transaction 안에서 그 후보들만 포함한 partial Candidate Round를 먼저 materialize하고 같은 user-authored Feedback을 적용한다. Agent가 후보의 의미 내용을 채우고 사용자가 판단을 소유하는 provenance는 유지된다. 이미 저장된 enrichment는 재사용하며, 뒤늦은 FIRST·SECOND batch는 Session revision과 current Round 검사에서 fail closed한다.

staged schema는 기존 Candidate와 Round table을 바꾸지 않는 additive migration이다. preview가 없으면 preview run만 재시도하고, preview가 있으면 누락된 enrichment 위치만 새 idempotency key로 재시도한다. 사용자가 `기존 방식으로 생성`을 선택하면 기존 `submit_candidate_round` Agent를 같은 아직-open Session revision에 실행할 수 있다. 먼저 complete Round가 저장되면 늦은 enrichment finalize는 Session revision/round sequence 검사에서 fail closed하고 staged record는 진단 가능한 history로 남는다. migration 전에는 검증 backup을 만들며 source rollback 기준은 `09edb18`이다.

T11의 Builder `request_user_decision`과 `apply_decision_result` 외부 schema도 의미 draft, current Task/Context revision과 source reference만 받는다. role-bound adapter는 Kiro 전용 `__tool_use_purpose`를 버리고 Application이 Decision/option/Application ID, timestamp, provenance와 redaction 상태를 채운다. `get_decision_result`는 Resolution과 Application을 분리해 반환하므로 Helper가 해결한 선택과 Builder가 실제 코드에 반영한 결과를 같은 것으로 취급하지 않는다.

### 4.7 kiro-adapter

- Crew chat slot/session 생성과 복구
- Agent config와 permission 연결
- 고정 `/api/chat` SSE dispatch와 REST slot polling
- hidden no-tool Analyst slot과 Core job attempt 연결
- MCP registration
- token/latency/usage observation
- stale session과 reconnect 처리

Discovery prompt 원문은 `docs/agent-prompts/discovery.md` 하나이며 현재 버전은 1.2.0이다. Node build adapter는 version marker와 section을 검증해 PREVIEW·ENRICHMENT·ROUND·MERGE·SPEC·SPEC recovery의 bounded inline prompt와 최소 tool allowlist를 만든다. ROUND는 staged 경로의 fallback 또는 이후 refinement에 쓰며 간결한 Candidate 4개를 우선 생성하고 뚜렷한 추가 가치가 있을 때만 5~6개로 늘린다. 각 카드의 대표 사용자·개념·MVP·scope 수와 자유 서술 길이를 제한하고 상세 evaluation과 risks는 관심·비교가 필요할 때까지 미룬다. `MORE`만 이전 후보를 carry하며 target이 있는 refinement는 결과와 explicit pin만 current Round에 남긴다. MERGE는 의미 Candidate 하나만 생성하고 stable lineage metadata는 Core에 맡긴다. 정상 SPEC은 주입된 snapshot과 submit tool 하나만 사용해 current selected Candidate 기반 draft를 저장하며, context 주입이 불가능한 경우에만 recovery Agent가 context를 읽는다. 모든 phase는 Candidate/Round/Spec ID, revision, timestamp와 source 같은 Core-owned metadata, 명시적 SELECT, Spec confirmation 또는 Session 재개를 만들지 않는다.

Builder prompt 원문은 `docs/agent-prompts/builder.md` 하나이며 T11 버전은 1.1.0이다. Builder adapter는 7개 Core MCP tool과 생성 workspace에 한정한 read/write/shell만 구성하고 web, subagent, global MCP를 허용하지 않는다. Prompt는 되돌리기 쉬운 내부 세부사항을 자율 처리하고, 사용자 가시 제품 동작·데이터·보안·비용·주요 아키텍처나 학습 Concept에 영향을 주는 선택만 semantic Decision으로 요청한다. Crew slot은 첫 message 전에 Core가 발급한 canonical workspace에 연결하고, Kiro CLI 2 Agent Engine v2의 `denyByDefault` shell 설정과 pre-tool path guard를 함께 사용한다. Kiro CLI 2.20.2 live 회귀에서 blocking Decision request, Helper handoff, user recommendation resolution, Builder application/resume, workspace escape probe 차단, 초기 test 실패와 수정 뒤 통과, final Context와 Completion Report 복원을 확인했다. 이 경계가 이후 runtime escape probe를 막지 못하면 안전하지 않은 fallback으로 실행하지 않고 별도 결정을 받는다. 사용자에게 보이는 message/tool/file/test/error stream은 transient runtime data로 다루며, durable Core에는 redaction된 checkpoint와 source reference만 저장한다.

Helper prompt 원문은 `docs/agent-prompts/helper.md` 하나이며 T12 버전은 1.0.0이다. Helper adapter는 role-bound `get_helper_context`와 `request_builder_context_refresh`만 허용하고 native file, shell, web과 state mutation tool을 갖지 않는다. Application이 current/focused Decision, 최대 5개 관련 Ledger·Episode, 최대 3개의 workspace-contained 8 KiB code excerpt를 조립하고 source를 다시 redaction한다. diff와 대화 원문은 가용성만 표시한다. Kiro CLI 2.20.2 Agent Engine v2 live 회귀에서 `DEMONSTRATED` 상태의 Helper가 현재 Decision과 code excerpt를 읽어 선택지를 비교하고 복합 DB/Excel 비유를 claim 단위로 답했으며, context tool 1회, refresh 0회, Builder state 불변과 secret 미노출을 확인했다.

Evidence Analyst prompt 원문은 `docs/agent-prompts/evidence-analyst.md` 하나이며 T13 버전은 1.0.1이다. hidden Agent definition은 tool allowlist가 비어 있고 bounded Episode Context만 받아 stable ID·timestamp·provenance를 제외한 strict semantic JSON을 반환한다. adapter가 Core-owned metadata를 채우고 Application의 deterministic Evidence policy가 Proposal별 채택·거절, misconception issue와 Ledger를 계산한다. 빈 Proposal 결과도 성공으로 완료하며 Builder 보고는 사용자 이해가 아닌 Core `CONCEPT_OBSERVATION`으로만 `OBSERVED`를 만든다. Kiro CLI 2.20.2 Agent Engine v2 live 회귀에서 tool 호출 0회, mixed-strength Proposal 2개, 직접 유도 반복 거절 1개, 독립 적용 채택 1개, runtime validation `DEMONSTRATED`, Job `SUCCEEDED`와 Episode `ANALYZED`를 확인했다.

Crew 0.3.0의 App event bridge는 실제 stream을 App DOM event로 전달하지 않고, generic App API client는 `/api/chat` SSE를 JSON으로 파싱한다. 따라서 event는 MVP primary 경로에서 제외한다. raw fetch는 same-origin `POST /api/chat` 하나와 고정 payload로 제한하고, slot 생성·history/result 조회는 permission-checked App API를 사용한다. 이 세부사항은 UI나 Core가 아니라 이 adapter에만 존재한다. 참고: <https://kiro.dev/docs/crew/apps/sdk/>

T15 Discovery dispatch는 `vibe-helper-discovery-<phase>-<discoverySessionId>-<expectedRevision>` temporary slot을 사용하고 prompt v1.2.0에서 생성한 app-owned PREVIEW·ENRICHMENT·ROUND fallback·MERGE·SPEC Agent 중 현재 Core phase만 연결한다. 정상 SPEC route는 submit 하나만 노출하고, 주입 실패 시 `spec-recovery` slot과 read+submit Agent로 전환한다. 새 Session과 각 의미 revision은 이전 장기 transcript를 상속하지 않으며 Core context가 유일한 상태 source다. App이 strict validation한 compact current snapshot을 ephemeral context로 주입하고 session ID/revision이 맞는 정상 경로에서는 선행 context tool 왕복을 생략한다. host는 schema version, project/session/correlation ID, expected Session revision과 unique idempotency key를 tool context로 전달하고 Core가 metadata와 동시성 조건을 최종 검증한다. UI는 SSE 문장이 아니라 durable Preview Round, complete Candidate Round 또는 Spec revision으로 성공을 판정한다. SPEC stream이 설명만 남기고 끝나면 같은 최신 Core snapshot에서 한 번만 자동 재제출하고 두 번째 실패는 즉시 복구 가능한 오류로 표시한다. exact slot의 `running`을 이용한 화면 재진입 복원은 구현된 방어 기능이지만 in-flight stream/progress 재연결은 MVP 보장 범위가 아니다. UI protocol v6와 versioned bundle entry는 업데이트 전 UI가 새 staged contract를 잘못 해석하거나 제거된 Agent를 호출하기 전에 backend 409와 새로고침 안내로 차단한다. 30초가 지나면 foreground busy를 풀고 백그라운드 polling으로 전환하며 전체 관찰 상한은 420초다. 장기 P95는 T21로 넘긴다.

Analyst의 durable 상태는 Crew task가 아니라 Core `AnalysisJob`이 소유한다. `analysisJobId`, Episode/correlation ID, attempt, deadline과 revision을 SQLite에 저장하고, timeout retry 뒤 늦은 결과는 현재 attempt와 일치할 때만 수용한다. adapter startup/poll은 deadline이 지난 `RUNNING` lease를 Core recovery command로 회수해 남은 retry 또는 terminal failure로 전이하므로 runtime process가 중단돼도 고립되지 않는다. Crew slot은 재생성 가능한 runtime handle이다.

### 4.8 UI

Crew App:

- Discovery/Spec
- Builder stream
- Helper chat
- Decision Card
- Task progress
- Code/diff preview
- Evidence Trace
- Result launch

Kiro IDE Code mode:

- native editor와 diff를 중심으로 사용
- 내장 Agent panel에서 project-local Builder/Helper 선택
- Agent별 Core MCP catalog로 current Task와 Decision 조회
- 같은 stable ID를 사용하고 Crew raw chat session 공유는 요구하지 않음

MVP에는 별도 Open VSX extension/webview나 `apps/kiro-panel`을 만들지 않는다. 공식 Kiro 문서상 `.kiro/agents/`는 IDE와 CLI 양쪽에서 지원되고 Agent config의 MCP가 우선 적용된다. 실제 S4 CLI runtime이 동일 config와 Core revision handoff를 통과했다. macOS 시각 picker와 Windows host smoke는 제출 전 검증 항목이다.

T14 Crew App은 browser bundle이 SQLite나 Node application implementation을 직접 import하지 않고, Crew가 관리하는 TypeScript Node backend의 same-origin reverse proxy를 통해 UI command/query를 호출한다. backend는 host가 제공한 absolute app-data 경계에서 SQLite와 generated workspace를 조합하고 Gateway proxy HMAC, 고정 route/method, payload 크기와 runtime schema를 검증한다. Project History와 session restore는 Core의 durable read model을 source of truth로 사용하며, Builder/Helper Crew slot은 project ID에서 결정적으로 파생한 교체 가능한 runtime binding이다. Crew history가 unavailable이어도 redacted Activity/Episode summary와 저장된 project state는 계속 표시하고 임의 대화나 mock state를 만들지 않는다.

T15 UI는 Korean-first Learning Goal 필수·Personal Need 선택 입력과 순환 예시를 제공한다. Candidate는 2열 card grid 대신 목록으로 렌더링하고, 눈에 띄는 checkbox로 관심 후보를 local basket에 담은 뒤 목록 위의 자유 입력에서 multi-target MERGE/REVISE/REGENERATE를 요청한다. SHRINK/EXPAND는 후보별 control을 늘리지 않고 입력 placeholder와 자연어 request로 표현하며 Core의 revision/lineage 계약은 유지한다. 명시적 SELECT만 각 후보에서 바로 실행한다. preview와 complete Candidate 표현이 교체되더라도 Candidate ID·revision key의 local 펼침 상태를 `DiscoveryWorkspace`가 소유해 같은 항목의 열린 상세와 basket을 유지한다. 권장 Spec은 직접 편집 form 대신 사용자→사용 순간→성공 순간, MVP와 세 scope·Decision·runtime/deployment constraint를 read-only visual review로 보여주고, 충분히 큰 단일 입력으로 Agent revision을 반복 요청한다. UI styling은 새 runtime dependency 없이 SEED Design의 mobile-first list, semantic hierarchy와 control state를 참고하고 Kiro purple을 app brand token으로 사용한다. Spec의 `다른 주제로 돌아가기`는 즉시 이전 후보와 입력을 보여주고 Agent를 호출하지 않는다. 사용자가 입력을 편집하고 `새 후보 받기`를 누를 때만 새 Session과 Agent run을 시작한다. 생산 중인 round는 30초 뒤 백그라운드 상태가 되어도 화면 이동을 막지 않는다. production 성공은 mock chat이나 SSE 문장이 아니라 Application/Core revision으로만 결정한다.

T16 Agent Mode는 conversation-first Agent Session이다. desktop에서 실제 Builder Crew chat을 주 surface로, 실제 read-only Helper chat을 보조 surface로 동시에 표시하고 좁은 화면에서는 같은 두 session을 접근 가능한 tab으로 전환한다. app adapter가 current slot의 structured message를 polling하고 모든 문자열을 redaction한 뒤 host `ChatMessageList`에 전달해 Markdown, ToolCall, diff와 follow-up option을 native renderer로 표시한다. persistent composer는 같은 slot dispatch에 연결하며 app이 assistant text를 `말/도구/파일` event log나 plain paragraph로 다시 만들지 않는다. 각 Agent pane은 viewport 기반 높이를 가지며 transcript만 내부 스크롤되고 header, Decision/completion intervention과 composer는 고정 sibling으로 남는다. 진행 중에는 같은 composer에서 bounded stop API를 호출할 수 있고 raw stop event는 자연어 transcript 상태로 정규화한다. 이 host export는 공개 SDK 문서에 없는 installed capability이므로 한 `NativeChatSession` component에 격리하고 capability 실패는 raw transcript fallback 없이 명시적으로 표시한다. Builder SSE normalization은 Core completion polling과 redaction된 진단에만 사용하고 primary rendering을 소유하지 않는다.

Live Context는 compact 보조 status이고 Decision Request·Resolution·Application과 Completion Report는 Core session snapshot을 source of truth로 transcript 주변에 필요한 동안만 주입한다. pending Decision은 Builder 대화를 교체하지 않는 intervention dock이며, 완료 결과도 transcript를 제거하지 않는 result dock이다. Helper quick action은 Agent에게 질문을 보내되 Core에 user-authored message Evidence를 만들지 않고, 사용자가 직접 입력한 질문만 `FREE_TEXT` provenance로 기록한다. Helper의 전체 redaction 응답은 Crew session renderer가 표시하고 `helperResponseSummary`만 별도 240자 이하로 Core에 저장한다. Decision은 사용자 resolution이 저장된 뒤 같은 Builder slot에 재개 message를 보내며 Builder application 전까지 `해결됨·적용 대기`, 적용 뒤 `적용됨`을 구분한다.

Visible Builder·Helper user message에는 자연어만 기록한다. schemaVersion, project/task/decision/correlation ID와 실행 지시는 dispatch 직전 app-owned slot의 ephemeral context endpoint로 주입한다. Builder는 기존처럼 Core가 canonicalize한 workspace binding을 먼저 확인하며, context 주입이나 binding이 실패하면 message를 보내지 않는다. Project selector는 cached History surface를 신뢰하지 않고 선택 시 최신 Core session을 복원해 current Task가 있으면 Build로 진입한다.

target Agent resource 변경은 Project별 current Builder·Helper slot revision을 올려 fresh session에 적용하고, legacy 및 이전 revision slot의 redaction된 structured history는 native renderer에 순서대로 병합한다. 따라서 잘못된 host policy나 중단된 MCP turn을 고친 뒤 오염된 runtime은 재사용하지 않으면서 사용자에게 보였던 작업·오류·선택 기록은 잃지 않는다. Builder와 Helper의 persistent composer는 기본 조작면으로 유지하고 Decision·quick action은 message list와 composer 사이의 compact 추천 답장으로만 주입한다. pending Decision 동안 Builder composer에 직접 적은 자연어는 user-authored custom Resolution으로 durable 저장한 뒤 같은 메시지로 Builder를 재개한다. transport JSON chunk·token/window metric은 stream event로 분류하지 않는다.

Crew host는 App root 바깥에 자체 theme color와 container background를 적용하므로 standalone `body` style에 의존하지 않는다. `.app-shell`이 명시적으로 앱 배경과 기본 글자색을 소유하고 card heading도 app token을 사용한다. native chat frame·transcript·composer 역시 고정 dark 색상 대신 같은 surface/text/border token을 상속해 light/dark mode의 배경과 글자가 함께 바뀐다. Build의 긴 사용자 제목은 desktop 36px 이하, 680px 이하에서 26px 이하로 축소하며, 좁은 화면의 Helper quick action은 가로 carousel 대신 2열+1열 wrap으로 표시해 document와 pane의 수평 overflow를 만들지 않는다. E2E는 light/dark host theme와 어두운 host wrapper 양쪽 embedding 경계를 회귀 검증한다.

Builder 시작 시 backend는 current Task를 다시 확인하고 canonical absolute workspace를 일회성 binding descriptor로 반환한다. browser adapter는 이 값을 함수 local에서만 고정 Crew `POST /api/chat/slots/{slot}/project`로 전달하고 응답이 같은 canonical path를 확인하면 즉시 참조를 버린다. React state, DOM, URL, localStorage, log와 durable Core에는 절대 path를 넣지 않는다. slot 생성, project binding, Builder message 순서는 직렬이며 어느 단계든 실패하면 native Builder turn을 시작하지 않는다. Helper는 별도 project-derived slot과 read-only Agent를 사용하고 workspace binding을 받지 않는다. UI protocol v4와 app bundle 0.2.0이 이 read model과 runtime handshake를 묶는다.

Builder native tool의 최종 filesystem 경계는 Kiro hook event의 top-level `cwd`에서 시작한다. 이 값이 app-owned `generated-workspaces/projects` 아래 정확히 하나의 `project_*` child인 경우에만 canonical workspace로 채택하고, hook process cwd fallback·nested directory·symlink escape는 fail closed한다. shell은 Kiro `denyByDefault`와 host allowlist, 같은 exact command를 재검증하는 pre-tool guard를 모두 통과해야 한다. Kiro CLI의 `deniedCommands` glob은 safe absolute working directory까지 command substring처럼 오인해 차단할 수 있으므로 비워 두며, traversal·separator·absolute operand 차단은 canonical guard가 담당한다. install/build lifecycle은 repository에서 승인된 esbuild에 한정한 `pnpm rebuild esbuild`와 기존 bounded test/run/install 명령만 허용한다.

## 5. 데이터 모델

### 5.1 Discovery

```text
DiscoverySession 1 ── N CandidateRound
CandidateRound    1 ── N ProjectCandidateRevision
CandidateRevision N ── N ParentRevision
CandidateRound(previous) 1 ── N DiscoveryFeedback
CandidateRound(next)     N ── N applied DiscoveryFeedback
SelectedRevision  1 ── N LearningSpecRevision
```

주요 invariant:

- selected candidate는 기존 revision을 참조한다.
- revision은 parent 또는 merge source를 보존한다.
- feedback은 결과 revision을 미리 주장하지 않고, 다음 round가 적용한 feedback ID와 현재 Candidate 집합을 소유한다.
- selection은 현재 round의 latest revision에 대한 user-authored UI command만 허용하며 session을 terminal 상태로 바꾼다.
- selected Candidate의 첫 Spec은 revision 1이며 Agent-authored 권장안이다. 조정은 같은 Spec·Candidate의 current draft 다음 revision만 허용하고 Agent 또는 사용자가 작성할 수 있다.
- confirmation은 current draft와 같은 내용의 user-authored next revision이다. 단순 주제 화면 복귀는 상태를 바꾸지 않고, 사용자가 새 후보 생성을 명시하면 draft를 `SUPERSEDED`로 닫고 수정 가능한 입력을 가진 새 Discovery Session을 만든다.
- 필수 Evidence target은 `LEARNER_FOCUS` concept만 사용한다.
- Final/Refined 별도 entity를 만들지 않는다.

### 5.2 Build

```text
Project 1 ── N BuilderTask
BuilderTask 1 ── N LiveContextVersion
BuilderTask 1 ── N DecisionRequest
DecisionRequest 1 ── 0..1 DecisionResolution
DecisionResolution 1 ── 0..1 DecisionApplication
BuilderTask 1 ── 0..1 CompletionReport
```

주요 invariant:

- 완료 Task에는 acceptance result와 Completion Report가 필요하다.
- Decision Request와 `DECISION_REQUIRED` Context는 atomic write이고, 독립 작업이 불가능한 미해결 Decision은 Task를 `BLOCKED`로 유지한다.
- Resolution은 사용자 선택이고 Application은 Builder 구현 결과다. 둘을 별도 record로 보존하며 모든 Request가 적용되기 전에는 Task를 완료하지 않는다.
- Decision Application과 active Decision ID를 제거한 `DIRECTION_CHANGED` Context는 atomic write다.
- Live Context version은 project/task 안에서 단조 증가한다.

### 5.3 Evidence

```text
ActivityEvent N ── 1 Episode
Episode       1 ── N EvidenceProposal
EvidenceProposal 1 ── 0..1 EvidenceDecision
CanonicalConcept 1 ── N AcceptedEvidence
CanonicalConcept 1 ── 1 ConceptStateSnapshot
CanonicalConcept 1 ── N MisconceptionIssue
```

주요 invariant:

- 사용자 이해 Evidence에는 user-authored source가 필요하다.
- OBSERVED는 Builder report와 code/task 근거로 만들 수 있으나 사용자 이해를 뜻하지 않는다.
- CONTRADICTION은 state를 지지하지 않는 `MISCONCEPTION_SIGNAL` accepted Evidence로 보존하고 open issue를 열거나 보강한다.
- accepted State는 accepted Evidence와 reducer version으로 재현할 수 있어야 한다.
- TRANSFERRED는 다른 기능 또는 project context와 낮은 prompt dependence가 필요하다.

### 5.4 Event와 audit

모든 중요 record는 최소한 다음을 가진다.

- stable id
- project/task/episode reference
- created_at/updated_at
- schema version
- correlation id
- source Agent 또는 user
- redaction status

정확한 DDL과 forward migration은 `packages/storage-sqlite/src/schema.ts`와 `packages/storage-sqlite/drizzle/`에 둔다. append row의 contract JSON은 stable key order와 SHA-256 hash로 검증하며 selected Candidate, active Task, Decision 상태, Live Context, Analysis Job과 Concept Ledger head는 별도 projection으로 복구한다. T07은 revisioned `EvaluationRun`과 특정 run에 연결된 immutable `BaselineResult` table을 migration `0003`으로, T13은 `analysis_jobs` head와 `analysis_job_revisions` history를 forward migration `0005`로 추가했다.

## 6. API 및 외부 연동 계약

### 6.1 MCP tool group

이름은 초기 계약이며 capability spike에서 transport 제약에 맞춰 확정한다.

Discovery Agent:

- `get_discovery_context`
- `submit_candidate_round`
- `submit_candidate_merge`
- `submit_learning_spec`

Builder Agent:

- `get_builder_task`
- `start_task`
- `update_build_context`
- `request_user_decision`
- `get_decision_result`
- `apply_decision_result`
- `complete_task`

Helper Agent:

- `get_helper_context`
- `request_builder_context_refresh`

Evidence Analyst:

- `get_episode_context`
- `submit_evidence_proposals`

공통 규칙:

- tool은 caller Agent와 project scope를 검증한다.
- proposal tool은 DB row를 직접 만들지 않고 application command를 호출한다.
- schema version과 idempotency/correlation key를 포함한다.
- error는 retryable, user_action_required, permanent로 분류한다.

`record_discovery_feedback`은 user-authored provenance를 보존하기 위해 Agent tool로 노출하지 않고 UI application command로만 처리한다. Agent가 user source를 주장하는 payload를 제출해도 caller identity가 바뀌지 않는다.

`submit_learning_spec`의 Agent-facing schema는 semantic draft, project/session scope와 expected revision만 받는다. role-bound adapter가 current selected Candidate와 Spec을 조회해 stable metadata를 채운 뒤 Application command로 변환한다. Core의 user-authored direct update contract는 호환성을 위해 유지하지만 primary UI에는 직접 편집 form을 노출하지 않는다. UI는 Agent가 만든 current draft의 내용 불변 확정, Agent refinement와 새 Session을 여는 Discovery 복귀 command를 사용한다.

`UI_PREPARE_BUILDER_TASK`는 confirmed Spec을 바꾸지 않고 별도 retry 가능한 transaction으로 Task와 workspace assignment를 만든다. `LEARNER_FOCUS`만 `expectedConcepts`, `AGENT_SUPPORT`는 구현 지원 requirement, `EXCLUDED`는 `excludedWork`로 매핑한다. MVP feature별 criterion에 local execution과 automated test criterion을 더하고, Completion Report의 Concept usage는 Builder가 실제 사용한 사실만 뜻하며 사용자 이해 판정으로 사용하지 않는다.

blocking Decision request는 Task/Context optimistic revision을 모두 검증하고 Request·Context·Task 전이를 한 transaction에서 처리한다. UI Resolution은 recommendation, option과 custom proposal을 user-authored record로 보존하고 마지막 blocking Decision이 해결되면 Task를 재개한다. Builder는 resolution 조회 뒤 구현 결과를 별도 적용하며 Completion Report의 `appliedDecisionIds`는 durable DecisionApplication 집합과 정확히 같아야 한다. `DECISION_RESOLVED` Activity의 `rationaleProvided`는 원문을 복제하지 않고 이유 존재 여부만 보존하며, `false`인 recommendation 선택은 사용자 이해 Evidence로 수용하지 않는다.

### 6.2 UI command/query

- start/update Discovery
- select Candidate
- finalize Spec
- resolve Decision
- open Helper with context
- read Builder stream and task progress
- read Evidence Trace
- launch/open generated result

UI는 reducer와 SQL을 직접 호출하지 않는다.

### 6.3 Crew events

관심 event:

- chat message/chunk/done/error
- tool call/update
- task update/complete
- approval
- connection change

Raw event를 저장하지 않고 normalized Activity Event로 변환한다. 원문 저장이 필요한 경우 redaction과 보관 정책을 적용한다.

### 6.4 Generated workspace

- project root는 Core가 발급한 `projects/<projectId>` 상대 scope와 host의 canonical generated-workspace root를 사용한다.
- Builder tool은 root 밖 path를 거절한다.
- related diff와 snippet은 Task reference로 저장한다.
- 실행 command는 생성 project가 실제로 정의한 script만 사용한다.
- 첫 Live Context는 `TASK_STARTED`, 완료 직전 마지막 Context는 `TASK_COMPLETED`여야 한다. 같은 Context ID에서 version과 timestamp가 단조 증가하며 stale update는 상태 변경 없이 거절한다.

## 7. 인증과 권한

### 7.1 사용자와 Kiro

- MVP는 Kiro account/session을 사용한다.
- 별도 서비스 user account와 cloud auth는 만들지 않는다.
- Kiro app secret 또는 token을 SQLite Evidence payload에 저장하지 않는다.

### 7.2 Agent matrix

| 기능 | Discovery | Builder | Helper | Analyst |
|---|---:|---:|---:|---:|
| Discovery 상태 조회/제안 | 허용 | 제한 | 제한 | 금지 |
| 생성 workspace read | 금지 | 허용 | 관련 파일만 | Episode reference만 |
| 생성 workspace write | 금지 | 허용 | 금지 | 금지 |
| shell/test | 금지 | 허용 | 금지 | 금지 |
| Live Context 갱신 | 금지 | 허용 | refresh 요청만 | 금지 |
| Decision 확정 | 금지 | 요청만 | 금지 | 금지 |
| Evidence Proposal | 금지 | 금지 | 금지 | 허용 |
| Concept State 변경 | 금지 | 금지 | 금지 | 금지 |

State 변경은 Core만 수행한다.

### 7.3 MCP defense

- caller identity/Agent allowlist
- input size와 schema 제한
- path canonicalization
- secret pattern redaction
- output allowlist
- destructive action 거절
- audit correlation id

Idempotent command는 strict validation 뒤 canonical JSON의 SHA-256 hash를 receipt에 저장한다. 같은 key와 같은 hash는 원래 receipt를 반환하고, 같은 key를 다른 payload에 재사용하면 상태 변경 없이 거절한다. idempotency receipt, domain write와 audit은 같은 transaction에 포함한다.

Contract의 상대 POSIX path 검증 뒤에도 host가 제공한 절대 generated-workspace root와 project workspace를 canonicalize한다. 기존 target은 `realpath`, 아직 없는 target은 가장 가까운 기존 조상을 기준으로 symlink 탈출과 sibling-prefix 혼동을 거절한다. T06은 범용 file/shell/SQL tool을 노출하지 않으며 실제 Builder executor는 T10에서 같은 workspace policy를 재사용한다.

Crew App의 `permissions.api`는 T01에서 host SDK의 client-side path guard로 확인됐다. 활성화된 App code가 same-origin fetch 자체를 못 하게 하는 server-side capability로 간주하지 않는다. Crew App에는 범용 URL·header·method 입력을 받는 fetch wrapper를 두지 않고, adapter의 고정 endpoint마다 request/response schema와 redaction test를 둔다. credential·개인정보 보호는 앱별 trust, Core/MCP 권한과 저장 전 redaction으로 방어한다.

## 8. 오류 처리와 관측성

### 8.1 오류 분류

- Validation: 잘못된 schema, reference 또는 state transition
- Permission: Agent capability 또는 path 범위 위반
- Stale Context: version 불일치
- External: Kiro session, model, WebSocket 또는 quota 실패
- Analysis: Analyst timeout, invalid proposal, insufficient evidence
- Storage: transaction, migration, corruption 또는 disk 오류
- Generated Project: build, test와 runtime 오류

### 8.2 복구 원칙

- validation/permission 오류는 우회하지 않고 caller에 구조화해 반환한다.
- stale context는 최신 version 조회 후 재시도한다.
- 첫 retryable Analyst 실패는 Episode를 `PENDING_ANALYSIS`로 유지하고 durable AnalysisJob을 다음 `PENDING` attempt로 돌린다. 두 번째 실패는 Job `FAILED`와 Episode `ANALYSIS_FAILED`로 보존하며 UI의 명시적 수동 재시도만 다시 연다.
- timeout 뒤 도착한 Analyst 결과는 current attempt/revision과 일치하지 않으면 폐기한다.
- Builder 결과와 Project History는 Analyst 실패 때문에 폐기하지 않는다.
- SQLite migration 전에 backup 또는 recoverable copy 경계를 둔다.
- generated project 오류는 Builder stream과 Completion Report에 남긴다.

### 8.3 관측 항목

- Agent/turn별 latency와 failure
- Kiro dispatch, slot polling과 reconnect
- tool call success/reject
- token/usage가 제공되면 Agent/Episode별 usage
- Event→Episode→Proposal→State correlation
- reducer input/output/version
- secret redaction count와 path rejection
- test/build result

사용자 원문과 code snippet을 일반 log에 중복 기록하지 않는다.

## 9. 테스트 전략

### 9.1 Domain unit test

- Candidate lineage
- Learning scope invariant
- Decision state machine
- Episode close rule
- Evidence acceptance/rejection
- State transition과 downgrade rule
- possible_misconception open/resolve
- Concept alias merge proposal

### 9.2 Contract test

- 모든 MCP input/output schema
- Agent별 tool allowlist
- idempotency와 stale version
- path traversal과 secret redaction
- Crew raw event→normalized Event mapping

### 9.3 Storage integration test

- migration forward
- transaction rollback
- foreign key와 revision history
- Evidence Trace query
- backup/recovery smoke

### 9.4 Agent fixture/eval

- T07 자동 scorer: strict contract, 구조적 Candidate mode collapse, Spec scope 경계, Context freshness/completeness, production Evidence policy outcome, synthetic redaction leak
- T07 사람 review: 의미적 Discovery 다양성, Concept Necessity, scope 적절성, Decision 필요성, false mastery/false misconception claim 의미
- Campus Drop 회귀 입력과 서로 다른 unseen Learning Goal, Personal Need 유무를 함께 유지
- 사람이 검토하지 않은 의미 criterion은 `NEEDS_REVIEW`이며 자동 통과로 바꾸지 않음
- T07 calibration baseline은 harness의 good/bad 구별을 고정하며 제품 성능 baseline으로 해석하지 않음
- T08 실제 Kiro 출력 회귀: canonical Discovery prompt version, strict Candidate contract, 구조 signature와 기록된 의미 다양성·Concept Necessity review
- T09 Spec 회귀: prompt v1.1.0, strict three-scope contract, Learner Focus 전용 Evidence target, direct/Agent revision과 recorded scope review
- live probe와 replay 결과를 구분하고 timeout이나 transport failure를 mock 성공으로 바꾸지 않음
- DIRECTLY_LED 반복, contradiction/misconception, independent transfer와 실제 Agent output 평가는 T13 이후 fixture를 확장
- generic Kiro/simple memory/ablation 비교는 T24에서 같은 `BaselineResult` 계약으로 기록

### 9.5 UI/E2E

- Discovery→Spec
- Builder stream→Decision→Helper→resolve
- stale context refresh
- Evidence Trace
- result launch
- 오류, empty, permission 상태
- keyboard와 핵심 접근성
- Code Mode same-state smoke

### 9.6 사용자 검증

- 실제 초보 사용자 session
- 자발적 Helper 사용
- Decision 이해와 완료
- 통제감과 결과물 소유감
- Evidence false positive/negative review
- Agent/Code Mode 취향 비교

## 10. 로컬 개발 환경

### 10.1 계획

- Node.js 24.19.0 LTS
- pnpm 11.12.0 workspace
- local Kiro/Crew account/session
- SQLite local file
- TypeScript project fixture

설치는 `pnpm install --frozen-lockfile`, 전체 검증은 `pnpm check`를 사용한다. typecheck, unit, integration, build, smoke와 E2E의 개별 명령은 README와 AGENTS에 기록한다.

### 10.2 local data

- 개발, test, demo database를 분리한다.
- secret은 `.env`에 두고 commit하지 않는다.
- 평가 fixture는 redacted 상태로 commit 가능해야 한다.
- generated workspace는 product source와 분리된 명시적 root를 사용한다.

## 11. 배포와 롤백

### 11.1 현재 상태

- 실제 product deployment 방식은 미정이다.
- 첫 MVP는 local Kiro/Crew 사용과 generated result 실행을 기본 제안으로 둔다.
- 대회 전 한 TypeScript project deploy path를 추가할지는 T0 또는 post-MVP 결정이다.

### 11.2 packaging 제안

- `pnpm build`가 만드는 최소 `dist/crew-package` Crew App 설치물
- local MCP/Core process
- local SQLite data directory
- repository의 project-local `.kiro/agents/` Builder/Helper config

T15 package는 app manifest, inline ROUND·MERGE·SPEC Discovery Agent, `ui/dist/index.mjs` UI bundle, role-bound backend bundle, SQL migration과 exact `better-sqlite3`·`drizzle-orm` runtime dependency만 포함한다. Crew host는 manifest의 `ui.entry`를 설치 root가 아니라 고정 `ui/` root에 상대적으로 해석하므로 entry는 `dist/index.mjs`다. source repository, 개인 문서, test와 workspace package link를 설치본에 복사하지 않는다. 제출 archive와 Builder/Helper workspace Agent packaging의 최종 형태는 T28에서 확정한다. 별도 Kiro panel package는 없다.

### 11.3 rollback 원칙

- application version과 DB schema version을 함께 기록한다.
- migration 전 recoverable backup을 만든다.
- prompt/config version을 기록해 Evidence 결과를 재현한다.
- Agent adapter 실패 시 Core data는 보존한다.
- 실제 원격 배포가 추가되면 별도 deploy/rollback 계약을 작성한다.

## 12. 알려진 위험과 대안

### R1. Kiro Crew 기본 memory와 차별화 부족

- 위험: 프로젝트가 memory/lesson UI 재포장으로 보임
- 대응: user-authored Evidence, prompt dependence, false mastery, deterministic reducer와 audit trace를 핵심으로 구현·평가
- 대안: Evidence Engine이 baseline을 이기지 못하면 제품 주장과 State 모델을 축소해 재설계

### R2. Crew App과 Kiro editor session 공유

- 위험: Agent Mode와 Code Mode의 대화·Task가 이어지지 않음
- 대응: T01에서 raw session 공유 없이 Core stable ID·revision handoff를 검증함. 두 surface는 같은 MCP와 SQLite state를 읽음
- 대안: Code Mode는 Kiro 내장 Workspace Agent panel까지만 제공하고 custom panel은 만들지 않음

### R3. TypeScript Gateway client 부재

- 위험: Node adapter가 REST/WebSocket 세부 구현을 직접 책임짐
- 대응: 고정 `/api/chat` SSE dispatch와 app-owned slot REST polling만 작은 typed adapter로 격리
- 대안: Python client sidecar와 `approval_mode:auto` spawn은 TypeScript-only·최소 권한 계약 때문에 MVP에서 제외

### R4. Event 누락과 stale context

- 위험: Helper와 Analyst가 현재 작업을 잘못 이해
- 대응: MCP structured checkpoint를 primary source로 두고 Crew event hook을 MVP 전제에서 제외. 관련 diff/snippet은 Core Activity로 명시 제출
- 대안: context refresh와 manual Task completion recovery

### R5. false mastery

- 위험: 기술적 핵심과 사용자 신뢰 훼손
- 대응: conservative proposal, prompt dependence, source validation, deterministic threshold, trace와 baseline evaluation
- 대안: confidence가 낮으면 State 승격 없이 Evidence만 보존

### R6. 범위 과다

- 위험: 두 UI·네 Agent·Core·평가가 모두 미완성
- 대응: Crew App 단일 vertical flow 우선, Code Mode thin, deployment와 host adapter 보류
- 대안: Analyst와 Helper를 같은 Kiro runtime에 두되 permission/prompt는 유지하고 packaging만 단순화

### R7. Kiro quota와 latency

- 위험: background 분석이 사용자 build를 방해하거나 Kiro CLI 2가 느린 8-Candidate 단일 tool input 생성 중 stdio MCP 연결을 닫음
- 대응: Episode 종료 후 async 분석, 호출·usage 관측, retry/backoff, 간결한 Discovery payload, 30초 뒤 nonblocking background와 420초 Core-first safe retry. T15는 `claude-haiku-4.5`, ephemeral Core context, phase별 최소 Agent/tool, Core-derived MERGE와 10개 preview→고정 identity enrichment를 사용한다. preview durable latency, complete Round 수렴 시간과 누락 batch 재시도를 별도 지표로 기록하고 T21에서 더 큰 표본과 3~5초 first-useful stretch metric을 계속 관측함
- 대안: 이후 target regression에서 다시 연결 종료가 재현되면 atomic round를 보존하는 staged draft submit을 별도 승인하고, T19에서 current Kiro engine의 native Agent config를 재검증

### R8. 사용자 데이터와 개인정보

- 위험: 코드·대화에 secret 또는 민감 정보 포함
- 대응: local-first, 최소 수집, redaction, raw log 억제, 동의받은 test data
- 대안: 사용자 연구용 별도 redacted export format
