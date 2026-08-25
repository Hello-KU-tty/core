# 결정 기록

이 문서는 현재 제품·기술 판단의 근거와 상태를 보존한다. `승인`은 사용자가 직접 합의했거나 `PROJECT_BRIEF.md`에 확정된 사항, `제안`은 구현 전 승인이 필요한 선택, `spike 후 결정`은 외부 기능을 실제로 검증해야 하는 사항이다. 상태가 바뀌면 기존 맥락과 tradeoff를 지우지 않고 같은 항목을 갱신한다.

## 2026-08-24: Build-first 제품 철학

- **상태:** 승인
- **맥락:** 대상 사용자는 코딩 교육 자체보다 자기에게 필요한 서비스를 완성하는 경험에서 동력을 얻는다. 교육 기능이 Builder의 진행을 인위적으로 막으면 바이브코딩의 장점과 프로젝트의 목적이 모두 약해진다.
- **결정:** 결과물 개발을 일차 목표로 둔다. 사용자는 실제 개발 과정에서 Builder가 마주친 의미 있는 판단을 맡고, 필요할 때 Helper와 대화하며 개념을 습득한다. 설명, Evidence와 개인화는 개발 흐름 위에 얹는다.
- **검토한 대안:** 교육 과정·퀴즈 우선, Builder가 모든 결정을 대행, 기능 완성만 제공하고 학습 추적은 하지 않음.
- **tradeoff:** 자연스러운 경험을 얻는 대신 학습 장면의 발생 빈도를 강제로 통제하기 어렵다. 따라서 실제 Decision과 Activity provenance가 중요하다.

## 2026-08-24: 신규 project의 동적 Discovery loop

- **상태:** 승인
- **맥락:** 같은 DB 기술도 행사 신청, 파일 공유, 커뮤니티처럼 맥락에 따라 매력이 달라진다. 고정된 10개 주제를 돌려주는 추천은 사용자의 실제 필요와 기술 학습 목표를 충분히 연결하지 못한다.
- **결정:** Learning Goal만 필수로 받고 Personal Need·최근 불편·관심·현재 수준은 선택으로 둔다. `availableTime`은 입력 계약에서 제외한다. 고정 taxonomy 없이 기본 약 10개의 다채로운 후보를 만들며, Personal Need가 있으면 이를 반영한 후보와 독립적인 후보를 함께 만든다. 사용자가 만족할 때까지 후보 수정과 선택을 반복한다.
- **검토한 대안:** 고정 주제 catalog, 필요 입력 필수화, 한 번의 추천 후 즉시 확정, 시간 기반 scope 추천.
- **tradeoff:** 다양성과 맞춤성이 커지는 대신 candidate mode collapse와 품질 편차가 생길 수 있어 fixture와 diversity eval이 필요하다.

## 2026-08-24: 권장 Learning Spec과 세 가지 scope

- **상태:** 승인
- **맥락:** 초보자에게 모든 기술 판단을 시작 전에 요구하면 Builder 진입장벽이 된다. 반대로 범위가 없으면 Agent가 대신 구현할 기술과 사용자가 배우려는 기술이 섞여 Evidence가 왜곡된다.
- **결정:** Discovery가 먼저 권장 Spec을 만들고 사용자는 가볍게 확정하거나 수정한다. 개념은 `LEARNER_FOCUS`, `AGENT_SUPPORT`, `EXCLUDED`로 나눈다. Builder 시작 전에는 부담을 낮추되 명시적 확정은 받는다.
- **검토한 대안:** 상세 spec 수동 작성, scope 구분 없이 전체 구현을 학습 범위로 간주, Spec 없이 즉시 Builder 시작.
- **tradeoff:** 시작은 쉬워지지만 권장안에 과도하게 끌릴 수 있다. 되돌리기와 자유 수정, Spec provenance가 필요하다.

## 2026-08-24: 네 Agent와 deterministic Core의 책임 분리

- **상태:** 승인
- **맥락:** 생성 Agent가 추천, 구현, 설명과 학습 판정까지 모두 담당하면 권한과 근거가 뒤섞이고 Agent가 만든 코드를 사용자 이해로 오인하기 쉽다.
- **결정:** Discovery, Builder, Helper, Evidence Analyst를 분리한다. Agent는 제안과 작업을 수행하지만, 상태 validation과 Concept State 계산은 deterministic Core가 담당한다. Analyst는 Evidence proposal만 만들며 state를 직접 변경하지 않는다.
- **검토한 대안:** 단일 범용 Agent, Analyst가 곧바로 state 변경, 모든 판단을 LLM에 위임.
- **tradeoff:** 계약과 orchestration이 복잡해지는 대신 권한 검증, 재현성, audit와 Agent 교체 가능성이 좋아진다.

