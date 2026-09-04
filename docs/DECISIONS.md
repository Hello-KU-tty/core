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

## 2026-08-26: T07 속성 기반 평가와 reviewer 경계

- **상태:** 승인
- **맥락:** T03의 evaluation contract는 fixture와 run의 기본 envelope만 제공하고 실제 scorer, reviewer 판정 단위와 baseline 의미는 정하지 않았다. T08 이후 Agent 출력을 고정 문구나 Campus Drop 전용 답과 비교하면 unseen input의 품질을 측정하지 못하고, 모든 의미 판정을 자동화하면 후보 다양성·Decision 필요성·claim 단위 Evidence 같은 항목에 가짜 정밀도가 생긴다. 반대로 모든 항목을 사람에게 맡기면 contract·provenance·reducer 회귀를 재현 가능하게 막을 수 없다.
- **결정:** T07 평가는 고정 답안 대신 criterion별 허용·금지 속성을 사용한다. contract, revision, 필수 scope, stale version, provenance, reducer outcome과 redaction sentinel은 deterministic scorer가 판정하고, 의미적 다양성, Concept Necessity, scope 적합성, 실제 Decision 필요성과 Evidence claim 정확성은 근거와 rubric을 가진 human review로 남긴다. run은 criterion별 결과를 보존하며 `NEEDS_REVIEW`를 실패와 구분하고 가중 종합 점수나 confidence percentage를 만들지 않는다. Campus Drop과 personal need 유무가 다른 unseen corpus, 알려진 good/bad calibration output을 함께 둔다. T07 baseline은 harness가 알려진 차이를 검출하는 calibration baseline이며 일반 Kiro·memory baseline과 ablation은 T24까지 주장하지 않는다. fixture와 committed baseline은 개인정보가 없는 redacted JSON으로 유지하고 runtime evaluation run과 baseline은 같은 strict contract를 canonical JSON/hash와 함께 local SQLite에 저장한다. 외부 LLM judge와 새 평가 dependency는 추가하지 않는다.
- **검토한 대안:** exact string golden answer, 하나의 weighted score, 모든 항목 자동 heuristic, 모든 항목 수동 review, T07에서 실제 Kiro baseline을 미리 주장, 평가 결과를 repository JSON에만 저장.
- **tradeoff:** semantic 품질에는 reviewer 시간이 필요하고 T23 전에는 reviewer agreement를 주장할 수 없다. 대신 자동 검증의 재현성과 사람 판단의 정직한 경계가 분명해지고, prompt를 fixture 문구에 맞춰 과적합하는 위험과 false precision을 줄인다.

## 2026-08-26: T08 feedback-to-round 계약과 Discovery Agent 경계

- **상태:** 승인
- **맥락:** user feedback이 아직 생성되지 않은 결과 revision을 미리 참조하게 하면 retry와 실패 뒤 causal history가 거짓이 된다. 반대로 Agent에게 Candidate/Round ID, timestamp, source와 input snapshot까지 생성하게 하면 의미 생성과 Core 상태 소유권이 섞인다. Kiro CLI 2.19.2는 선언한 tool input 외에 `__tool_use_purpose` transport field를 주입하는 동작도 실제 실행에서 확인됐다.
- **결정:** user-authored feedback은 현재 round의 latest Candidate revision만 target으로 기록하고 결과를 소유하지 않는다. SELECT가 아닌 pending feedback은 다음 Candidate Round가 `appliedFeedbackIds`로 정확히 연결하며, round는 유지된 latest revision과 새 revision의 완전한 현재 집합을 보존한다. Application이 PIN, REJECT, MERGE, REVISE, SHRINK, EXPAND와 REGENERATE의 target·lineage·next revision·carried set을 deterministic하게 검증한다. SELECT는 UI command만 허용하고 Discovery Session과 Project를 terminal 상태로 바꿔 이후 feedback/round를 거절한다. Discovery Agent tool에는 의미 draft와 lineage만 노출하고 role-bound adapter가 검증된 context에서 Core-owned ID, revision, timestamp, provenance, redaction과 input snapshot을 채운다. `__tool_use_purpose`는 Agent-facing transport schema에서만 선택적으로 수용해 버린다. canonical prompt는 `docs/agent-prompts/discovery.md` version 1.0.1이며 tool allowlist 외의 file, shell, SQL, network 권한은 추가하지 않는다. live 회귀 runner는 prompt 품질 review를 통과하고 약 90초에 fresh 8-Candidate run을 완료한 `claude-haiku-4.5`를 기본으로 쓰되 제품 모델은 T24 전까지 고정하지 않는다.
- **검증:** synthetic unseen 입력에서 실제 Kiro CLI 2.19.2 Agent Engine v2→role-bound MCP→Application→SQLite가 8개 Candidate round를 중단 없이 저장하고 정상 종료했다. server metadata만 정규화한 v1.0.1 fixture가 strict contract·구조 scorer와 기록된 사람의 의미 다양성·Concept Necessity review를 통과한다. 반면 `auto` 모델의 느린 fresh run은 첫 submit에서 `Transport closed`가 재현됐고, 그 exact payload는 공식 in-memory와 fresh stdio MCP client에서 같은 server/Application/SQLite에 즉시 수락됐다.
- **검토한 대안:** feedback에 미래 resulting revision 저장, Agent가 완성된 Application command와 provenance 생성, PIN 후보만 별도 table로 관리, SELECT를 Agent tool에 노출, Kiro transport field를 Application strict contract까지 허용, server logging keepalive, Candidate draft를 여러 tool call로 staging한 뒤 atomic finalize, persistent HTTP MCP, Kiro Agent Engine v3로 즉시 전환, timeout을 mock 성공으로 대체.
- **tradeoff:** 다음 round는 전체 current Candidate reference와 적용 feedback 목록을 보내야 하고 transport adapter 코드가 늘어난다. 대신 실패 전 feedback과 성공한 결과의 인과관계, stale retry, user selection provenance가 재현 가능하며 Kiro 전용 세부사항이 stable Core contract로 누출되지 않는다. CLI 2의 느린 단일 tool input lifecycle 결함은 T09의 selected-Candidate→Spec 계약을 막지 않으므로 T09로 진행한다. server logging keepalive는 효과가 없어 제거했고, staging은 partial Agent draft 상태와 새 contract를 만들며 persistent HTTP는 process/security 경계를 늘리므로 target Crew host에서도 재현될 때 T15에서만 승인한다. v3 probe는 v2 custom Agent를 upgrade하지 못하고 default Agent로 fallback했으므로 비교 근거로 쓰지 않으며 T19에서 native config로 재검증한다. T21은 clean session의 fresh 8-Candidate run과 retry 무중복성을 release gate로 둔다.

