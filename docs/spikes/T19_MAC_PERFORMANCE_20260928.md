# T19 맥 백엔드 성능 개선 — 2026-09-28

아래 실행 경계와 진행 순서는 시작 당시의 기록이다. 최종 종료·채택 결과는 하단09:50 절과 [최종 인계](T19_MAC_PERFORMANCE_HANDOFF_20260928.md), Git 전달은 [Windows 재개 지침](../WINDOWS_RESUME_20260928.md)을 따른다.

## 실행 경계

- 상태: 진행 중. 사용자 승인 Goal, backend만 수정.
- 시작: 2026-09-28 01:31:45 KST.
- 종료: 2026-09-28 09:00 KST (`2026-09-28T00:00:00Z`). Goal 문구의 다음 도래 오전 9시 조건을 실제 clock에 적용한 확정 시각이다.
- backend 기준: `04117c520c10e732af709b0d064c020d1d001e55`, `codex/windows-extension-runtime-20260923`.
- frontend 기준: `Hello-KU-tty/program` main `cce7751dcd40732c700f5576a088ebdf6f91fac7` (시작 시 읽기 전용 확인).
- 환경: Darwin arm64, Kiro 1.0.437 / Agent 1.0.794 / API 1.109.5, Node 24.19.0, pnpm 11.12.0.
- 설치 metadata gate, SQLite 13.0.3 메모리 transaction/integrity, TypeScript/esbuild load와 preflight PASS. 최신 backend build PASS. 실제 native baseline을 진행 중이다.
- 기존 untracked 실험 파일, runtime DB/생성 앱, 일반 Kiro profile은 보존한다. 새 합성 root의 사용자 입력은 실제 사람 학습 증거가 아니다.

## 크레딧

시작 대시보드: **756.89 used / 1,000 covered in plan**, overages disabled. 표시에는 갱신 지연이 있으므로 정확한 실시간 청구값으로 간주하지 않는다.

사용자가 **계정 누적 사용량 900크레딧** 상한임을 확인했다. 초기 여유는 143.11이다. 갱신 지연을 고려해 우선 누적 880을 모델 호출 중단선으로 두고 20크레딧 여유를 남긴다. 반복 실행은 작은 묶음으로 제한하고 매 묶음 뒤 사용량을 확인한다. 무관한 계정 사용이 섞일 수 있으므로 계정 증가량과 이 실험 호출 수를 별도로 기록한다. 소비량을 확인할 수 없거나 잔여 여유가 불확실하면 새 모델 호출을 중단하고 로컬 검사·분석·인계 작업을 진행한다.

## 평가 방법

1. 프론트의 Discovery/Spec controller·port 및 Builder/Helper managed port가 보내는 실제 요청과 terminal/durable 판정을 확인한다.
2. 최신 빌드와 기존 자동 검증으로 환경 문제와 제품 실패를 구분한다.
3. 새 합성 Project에서 Preview 10개 → selected enrichment → SELECT → Spec 초안/수정/확정 → Task를 실제 native로 측정한다. 이어 Builder/Helper와 관련 Core 상태를 범위 내에서 검증한다.
4. 지표: 요청 접수, worker 준비, 첫 redacted 응답, 첫 durable 결과, terminal, 실패/재시도, 모델 호출 수, 출력/컨텍스트 크기와 관측 가능한 크레딧. 성공한 표본만 골라 보고하지 않는다.
5. 한 번에 구분 가능한 가설을 적용하고 같은 입력의 baseline/variant를 반복 비교한다. 입력·모델·설치 버전·prompt version·실행 순서를 기록한다. 준비/캐시와 모델 변동을 코드 개선으로 오인하지 않는다.
6. 조정에 쓰지 않은 unseen goal과 Personal Need 양쪽을 별도 검증한다. 속도와 Candidate 다양성/기술 필요성/Spec 정합성/Helper 근거·Evidence 오류를 함께 검토한다. 의미 평가자는 AI이며 사람 검토로 기록하지 않는다.
7. protocol·revision·취소·중복 방지·redaction·권한·provenance가 깨지는 변경은 채택하지 않는다. 변경 범위의 회귀와 마지막 `pnpm check`를 실행한다.

## 진행 순서

- [~] 기준 환경·프론트 요청·평가 경로와 예산 확인.
- [ ] baseline 실측과 병목 분해.
- [ ] 작은 개선 실험과 반복 비교.
- [ ] unseen 회귀와 최종 검증.
- [ ] 전후 결과·미해결 사항·Windows 실행 가이드 정리.

## 실험 결과

### 기준 자동 검증

- `pnpm check`: format/lint/typecheck/db/build PASS, unit 110 PASS + 3 SKIP, integration 300 PASS + 8 SKIP, Agent eval 35 PASS, Campus Drop 3 PASS, smoke 6 PASS.
- E2E는 테스트 시작 전 기존 4173 listener와 충돌해 중단했다. 전체 check PASS로 간주하지 않는다. 기존 서버를 종료하거나 재사용해 결과를 섞지 않는다.
- `VIBE_E2E_FRONTEND_PORT=4183` 지원을 추가해 기존 서버를 보존했다. sandbox의 Chromium Mach port 제약은 테스트 실행 권한 검토 후 재실행하여 해결했고, E2E 12/12 PASS (54.3초). 전역 브라우저 설정이나 개인 프로필은 변경하지 않았다.
- frontend 최신 main의 `npm test`: 49 files / 537 tests PASS. `scripts/test-program-consumer.mjs` 실제 controller/port + 인증 HTTP/SSE + SQLite/Core 경계 PASS (Agent는 명시적 deterministic fixture, 모델 실측 아님).
- 새 baseline Core는 private temporary root에서 준비했다. 로컬 평가 확장을 새 Kiro 개발 창에서 실행하는 단계는 자동 보안 검토가 action-time 명시적 승인을 요구하여 보류했다. 사용자에게 확장 실행과 해당 창에서만 기존 패널 비활성화에 대한 승인을 요청했다. 승인 전 우회 실행·새 모델 호출은 하지 않는다.
- 02:00 KST경 사용자가 **분리된 개발 창에서 로컬 평가 확장 실행**을 명시적으로 승인했다. 동일한 제한된 실행을 재개한다.

기존 Windows/맥 결과는 참고 근거이며 이번 baseline으로 대체하지 않는다. 02:00 개발 창 사용량은 756.89로 재확인했고, 승인된 합성 workspace 하나만 trust했다(상위 폴더 trust는 선택하지 않음). 새 Native PREVIEW 1개 실측을 시작했다.

### Native 환경 복구와 baseline

- 첫 PREVIEW: 15.177초, `NATIVE_ROLE_MODE_UNAVAILABLE`, 모델 prompt 전 실패. 최초 `.kiro/agents` 생성 뒤 해당 개발 창만 reload했다. 기존 기록에도 이 최초 hot-load 제한이 있었다.
- 두 번째: 9.511초, `AGENT_RESULT_NOT_STORED`, Haiku 1 turn. role 선택은 됐으나 MCP catalog가 0개였다. 실패도 비용/성공률 집계에 포함한다.
- 원인 재현: 실제 Mac packaged bridge를 인자 없이 실행하면 scope guard 이전에 `Dynamic require of "node:child_process" is not supported`로 종료됐다. Windows portability helper의 CJS builtin require가 Mac ESM bundle에서 동작하지 않았다. Windows bundler에는 이미 `createRequire` banner가 있었으나 Mac에는 누락되어 있었다.
- 수정: Mac bridge에도 동등한 ESM/CJS builtin 연결을 추가하고, 빌드 시 실제 산출물을 credential/인자 없이 시작하여 **정확히 `BRIDGE_SCOPE_REQUIRED`로 종료하는지** 검사한다. 모델·네트워크 호출이나 권한 완화는 없다. 수정 후 `pnpm panel:build` PASS. 개발 창만 reload했다.
- 02:11 계정 표시: **756.97**, 새로 갱신된 값. 초기 대비 +0.08이며 별도 계정 활동/갱신 지연 가능성은 유지한다.
- 세 번째 PREVIEW: **30.609초, SUCCEEDED / DURABLE_RESULT**, 후보 10개 저장 확인. 첫 TEXT 5.083초, bridge submit 성공. 모델 시작 뒤 340ms경에 도구 catalog가 도착했고, 허용하지 않은 도구 요청 1개는 거부됐다. 다음 개선 후보는 model prompt 전에 catalog 준비를 확인하는 Mac gate다.
- PREVIEW 내용 AI 검토: Personal Need 직접 후보 + 다른 도메인 후보가 함께 생성됨. 일부 설명이 “런타임 버그가 사라짐/원천 차단”처럼 타입 시스템 효력을 과장하여 품질 개선 대상으로 기록한다. 단순 transport PASS와 의미 품질 PASS를 혼동하지 않는다.
- 측정 동안 Core 프로세스는 최적화 이전 Application을 메모리에 유지한다. Mac packaging 복구만 공통 적용한 뒤 baseline을 측정하므로, 이후 비교는 “원본 패키지 전체” 대비가 아니다.
- 첫 SELECT/JIT: 23.106초, `AGENT_RESULT_NOT_STORED`. Agent의 자체 설명은 상세화 tool이 없었다고 보고했고, 실제 catalog도 prompt 시작보다 309ms 늦었다. 이 인과관계는 한 번의 실패/재시도에서 관측한 것으로, 전체 실패 원인을 모두 설명한다고 주장하지 않는다.
- Mac에도 pinned 1.0.794의 catalog readiness gate를 적용했다. 빈 catalog, foreign session, malformed tag와 허용 밖 builtin을 모델 시작 전에 거절하는 신규 테스트 5개 포함 native-client 51 PASS + 1 SKIP.
- 같은 후보의 JIT 재시도: **18.352초 PASS**, 도구 준비가 model 시작보다 먼저 확인됨. 상세 입력 schema 오류 1회 후 Agent가 수정해 제출했으므로 one-shot 성공으로 집계하지 않는다.
- 이어 SPEC 초안 **14.980초 PASS**, SPEC 수정 **16.414초 PASS**, Core 사용자 확정 **31.7ms**, Task 준비 **38.0ms**. 실제 frontend port SELECT는 SPEC을 자동 호출하지 않고 분리된 SPEC 요청 1개만 보냈다. 저장된 Task PENDING rev1과 Spec CONFIRMED rev3까지 별도 read-back 확인.
- 개인적 필요 없는 AbortController 목표: PREVIEW **22.794초 PASS**, 도구 제출 1회. 의미 검토는 별개다. 파일 검색·이미지 처리 등 실용 방향도 있지만 작업 큐/동시성 풀/재시도 관리자 등 기술 기능을 제품처럼 제안한 후보와 자원 정리를 자동 보장한다고 과장한 문장이 보여 품질 개선 대상으로 남는다.
- 02:20 KST 이후 실제 `ManagedAgentPort`로 Builder 시작. 보호 Helper/Analyst 사전 준비와 Builder catalog(7 MCP + read/write/shell) gate 통과. 모델 실행·생성물 검증은 진행 중.
- 02:20 계정 표시 **757.93** (처음 대비 +1.04, 지연 가능).

### 실험 1 — Discovery 복원의 Evidence 과잉 조회

- 변경: 내부 storage port에 `readRecentConceptLedgers(limit)`를 추가했다. Ledger만 필요한 경로에서 전체 Evidence/audit history를 재구성하지 않는다. 개인화 basis는 기존 최근 100개 순서를 유지하면서 유효한 5개가 모이면 멈춘다. hash/schema 검증, provenance, user Evidence 조건, delivery trace 기록 시점은 유지한다. Agent tool과 HTTP protocol 변경은 없다.
- 기준: 원본 `04117c5` Application source와 변경 Application을 **같은 현재 SQLite adapter/DB**에 붙인 번갈아 실행 비교. 각 조건 warmup 5회 + 측정 30회. 원본 전체 바이너리 A/B나 모델 실측이 아니다. 반환 snapshot은 모든 표본에서 deep equality PASS.
- 합성 이력 100개 / delivery 이전: 중앙값 43.139 → 4.103ms, P95 82.787 → 8.108ms, SQL prepare 2,421 → 101.
- 합성 이력 100개 / delivery 이후: 중앙값 12.430 → 1.663ms, P95 28.526 → 4.749ms, SQL prepare 820 → 20.
- 이력 0개는 중앙값 약 0.3ms로 실질 차이가 없다. 이 결과를 모델 응답 지연 감소로 확대 해석하지 않는다.
- 재현: `node scripts/benchmark-core-context.mjs REPORT.json 0,10,100 04117c520c10e732af709b0d064c020d1d001e55` (먼저 pinned Node로 typecheck/build).
- 회귀: application/storage/runtime 대상 57 PASS + 8 SKIP. 신규 Discovery bounded-read 두 테스트 PASS. 최초 비결정적 ID hash 보고서는 비교 증거로 사용하지 않으며, paired v1부터 고정 ID와 동일 응답 비교를 사용한다.
- 현재 상태: 채택 후보, 더 큰 이력·관련 Evidence가 없는 경우·저장 무결성 경계와 최종 전체 회귀를 추가 확인한다.

### 실험 2 — 요청 내 Helper 근거 재사용

- 이미 같은 요청에서 검증한 최근 Evidence를 Helper 개인화와 Ledger 구성에 재사용한다. 범위 밖의 오래된 Task 근거는 기존 scoped read를 유지한다. source Project 조회도 한 요청의 동기 실행 안에서만 중복 제거한다. 다음 요청에는 새 Project revision을 다시 읽으며 영속 cache는 없다.
- v2 paired benchmark는 **동일 fixture의 독립 SQLite DB 두 개**를 사용해 새 Helper turn의 trace 저장이 상대 구현에 영향을 주지 않게 한다. 호출 순서를 교대로 바꾸고 각 응답 전체 deep equality를 검증한다.
- 이력 100개 / 새 Helper turn: 중앙값 32.119 → 14.958ms, P95 61.939 → 21.733ms, SQL prepare 1,852 → 915.
- 같은 source Project의 중복 제거를 함께 적용한 Discovery delivery 전: 중앙값 43.168 → 3.154ms, SQL prepare 2,421 → 69. delivery 후: 11.785 → 1.602ms, 820 → 20.
- 경계 검증: 최신 100개 순서/limit, Ledger hash 손상 거절, 현재 Project Evidence 제외, delivery 전 read-only, 요청 사이 Project revision 갱신, cache가 지난 응답을 바꾸지 않음 PASS.
- 현재 변경 상태의 전체 `VIBE_E2E_FRONTEND_PORT=4183 pnpm check` PASS: unit 110 + 3 SKIP, integration 306 + 8 SKIP, eval 35, Campus Drop 3, smoke 6, E2E 12. Native 패널 별도 Node tests 108 + 2 SKIP PASS. 실제 program consumer 재실행 PASS(모델 boundary는 fixture).