## 2026-08-24: 실제 Decision만 사용자에게 맡김

- **상태:** 승인
- **맥락:** 사용자가 판단을 위해 Builder 추천과 Helper 설명을 비교하는 경험은 핵심 교육 가치다. 하지만 학습 장면을 만들기 위해 사소한 선택을 억지로 묻는 것은 build-first 철학에 어긋난다.
- **결정:** 제품 동작, 데이터, API, 인증, 보안, 보관, 비용, 주요 아키텍처 또는 Learning Concept에 영향을 주는 실제 선택만 Decision으로 요청한다. Builder는 추천과 영향을 제시하며 사용자는 Helper에게 묻기, 추천대로 진행, 직접 선택 또는 다른 방식 제안을 할 수 있다.
- **검토한 대안:** Builder가 전부 결정, 일정 간격으로 교육 질문 삽입, 모든 기술 선택을 사용자에게 전가.
- **tradeoff:** 자연스러운 학습 계기를 얻지만 project에 따라 Decision 수가 적을 수 있다. Decision 수 자체를 성공 지표로 삼지 않는다.

## 2026-08-24: Builder stream을 숨기지 않음

- **상태:** 승인
- **맥락:** 사용자는 Agent의 대화, 도구 호출, 오류 수정과 test 진행을 보며 바이브코딩의 흐름을 익힌다. 단순 task/status 화면만 보여주면 작업 대기 시간이 지루하고 Agent 작동 방식을 이해하기 어렵다.
- **결정:** 실제 Builder 메시지, tool call, file change, test와 error correction stream을 의도적으로 숨기지 않는다. Live Progress는 현재 위치를 보여주는 보조 정보로 둔다.
- **검토한 대안:** 결과와 task checklist만 노출, 내부 작업을 전부 접기, 교육용으로 재구성한 별도 stream만 표시.
- **tradeoff:** 투명성과 몰입은 좋아지지만 정보 과부하와 secret 노출 위험이 있다. redaction, 접기, stream 성능과 접근성 처리가 필요하다.

## 2026-08-24: Live Context는 작업 중간에도 갱신

- **상태:** 승인
- **맥락:** Helper가 Task 완료 시점의 요약만 보면 진행 중 질문에 낡은 답을 할 수 있다. 그렇다고 Helper가 Builder의 전체 대화와 repository를 항상 읽으면 비용과 개인정보 노출이 커진다.
- **결정:** Builder는 시작, 방향 변경, Concept 도입, Decision, 오류로 인한 계획 변경, test와 완료 checkpoint에서 versioned Live Context를 갱신한다. Helper는 최소 context를 먼저 읽고 부족하거나 오래됐을 때만 refresh와 관련 코드·diff·대화 일부를 요청한다.
- **검토한 대안:** 완료 시에만 context 저장, Builder 대화 전체 공유, repository 전체를 매 질문마다 분석.
- **tradeoff:** Helper 정확도와 비용의 균형을 얻지만 context freshness와 누락을 별도로 감시해야 한다.

## 2026-08-24: Helper는 항상 접근 가능하고 read-only

- **상태:** 승인
- **맥락:** 사용자가 무엇이 비슷한지 바로 알아채지 못할 수 있으므로 높은 Concept State에서도 질문 경로가 사라지면 안 된다. Helper가 Builder의 작업이나 Decision을 대신 확정하면 책임 경계가 무너진다.
- **결정:** Helper는 모든 Concept State에서 접근 가능하고 자유 입력을 중심으로 둔다. `더 쉽게`, `더 자세히`, `현재 코드 예시`, `선택지 비교` 같은 빠른 카드를 보조로 제공한다. Helper는 file/shell/write/Decision 확정 권한이 없는 read-only Agent다.
- **검토한 대안:** 초보 상태에서만 Helper 노출, card-only UI, Helper에게 Builder와 같은 실행 권한 부여.
- **tradeoff:** 안전하고 독립적인 설명 공간을 얻지만 실제 변경이 필요하면 Builder로 명시적으로 handoff해야 한다.

## 2026-08-24: 질문형 비유는 claim 단위 Evidence로 처리