## 2026-08-27: T09 Learning Spec revision과 Discovery 복귀 경계

- **상태:** 승인
- **맥락:** T03~T08은 Learning Spec record와 변경 없는 사용자 확정, selected Candidate와 terminal Discovery Session을 보존하지만, Discovery Agent가 Spec ID·revision·timestamp·source까지 직접 제출하고 최신 draft를 context에서 읽지 못한다. 또한 `조금 바꾸기`와 `다른 주제로 돌아가기`를 안전하게 표현할 application transition이 없다. 선택이 끝난 T08 Session을 다시 열면 terminal selection과 feedback-to-round 인과관계가 깨진다.
- **결정:** Agent와 UI는 Learning Spec의 의미 내용만 제안하며 role-bound/application adapter가 selected Candidate, Spec ID, next revision, parent, timestamp, source와 redaction status를 채운다. 첫 draft는 selected Candidate에 연결된 revision 1이고, 조정은 같은 Spec·Candidate의 current draft 바로 다음 revision만 허용한다. 사용자는 Agent가 다시 쓴 draft 또는 직접 편집한 draft를 명시적으로 확정할 수 있으며, 확정 revision은 current draft와 내용이 같아야 한다. `다른 주제로 돌아가기`는 selected Session을 재활성화하지 않고 같은 입력에서 새 Discovery Session을 만들며 current draft를 `SUPERSEDED`로 닫는다. Core의 필수 Evidence target은 `LEARNER_FOCUS` concept만 사용하고 `AGENT_SUPPORT`와 `EXCLUDED`를 제외한다.
- **검토한 대안:** Agent가 stable metadata를 계속 생성, 기존 selected Session 재개, Spec 수정을 confirmation payload에 함께 포함, Spec feedback 전용 table 추가, 세 scope의 모든 concept을 Builder/Evidence 목표로 사용.
- **tradeoff:** 새 session 때문에 Project의 Discovery history가 하나 늘고 Spec 조정에 revision이 추가되지만 T08 terminal invariant와 provenance를 보존한다. 별도 Spec feedback entity를 만들지 않아 자연어 요청 원문은 Crew conversation 경계에 남지만 저장된 draft의 author와 revision은 명확하다. 직접 편집과 Agent 재작성은 같은 domain policy를 공유해 UI 선택권과 deterministic validation을 함께 유지한다.

## 2026-08-27: T10 Builder Task 준비와 native workspace 실행 경계

- **상태:** 승인
- **맥락:** T09은 user-confirmed Learning Spec까지 보존하지만 Task 생성, generated workspace assignment와 Builder runtime은 아직 연결하지 않았다. Crew 0.3.0은 slot의 project directory를 첫 message 전에 지정할 수 있고 Kiro CLI 2.19.2 Agent Engine v2는 tool별 path 설정, shell `denyByDefault`와 pre-tool hook을 제공한다. 다만 host user 권한으로 실행되는 native file/shell tool은 Core MCP catalog 분리만으로 filesystem boundary가 되지 않으며, raw stream 전체를 durable storage에 넣으면 secret과 민감 경로가 섞일 수 있다.
- **결정:** Spec confirmation과 retry 가능한 `UI_PREPARE_BUILDER_TASK`를 분리한다. Core가 confirmed Spec을 deterministic Task로 변환하고 `projects/<projectId>` 상대 workspace를 발급한다. `LEARNER_FOCUS`는 expected Concept, `AGENT_SUPPORT`는 구현 지원 requirement, `EXCLUDED`는 excluded work로만 매핑한다. Builder는 기존 Kiro CLI 2.19.2 Agent Engine v2와 Crew 0.3.0을 유지하고 fresh slot을 canonical project workspace에 첫 message 전에 연결한다. native read/write/shell은 Kiro의 deny-by-default 설정과 Core workspace policy를 재사용하는 pre-tool guard를 모두 통과해야 하며 web, subagent, global MCP는 허용하지 않는다. runtime escape probe가 이 경계를 증명하지 못하면 임의 fallback이나 CLI 3 migration을 하지 않고 새 결정을 요청한다. Builder stream은 redaction 뒤 사용자에게 transient하게 보이고 raw transcript는 저장하지 않으며, durable state에는 versioned Live Context, Completion Report와 구조화된 source reference만 남긴다. 첫 Context는 `TASK_STARTED`, 완료 직전 마지막 Context는 `TASK_COMPLETED`로 강제한다. Completion Report의 Concept usage는 구현에서 사용됐다는 관찰이며 사용자 이해 판정이 아니다.
- **검토한 대안:** Spec 확정 transaction에서 즉시 Task와 workspace 생성, Agent가 Task acceptance criteria와 workspace path를 결정, Core MCP에 범용 file/shell tool 추가, Crew slot cwd만 믿고 별도 guard 생략, raw Builder transcript 전체 저장, Kiro CLI 3으로 즉시 migration.
- **tradeoff:** Task 준비 command와 runtime guard가 추가되고 허용 shell command가 보수적이어서 새로운 debug command는 명시적으로 확장해야 한다. 대신 confirmation retry 실패가 Spec lineage를 바꾸지 않고, Agent 작성 의미와 Core-owned state, filesystem 경계, 사용자에게 보이는 진행과 durable 최소 기록을 분리할 수 있다.

## 2026-09-01: T11 Decision gate와 Builder 재개·적용 경계

