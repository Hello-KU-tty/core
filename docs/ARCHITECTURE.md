# Vibe Helper 기술 아키텍처

## 1. 상태

- 상태: 사용자 승인 완료, T09 Learning Spec 생성·조정·확정 반영 및 T10 Builder Task 착수 가능
- 기준 입력: [PROJECT_BRIEF.md](../PROJECT_BRIEF.md), [SPEC.md](SPEC.md)
- T03 versioned contract와 Agent/UI runtime validation, T04 pure reducer와 Evidence policy v1.0.0, T05 SQLite schema/repository/migration, T06 application use case와 역할 고정 MCP server, T07 criterion 기반 evaluation contract와 harness, T08 Candidate loop, T09 Discovery Agent prompt v1.1.0과 Learning Spec revision flow는 구현됐다.
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

T06의 application handler는 Agent와 UI transport가 공유하는 검증·transaction 경계다. T08은 현재 round의 latest Candidate에만 user feedback을 허용하고, SELECT가 아닌 미적용 feedback 전체를 다음 Candidate Round의 `appliedFeedbackIds`로 연결한다. Application은 pin/reject/merge/revise/shrink/expand/regenerate별 다음 revision과 정확한 round 구성, stale selection과 SELECT 이후 terminal 상태를 transaction 안에서 검증한다. T09은 selected Candidate에 대한 current Spec draft만 연속 revision으로 조정하고, user confirmation에서 내용 변경을 금지한다. 직접 UI 수정과 Discovery Agent 재작성은 같은 domain policy를 사용하며, 주제 복귀는 기존 selected Session을 재활성화하지 않고 draft를 `SUPERSEDED`로 만든 뒤 새 Discovery Session을 연다. Builder의 실제 shell/file 실행, Helper 대화 정책과 Episode dispatch/retry는 T10~T13에서 연결한다.

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

T08의 Discovery `submit_candidate_round` 외부 schema는 의미 후보 draft, lineage, 적용 feedback과 carried Candidate reference만 받는다. role-bound adapter가 검증된 최신 Discovery context를 조회해 Candidate/Round ID, revision, timestamp, source, input snapshot과 redaction 상태를 채운 뒤 공통 Application command를 호출한다. Kiro가 tool input에 주입하는 `__tool_use_purpose`는 이 transport 경계에서만 허용하고 Application payload에는 전달하지 않는다.

### 4.7 kiro-adapter

- Crew chat slot/session 생성과 복구
- Agent config와 permission 연결
- 고정 `/api/chat` SSE dispatch와 REST slot polling
- hidden no-tool Analyst slot과 Core job attempt 연결
- MCP registration
- token/latency/usage observation
- stale session과 reconnect 처리

Discovery prompt 원문은 `docs/agent-prompts/discovery.md` 하나이며 T09 버전은 1.1.0이다. Node adapter는 원문을 읽고 version marker를 검증해 Kiro Agent definition과 tool allowlist를 만든다. Prompt는 Core context를 먼저 읽고 다음 round에 pending feedback을 적용하며 selected Candidate 뒤에는 current Learning Spec을 기준으로 권장 draft를 생성·조정하도록 지시한다. Candidate/Round/Spec ID, revision, timestamp와 source 같은 Core-owned 메타데이터를 생성하지 않고 명시적 SELECT, Spec confirmation 또는 Session 재개도 수행하지 않는다. 구조화된 설명과 rationale은 판단에 필요한 길이로 제한해 장시간 단일 tool input 생성을 줄인다.

Crew 0.3.0의 App event bridge는 실제 stream을 App DOM event로 전달하지 않고, generic App API client는 `/api/chat` SSE를 JSON으로 파싱한다. 따라서 event는 MVP primary 경로에서 제외한다. raw fetch는 same-origin `POST /api/chat` 하나와 고정 payload로 제한하고, slot 생성·history/result 조회는 permission-checked App API를 사용한다. 이 세부사항은 UI나 Core가 아니라 이 adapter에만 존재한다. 참고: <https://kiro.dev/docs/crew/apps/sdk/>