- **상태:** 승인
- **맥락:** “DB model 추가가 Excel 열 추가이고 실제 data가 행 추가인 거네?” 같은 반문은 이해의 단서지만, 문장 전체를 무조건 맞음 또는 틀림으로 처리하면 부분적인 대응 관계와 한계를 잃는다.
- **결정:** Helper는 비유를 claim 단위로 나눠 맞는 대응, 다른 점과 적용 한계를 답한다. 사용자 주도의 관련 판단이나 전이 행동은 Evidence 후보가 될 수 있지만, Helper가 유도한 반복이나 단순 확인은 강한 Evidence로 보지 않는다.
- **검토한 대안:** 모든 비유를 정답/오답으로 이분, 대화 Evidence를 전부 제외, 한 번의 비유로 mastery 판정.
- **tradeoff:** 더 정교하지만 Analyst와 reviewer가 provenance와 prompt dependence를 함께 봐야 한다.

## 2026-08-24: Concept State와 MISCONCEPTION 모델

- **상태:** 승인
- **맥락:** 학습 상태는 단순 노출과 독립적인 적용을 구분해야 한다. 현장에서 Helper가 오해를 바로잡더라도, 오해가 있었고 이후 해결됐다는 이력은 다음 설명과 Evidence 해석에 유용하다.
- **결정:** State는 `OBSERVED`, `EXPLAINED`, `DEMONSTRATED`, `TRANSFERRED`를 사용한다. `MISCONCEPTION`은 별도 state가 아니라 근거와 해결 여부를 가진 open issue로 저장한다. 한 번의 contradiction으로 즉시 강등하지 않는다.
- **검토한 대안:** confidence 퍼센트, MISCONCEPTION을 다섯 번째 state로 사용, 최근 발화 하나로 즉시 승급·강등.
- **tradeoff:** 거친 이산 상태라 미묘한 차이는 audit trace에서 보완해야 한다. reducer threshold는 pilot 후 조정이 필요하다.

## 2026-08-24: 선택적 Activity와 Episode 단위 추론

- **상태:** 승인
- **맥락:** 전체 코드, terminal과 대화를 계속 LLM으로 분석하면 비용과 개인정보 위험이 커진다. Agent가 언급한 Concept만 믿으면 실제 구현에서 사용된 중요한 개념을 놓칠 수 있다.
- **결정:** Builder 보고, diff·관련 snippet, Decision, Helper 대화와 test 같은 의미 있는 Activity만 정규화한다. Event를 Episode로 묶고 Episode 종료 후 Analyst를 한 번 호출한다. 전체 repository scan은 누락 검증이나 모호한 사례에만 사용한다.
- **검토한 대안:** 모든 event마다 LLM 추론, Agent 자기보고만 저장, 전체 repository 상시 scan, Evidence를 전혀 수집하지 않음.
- **tradeoff:** 비용과 신호 품질이 좋아지지만 event selection이 잘못되면 Evidence를 놓칠 수 있다. episode/eval 관측성이 필요하다.

## 2026-08-24: local SQLite와 privacy 기본값

- **상태:** 승인
- **맥락:** MVP는 개인 사용과 검증이 중심이며 conversation, code context와 학습 Evidence는 민감할 수 있다.
- **결정:** Project History, Event, Evidence와 Ledger는 local SQLite에 저장한다. Activity 수집은 기본 활성화 사실을 첫 사용에 안내한다. secret redaction과 Agent별 최소 권한을 기본 계약으로 둔다.
- **검토한 대안:** 처음부터 cloud database, memory-only 상태, 원문 log 전체 보존.
- **tradeoff:** 개인정보와 구현 범위가 줄지만 기기 간 동기화와 공동 사용은 제공하지 않는다. local data의 export/delete 범위는 구현 전에 정해야 한다.

## 2026-08-24: Agent 중심과 Code 중심은 취향의 차이

- **상태:** 승인
- **맥락:** 사용자는 IDE처럼 code를 중심으로 볼 수도, Builder와 Helper를 동시에 보는 Agent Development Environment를 선호할 수도 있다. 이것을 초보·고급 단계로 해석할 근거는 없다.
- **결정:** Agent 중심 Crew App은 Builder와 Helper를 양쪽에서 동시에 보여주는 주 surface다. Code 중심은 Kiro editor와 panel/tab을 사용하는 thin prototype으로 같은 Core 상태를 읽는다. 두 mode는 사용자 취향으로 표현하고 실제 사용자 test로 비교한다.
- **검토한 대안:** Agent 중심만 구현, Code 중심만 구현, 숙련되면 자동으로 Code 중심으로 전환.
- **tradeoff:** 두 surface 때문에 UI 범위가 늘어난다. MVP에서는 Crew App을 완성도 높은 primary로, Code 중심은 가설 검증에 필요한 최소 범위로 제한한다.

## 2026-08-24: MVP host와 추론 제공자는 Kiro로 제한