- **상태:** 승인
- **맥락:** T03~T06은 Decision Request, user Resolution과 Builder Application record 및 reducer·SQLite 골격을 만들었지만, T10 Builder runtime에는 실제 적용 command가 없고 Decision 요청과 `DECISION_REQUIRED` Live Context가 별도 write라 부분 실패 시 정합성이 깨질 수 있다. 또한 `independentWorkCanContinue`가 Task 상태를 바꾸지 않으며 이유 없는 추천 수락을 이후 이해 Evidence에서 배제할 deterministic 근거가 없다.
- **결정:** Builder-facing Decision tool은 category, 질문, 필요 이유, 선택지, 추천, 관련 Concept·source reference와 독립 작업 가능 여부만 받고 role-bound adapter가 Kiro transport metadata를 제거한 뒤 Application이 stable Decision/option ID, current Context version, timestamp, provenance와 redaction 상태를 채운다. Application은 Decision Request와 다음 `DECISION_REQUIRED` Context를 한 transaction에서 저장하고, 독립 작업이 불가능하면 Task를 `BLOCKED`로 전이한다. UI의 user-authored Resolution은 추천 수락, 직접 option 선택과 custom proposal을 보존하며, 해결되지 않은 다른 blocking Decision이 없으면 Core가 Task를 `ACTIVE`로 재개한다. Builder는 별도 `apply_decision_result` tool로 구현 결과와 source reference를 제출하고 DecisionApplication record와 active Decision ID를 제거한 다음 Live Context를 한 transaction에서 저장한다. 모든 요청된 Decision이 적용되기 전에는 Task completion을 거절한다. Helper에는 pending Decision context만 handoff하고 실제 Helper prompt·대화는 T12에 둔다. `DECISION_RESOLVED` Activity에는 사용자 rationale 원문 대신 rationale 존재 여부만 남겨, 이유 없는 수락을 이해 Evidence source로 수용하지 않는다.
- **검토한 대안:** Decision과 Context를 순차 저장, Task를 항상 ACTIVE로 유지, resolution만으로 적용 완료 처리, Builder가 stable metadata를 생성, 의미적 필요성을 filename keyword 같은 heuristic으로 자동 판정, T11에서 Helper 대화·Decision UI·Episode assembler까지 함께 구현.
- **tradeoff:** request와 application command가 Context version을 함께 다뤄 contract와 transaction test가 늘어난다. 대신 stale retry와 재시작에서도 pending gate가 재현되고 사용자의 선택, Builder 적용, Task 재개가 구분된다. Decision 필요성 자체는 LLM prompt와 기록된 human review가 담당하므로 사소한 질문을 완벽히 자동 차단하지는 않지만, Core가 의미 판단을 가장하거나 fixture 문구에 과적합하지 않는다.

## 2026-09-01: T12 bounded Helper context와 durable refresh 경계

- **상태:** 승인
- **맥락:** T06의 Helper scaffold는 Live Context, active Decision과 최대 5개 Ledger를 읽고 refresh 요청을 audit에만 남긴다. 하지만 활성 Task가 없는 완료 Project에서는 Helper를 열 수 없고, missing Context가 current처럼 보이며, 관련 Concept 이름이 비어 있으면 무관한 Ledger 앞 5개가 반환된다. code·diff·Builder 대화 reference도 실제 내용의 가용성을 구분하지 않아 Helper가 현재 코드를 추측할 위험이 있다.
- **결정:** Helper는 active Task가 없으면 마지막 current Task로 fallback하고 freshness를 `CURRENT`, `STALE`, `MISSING`으로 명시한다. Context package는 Live Context→Task/Spec→지정 또는 active Decision→질문·Context·Decision 관련 Concept 최대 5개→관련 과거 Episode→bounded source 순으로 조립한다. 무관한 Ledger fallback은 만들지 않는다. Builder가 이미 제출한 workspace-contained code reference만 질문 시점에 최대 3개, excerpt당 최대 8 KiB로 읽고 redaction한 뒤 응답하며 DB에는 복제하지 않는다. diff와 Builder transcript 원문은 장기 저장하지 않고 reference/availability만 전달한다. refresh는 versioned `ContextRefreshRequest`로 저장해 Builder가 pending 요청을 읽을 수 있게 하고, 더 새로운 Builder Context가 같은 transaction에서 이를 fulfilled로 닫는다. Helper는 Context, Decision, Evidence와 Builder Progress를 직접 변경하지 않는다. Prompt 원문은 `docs/agent-prompts/helper.md` version 1.0.0으로 고정하고, quick action은 답변 mode일 뿐 T13 Event/Evidence source가 아니다.
- **검토한 대안:** 완료 Project에서 Helper를 닫음, missing을 stale boolean 하나로 표현, 질문과 무관한 Ledger를 채워 반환, Helper에 전체 workspace `fs_read`나 shell 허용, 전체 repository·diff·Builder transcript를 매 질문 저장·주입, refresh를 audit summary로만 보존.
- **tradeoff:** Context response와 SQLite migration, bounded file read와 refresh lifecycle test가 늘어난다. 대신 AC-MVP-005의 현재성·최소성·복구 가능성을 재시작 뒤에도 검증할 수 있고, Helper가 넓은 file 권한이나 raw transcript 저장 없이 현재 코드에 근거한 답을 할 수 있다. 실제 Helper conversation Event와 Episode 조립은 T13, quick card UI는 T16에 남긴다.

## 2026-09-02: T13 structured Activity·Episode와 durable Analyst job 경계

- **상태:** 승인
- **맥락:** T03~T06은 Event, Episode, Evidence contract와 reducer·SQLite 골격을 만들었지만 T10~T12의 실제 Builder, Decision과 Helper 흐름은 아직 Event를 생성하지 않는다. Episode 종료 뒤 실행할 durable `AnalysisJob`, timeout/retry와 late result 차단도 없으며, 현재 Evidence batch는 근거가 전혀 없는 정상 분석을 표현하지 못한다. T01은 Crew event bridge나 native spawn 대신 hidden no-tool Analyst slot과 Core-owned durable job을 MVP 경계로 검증했다.
- **결정:** raw Crew event나 전체 transcript가 아니라 검증된 Application 상태 전이에서만 redacted Activity Event를 만든다. BUILD_TASK는 Task 시작부터 완료까지, DECISION은 요청부터 사용자 Resolution까지, HELPER_CONVERSATION은 첫 사용자 메시지부터 명시적 종료·관련 Decision 해결·Task 완료까지, FINAL_UPGRADE는 명시적 개인화 적용 행동 단위로 조립한다. Episode 종료와 `AnalysisJob` 생성은 한 transaction으로 처리한다. Job은 Episode revision, attempt와 30초 soft deadline을 가진 versioned `PENDING → RUNNING → SUCCEEDED/FAILED` 이력을 보존하고 자동 재시도는 1회로 제한한다. adapter startup/poll은 deadline이 지난 `RUNNING` lease를 Core command로 회수한다. 재시도 중 Episode는 `PENDING_ANALYSIS`, 두 attempt가 모두 실패하면 `ANALYSIS_FAILED`로 두며 명시적 수동 재시도만 다시 `PENDING_ANALYSIS`로 연다. current job revision·attempt와 맞지 않는 늦은 결과는 상태와 Evidence를 바꾸지 않고 거절한다. primary Analyst runtime은 bounded Episode context를 받은 hidden no-tool slot이며 semantic output의 ID, timestamp, provenance와 attempt token은 adapter/Core가 채운다. proposal 0개도 성공한 분석으로 허용하고 reason/count summary를 Job에 보존하며, Builder Concept usage는 사용자 이해와 분리된 deterministic `CONCEPT_OBSERVATION`으로 처리한다.
- **검토한 대안:** raw Crew stream을 Event source of truth로 사용, Event마다 Analyst 호출, hard cancel을 전제로 한 spawn task, Agent가 job/ID/provenance 생성, timeout 뒤 결과를 attempt 확인 없이 수용, Evidence가 없을 때 가짜 NONE proposal 생성, Builder 사용 Concept를 사용자 이해 Evidence로 처리.
- **tradeoff:** Event normalization, Episode close와 job transition을 기존 use case transaction에 연결해야 해 contract와 migration이 늘어나고 Helper conversation 종료 signal이 필요하다. 대신 provider/session이 사라져도 분석을 복구할 수 있고, 실패한 분석이 Builder 결과를 롤백하지 않으며, 한 Episode당 한 initial dispatch와 제한된 retry, provenance 분리와 빈 결과를 재현 가능하게 검증할 수 있다.