### 실제 Builder/Helper와 프론트 재개 계약

- Builder 첫 turn: 119.372초, `SUCCEEDED / TURN_ENDED`, Task는 아직 ACTIVE. 실제 상태 모델 Decision을 요청하고 독립 작업을 수행했다. pending Decision 조회가 4회 발생해 반복 대기 비용 개선 대상으로 기록한다. turn 종료와 제품 완성을 구분한다.
- 같은 Builder 실행 중 Helper: 34.499초, 첫 TEXT 6.53초, `HELPER_RECORDED`. 실제 코드가 아직 제공되지 않았음을 명시하고 일반 설명을 실제 코드 인용과 구분했다. 보호 Helper/Analyst는 tool-less 경계를 유지했다.
- 테스트 harness가 추천 상태 모델을 **합성 UI 선택**으로 확정했다. 실제 Helper 호출이 있어 `helperUsed=true`, 사용자 rationale은 생략했다. 이 선택은 사람의 학습 성과가 아니다.
- 최신 program `AgentSurfaceController.resumeAfterDecision()`가 보내는 `message: ""`를 backend SDK 계약이 거절하는 문제를 재현했다(14.26ms, 모델 미호출). Builder만 빈 문자열을 허용하고, Helper/Discovery·revision·binding·idempotency·권한은 유지했다. host 지시는 추가 사용자 메시지가 없다는 사실만 전달하며 사용자 발언을 만들지 않는다.
- contracts/SDK/HTTP 회귀 9개 PASS. `test-program-consumer.mjs`에 실제 program controller → ManagedAgentPort → SDK → HTTP/SSE/Core의 빈 메시지 재개를 추가했다. 명시적인 fixture Agent에서 Builder 호출 정확히 1회와 `TURN_ENDED`를 확인했으며 Task 완료를 조작하지 않는다.
- 02:28 KST경 소유한 실험 Core만 정상 종료·재시작해 최신 Application과 계약을 로드했다. 기존 SQLite 합성 Task/Decision은 유지하고 다른 서버는 건드리지 않았다.
- 수정 뒤 실제 빈 메시지 재개: **327.627초 PASS**, Decision apply 1회 및 durable Task **COMPLETED** 확인. Agent는 typecheck/build, 17개 테스트와 실제 HTTP smoke를 수행했다. shell/unknown tool 거절도 그대로 기록하고 guard는 완화하지 않았다.
- 생성물 AI 검토: 판별 유니온의 상태별 필드와 exhaustiveness는 구현됐지만 `transition(state: EquipmentState, action: EquipmentAction)`가 모든 상태/행동 조합을 타입으로 제한하는 것은 아니다. 일부 주석의 “불가능 전이를 compile-time 차단” 주장은 과장이다. 실제 런타임 전이는 guard로 거절한다. 실행 PASS를 의미 정확성 PASS로 확대하지 않는다.
- read-back Evidence: 구현된 개념 5개는 `OBSERVED`만 기록됐다. 추천 클릭에 대해 Analyst가 잘못 제안한 상태 지지 3개는 Core가 전부 `INSUFFICIENT_EVIDENCE`로 거절했다(사용자 rationale 없음). Helper 질문과 Build 완료 Episode는 빈 Evidence였다. 승격 방어는 PASS지만 Analyst의 불필요한/잘못된 제안은 품질·비용 개선 대상으로 남는다.
- 최신 전체 check PASS: unit **115 + 3 SKIP**, integration **310 + 8 SKIP**, eval 35, Campus Drop 3, smoke 6, E2E 12. 이후 확장한 실제 program consumer도 별도 PASS.
- 사용량: 02:29 표시 **760.56**, 02:42경 계정 대시보드 새 조회 **766.68**. 갱신 지연을 포함한 계정 표시이며 호출별 정산값이 아니다.

### 실험 3 — Enrichment 오류의 안전한 구조 진단

- 앞선 18.352초 JIT의 첫 제출 실패를 소유한 합성 session에서 필드 구조만 검사했다. `candidates[0]` 안의 `__tool_use_purpose`가 strict schema의 unknown key로 거절된 뒤 5.8초 후 수정 제출됐다. 실제 의미 입력·세션 원문을 repository에 복사하지 않는다.
- bridge가 기존에는 오류 코드만 전달했다. 이제 오류 코드는 유지하면서 schema가 소유한 필드명·배열 위치·issue code·unknown key 개수만 최대 8건 반환한다. 값·임의 필드명·Zod 자유 메시지는 반환하지 않는다. nested transport metadata는 여전히 거절하며 자동 제거하거나 Core schema를 완화하지 않는다.
- 모델이 tool 오류를 수정할 수 있도록 MCP `isError: true` 결과로 전달한다. 성공으로 바꾸지 않고 Core mutation도 호출하지 않는다. forged diagnostic·민감 값·임의 예외·크기 제한·불변 필드·binding·replay 회귀를 포함해 bridge 관련 16개 PASS. 실제 재시도 감소는 아직 미측정이다.

### 비교 기준 2와 Completion 운송 실패

- 같은 판별 유니온 + Personal Need 입력의 새 Project: PREVIEW **25.863초**, SELECT/JIT **13.284초**, SPEC **18.893초**, 수정 **18.823초**, 사용자 확정 33.8ms, Task 준비 36.7ms. 모두 durable 결과 PASS. JIT는 제출 1회였다. 아직 full Discovery v1.3.5 prompt이고 모델 변동·workspace 전환이 포함되므로 첫 결과 대비 개선으로 보지 않는다.
- Builder v1.3.8: **423.936초, SUCCEEDED/TURN_ENDED지만 Task ACTIVE**. 이번 Spec에는 상태 모델이 이미 구체적이라 새 Decision 없이 구현했다. 이전 Decision 요청 turn과 같은 성격의 latency 표본이 아니다.
- 두 생성물 모두 `node --test`가 source도 발견하는 문제를 수정하는 추가 작업이 필요했다. 두 번째는 `@types/node` 누락도 첫 build 후 수정했다.
- 두 번째 Builder의 `complete_task` 4회는 모두 `BRIDGE_ENVELOPE_JSON_INVALID`로 Core 전 거절됐다. 소유한 합성 Kiro session의 도착 입력을 검사하니 네 입력 모두 바깥 `}` 하나가 부족했다. 진단용 복사본에만 `}`를 붙였을 때 기존 contract shape가 통과했으며, **그 복사본을 제출하거나 완료 상태를 수정하지 않았다**. 모델 작성과 pinned transport 중 어디서 누락됐는지는 아직 구분하지 못했다.
- JSON envelope 오류도 MCP `isError: true`로 전달하면서 고정 `INCOMPLETE_JSON`/`INVALID_JSON_SYNTAX`, bounded 문자 offset과 고정 복구 지침을 붙인다. parser 자유 메시지·본문·임의 필드명은 내보내지 않고 자동 보정도 하지 않는다. bridge 18개 회귀 PASS. 같은 오류 반복 비용 감소는 후속 실측으로 확인한다.

### 실험 후보 — Discovery v1.3.6 / Builder v1.3.9

- Discovery canonical 의미 규칙은 v1.3.5와 동일하며 native host의 단계별 전달을 v1.3.6으로 추적한다. 순수 composer가 canonical section 순서·누락·중복·새 section을 검증한다. 해당 phase, 공통 안전·provenance·개인화·표현 규칙만 추출하며 새 instruction을 만들지 않는다.
- 역할 prompt 문자 수: 전체 12,642 → PREVIEW 4,361, ENRICHMENT 3,892, ROUND 6,618, MERGE 3,965, SPEC 4,645, SPEC_RECOVERY 4,156. Core와 packaged host가 동일 composer로 exact prompt를 비교하며 Windows 경로는 검증만 하고 role file을 덮어쓰지 않는다. 이는 문자 수 감소이지 청구 token/응답시간/품질 개선 확정치가 아니다.
- 기계적 phase fixture/eval, CRLF, missing/foreign section, common rule 보존, Core relay, Mac/Windows branch의 foreign/full prompt 거절 검증 PASS. Windows native 실제 실행 PASS는 아니다.
- Builder v1.3.9는 pending Decision 한 번 조회 후 독립 작업을 마치고 turn을 종료하도록 명확히 한다. Task 완료·선택 자동 수락과 구분하며 다음 명시적 재개 때 durable Resolution을 읽는다. 컴파일된 테스트 대상·Node 타입 의존성을 처음부터 지정하고 정적 보장과 런타임 검증을 구분하도록 추가했다. 기존 guard·실제 test·완료 기준은 유지한다.
- 두 prompt의 신규 기계적 fixture를 추가했다. Builder adapter와 eval 45개 PASS. **실제 variant 결과는 아직 대기**이며 fixture 검사를 의미 품질 평가로 대신하지 않는다.
- 03:00경 terminal/Analysis idle을 확인하고 실험 Core만 다시 시작했다. 생성 앱·Task ACTIVE·원본 실패 보고는 보존한다. 실행 중 사용자 창이나 전역 설정은 변경하지 않았다.

### 중간 실측 판정 — 단계 분리 Trial A는 미채택

- 완료 보고 실패 Project의 명시적 빈 메시지 재개는 Builder v1.3.9에서 **94.639초**, complete_task 1회·추가 transport 거절 0회로 Task COMPLETED. 새 turn에서 다시 검증하고 정상 보고를 직접 제출했다. 오류 진단이 발동하지 않은 성공이므로 이것만으로 진단 개선의 인과 효과를 주장하지 않는다.
- 실제 stdio bridge child ↔ HTTP MCP ↔ Core integration에서 malformed Completion JSON을 `isError`로 받고 상태가 전후 동일함을 확인했다. 같은 연결의 정상 읽기와 descriptor revoke 거절도 PASS.
- Discovery 단계 분리 Trial A(phase 규칙 뒤에 일반 표현/개인화 규칙 배치): 새 union Preview **70.375초**(11개 거절 후 재제출), 두 번째 **37.294초**(제출 1회). 카드 50개 문장 필드 중 prompt 길이 초과는 **45개/41개**였다. 원본 표본은 **30개/0개**, no-Personal-Need 원본은 1개였다. 이는 Core schema 위반 수가 아니라 더 엄격한 prompt 길이 지침의 UTF-16 길이 검사다.
- Trial A 선택 상세화 **25.421초**, JSON envelope 오류 1회 후 수정. SPEC **51.867초**, 첫 SPEC은 저장 없이 끝나 기존 bounded SPEC_RECOVERY가 실행됐다. recovery 중 `INCOMPLETE_JSON` 1회 이후 재제출 성공. 첫 실패/자동 recovery도 전체 지연에 포함한다.
- 입력 문자 수는 줄었지만 출력 증가·재시도·SPEC recovery가 늘어난 이 구성은 **그대로 채택하지 않는다**. 다음 Trial B는 같은 canonical v1.3.6에서 공통 규칙을 앞에, 해당 phase의 정확한 수·길이·제출 지침을 맨 끝에 배치한다. 아직 미출하 prompt iteration이며 실제 role prompt SHA-256으로 Trial A/B를 구분한다. 문자 수는 같고 의미 문구를 추가·삭제하지 않는다. 그 뒤 반복 및 unseen 평가로 최종 선택한다.
- 03:02 새 계정 사용량 **775.12**. 실험 초기 대비 +18.23이나 계정 표시 지연과 다른 사용 가능성을 유지한다.
- phase 작업으로 standalone personalization matrix의 exact canonical version gate가 기존 1.3.5에서 실패한 회귀 3건을 발견했다. gate를 현재 1.3.6으로 명시적으로 갱신하고 metadata에 `FULL_CANONICAL_STANDALONE`을 기록해 native 단계 prompt 측정과 혼동하지 않게 했다. 과거 결과는 덮어쓰지 않았으며 wrong-version model-0 거절 검사 포함 패널 tests **110 PASS + 2 SKIP**.

### 03:18 KST 사용자 요청 일시정지

Trial B PREVIEW는 26.262초/길이 지침 초과 34/50, SELECT는 11.869초/오류 0이었다. 단일 지연 개선만으로 품질 회귀를 정당화할 수 없어 Discovery 단계별 축소안은 미채택 판정했다. 현재 작업 트리에 남은 실험 배선은 재개 후 full canonical로 복귀해야 한다. Builder v1.3.9의 fresh build 평가도 미완료다.

화면 제어 자동 보안 검토가 Codex 로그인 변경/만료로 실패하자 새 유료 호출을 중단했다. 사용자가 Codex 재시작을 위해 마무리·일시정지를 요청했고, 모든 runner 종료 후 소유한 실험 Core의 STOPPED/exit 0을 확인했다. 기존 창/데이터/서버는 변경하지 않았다. 상세 재개 절차와 미채택 diff 주의사항은 [재개 체크포인트](T19_MAC_PERFORMANCE_RESUME_20260928.md)에 남겼다. 마지막 사용량 표시 776.64는 현재 사용량의 대체값이 아니다.

### 03:21 KST 재개와 미채택 실험 분리

- 사용자 재개 후 Goal `active`와 화면 제어 복구 확인. 03:23 계정 새 조회 **778.49**, 03:35 새 조회 **781.81**. 상한/중단선은 그대로다.
- Discovery는 canonical v1.3.5 full prompt로 복귀했다. 기각 composer/fixture/test는 `docs/spikes/t19-phase-prompt-rejected/`에 격리하고 product import/export를 제거했다. 실제 새 PREVIEW가 full prompt 12,642자, SHA-256 `d3af4d4906a22e79225055668d500a2fd6303ea31ca35cf38cf9925dcc3d2c9d`를 사용한 것도 확인했다. 관련 패키지/relay/eval 53 PASS, bridge/panel 31 PASS.
- 최신 frontend main은 `73b57e2fe6a891b00e42088aed8d9fb7c9a36c36`. 기존 측정 clone `cce7751...`과 GitHub compare 결과는 package.json 확장 version **0.0.2→0.0.3 한 줄**뿐이다. 따라서 측정에 쓰인 controller/adapter/vendor 요청 source는 최신 main과 같다. 프론트 저장소는 수정하지 않았다.
- 최신 `pnpm check`는 E2E까지 진행했으나 sandbox Chromium Mach-port 시작 제약으로 12개가 시작 전에 실패했다. 권한 검토 후 4183에서 `pnpm test:e2e`를 다시 실행하여 **12/12 PASS, 53.9초**. 실제 program consumer도 모든 계약 검사 PASS. 전체 check 단일 실행 PASS로 표시하지 않는다.