Analyst의 durable 상태는 Crew task가 아니라 Core `AnalysisJob`이 소유한다. `analysisJobId`, Episode/correlation ID, attempt, deadline과 revision을 SQLite에 저장하고, timeout retry 뒤 늦은 결과는 현재 attempt와 일치할 때만 수용한다. Crew slot은 재생성 가능한 runtime handle이다.

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
- confirmation은 current draft와 같은 내용의 user-authored next revision이며, 주제 복귀는 draft를 `SUPERSEDED`로 닫고 새 Discovery Session을 만든다.
- 필수 Evidence target은 `LEARNER_FOCUS` concept만 사용한다.
- Final/Refined 별도 entity를 만들지 않는다.

### 5.2 Build

```text
Project 1 ── N BuilderTask
BuilderTask 1 ── N LiveContextVersion
BuilderTask 1 ── N DecisionRequest
DecisionRequest 1 ── 0..1 DecisionResolution
BuilderTask 1 ── 0..1 CompletionReport
```

주요 invariant:

- 완료 Task에는 acceptance result와 Completion Report가 필요하다.
- Decision은 resolution 전까지 적용 완료로 표시하지 않는다.
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

정확한 DDL과 forward migration은 `packages/storage-sqlite/src/schema.ts`와 `packages/storage-sqlite/drizzle/`에 둔다. append row의 contract JSON은 stable key order와 SHA-256 hash로 검증하며 selected Candidate, active Task, Decision 상태, Live Context와 Concept Ledger head는 별도 projection으로 복구한다. T07은 revisioned `EvaluationRun`과 특정 run에 연결된 immutable `BaselineResult` table을 migration `0003`으로 추가했다. `AnalysisJob`은 T13에서 contract가 확정된 뒤 forward migration으로 추가한다.

## 6. API 및 외부 연동 계약

### 6.1 MCP tool group

이름은 초기 계약이며 capability spike에서 transport 제약에 맞춰 확정한다.

Discovery Agent:

- `get_discovery_context`
- `submit_candidate_round`
- `submit_learning_spec`

Builder Agent:

- `get_builder_task`
- `start_task`
- `update_build_context`
- `request_user_decision`
- `get_decision_result`
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

`submit_learning_spec`의 Agent-facing schema는 semantic draft, project/session scope와 expected revision만 받는다. role-bound adapter가 current selected Candidate와 Spec을 조회해 stable metadata를 채운 뒤 Application command로 변환한다. UI는 current draft 직접 수정, 내용 불변 확정과 새 Session을 여는 Discovery 복귀 command를 사용한다.

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

- project root는 Core가 발급한 scope를 사용한다.
- Builder tool은 root 밖 path를 거절한다.
- related diff와 snippet은 Task reference로 저장한다.
- 실행 command는 생성 project가 실제로 정의한 script만 사용한다.

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
- Analyst 실패는 Episode와 durable AnalysisJob을 `pending_analysis`로 유지하고 새 attempt로 재시도한다.
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

- Crew App installable package
- local MCP/Core process
- local SQLite data directory
- repository의 project-local `.kiro/agents/` Builder/Helper config

Crew App manifest와 workspace Agent packaging의 정확한 배포 형태는 T02 skeleton과 T28 제출 packaging에서 확정한다. 별도 Kiro panel package는 없다.

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
- 대응: Episode 종료 후 async 분석, 호출·usage 관측, retry/backoff, 간결한 Discovery payload와 검증된 live 회귀 모델 사용
- 대안: target Crew host에서도 연결 종료가 재현되면 T15에서 atomic round를 보존하는 staged draft submit 또는 지원되는 persistent transport를 결정하고, T19에서 current Kiro engine의 native Agent config를 재검증

### R8. 사용자 데이터와 개인정보

- 위험: 코드·대화에 secret 또는 민감 정보 포함
- 대응: local-first, 최소 수집, redaction, raw log 억제, 동의받은 test data
- 대안: 사용자 연구용 별도 redacted export format