## 2026-09-02: T14 Crew Node backend와 durable session read model

- **상태:** 승인
- **맥락:** T05의 `recoverProject`는 stable project ID가 주어졌을 때 current Core 상태를 복구하지만 Crew App browser가 SQLite/Application을 호출할 production transport, Project History 목록 query와 UI용 session snapshot은 없다. Helper 원문 대화는 Crew slot history에 있고 durable Core에는 redacted user excerpt와 Helper summary만 남으므로 두 저장 경계를 같은 것으로 취급할 수도 없다. 설치된 Crew 0.3.0과 공식 manifest는 app-relative Node backend, same-origin reverse proxy와 Gateway proxy HMAC을 지원한다.
- **결정:** `apps/crew-backend`를 TypeScript Node composition root로 추가하고 Crew App UI는 고정 same-origin endpoint를 통해서만 기존 `ApplicationService.executeUi`를 호출한다. backend는 host가 제공한 absolute app-data와 generated-workspace 경계에서 SQLite/Application을 조합하고 proxy HMAC, method/content type, 2 MiB payload와 strict response schema를 검증한다. UI contract에는 project 목록과 session restore query/read model을 추가하며 project, Discovery/Spec, current 또는 active Task, pending Decision, Live Context와 redacted Helper conversation summary를 한 snapshot으로 반환한다. Project별 Builder/Helper slot key는 stable project ID에서 결정적으로 파생하고 Crew history를 runtime 보조 source로 복원한다. Crew 연결이 실패해도 Core snapshot과 redacted history는 유지하며 localStorage, seed나 mock을 production fallback으로 사용하지 않는다. UI route는 host subpath와 충돌하지 않는 hash route를 사용하고 React Router를 추가하지 않는다.
- **검토한 대안:** browser가 SQLite/storage package를 직접 bundle, 기존 Agent MCP를 UI transport로 재사용, app-scoped storage에 Core state를 복제, `apps/mcp-server`에 HTTP 책임 추가, Crew slot/history만 source of truth로 사용, production mock/seed fallback, 새 router/server framework dependency 추가.
- **tradeoff:** 별도 backend process와 HMAC·HTTP integration test, Project History query와 Crew/Core 부분 실패 상태가 늘어난다. 대신 UI와 storage dependency 방향, TypeScript-only 경계, Agent별 MCP 권한과 local-first 단일 source of truth를 유지하고 Crew Agent 연결과 durable project 조회를 독립적으로 복구할 수 있다. full Helper 원문은 Crew slot이 있을 때만 복원하며 offline에는 이미 저장된 redacted 요약만 정직하게 표시한다.

## 2026-09-02: T15 Discovery Crew Agent transport와 설치 package 경계

- **상태:** 승인
- **맥락:** T14 UI는 durable Core를 복원하지만 Discovery Agent dispatch와 app-owned Agent/MCP packaging이 없었다. Crew 0.3.0은 app Agent를 전역 Kiro Agent directory로 materialize하므로 상대 prompt file과 workspace package link를 유지하지 않으며, 앱 설치 시 `node_modules`를 제외한다. 반면 자동 포트 Node backend가 health check를 통과한 뒤 manifest의 loopback HTTP MCP URL을 실제 포트로 재등록하는 경로는 target host에서 확인됐다. T08 CLI 2 stdio의 느린 Candidate submit은 `Transport closed`를 냈지만 target Crew 0.3.0의 실제 10-Candidate run에서는 재현되지 않았다.
- **결정:** canonical Discovery prompt v1.1.0은 build에서 검증해 inline Agent config로 생성하고, Agent에는 app-owned `vibe-helper:discovery-core` 하나만 허용한다. Discovery MCP는 별도 범용 process가 아니라 Crew가 감독하는 기존 Node backend의 고정 `/mcp/discovery`에 role-bound Streamable HTTP handler로 조합한다. backend는 loopback에만 bind하고 handler는 `DISCOVERY` catalog만 노출하며 app manifest는 외부 network permission을 갖지 않는다. UI는 stable project ID에서 파생한 temporary slot과 고정 `/api/chat` SSE만 사용하고, Core tool turn에 필요한 schema version, project/session/correlation ID, expected session revision과 host-generated idempotency key를 Agent message에 명시한다. Agent가 이 값을 변경하거나 누락해도 Core validation이 최종 경계다. 완료 판정은 SSE 문장이 아니라 durable Candidate Round/Spec revision으로 하며, target 실측에 맞춰 420초 동안 진행 시간을 보여주고 timeout·host disconnect 뒤 retry 전에 Core를 먼저 복원한다. 설치물은 backend ESM bundle, `ui/dist/index.mjs` UI bundle, inline Agent, SQL migrations와 정확히 고정한 `better-sqlite3`·`drizzle-orm` runtime dependency만 담은 `dist/crew-package`로 staging한다. Crew host가 `ui.entry`를 고정 설치 `ui/` root에 상대적으로 해석하므로 manifest entry는 `dist/index.mjs`로 제한하고 smoke test가 manifest-entry와 staged file의 일치를 검증한다.
- **검증:** macOS target Crew 0.3.0에서 app별 trust만 추가하고 전역 third-party 허용은 사용하지 않았다. health-gated MCP initialize가 protocol `2025-11-25`와 Discovery tool capability를 반환했다. 실제 `auto` Agent는 `get_discovery_context`와 `submit_candidate_round`를 호출해 약 196초에 10개 Candidate, Round 1개를 SQLite에 저장하고 Session revision을 1에서 2로 올렸다. slot은 오류 없이 종료했고 `Transport closed`는 없었다. 따라서 T08의 staged partial draft fallback 조건은 충족되지 않았고 atomic round contract를 유지했다.
- **검토한 대안:** repository 전체를 그대로 설치, workspace package별 runtime install, prompt의 상대 `file://` 참조, app-relative stdio command, Agent가 session metadata를 추측, SSE 완료를 durable 성공으로 간주, 180초 고정 timeout, Candidate staged partial submit.
- **tradeoff:** backend가 UI HMAC route와 Agent HTTP MCP를 함께 조합하고 설치 시 두 native runtime package를 받아야 한다. 대신 Crew health lifecycle과 실제 포트 재등록을 사용해 별도 daemon·고정 포트를 만들지 않으며, role catalog·Core validation·SQLite transaction은 transport와 독립적으로 유지된다. T08에서 미뤘던 persistent HTTP는 stdio 오류 우회가 아니라 Crew app의 지원되는 supervised backend transport로 범위를 좁혀 승인하며, T19/T21은 clean install과 fresh retry 무중복 회귀를 계속 확인한다.

