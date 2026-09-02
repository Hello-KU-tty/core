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

## 2026-08-24: 구현 세부 선택 위임

- **상태:** 승인
- **맥락:** 사용자는 제품 방향과 기본 기술안을 승인했고, 호환성에 좌우되는 세부 library와 실험 수치는 구현 과정에서 근거를 남겨 선택하도록 위임했다.
- **결정:** package manager와 local-first MVP 경계는 승인한다. runtime schema·SQLite/migration library는 T02, Code 중심 최소 surface는 T01, eval reviewer/fixture는 T07, pilot 규모는 T23에서 Agent가 비교 근거와 결과를 결정 기록에 남긴다. 사용자 연구는 명시적 동의, secret redaction, local 저장과 익명화 결과만 평가·제출에 사용하는 원칙을 지킨다.
- **검토한 대안:** 구현자가 묵시적으로 선택, 모든 선택을 지금 고정, 라이브러리 선택을 제품 Spec에 포함.
- **tradeoff:** 짧은 승인 단계가 추가되지만 추론한 가정을 확정 요구로 오인하는 것을 막는다.
