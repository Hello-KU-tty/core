# T19-N: Kiro IDE 내장 Agent 전체 흐름 실측

> 2026-09-12, 분리 worktree `codex/kiro-native-integration-8f429f44`. Kiro IDE 1.0.437 / bundled Agent extension 1.0.794 / VS Code API 1.109.5, Node.js 24.19.0. 이 결과는 제품 기본 실행기를 바꾸거나 T19 Windows gate를 완료하지 않는다.

> **LOST_AFTER_REBOOT (2026-09-13):** 아래 `/private/tmp/vibe-*` worktree, Core SQLite DB, generated workspace, `connection.json`, receipt와 로그는 재부팅 뒤 존재하지 않는다. 아래 run ID와 상태는 재부팅 전의 역사적 관측이며 현재 재조회·재개 가능한 durable 상태가 아니다. 특히 이전 `node scripts/native-product-ui.mjs /private/tmp/vibe-native-product-5VQGUeNG/connection.json status ...` 명령은 실행할 수 없다. 구현 소스만 [별도 지속 linked worktree](../..)로 세션 패치 기록에서 복구했으며, 이 복구는 과거 DB·receipt 또는 단일 lineage 성공을 복원하지 않는다. 다음 실측은 새 root와 새 Project lineage에서 시작해야 한다.

복구 직후 Git 변경 경로·상태 62개는 재부팅 전 마지막 기록과 일치했다. 이는 파일 byte 동일성의 직접 증명이 아니므로 재생한 293개 성공 패치, 원래 실패한 패치 8개 제외, 포맷·검사와 파일 이름 변경 기록을 별도 로컬 audit에 보존했다. 복구본에서 Node 24.19.0/pnpm 11.12.0 `pnpm install --frozen-lockfile`, `pnpm build`, native 관련 Vitest 10파일·92개와 Discovery transport 3개가 통과했다. `pnpm check`는 format/lint/typecheck/DB/unit 24개/integration 248개/eval 23개/Campus Drop 3개/build/smoke 6개까지 통과했으나 이 sandbox의 Chromium MachPort 권한 오류로 E2E 12개가 실패해 **단일 명령 exit 0은 아니다**. 별도 GUI 권한의 `pnpm test:e2e` 재실행은 Chromium 12/12 통과했다. 이 UI 회귀 검증은 새 native Kiro 단일 lineage의 완료 증거가 아니며 그 실측은 아직 재검증하지 않았다.

## 최신 단일 프로젝트 실험의 현재 판정 (2026-09-13)

`/private/tmp/vibe-native-product-5VQGUeNG`의 **한 새 Core 프로젝트**에서 Kiro IDE 내장 Agent로 Preview 10개→선택 후보 JIT 1개→Spec draft를 실제 제출했고 합성 UI의 선택·확정 뒤 Core Task를 발급했다. 실제 제품 패널 History에서 같은 프로젝트를 복원해 Builder를 시작했고 native `get_builder_task`와 `start_task`의 Core side effect로 Task `PENDING` rev1→`ACTIVE` rev2를 확인했다. 2026-09-13 진단 run의 네 번째 native `update_build_context` 호출은 Core Context v1을 만들었다. generated app의 file/shell/build/test/complete/result, Episode→Analyst→다음 개인화는 **이 단일 계보에서 미도달**이다. 따라서 내장 Agent만으로 현재 MVP 전체를 해결할 수 있다는 판정은 아직 내리지 않는다.