## 2026-09-03: T15 progressive Discovery와 즉시 복귀 latency 보완

- **상태:** 승인
- **맥락:** target 사용 흐름에서 최초 10개 후보는 약 193초가 걸렸고, 같은 project slot의 긴 transcript를 재사용한 재생성과 Spec→Discovery 자동 재생성은 각각 약 636초와 443초까지 늘었다. 두 흐름 모두 첫 tool submit에서 `candidates` 배열이 JSON 문자열로 이중 인코딩되어 validation에 실패한 뒤 Agent가 전체 의미 내용을 다시 생성했다. Candidate 카드가 첫 스캔에서 사용하지 않는 8개 criterion rationale와 risks까지 후보마다 요구한 점, Spec 뒤로가기가 새 Session과 Agent run을 즉시 시작한 점도 체감 대기를 키웠다.
- **결정:** 첫 round는 간결한 4~6개 Candidate로 줄이고, 사용자의 `MORE` feedback에서 기존 후보를 carry한 채 4~6개를 더해 누적 약 8~10개로 확장한다. 첫 스캔 계약은 상세 evaluation과 risks를 선택으로 두고 관심·비교 이후 지연 생성한다. Spec→Discovery는 local navigation만 수행해 이전 후보를 즉시 보여주며, 입력 수정과 `새 후보 받기`를 별도 명시 action으로 분리한다. 새 Discovery Session은 수정 입력을 저장하고, Agent slot은 project 장기 transcript 대신 Session ID와 expected revision으로 파생한다. MCP transport는 512 KiB 이하의 한 번 JSON-stringified candidate array만 복구한 뒤 기존 strict schema로 다시 검증한다. 60초 뒤 UI는 background 상태로 전환해 navigation을 풀되 durable Core 결과를 총 420초까지 관찰한다. prompt 1.1.1로 progressive 계약을 도입하고, 첫 target 재측정 77.2초에서 5개 카드 약 6 KiB와 round rationale 약 1 KiB가 남은 것을 확인해 1.1.2에서는 첫 round를 4개 우선으로 하고 카드 항목 수·자유 서술·round rationale·tool 전후 설명을 더 제한한다. 각 버전은 fixture/eval, contract와 UI/E2E를 함께 검증한다.
- **운영 목표:** Spec→Discovery 복귀 1초 이내·Agent 0회, 첫 4~6개 Candidate P95 60초, 단일 refinement와 Spec draft P95 45초, tool validation 재시도율 1% 미만을 초기 guardrail로 기록한다. provider 응답 보장은 아니며 target 관측에 따라 조정한다.
- **검토한 대안:** 매번 10개 full-detail Candidate 생성, Spec 뒤로가기 즉시 자동 재생성, project별 단일 장기 slot 유지, stringified payload를 Core schema에 영구 허용, 420초 동안 foreground 전체 잠금, validation 실패 때 모델 전체 재생성.
- **검증:** target Kiro Crew 0.3.0의 data-preserving update 뒤 설치 bundle hash, prompt 1.1.2, backend health와 기존 SQLite 보존을 확인했다. prompt 1.1.1은 첫 round 5개를 77.2초에 저장했고, 카드 항목과 round rationale을 더 제한한 1.1.2는 다른 unseen goal·Personal Need 없음 조건에서 4개를 47.4초에 atomic 저장했다. deterministic fixture/eval과 E2E도 함께 통과했다. 단일 47.4초 관측은 60초 guardrail 안이지만 P95 주장은 아니므로 반복 측정은 T21에 남긴다.
- **tradeoff:** 사용자가 전체 후보군을 보려면 한 번 더 선택해야 하고 상세 평가가 첫 화면에는 없으며 temporary slot 수가 늘어난다. 대신 첫 유용 결과와 되돌리기가 빨라지고, 상태는 Core에서 복원되며, transport 표현 오류와 의미 생성 실패를 분리할 수 있다. 첫 후보 품질과 model별 latency 비교는 동일 unseen fixture와 target 실측으로 계속 확인한다.

## 2026-09-03: T15 목록형 Discovery와 읽기 중심 Spec UI