### unseen Map/Set + Personal Need 실제 흐름

- 새 Project `project_b4a1f653-c530-42b0-af05-8465dad13d4d`: PREVIEW **22.930초**, SELECT **16.456초**, SPEC **17.352초**, 수정 **19.304초**, 확정 62.4ms, Task 준비 40.9ms. 실제 frontend port와 native Core를 거쳐 durable 저장.
- baseline full prompt도 명단/참가자 범주에 후보 10개가 몰리는 의미 품질 한계가 관측됐다. 짧은 응답 시간과 정확한 개수만으로 다양성 PASS를 주장하지 않는다.
- Builder v1.3.9 첫 turn **165.944초, TURN_ENDED / Task ACTIVE**. 참가자 동일성 기준(이름 정규화/ID+이름/정확 일치)의 실제 제품 Decision을 요청했다. `get_decision_result` **1회** 후 독립적인 package/tsconfig/UI만 만들고 핵심 비교 로직·API·test는 사용자 선택 전 구현하지 않았다. 이 표본에서 bounded waiting 준수는 관측됐지만 다른 Spec의 이전 119초와 직접 속도 A/B로 비교하지 않는다.
- 초기 package부터 `@types/node`를 선언하고 test target은 `dist/test`로 지정했다. 실제 build/test PASS는 아직 후속 재개 결과를 봐야 한다.
- Helper **27.675초 PASS**. 코드가 없는 Set/Map 비교 로직을 구현됐다고 주장하지 않고 실제 UI code와 앞으로의 원리를 구분했다. Helper Episode의 Analyst 결과는 빈 Evidence였다.
- 03:35:46 합성 UI 추천 선택을 SDK factory로 기록했다. 실제 Helper 사용 `true`, 사용자 rationale은 **없음**. 선택 후 Builder run이 자동 생성되지 않음을 확인한 뒤 별도 빈 메시지 재개를 시작했다. Analyst가 추천 클릭에 대해 낸 Proposal 1개는 Core가 거절, accepted 0. 이 반복 문제는 여전히 Analyst 품질 개선 대상이다.

### 실험 4 — Helper의 관련 없는 이력 복원 지연

- 최근 100개 Ledger와 **최신 Canonical Concept head**만 먼저 읽어 이름/alias relevance를 계산한다. lexical basis에 필요한 full Evidence만 읽고 5개 유효 basis에서 중단한다. 직접 연결된 Task·선행 Task의 기존 10개 조회/우선순위는 그대로 유지한다.
- 요청 내 trace cache는 선택한 lexical/Task basis의 read-back만 재사용하고 다음 요청에는 유지하지 않는다. 기존 personalization trace를 재사용할 때도 필요한 basis를 다시 검증한다. Ledger의 내장 Concept보다 최신 Canonical 이름이 있을 수 있어 그 head를 별도로 hash/schema 검증한 뒤 사용한다.
- paired v3: 구 Application `04117c5` + 현재 SQLite adapter와 변경 Application을 독립 DB에서 교대 30회. 반환 전체 deep equality PASS. 100개 합성 이력에서 새 Helper context 중앙값 **29.422→6.717ms**, SQL prepare **1,852→239**. 이전 v2의 14.958ms와 직접 paired 비교한 것은 아니므로 추가 개선율은 주장하지 않는다. 같은 v3 Discovery delivery 전 43.491→3.099ms, 후 12.422→1.604ms.
- 최신 Canonical 이름/오래된 Ledger 사본의 구분, persisted trace 재조회, 요청 사이 Project 변경을 포함해 대상 81 PASS + 8 SKIP. 새 직접 회귀 5개 포함. 초기 assertion 1개는 실제 필드명 `conceptName`을 `canonicalName`으로 잘못 적어 수정했고 실제 결과가 요구와 일치함을 확인했다.
- 현재 실행 중인 native Core는 이 추가 최적화 이전 Application을 계속 사용한다. 실행 중 Builder를 재시작하지 않으며 idle 뒤 새 코드를 로드한다.

### 03:49 KST 후속 검증과 두 번째 품질 후보

- Helper v3 포함 전체 `pnpm check` 단일 실행 PASS: unit 115 + 3 SKIP, integration 311 + 8 SKIP, eval 36, Campus Drop 3, smoke 6, E2E 12. 로그 `check-v3-0339.log`. 그 뒤 추가한 Discovery v1.3.7 후보는 별도 adapter/eval 41, panel 13 PASS이며 이 전체 check에 포함됐다고 주장하지 않는다.
- 1,000개 합성 이력 paired v3도 전체 응답 deep equality PASS: Helper 중앙값 49.556→23.885ms, SQL prepare 1,836→223; Discovery delivery 전 51.847→11.167ms, 후 18.814→8.180ms. 동일 machine의 독립 DB 교대 30회이며 모델 실행과 일부 겹쳤으므로 격리된 장시간 P95 보장은 아니다.
- Map/Set 빈 메시지 재개 **303.643초**, durable Task COMPLETED. `complete_task` 첫 제출은 `TASK_CONCEPT_SCOPE_MISMATCH`로 거절됐고 모델이 수정한 두 번째 제출만 성공했다. transport 오류 0이지만 전체 오류 0은 아니다. Build Episode Analyst는 Agent 작업만 존재함을 명시해 proposal 0.
- 생성 앱을 수정하지 않고 독립 재실행: build/typecheck 및 **16/16 tests PASS**. OS 할당 loopback 포트를 쓰는 별도 child에서 10개 HTTP probe를 실행해 **9 PASS / 1 FAIL**. JSON `null` 요청이 처리되지 않은 TypeError로 해당 child를 종료시켰다. 정상 비교·HTML·JS·CSS·잘못된 JSON 문법·배열·없는 경로는 통과했다. 이 실패를 숨기거나 Core Task 상태를 수동 수정하지 않는다. 기존 smoke는 random port를 사용하고 요청 timeout/종료 대기가 약한 한계도 남는다. `id,name` 간단 형식이며 완전한 quoted CSV 지원으로 보지 않는다.
- Discovery v1.3.7은 full canonical을 유지하며 한 제품의 기능 쪼개기 방지, 사용자 행동 중심 설명, 기술 보장 범위 구분을 추가한 **미채택 후보**다. 동일 Map/Set 입력과 held-out generator/iterator 입력으로 실측한다. 필드 schema·후보 개수·안전 규칙은 변경하지 않는다. fixture의 liveResult는 아직 PENDING.
- 모든 run/Analysis terminal 확인 뒤 소유 Core만 재시작하고 승인된 개발 창만 Reload Window. 새 Core는 Helper v3와 Discovery v1.3.7을 로드한다. Kiro 전체 앱 업데이트/전역 설정 변경은 하지 않았다.

### 03:57 KST 품질 후보 판정과 복원 라우팅 재현

- Discovery full v1.3.7 실제 PREVIEW 3회 모두 durable 저장: Map/Set 동일 입력 **28.049 / 31.477초**, held-out generator/iterator no-Need **26.923초**. 50개 문장 필드의 길이 상한 초과 **12 / 27 / 3개**. Map/Set의 독립 제품 다양성은 나아졌지만 전체 비교를 O(1)로 부르는 과장, held-out의 기술 패턴 자체를 제품으로 제안하는 문제가 남아 **그대로 미채택**이다. role prompt SHA `6feaec92986a0772c82d971eac5e0887e49c00a515f5d8aa0ffc446d56fd042f`. AI 검토이며 인간 품질 평가로 표시하지 않는다.
- v1.3.8 후보는 full canonical 끝에 짧은 문장·실제 사용자 효용·구체적 구현 역할·전체 작업 비용 구분의 최종 점검만 추가했다. Builder v1.3.10 후보는 unknown 외부 입력과 비정상 HTTP 생존 테스트, OS 할당 포트와 bounded smoke 종료, 현재 Learning Spec의 정확한 구조화 conceptUsage를 명시했다. 추가 개념은 자유 서술 보고로 남기며 Core scope validation을 완화하지 않는다. 후보/기존 prompt adapter+eval **51 PASS**, panel **13 PASS**. 실제 품질 판정은 대기다.
- Discovery root에 있는 개발 창에서 이전 완료 Project의 Helper를 요청하니 모델 시작 없이 **130.736초** 대기했다. 수동 취소한 실패 보고 `native-helper-v3-dedup-complete-1.json`을 보존한다. 원인은 single-window protected H job이 `pendingWorkspace()`의 separateHost 필터에서 제외돼, Project W가 열려 있지 않을 때 영구 대기하는 라우팅이었다. Helper v3 context 처리 속도나 모델 지연으로 집계하지 않는다.
- 수정: protected Helper/Analyst가 기다리면 **그 job의 검증된 Project W**를 idle worker의 이동 대상으로 돌려준다. H 자체는 editor 이동 대상이 아니며 다른 Project/root에서 claim 불가, 활성 role·catalog 경계, 기존 별도 H/Windows 경로는 유지한다. 복원 Helper/Analyst 및 취소 후 target 제거를 추가한 relay integration **6 PASS**. 실제 복원 성공은 후속 실측으로 확인한다.
- closed Episode의 사용자 근거 유무로 Analyst 호출 자체를 생략하는 비용 최적화는 이번에 구현하지 않는다. 현재 SPEC의 Episode당 1회 Analyst 규칙을 바꾸는 정책 결정이 필요하며, Agent 대신 빈 분석 결과를 만들어 성공 처리하지 않는다.

### 03:59 KST Helper 복원 실제 회귀

- 같은 실제 frontend ManagedAgentPort의 새 Helper 요청 `native-helper-v3-dedup-complete-2.json`은 **39.030초 / HELPER_RECORDED**. 요청 약 0.62초 뒤 workspace 이동 시작, 약 2.12초 뒤 올바른 W worker가 Helper를 claim, 실제 보호 H에서 답변을 저장했다. Task COMPLETED는 그대로이며 Builder 재실행/학습 상태 승격은 없다. 앞선 취소 실패를 지우지 않는다.
- 이 실행은 Helper v3 lazy context를 로드한 Core의 native 호환 근거다. 이전 27.675초 표본은 핵심 코드가 없는 시점이므로 모델 지연 개선 A/B로 비교하지 않는다.
- 답변은 실제 parse/compare excerpt와 없는 UI excerpt를 구분했지만, “현재 환경의 표준 Set에는 차집합 연산자가 없다”는 말은 부정확했다. pinned Node 24.19.0에서 `typeof Set.prototype.difference`와 intersection은 function이다. 명시적 loop 구현을 런타임 API 부재의 증거로 추정한 품질 한계로 기록한다. 생성 코드는 수정하지 않았다.

### 04:12 KST Discovery 기각·Builder held-out·Analyst 비교 준비

- full Discovery v1.3.8: Map/Set **29.119초**, generator/iterator **24.626초**, unions **24.221초**, cancellation **23.246초**. 제출 오류 0, 길이 초과 3/0/0/4개로 짧아졌지만 Map/Set이 다시 같은 명단 제품의 기능 조각으로 몰리고 재귀 generator의 무조건 stack 안전·타입의 전이 안전·취소의 자동 cleanup 등 검증되지 않은 보장을 반복했다. 개선으로 채택하지 않는다. v1.3.7/1.3.8은 실제 role SHA와 같은 원문을 `docs/spikes/t19-discovery-quality-rejected/`에 보존하고 production은 **full v1.3.5**로 복귀했다. archive fixture와 product fixture는 분리한다. import 하나를 잘못 제거한 eval 6실패는 원복 후 adapter/eval 51, panel 13 PASS로 재검증했다.
- generator/iterator + no-Personal-Need Project `project_866f9b2a-77ca-4769-a776-4fa2dc207dcf`는 SELECT **19.539초**, SPEC **27.120초**, 수정 **19.428초**, 확정/준비 39.5/47.0ms. 선택한 로그 필터 도구 자체의 유효성을 기준으로 Builder 평가를 이어가며 전체 Discovery round의 품질 통과를 의미하지 않는다.
- Builder v1.3.10 첫 turn **199.401초 / Task ACTIVE**, 실제 로그 소스 선택을 요청하고 pending 조회 1회. 공통 generator/filter 및 12개 test를 먼저 구현했다. compiled directory 경로가 Node test runner에서 실패해 명시 glob으로 수정한 재작업 1회는 남았다. 파일/단언/HTTP/smoke 새 규칙의 완주 효과는 아직 후속 재개 전이다. role SHA `74f505eea33ad12d2ffd2e415f502fd43e5615ccc2daf8416dad655b20a6c505`.
- Helper **34.031초 / HELPER_RECORDED**, request-only Episode Analyst proposal 0. 누적 크레딧 새 계정 화면 **792.57 at 04:08 KST**, overages disabled.
- 기존 7-cell tool-less Analyst clean evaluation 명령을 승인된 임시 평가 확장에서 재사용한다. 첫 실행은 과거 실험 root 고정 preflight로 **model 0회** 거절됐다. 제품 gate는 바꾸지 않고 임시 host에만 승인된 `<PRIVATE_MAC_EXPERIMENT_ROOT>`의 정확한 W/H를 확인하는 연결을 추가했다. 실제 product private W/H validator, Core 전체 유휴 확인·worker lease·모델 catalog ACK·fresh H·all-deny·log barrier는 그대로 사용한다. 현재 Project 허용 및 root/repo/tmp/빈 scope 거절 model-0 검사 PASS. 별도 최신 사용량 파일의 15분/880 중단선과 09:00 마감 검사도 적용했다. 평가 결과는 Core Evidence에 저장하지 않는다.

### 04:20 KST Analyst clean baseline과 로그 도구 재개