Builder가 Kiro 내장 `search`를 사용하자 처음에는 permission을 local에서 선택했지만 observer의 일반 JSON-RPC 응답이 설치본 mux에서 폐기되어 tool이 멈췄다. 설치 Kiro 1.0.794의 전용 `_kiro/permission/respond`와 ACK 확인으로 고친 다음 동일 Task의 새 run에서 `search` pending→in_progress→completed를 실제 관측했다. 2026-09-13 새 진단 run에서도 search 완료와 Core `get_builder_task` 성공을 확인했다. 이어 `update_build_context` 3회는 실제 Core `SCHEMA_SHAPE` 오류였고 입력 키에 필수 `activeDecisionIds`가 3회, `relatedFiles`가 2회 빠졌다. 네 번째 입력에 두 필드가 들어가 Core Context v1이 저장됐다. Agent 의미 필드를 fixture로 대신 채우지 않았다. native shell의 `run_in_background` 입력은 bounded gate가 두 번 거절했고, `request_user_decision` 첫 호출도 Core 입력 오류로 실패했다. [상세 제품 run 기록](#2026-09-13-추가-재검증-제품-apiruns-native-relay)을 따른다.

재부팅 전 마지막 관측: 실험 worktree `/private/tmp/vibe-helper-native-impl-8f429f44`, Core root `/private/tmp/vibe-native-product-5VQGUeNG`, 연결 파일 `connection.json`, 같은 Project `project_ec3f7612-afc5-4250-a1c7-9c857649e0cf` / Task `task_b62ca05f-f218-484a-9254-dfaa1fd3d172`였다. 당시 Spec CONFIRMED, Task ACTIVE rev2, **Context v1**, Decision/완료 없음이었고 진단 run `run_a10f6f0e-88ff-42f2-9271-200bd47c156a`는 IDE Stop 뒤 `CANCELLED/CANCELLED`, native cancel 확인으로 종료됐다. 이 root와 `native-core-receipts.jsonl`·`native-worker-status.jsonl`은 현재 소실돼 이전 status 명령으로 같은 프로젝트를 재개할 수 없다. 재검증은 새 Core root에서 해야 하며 과거 receipt를 새 실측 결과로 사용하지 않는다.

Builder 진행 중 Helper는 다른 역할 세션으로 실제 claim됐으나 240초 native prompt timeout 뒤 취소 ACK를 받지 못해 `FAILED/NATIVE_CANCEL_UNCONFIRMED`였다. Builder UI Stop은 두 번 native `cancelled` 종료가 확인됐고 Core Task ACTIVE rev2로 보존됐다. 이 차이를 Helper 동시 응답 성공이나 모든 취소 보장으로 해석하지 않는다. shell top-level 허용은 package script 하위 실행을 OS에서 제한하지 못하는 별도 보안 gate 실패다. Kiro private API·버전 의존, 성능 동등성, Windows는 열린 제한이다.

## 이전 두 단계 실험(역사적 참조)

**Discovery부터 다음 개인화와 실행 가능한 결과까지 단일 실제 native lineage의 전체 완주는 검증되지 않았다.** 두 격리 실험에서 다음을 실제 Core side effect와 분리해 확인했다.

- 새 합성 프로젝트 `IIgHfL`: UI가 Discovery를 시작한 뒤 Kiro 내장 Discovery가 Candidate와 Learning Spec을 제출했다. 합성 UI 선택·확정 후 Core가 Task를 발급했고, 내장 Builder가 그 Task를 읽고 시작했다. 초기 `TASK_STARTED` Live Context는 테스트 fixture로 기록했다. 이후 내장 Builder가 파일 작성, Core Decision 요청, 합성 UI 선택 뒤 파일 수정과 Decision 적용까지 진행했다. 이 lineage에는 Helper/Episode/Analyst/후속 개인화 및 완료 결과가 없다.
- 별도 합성 프로젝트 `BeNACQ`: 확정 Spec/Task/초기 Context를 fixture로 준비한 후 내장 Builder의 파일·Decision·재개, 분리된 read-only Helper, 사용자 원문 UI provenance, Episode, 내장 tool-less Evidence Analyst, Core job `SUCCEEDED`, 승인 Evidence 1건과 이후 Evidence-aware Helper 답변을 확인했다. 이 성공을 위 Discovery lineage와 이어진 한 번의 실행이라고 세지 않는다.

MVP 대체 준비도는 **미확인**이다. `BeNACQ`의 생성물은 작은 TypeScript parser/renderer이지 Browser UI와 `.vibe-helper/result.json`을 포함한 완성 프로젝트가 아니다. 내장 Builder의 shell/build/test, `complete_task`, ResultRuntimeSupervisor health/open URL, canonical 10-preview/JIT Discovery, Windows, live-redacted UI stream이 관측되지 않았다. 기존 CLI/Crew 기본 경로를 유지한다.

| 단계 | 새 Discovery lineage `IIgHfL` | 별도 guided lineage `BeNACQ` |
|---|---|---|
| Discovery 입력 | 합성 UI 원문으로 실제 `UI_START_DISCOVERY` | Project/Spec/Task fixture seed |
| Discovery Agent | native `get_discovery_context` 및 한 Candidate `submit_candidate_round` Core 성공. 이후 native `submit_learning_spec` 성공 | 해당 없음 |
| 사용자 선택·Task | 합성 `SELECT`·Spec confirm, Core Task 발급 및 native `get_builder_task`/`start_task` 성공 | 확정 Task fixture |
| Builder Context | **초기 v1은 fixture**. Decision request가 v2, apply가 v3 저장 | **초기 v1은 fixture**. request/apply v2/v3 저장 |
| Builder 파일·Decision | native src 파일 생성·수정, Core request/result/apply, 합성 UI resolve와 동일 resolution 재전송 거절; 독립 Node24 parser 동작 검사 통과 | 같은 종류의 guided native 단계 검증 |
| Helper/Evidence | **NOT_REACHED** | 별도 Helper session/Core read, UI 원문 `USER_MESSAGE`·Agent 답 `AGENT_MESSAGE`, closed Episode, native Analyst strict result→Core job `SUCCEEDED`, accepted Evidence 1건 |
| 다음 개인화 | **NOT_REACHED** | 새 Helper correlation에서 `EVIDENCE_AWARE`, accepted Evidence ID basis·Ledger 1건, 실제 read receipt, 사용자 예측을 연결한 native 답변 |
| 제품 완료·결과 실행 | **NOT_REACHED** | **NOT_REACHED**; `complete_task`, build/test 명령과 Browser result 실행 미검증 |

## 재부팅 전 실제 receipt와 출처 (현재 소실)

새 lineage의 [Discovery retry](</private/tmp/vibe-native-discovery-IIgHfL/verification-retry2.json>)에는 native Candidate 성공과 합성 UI SELECT가 있고, [Spec 완료](</private/tmp/vibe-native-discovery-IIgHfL/verification-spec-retry.json>)에는 native `submit_learning_spec` 성공 및 Core-issued Task `task_20e5dc6d-e47f-4ec7-9f6b-3bb42e7fff00`이 기록돼 있다. [Builder 시작](</private/tmp/vibe-native-discovery-IIgHfL/verification-builder-start.json>)의 `get_builder_task` receipt는 정확한 Task ID를 대조하고 `start_task` 후 상태는 `PENDING` rev1→`ACTIVE` rev2다. [guided Decision](</private/tmp/vibe-native-discovery-IIgHfL/builder-decision/verification.json>)은 파일 실제 hash 변화, Core `request_user_decision`/`get_decision_result`/`apply_decision_result` 성공, Task rev2→3→4와 Context v1→2→3을 확인했다. 이 lineage의 중복 UI resolution 검사는 Task revision·Decision 수 불변을 확인했고, Event/Episode/job 중복 방지는 별도 ApplicationService regression test로 확인했다. `created`/`deleted` 렌더 동작 유지와 unknown-field rejection은 별도 Node24 실행 검사이며 Kiro Builder가 shell 테스트를 실행했다는 뜻은 아니다.

별도 lineage의 [Decision](</private/tmp/vibe-native-decision-BeNACQ/verification.json>), [Helper·Analyst](</private/tmp/vibe-native-decision-BeNACQ/helper-analyst/verification.json>), [Evidence-aware Helper](</private/tmp/vibe-native-decision-BeNACQ/helper-analyst/evidence-aware-retry1-verification.json>) 결과를 구분한다. `UI_RECORD_HELPER_EXCHANGE`의 합성 사용자 예측은 `USER_MESSAGE` source reference로 저장됐고 Helper 응답은 `AGENT_MESSAGE`다. native Analyst의 실제 JSON 응답을 `EvidenceAnalystJobAdapter`가 처리해 job이 PENDING rev1→SUCCEEDED rev3/attempt1이 됐고 `PREDICTION` Evidence `evidence_992ca13a-4f6d-4a37-bcb9-448f93fc6994`가 승인됐다. 이후 새 correlation의 Core Helper Context는 `EVIDENCE_AWARE`, 해당 Evidence ID가 basis에 있고 Ledger 1건을 담았다. Evidence의 `USER_MESSAGE` reference는 원 Episode의 사용자 event와 conversation/message ID로 resolve됐고 새 native Helper 답변이 판별식 좁히기와 런타임 unknown-field 검증에 관한 그 예측을 연결했다. 이해 상태는 Agent 출력으로 직접 승격하지 않고 기존 Core reducer가 결정했다.

첫 Helper와 다음 Helper가 같은 fixture correlation을 재사용하면 `#helperPersonalization`의 deterministic trace ID 캐시 때문에 이전 `NO_RELEVANT_EVIDENCE`가 그대로 전달되는 결함을 발견했다. `WorkflowRuntime`의 Helper turn마다 새로운 correlation을 발급하고 Agent invoke metadata와 UI exchange에 동일하게 사용하도록 수정했다. project/task scope는 그대로이며 두 turn의 다른 correlation과 각 Episode correlation 일치를 실제 ApplicationService·SQLite integration test로 확인했다. 기존 `core-only --native-role HELPER`도 Task correlation과 같은 값만 요구하지 않게 조정했다. 개인화가 나타난 재측정은 새 correlation을 사용했다. 첫 generic Helper 답변의 이전 사용자 발언 언급은 recent Episode 경로일 수 있으므로 Ledger 기반 개인화 증거로 세지 않는다.

Core의 또 다른 기존 결함으로 같은 Decision resolution을 새 idempotency key로 다시 보낼 때 resolution row는 NO_OP인데 Episode·job side effect가 반복될 수 있었다. `NO_OP`에서 즉시 receipt를 반환하게 수정했고 revision/Event/Episode/job 중복이 없음을 regression으로 확인했다. 이 수정은 native transport와 별개다.

## 실패·권한·성능 경계

첫 Discovery turn은 95.7초 동안 `submit_candidate_round` 오류 3회 후 timeout/cancel 미확인, 두 번째는 49.3초 동안 같은 오류 뒤 Agent가 중단했다. 수신한 MCP raw input shape에는 초기 Round에 필수인 `appliedFeedbackIds`와 `carriedCandidates`가 없었다. Agent의 "보냈다"는 진술만으로 transport 원인을 확정하지 않는다. bridge는 **첫 Round expected revision 1**에서만 Core `get_discovery_context`로 동일 project/session/correlation, ACTIVE rev1, Round 0, Feedback 0을 확인한 뒤 누락된 두 collection을 의미상 빈 배열로 복원한다. 명시적 null/string/잘못된 값, 다른 role/scope/revision은 변경하지 않는다. 이 경계의 3개 negative test가 통과했다. 그 다음 native Candidate submission이 실제 Core에 성공했다. 첫 Spec turn도 schema error 1회 후 95.0초 timeout/cancel 미확인으로 끝났고, 별도 Spec-only 최종 retry는 35.0초/end_turn/실제 Core submission으로 성공했다. 재시도·시간을 성능 동등성의 증거로 쓰지 않는다.

새 lineage의 native Task start는 Kiro startup 포함 25.8초, guided Builder 네 turn은 각각 26.8초/31.3초/38.7초/30.4초였다. 별도 lineage의 Helper 전후는 22.8초/23.8초, native Analyst prompt는 10.6초, Evidence-aware Helper는 22.3초였다. 모델 선택은 `auto`로 관측돼 기존 Discovery Haiku 고정 정책과 동등성을 주장하지 않는다. 이전 CLI/Crew run과 동일 조건 성능 비교는 수행하지 않았다.

내장 Agent 연결은 공식 extension API가 아닌 설치 버전 고정 private observer WS/ACP다. exact workspace endpoint와 mode 선택 응답을 확인하고 한 session만 소유한다. Core 도구는 기존 role-bound MCP handler를 fixed-target stdio bridge로 노출하며 bearer는 별도 전용 descriptor에서 메모리/0600 파일로만 사용하고 종료 시 revoke 표시한다. 모델 실행에 `kiro-cli`나 외부 LLM API를 사용하지 않았다. Kiro 자체가 새 합성 session/log를 사용자 허용대로 `~/.kiro`에 만들 수 있으나 기존 기록은 읽거나 수정하지 않았다.

Builder 파일 권한은 `/private/tmp`의 생성 workspace에서 `src/**` write와 `.kiro/**` deny, shell deny를 설정한 **합성 probe 범위**다. 이 설정은 OS sandbox와 동등하지 않고 모든 거절 패턴이 실제 실행으로 검증된 것도 아니다. Helper는 MCP `get_helper_context` 하나와 no-write/no-shell, Analyst는 tool-less 별도 session이었다. Adapter는 raw text chunk를 저장/표시하지 않고 종료 뒤 redaction한 텍스트만 전달한다(`textDelivery=AFTER_TURN`); wire chunk 관측과 live Builder UI stream parity는 다르다. 긴 Discovery timeout에서는 native cancel acknowledgment가 없었으므로 해당 turn은 성공/정상 중지로 세지 않았다. 전용 Kiro profile을 사용했고 종료 뒤 그 두 합성 root 경로를 가진 잔여 process는 확인되지 않았다. 기존 사용자 Kiro 창 상태는 이 검사로 판정하지 않는다.

Helper 답변 품질에도 제한이 보였다. 첫 답변은 사용자의 예측을 일부 "반대 결론"으로 소개해 설명이 부정확했고, 이후 답변은 이미 resolve/apply된 DATA_MODEL 선택을 열린 Spec 결정처럼 표현했다. Core 상태·Evidence 전달 성공과 답변 정확성을 구분한다.

## 재현·검증

복구한 작업 위치는 저장소 안 `.local-experiments/kiro-native-recovery`다. 아래 명령은 **새** 합성 DB/workspace/profile을 만들며 Kiro GUI 실행 권한이 필요하다. 기존 `/private/tmp` Core root와 연결 파일은 소실됐으므로 기존 프로젝트 resume 명령을 먼저 실행할 수 없다. `test-native-discovery-lineage.mjs`의 처음 실행은 역사적 실패와 초기 Role/transport 관측을 보존하므로 같은 성공을 보장하는 단일 안정 명령은 아직 없다. 후속 resume은 새 root의 정확한 상태를 전제로 한다.

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
pnpm install --frozen-lockfile
pnpm build
node --test scripts/native-discovery-transport.test.mjs
pnpm exec vitest run tests/unit/native-client.test.ts tests/unit/prepare-native-agent.test.ts apps/local-backend/test/native-core-binding.integration.test.ts packages/application/test/application-service.integration.test.ts
node scripts/test-native-discovery-lineage.mjs
# 새 root와 현재 Core revision을 출력 결과에서 확인한 뒤 해당 단계에 맞는
# test-native-discovery-spec-resume.mjs / test-native-issued-task-start.mjs /
# test-native-issued-decision-flow.mjs 소스의 입력과 gate를 검토해 이어간다.
```

이 단계별 script는 아직 범용 fresh-run 파이프라인이 아니다. 진행 중인 root의 상태에 맞는 후속 단계만 실행할 수 있고, `wx` artifact와 Core revision gate 때문에 이미 완료된 root에 다시 실행하면 안전하게 거절된다. 당시 `/private/tmp/vibe-native-discovery-IIgHfL`과 `/private/tmp/vibe-native-decision-BeNACQ`의 결과 JSON과 Core DB를 read-only로 검토했지만 재부팅 뒤 소실돼 현재 재조회할 수 없다. 당시 `pnpm check`의 format/lint/typecheck, unit/integration/eval, build/smoke는 모두 통과했다. 제한된 shell의 Chromium E2E 12개는 앱 실행 전 `MachPort permission denied (1100)`로 실패했지만, 같은 코드의 `pnpm test:e2e`를 GUI 권한으로 재실행해 12/12 통과했다. 따라서 단일 `pnpm check`의 exit 0이라고 기록하지 않는다. 당시 [전체 단계 로그](</private/tmp/vibe-native-full-check-review.log>)와 [E2E 재실행 로그](</private/tmp/vibe-native-full-e2e-review.log>)도 현재 소실됐다. clean install, Windows native/Kiro와 결과 URL 동작은 아래 후속 gate로 남긴다.

## 후속 gate

첫 `TASK_STARTED` Context를 **실제 native Builder**의 `update_build_context`로 작성하고, canonical 10-preview/JIT/refinement Discovery, 검증된 허용 파일/명령 경계 안에서 전체 Browser UI·test/build/entry/manifest를 실제 Builder가 생성·실행하며 `complete_task`/ResultRuntimeSupervisor health/open URL까지 한 Core lineage에서 확인해야 한다. 그 lineage에서 다시 Helper 원문/Episode/Analyst/다음 Helper·Discovery의 Evidence 사용과 frontend 재시작·중지·stream/cancel을 재검증해야 한다. 기본 CLI 경로 제거·제품 전환 판단은 그 뒤에 한다.

## 2026-09-13 추가 재검증: 제품 `/api/runs` native relay

사용자는 위 단계 script의 부분 성공 대신 현재 MVP 전체를 IDE 내장 Agent만으로 완료할 수 있는지 다시 검증하도록 요청했다. 격리 worktree에서 backend `native` 실행 경로와 기존 IDE 패널의 `/api/runs` 진입점 사이에 extension-host relay를 구현했다. backend는 Project·Task/Session/correlation에 묶인 역할별 MCP binding과 credential revoke를 소유하고, IDE extension host는 설치 Kiro의 private observer WS/ACP로만 Agent turn을 실행한다. CLI 모델 프로세스나 별도 LLM API를 호출하지 않는다. Builder native read/write/shell은 생성 workspace에 대한 permission `ask`와 기존 builder tool guard로 제한하도록 설계했고 Helper는 MCP context 하나, Analyst는 tool-less다. 설치 IDE가 permission 요청과 role config hot load를 실제로 어떻게 처리하는지는 아래 live gate로 남는다. redaction된 완결 줄 TEXT와 안전한 분류만 담은 TOOL update를 `/api/runs/{id}/events`로 보내며 최종 raw text chunk는 전송하지 않는다.

코드 수준에서 Node24/pnpm11 `pnpm typecheck`, 패널 bundle, native protocol/permission·role별 claim·제품 HTTP `/api/runs` 수락→exact-workspace claim→cancel/binding revoke/Core History 보존 회귀가 통과했다. 최종 변경에 가까운 회귀는 unit 23개, package/app integration 248개, prompt eval 23개, build와 smoke 6개가 통과했다. 당시 `pnpm check` 단일 명령은 이 제한된 shell에서 Chromium 시작 전 macOS MachPort Permission denied (1100)로 E2E 12개가 모두 실패했다. [당시 실행 로그](</private/tmp/vibe-native-product-5VQGUeNG/pnpm-check-latest.log>)는 현재 소실됐다. 복구본은 별도 GUI 권한 `pnpm test:e2e` 12/12를 다시 통과했으나 단일 `pnpm check` exit 0이나 native Kiro 완주 증거로 세지 않는다.

새 단일 합성 Core root `/private/tmp/vibe-native-product-5VQGUeNG`의 `project_ec3f7612-afc5-4250-a1c7-9c857649e0cf`에서 기존 frontend client `startDiscovery`로 PREVIEW run `run_3c2bc101-345c-4586-81af-c871c6846015`를 발급했다. 이 첫 turn은 Kiro worker가 300초 내 claim하지 않아 `FAILED/NATIVE_IDE_WORKER_UNAVAILABLE`로 종료됐다. durable Discovery Session은 revision 1, preview 0이며 같은 lineage에서 새 key로 retry 가능했다. 이후 같은 Core Project/Session의 재시도에서 실제 Kiro IDE Agent가 Preview·JIT·Spec을 제출했고 Core에 저장됐다. 첫 실패를 Kiro Agent의 불가능 판정으로 해석하지 않는다. 기존 CLI/Crew 기본 경로 및 T19 Windows gate는 유지한다.

수동 UI 합성은 `node scripts/native-product-ui.mjs <connection.json> status <projectId>`로 현재 Core 상태를 먼저 읽고, 전용 Kiro IDE worker가 활성화된 다음 `retry-preview`, `enrich-first`, `select-first`, `confirm`, `builder`, `resolve-recommended`, `helper <user-authored-text>`, `launch`를 상태에 맞게 순서대로 호출한다. 각 명령은 실제 frontend client의 제한된 UI API만 쓰고 Agent payload를 작성하지 않는다. backend 재시작 시 run stream은 transient여서 목록이 비지만 Project/Session·Task·Evidence는 SQLite에 남는다. 최초 실패는 재시작 전 run receipt이며 후속 성공과 합쳐 쓰지 않는다.

같은 project의 제품 run receipt (`/api/runs`와 durable Core를 각각 확인):

| 단계 | native run / Core receipt | 판정 |
| --- | --- | --- |
| Preview | `run_149faf82-52bb-4900-8034-96228cbe74fc` / preview 10개 | `SUCCEEDED` |
| 선택 Candidate JIT | `run_06c0801e-7903-4259-b590-b9f0957d4aa8` / enrichment 1개 | `SUCCEEDED` |
| 사용자 선택→Spec | `run_6e92b5cc-5ed0-4896-886d-4a4d1a50d56a` / Discovery revision 3, Spec DRAFT | `SUCCEEDED` |
| 사용자 Spec 확인→Core Task | `task_b62ca05f-f218-484a-9254-dfaa1fd3d172` / Spec CONFIRMED, Task PENDING rev1 | Core UI command 성공 |
| Builder 첫 진입 | `run_0f492fd0-e124-4986-8442-515d25469428` / Context 없음, Task 여전히 PENDING | `FAILED/NATIVE_WORKSPACE_UNTRUSTED`; generated workspace trust 대기 |
| trust 후 첫 Builder | `run_1c25b530...` / Task PENDING | `FAILED/NATIVE_ROLE_MODE_UNAVAILABLE`; trust 후 IDE 한 번 Reload 필요 |
| Builder Core 시작·중지 | `run_96ed031f-825b-4be6-8140-f4a11d0671ea` / `start_task`로 ACTIVE rev2, Context 없음 | wrong native `search` shape에서 정지, UI Stop 뒤 `CANCELLED`와 native cancel 확인 |
| 같은 Task 재개 | `run_004ea5b2-4a53-4d16-b070-48c9364112a9` / ACTIVE rev2, Context 없음 | native search pending; UI Stop 뒤 cancel 확인 |
| Helper 동시성 관측 | Builder `run_72f20d7c-6f41-4667-95fe-7cec3ef03fa9` 중 Helper `run_72a17f6a-b2f6-4feb-a6fa-cd04049e6536` | 서로 다른 역할 session claim; Helper `FAILED/NATIVE_CANCEL_UNCONFIRMED`, Builder UI Stop/cancel 확인 |
| private permission route 수정 후 | `run_85607b2c-17d8-46d8-ac21-608582fdd96f` / ACTIVE rev2, Context 없음 | search permission ACK와 native `completed`; Context tool 입력 오류 반복 후 UI Stop/cancel 확인 |
| 재부팅 전 진단 run | `run_a10f6f0e-88ff-42f2-9271-200bd47c156a` / ACTIVE rev2, Context v1 | Core `get_builder_task` 성공, search 완료; Context 3회 `SCHEMA_SHAPE` (`activeDecisionIds` 누락 3회, `relatedFiles` 누락 2회) 뒤 네 번째 성공; shell `run_in_background`는 permission DENIED/ACKED 2회; 첫 Decision 입력 오류; UI Stop 뒤 `CANCELLED`와 native cancel 확인 |

별도 Kiro development host는 Git link가 없는 synthetic debug-launcher 폴더에서 F5로 열었다. 원본 repository의 trust 요청은 승인되지 않았고 원본을 수정하지 않았다. 사용자 승인으로 정확한 debug-launcher 및 generated workspaces만 신뢰했고 보호를 비활성화하지 않았다. 첫 Builder 거절은 실제 trust gate의 실패 receipt이며, trust 후 처음 활성화된 Kiro Agent는 workspace role config를 읽지 못해 한 번 Reload했다. 이후 새 per-run role config는 정상 hot load됐다. 이 프로젝트에서 Builder의 source write·shell·Decision·complete_task·browser 결과·Helper 성공/Evidence/개인화는 아직 **미검증**이다.

위 마지막 세 transient run의 원문 없이 상태/TOOL 메타데이터만 [당시 receipt](</private/tmp/vibe-native-product-5VQGUeNG/run-receipts-pre-diagnostic.json>)에서 확인했지만 파일은 현재 소실됐다. 당시 backend 재시작은 transient run 목록을 비웠고 같은 Core Task ACTIVE rev2는 SQLite에 유지됐다. Kiro가 Builder 권한을 선택한 18:11:46의 `REPLIED`는 socket send 호출일 뿐 실제 승인 ACK가 아니었고 search가 pending으로 남았다. 설치 mux는 observer의 일반 permission 응답을 명시적으로 폐기했다. 전용 `_kiro/permission/respond`를 도입한 다음 18:18:30의 `REQUEST→SELECTED→SENT→ACKED`와 stream search completed를 확인했다. 이 private route와 observer 전체에 permission request를 broadcast하는 mux 동작은 1.0.794 설치 코드에만 고정한다. 후자의 foreign-session request는 다른 소유 세션이 답해야 하므로 이 client는 callback 전에 무응답으로 건너뛴다.

설치 IDE의 이전 합성 receipt에서 write input은 `{path,text}`, read input은 `{path,offset,limit}`이며 후속 update에서 structured `kind`가 생략될 수 있음을 확인했다. permission gate는 owned session/toolCallId의 첫 kind를 유지하고 정확한 필드와 크기·범위, canonical workspace·symlink·`.kiro`, 일회성 allow option을 검증한다. 다른 tool name/shape는 거절한다. newline을 건너는 secret prefix는 bounded buffer에 보류해 한 번에 redaction한다. TOOL stream은 구조화된 kind/status/해시 call id/안전한 상대 path/allowlist command/제한·재redaction된 output만 전달한다. 별도 synthetic package-script bypass probe는 `npm test`의 허용 top-level command가 악성 `package.json` script를 위임할 수 있음을 **실행 없이** 보였다. 따라서 shell guard를 OS containment로 판정하지 않으며 이 보안 gate는 FAIL이다.