- **상태:** 승인
- **맥락:** target 모바일 사용에서 2열 Candidate card는 8~10개 주제를 한눈에 비교하기 어렵고 작은 checkbox와 후보별 PIN/REJECT/SHRINK/EXPAND button이 선택의 위계를 흐렸다. 자유 조정 입력은 목록 아래에 있어 관심 후보를 고른 뒤 다시 의도를 표현하는 흐름과 떨어졌으며, Spec의 여러 작은 textbox는 초보 사용자에게 제품 범위를 이해하기보다 설계 문서를 직접 편집하도록 요구했다. 기존 짙은 녹색·serif 중심 styling도 Kiro 안의 앱으로서 일관성과 일상적인 제품 UI의 조작감이 부족했다.
- **결정:** 새 UI dependency를 추가하지 않고 SEED Design의 mobile-first list, semantic hierarchy, 큰 touch target과 명시적 selected state를 참고한다. Kiro의 대표 보라색 계열을 단일 brand token으로 사용하고 장식적인 serif·과도한 card nesting을 줄인다. Candidate는 한 열 목록과 24px check control로 보여주며 관심 후보를 local basket에 담는다. refinement composer와 선택 요약은 목록 위로 옮기고 SHRINK/EXPAND는 후보별 button 대신 placeholder 예시와 자연어 request로 제공한다. Spec은 direct edit form을 primary UI에서 제거하고 사용자·상황·성공의 story flow, MVP, 세 scope와 예상 Decision을 읽기 중심으로 시각화한다. 변경은 큰 자유 입력으로 Discovery Agent에 반복 요청하며 Core의 기존 direct update contract는 호환성을 위해 유지한다.
- **성능 목표:** 이번 UI 변경에서는 model/config를 바꾸지 않는다. 현재 설치 Agent가 `auto`이고 4개 후보 단일 관측이 47.4초이므로 무거운 특정 모델로 고정됐다고 단정하지 않는다. 다만 사용자 상호작용 turn은 각각 P95 30초 이내를 T15 완료 gate로 높이고 첫 유용 반응 3~5초를 지향한다. 동일 unseen 입력에서 `auto`와 승인된 빠른 model/config의 품질·latency를 비교하기 전에는 T15를 다시 완료 처리하지 않는다.
- **검토한 대안:** 기존 2열 card의 밀도만 낮춤, 모든 semantic feedback을 후보별 icon button으로 유지, Spec textarea 높이만 늘림, SEED React package와 styling pipeline을 즉시 도입, UI 변경과 동시에 model을 교체.
- **tradeoff:** SHRINK/EXPAND 같은 action의 발견성은 placeholder와 안내 문구에 의존하고 direct field-level 수정은 사라진다. 대신 첫 화면의 비교와 선택 책임이 명확해지고, 사용자는 세부 schema를 편집하지 않고 Agent와 대화하며 revision을 검토한다. SEED package 자체를 쓰지 않아 시각 원칙을 수동 검증해야 하지만 dependency·build 경계는 늘지 않는다.

## 2026-09-03: 선택 후보 refinement는 현재 목록을 좁힌다

- **상태:** 승인
- **맥락:** target에서 4개 중 2·3번을 checkbox로 담고 두 장점을 합쳐 달라고 요청했지만 다음 Round가 선택하지 않은 1·4번과 merge 결과를 함께 표시했다. Feedback target과 코멘트는 정확히 저장됐으나 기존 Core가 모든 unaffected Candidate 보존을 강제해, 관심 목록이 shortlist가 아니라 기존 목록에 결과를 추가하는 동작이 됐다. 또한 이전 10개 전체 생성에서 progressive 4개 starter로 바뀐 이유가 UI에 보이지 않아 데이터가 임의로 사라진 것처럼 느껴졌다.
- **결정:** target이 있는 `MERGE`, `REVISE`, `SHRINK`, `EXPAND`는 selection narrowing action이다. 다음 current Round에는 해당 결과와 같은 turn에서 명시적으로 pin된 Candidate만 포함하고, 선택하지 않은 이전 Candidate는 immutable revision/history에 보존하되 current 목록에서는 제외한다. 기존 목록을 유지해 넓히는 동작은 target 없는 명시적 `MORE`만 담당한다. prompt는 1.1.3으로 올리고 Core가 이 current-set 규칙을 deterministic하게 검증한다. 이미 old carry 규칙으로 저장된 narrowing Round는 UI projection에서 결과와 pin만 보여 다음 사용자 action 전에도 의도한 shortlist를 복원한다. 첫 Round 4개 우선 정책은 첫 응답 단축을 위해 유지하되 UI에서 빠른 첫 묶음과 8~10개까지 늘리는 action을 설명한다.
- **검토한 대안:** merge 결과를 기존 목록에 계속 추가, 담지 않은 Candidate에 자동 REJECT feedback 생성, 저장된 과거 Round 수정, 첫 Round를 다시 항상 10개로 복원.
- **tradeoff:** 한 번 좁힌 뒤 제외된 후보를 현재 목록에서 즉시 되살리는 별도 action은 없고 History 또는 새 후보 요청을 거쳐야 한다. 대신 checkbox basket과 결과 목록의 의미가 일치하고, historical provenance를 삭제하거나 소급 변경하지 않으며, `MORE`의 확장 의미와 refinement의 축소 의미가 분리된다.

## 2026-09-04: T15 Discovery는 Haiku와 ephemeral Core context를 우선 사용

- **상태:** 승인
- **맥락:** target `auto`의 첫 Candidate 4개는 47.4~50.9초, 첫 Spec은 47.5초로 T15 P95 30초 gate를 넘었다. 동일한 redacted unseen fixture의 Kiro CLI 2.21.0 live screening에서 `auto`는 Candidate를 41.6초에 저장했고 `claude-haiku-4.5`는 Candidate를 22.1초, Spec을 18.2초에 저장했다. `gpt-5.6-luna`는 Candidate field를 계약과 다른 이름으로 바꾸며 `submit_candidate_round`를 17회 재시도한 뒤 결과를 저장하지 못했다. Personal Need가 있는 두 번째 Haiku Candidate run은 36.4초였고 첫 round에서 생략해야 할 evaluation을 Candidate마다 8개씩 생성해 payload가 10.7KB로 증가했다. 모든 정상 저장에서 Core validation과 SQLite write는 밀리초 수준이었으며 매 turn 선행 `get_discovery_context` Agent 왕복은 약 9초였다.
- **결정:** T15 Discovery Crew Agent의 명시 model을 `claude-haiku-4.5`로 고정한다. App이 strict Core response로 이미 복원한 현재 aggregate를 current Round, current Candidate, pending user Feedback, selected Candidate와 current Spec만 남긴 bounded snapshot으로 만들고 app-owned temporary slot의 ephemeral context에 주입한다. snapshot의 session ID와 expected revision이 dispatch metadata와 일치하면 Agent는 정상 경로에서 `get_discovery_context`를 건너뛰고 바로 submit tool을 호출한다. context 주입 실패, 누락, ID/revision 불일치와 stale submit에서는 기존 read-only tool을 fallback으로 사용한다. Session/revision별 clean slot, Core optimistic revision, strict submit validation과 atomic Round/Spec 저장은 유지한다. 첫 screening에서 계약을 지키지 못한 Luna는 사용하지 않고 Terra 비교는 Haiku가 이후 품질 또는 P95 gate를 충족하지 못할 때만 수행한다.
- **검토한 대안:** `auto` 유지, Luna를 속도만 보고 채택, 과거처럼 한 slot transcript 재사용, Core validation 생략, context 조회 tool만 남기고 UI polling 최적화.
- **tradeoff:** Haiku는 hardest reasoning보다 짧은 구조화 Discovery 처리에 맞지만 Auto보다 의미 품질이 낮아질 수 있어 unseen fixture와 target 반복 측정이 필요하다. ephemeral context도 model input에는 포함되지만 별도 Agent 추론 왕복과 visible transcript 누적을 없앤다. Crew의 app context API를 사용할 수 없는 host에서는 fallback 조회 때문에 개선 폭이 줄어들며, 첫 round optional evaluation 과출력은 후속 phase-specific schema가 필요할 수 있다.