- **상태:** 승인
- **맥락:** Kiro challenge에 맞춰 Kiro API를 제공받는 상황에서 Bedrock을 별도 추론 경로로 섞으면 비용, 인증과 디버깅 경계가 늘어난다. Claude Code와 Codex까지 동시에 지원하면 핵심 검증이 흐려진다.
- **결정:** MVP Agent host와 추론 경로는 Kiro/Crew를 우선 사용한다. Bedrock 별도 경로와 Claude Code·Codex adapter는 MVP 이후로 미룬다. background와 user-triggered 추론은 실행 시점과 quota를 구분하되 provider를 나누기 위한 이유로 사용하지 않는다.
- **검토한 대안:** Bedrock을 background 분석에 별도 사용, 처음부터 multi-provider, Kiro를 UI에만 사용.
- **tradeoff:** 범위와 대회 적합성은 좋아지지만 Kiro quota·latency·기능 제한에 더 의존한다. Core와 MCP contract는 host package와 분리한다.

## 2026-08-24: 생성 project는 TypeScript Golden Path

- **상태:** 승인
- **맥락:** 제품의 개념 모델은 언어 비종속적이어야 하지만 MVP에서 여러 언어의 생성·실행·배포 경계를 검증하기에는 범위가 크다.
- **결정:** contract와 domain은 언어 비종속적으로 설계하고, 실제 생성·실행 project와 배포 고려는 TypeScript만 지원한다.
- **검토한 대안:** Python/Django 우선, 여러 언어 동시 지원, 교육 내용까지 TypeScript에 종속.
- **tradeoff:** 구현과 검증은 집중되지만 다른 언어 사용자는 MVP 대상이 아니다. 언어별 adapter가 필요한 지점을 architecture에 남긴다.

## 2026-08-24: Campus Drop은 Golden Path fixture

- **상태:** 승인
- **맥락:** 사용자의 고등학교 경험에서 행사 신청, 실제로 사용된 파일 공유와 WebSocket click batching은 실용성, 범위와 인접 복잡성의 차이를 잘 보여준다. 다만 하나의 project에 최적화하면 범용 추천을 검증할 수 없다.
- **결정:** Campus Drop을 전체 수직 흐름의 회귀용 Golden Path로 사용한다. Discovery와 Evidence 품질은 다른 learning goal과 unseen input도 함께 검증한다.
- **검토한 대안:** Campus Drop만을 제품으로 구현, fixture 없이 매번 자유 생성, 고정 10개 예제 전체를 Golden Path로 구현.
- **tradeoff:** 안정적인 demo와 test가 생기지만 fixture 특화 위험이 있어 unseen eval과 baseline 비교가 필수다.

## 2026-08-24: 대회 경쟁력은 완성도와 검증으로 입증

- **상태:** 승인
- **맥락:** 접수는 완료됐고 계약 자체만으로 경쟁력이 보장되지는 않는다. 심사에서 핵심은 문제 정의, Kiro 적합성, 작동하는 end-to-end 제품과 차별화 근거다.
- **결정:** MVP 이전에는 핵심 수직 흐름과 안전성을 완성한다. MVP 이후 대회 제출 전에는 실제 초보 사용자 pilot, generic Kiro/단순 memory baseline, ablation, unseen input과 demo reliability를 우선한다. cloud·multi-host·기존 project import는 미룬다.
- **검토한 대안:** 기능 수 확대, 화려한 UI를 우선, 사용자 검증 없이 demo만 준비.
- **tradeoff:** breadth는 줄지만 제품 주장의 신뢰성과 심사 재현성이 높아진다.

## 2026-08-24: TypeScript workspace 개발 도구

- **상태:** 승인
- **맥락:** repository에는 아직 application code와 package manifest가 없다. architecture는 package boundary와 test 종류만 승인했고 구체 도구는 확정하지 않았다.
- **결정:** Node.js active LTS, pnpm workspace, TypeScript strict mode, Vitest와 Playwright를 사용한다. 정확한 Node version, runtime schema와 SQLite/migration library는 호환성 검토 후 Agent가 T02 시작 전에 결정 기록과 함께 확정한다.
- **검토한 대안:** npm workspace, Bun, Jest, Node test runner, 다른 runtime schema 및 SQLite library.
- **tradeoff:** pnpm은 workspace 효율이 좋지만 사용자 환경에 Corepack/pnpm 준비가 필요하다. 도구 수를 늘리면 초기 설정과 Kiro 환경 호환성 부담이 커진다.

## 2026-08-25: T02 repository skeleton 세부 도구와 경계