- Analyst canonical v1.0.7, 실제 catalog의 `claude-haiku-4.5`, 동일 보호 H의 fresh session 7개, retry 0, Core mutation 0. `analyst-clean-y3v4bO`는 **7개 실행 완료 / deterministic 2 PASS·5 FAIL / final idle 확인**이다. 실행 완료와 품질 실패를 분리한다. prompt SHA `0d0c7f132f75f36246b87447d57ff5c6d0b7b9ed4d1eb368e792bdc25cea149c`.
- request-only와 독립 자기 설명만 oracle PASS. 가벼운 힌트 후 미래 예측은 MEDIUM인데 DEMONSTRATED를 제안했다. 이유 있는 선택은 USER_DECISION을 direct source가 아닌 context에 놓고 의존도를 INDEPENDENT로 판정했다. 수행 보고는 MEDIUM인데 DEMONSTRATED였다. 직접 유도 반복은 misconception 필드 누락에 더해 MEDIUM/EXPLAINED를 제안했다. 독립 미래 예측은 concept key를 두 번 써 JSON 파싱 후 proposedCanonicalName이 없어졌다. 입력이나 parser를 보정해 성공으로 만들지 않는다. 모든 응답이 fenced JSON이었으며 기존 parser가 허용하는 운송 형식과 canonical plain JSON 지침 준수를 구분한다.
- v1.0.8 실험은 출처 선별을 먼저 수행하고, Signal·Strength·Dependence와 최대 State 조합을 대조한 뒤 필수 구조를 점검하는 일반 규칙을 추가할 계획이다. 기존 7개 합성 입력·oracle는 그대로 두고, 사용자 message/rationale/custom proposal이 전혀 없는 추천 클릭 음성 사례를 8번째로 추가한다. NONE Proposal도 Agent 선택지 문구를 사용자 인용으로 쓰면 실패다. 7-cell 과거 결과를 8-cell 기준 결과인 것처럼 소급 표시하지 않는다.
- 04:20:45 로그 도구에서 SDK의 합성 추천 선택을 기록했다. 실제 Helper 사용 true, rationale 없음, 기존 run 6개 그대로여서 선택 자체가 Builder를 시작하지 않음을 read-back했다. 초기에 SDK execute 반환을 ApplicationResult처럼 `.ok`로 잘못 검사한 harness assertion이 실패했으나 요청은 이미 저장됐으므로 재전송하지 않았다. durable resolution과 run 수를 다시 읽어 검증한 뒤 명시적으로 빈 메시지 Builder를 재개했다. 해당 선택 Episode는 기존 Analyst v1.0.7에서 proposal 0이었다. 앞선 잘못된 추천 클릭 Proposal 표본과 함께 보존한다.

### 04:30 KST Builder v1.3.10 후속 판정 / Analyst v1.0.8 후보

- 로그 도구 재개 **285.308초**, 실제 Decision apply 1회, complete_task 제출 1회·scope/transport 오류 0회, durable Task COMPLETED. 첫 turn과 재개를 별도로 기록하며 다른 앱의 지연과 직접 A/B하지 않는다. Build Episode는 Agent 작업뿐이라 Analyst proposal 0.
- 생성물을 수정하지 않은 독립 build/typecheck/12 tests PASS. 실제 생성 HTTP server를 새로운 OS 할당 loopback 포트의 소유 child에서 probe마다 실행한 결과 **19 PASS / 1 FAIL**. null·배열·scalar·잘못된 JSON·잘못된 field, 정상 검색·조기 제한·없음, 실제 존재하는 합성 외부 파일/그 파일의 symlink 차단과 오류 후 서버 생존은 PASS. 양수 정수 조건의 limit=0.5를 floor해 0으로 받아들이는 결함은 FAIL이다. canary만 사용했으며 사용자 파일은 읽지 않았다. 보고 `streaming-independent-http-1.json`.
- 자체 smoke는 OS 포트를 잠깐 예약했다 해제하는 race가 남고 전체 작업 deadline·SIGKILL 뒤 close 대기도 충분하지 않다. 실제 GB급 검증이 없고 단일 긴 줄의 버퍼는 파일 크기에 비례할 수 있다. Completion도 실제 GB 측정이 없다는 한계를 명시했다. 후보의 개선 관측과 잔여 결함을 fixture `OBSERVED_WITH_LIMITATIONS`로 기록하며 포괄적 품질 PASS로 삼지 않는다.
- canonical Analyst v1.0.8 후보: 사용자 인용→관찰 종류→Agent 의존도→Strength→State 상한→필수 JSON 구조 순서를 명시했다. bare click은 NONE도 만들지 않고, 실제 선택의 USER_DECISION direct reference·MEDIUM 최대 EXPLAINED·직접 유도 반복 null·한 concept 객체의 두 필수 이름·misconception 필수 등을 재확인한다. Core schema/policy는 그대로다.
- 새 8번째 fixture는 USER_MESSAGE/rationale/custom proposal을 만들지 않은 실제 구조의 합성 선택이다. 기존 7개 입력/oracle 및 생성 Context의 deep equality, 역사적 7회 예산, 새 8회 상한·model-0 9번째 거절 포함 CJS 19 PASS. adapter/eval 45 PASS, panel build PASS. 초기 test 실행의 없는 config 경로와 새 test의 path 변수 실수는 고친 뒤 재검증했으며 모델 실측 실패로 집계하지 않는다.
- Core 전체 유휴와 기존 합성 Analysis terminal 확인 후 소유 Core만 정상 재시작하고 승인 개발 창만 Reload Window. 04:30 계정 새 조회 **799.90**, overages disabled. v1.0.8 첫 8-cell native 평가 **6 PASS / 2 FAIL**, 모든 cell schema-valid. 실제 수행의 MEDIUM/DEMONSTRATED 모순과 직접 유도 반복의 MEDIUM/EXPLAINED 오류가 남았다. `analyst-clean-7Fqxk4`, final idle true, retry 0, Core mutation 0. 기존 7개에선 2→5 PASS 관측이나 단일 비교이므로 일반 정확도 개선 확정 또는 최종 채택으로 표시하지 않는다. 모든 출력이 여전히 fenced JSON이었다.

### 04:38 KST 중간 전체 검증

- `check-v4-0433.log`: routing 수정·Analyst v1.0.8을 포함한 `pnpm check` exit 0. unit **115 + 3 SKIP**, integration **311 + 8 SKIP**, eval **40**, Campus Drop 3, smoke 6, E2E **12 (58.2초)**. Builder live 관측 metadata 추가 뒤 eval 40개도 별도 재통과했다. 이후 코드 변경은 별도 결과를 남긴다.
- actual program controller/port + authenticated HTTP/SSE/SQLite 소비 검사 PASS. Agent는 명시적 fixture인 이 검증을 실제 모델 실측으로 집계하지 않는다.
- 패널 전체 검사 첫 실행은 과거 v1.0.4 비교 테스트가 current v1.0.7을 역변환하던 version coupling으로 1개 실패했다. 당시 canonical v1.0.7 원문을 별도 평가 archive에 고정하고 SHA 검증 후 같은 역변환으로 기존 v1.0.5/1.0.4 exact hash를 검증하게 했다. 제품에서 새 canonical을 구형 평가로 실행하지 않는 fail-closed 검사는 유지한다. 재실행 **112 PASS + 2 SKIP** (`panel-v4-0438.log`). baseline 원문은 제품 import가 아니다.

### 04:40 KST Analyst 동일 조건 반복

- v1.0.8 Haiku 두 번째 8-cell (`analyst-clean-Zb2rJL`)도 **6 PASS / 2 FAIL**, final idle true. prompt SHA `cf84876b9926c815562ab4481388dbff36b0d0083cfe8bade9d9b06a3cfd9cd9`, 12,775자. 첫 실측과 같은 fixture/prompt SHA다. 16개 실행 모두 schema-valid지만 실제 수행의 MEDIUM/DEMONSTRATED 모순은 두 번 모두 남았고, 두 번째에는 직접 반복 대신 실제 선택의 의존도/강도 및 원문 인용이 실패했다. 두 반복 모두 통과한 subset만 골라 전체 PASS로 만들지 않는다.
- 다음 비교는 같은 v1.0.8·같은 8개 입력·fresh H에서 exact catalog Sonnet 모델을 사용한다. 모델 역량/일관성과 지연·계정 증가량 tradeoff를 분리하기 위한 **격리 평가만**이며 제품 기본 Haiku, 자동 retry 수, Core 정책은 변경하지 않는다.

### 04:48 KST Analyst 모델 비교와 별도 입력 평가 준비

- 같은 v1.0.8·같은 8개 입력의 Sonnet (`analyst-clean-ifArig`)은 **5 PASS / 3 FAIL**, 8개 schema-valid, final idle true. 사례별 전체 wall 중앙값 **17.512초**, 합계 129.507초. Haiku 두 회 중앙값 **9.669 / 9.359초**, 합계 79.645 / 74.415초였다. 표본·순서·warmup 제약을 유지하며 장기 latency/정확도 보장으로 확대하지 않는다.
- Sonnet은 미래 계획을 별도 APPLICATION으로 만들고 WEAK/EXPLAINED를 붙였고, 선택에도 MEDIUM/DEMONSTRATED를 제안했다. 실제 수행은 MEDIUM/EXPLAINED로 보수적으로 낮춰 기존 STRONG/DEMONSTRATED oracle와 불일치했다. 마지막 경우는 Core 상한 위반이 아니라 fixture 기대 강도와의 차이이므로 위험한 과대 판정과 동일시하지 않는다. 일반 의미 품질이나 인간 학습 판정은 별도 검토가 필요하다. 이 표본에서는 비용·지연이 큰 모델로 전환할 근거가 없어서 제품 기본 Haiku를 유지한다.
- v1.0.8을 고정한 뒤 별도 Map/Set·요청 순서·입력 제한 8개 corpus를 작성했다. Core mutation 없이 새로운 사용자 합성 입력만 평가하고, conceptCandidates와 Decision relatedConceptNames는 비워 oracle의 claim excerpt를 힌트로 전달하지 않는다. 원본 corpus와 결과는 그대로 보존한다. 평가 명령은 두 고정 corpus 중 하나만 명시적으로 선택하며 임의 corpus·취소는 worker/model 전에 중단한다. 이 새 입력은 아직 native 평가 전이며 기계적 oracle test를 모델 준수로 표시하지 않는다.
- 04:40 계정 새 조회 **801.81**, overages disabled. 새 corpus 선택·누락/가짜 사용자 인용 거절을 포함한 대상 CJS **22 PASS**. 이후 패널 전체/패키징을 다시 검사한다.

### 04:52 KST 별도 입력 판정

- 고정한 v1.0.8 + Haiku, conceptCandidates/Decision relatedConceptNames 없는 held-out corpus는 **5 PASS / 3 FAIL** (`analyst-clean-PwZQT3`). 8개 전부 실행·schema-valid, final idle true, retry 0, Core mutation 0. 요청만/자기 설명/실제 이유 있는 선택/수행 보고/말 없는 추천 클릭은 oracle PASS였다.
- 반면 미래 계획에 구조화된 선택 근거 없는 JUSTIFIED_DECISION을 추가했고, 직접 유도 반복에 MEDIUM/EXPLAINED를 붙였으며, 독립 미래 예측에서는 인용을 바꿔 exact-user provenance를 잃었다. 사용자 학습 근거 저장은 전혀 하지 않은 격리 평가다. 새 corpus의 5/8을 원래 corpus 6/8과 인과 비교하거나 기준 v1.0.7 대비 개선율로 해석하지 않는다. **v1.0.8은 아직 채택 판정 전**이다.
- corpus 선택 구현까지 패널 전체 **115 PASS + 2 SKIP**, panel build PASS. 그 뒤 앞으로의 평가가 실제 조합된 prompt SHA/bytes도 cell metadata에 기록하도록 추가했으며 대상 CJS 22 PASS. 기존 artifact에 없던 값을 소급 채우지 않았고 현재 개발 창 bundle에는 이 마지막 metadata 변경이 아직 로드되지 않았다.

### 05:02 KST Analyst 출력 점검 배치 실험 시작

- 임시 eval host의 `CANONICAL_FINAL_CHECK_TAIL_V1`은 v1.0.8의 `최종 출력 점검` 절을 byte 그대로 최종 입력 뒤에 추가한다. role SHA `cf84876b9926c815562ab4481388dbff36b0d0083cfe8bade9d9b06a3cfd9cd9`와 버전·합성 provenance를 고정하고 drift/실제 Core context는 모델 전 거절한다. 정책이나 사례별 정답 문구를 추가하지 않으며 제품 composer는 바꾸지 않았다.
- 임시 pure-wrapper 검증 3 PASS: 입력/role/fixture 보존, version/hash drift model-0 거절, production provenance 거절. 최신 composedPromptSha256/bytes를 포함해 재번들한 뒤 Core idle 확인, 승인 개발 창만 reload했다. source-first 8개·Haiku의 첫 비교를 시작했다. 관측 결과 전 개선으로 표시하지 않는다.

### 05:05 KST 출력 점검 반복 기각

- `analyst-clean-3yom3V`: v1.0.8 + Haiku + source-first 8개, `CANONICAL_FINAL_CHECK_TAIL_V1` **5 PASS / 3 FAIL**, 전체 schema-valid·final idle true·retry 0·Core mutation 0. 실제 선택의 INDEPENDENT 오분류, 수행 보고의 MEDIUM/DEMONSTRATED 모순, 직접 유도 반복의 MEDIUM/EXPLAINED 오류가 남았다. 앞선 tail 없는 동일 corpus 6/8 두 회보다 개선 근거가 없어 추가 유료 반복 없이 기각한다. 입력 뒤 1,485 bytes 추가, 절 SHA `51a94c448fbfce8d40e0562d2c08cd1cf668ac3e4c65211a3de4a6c5cb697274`.
- 원문·입력·oracle·Core 정책은 보존했다. v1.0.8 원문은 `t19-analyst-prompt-experiments/`에 고정하고 임시 host에서 tail wrapper 연결을 제거했다. 이어서 중복된 일반 지침을 정리한 v1.0.9 후보를 별도 버전으로 평가한다. 기존 결과나 strict oracle를 수정하지 않는다.
- portable/runtime 공통 회귀 6파일 중 4 PASS·2 SKIP, 14 tests PASS·8 SKIP. Mac에서 OS 전용 검사가 skip된 것이며 Windows 실행 PASS로 해석하지 않는다.

### 05:14 KST Analyst v1.0.9 기각과 후보 복귀

- 새 순서표 후보 7,063자(12,417 bytes), SHA `ad839e32fd2e22f3071fbd1e8ea60d8069ef3657f5035019769786661a09a77f`. 기존 source-first/collections 입력과 strict oracle 동일성 및 생성 Context deep equality를 검증했다. 계약·adapter/eval 45 PASS, CJS 23 PASS, panel 전체 116 PASS+2 SKIP, panel build/format/diff-check PASS였다. 이 model-0 검사를 실제 모델 준수로 해석하지 않는다.
- 실제 v1.0.9 + Haiku `analyst-clean-uzAF3h`는 **2/8 PASS / 6개 schema 실패**, final idle true다. 여섯 응답 모두 proposedCanonicalName을 빠뜨렸고, 다섯 응답은 misconception도 빠뜨렸다. 직접 반복 상한과 선택 의존성 오류도 남아 추가 유료 반복 없이 기각했다. 응답 보정·누락 필드 자동 생성은 하지 않는다. 원문과 결과를 archive로 남기고 canonical/build/version gate를 v1.0.8 후보로 복귀했다.
- 새 unseen persistence/reference-copy/input-recovery/FIFO 8개를 v1.0.9 고정 후 작성했으나 후보가 기각돼 native 실행은 하지 않았다. 모델 결과 NOT_RUN을 유지하며 기존 두 corpus를 v1.0.9 unseen이라고 소급 표시하지 않는다.
- 05:08 새 대시보드 **805.84**크레딧, overages disabled. v1.0.9를 위해 유휴 Core를 정상 재시작한 instance는 `237eacaa-b206-468d-9056-0759aa87ae37`였으며, 다음 실행 전에 복귀한 v1.0.8로 다시 유휴 재시작한다. 전체 시도·기각 기록은 [Analyst 실험표](t19-analyst-prompt-experiments/README.md)에 보존한다.