## 2026-09-04: T15 Discovery phase를 분리하고 MERGE metadata는 Core가 계산

- **상태:** 승인
- **맥락:** Haiku와 ephemeral context를 적용한 target 5회 측정에서 first Candidate와 first Spec의 보수적 P95는 각각 26.4초와 20.7초로 30초 gate를 통과했지만, 일반 `submit_candidate_round`로 전체 lineage를 다시 쓰는 MERGE는 한 번 52.7초까지 늘어 P95 gate를 넘었다. Candidate와 Spec이 한 Agent prompt/tool catalog에 같이 있고 MERGE Agent가 pending Feedback, parent reference, revision과 Round metadata까지 반복 생성하는 비용이 남아 있었다. 별도 Spec run에서는 Agent stream이 설명만 남기고 submit tool 없이 종료해 UI가 durable 결과를 오래 기다리는 실패도 확인했다.
- **결정:** canonical Discovery prompt는 v1.1.5 하나를 유지하되 build 시 ROUND·MERGE·SPEC의 bounded prompt와 Agent config로 분리한다. 각 Agent/MCP route는 `get_discovery_context`와 해당 phase의 submit tool만 허용한다. MERGE는 의미 Candidate 하나만 받는 `submit_candidate_merge`를 추가하고 role-bound adapter/Core가 pending user Feedback 하나, applied Feedback ID, parent revisions, Candidate revision과 Round metadata를 현재 durable context에서 계산한다. 일반 Round와 immutable lineage contract는 변경하지 않는다. Spec Agent는 설명보다 `submit_learning_spec`을 정확히 한 번 먼저 호출해야 하며, stream 종료 뒤 짧은 propagation grace에도 Core revision이 증가하지 않으면 UI는 장기 polling 대신 즉시 재시도 가능한 `TOOL_REJECTED` 상태를 표시한다.
- **검증:** target Kiro Crew 0.3.0에서 같은 redacted synthetic fixture를 최종 5회 실행했고 15개 phase 모두 ephemeral context가 주입되어 durable submit에 성공했다. nearest-rank P95는 first Candidate 26.564초, MERGE 21.044초, first Spec 22.900초였고 사용자 action부터 durable 결과까지도 26.582초, 21.066초, 22.919초였다. 실제 narrowed Candidate와 Spec의 strict contract, 두 parent lineage, 사람 Concept Necessity·scope review와 privacy-safe latency 배열을 v1.1.5 regression fixture로 고정했다.
- **검토한 대안:** 하나의 전체 Discovery Agent와 일반 Round schema 유지, Agent가 모든 stable metadata를 계속 생성, preview/staged Candidate 저장 계약 도입, 더 큰 모델로 교체, tool 없는 Spec 응답을 420초까지 polling.
- **tradeoff:** 설치 package에 세 Agent와 세 고정 MCP route가 생기지만 각 surface의 권한과 prompt 크기가 작아지고 MERGE 품질 책임과 stable metadata 책임이 분리된다. 5표본 P95는 T15 gate에 쓰는 보수적 회귀일 뿐 장기 분포를 대표하지 않으므로 T21에서 표본을 늘린다. 모든 구간이 30초 안이어서 preview/lazy enrichment 계약 변경은 하지 않으며 3~5초 first-useful 목표는 후속 metric으로 남긴다.

## 2026-09-04: T15 stale UI·실행 복원·Spec revision 보장

- **상태:** 승인
- **맥락:** 실제 사용자 재검증에서 업데이트 전에 열린 UI가 제거된 legacy Discovery Agent를 호출했고, 화면 이탈 뒤에는 실행 표시가 사라져 같은 Session이 처음부터 시작하는 것처럼 보였다. 기존 Spec 수정 두 번은 Agent가 설명만 반환하고 submit tool을 호출하지 않아 Core Spec revision이 1에 머물렀다. Crew slot의 긴 170초 관측은 model 추론만이 아니라 범용 file permission 대기까지 포함했다.
- **결정:** UI가 모든 Core 요청에 protocol v2를 보내고 backend는 불일치 요청을 Agent dispatch 전에 409로 차단한다. app version과 UI entry filename을 함께 올려 새로 연 화면이 갱신 bundle을 사용하게 한다. 화면 재진입 때 current Session/revision/phase에서 파생한 exact slot을 조회해 `running`이면 중복 dispatch 없이 Core polling만 복원하고, 완료됐지만 durable 결과가 없으면 저장 상태 기반 재시도 또는 수정문 재입력을 명시한다. prompt v1.1.6의 정상 SPEC Agent/MCP는 주입된 Core snapshot과 `submit_learning_spec`만 사용하고, context 주입이 불가능할 때만 별도 recovery Agent에 read tool을 노출한다. Spec stream이 tool 없이 정상 종료하면 최신 Core snapshot에서 같은 수정 의도를 한 번만 자동 재제출하며 두 번째 실패는 현재 revision을 유지한 오류로 표시한다. 성공은 Agent 문장이 아니라 durable Spec revision 증가로만 판정한다.
- **검증:** Chromium E2E에서 stale protocol 차단, 실행 중 slot 재진입과 중복 dispatch 0회, 첫 Spec revision 1, 정상 수정 revision 2, 첫 no-tool 뒤 bounded recovery revision 2를 검증했다. target raw Haiku 수정 2회 중 1회는 no-tool이었고 정상 수정은 23.384초에 revision 2를 저장했다. 같은 fixture에서 SPEC만 Terra는 첫 Spec 43.257초, Auto는 첫 Spec 39.240초·수정 36.027초로 30초를 넘겨 Haiku를 유지한다.
- **검토한 대안:** 구 UI의 실패를 일반 host 오류로 처리, 화면 재진입마다 새 Agent dispatch, project 단위 장기 slot 재사용, 정상 SPEC에도 context read tool 유지, 설명 응답을 수정 성공으로 표시, no-tool 종료를 420초 동안 계속 polling, Spec에 Terra 또는 Auto 사용.
- **tradeoff:** 네 번째 recovery Agent와 protocol 호환성 경계, Spec에 한정된 최대 1회 자동 재제출이 생긴다. 대신 stale 실행과 중복 요청을 빠르게 분리하고 Agent의 말과 durable 상태가 어긋나는 성공 표시를 막는다. 자동 복구가 필요한 예외 turn은 30초를 넘을 수 있고 first Candidate 49.310초 outlier도 관측됐으므로 T15 성능 gate는 완료 처리하지 않는다.