- **상태:** 승인
- **맥락:** T02를 시작하려면 active LTS의 정확한 Node version, runtime schema, SQLite/migration 조합, lint/format 도구와 실행 package 위치를 고정해야 한다. 로컬 기본 Node.js v26.4.0은 Current이고 Node.js v24.19.0 LTS가 별도로 설치돼 있다. `node:sqlite`는 v24.19.0에서도 release candidate이며, `better-sqlite3` v13은 Windows에서 불필요한 node-gyp toolchain을 요구하는 문제가 보고됐다. T01은 Zod 4와 MCP SDK 2.0.0, React 18.3 기반 Crew App을 실제 runtime에서 통과시켰다.
- **결정:** Node.js 24.19.0, pnpm 11.12.0, TypeScript 7.0.2 strict ESM, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1과 Biome 2.5.10을 고정한다. Crew App은 T01 host 경계를 유지해 React 18.3.1을 쓰고 Vite 8.2.2 및 `@vitejs/plugin-react` 6.1.0으로 빌드한다. local SQLite는 `better-sqlite3` 12.11.1과 Drizzle ORM 0.45.2/Drizzle Kit 0.31.10 조합을 사용한다. 실행 가능한 MCP process는 `apps/mcp-server`, 재사용 가능한 Core·storage·adapter는 `packages/*`에 둔다. pnpm recursive script와 TypeScript project reference로 orchestration하며 Turborepo는 추가하지 않는다. dependency lifecycle script는 실제 설치에 필요한 `better-sqlite3`와 `esbuild` package 이름만 허용한다.
- **검토한 대안:** 현재 기본 Node.js v26 사용, `node:sqlite`, `better-sqlite3` v13, Kysely, Drizzle 1.0 RC, ESLint+Prettier, `packages/mcp-server`, Turborepo.
- **tradeoff:** Node 24와 `better-sqlite3` v12 고정은 최신 Current runtime과 SQLite binding의 신기능을 늦게 받지만 Windows install과 재현성이 좋아진다. Drizzle stable은 SQL migration과 typed query를 제공하지만 storage implementation에만 격리해야 한다. Biome 단일 도구는 설정과 의존성을 줄이는 대신 package dependency graph는 별도 smoke test로 검증한다.

## 2026-08-25: T03 공유 contract 식별자·version·provenance 규칙

- **상태:** 승인
- **맥락:** T03 contract는 Agent, UI, Core와 이후 SQLite가 같은 record를 식별하고 검증하는 기준이다. `schema version`, entity revision과 stale-write token을 섞거나 Evidence source의 작성 주체를 자유 문자열로 받으면 구버전 payload, 잘못된 lineage와 Agent-authored false mastery를 contract 단계에서 구분하기 어렵다.
- **결정:** Zod strict object와 그 schema에서 추론한 TypeScript type을 단일 source로 사용한다. 첫 wire contract는 `schemaVersion: 1`만 수용하고 명시적 migrator가 생기기 전 구버전·미래 version과 초과 field를 거절한다. stable ID는 entity prefix와 소문자 RFC 4122 UUID v4를 결합하고, timestamp는 UTC RFC 3339, immutable record revision은 1부터 증가하며 stale-write용 expected revision은 0을 허용한다. correlation ID는 한 논리 흐름을, idempotency key는 한 제출 재시도를 추적한다. source reference는 kind가 작성 주체를 고정하는 discriminated union으로 만들고 Evidence Proposal의 직접 근거에는 user-authored source만 허용한다. code, diff, test와 Agent message는 보조 context reference로만 둘 수 있다. contract의 file reference는 상대 POSIX path만 허용하며 absolute path, `..`, backslash와 NUL을 거절한다. 실제 filesystem canonicalization과 workspace containment는 T06에서 다시 강제한다.
- **검토한 대안:** 임의 string ID, ULID 신규 의존성, offset 허용 timestamp, TypeScript interface와 Zod schema 중복 작성, 모든 source에 별도 `author` 문자열 허용, contract에서 filesystem 접근까지 수행.
- **tradeoff:** strict v1은 초기 호환성보다 오류의 조기 발견을 우선하며 contract 변경 시 fixture와 명시적 migration이 필요하다. UUID는 사람이 읽기 길지만 추가 의존성 없이 Core에서 안전하게 생성할 수 있다. path schema만으로 symlink나 실제 root 탈출을 막을 수 없으므로 T06의 canonical containment 검증이 필수다.

## 2026-08-25: Crew/Gateway/session 연동 방식