### 05:30 KST 프로젝트 복원 조회 최적화 — 채택

- 실제 program의 `prepareBuilder`, `snapshot`, History port는 `restoreProject`를 호출한다. 이 경로는 최근 Helper 대화마다 전체 Evidence aggregate를 읽었지만 화면 projection은 Episode와 Event의 질문/답변만 사용했다. 대화20개마다 전체 Ledger를 재파싱하던 비용을 제거했다. `EpisodeHistory`와 `readRecentHelperConversationHistoryForProject`를 추가하고 full aggregate/Analyst 경로는 유지한다.
- recent20개의 selection/order, project scope, 현재 Episode revision과 ordered Event, payload schema/hash 검증, user/helper별 마지막5개, correlation·종료 상태·redaction을 보존한다. cache/DB migration/프로토콜·프론트 수정 없음. 복합 회귀17PASS(범위·제한·재오픈·corrupt Episode/Event hash 포함). 첫 테스트의 동일 timestamp 가정으로 대상 대화가 recent20 밖에 있던 fixture 문제는 가변 합성 clock으로 고친 뒤 bounded selection과 마지막5개를 함께 검증했다.
- 새 benchmark `scripts/benchmark-core-restore.mjs`: actual SQLite/Application, 모델0, 최근대화20, warmup5+표본30, 교대 호출, read-only 동일 DB, 매번 전체 Snapshot deep equality. 참조 Application은 변경 직전에 동결했고 양쪽은 현재 SQLite adapter를 쓴다. 오래된 전체 binary나 HTTP/network latency 비교라고 하지 않는다.

| 상태/Concept 수 | 이전 중앙값 | 새 중앙값 | prepare |
| --- | ---: | ---: | ---: |
| 개인화 delivery 전 / 0 | 2.356ms | 2.014ms | 110→70 |
| delivery 전 / 100 | 28.113ms | 14.798ms | 910→870 |
| delivery 전 / 1,000 | 161.854ms | 22.460ms | 910→870 |
| delivery 후 반복 / 0 | 2.210ms | 1.825ms | 109→69 |
| delivery 후 반복 / 100 | 15.447ms | 2.965ms | 109→69 |
| delivery 후 반복 / 1,000 | 148.543ms | 9.683ms | 109→69 |

- 첫 delivered 비교도 100개16.068→3.141ms, 1,000개148.293→9.895ms였다. 소표본·동일 process의 GC/CPU 변동을 포함하며 일반 P95나 사용자 체감 총시간 보장은 아니다. private root의 `restore-before-0525.json`, `restore-paired-0527.json`, `restore-paired-after-delivery-0525.json`, `restore-paired-after-delivery-repeat-0527.json`에 실패 없는 전체 응답 동등성과 module SHA를 기록했다. 파일 이름의 시각보다 JSON `at`을 실제 실행 시각으로 사용한다.
- Windows에서도 임시 동결 파일 없이 재현하도록 `--full-helper-reference`를 제공한다. 현재 Application의 정확히 한 history 호출만 기존 full aggregate 호출로 바꿔 임시 reference를 빌드하고, 나머지 코드는 같게 둔다. 호출 지점이 없거나 둘 이상이면 거절하며 원본 소스는 수정하지 않는다. 예: `node scripts/benchmark-core-restore.mjs <새-report.json> 0,100,1000 --full-helper-reference after-delivery` (먼저 pinned toolchain의 `pnpm typecheck`). 앞선 독립 frozen 모듈 결과와 이 재구성 reference를 구분한다.
- 전체 `check-restore-0526.log` exit0: unit115+3SKIP, integration314+8SKIP, eval40,Campus3,smoke6,E2E12(54.6초). actual program controller/port + authenticated HTTP/SSE/SQLite 소비 PASS: 취소를 성공으로 만들지 않음, 복원에서 모델 미호출, 빈 Builder 재개1회 등 포함. 모델 경계는 명시적 delayed fixture다.
- 실제 합성 native Core도 유휴 확인 뒤 새 Application으로 정상 재시작했다. 기존 완료 Project의 HTTP/SDK 전체 Snapshot SHA가 전후 `951992857861e0c5db970e0835da7975c3c78863ced4536d54e62bfe4f027345`로 같고 Task COMPLETED·Helper 대화1개 유지. 새 Core session59664, instance `92a1065d-18fa-435e-8c31-4e476e9cd2ca`, 포트50705. 승인 개발 창만 idle reload했다. 유료 호출 추가 없음.

### 05:41 KST Helper 근거 경계 후보 평가 시작

- 새 대시보드806.59 at05:37, overages disabled. v1.2.0의 같은 완료 Map/Set Task·같은 질문 재실행 `native-helper-v120-dedup-repeat-0538.json`은36.720초/SUCCEEDED였다. 앞선39.030초 응답의 표준 API 부재·EXCLUDED 부재 단정은 반복하지 않았으나 Map.get O(1) 단정은 남았다. 응답 변동과 매번 새 Episode/history가 추가되는 점 때문에 fixed-context paired 정확도/지연 비교라고 부르지 않는다.
- Helper v1.2.1 후보는 구현 방식→API 부재 추론 금지, Spec 제외와 코드 부재 구분, 평균 복잡도·타입·테스트 보장의 조건 구분만 추가했다. 특정 API/fixture 정답을 추가하지 않았다. 기존 read-only/개인화/Spec 재합의/강제 교육 금지 유지. SHA `03761b8670c755c56d38cfc4e02aa73b54fe046fe0339caa984bdba5fdd85301`; 이전 원문은 `t19-helper-quality-experiments/helper-v1.2.0.md`, SHA `c6a96ee7d34510e8097b8082bcc087f185ca915257023b8340089f88ed193231`.
- version gate·adapter·기계적 fixture 동기화, adapter/eval45PASS 및 panel buildPASS 후 유휴Core 정상 재시작, 승인 개발 창만 reload. Core session69416, instance `257e407a-290d-44b0-92ab-ab98485bd1af`, 포트52801. 모델 품질은 별도 출력 검토 전이며 fixture PENDING이다.

### 05:47 KST Helper v1.2.1 기각

- Map/Set36.575초, generator43.474초, union36.658초로 실제 native 세 건 모두 SUCCEEDED/HELPER_RECORDED였다. 그러나 실행 성공과 설명 정확성을 분리한다. Map/Set의 평균 비용·계획/부재 구분은 개선됐지만 baseline 반복도 주요 오답을 피했다. generator는 긴 한 줄 buffer 한계를 짚으면서도 첫 GB급 메모리 설명을 단순화했고, union은 구조적 타입의 추가 필드를 불가능하다고 과장했다.
- 실제 생성 타입을 import한 독립 strict tsc 반례에서 추가 borrower를 가진 비-fresh Available 값이 AvailableState/EquipmentState 모두에 할당됐다. `any`/강제 cast 없음. 첫 TS5112는 독립 파일 검사에 `--ignoreConfig`를 지정해 해결했으며 제품 tsconfig/pin은 변경하지 않았다. 개선 효과를 충분히 입증하지 못해 후보는 archive하고 canonical/gates를1.2.0으로 복귀한다. [실험표](t19-helper-quality-experiments/README.md).
- 후보 전체 check는 기존 preparer의1.2.0 기대값1개, panel은 matrix gate3개에서 실패했다. 이는 제품 turn 실패와 구분한다. 후보 기각 뒤 stale version gate를 완화하는 대신 canonical을 복원하고 전체 check를 재실행했다. model-0 기계적 archive/hash test와 native 의미 품질을 구분한다.

### 05:56 KST Helper closed Episode 조회 최적화 — 채택

- `HELPER_GET_CONTEXT`도 최근 closed Episode20개에서 Episode/Event 요약만 사용했지만 full aggregate마다 전체 Ledger를 읽었다. `readRecentEpisodeHistoryForProject` port와 SQLite reader를 추가하고 Application의 한 호출을 변경했다. 기존 full API·Analyst·사용자 Evidence·personalization 정책은 유지한다. selected20 전부의 Episode/Event hash/schema를 확인하고 기존 같은Task/개념 관련성, first5 Episode·first5 역할별 Event projection, reference 순서/제한을 그대로 적용한다. cache/migration/protocol 변경 없음.
- 대상 회귀19PASS: 전체 HelperContext와 기존 full reader 응답 동등, recent20/열린대화 제외/first5 요약/redaction, 저장소 재오픈·현재revision·ANALYZED/ANALYSIS_FAILED 포함·실재 foreignProject 격리·unknownProject/invalidID/limit·corrupt Episode/Event hash 거절. 첫 비교 test의 detached spy가 private receiver를 잃은 문제는 repository receiver로 호출하도록 수정했으며 제품 로직 문제나 실패 숨김이 아니다.
- `scripts/benchmark-core-context.mjs`는 frozen `.mjs` 참조와 `--full-episode-reference`, 추가Helper대화수0..50를 지원한다. latter는 Application의 정확히 한 history 호출만 기존 full aggregate로 재구성하며 marker drift를 거절한다. 실제 SQLite 독립 두 DB·동일 합성 입력/clock/id·warmup5+교대30회, 매 Helper 응답 전체 deep equality와 DB integrity를 검사한다. 변경 전 동결 모듈SHA `41b47c3df5df3ed60b9f1197785bd6da8b4a88456ec3ac74012b53c72f7c0f8c`.

| 추가 Helper 대화 / Concept 수 | 동결 전코드 중앙값→새코드 | 재구성 비교 반복 | prepare |
| --- | ---: | ---: | ---: |
| 20 / 0 | 2.652→2.229ms | 2.478→2.185ms | 103→63 |
| 20 / 100 | 19.732→6.202ms | 19.014→5.840ms | 315→275 |
| 20 / 1,000 | 146.714→7.548ms | 134.061→7.342ms | 299→259 |
| 0 / 1,000 (기본 Decision Episode1개) | — | 22.168→6.587ms | 223→221 |

- 모든 전체Context·DiscoverySnapshot 동등성PASS. 마지막0대화 조건에서도 기본 closed Decision1개는 존재하므로 Episode0개라고 표시하지 않는다. Core 계산만 측정했고 실제 모델 latency/일반P95/Windows speed/전체oldbinary 비교로 확대하지 않는다. private reports `helper-history-before-0550.json`, `helper-history-paired-0553.json`, `helper-history-repro-repeat-0554.json`, `helper-history-empty-repro-0555.json`; 파일명보다report.at이 실제 실행시각이다.
- actual program controller/port+authenticatedHTTP/SSE+SQLite 소비 검증PASS(`program-consumer-helper-history-0553.log`, 모델 경계delayedfixture). 전체 `check-helper-history-0556.log` **exit0**: unit115+3SKIP,integration316+8SKIP,eval41,Campus3,smoke6,E2E12(53.5s). 반복 성능·응답 동등성과 전체 회귀 통과로 채택한다. 재현 예: pinned `pnpm typecheck` 뒤 `node scripts/benchmark-core-context.mjs <새-report.json> 0,100,1000 --full-episode-reference 20`.
- 실제 native Core도 모델 유휴 확인 후 새 빌드로 재시작했다. 최초 SDK `restoreProject()`끼리 raw hash 비교는 호출마다 새 correlationId를 발급한다는 계측 조건을 빠뜨려 불일치했다. 이를 제품 회귀 또는 동등성PASS로 보고하지 않는다. 고정 correlationId의 실제 HTTP 명령으로 별도 재시작 감사를 수행하니 전체Snapshot SHA `f1bc53c863be0d67ed0f85bbb91c21140c0f503c38a0522882ce77e1118db234`가 유지됐고 Task COMPLETED/Helper2개/전역idle이었다. 이 두 번째 감사는 최신코드의 restart 내구성 검사이며 전후 Application 응답 비교는 위 독립DB benchmark가 담당한다.
- 최신 Core session38643, instance `34dc5203-cd29-46c4-816d-dac00497e47a`, 포트59080. 승인 창만05:58 idle reload. 프론트 main read-only 재조회는 `73b57e2fe6a891b00e42088aed8d9fb7c9a36c36`으로 이전 조회와 같았다. 이번 코드 최적화 모델 호출0.
- 05:59 새 계정dashboard 누적 **808.72**, overages disabled. 마지막806.59조회이후Helper4회가있었고추가유료실행없음. 계정900상한/880신규중단선/15분freshness유지.

### 06:21 KST 실제 Helper 취소·즉시 재요청 검증

