# 작업 계획

## 1. 상태 표기와 실행 규칙

- `[ ]`: 아직 시작하지 않음
- `[-]`: 선행 결정이나 외부 조건 때문에 대기
- `[>]`: 다음에 실행할 작업. 문서 전체에서 반드시 하나만 둔다.
- `[~]`: 진행 중
- `[x]`: 완료하고 완료 조건을 검증함

작업은 위에서 아래로만 진행해야 한다는 뜻이 아니다. 다만 선행 조건을 만족하지 않은 작업은 시작하지 않는다. 각 작업을 끝낼 때 산출물과 완료 조건을 실제로 확인한 뒤 상태를 갱신한다. 제품 범위가 바뀌면 먼저 `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`를 정합하게 고친 뒤 이 문서를 조정한다.

MVP는 단순 화면 시제품이 아니라 `Discovery → Learning Spec → Builder → 실제 Decision → Helper → Evidence → 다음 개인화`가 한 번 이어지는 검증 가능한 수직 흐름이다. 공통 계약과 상태 처리부터 만들고, Agent와 UI는 그 위에 연결한다.

## 2. MVP 이전: 핵심 수직 흐름 완성

### [x] T00. 문서 승인과 착수 차단 결정 해소

**승인 기록**

- 2026-08-24 사용자가 제시된 기본안을 전부 승인했다.
- 제품 범위, local-first MVP, Agent 중심 primary와 Code 중심 thin prototype, Campus Drop fixture, 개발 도구 방향, spike-first 원칙과 사용자 연구·데이터 원칙이 승인됐다.
- runtime schema·SQLite library 같은 세부 도구는 호환성 검토 후 Agent가 결정 기록에 남기도록 위임됐다.

**범위**