- **상태:** 승인
- **맥락:** T01에서 두 App chat slot과 history는 동작했지만 Crew 0.3.0의 App event bridge는 연결되지 않았고 native spawn은 interactive approval에서 멈췄다. `useAppApi().post()`도 `/api/chat` SSE를 JSON으로 파싱한다. 반면 분리된 MCP catalog, Core stable ID/revision handoff와 숨은 no-tool Analyst slot은 실제 runtime에서 통과했다.
- **결정:** 명시적인 Core MCP checkpoint와 local SQLite의 stable project/task/decision/episode/job ID를 source of truth로 사용한다. Crew App은 Builder/Helper app-owned slot을 얇게 감싸고 history를 REST로 복원한다. Analyst는 TypeScript App이 전용 숨은 slot으로 dispatch하며 durable job 상태, timeout, attempt와 late-result rejection은 Core가 소유한다. `/api/chat`은 경로·payload가 고정된 SSE adapter 하나로 격리하고 범용 raw Gateway client를 노출하지 않는다. App event, Crew memory, native spawn task와 raw chat session 공유를 MVP 전제로 쓰지 않는다.
- **검토한 대안:** event bridge가 고쳐질 것을 가정, Python App backend에서 `approval_mode:auto` spawn 사용, 별도 Bedrock worker, 모든 session transcript 공유.
- **tradeoff:** Crew native task progress와 hard cancel을 바로 얻지 못하지만 TypeScript-only, 최소 권한과 재시작 복구 경계가 명확해진다. runtime slot이 사라져도 Core job을 재시도할 수 있다. App API allowlist는 browser-side guard이므로 앱 신뢰와 Core/MCP 경계를 별도로 강제해야 한다.

## 2026-08-25: Code 중심 MVP는 Kiro 내장 Workspace Agent surface

- **상태:** 승인
- **맥락:** 사용자는 Agent 중심 ADE와 Code 중심 IDE를 숙련도 단계가 아닌 취향으로 모두 시험하려 한다. T01에서 같은 `.kiro/agents` Builder/Helper가 Kiro CLI에서 Agent별 MCP 권한과 Core handoff를 통과했고, 공식 문서는 project-level Agent가 IDE/CLI 양쪽과 UI switching을 지원한다고 명시한다.
- **결정:** Code 중심 MVP는 별도 extension이나 custom webview 없이 Kiro IDE의 editor와 내장 Agent panel에서 project-local Builder/Helper를 선택하는 thin surface다. 두 Agent는 Crew App과 같은 Core MCP·stable ID를 사용하며 raw chat session을 공유하지 않는다. Agent 중심 Crew App은 Builder/Helper side-by-side primary를 유지한다. macOS 시각 picker와 Windows smoke는 제출 전 검증하되 `apps/kiro-panel`을 만들지는 않는다.
- **검토한 대안:** Open VSX extension/webview, Crew App 안에 Monaco editor, Code mode 삭제, Crew와 IDE의 raw session 동기화.
- **tradeoff:** custom Task/Decision widget은 Code mode에 없지만 구현 범위와 host 취약성이 크게 줄고, 사용자는 실제 Kiro 편집 경험을 그대로 쓸 수 있다.

## 2026-08-24: MVP 실행·배포 범위

- **상태:** 승인
- **맥락:** 초기 대화에서는 TypeScript 배포만 고려하기로 했지만 정확한 심사 실행 환경과 hosted endpoint 필요 여부는 제품 계약에 확정되지 않았다.
- **결정:** 첫 MVP 완료 기준은 재현 가능한 local Kiro/Crew App, MCP server와 생성 TypeScript 결과물의 실행이다. 대회 제출 요건을 다시 확인한 뒤 T28에서 하나의 공식 packaging·배포 경로를 승인한다.
- **검토한 대안:** 처음부터 hosted service, 생성 결과물만 배포, 배포를 전혀 고려하지 않음.
- **tradeoff:** core 검증에 집중할 수 있지만 심사자가 접근할 공개 surface가 필수라면 뒤늦은 packaging 위험이 있다. T00에서 요건 확인 책임을 정한다.

## 2026-08-24: Evidence threshold와 사용자 연구 규모

- **상태:** 승인
- **맥락:** `DEMONSTRATED`와 `TRANSFERRED`에 필요한 독립 Evidence 횟수, contradiction 해소 정책과 pilot 참가자 수는 언어만으로 최적값을 정하기 어렵다.
- **결정:** reducer는 보수적인 초기 규칙과 명시적 trace를 사용하되 숫자 threshold는 fixture와 초보 사용자 pilot 뒤에 조정한다. 연구 규모는 대회 일정, 모집 가능성, 동의와 annotation 역량을 확인한 뒤 확정한다.
- **검토한 대안:** 처음부터 고정 confidence score, LLM의 직관만 사용, 사용자 검증 생략.
- **tradeoff:** 초기 state가 보수적이거나 둔할 수 있지만 근거 없이 false mastery를 만드는 것보다 안전하다.