- `benchmark-native-helper-cancel.mjs`는 actual program ManagedAgentPort/SDK/HTTP/SSE/Core/native를 사용해 첫 nonempty TEXT에서 자기 run을 한 번만 취소한다. 120초 watchdog·09:00 deadline·15분 usage freshness·880 중단선·새 report only를 적용한다. 선택적인 `--queue-retry`는 모델 Helper 최대2회와 정상 후속 Analyst만 허용한다. 기존 완료 Task를 Builder로 다시 실행하지 않는다.
- 완료 union Project에서 취소 ACK 5.834ms, native 소유 terminal 관측527.215ms; streaming Project에서는 각각3.838ms/527.948ms였다. 원본 reports `native-helper-cancel-0605.json`, `native-helper-cancel-streaming-0606.json` PASS. 두 경우 취소 답변을 저장하지 않고 Project/Task/Context/Decision/기존대화를 유지했다. 후자는 accepted/rejected Evidence·Analysis 불변도 확인했다. context-read personalization trace는1개 증가할 수 있으며 학습 Evidence 증가로 해석하지 않는다.
- 각 취소 뒤 정상 새 Helper는42.458초/38.503초 SUCCEEDED/HELPER_RECORDED, 같은 window7/보호 pair 재사용이었다. 두 번째 Project로 이동할 때만 worker workspace restart가 있었고, 각 Project 내부의 취소 후 회복에는 reload/새 pair 준비가 없었다. 실제 Mac 소표본이며 Windows 또는 모든 race의 안전 증명은 아니다.
- 즉시 재요청 첫 시도 `native-helper-cancel-queued-retry-0610.json`은 실패로 보존했다. 취소가 빨리 끝나 계측 조회 후의 재요청이 native terminal보다 늦었으므로 원하는 queue 겹침을 만들지 못했다. 새 Helper 자체는 성공했지만 이를 overlap PASS라고 부르지 않는다.
- 조회보다 먼저 재요청하도록 계측 순서를 바꾼 `native-helper-cancel-queued-retry-0615.json`에서는 새 요청이21:14:56.787Z에 생성되고 이전 native 취소 terminal은56.957Z, 새 native 실행은58.016Z였다. 즉 terminal170ms 전 수락된 요청이 소유 terminal 뒤에만 실행됐고 답변은 정확히1개 저장됐다. 마지막 global-idle 검사가 정상 자동 Analyst보다 빨라 원본은 `HELPER_ABLATION_ANALYST_ACTIVE` FAILED다. 이를 덮어쓰지 않았다.
- read-only addendum `native-helper-cancel-queued-retry-0623-addendum.json`(실제 at06:21)은 원본SHA를 연결해 취소상태·새 Helper 성공·새대화1개·그 Episode의 Analyst SUCCEEDED(06:15:20.259, proposal0)·전역idle을 확인했다. 모델 추가0. runner는 앞으로 자기 새 Episode의 Analyst만 최대60초 기다리고 다른 작업은 global idle에서 계속 거절한다. durable checkpoint 결과와 전체 harness 결과를 별도 필드로 기록한다. 수정 runner의 유료 재실행은 아직 하지 않았다.
- worker 회귀에는 Core CANCELLED 뒤 실제 owned prompt terminal을 의도적으로 지연하는 model-0 test를 추가했다. polling3회에도 다음 Helper를 claim하지 않고, terminal 뒤에만 다음 run을 시작하며 pair를 재사용했다. 패널118 PASS+2 SKIP(`panel-cancel-0614.log`), syntax/format 검증 PASS. 제품 worker 변경 없이 기존 직렬화 경계의 회귀를 보강했다.
- 계정 fresh dashboard는06:14 누적810.47/overages disabled이며 이후 Helper2회+정상 Analyst1회가 추가됐다. 이후 조회/SQLite 최적화 작업은 모델0. 이 숫자를 새 paid batch의 무기한 관측값으로 쓰지 않는다.

### 06:28 KST Evidence 조회 중복 제거 후보

- actual program `readEvidence(conceptId?)`가 사용하는 `UI_READ_EVIDENCE_TRACE`에서 direct trace 재읽기, 같은 Episode full aggregate·source Project 복원·Discovery session 검증이 반복됐다. 하나의 read transaction 안에서 검증된 trace/Episode head/Project head/session correlation만 재사용한다. 전체 Evidence aggregate validation·현재 revision·배열 순서·가시성 필터·Analysis/personalization/redaction/100개 응답 제한은 유지한다. 요청 밖 cache·migration·frontend/protocol 변경 없음.
- Application 동결본 `application-before-evidence-v1.mjs` SHA `561a7eca524e21dd9e7acca2687ad3f3098d837e9970edbf015d076cbc15a6fa`. benchmark는 실제 독립SQLite2개·동일clock/id/입력·warmup5+교대30회이며 전체 Evidence/Helper/Snapshot deep equality와 DB integrity를 검사한다. 100개 초과 전체조회는 기존계약에 맞춰 측정하지 않고 특정Concept 조회만 한다.
- `evidence-before-0625.json`은 후보 전 코드와 동결본이 같은 응답/비용임을 확인했다. 후보 `evidence-cache-paired-0628.json`: 전체Concept10 중앙값7.712→2.907ms(SQL291→95),100개203.361→14.055ms(SQL2811→815). 단일Concept/registry1000은129.917→126.761ms(SQL8031→8015)로 거의 개선되지 않았다. 후자는 별도 남은 병목이며 전체조회 개선율로 대신하지 않는다.
- 신규 대상9검사 PASS: accepted/rejected 가시성, 같은 Episode1회 조회, 최신Project/Concept/Episode revision 재조회, 전달한personalization만의 교차Project Evidence/State evidence id, stale correlation 거절. 초기 test 실패는 source Application과 dist Storage 오류class 혼합 및 필수 helperConversationLimit 누락이었다. 기존통합검사와 같은 package import/실제명령계약으로 test를 고쳤고 제품 오류계약을 완화하지 않았다.
- `--uncached-evidence-reference`는 고정 baseline04117c5의 Evidence 메서드만 현재 Application에 삽입한 임시 reference를 만든다. source의 양끝 marker가 정확히1개일 때만 실행하고 원본은 수정하지 않는다. frozen 비교와 이 재구성 비교를 구분한다. 전체check/실제program소비/재현반복 뒤 채택 여부를 확정한다.

### 06:38 KST Evidence 단일개념 필터·Episode history 후보 검증

- 1단계 요청 내 재사용은 전체조회에 효과가 있었지만 단일Concept 요청에도 모든 direct trace를 먼저 읽었다. 2단계는 `readEvidenceTracesForProject(projectId, conceptId?)`의 검증된 optional filter를 SQL의 accepted Evidence/proposal 양쪽 Project membership 조건에 적용한다. rejected-only Concept도 포함하며 다른 Project·미등록Concept은 hydrate하지 않는다. full 조회의 기존 정렬·100개 응답 제한은 유지한다. UI 명령/SDK/protocol은 바꾸지 않는다.
- 2단계만의 `evidence-filter-paired-0633.json`: registry1000 단일조회124.855→16.051ms, SQL8031→23. 남은 전체 Ledger 파싱은 화면에서 쓰지 않는 Episode aggregate 때문이었다. 3단계는 기존 shared `#episodeHistory`를 감싼 validated `readEpisodeHistory` port를 사용한다. selected Evidence trace와 현재 Episode/Event의 schema/hash·Event 순서·Project scope를 검증하고, full aggregate/Analyst 경로는 그대로다. 전체 Ledger/그 Episode의 무관한 Evidence proposal은 화면 projection에서 사용하지 않아 읽지 않는다.
- 특정 Episode 하나를 반복 참조하는 조건만으로 결론내리지 않도록 benchmark에 `one-per-concept` layout을 추가했다. 개념마다 별도의 실제 closed Episode/Event를 저장하고 동일 독립 DB를 비교한다. 배열·거절정보·personalization·Analysis 포함 전체 응답은 모든 반복에서 deepEqual이다.

| 합성 이력/조회 | 변경 전→새 중앙값 | prepare |
| --- | ---: | ---: |
| 공통 Episode / 100Concept 전체 | 196.814→12.630ms | 2811→813 |
| 공통 Episode / registry1000 중1개 | 128.435→1.514ms | 8031→21 |
| Concept별 Episode / 100개 전체 | 116.076→16.012ms | 2811→1011 |
| Concept별 Episode / registry1000 중1개 | 117.468→1.442ms | 8031→21 |
| Concept별 Episode / 빈Project | 0.427→0.411ms | 11→11 |

- reports `evidence-history-shared-0638.json`, `evidence-history-many-0639.json`. 고정baseline 메서드 재구성 반복 `evidence-history-repro-0637.json`에서도100개 전체115.985→16.214ms,1000중1개116.355→1.552ms였다. 현재AppSHA `35d34c868a3d9cd9ec8dbf724d8c38c16b855fa02cea77f5b5076937ca82bc34`, StorageSHA `bbaafdee124751a6bb7944257ab4704d79448321c39d82ebba5866125ad2e1fe`. 이름의 시각보다JSON.at이 실제 실행시각이다. Core 계산비용이며 실제 모델/HTTP/Windows·일반P95 개선으로 확대하지 않는다.
- 대상22검사 PASS: rejected-only membership·등록돼도직접관계없는Concept·실제foreignProject·invalidID·저장소재오픈·선택한Ledger hash·Episode/Event hash·현재rev/OPEN·closed status·요청내중복1회·stale session correlation·다음요청최신Project/Concept/Episode 반영. lightweight reader가 full aggregate를 부르지 않는 것도 검사했다.
- `test-program-consumer.mjs`에 actual program AgentSurfaceController의 empty/full/filtered Evidence 소비를 추가했다. 합성 Core `CONCEPT_OBSERVATION`2개를 실제SQLite에 저장하고 UI projector가 두개/한개/unknown/null을 처리하며 userUnderstandingTotal0/OBSERVED_ONLY를 유지했다. 해당 조회에서 Agent 호출 증가0. consumer PASS(`program-consumer-evidence-history-0637.log`). synthetic fixture를 실제 사용자 이해로 표시하지 않는다.
- 실제 native DB의16Project,77개 filtered Evidence view,모든Snapshot/전체Evidence를 고정correlation으로 저장했다(`native-views-before-evidence-0637.json`, SHA`006faee91327b706bdc433ed46f31447feca9323ea287809c45878ef512e8894`). 모두Coreidle이며 모델추가0. 최신전체check와 새Core 재시작 뒤 같은 응답 검증을 진행한다.
- 1단계전체check `check-evidence-cache-0635.log`는 unit115+3SKIP,integration318+8SKIP,eval41,Campus3,smoke6,E2E12 PASS였다. 2·3단계와새consumer의 최종전체check는 `check-evidence-history-0638.log`로 별도 수행한다. 06:35 fresh account dashboard811.05/overagesDisabled; 마지막조회이후 모델0.
- Windows 재현: pinned `pnpm typecheck` 뒤 `node scripts/benchmark-core-context.mjs NEW_REPORT 0,10,100,1000 --uncached-evidence-reference 0 --evidence-trace one-per-concept`. 마지막 인자생략은shared layout이다. 필터의 없는Concept 거절과 실제프론트 projector 소비도 함께검증한다.

### 06:41 KST Evidence 최적화 채택

- 최종 `check-evidence-history-0638.log` exit0: unit115+3SKIP,integration319+8SKIP,eval41,Campus3,smoke6,E2E12(53.7초). 대상22검사·actualprogram empty/full/filtered projector 소비·교대반복·전체응답 동등성과 함께 통과해 세 단계 변경을 유지한다. 기존 무관한 lint warning2개는 수정하지 않았다. format/diff-check PASS.
- 모델/Analysis 유휴였던 Core38643을 정상종료하고 최신compiled코드로 session81514, instance`523b3ff1-2095-4aca-8cd7-13389d77c6ee`, URL`http://127.0.0.1:51786`을 시작했다. 같은16Project/77filtered view의 전후SHA `006faee91327b706bdc433ed46f31447feca9323ea287809c45878ef512e8894` 일치, 전체deepEqual PASS(`native-views-after-evidence-0640.json`). 별도 모델/수정요청 없음. 승인개발창만06:40:02 idle reload/WORKER_STARTED를 확인했다.
- 사용자contract·기존100Concept전체응답한계·provenance·Analyst정책은 변경하지 않는다. 추가조회최적화로 모델의오답/학습정확도가개선됐다고하지않는다. 최신freshusage811.05 at06:35, 이후모델0. Goal/T19진행중이며다음은Analyst후보판정및최종Windows재평가인계다.

### 07:08 KST Analyst 동일 입력 비교 보강

- 기존1.0.7의7개와후보1.0.8의8개통과율을직접개선율로쓰지않도록, clean command에 **평가 전용 SHA 고정 원본 선택**을추가했다. canonical/runtime는1.0.8그대로이며optional dependency에전달된1.0.7원문SHA `0d0c7f132f75f36246b87447d57ff5c6d0b7b9ed4d1eb368e792bdc25cea149c`만허용한다. 원문불일치·알수없는선택은worker lease/model전거절한다. 입력/oracle그대로,version과`SAME_EIGHT_CASES_V1`만명시적으로바꾸며8회상한/freshH/catalog/read-only/retry0/최종idle유지. 9개입력과임의버전은계속거절한다.
- held-out collections/requests에서원본 `analyst-clean-jifKXQ` **5/8**,후보반복 `analyst-clean-YStmlG` **5/8**. 두batch의sourceCorpusSHA `97f045a3ae039e6f38b0e2064d86eddc8aae13e73a0545008802122ba537eae5`,caseSetSHA `5b3a674987b3be04fea3ad60e9dec015edd465bda68421605acbe0765959aa76`,각8cell inputSHA가모두같음을assert했다. 양쪽schema8/8,finalIdletrue,Core변이0,retry0. cell elapsed의lower median(정렬8개중4번째)은7.228/7.945초이며시스템총지연또는통계적우월성주장이아니다.
- 원본실패는힌트뒤미래계획상한,선택의독립성/인용,독립적미래예측의재진술분류/인용이었다. 후보반복은미래계획상한·가짜선택,선택의독립성,직접따라한말의MEDIUM/EXPLAINED과대평가였다. 같은5/8이라도위험종류가다르다. 앞선후보held-out `PwZQT3`5/8도별도표본으로보존했다.
- 두promptSHA를고정한뒤신규 `evidence-analyst-paired-unseen-20260928.json`을작성했다. timer수명·사전식정렬·로그도착순서·입력정규화등새사용자문장8개이며모두conceptCandidates없음. 기존1.0.9 NOT_RUN corpus를재분류하지않았다. 새코퍼스는이번차례를candidate→baseline으로바꾸고같은모델/입력/oracle로비교한다. candidate `analyst-clean-9U9wCq` **4/8**: 미래계획을APPLICATION으로분류,선택의독립성/인용오류,완료실행인용변형,직접반복과대평가. schema8/8,finalIdletrue,변이0,retry0. 원본비교는진행중이며최종판정전이다.
- 대상29PASS,패널전체123PASS+2SKIP(`analyst-new-pair-tests-0656.log`, `panel-new-paired-0658.log`),panel build PASS. eval-only 변경후전체`pnpm check`는아직재실행전이다. fixture JSON은기존Biome대상제외라해당파일직접format은No files processed로끝났으나JSON구조/독립인용·hash회귀와global format check는PASS;format범위를넓히지않았다.
- 프론트main06:49읽기전용조회는 `73b57e2fe6a891b00e42088aed8d9fb7c9a36c36`으로같았다. 오래된Discovery-only인계문서와후속전체연결문서를구분한다. 최신문서는537tests/Builder·Helper·Decision·취소·복원·Evidence연결을기록하지만실제신규native완료증거는별도다. 사용자말씀의프론트실측상태를오래된버전불일치문서로덮어쓰지않는다.
- 모델추가없는실제Core16Project/77filteredView감사전후SHA006faee9...e8894유지(`native-views-pre-analyst-pair-0647.json`, `native-views-after-baseline-pair-0651.json`). 새dashboard **813.57 at07:05:07KST**,overagesDisabled. 계정900/신규880/15분관측유효성/09:00마감유지. 승인창의batch사이idleReload만사용했다.

### 07:15 KST Analyst 한정 유지 판정