## 2026-09-04: T15 최종 사용자 승인과 MVP 재진입 경계

- **상태:** 승인
- **맥락:** 사용자는 T15 UI/UX 승인 테스트에서 Spec을 revision 2로 수정하고 Builder 화면까지 이동하는 실제 흐름을 이미 확인했다. 남은 항목으로 제시한 실행 중 화면 이탈·재진입 복원은 MVP에서 요구하지 않으며, 성능은 최종 설치본으로 한 번 더 확인한 뒤 승인 결과와 합쳐 종료하기로 했다.
- **결정:** 저장 완료된 Project/session/Task/Decision/Context의 durable 복원은 기존 T14 경계로 유지한다. 반면 진행 중 Agent stream과 progress를 화면 재진입 시 다시 연결하는 기능은 MVP acceptance에서 제외한다. 이미 구현된 exact-slot 조회와 중복 dispatch 방지는 방어 기능으로 남기지만 release 보장을 주장하지 않는다. T15 성능은 최종 v1.1.6·Haiku target 대표 실행 한 번에서 first Candidate, 단일 MERGE refinement와 첫 Spec이 각각 30초 이내이면 통과로 판정하고, 사용자의 UI/UX 및 Spec revision 2→Builder 승인을 최종 human acceptance로 사용한다. 장기 P95 표본은 T21에서 수집한다.
- **검토한 대안:** in-flight 재진입을 T15 blocker로 유지, 구현된 복원 기능 제거, 5회 이상을 다시 수행한 뒤에만 T15 종료, 49.310초 과거 outlier만으로 즉시 실패 확정.
- **tradeoff:** MVP는 앱 이탈 중 진행 표시의 연속성을 보장하지 않으며 단일 대표 성능 실행은 장기 tail latency를 증명하지 않는다. 대신 저장된 결과의 정합성과 핵심 Discovery→Spec→Builder 흐름에 완료 판단을 집중하고, 더 넓은 성능 분포는 T21 release 검증에서 다룬다.
- **재검증:** 최종 설치본의 대표 실행은 MERGE 13.226초, 첫 Spec 18.860초, Spec 수정 23.097초에 durable 저장됐고 수정 결과는 revision 2였다. first Candidate만 50.132초로 30초 gate를 넘었으므로 T15는 완료하지 않으며 잔여 범위는 첫 Candidate latency로 좁힌다.

## 2026-09-04: T15 First Candidate 대안 spike

- **상태:** 검토 완료, 제품 변경 미승인
- **맥락:** 사용자는 가능하면 상세 Candidate 10개를 유지하되 6개 축소, 설명 축소와 다른 구조까지 같은 target에서 비교하도록 승인했다. 현재 Haiku 4개 상세 baseline은 50.132초였다.
- **결과:** Haiku 10개 compact는 완전한 상세 필드와 고유 제목·상호작용 10개를 33.940초에 저장했지만 gate를 넘었다. Luna 6개 exact-envelope는 성공 시 14.420~16.063초였으나 4회 중 3회만 저장됐고 Luna 10개도 19.991초 성공 뒤 no-durable 실패가 재현됐다. Haiku 4개 ultra와 6개 compact는 잘못된 tool 표현 또는 envelope로 저장되지 않았다. initial-only 최소 prompt는 최대 70.837초였고 저장 실패도 남았다. Haiku 5×2 병렬은 첫 시도 두 batch가 22.727초·24.561초였지만 10개 중 4개 방향이 의미상 겹쳤으며, partition 지시 재시험은 한 batch가 저장되지 않았다. Luna+Haiku hedge도 두 호출 모두 저장되지 않아 43.194초에 실패했다.
- **판정:** 기존 single Round contract에서 개수, 설명량, prompt 길이와 model만 바꾸는 저위험안 중 latency와 durable reliability를 함께 충족한 것은 없다. production은 Haiku v1.1.6으로 복원했고 어떤 실험 variant도 채택하지 않는다.
- **권장 Decision Request:** 10개 lightweight preview를 작은 초기 contract로 먼저 저장하고, 그 10개 identity를 고정한 뒤 상세 필드를 background enrichment하는 계약을 다음 구현안으로 제안한다. 선택된 preview를 우선 상세화하고 Spec은 해당 Candidate의 complete revision 뒤에만 허용한다. 독립 batch가 새 후보를 다시 발명하지 않아 parallel spike의 중복을 피한다.
- **tradeoff:** 사용자는 10개 제목·핵심 방향을 먼저 볼 수 있고 전체 상세도 결국 받지만 일부 행은 잠시 loading 상태가 된다. Candidate preview 상태, staging/finalize transaction, enrichment 실패·재시도와 UI projection이 새로 필요하며 이 구조 자체의 latency는 아직 직접 측정하지 않았다. 따라서 사용자 승인과 contract 문서 변경 전에는 구현하지 않는다.

## 2026-08-24: 구현 세부 선택 위임

- **상태:** 승인
- **맥락:** 사용자는 제품 방향과 기본 기술안을 승인했고, 호환성에 좌우되는 세부 library와 실험 수치는 구현 과정에서 근거를 남겨 선택하도록 위임했다.
- **결정:** package manager와 local-first MVP 경계는 승인한다. runtime schema·SQLite/migration library는 T02, Code 중심 최소 surface는 T01, eval reviewer/fixture는 T07, pilot 규모는 T23에서 Agent가 비교 근거와 결과를 결정 기록에 남긴다. 사용자 연구는 명시적 동의, secret redaction, local 저장과 익명화 결과만 평가·제출에 사용하는 원칙을 지킨다.
- **검토한 대안:** 구현자가 묵시적으로 선택, 모든 선택을 지금 고정, 라이브러리 선택을 제품 Spec에 포함.
- **tradeoff:** 짧은 승인 단계가 추가되지만 추론한 가정을 확정 요구로 오인하는 것을 막는다.