## 2026-08-25: T04 초기 domain reducer와 Evidence 정책

- **상태:** 승인
- **맥락:** T03 wire contract는 provenance와 기본 shape를 검증하지만 cross-record lineage, state transition, duplicate replay와 Evidence 채택은 아직 결정하지 않는다. 특히 기존 accepted Evidence union에는 contradiction을 정직하게 보존할 종류가 없어 `MisconceptionIssue.openedByEvidenceId`를 충족할 수 없고, accepted Evidence만으로 reducer 입력을 재현하는 데 필요한 Episode와 Evidence 분류 정보가 부족하다. 숫자 confidence threshold는 T07 fixture와 T23 pilot 전까지 확정하지 않기로 했다.
- **결정:** T04 domain 함수는 ID와 시각을 입력으로 받는 순수 함수로 만들고 `APPLIED`, `NO_OP`, `REJECTED` 결과와 versioned trace를 반환한다. Candidate merge는 첫 target Candidate의 다음 revision으로 이어가며 모든 target의 최신 revision을 parent로 보존한다. Spec 확인은 최신 draft와 내용이 같은 user-authored next revision만 허용한다. Task, Decision과 Episode는 명시적인 허용 전이만 적용한다. accepted Evidence에는 Episode, signal, strength와 prompt dependence를 보존하고 state를 지지하지 않는 `MISCONCEPTION_SIGNAL` variant를 추가한다. 초기 Evidence 정책은 QUESTION, NONE, WEAK와 DIRECTLY_LED로 state를 올리지 않고, 유효한 REPHRASE는 최대 EXPLAINED, 직접 유도되지 않은 STRONG PREDICTION·JUSTIFIED_DECISION·APPLICATION은 최대 DEMONSTRATED로 제한한다. TRANSFERRED는 이전 DEMONSTRATED 근거와 다른 Task 또는 Project의 STRONG·INDEPENDENT TRANSFER를 함께 요구한다. CONTRADICTION은 open issue를 열거나 보강하되 Concept State를 자동 강등하지 않는다.
- **검토한 대안:** domain이 현재 시각과 ID를 직접 생성, duplicate를 오류로만 처리, Analyst proposal의 maximum state를 그대로 적용, contradiction을 USER_UNDERSTANDING Evidence로 위장, 한 번의 contradiction으로 state 강등, pilot 전에 confidence score와 반복 횟수 threshold 고정.
- **tradeoff:** 초기 정책은 false mastery를 줄이는 대신 약한 학습 신호를 state에 반영하지 않아 보수적으로 보일 수 있다. accepted Evidence payload가 조금 커지지만 reducer replay와 audit가 단순해진다. 정책 조정은 reducer version, 결정 기록과 회귀 fixture를 함께 변경해야 한다.

## 2026-08-25: T05 SQLite hybrid schema와 복구 경계

- **상태:** 승인
- **맥락:** T03 strict contract와 T04 reducer 결과를 local SQLite에 보존하면서 revision lineage, restart 복구, Evidence Trace와 audit query를 지원해야 한다. 모든 nested DTO를 컬럼으로 완전 정규화하면 contract 변경마다 DDL이 과도하게 흔들리고, 단일 generic JSON table은 foreign key와 projection invariant를 강제하기 어렵다. 실제 OS app-data 위치는 packaging 전에는 확정되지 않았다.
- **결정:** stable ID, revision, status, correlation, timestamp와 조회·관계 key는 SQLite column과 foreign key로 두고, 각 strict contract DTO 전체는 canonical JSON과 SHA-256 hash로 함께 보존하는 hybrid schema를 사용한다. immutable revision/event/proposal/audit table과 selected Candidate, active Task, pending Decision, 최신 Context·Concept State projection을 분리하고 같은 transaction에서 갱신한다. application package에는 repository port와 Unit of Work interface만 두며 use case는 T06에서 구현한다. storage는 raw Crew/Agent transport payload를 받지 않고 contract schema로 재검증한 record만 저장하며, 알려진 credential pattern은 redaction status와 무관하게 마지막 방어선에서 거절한다. file DB는 host가 명시적으로 제공한 data directory 아래 고정 filename을 사용하고 production default path는 T28 packaging에서 결정한다. pending migration 전 sibling backup을 만들고, Drizzle transaction migration과 `PRAGMA quick_check`를 사용한다. corruption이나 migration 실패 시 원본을 자동 삭제·교체하지 않는다.
- **검토한 대안:** 모든 field 완전 정규화, entity 종류를 구분하지 않는 단일 event/JSON table, repository가 임의 SQL과 raw payload 저장을 노출, repository 내부에서 OS home directory를 추측, migration 전 backup 생략, corruption 시 DB 자동 재생성.
- **tradeoff:** canonical JSON과 indexed column이 일부 정보를 중복하지만 contract round trip과 relational query를 함께 얻는다. storage가 수행하는 credential pattern 검사는 redaction service를 대체하지 않으며 false negative를 막기 위해 T21에서 별도 redaction/eval을 강화해야 한다. backup 때문에 migration 시작 비용이 늘지만 local single-user DB의 recoverability를 우선한다. Drizzle 0.45의 전체 declaration surface는 TypeScript 7 strict build에서 optional backend type 오류를 만들므로 schema는 migration input으로 격리해 `drizzle-kit check`로 검증하고, runtime query는 strict TypeScript repository 안의 bound `better-sqlite3` statement로 제한한다.

