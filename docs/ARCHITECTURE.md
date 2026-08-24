# Vibe Helper 기술 아키텍처

## 1. 상태

- 상태: 사용자 승인 완료, T01 Kiro/Crew capability 경계 반영
- 기준 입력: [PROJECT_BRIEF.md](../PROJECT_BRIEF.md), [SPEC.md](SPEC.md)
- 실제 코드·package manifest·database는 아직 존재하지 않는다.
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

### 2.2 승인된 개발 도구와 위임된 세부 선택

Node.js active LTS, pnpm workspace, TypeScript strict mode, Vitest와 Playwright는 승인됐다. 정확한 Node version, runtime schema와 SQLite/migration library는 호환성을 검토해 T02 시작 전에 결정 기록에 남긴다.

| 영역 | 선택 | 비고 |
|---|---|---|
| Runtime | Node.js active LTS | 정확한 version은 repository skeleton 생성 시 고정 |
| Workspace | pnpm workspace | apps/packages 분리와 단일 lockfile |
| Unit/integration test | Vitest | TypeScript domain과 adapter test |
| Browser test | Playwright | Crew App 핵심 flow와 접근성 smoke |
| Schema validation | TypeScript runtime schema library | 정확한 library는 T02에서 기록 |
| SQLite adapter | migration을 지원하는 경량 library | 정확한 library와 migration 방식은 T02에서 기록 |

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
packages/
  contracts/             # runtime schema와 shared DTO
  domain/                # entity, value object, reducer, policy
  application/           # use case와 transaction boundary
  storage-sqlite/        # repository, migration, query
  mcp-server/            # Agent용 typed tools/resources
  kiro-adapter/          # Crew session/event/dispatch 연결
  agent-prompts/         # 배포 가능한 prompt packaging
  evals/                 # fixture, baseline, scorer, report
fixtures/
  campus-drop/           # 첫 end-to-end project fixture
.kiro/agents/            # IDE/CLI 공용 project-local Builder/Helper
```

현재 원문 Prompt는 `docs/agent-prompts/`에 유지한다. 구현 package가 생겨도 이 문서를 임의 복사해 drift시키지 않고 source 또는 build input 관계를 명시한다.

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

### 4.5 storage-sqlite

- migration과 schema version
- transaction과 foreign key
- repository implementation
- audit query와 Evidence Trace
- backup/export boundary
- redacted test fixture

SQLite path와 backup 정책은 local app packaging spike에서 결정한다.

### 4.6 mcp-server

- Agent별 allowlist가 적용된 tool 제공
- input schema validation
- workspace path 재검증
- domain/application command 호출
- raw SQL과 arbitrary file operation 미노출
- correlation id 반환

### 4.7 kiro-adapter

- Crew chat slot/session 생성과 복구
- Agent config와 permission 연결
- 고정 `/api/chat` SSE dispatch와 REST slot polling
- hidden no-tool Analyst slot과 Core job attempt 연결
- MCP registration
- token/latency/usage observation
- stale session과 reconnect 처리

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
CandidateRound    1 ── N DiscoveryFeedback
SelectedRevision  1 ── N LearningSpecRevision
```

주요 invariant:

- selected candidate는 기존 revision을 참조한다.
- revision은 parent 또는 merge source를 보존한다.
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

정확한 DDL은 storage task에서 승인한다.

## 6. API 및 외부 연동 계약

### 6.1 MCP tool group

이름은 초기 계약이며 capability spike에서 transport 제약에 맞춰 확정한다.

Discovery Agent:

- `get_discovery_context`
- `submit_candidate_round`
- `record_discovery_feedback`
- `submit_learning_spec`

Builder Agent:

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

- Discovery 다양성과 Concept Necessity
- Agent-authored content의 Evidence 거절
- 질문형 비유 claim 분리
- DIRECTLY_LED 반복의 강도 제한
- contradiction과 misconception 처리
- independent transfer 판정
- generic Kiro baseline과 비교

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

- Node.js active LTS
- pnpm workspace
- local Kiro/Crew account/session
- SQLite local file
- TypeScript project fixture

정확한 설치·실행·test command는 package manifest와 script가 실제로 생성된 뒤 README와 AGENTS에 기록한다.

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

- 위험: background 분석이 사용자 build를 방해
- 대응: Episode 종료 후 async 분석, 호출·usage 관측, retry/backoff
- 대안: fixture/demo는 prevalidated Episode와 live interactive call을 분리하되 실제 데이터 계약은 동일하게 유지

### R8. 사용자 데이터와 개인정보

- 위험: 코드·대화에 secret 또는 민감 정보 포함
- 대응: local-first, 최소 수집, redaction, raw log 억제, 동의받은 test data
- 대안: 사용자 연구용 별도 redacted export format