- 새입력원본 `analyst-clean-KvJxlO`는4/8·schema5/8로,후보4/8·schema8/8과의미oracle통과수는동률이었다. 미래계획·직접반복·독립미래예측이원본schema오류였다. source-first원본의동일8개 `analyst-clean-PrAPJl`은3/8·schema6/8,후보두회의6/8·schema8/8과같은8개inputSHA임을확인했다. 모든finalIdletrue/retry0/변이0. 새코퍼스caseSetSHA `856e3fffde277b6a324ad1ec5e114de8e09786af9955a9492c28b12525e31d82`,source-first `8e62f6c93c5091ac32aaf0fa89ac4d7fe94b8621858c50fa5695b2de1fd09ad5`.
- **v1.0.8 유지는출력구조신뢰성개선에한정**한다. held-out의미품질은동률이고case별퇴행도있으며지연개선은없다. source-first중앙값은원본8.471/후보9.669·9.359초,held-out7.701/8.202초,신규8.963/8.915초다. 여기서중앙값은짝수표본의가운데두값평균이다(앞선07:08의lower median과정의구분). 모든값은모델외세션준비/검사포함cell wall이다. 모델변경·정책완화·출력자동보정없음. [최종표와제한](t19-analyst-prompt-experiments/README.md).
- private `audit-analyst-pure-policy.mjs`는exact입력SHA·실제adapter parser·기존domain evaluator로출력을offline대조했다. 순수함수만호출하며model/DB변이0,proposal별syntheticConcept/priorEvidence없음,alias/jobtransaction/state-reducer의전체파이프라인검증아님. private reports `analyst-{new,held,source}{107,108,108a,108b}-pure-policy-0715.json` 중실제생성7개를보존했고파일명보다at이실제시각이다.
- 직접인용변형은INVALID_REFERENCE,직접유도반복의상승은INSUFFICIENT_EVIDENCE,MEDIUM/DEMONSTRATED는OVERSTATED_MAXIMUM_STATE로거절된다. 그러나후보새입력의미래타이머정리계획은APPLICATION/MEDIUM/EXPLAINED로오분류돼순수정책을통과했다. 기존107도held-out/source-first에서LIGHT_HINT예측의DEMONSTRATED가통과했다. 자연어의의미를Core가모두검증한다거나모든oracle실패가실제State상승이라고하지않는다. 형식개선채택이의미품질완료를뜻하지않는다.
- canonical은정확히기존후보SHA cf848...cd9그대로이며새문구튜닝없다. clean command는Current표기로갱신한다. 정상nativeCore81514의prompt/runtime교체는없고실측lease종료후모델유휴다. 다음전체회귀·프론트계약/인계·Windows절차검증으로진행한다. 실제Windows평가는사용자전환후별도다.

### 07:21 KST 전체 회귀와 Windows 재현 도구 보완

- `check-analyst-paired-0715.log`는 E2E 이전 검사를 통과했으나 Chromium launch의 macOS MachPort 권한 오류로 12개 E2E가 앱 시작 전에 종료됐다. 이 실패를 삭제하거나 제품 PASS로 바꾸지 않았다. 허용된 브라우저 실행 권한에서 동일 전체 명령을 재실행한 `check-analyst-paired-0718-gui.log`는 exit0: unit115+3SKIP, integration319+8SKIP, eval41, Campus3, smoke6, E2E12(53.7초). panel123PASS+2SKIP, JSON/enrichment18PASS, actualprogram consumer PASS, panel build PASS다. 기존 무관한 lint warning2개는 보존했다.
- 모델 0회로 실제 native DB의16Project/77filteredEvidence/모든Snapshot을 다시 비교해 SHA `006faee91327b706bdc433ed46f31447feca9323ea287809c45878ef512e8894` 동일과 global idle을 확인했다. `native-views-after-all-analyst-pairs-0715.json`의 실제 at은07:16:16이다. 평가 응답을 durable 학습 Evidence로 저장하지 않았다.
- Windows 제출 전 재현 명령을 검토하다가 `benchmark-core-context.mjs`의 exact LF 함수 경계가 CRLF checkout에서 실패할 수 있음을 찾았다. 제품이 아니라 비교 reference를 구성하는 도구 문제다. 새 `benchmark-reference-source.mjs`는 LF/CRLF 경계를 모두 인식하되 정확히 한 시작/종료만 허용하고 method 밖 현재소스 bytes를 보존한다. global 줄바꿈 정규화나 원본소스 수정은 없다.
- 비교 helper 대상7검사PASS: LF/CRLF 4조합, duplicate/missing/reversed/변경 경계 거절, 비문자열 거절, 실제 Application 소스 LF/CRLF의 재구성 esbuild 산출물 일치. `evidence-crlf-reference-recheck-0724.json`(실제07:20:40)의 독립SQLite2/교대30/0·10·100·1000/전체응답동등성도PASS,1000중1개116.649→1.571ms. 이 작은 측정도구 수정은 전체check뒤에 이루어졌고 대상검증·format/diffcheck로 확인했다. 실제Windows실행으로 표시하지 않는다.
- 새 계정dashboard **815.47 at07:17:33**, overagesDisabled. 이후모델0. temp evalhost 새번들을 승인개발창만 유휴 reload해07:21:38 WORKER_STARTED/CONNECTED를 확인했다. 정상Core81514와 canonical promptSHA는 동일하다.

### 07:27–07:32 KST 취소 직후 재요청의 실제 bounded 재검증

- 계측 도구를 `native-helper-cancel-observation.mjs`로 분리했다. 자기 run 생성 뒤 첫 Helper start → reusable → cancelled-confirmed 순서를 요구하고, 그 전에 온 과거/다른 역할 terminal, 순서 역전, 두 번째 Helper의 조기 시작을 거절한다. timestamp와 endpoint job ID 유일성·같은 창·후속 정상 Analyst를 별도로 검증한다. 이는 run ID에 결합된 typed native ACK가 아니라 유휴 출발·격리 worker 로그 순서의 증거다. 제품 worker는 변경하지 않았다. 대상9개, CRLF 도구 포함16개 PASS; panel123+2SKIP/format/diffcheck PASS.
- actual program runner `native-helper-cancel-queue-final-0730.json`은07:27:27.698–07:27:57.622 **PASS**다. 취소 Core ACK4.053ms/native terminal 관측36.766ms. 새 Core run22:27:36.623Z → 이전 native terminal36.630Z → 새 native start37.342Z로7ms 겹침 후 안전한 순서를 관측했다. Helper endpoint2+정상 Analyst1은 window7이고 nativeJobId가 모두 다르다. 취소 checkpoint의 Project/Task/Context/Decision/완료보고/대화/Evidence/Analysis는 동일했고 context-read trace만1증가했다.
- 회복 Helper는1개만 저장됐고 자기 Episode Analyst가SUCCEEDED/proposal0/accepted0/rejected0 후 전역idle이었다. 원본0610/0615 FAIL과0623readonly addendum은 그대로 보존한다. 정상 회복 기록이 추가되어 전체조회SHA는 `1cd273ee287488e190374baac188ad17cee3da80f63a42b1fc568bf698b6984b`로 바뀌었다(`native-views-after-queue-final-0730.json`,실제07:30:54). 이것을 이전SHA와 동등해야 하는 read-only 변이로 오판하지 않는다.
- Windows 제출 전 [인계 초안](T19_MAC_PERFORMANCE_HANDOFF_20260928.md)을 추가했다. 현재 수정은 미커밋이고 새 kit/Windows 검증 완료가 아니다.

### 07:40–07:49 KST Analysis lifecycle의 불필요한 Ledger 읽기 제거

- 실제 합성 DB에는 conceptCandidates가 빈 분석 완료 Helper Episode13개가 있었다. 이 관측에서 전체 Ledger/proposal을 사용하지 않는 상태 전환 경로를 점검했다. Application의 closeEpisodeAndQueue, retryAnalysis, failAnalysisAttempt의 terminal, recoverExpiredAnalysisJobs의 terminal, submitAnalysisResult 초기확인 다섯 호출만 기존 validated `readEpisodeHistory`로 변경했다. 실제 Analyst context, Evidence batch 판정 및 Final Upgrade gate의 full aggregate는 그대로다. 새로운 정책/cache/schema/protocol/prompt/프론트 변경은 없다.
- 초기 Application을 `application-before-analysis-lifecycle-v1.mjs`로 보존했다. 처음 이 자체 bundle과 실제 adapter를 섞은 비교는 ApplicationError class identity가 달라 SQLite가 negative request를 일반 오류로 감싸서 FAIL이었다(`analysis-lifecycle-frozen-0745.log`). 오류 비교를 무시하지 않고 재구성 reference의 errors/storage-ports만 실제 dist로 공유해 양쪽 `instanceof` 경계를 같게 했다. 두 번째 도구 실행은 합성 Ledger의 acceptedEvidenceIds를 비워 계약에 실패했다(`...reconstructed-0746.log`); 정상 synthetic proposal/decision/acceptedEvidence graph로 fixture만 수정했다.
- 새 재현 도구 `scripts/benchmark-analysis-lifecycle.mjs`는 현재소스의 다섯 메서드에 정확히 한 History 호출이 있을 때만 full Aggregate로 되돌린 reference를 임시 생성한다. 원본소스는 수정하지 않는다. 실제 독립SQLite2/동일clock·id/5warmup+30교대/0·100·1000개 각35회에 매번 정상·stale/금지오류·idempotent재생 응답과 **모든 SQLite 테이블**을 deepEqual했다. 매 cycle은 일반질문/quick action을 번갈아 사용하고 terminal실패→명시retry→2회timeout→terminal→retry→empty결과완료를 수행한다. actual Analyst/full Evidence 판정 유지도 별도 Application spy회귀 두개로 확인했다.
- `analysis-lifecycle-reconstructed-0747.json` 실제07:44:12의1000개 p50(ms): 대화종료7.494→1.231(SQL44→42), terminal실패6.231→0.246(16→14), retry6.834→0.286(19→17), terminaltimeout6.316→0.220(16→14), 결과제출12.761→7.013(41→39). `analysis-lifecycle-repeat-0748.json` 실제07:45:35는 각각7.502→1.248,6.451→0.249,6.954→0.292,6.769→0.226,13.304→7.056으로 반복됐다.0개도큰퇴행없음. nearest-rank p50/30이며모델·HTTP·Windows·일반P95성능으로확대하지 않는다. App module SHA `37ddb930cace3c9d007727d98bd5c3db0ae7d57ca023ce387e6154efa71ae49e`, reference `2a578a4c0336d5b0cacdc14bab8da7e47109937bf17f3c4056bc3d9717c693b6`.
- 대상46검사 PASS. 전체검사1차는 새 측정도구 lint 오류,2차는 기존 사용자 개발서버4173 충돌로 E2E 시작 전 실패했다. 원본로그를 남기고 도구만 수정/지원된 `VIBE_E2E_FRONTEND_PORT=4183`으로 격리했다. `check-analysis-lifecycle-0746-isolated.log` 전체exit0: unit115+3SKIP, integration321+8SKIP, eval41,Campus3,smoke6,E2E12(53.5초). 기존4173서버는 종료하지 않았다. `program-consumer-analysis-lifecycle-0748.log`도 실제controller/port+인증HTTP/SSE+SQLite PASS(Agent경계delayedfixture).
- fresh dashboard07:47 **815.91**, overagesDisabled.07:27이후모델0. frontendmain07:46 readonly재조회는`73b57e2fe6a891b00e42088aed8d9fb7c9a36c36`그대로다.
- Core81514 유휴확인→정상종료→최신Application **session36678**, URL`http://127.0.0.1:65164`, instance`e334df8f-786e-45e5-8e22-0c2ea3cb5214` 시작. 승인 개발 창만07:48:39idleReload해WORKER_STARTED/CONNECTED 확인. `native-views-before-lifecycle-0746.json`/`after-lifecycle-0749.json`의16Project/77filteredEvidence/전체Snapshot/전체Evidence가 모두SHA `1cd273ee...6984b` 동일+전역idle이다. lifecycle 최적화를 **채택**한다. 상위T19/T19-N·Windows완료로표시하지 않는다.

### 07:53 KST 동률 정렬 회귀 보강

- Ledger SQL LIMIT 최적화가 timestamp동률과복수head에서도기존순서를보존하는지추가검증했다. 동일updatedAt111개/정순·역순삽입/일부revision2의합성graph에서기존무제한join후slice와새Ledger/Evidence LIMIT1·5·20·100을비교한2test PASS. storage전체대상15PASS(`ledger-tied-order-0754.log`,실제07:53:10). 제품query를바꾸거나명시되지않은새정렬tie-breaker를추가하지않았다. 앞선전체check는이2test추가전이며제품source는그후불변이다.
- 추가ad-hoc`biome check`는공식`pnpm lint`와다르게import정렬assist3개를오류로보고했다(기존import포함). 이것을공식전체check실패로덮어쓰지않고원본로그보존;무관한import전면정렬은하지않는다. 저장소지정format/lint로마지막검증한다.

### 08:00–08:08 KST portable 빌드 실패의 조기 검사와 정제 인계 기록

- `build-portable-core.mjs`를읽어Mac의Node배포본SHA가Windows pin과다르면기존출력삭제/대부분bundle생성후에야거절됨을확인했다. 기존Node배포본SHA/선택license공식SHA와regular/non-symlink조건을새`portable-build-preflight.mjs`로추출해첫output mkdir/rm전에검사한다. Mac을Windows지원으로늘리거나gate를우회하지않는다. preflight8tests PASS. 실제Macscript를target없음확인후호출해38ms의예상NODE_DISTRIBUTION_UNVERIFIED와target여전히없음을확인했다(`portable-build-early-reject-0802.json`,실제08:00:04). 기존output이있는실제Windows생성/실행까지검증한것은아니다.
- 새fullcheck첫실행은이전추가정렬test의`let originalOrder`암묵any lint로실패했다. 이타입만명시하고재실행한 **check-portable-preflight-0803.log exit0**: unit123+3SKIP,integration323+8SKIP,eval41,Campus3,smoke6,E2E12(53.9s). 이전lint/format/diff를연달아실행한shell결과exit0는마지막명령결과였으므로lint통과증거로사용하지않는다. 이번최종lint/format/diff는`&&`로실패를전파해통과했다. 기존무관lint warning2개는유지했다.
- `summary-0803.json`은saved action reports60개(55PASS/5FAILED)를모델0회로정리했다. confirm/prepare등비모델action과서로다른시나리오·실패실험을포함하므로60modelcalls또는55/60모델의미정확도로표현하지않는다.
- [정제JSON근거](T19_MAC_PERFORMANCE_RECEIPTS_20260928.json)를추가했다.9개비교보고서에서선택한시나리오,원본14artifactSHA,선택현재source5개/canonicalprompt4개SHA,latestfullcheck·취소·재시작동등성·Mac조기거절·기준계정표시를포함한다. 전체작업tree완전manifest나새Windows검증본이아니다. 현재파일/원본SHA14개를실제재검증하고credential·대화원문·개인경로는whitelist로제외했다. 첫generator출력은tool출력한도에서잘려JSONparse실패하여write하지않았고,강조시나리오만선택하되원본SHA를유지해생성했다. docsJSON은Biomeignore대상이라직접format호출은no-files였고원래JSON2spaces형식을유지했다. 기존실험/원본보고서는변경하지않았다.
- 추가유료호출없음. 계정마지막fresh815.91@07:47,현재Core36678유휴모델없음. 새packaginghelper는실행중Core와무관하여재시작필요없다.09:00전인계최종audit를계속한다.