## 2026-08-25: T06 application과 역할 고정 MCP 보안 경계

- **상태:** 승인
- **맥락:** T03 contract는 actor와 상대 path shape를 검증하고 T05 storage는 transaction과 immutable receipt를 제공하지만, 실제 caller role, payload 크기, symlink를 포함한 workspace containment, stale write와 idempotent replay를 application/MCP 경계에서 함께 강제하지 않는다. Architecture의 초기 tool 목록에는 user-authored Discovery feedback을 Agent가 기록하는 것처럼 보이는 항목도 남아 있었다.
- **결정:** application handler를 Agent와 UI가 공유하는 command/query 및 transaction 경계로 구현한다. MCP process는 시작 시 Discovery, Builder, Helper 또는 Evidence Analyst 한 role에 고정하고 해당 catalog만 등록하며 payload의 actor claim을 다시 검증한다. validated canonical JSON UTF-8 요청은 2 MiB로 제한한다. user-authored Discovery feedback은 UI application command로만 받고 Discovery Agent tool에서 제외한다. idempotent command는 canonical request SHA-256 hash와 결과 resource/revision receipt를 저장해 같은 key·같은 hash만 replay하고 key 재사용은 거절한다. workspace root와 project workspace는 host가 명시한 절대 path를 사용하며 existing target은 realpath, missing target은 nearest existing ancestor를 기준으로 containment를 확인한다. T06 MCP에는 raw SQL, 범용 file read/write, shell 또는 network tool을 노출하지 않는다. protocol-level allowlist test에는 server와 같은 2.0.0의 공식 MCP client package를 test dependency로 사용한다.
- **검토한 대안:** 하나의 MCP catalog를 prompt로만 제한, payload actor를 caller identity로 신뢰, SDK 기본 10 MiB transport 제한만 사용, lexical path prefix만 검사, 결과를 저장하지 않는 in-memory idempotency, Discovery Agent가 user feedback source를 대신 주장, custom JSON-RPC test client 작성.
- **tradeoff:** role별 process/config와 aggregate query가 늘어나지만 권한 누출과 session 간 상태 혼동을 줄인다. 2 MiB cap은 contract의 이론적 최대 조합보다 작을 수 있으므로 비정상적으로 긴 batch는 나눠 제출해야 한다. canonicalization은 filesystem 조회가 필요하지만 path-bearing mutation 전에만 수행하며 실제 Builder shell confinement는 T10에서 같은 policy에 연결한다. 공식 client test dependency 하나가 늘지만 실제 `tools/list`/`tools/call` protocol 회귀를 직접 검증할 수 있다.

## 2026-08-24: 구현 세부 선택 위임

- **상태:** 승인
- **맥락:** 사용자는 제품 방향과 기본 기술안을 승인했고, 호환성에 좌우되는 세부 library와 실험 수치는 구현 과정에서 근거를 남겨 선택하도록 위임했다.
- **결정:** package manager와 local-first MVP 경계는 승인한다. runtime schema·SQLite/migration library는 T02, Code 중심 최소 surface는 T01, eval reviewer/fixture는 T07, pilot 규모는 T23에서 Agent가 비교 근거와 결과를 결정 기록에 남긴다. 사용자 연구는 명시적 동의, secret redaction, local 저장과 익명화 결과만 평가·제출에 사용하는 원칙을 지킨다.
- **검토한 대안:** 구현자가 묵시적으로 선택, 모든 선택을 지금 고정, 라이브러리 선택을 제품 Spec에 포함.
- **tradeoff:** 짧은 승인 단계가 추가되지만 추론한 가정을 확정 요구로 오인하는 것을 막는다.