- `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, 이 작업 계획과 `docs/DECISIONS.md`를 함께 검토한다.
- MVP 정의와 대회 제출 전 강화 범위를 분리한 현재 계획을 승인하거나 수정한다.
- 구현을 시작하기 전에 필요한 기술 선택과 spike 질문을 결정 기록으로 남긴다.

**선행 조건**

- bootstrap 문서가 모두 생성되어 있어야 한다.

**산출물**

- 승인되거나 수정된 bootstrap 문서
- package manager, Node 기준, SQLite 후보, runtime schema 도구와 test 도구에 대한 결정
- Crew/Kiro capability spike의 성공·실패 기준
- MVP에서 요구할 실행·배포 수준과 Code 중심 thin prototype 경계
- 초보 사용자 검증의 동의·redaction·reviewer 원칙

**완료 조건**

- `docs/DECISIONS.md`의 구현 차단 항목이 `승인` 또는 명시적인 `spike 후 결정` 상태다.
- 서로 충돌하는 요구가 남아 있지 않고 사용자가 구현 계획을 승인했다.
- 다음 실행 작업이 T01로 지정돼 있고 `[>]` 표기가 문서 전체에 하나뿐이다.

### [x] T01. Kiro/Crew capability spike

**실행 계획**

- 상세 계획: [KIRO_CREW_CAPABILITY_SPIKE.md](spikes/KIRO_CREW_CAPABILITY_SPIKE.md)
- 상태: 2026-08-25 완료. dashboard의 두 독립 chat pane, Agent별 MCP 권한, Decision handoff, 숨은 no-tool Analyst slot과 Kiro IDE Workspace Agent fallback을 검증했다. Crew event/spawn/reinstall persistence의 한계는 Core MCP·stable ID·REST polling fallback으로 확정했다. 전역 third-party 허용은 사용하지 않았다.

**범위**

- 최소 Crew App을 열어 UI render, App event 수신, Agent chat slot, background dispatch와 MCP tool 연결 가능성을 확인한다.
- Crew App과 Kiro editor/Agent 사이에서 공유 가능한 session, project, task와 workspace 식별자를 조사한다.
- TypeScript에서 Kiro Gateway REST/WebSocket을 직접 호출해야 하는지, 공개된 다른 안전한 경로가 있는지 검증한다.
- Code 중심 surface가 같은 Core 상태를 읽고 Builder/Helper에 접근할 수 있는 최소 범위를 확인한다.

**선행 조건**

- T00의 spike 기준이 승인되어야 한다.

**산출물**

- capability matrix: `검증됨`, `부분 검증`, `불가`, `추가 확인` 상태와 재현 절차
- session/context 공유 방식의 작은 실험 결과
- Crew adapter와 Code 중심 thin prototype의 실제 구현 경계
- 불가능한 기능의 fallback과 관련 결정 기록

**완료 조건**

- 다른 개발자가 같은 환경에서 spike 결과를 재현할 수 있다.
- R2·R3 위험을 계속 수용할지 또는 fallback을 쓸지 결정돼 있다.
- 검증되지 않은 Kiro 기능을 이후 작업의 전제로 남기지 않는다.

### [x] T02. 저장소 골격과 검증 도구 구성

**검증 기록**

- 2026-08-25 Node.js 24.19.0과 pnpm 11.12.0에서 `pnpm check` 전체가 통과했다.
- clean copy에서 `pnpm install --frozen-lockfile`, typecheck, SQLite integration, build와 module-boundary/artifact smoke를 재현했다.
- Crew App이 storage/transport 세부사항을 직접 import하지 않는 dependency graph test와 source map·절대 경로·local data ignore 검증을 추가했다.

**범위**

- 승인된 package manager로 TypeScript workspace를 구성한다.
- `apps/crew-app`, `apps/mcp-server`, `packages/contracts`, `packages/domain`, `packages/application`, `packages/storage-sqlite`, `packages/kiro-adapter`, `tests/eval` 경계를 만든다.
- typecheck, unit, integration, E2E와 formatting/lint 명령을 최소 구성한다.

**선행 조건**

- T00의 개발 도구 결정과 T01의 Kiro 경계가 확정되어야 한다.

**산출물**

- 빌드 가능한 workspace skeleton
- root 및 package별 설정
- 빈 예제 대신 module boundary를 검증하는 smoke test
- 실제 명령이 반영된 README와 AGENTS 업데이트

**완료 조건**

- clean checkout 기준 설치, typecheck와 smoke test 명령이 성공한다.
- UI package가 storage 구현이나 Kiro transport 세부사항을 직접 import하지 않는다.
- source map이나 log에 secret이 들어가지 않는 기본 환경 설정이 있다.

### [x] T03. 공유 데이터 계약과 runtime validation

**검증 기록**

- 2026-08-25 Node.js 24.19.0과 pnpm 11.12.0에서 `pnpm check` 전체가 통과했다.
- contract integration 54개, workspace unit 2개, smoke 4개와 Chromium E2E 1개가 통과했다.
- strict schema v1의 정상·누락·초과·구버전 JSON fixture, JSON round trip, enum·ID·UTC timestamp·path·lineage·source provenance·Agent 권한 거절을 검증했다.
- Discovery, Learning Spec, Build/Decision, Activity/Episode, Evidence/Concept Ledger, audit, evaluation과 Agent/UI request가 public contract export에서 확인됐다.

**범위**

- Discovery, Learning Spec, Build Task, Live Context, Decision, Event, Episode, Evidence Proposal, Concept Ledger와 audit contract를 정의한다.
- 모든 외부 입력과 Agent 출력을 runtime schema로 검증한다.
- version, id, timestamp, correlation id, revision lineage와 source reference 규칙을 고정한다.

**선행 조건**

- T02 workspace가 준비되어야 한다.

**산출물**

- `packages/contracts`의 TypeScript type과 runtime schema
- 정상·누락·초과·구버전 payload fixture
- contract serialization 및 validation test

**완료 조건**

- `docs/SPEC.md` 7장의 핵심 데이터 영역을 빠짐없이 표현한다.
- 잘못된 enum, 권한, path, version과 source reference가 명확한 오류로 거절된다.
- Agent별로 읽고 쓸 수 있는 payload가 contract 수준에서 구분된다.

### [x] T04. Domain reducer와 상태 불변식

**검증 기록**

- 2026-08-25 Node.js 24.19.0과 pnpm 11.12.0에서 `pnpm check` 전체가 통과했다.
- unit 2개, package contract/domain/storage 78개, smoke 4개와 Chromium E2E 1개가 통과했다.
- Candidate merge/refinement lineage, immutable Spec 확인, Task/Decision 허용 전이, Episode event scope와 중복 replay를 검증했다.
- Evidence policy v1.0.0에서 Agent-authored source, weak/directly-led 신호, 과도한 maximum state와 stale/duplicate proposal을 이유와 함께 거절했다.
- contradiction은 `MISCONCEPTION_SIGNAL`로 open issue에 분리하고 State를 강등하지 않으며, 동일 Evidence log의 순서가 달라도 같은 State와 trace를 만드는 것을 검증했다.

**범위**

- Candidate revision, Spec 확정, Task/Decision transition, Episode close, Evidence 채택·거절과 Concept State 계산을 순수 함수로 구현한다.
- `OBSERVED → EXPLAINED → DEMONSTRATED → TRANSFERRED`의 지지 근거와 MISCONCEPTION open issue를 분리한다.
- 한 번의 contradiction이나 Agent-authored 내용이 강한 Evidence 또는 즉시 강등으로 이어지지 않도록 한다.

**선행 조건**

- T03 contract가 안정화되어야 한다.

**산출물**

- `packages/domain` reducer와 policy
- 정상, 경계, 충돌, 중복 제출 fixture
- state transition과 rejection reason unit test

**완료 조건**

- 같은 입력 log는 항상 같은 최종 state와 trace를 만든다.
- Analyst가 직접 state를 변경할 수 없고 invalid proposal은 이유와 함께 거절된다.
- Agent 설명, 단순 확인과 카드 클릭만으로 `DEMONSTRATED` 이상이 되지 않는다.

### [x] T05. SQLite schema, repository와 migration

**범위**

- Project, Candidate, Spec, Task, Context, Decision, Event, Episode, Evidence, Concept Ledger와 audit 저장소를 구현한다.
- append 중심 이력과 최신 snapshot projection을 구분한다.
- schema version, migration, transaction, backup 가능한 local path와 corruption 대응을 정한다.

**선행 조건**

- T03 contract와 T04 불변식이 있어야 한다.

**산출물**

- `packages/storage-sqlite` schema와 repository
- 빈 DB 생성 및 migration fixture
- transaction, 재시작, 중복 event와 rollback integration test

**완료 조건**

- 프로세스를 재시작해도 selected candidate, active task, pending decision, context와 evidence trace가 복원된다.
- migration 실패가 기존 DB를 부분 변경하지 않는다.
- secret redaction 이전의 raw payload가 DB에 저장되지 않는다.

### [x] T06. Application use case와 MCP 권한 경계

**승인 기록**

- 2026-08-25 사용자가 역할 고정 MCP catalog, 요청당 2 MiB payload 제한, canonical workspace containment, canonical request hash 기반 idempotency와 공식 MCP client contract test 계획을 승인했다.
- user-authored Discovery feedback은 UI application command로만 처리하고 Discovery Agent MCP catalog에는 노출하지 않는다.

**검증 기록**

- 2026-08-25 Node.js 24.19.0에서 format, lint, typecheck, Drizzle schema, unit 2개, package/app integration 100개, build, smoke 4개를 통과했다.
- macOS sandbox가 Chromium Mach port 등록을 막는 조건을 분리한 뒤 승인된 외부 실행에서 Playwright Chromium E2E 1개를 통과했다.

**범위**

- Core use case를 Agent와 UI에서 공통 호출하도록 application layer를 만든다.
- Discovery, Builder, Helper와 Analyst별 allowlist MCP tool을 구현한다.
- workspace path, payload size, source reference, stale version, idempotency와 권한을 검증한다.

**선행 조건**

- T03~T05가 완료되어야 한다.

**산출물**

- `packages/application` command/query handler
- `apps/mcp-server` tool group과 authorization policy
- 권한 matrix 및 공격성 payload contract test

**완료 조건**

- Helper와 Analyst의 write/shell/Decision 확정 시도가 코드 수준에서 거절된다.
- Builder도 생성 workspace 바깥 path에 접근할 수 없다.
- 임의 SQL, 임의 file read/write와 문서에 없는 범용 tool이 노출되지 않는다.

### [x] T07. 평가 harness와 기준 fixture 선구축

**검증 기록**

- 2026-08-26 Node.js 24.19.0과 pnpm 11.12.0에서 format, lint, typecheck, Drizzle schema, unit 2개, package/app integration 104개, eval 5개, build와 smoke 4개가 통과했다.
- macOS sandbox의 Chromium Mach port 제한을 분리한 승인된 외부 실행에서 Playwright E2E 1개가 통과했다.
- Campus Drop과 unseen goal 3개, Personal Need 유무, good/bad calibration 8개로 contract, mode collapse, scope leak, stale Context, trivial Decision, false mastery/misconception과 redaction leak을 재현했다.
- 사람 의미 review 누락은 `NEEDS_REVIEW`로 보존하고, calibration baseline 재생 결과가 committed JSON과 일치함을 검증했다.
- revisioned Evaluation Run과 immutable Baseline Result의 migration, idempotent 저장, revision conflict와 복구를 SQLite integration test로 검증했다.
- `tests/eval/TRACEABILITY.md`에 AC-MVP-001~014의 현재 test/eval 근거와 최종 검증 작업을 연결했다.

**범위**

- Agent 구현 전에 Discovery 다양성, Spec scope, Context completeness, Decision 필요성, Evidence 품질과 redaction을 평가할 fixture를 만든다.
- Campus Drop은 회귀용 고정 fixture로 두고, 서로 다른 learning goal과 선택적 personal need를 가진 unseen fixture를 추가한다.
- 자동 검증과 사람 review가 필요한 항목을 구분한다.

**선행 조건**

- T03 contract와 T04 reducer가 있어야 한다.

**산출물**

- `tests/eval` fixture corpus와 scorer interface
- baseline 결과 저장 형식
- false mastery, false misconception, stale context와 candidate mode collapse 사례

**완료 조건**

- 고정 답안을 강제하지 않고 contract 위반과 품질 차이를 재현 가능하게 측정한다.
- Campus Drop만 통과하도록 특화된 구현은 unseen fixture에서 드러난다.
- 각 MVP acceptance criterion이 어떤 test/eval로 검증되는지 추적표가 있다.

### [x] T08. Discovery Agent와 반복 Candidate loop

**검증 기록**

- 2026-08-26 Node.js 24.19.0과 pnpm 11.12.0에서 format, lint, typecheck, Drizzle schema, unit 2개, package/app integration 113개, eval 6개, build와 smoke 4개가 통과했다.
- macOS sandbox의 Chromium Mach port 제한을 분리한 승인된 외부 실행에서 Playwright E2E 1개가 통과했다.
- Candidate feedback은 결과 revision을 미리 기록하지 않고 다음 round의 `appliedFeedbackIds`로 연결했으며 PIN, REJECT, MERGE, REVISE, SHRINK, EXPAND, REGENERATE와 SELECT의 lineage/current-round invariant를 domain/application test로 검증했다.
- Discovery prompt v1.0.1을 canonical 문서에서 로드하고 role-bound MCP adapter가 Candidate/Round ID, revision, timestamp, provenance와 input snapshot을 공급하는 최소 tool input을 contract test로 검증했다. Agent catalog에는 user feedback, 범용 file/shell/SQL/network 또는 SELECT tool이 없다.
- synthetic unseen 입력에서 Kiro CLI 2.19.2 Agent Engine v2와 `claude-haiku-4.5`가 실제 MCP→Application→SQLite로 8개 Candidate Round를 약 90초에 저장하고 정상 종료했다. 해당 출력은 strict contract·구조 scorer와 기록된 사람의 의미 다양성·Concept Necessity review를 통과했다.
- 같은 CLI 2의 `auto` 모델은 생성 시간이 길어질 때 첫 submit 전에 `Transport closed`가 재현됐다. 동일 payload가 fresh 공식 stdio MCP client에서 즉시 수락되므로 Core 결함이 아닌 host lifecycle 결함으로 분류했고, T09 진행을 막지 않되 T15·T19·T21에 제품 host 재검증 gate를 남겼다.
- 현재 round의 latest revision만 선택 가능하고 user-authored SELECT 뒤 Project가 `SPEC_REVIEW`, Discovery Session이 `SELECTED`가 되며 이후 feedback/round가 거절됨을 integration test로 확인했다.

**범위**

- Learning Goal을 필수로, Personal Need·불편·관심·현재 수준을 선택으로 받는다.
- 고정 taxonomy가 아닌 다채로운 후보를 기본 약 10개 생성하고, need가 있으면 관련·독립 후보를 함께 만든다.
- pin, reject, merge, revise, shrink, expand, regenerate와 자유 대화를 같은 revision loop에 연결한다.

**선행 조건**

- T06 MCP 경계와 T07 Discovery eval이 있어야 한다.

**산출물**

- Discovery prompt 연결과 tool adapter
- Candidate revision/lineage 저장 흐름
- 다양성, 범용성, learner fit과 명시적 final 선택 test

**완료 조건**

- `availableTime` 입력 없이 AC-MVP-001과 AC-MVP-002가 통과한다.
- 고정된 10개 주제를 순환하지 않고 unseen goal에서도 의미 있게 다른 후보가 나온다.
- Agent가 사용자의 명시적 선택 전 후보를 Final로 바꾸지 못한다.

### [x] T09. Learning Spec 생성·조정·확정

**검증 기록**

- 2026-08-27 Node.js 24.19.0과 pnpm 11.12.0에서 format, lint, typecheck, Drizzle schema, unit 2개, package/app integration 119개, eval 7개, build와 smoke 4개가 통과했다.
- macOS sandbox의 Chromium Mach port 제한을 분리한 승인된 외부 실행에서 Playwright E2E 1개가 통과했다.
- selected Candidate에 대한 첫 Agent draft, Agent와 사용자의 연속 revision, stale/idempotent 경계, 내용 불변 사용자 확정과 확정 전 Builder Task 미생성을 domain/application/MCP integration test로 검증했다.
- `다른 주제로 돌아가기`는 selected Session을 다시 열지 않고 current draft를 `SUPERSEDED`로 닫은 뒤 같은 입력의 새 active Discovery Session을 만들며 이전 selection과 Spec lineage를 보존한다.
- Discovery prompt v1.1.0과 role-bound `submit_learning_spec`은 의미 내용만 Agent에게 받고 Spec ID, selected Candidate, revision, parent, timestamp, source와 redaction status를 Core 경계에서 채운다. 공식 MCP client test에서 첫 draft와 다음 revision의 SQLite 저장을 검증했다.
- `LEARNER_FOCUS` concept만 필수 Evidence target으로 도출하고 `AGENT_SUPPORT`와 `EXCLUDED`는 제외됨을 deterministic test와 prompt regression fixture의 자동·사람 review로 확인했다.
- 로그인된 Kiro CLI 2.19.2의 Agent Engine v2와 `claude-haiku-4.5`로 bounded live Spec runner를 실행했다. synthetic selected Candidate를 읽은 Agent가 prompt v1.1.0의 semantic-only 입력으로 role-bound MCP→Application→SQLite에 DRAFT Spec revision 1을 저장했고 Session revision 4와 Core-owned metadata가 검증됐다. 생성 결과는 discriminated union/runtime validation을 `LEARNER_FOCUS`, local UI shell을 `AGENT_SUPPORT`, live credential/hosted storage를 `EXCLUDED`로 유지했으며 실제 Decision 후보와 local TypeScript 제약을 포함했다.

**범위**

- 선택 Candidate를 `LEARNER_FOCUS`, `AGENT_SUPPORT`, `EXCLUDED`로 나눈 권장 Spec으로 변환한다.
- 제품 목적, 사용자, 성공 순간, MVP 기능, 실제 Decision 후보, TypeScript와 배포 제약을 포함한다.
- `이대로 시작`, `조금 바꾸기`, `다른 주제로 돌아가기` 흐름을 제공한다.

**선행 조건**

- T08 Candidate loop가 완료되어야 한다.

**산출물**

- Spec generation/refinement flow
- scope validation과 revision 저장
- 부담 없는 기본 확정 경로와 자유 수정 경로 test

**완료 조건**

- AC-MVP-003이 통과하고 사용자가 확정하기 전 Builder Task가 생기지 않는다.
- `AGENT_SUPPORT`와 `EXCLUDED` 항목이 Evidence 목표로 잘못 계산되지 않는다.
- 초기 진입은 확인 중심이되 Spec의 실질적 제어권은 사용자에게 남는다.

### [x] T10. Builder Task, workspace와 Live Context

**검증 기록**

- Node.js 24.19.0과 pnpm 11.12.0에서 format, lint, typecheck, Drizzle schema, unit 2개, package/app integration 132개, eval 8개, build와 smoke 4개가 통과했다.
- macOS sandbox에서 Chromium Mach port 등록만 거절된 뒤 승인된 외부 실행에서 기존 Playwright E2E 1개가 통과했다.
- confirmed-before-prepare, Spec scope→Task mapping, pending Task 재시작 복구, 첫 `TASK_STARTED`, stale/idempotent Context, mid-task Helper freshness, 마지막 `TASK_COMPLETED`, Completion Report scope와 false-mastery 금지를 application/MCP integration과 Builder prompt v1.0.0 regression fixture로 검증했다.
- native file/shell guard는 상대 traversal, symlink escape, `.kiro` 보호 경로와 허용되지 않은 command를 거절하며, transient stream redaction은 credential sentinel과 user-home path를 제거함을 검증했다. Crew slot은 첫 message 전에 canonical project directory를 `/api/chat/slots/{slot}/project`에 연결하지 않으면 dispatch할 수 없다.
- 로그인된 Kiro CLI 2.20.0 Agent Engine v2와 `claude-haiku-4.5`로 bounded live Builder runner를 실행했다. Agent가 role-bound MCP로 Task를 시작하고 Context version 1~3을 저장한 뒤 TypeScript discriminated union을 구현해 초기 실패 test를 통과시켰으며, Task revision 3의 durable Completion Report와 같은 version 3의 Helper Context를 복원했다.
- runtime boundary probe의 workspace 밖 sentinel은 변경되지 않았고 독립 `node --test`는 exit code 0이었다. raw stream은 저장하지 않았으며 redaction된 transient stream에서 message, tool call, file change, test result, status와 차단된 boundary probe error를 확인했다. macOS sandbox 안의 Kiro v2 ACP 초기화 실패는 같은 최소 채팅과 권한 확장 실행을 비교해 host 격리 제한으로 분리했다.

**범위**

- 확정 Spec을 acceptance criterion이 있는 Task로 바꾼다.
- 생성 workspace 안에서 TypeScript 파일 수정, 명령, test와 debug를 수행하는 Builder 흐름을 연결한다.
- 시작, 방향 변경, Concept 도입, Decision, 오류로 인한 계획 변경, test와 완료마다 Live Context를 갱신한다.

**선행 조건**

- T06 application/MCP와 T09 Spec 확정이 있어야 한다.

**산출물**

- Builder prompt/tool adapter
- Task lifecycle과 workspace boundary
- versioned Live Context 및 stale update 처리
- 사용자에게 보이는 message/tool/file/test stream

**완료 조건**

- Builder가 학습 판정을 하지 않으면서 현재 사용 Concept와 코드 참조를 보고한다.
- 작업 도중 Helper가 최신 Context로 현재 목표·변경·다음 작업을 설명할 수 있다.
- stream을 숨기지 않고 Live Progress가 현재 위치를 보조한다.

### [x] T11. 실제 Decision과 Builder 재개 흐름

**승인 기록**

- 2026-09-01 사용자가 의미 기반 Decision 요청, blocking 여부에 따른 Task gate, Helper context handoff, 사용자 해결, Builder 적용·재개와 이유 없는 추천 수락의 Evidence 차단 계획을 승인했다.
- 실제 Helper 대화 품질은 T12, Decision UI는 T16, Activity/Episode 조립은 T13 범위로 유지한다.

**검증 기록**

- 2026-09-01 Node.js 24.19.0과 pnpm 11.12.0에서 format 113 files, lint 113 files, typecheck, Drizzle schema, unit 2개, package/app integration 138개, eval 8개, build와 smoke 4개가 통과했다. macOS sandbox의 Chromium Mach port 제한을 분리한 승인된 외부 실행에서 Playwright E2E 1개도 통과했다.
- semantic-only Decision request와 apply tool, Core-owned ID·timestamp·provenance, Request/`DECISION_REQUIRED` Context atomic write, blocking Task의 `BLOCKED`→`ACTIVE` 재개, independent continuation, option·recommendation·custom Resolution 계약, apply-before-complete와 duplicate applied ID 거절을 domain/Application/공식 MCP client integration으로 검증했다.
- Builder prompt v1.1.0의 `builder-v1.1-decision-webhook`은 user-visible unknown-field 동작 Decision과 최종 application을 strict contract 및 기록된 사람의 Decision Necessity review로 통과했다. 기존 파일명 선택 음성 fixture는 계속 거절됐다.
- 로그인된 Kiro CLI 2.20.2 Agent Engine v2와 `claude-haiku-4.5`의 두 turn live runner가 blocking Decision request, Helper handoff, user recommendation Resolution, Builder resume/application, Context version 5와 Task revision 5 완료를 통과했다. workspace 밖 sentinel은 변경되지 않았고 독립 `node --test` exit code는 0이었다.
- `DECISION_RESOLVED.rationaleProvided=false`인 추천 수락을 사용자 이해 Evidence로 수용하지 않는 deterministic policy 회귀를 통과했다. 실제 Helper 대화, Decision Card와 Episode 조립은 각각 T12, T16, T13에 남겼다.

**범위**

- 제품 동작, 데이터, API, 인증, 보안, 보관, 비용, 주요 아키텍처 또는 학습 Concept에 영향을 주는 실제 선택만 Decision으로 만든다.
- 이유, 선택지, 영향, Builder 추천, Concept와 코드 참조를 제공한다.
- Helper에게 묻기, 추천대로 진행, 직접 선택과 다른 방식 제안을 지원한다.

**선행 조건**

- T10 Builder lifecycle이 있어야 한다.

**산출물**

- Decision gate와 independent task continuation
- 사용자 응답 적용 및 Builder resume
- 결정이 필요한 사례와 Builder가 자율 처리할 사례 fixture

**완료 조건**

- AC-MVP-006이 통과한다.
- 억지 교육용 질문이나 파일명·코드 스타일 같은 되돌리기 쉬운 선택이 Decision으로 노출되지 않는다.
- 이유 없는 추천 수락이 이해 Evidence로 기록되지 않는다.

### [x] T12. Helper의 최소 맥락 조회와 대화

**승인 기록**

- 2026-09-01 사용자가 T12의 bounded context, durable refresh, read-only Helper prompt/adapter, 의미 회귀와 실제 Kiro 검증 계획을 승인했다.
- Helper conversation Event/Episode 생성은 T13, 실제 quick action과 자유 입력 UI는 T16 범위로 유지한다.

**검증 기록**

- 2026-09-01 Node.js 24.19.0과 pnpm 11.12.0에서 format 118 files, lint 118 files, typecheck, Drizzle schema, unit 2개, package/app integration 147개, eval 9개, build와 smoke 4개가 통과했다. macOS sandbox의 Chromium Mach port 제한을 분리한 승인된 외부 실행에서 Playwright E2E 1개도 통과했다.
- Helper Context는 CURRENT/STALE/MISSING을 구분하고, active Task가 없으면 가장 최근 완료 Task로 fallback한다. 질문·Live Context·focused Decision과 연결된 Ledger 최대 5개, 닫힌 Episode 최대 5개, reference 최대 30개와 workspace-contained code excerpt 최대 3개만 반환하며 무관한 Ledger fallback과 raw diff/Builder transcript 저장은 만들지 않는다.
- missing/stale refresh는 versioned `ContextRefreshRequest`로 SQLite에 저장되고 Builder의 다음 Context가 같은 transaction에서 이를 `FULFILLED`로 닫는다. Helper role에는 Core MCP 2개만 있고 file, shell, Decision 해결과 Evidence/State 변경 권한이 없다.
- Helper prompt v1.0.0의 `helper-v1.0-analogy` fixture는 현재 Decision에 연결된 짧은 첫 답변, DB/Excel 복합 비유의 claim 단위 인정·정정, `DEMONSTRATED` 상태의 지속 접근성과 강제 퀴즈 금지를 strict contract와 기록된 사람 review로 통과했다.
- 로그인된 Kiro CLI 2.20.2 Agent Engine v2와 `claude-haiku-4.5` live runner에서 Helper가 current Context tool을 정확히 1회 호출하고 refresh는 요청하지 않았다. Decision 비교, 비유 한계, 선택적 quick action을 답했으며 Context version 1과 Builder-owned state는 불변, source excerpt의 synthetic secret은 미노출이었다.

**범위**

- Helper가 Live Context, Task, Spec, Decision, 관련 Concept State, 과거 Episode, 코드·diff, 필요한 Builder 대화 일부를 순서대로 최소 조회한다.
- 자유 입력을 중심으로 `더 쉽게`, `더 자세히`, `현재 코드 예시`, `선택지 비교` 카드를 제공한다.
- 질문형 비유는 claim 단위 대응 관계로 분해해 맞는 부분과 한계를 답한다.

**선행 조건**

- T10 Context와 T11 Decision flow가 있어야 한다.

**산출물**

- Helper prompt/tool adapter
- stale/missing context refresh 요청
- 모든 Concept State에서 접근 가능한 chat flow

**완료 조건**

- AC-MVP-005가 통과하고 Helper가 모르는 현재 작업을 추측하지 않는다.
- `DEMONSTRATED` 이상에서도 Helper 진입과 질문 제안이 유지된다.
- 카드는 접근성을 높이지만 클릭 자체가 Evidence가 되지 않고 자유 입력을 가리지 않는다.

### [x] T13. Event 정규화, Episode assembler와 Evidence Analyst

**승인 기록**

- 2026-09-02 사용자가 structured Event source, Episode close policy, durable Analysis Job, hidden no-tool Analyst, deterministic Evidence 적용, retry/dead-letter와 live Kiro 회귀 계획을 승인했다.
- FINAL_UPGRADE Episode의 실제 개인화 적용 source는 T18 flow에서 연결하되, T13 contract와 assembler type 경계는 유지하기로 했다.

**검증 기록**

- 2026-09-02 Node.js 24.19.0과 pnpm 11.12.0에서 format 126 files, lint 126 files, typecheck, Drizzle schema, unit 2개, package/app integration 156개, eval 10개, build와 smoke 4개가 통과했다. macOS sandbox의 Chromium Mach port 제한을 분리한 승인된 외부 실행에서 Playwright E2E 1개도 통과했다.
- Builder·Decision·Helper의 검증된 Application 전이가 redacted Activity Event가 되고, BUILD_TASK·DECISION·HELPER_CONVERSATION Episode 종료와 initial Analysis Job 생성은 transaction 하나로 묶인다. DB unique constraint와 idempotency가 닫힌 Episode당 initial dispatch 하나를 보장한다.
- Analysis Job은 30초 soft timeout, 자동 재시도 1회, terminal `FAILED`/`ANALYSIS_FAILED`, UI failure 조회와 수동 재시도, revision·attempt가 다른 late result 거절을 versioned SQLite history로 보존하고 재시작 뒤 복구한다.
- Evidence Analyst prompt v1.0.1은 stable metadata를 만들지 않는 hidden no-tool semantic adapter다. strict empty result도 `SUCCEEDED`로 끝나며, Proposal은 Core가 user-authored source와 상태 cap을 재검증해 채택·거절한다. Builder Concept usage는 사용자 이해와 분리된 `CONCEPT_OBSERVATION`으로만 `OBSERVED`를 만든다.
- `evidence-analyst-v1.0-mixed` fixture와 기록된 사람 review가 직접 유도 반복 `NONE/DIRECTLY_LED`와 독립 적용 `STRONG/INDEPENDENT`를 분리했다. 로그인된 Kiro CLI 2.20.2 Agent Engine v2/`claude-haiku-4.5` live runner에서 tool 0회, Proposal 2개, Core 거절 1개·채택 1개, runtime validation `DEMONSTRATED`, Job `SUCCEEDED`와 Episode `ANALYZED`를 확인했다.

**범위**

- 의미 있는 Activity만 Event로 정규화하고 BUILD_TASK, DECISION, HELPER_CONVERSATION, FINAL_UPGRADE Episode로 묶는다.
- Episode 종료 시 한 번만 Analyst를 호출해 proposal을 만들고 Core reducer가 채택·거절한다.
- Agent-authored 코드·설명과 사용자 발화·선택·전이 행동의 provenance를 분리한다.

**선행 조건**

- T04 reducer, T05 storage와 T10~T12 실제 event source가 있어야 한다.

**산출물**

- Episode assembler와 close policy
- Evidence Analyst prompt/tool adapter
- proposal validator, trace와 open misconception 처리
- 분석 실패 retry/dead-letter 상태

**완료 조건**

- AC-MVP-007~009가 통과한다.
- event마다 LLM을 호출하지 않으며 분석 실패가 code와 Project History를 훼손하지 않는다.
- 어떤 원문·행동이 State 변경·보류에 사용됐는지 사용자에게 설명할 수 있다.

### [x] T14. Crew App shell과 공통 session 복원

**승인 기록**

- 2026-09-02 사용자가 Project History/session read model, Crew Node backend와 same-origin HMAC proxy, deterministic Builder/Helper slot binding, hash route와 공통 상태를 포함한 T14 구현 계획을 승인했다.

**검증 기록**

- 2026-09-02 Node.js 24.19.0과 pnpm 11.12.0에서 `pnpm check` 전체가 통과했다. format·lint 139 files, typecheck, Drizzle schema, unit 2개, package/app integration 165개, eval 10개, production build, smoke 5개와 Chromium E2E 1개를 확인했다.
- 공식 Crew 0.3.0 `AppManifest` parser로 repository root `app.json`의 field와 app-root-relative entry containment을 검증했다. production bundle은 inline style을 포함한 단일 `index.mjs`이며 test SDK, synthetic proxy secret, localStorage fallback, SQLite와 Node module이 섞이지 않음을 확인했다.
- E2E는 빈 History와 loading, 실제 Application command로 만든 Project의 History→Discovery→Build route, deterministic Builder/Helper history redaction, hash route 새로고침 복원, Crew만 끊겼을 때 durable Core 유지, permission denial, recoverable contract error와 Core disconnected 상태를 한 session에서 검증한다.
- Project History/session snapshot은 local SQLite의 project, Discovery/Spec, current·active Task, pending Decision, Live Context와 durable redacted Helper Episode summary를 반환한다. Crew raw history는 보조 source이며 실패해도 저장된 결과를 가리지 않는다.

**범위**

- Crew App에 Discovery, Spec, Build workspace와 Project History route/surface를 만든다.
- App 재진입 시 project, active task, pending decision, context와 Helper conversation을 복원한다.
- loading, empty, disconnected, recoverable error와 permission denial 상태를 공통 처리한다.

**선행 조건**

- T01 capability와 T05~T06 query/use case가 확정되어야 한다.

**산출물**

- Crew App navigation과 session binding
- 공통 stream/status/error component
- state restore integration test

**완료 조건**

- 새 project 생성과 기존 project 재진입이 같은 저장 상태를 사용한다.
- Kiro 연결이 끊겨도 이미 저장한 결과와 history는 볼 수 있고 재시도 방법이 보인다.
- 임의 mock state가 production flow에 섞이지 않는다.

### [>] T15. Discovery와 Spec 사용자 경험

**범위**

- 필수 Learning Goal과 선택 Personal Need 입력, Candidate grid/list, 자유 대화와 refinement action을 구현한다.
- 입력 placeholder에 구체적인 활용 예시를 순환 또는 문맥에 맞게 보여준다.
- Final Candidate와 권장 Spec 확인은 부담을 낮추되 되돌리기와 직접 수정이 가능하게 한다.
- Candidate 생성 중 진행 상태, 안전한 재시도와 host 연결 종료를 이미 저장된 상태와 구분해 보여주고 8개 안팎 initial round의 실제 latency를 관측한다.

**선행 조건**

- T08~T09 flow와 T14 App shell이 있어야 한다.

**산출물**

- Discovery/Spec UI와 접근 가능한 interaction
- candidate lineage/history view
- 빈 입력, Agent 실패, 후보 부족과 수정 반복 상태

**완료 조건**

- keyboard만으로 입력, 후보 조정, 확정과 되돌리기가 가능하다.
- `이렇게 확정하기` 같은 권장 기본 action이 사용자에게 시험이나 어려운 사전 판단처럼 보이지 않는다.
- 사용자가 만족할 때까지 refine candidate와 final candidate 사이를 반복할 수 있다.
- target Crew host에서 느린 모델의 Candidate submit 연결 종료가 재현되면 T08 atomic round invariant를 보존하는 staged draft batch 또는 지원되는 persistent transport 중 하나를 결정 기록으로 승인하고 구현한다.

### [ ] T16. Agent 중심 Build·Helper 동시 UI와 Decision UI

**범위**

- 왼쪽 Builder stream, 오른쪽 Helper를 동시에 보는 Agent 중심 surface를 구현한다.
- Builder의 실제 대화, tool call, file change, test와 error correction을 보여주고 Live Progress를 보조로 둔다.
- Decision card와 Helper handoff, 추천대로 진행과 자유 응답을 자연스럽게 연결한다.

**선행 조건**

- T10~T14 flow가 있어야 한다.

**산출물**

- split layout과 responsive fallback
- stream virtualization 또는 점진 rendering
- Helper quick cards/free input, Decision pending/resolved UI

**완료 조건**

- Builder 작업 중 Helper를 사용해도 두 대화와 Context가 섞이지 않는다.
- 사용자는 실제 Decision에서 판단 책임을 유지하고 Builder 추천과 Helper 설명을 함께 볼 수 있다.
- 완료 화면은 학습 점수보다 실행 가능한 결과물을 먼저 보여준다.

### [ ] T17. Evidence Trace와 다음 대화 개인화

**범위**

- Concept별 current state, 근거가 된 Episode, 보류·거절 이유와 open misconception을 조회 가능하게 한다.
- Helper의 설명 출발점과 연결, 다음 Discovery ranking에 Ledger를 제한적으로 반영한다.
- State나 confidence를 과도한 성적표처럼 전면 노출하지 않는다.

**선행 조건**

- T13 Evidence flow와 T15~T16 UI가 있어야 한다.

**산출물**

- Evidence Trace UI/query
- Helper/Discovery personalization adapter
- personalization provenance와 no-evidence fallback

**완료 조건**

- AC-MVP-010이 통과하며 어떤 과거 Evidence가 결과에 영향을 줬는지 추적 가능하다.
- Discovery에서 흥미·실용성이 Ledger보다 우선한다.
- 동일 사용자라도 근거가 없을 때 state를 추측하거나 자신감 퍼센트를 만들어내지 않는다.

### [ ] T18. Campus Drop TypeScript Golden Path

**범위**

- Campus Drop을 end-to-end 회귀 fixture로 구현해 Discovery부터 실제 실행까지 연결한다.
- 현재 단계에 부적합한 인프라 복잡성은 AGENT_SUPPORT 또는 EXCLUDED로 두고 TypeScript 학습 범위를 지킨다.
- 최소 하나의 실제 Decision, Helper 질문, Evidence proposal과 다음 개인화를 포함한다.

**선행 조건**

- T08~T17의 수직 흐름이 연결되어야 한다.

**산출물**

- 재현 가능한 Campus Drop seed/session
- 생성 결과물의 build/run/test script
- 예상 state가 아닌 허용 Evidence 범위를 정의한 E2E fixture

**완료 조건**

- AC-MVP-004, 006, 011이 한 session에서 통과한다.
- 결과물을 실제로 실행하거나 열 수 있고 Builder 완료 보고와 test 결과가 일치한다.
- fixture 전용 hard-coded 후보, 답변 또는 Evidence가 없다.

### [ ] T19. Code 중심 thin prototype

**범위**

- Kiro editor와 내장 Agent panel을 중심에 두고 project-local Builder와 Helper를 선택하는 최소 surface를 만든다.
- Crew App과 동일한 project, task, context, decision과 ledger를 읽는다.
- Agent 중심과 Code 중심을 숙련 단계가 아닌 사용자 취향으로 표현한다.
- 별도 extension/webview를 만들지 않고 T01에서 검증한 Agent config와 MCP 경계만 사용한다.
- 설치 시점의 Kiro Agent Engine과 project-local Agent config를 다시 검증하고 CLI 2 config를 v3에 묵시적으로 fallback시키지 않는다.

**선행 조건**

- T01에서 가능 범위가 검증되고 T14~T18의 공통 Core가 동작해야 한다.

**산출물**

- `.kiro/agents/` Builder/Helper config와 Kiro IDE 실행 안내
- session/state continuity test
- 구현하지 못한 mode parity의 명시적 목록

**완료 조건**

- AC-MVP-012가 T01에서 확인한 현실적 범위 안에서 통과한다.
- 동일 Decision을 두 mode에서 중복 해결하거나 서로 다른 state로 만들지 않는다.
- Code 중심 사용자를 상위 단계, Agent 중심 사용자를 초보 단계로 표시하지 않는다.
- 선택한 Kiro engine에서 custom Agent identity, model, MCP allowlist와 8개 Candidate round의 fresh 실행이 확인되거나 지원 version 제한이 명시된다.

### [ ] T20. 보안·개인정보·접근성·복구 hardening

**범위**

- Activity 기본 활성화 안내, local 저장 경로, 수집 범위와 redaction을 첫 사용에 알린다.
- token, credential, 민감 경로와 terminal output을 저장·표시 전에 redaction한다.
- keyboard, focus, label, 읽기 순서, 색상 비의존 상태와 오류 복구를 검증한다.

**선행 조건**

- 모든 MVP surface와 data path가 연결되어야 한다.

**산출물**

- redaction/path/permission test suite
- privacy notice와 local data reset/export 범위 결정
- accessibility audit와 고친 항목 기록
- Agent/tool/storage 장애별 recovery test

**완료 조건**

- AC-MVP-013과 NFR-SEC/A11Y/OPS 항목이 대응 test를 가진다.
- secret fixture가 DB, log, Evidence Trace와 UI snapshot에 남지 않는다.
- Agent 분석 실패, stale context와 연결 끊김에서 사용자가 안전하게 재개할 수 있다.

### [ ] T21. MVP 통합 검증과 범위 동결

**범위**

- Golden Path와 unseen input으로 전체 flow를 반복 검증한다.
- unit, contract, integration, Agent fixture, E2E와 manual review 결과를 acceptance criterion에 연결한다.
- 알려진 제한, 재현 절차와 대회 제출 전 강화 backlog를 확정한다.
- clean Kiro session에서 8개 안팎 Candidate round를 중단 없이 저장하고, 연결 종료 시 중복 round 없이 재시도되는지 검증한다.

**선행 조건**

- T00~T20이 완료되어야 한다.

**산출물**

- AC-MVP-001~014 traceability report
- 자동 test/eval 결과와 manual review 기록
- MVP release note, 알려진 제한과 대회 제출 전 backlog

**완료 조건**

- AC-MVP-001~014가 모두 통과하거나, 사용자가 승인한 제한으로 결정 기록에 남아 있다.
- clean environment에서 전체 flow가 재현된다.
- MVP 이후에는 계약 변경 없이 기준 결과와 비교할 수 있도록 fixture와 prompt version을 고정한다.
- T08에서 관측한 CLI 2 stdio lifecycle 결함은 target host에서 해결되거나 사용자 승인 제한과 재시도 UX로 남아야 한다.

## 3. MVP 이후: 대회 제출 전 경쟁력 강화

### [ ] T22. 평가 protocol과 telemetry 동결

**범위**

- 후보 다양성, Decision 품질, Context 최신성, Evidence 정밀도, false mastery, 완주율과 결과물 실행 성공의 측정 정의를 고정한다.
- token, latency와 Agent 호출 수를 Episode·Agent별로 비교할 수 있게 한다.

**선행 조건**

- T21 MVP 기준선이 있어야 한다.

**산출물**

- metric dictionary, eval protocol, prompt/model/config version manifest
- 개인정보를 제외한 local telemetry summary

**완료 조건**

- 같은 fixture 실행끼리 비교 가능하고 metric 변경 이력이 남는다.
- 교육 지표 하나만으로 제품 성공을 주장하지 않으며 build success와 사용자 증언을 함께 본다.

### [ ] T23. 초보 사용자 pilot와 Evidence annotation

**범위**

- 실제 초보자가 자기에게 필요한 TypeScript project를 고르고 만드는 session을 관찰한다.
- 사용성, Helper 첫 사용 계기, Decision 부담, Evidence 오판과 결과물의 개인적 실용성을 기록한다.
- 동의받은 최소 데이터만 익명화해 reviewer annotation에 사용한다.

**선행 조건**

- T20 privacy 원칙과 T22 protocol이 승인되어야 한다.

**산출물**

- 익명화된 pilot session summary
- Evidence proposal reviewer agreement와 오류 taxonomy
- high-impact usability issue 목록과 사용자 증언

**완료 조건**

- 팀 내부 fixture만이 아닌 실제 초보 사용자에서 전체 flow를 최소 한 번 완주한다.
- Agent의 판정과 human review 차이를 사례별로 설명할 수 있다.
- 민감 원문은 제출 자료나 repository에 포함되지 않는다.

### [ ] T24. Baseline·ablation 비교

**범위**

- 일반 Kiro 대화, 단순 conversation memory, 전체 Evidence engine의 결과를 같은 과제로 비교한다.
- Discovery 개인화, Helper context, deterministic reducer 각각을 껐을 때의 변화를 살핀다.

**선행 조건**

- T22 protocol과 T23 pilot data가 있어야 한다.

**산출물**

- baseline/ablation result와 해석
- Crew memory 위에 별도 제품 layer가 필요한 근거

**완료 조건**

- 비교 조건, sample limitation과 측정 오차가 함께 보고된다.
- 단순 데모 인상만이 아니라 최소 하나의 정량 지표와 사용자 사례에서 차이를 설명한다.

### [ ] T25. Prompt, reducer와 Context 정책 조정

**범위**

- pilot/eval에서 확인한 candidate mode collapse, 과잉 Decision, stale context, false Evidence를 우선 고친다.
- prompt와 reducer 변경을 분리하고 모든 변경을 versioning한다.

**선행 조건**

- T23~T24의 구체적인 실패 사례가 있어야 한다.

**산출물**

- 개선 prompt/policy version
- 변경 전후 regression 및 unseen eval 비교
- 남은 오판의 fallback

**완료 조건**

- 고정 fixture를 희생해 pilot 사례만 맞추는 regression이 없다.
- Evidence threshold나 State 정책 변경은 결정 기록과 test를 동반한다.

### [ ] T26. UI mode 선호와 Helper 유도 검증

**범위**

- Agent 중심과 Code 중심을 취향 가설로 비교한다.
- placeholder, quick card, 실제 Decision handoff와 항상 접근 가능한 Helper 중 무엇이 첫 질문과 후속 질문을 자연스럽게 만드는지 검증한다.

**선행 조건**

- T19 두 surface와 T23 참여자가 있어야 한다.

**산출물**

- mode preference/usability 결과
- Helper 유도 장치별 관찰과 채택 결정
- 두 surface의 유지·축소 범위

**완료 조건**

- 숙련도 상승이 Code 중심 전환을 뜻한다는 결론을 미리 가정하지 않는다.
- build-first를 해치거나 강제 퀴즈처럼 느껴지는 장치는 제거한다.

### [ ] T27. 성능, quota와 신뢰성 강화

**범위**

- Agent 호출, stream rendering, SQLite contention과 context assembly 병목을 측정한다.
- Episode batch, retry/backoff, queue, idempotency와 offline/reconnect 복구를 강화한다.

**선행 조건**

- T22 telemetry와 실제 pilot workload가 있어야 한다.

**산출물**

- latency/call-count profile
- quota exhaustion, duplicate event와 partial failure test
- 비용·성능 tradeoff 기록

**완료 조건**

- event마다 추론하지 않는 설계가 실제 호출 로그에서 확인된다.
- 실패를 숨기지 않고 code 결과와 state consistency를 유지하며 재시도할 수 있다.

### [ ] T28. 실행·배포 경로 확정과 packaging

**범위**

- 대회 심사 방식과 T00 결정에 따라 local 실행만 유지할지, 제한된 hosted surface를 추가할지 확정한다.
- 재현 가능한 설치, Kiro App/MCP 등록, sample project 초기화와 rollback을 문서화한다.

**선행 조건**

- T21 MVP와 실제 대회 제출 요건 확인이 있어야 한다.

**산출물**

- 하나의 공식 실행 경로와 필요 시 fallback recording
- 환경 변수 이름만 담은 `.env.example`
- install/run/rollback 검증 기록

**완료 조건**

- 새 환경에서 secret을 repository에 넣지 않고 심사자가 제품 흐름을 재현할 수 있다.
- hosted 배포를 선택하면 local-only privacy 주장과 달라진 데이터 경계를 명시한다.

### [ ] T29. 온보딩, demo와 제출 자료

**범위**

- 제품 가치, Build-first 철학, Agent 역할, 실제 Decision과 Evidence의 차이를 짧은 onboarding과 README에 담는다.
- Campus Drop과 unseen personalized project를 사용해 문제→작동→검증→AWS/Kiro 적합성을 보여주는 demo를 준비한다.
- live failure에 대비한 검증된 recording과 recovery path를 만든다.

**선행 조건**

- T23~T28의 증거와 공식 실행 경로가 있어야 한다.

**산출물**

- 심사용 demo script와 backup recording
- architecture/evaluation 요약, 사용자 증언과 한계
- submission checklist

**완료 조건**

- 기능 나열보다 사용자 한 명의 전체 변화와 실제 결과물 실행이 먼저 보인다.
- 검증하지 않은 우월성, 학습 효과나 호환성을 주장하지 않는다.
- 제출 요건, 공개 링크, 권한과 secret 노출을 별도 점검한다.

### [ ] T30. 대회 제출 후보 검증

**범위**

- 제품, 문서, demo, test, eval과 설치 절차를 release candidate로 고정한다.
- 심사 환경과 유사한 clean environment에서 반복 실행하고 알려진 제한을 최종 확인한다.

**선행 조건**

- T22~T29가 완료되어야 한다.

**산출물**

- immutable version/tag 후보와 artifact manifest
- 최종 acceptance/eval report
- rollback 가능한 직전 안정 버전

**완료 조건**

- `docs/SPEC.md` 10.2의 제출 준비 조건이 모두 검증됐다.
- demo 시작부터 결과물 실행, Evidence Trace와 다음 개인화까지 끊김 없이 재현된다.
- 제출물에 token, 개인 대화 원문과 local database가 포함되지 않는다.

## 4. 대회 이후: 범용 제품으로 확장

### [ ] T31. Claude Code와 Codex host adapter

**범위**

- Core/MCP contract를 유지한 채 host별 event, tool, session과 permission 차이를 adapter로 흡수한다.

**선행 조건**

- Kiro 기반 MVP와 contract가 안정되어야 한다.

**산출물**

- host capability matrix와 adapter interface
- host별 contract/integration test

**완료 조건**

- Core reducer와 Evidence model을 fork하지 않고 새 host를 연결한다.
- 기능이 없는 host에서는 조용히 흉내 내지 않고 명시적 제한과 fallback을 제공한다.

### [ ] T32. 기존 project import와 언어 확장

**범위**

- 신규 project 전용 MVP를 넘어 기존 repository의 최소 구조와 concept을 import한다.
- TypeScript 외 언어는 language profile과 안전한 실행 경계가 준비된 순서로 추가한다.

**선행 조건**

- T31 또는 안정된 host abstraction과 별도 threat model이 있어야 한다.

**산출물**

- import scanner, consent/redaction flow와 language profile
- repository size, generated files, secret과 unsupported stack test

**완료 조건**

- 전체 코드를 무조건 LLM에 보내지 않고 metadata, diff와 필요한 snippet부터 단계적으로 사용한다.
- import 실패가 원본 repository를 수정하지 않는다.

### [ ] T33. 장기 memory, 동기화와 다중 기기

**범위**

- local-only Ledger를 사용자의 명시적 동의 아래 기기 간 동기화할 수 있는 모델을 설계한다.
- retention, delete/export, conflict와 encryption 경계를 정의한다.

**선행 조건**

- 실제 장기 사용 수요와 개인정보 영향 평가가 있어야 한다.

**산출물**

- sync threat model, data contract와 conflict policy
- opt-in migration 및 삭제 검증

**완료 조건**

- local-only 사용은 계속 가능하고 cloud 동기화가 기본 활성화되지 않는다.
- 사용자 삭제가 projection뿐 아니라 source event와 backup 정책까지 일관되게 처리된다.

### [ ] T34. 장기 학습 검증과 제품화

**범위**

- 여러 project에 걸친 transfer, 잘못된 state 누적, 관심 변화와 실제 서비스 완성의 관계를 검증한다.
- 개인 사용자 외 교육기관·커뮤니티 확장은 별도 사용자와 권한 모델로 평가한다.

**선행 조건**

- 반복 사용자가 충분하고 연구·제품 동의가 구분되어야 한다.

**산출물**

- longitudinal evaluation, product health metric와 governance 제안
- 유지할 기능, 제거할 기능과 새 Golden Path 결정

**완료 조건**

- 장기 학습 효과를 단기 proxy로 과장하지 않는다.
- 결과를 근거로 scope와 business/operation 모델을 새 결정 기록으로 승인한다.

## 5. Acceptance criterion 추적표

| 기준 | 주 구현 작업 | 최종 검증 작업 |
| --- | --- | --- |
| AC-MVP-001~002 | T08 | T21 |
| AC-MVP-003 | T09, T15 | T21 |
| AC-MVP-004 | T10, T18 | T21 |
| AC-MVP-005 | T10, T12, T16 | T21 |
| AC-MVP-006 | T11, T16, T18 | T21 |
| AC-MVP-007~009 | T04, T13, T17 | T21 |
| AC-MVP-010 | T17 | T21 |
| AC-MVP-011 | T18 | T21 |
| AC-MVP-012 | T19 | T21 |
| AC-MVP-013 | T06, T20 | T21 |
| AC-MVP-014 | T07, T18 | T21 |