### 08:12–08:14 KST 생성 결과의 알려진 한계 재현

- 완료한streaming생성앱을수정하지않고기존독립HTTPprobe를다시실행했다. `streaming-independent-http-repeat-0813.json`은 **19/20**, fractional_limit만expected400/actual200으로다시실패한다.20개모두요청뒤health정상/outsidecanary누출없음,각소유child close를await했고모델0회다. 원본첫실패는그대로보존한다.
- 소스`parseSearchRequest`는오류문구로양의정수를요구하지만0.5→0,1.5→1로정규화한다. 실제compiledmodule을호출한같은반례를`streaming-runtime-boundaries-0813.json`(실제08:12:14)에기록했다.0은400거절하지만0.5는수락한다. 매번생성앱을수정하여성공으로세지않는다.
- 같은compiledreadLines에64KiB×128(8MiB) 합성청크를전달했다. 개행없는한줄은첫yield전에128개청크/8,388,608문자전체를소비하고,청크마다개행이있으면2개prefetch후65,535문자첫줄을냈다. 전체line을반환하는것자체를항상버그라고하지않으며,줄수limit/lazy generator만으로고정바이트메모리상한또는모든GB입력안전이보장되지않는다는반례다. peakRSS/GB규모는측정하지않았다. src/server/logSearch.ts·src/core/lineReader.ts·src/smoke.ts와compiled2파일SHA검사전후동일.
- 정제JSON에두새보고서SHA/19대20/실패원인/8MiB기능반례·소스해시를추가하고인계제약을구체화했다. canonicalBuilder문구는이미runtime/자원검증을요구하므로단순히새tips를더붙여검증없이채택하지않는다. backend제품source/prompt추가변경없음,추가모델0회.

### 08:20–08:40 KST 읽기 soak·최종 회귀·프론트 기준 확인

- 실제 유휴 Core에서 15분 86회, 16 Project의 restore/전체 Evidence/77 filtered view 합계 9,374건을 연속 조회했다. 매회 전체 응답과 SQLite 50개 테이블의 모든 행/hash·run 목록이 같고 시작/종료 global idle이었다. `native-read-soak-0821.json` PASS, elapsed900653ms, `quick_check=ok`, foreign-key 위반0. 모델0. 첫 제한 sandbox 시도의 `ps EPERM`은 조회 전에 실패했고 로그를 보존했다. 승인된 동일 PID 읽기 권한으로 새 보고서에서 재실행했다.
- RSS는 시작122080KiB, 최대/마지막245744KiB였다. 고정 합성 데이터·serial 읽기만의 관측으로 메모리 누수 부재·일반 부하 수용량·Windows/model 지연을 보장하지 않는다. 중간에 제품 rebuild나 fullcheck를 겹치지 않았으며 soak 종료 후 최종 검사를 시작했다.
- 최종 `check-final-0836.log` exit0: unit123+3SKIP, integration323+8SKIP, eval41, Campus3, smoke6, E2E12(53.6s). 별도 panel123+2SKIP(`panel-final-0836.log`), JSON/enrichment/CRLF/cancel34PASS(`measurement-final-0836.log`), panel build(`panel-build-final-0837.log`), actualprogram consumer(`program-consumer-final-0838.log`) 모두 exit0. actualconsumer는 실제 controller/port/authHTTP/SSE/SQLite와 delayed Agent fixture를 사용하며 모델 실측이 아니다. Windows skip은 PASS로 세지 않는다.
- frontend main08:22 재조회는73b57e2...c36으로 같았다.08:26 GitHub compare도 local consumer cce7751부터 두 commit의 전체 차이가 package.json0.0.2→0.0.3 한 줄뿐임을 확인했다(`frontend-main-compare-0827.json`). clone clean, 프론트 소스 쓰기0. 팀의 실제 native 실측 완료 여부는 이 코드 비교로 단정하지 않는다.
- 08:33:55 새 계정 dashboard815.91/overagesDisabled,07:27 이후 유료 모델0. Node24.19.0/pnpm11.12.0, AppleM4Pro/14logicalCPU/64GiB/darwinarm64 환경정보를 정제 receipt에 기록했다. canonical 네 prompt와 packaged copy SHA가 모두 같다. dependency/lockfile/migration/domain 정책 변경0. 선택한 source5개와 원본 artifact 해시를 최종 감사하고 소유한 실험 창/Core만 유휴 종료한 뒤 인계 상태를 확정한다.

### 08:43 KST 마감 전 실험 종료·최종 인계

- 08:41 승인 개발 창의 native 닫기 버튼만 사용해 종료하고 기존 일반 Kiro 창이 남은 것을 확인했다. 닫기 전/후 실제 Core 전체16Project/77filteredview 응답SHA1cd273ee...6984b·global idle을 재확인했다(`native-views-final-before-stop-0841.json`, `native-views-final-host-closed-0842.json`). 생성 코드/상태 변경과 새 모델 실행0.
- Core session36678/instancee334df8f-786e-45e5-8e22-0c2ea3cb5214는 Ctrl-C 뒤 STOPPED/exit0이었다.08:42:30 `stopped-runtime-audit-0843.json`에서 active lock 부재, stopped owner 보존, 소유 listener 연결 거절, 모든50테이블 soak와동일, quick_check ok/FK0을 확인했다. 다른 창·기존4173서버를 종료하지 않았고 임시 데이터는 삭제하지 않았다.
- 정제 receipt의 원본 artifact23개 SHA, 선택 현재 source5개, canonical/packaged prompt4개와 현재HEAD를 검사한다. frontendcloneclean/lockfile·dependency·migration·domain정책 불변/T19와T19-N진행중/선택 민감정보패턴 부재도 확인한다. 이 검사는 선택된 근거 검증이며 전체worktree inventory나 완전한 secret 검사 증명이 아니다. 최초08:40 검사는22artifact PASS였고 종료 artifact 추가 후 최종 별도 보고서를 남긴다.
- 성능 개선의 채택/기각/실패 원본, 실제취소·복원 결과, portable Mac 조기거절, Analyst의 구조 개선 한정/의미품질 동률과 남은 생성 앱 실패, Windows 제출 전 절차를 최종 인계에 모았다. 새 유료 실험의 근거가 없어 호출을 늘리지 않았고 승인09:00 전에 정리했다. **시간 제한 Mac 개선 작업만 완료**하며 Windows 실제평가·T19/T19-N/MVP/사람 학습효과 완료는 아니다. commit/push/프론트수정/배포 없음.

### 08:50–09:20 KST 사용자10시 연장·프론트 보고 수정

- 08:45 새main0858811을발견하여Windows보고101줄을전부읽었다. package/UI/report/surface test가추가됐고consumer대상controller/port/vendor는cce7751과같다. 이전08:26의‘package만차이’는당시증거이지최신main설명이아니다. 프론트1000소진계정은Mac815.91과구분했다. 사용자08:50에10시연장·인계수정우선승인,사용자Goaledit후active/10시objective확인.
- B2 실제기존lifecycle VM에서같은hash/다른install재사용재현(`equal-package-core-reuse-0850.json`,실제08:48). 수정은resource/runtimeidentity hash+legacy불일치거절,oldowner에leaseRENEW하지않고45초정상종료대기. sharedPIDkill/lockdelete/rolevalidation완화없음. descriptor교체시다른instancelease금지,unleaseddisposeRELEASE금지,실패준비partialcache금지,성공오류clear. identity/HostLeases6PASS,lifecycle14PASS. Windowsmanagedtest에는동일bytes다른root조건추가만했고Windows실행은안함.
- B1 native-rpc-error를추가해boundedknownstructuredtype을7고정코드로분류하고원문비노출/unknown generic/shared-32000오판방지. 실제native-clientresponse5개·분류13개·worker7개·NativeRelay/authHTTP/SSE/SQLite실패재시도1integrationPASS. Windowsservicebody가actualRPCpayload와같다는증거는아니며정보없는Windows응답은generic유지. quotaAPI/자동유료retry없음.
- 09:08시작fullcheck`check-frontend-fixes-0910.log`exit0:unit128+3SKIP,integration325+8SKIP,eval41,Campus3,smoke6,E2E12. 후속worker/Trust tests와lifecycleretryguard/consumer검증은추가되었으므로마지막전체검사다시필요. panel155+2SKIP은lifecycle추가3전. 잘못된`build:kiro-panel`명령FAIL로그보존,정식`pnpm panel:build`PASS. 첫worker테스트permissionstub누락으로moduleloadFAIL후기존harness동일stub보완,제품gate완화없이12PASS.
- 실제programconsumer의4오류메시지보존/실패조회시모델0/같은Project·Session명시적새keyretry1회/새portdurablerestore0회PASS. 옛port의preview runID cache가실패를계속보여주는제한도재현하여인계했다. frontend변경없음. 추가Trust회귀1PASS. B3durable실패·abandon/API와B5bridge/Enterprise정책효과는미구현/미확정으로구분한다.07:27이후추가모델0,실험Core·dev창은08:41종료상태를유지한다.

### 09:24–09:35 KST 권한·번들·lease 종료 경합 추가 검증

- 실패/재시도 HTTP integration에 실패직후 grant handler401, 공개MCP경로404, descriptor REVOKED 검사를 추가했고 PASS했다(`native-failure-revocation-0926.log`). 남은bridgeprocess가종료됐다는뜻은아니며Core권한회수와구분한다. 실제SQLite오류4종후같은Project상태/재시도관측을유지했다.
- Windowsportable진입점을Mac에서우회하지않고`write:false` 메모리안에서frontendHost/runtime을bundle/import하는unit2개추가PASS(`frontend-bundle-compilation-0933.log`). 새classifier/lifecycle가hostinput에포함되고 runtime export의identity가source와같으며test/probe입력이없는지검사한다. 배포가능portable/VSIX를만들거나Windows실행을주장하지않는다.
- fullcheck`check-frontend-complete-0935.log`는09:31경시작exit0,unit130+3SKIP/integration325+8SKIP/eval41/Campus3/smoke6/E2E12. **그뒤**lifecycle주기lease갱신/종료경합을발견했다. 느린RENEW에주기tick이겹쳐2개가더전송되고RENEW가pending인데dispose가먼저끝나는2개FAIL을`core-lifecycle-renew-race-before-split-0937.log`에보존했다.
- 보강후maintenance1개dedup,stop뒤새RENEW차단,dispose는boundedmaintenance완료후RELEASE한다. lease API/기간과공유PID정책은불변. 기존14+느린갱신중복/진행중갱신drain/늦은health뒤갱신금지3개의lifecycle17PASS(`core-lifecycle-renew-race-final-0939.log`,실제09:34경). 이VM재현은실제Windowsnetwork/IDE종료실측이아니다. 제품추가수정뒤전체검사/panelbuild/receipt를다시갱신한다.

### 09:43 KST 최종 compiled Core 성능 재점검

- 제품source를더수정하지않고1,000Concept 조건에서restore/Evidence/lifecycle재구성reference를순차재실행했다. `final-restore-recheck-0946.json`(실제09:43:18)은전체Snapshot동등/139.345→9.665ms, `final-evidence-recheck-0946.json`(09:43:26)은Snapshot/Helper/Evidence전체동등/별도Episode의단일Concept114.954→1.499ms였다. 각30회교대비교이고모델0이다.
- `final-lifecycle-recheck-0946.json`(09:43:30)은모든SQLite행및정상·오류·재생응답동등/무결성PASS. close7.438→1.353ms,retry6.504→0.311ms,terminaltimeout6.684→0.233ms,submit13.148→7.132ms. Appmodule37ddb930…ae49e/Storagebbaafdee…e1fe로1차최종빌드와같다. 원래동결baseline표와이재구성비교를혼합하지않고별도마지막확인으로남긴다. 모델/HTTP/Windows/일반P95보장아님.

### 09:50 KST 사용자 승인 조기 마무리

- 사용자가 추가 프론트 보고는 기다리지 말고 완료됐다면 종료하도록 지시했다. Mac 개선과 인계 검증을 마쳤으므로 예정10:00까지 대기하지 않고 종료 기록을 확정한다. 최신전체검사unit130/integration325/E2E12·panel161·build·consumer PASS와09:43성능재점검은 유지되며 제품코드 추가수정은 없다.
- `stopped-runtime-audit-user-finish-0950.json` 실제09:50:11 PASS: active lock없음·stopped owner보존·소유listener연결거절, SQLite50테이블 soak와동일/quick_check ok/FK0/모델0. frontend clone clean, 원격main09:48:52에도0858811동일, git diff --check PASS. 사용자창/서버/데이터/임시파일을 삭제하거나 종료하지 않았다.
- 최종인계/receipt/재개체크포인트에 조기종료와 미완료Windows항목을 명시했다. 연장구간 모델0, commit/push/프론트직접수정/새VSIX 없음. 상위T19/T19-N은진행중으로남긴다.

## Windows 남은 검증

재구성 reference 검증 `restore-reproducible-reference-0530.json`도 전체 응답 동등성 PASS: Concept100/1,000 각각15.459→3.043ms,147.151→9.867ms 중앙값. 실제 제출 전 Windows에서는 같은 명령의 새 보고서와 Windows native/설치·프론트 흐름 결과를 별도로 남긴다. 기존 `frontend:handoff`는 20260927 Windows 검증 문서/manifest를 재사용하므로 Mac에서 새 결과처럼 재포장하지 않는다.

최종 채택 revision과 동일한 frontend 요청 시나리오·합성 입력·계측 정의를 사용한다. Windows의 Kiro 1.1.70 / Agent 1.1.158 exact source, portable SQLite, Core lifecycle, 생성 앱 도구, Helper 보조 창, 취소/복원 경계는 Mac 결과와 별도로 재평가한다. 제출 전 Windows PASS는 이번 Mac Goal의 결과로 미리 선언하지 않는다.
