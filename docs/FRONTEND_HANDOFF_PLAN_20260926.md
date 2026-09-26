# Windows 프론트 연결 인계 계획과 요청서 답변

> 구현 후 현재 상태: [Windows 프론트 연결 가이드](FRONTEND_WINDOWS_QUICKSTART.md), [검증 결과](FRONTEND_HANDOFF_RESULTS_20260926.md)를 따른다. 아래는 2026-09-26 구현 전 승인한 계획을 보존한 기록이다. 이후 사용자 지시로 host·SDK·적용 패치·조립 도구를 구현했고 현재 PC의 실제 프론트 native 흐름을 검증했다. 다른 기기·외부 환경 검증은 이번 범위에서 제외했다. 외부 전달과 T19 전체 완료는 별도다.

## 1. 목표와 기준

프론트가 기존 Discovery·Spec·History 어댑터와 UI를 유지한 채 Windows의 실제 Core·Kiro Agent에 연결하도록 먼저 인계한다. 프론트 연결과 백엔드의 성능·Analyst 정확도·개인화 품질 개선은 병행한다. 기존 AC-MVP-012/015와 T19/T19-N의 전체 완료 조건은 유지한다.

- 요청 원문: [BACKEND_CONNECTION_REQUEST.md](https://github.com/Hello-KU-tty/program/blob/73d0eb58e374357d6f28ea8db13e9b659cec5e5a/BACKEND_CONNECTION_REQUEST.md).
- 프론트 검토 revision: `73d0eb58e374357d6f28ea8db13e9b659cec5e5a` (`main`, 2026-09-23). 이후 변경은 인계 전에 다시 대조한다.
- 백엔드 작업 branch: `codex/windows-extension-runtime-20260923`. 최종 인계 commit SHA는 아직 미확정이다. 현재 작업 트리나 기존 checkpoint를 최종 전달 revision으로 표시하지 않는다.
- 현재 Windows 검증 기준: [W5 일반 설치 결과](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md), [최종 감사](spikes/T19_W5_KIRO_1170_FINAL_AUDIT_20260925.json).
- 권위 있는 제품 요구: [PROJECT_BRIEF](../PROJECT_BRIEF.md), [SPEC](SPEC.md), [ARCHITECTURE](ARCHITECTURE.md), [DECISIONS](DECISIONS.md), [TASKS](TASKS.md).

요청서의 macOS 전용 지원·수동 Core 기동·connection 경로 입력은 당시 안내에 따른 구현이다. Windows W5 결과와 확장 자동 기동 요구에 맞춰 연결 방법을 갱신한다. frontend의 `LocalCoreDiscoveryPort`, controller, view model과 UI/UX를 우리 참조 패널로 교체하지 않는다.

## 2. 프론트 요청 A~D에 대한 답변

| 요청 | 현재 확인된 상태 | 전달할 답변과 준비할 것 |
| --- | --- | --- |
| A. 실행 가능한 Core와 native Agent | 일반 설치 VSIX에서 별도 Core process·SQLite·HTTP/SSE·native worker와 실제 Agent 수직 흐름을 검증했다. SDK만 설치하면 worker가 생기는 구조는 아니다. | 자동 Core와 worker를 함께 제공하는 host 연결 모듈, 준비 상태와 client 사용 예제. `/health`·worker 준비·실제 결과 저장을 구분한다. 수동 `core:native`의 stdout을 제품 준비 신호로 요구하지 않는다. |
| A. endpoint와 `connection.json` | 요청서의 local protocol 1, application/run/cancel/SSE 경로와 private descriptor 생성이 구현돼 있다. | 해당 revision의 SDK·타입·오류 계약을 제공한다. descriptor는 각 PC에서 host가 생성·관리하고 frontend host 내부에 연결한다. 사용자의 경로 입력이나 우리 PC의 token 전달을 요구하지 않는다. |
| B. 설치·배포 경로 | VSIX 0.3.15의 Windows 설치·자동 실행은 검증됐다. `program`에 삽입할 독립 host 모듈은 아직 제공되지 않았다. | 확인용 VSIX, 재사용할 host/portable 자산, SDK, 최종 source revision과 checksum 목록, 하나의 시작 문서를 준비한다. 사용자 설치와 개발자 source build 절차를 분리한다. |
| C. Windows 지원 | Windows x64 build 26200, Kiro 1.1.70 / Agent 1.1.158 / API 1.131.0의 exact source 조합에서 일반 설치를 검증했다. | frontend의 Windows 일괄 차단을 backend의 실제 지원 판정·준비 상태로 교체하는 예제를 제공한다. OS만 확인하고 모든 Kiro 버전을 허용하지 않는다. |
| C. 개발 도구 | backend는 Node 24.19.0 / pnpm 11.12.0으로 W5 전체 check를 통과했다. frontend가 보고한 pnpm 실패의 원인은 이 결과만으로 확정할 수 없다. | 검증된 도구 준비·frozen install 절차와 실행 결과를 제공한다. 개발 pin을 임의 변경하지 않는다. frontend의 기존 npm/TS/CJS 소비 환경은 별도로 확인한다. |
| D. 계약 안정성 | protocol 1, provenance/redaction, entity별 revision, idempotency와 backend instance 교체 계약을 유지한다. | 요청·응답·진행·실패·취소·복구 표와 지연/충돌 fixture를 제공한다. SDK/host 자산을 revision과 hash로 함께 고정하고 계약 변경 시 호환성·교체 절차를 기록한다. |

현재 확인용 설치물은 `dist/portable-win32-x64/vibe-helper-portable-core-0.3.15-win32-x64.vsix`이며 SHA-256은 `7f8914717bd5cb7c69687ed514988733ebeabc109e35c77145aadb72276957c8`다. 이 값은 W5에서 검증한 파일의 식별자다. host 분리 후 새로 만드는 설치물이나 아직 없는 외부 배포 링크의 식별자로 재사용하지 않는다.

다른 Kiro/Agent source와 Windows ARM64는 현재 지원으로 표시하지 않는다. macOS는 과거 실측 기록을 보존하되 이번 Windows 결과를 적용하지 않는다. Windows Helper/Analyst는 전용 보조 Kiro 창을 사용하는 경로다. 한 창 내부 동시 실행으로 안내하지 않는다.

## 3. 전달물과 책임

| 전달물 | 구성과 완료 기준 | 현재 상태 |
| --- | --- | --- |
| 요청서 답변·변경표 | A~D 답변, frontend 변경 위치, 현재 제한과 병행 backlog | 이 문서로 초안 작성 |
| host 연결 모듈과 예제 | 자동 runtime/Core/worker 준비, 지원 검사, client 연결·교체, 상태 구독, 종료와 복구. 기존 frontend activation/provider에 삽입하는 예제 | 참조 구현 존재, UI와 분리·외부 소비 검증 필요 |
| SDK·portable 자산·확인용 VSIX | ESM/CJS·타입, bridge/prompt/SQLite/migration/license와 package manifest. source SHA·각 artifact hash·생성 명령 포함 | 기존 build 경로 존재, 최종 인계 세트 미확정 |
| Windows 시작 문서 | 제품 설치와 개발 build, `program` 연결 위치, 오류/복구, 실제 지원표. 과거 macOS/CLI 안내로 되돌아가지 않는 진입점 | 현재 가이드의 갱신 필요 |
| 계약 예제·검증 결과 | 지연·실패·revision conflict fixture, 외부 소비 test, 실제 Core/IDE 연결 결과와 남은 범위 | 기존 회귀 재사용, 새 통합 경계 검증 필요 |

모듈 이름·export 이름·파일 배치는 구현 단계에서 고정한다. 아직 구현되지 않은 함수를 사용 가능한 API처럼 문서화하지 않는다. 공개 registry나 marketplace 배포를 이번 인계의 필수 조건으로 추가하지 않는다. 별도 repository를 유지해도 최종 사용자 설치물은 frontend와 실행부를 포함한 하나의 제품 확장으로 조립한다.

### 백엔드가 제공할 host 경계

- [portable 확장 진입점](../examples/kiro-panel/src/portable-extension.cjs)의 runtime/Core/worker 준비를 [패널 등록](../examples/kiro-panel/src/local-panel.cjs)과 분리한다. 기존 참조 패널도 같은 연결부를 사용해 이중 구현을 피한다.
- [Core lifecycle](../examples/kiro-panel/src/core-lifecycle.cjs), [connection 관리](../examples/kiro-panel/src/core-connection.cjs), [native worker](../examples/kiro-panel/src/native-worker.cjs)를 재사용한다. frontend가 private Kiro RPC·permission·MCP·process 제어를 다시 만들지 않는다.
- frontend host에는 generation을 고려한 client 접근과 안전한 준비/실패 상태를 제공한다. 오래된 client를 영구 보관한 채 credential 교체를 놓치지 않도록 한다.
- native 질문/응답, 생성 workspace 열기, 결과 실행, 중지와 오류 복구에 필요한 제한된 host action을 함께 정리한다. 범용 file/shell/MCP bridge를 추가하지 않는다.
- Core/worker의 다중 창 소유권은 host가 관리한다. 패널을 닫았다는 이유만으로 다른 창이 사용하는 Core를 종료하지 않는다.
- credential과 descriptor 경로는 host 안에 둔다. Windows private directory/ACL 검증은 제품 host/Core 경계를 재사용하며 SDK의 파일 reader만으로 검증됐다고 설명하지 않는다.

### 프론트가 유지·수정할 경계

- 기존 `LocalCoreDiscoveryPort`, Discovery/Spec/History port와 UI/UX를 유지한다. host가 준비한 client와 상태를 factory/provider에 연결한다.
- 새 UI의 상태 원본은 `LocalCoreClient`와 durable snapshot이다. 제한된 이벤트만 변환하는 `LocalProgramAdapter`를 모든 상태·권한·복구의 단일 원본으로 사용하지 않는다.
- 연결 준비, 실행 접수, 진행, 부분 결과, 저장 완료, 실패, 취소 요청과 확인된 종료를 화면에서 구분한다.
- Mock은 명시적 개발 모드로 둔다. 실제 연결 실패를 Mock 결과로 이어서 성공처럼 표시하지 않고 오류·재시도 상태로 다룬다.
- Builder/Helper stream·Decision·결과 실행·Evidence·Final Upgrade는 요청서에서 frontend 미구현으로 표시한 범위다. 계약과 참조 예제는 첫 인계에 함께 제공하고 화면 구현은 frontend가 순차 진행한다.

## 4. 실제 연결 전에 전달할 어댑터 수정 사항

다음은 위 frontend revision의 읽기 전용 소스 검토 결과다. 이 세션에서 `program`을 수정하거나 실행한 결과는 아니다. 실제 Core와 맞물리는 fixture·integration test로 수정 여부를 확인한다.

근거: [local-core-port.ts](https://github.com/Hello-KU-tty/program/blob/73d0eb58e374357d6f28ea8db13e9b659cec5e5a/src/adapter/flow/local-core-port.ts), [flow-port-factory.ts](https://github.com/Hello-KU-tty/program/blob/73d0eb58e374357d6f28ea8db13e9b659cec5e5a/src/adapter/flow/flow-port-factory.ts), [provider](https://github.com/Hello-KU-tty/program/blob/73d0eb58e374357d6f28ea8db13e9b659cec5e5a/src/agent-panel-view-provider.ts).

| 항목 | 관측과 영향 | 수정·검증 지침 |
| --- | --- | --- |
| Project/Session 식별자 | `tryResolveProjectId`가 `restoreProject(discoverySessionId)`를 호출한다. Core의 project 조회 인자와 맞지 않는다. | 시작/복원 응답에서 실제 두 ID의 관계를 유지한다. Session ID에서 Project ID를 추측하거나 fixture가 임의로 허용하지 않는다. 서로 다른 두 프로젝트와 재시작 복원으로 검증한다. |
| 비동기 Agent 결과 | enrichment·Spec 생성/수정이 `startRun()` 뒤 바로 snapshot을 읽는다. 접수 후 아직 저장되지 않은 정상 결과를 오류로 처리하거나 이전 revision을 반환할 수 있다. | run ID로 SSE/상태를 관찰하고 해당 작업의 durable 결과를 확인한다. 기존 preview·부분 결과를 보존하며 지연·실패·취소를 구분한다. 고정 sleep이나 무조건 mutation 재시도를 쓰지 않는다. |
| entity별 revision | Spec 수정이 같은 `env.expectedRevision`을 Session/Spec 양쪽에 사용하고 feedback 이후 Session revision을 `+1`로 추정한다. | 최신 응답/snapshot에서 각 entity의 revision을 읽는다. Session과 Spec revision이 다른 fixture, background 갱신과 stale 충돌을 검증한다. |
| preview의 feedback 대상 | 완성 round가 없으면 `currentRoundId()`가 `round_unknown`을 반환한다. preview 단계의 선택·조정과 맞지 않는다. | Core snapshot의 preview `finalRoundId`와 같은 candidate identity를 사용한다. [참조 handler](../examples/kiro-panel/src/local-panel.cjs)의 JIT/feedback 순서를 대조하고 background 완료 전 선택을 검증한다. |
| Windows 판정·자동 연결 | factory가 Windows를 무조건 차단하고 provider가 machine 설정의 connection 경로를 읽는다. | exact 설치 source를 검증하는 host 판정과 자동 준비된 연결을 사용한다. `win32` 조건만 삭제하거나 `/health`만으로 Agent 준비를 판정하지 않는다. |
| 실패·복구 | async factory는 연결 실패 시 reason을 붙여 Mock을 반환한다. 실행 중 credential/instance 교체 처리는 별도 계약이 필요하다. | live 실패는 저장 결과를 보존한 오류/재시도 상태로 표시한다. instance 교체 시 read-only restore, 미확인 mutation 무재전송과 중복 적용 방지를 검증한다. |

취소 API 호출이 언제나 새 `CANCELLED`를 만든다고 가정하지 않는다. 이미 끝난 run, 취소 확인 실패와 요청 접수를 구분하고 반환 상태·후속 이벤트를 읽는다. `SUCCEEDED/TURN_ENDED`도 Builder Task 완료나 검증 성공과 같지 않으므로 Task와 Completion Report를 별도로 조회한다.

## 5. 전달할 연결 계약

| 영역 | 유지·명시할 계약 |
| --- | --- |
| HTTP/인증 | protocol 1, `/health`, `/api/application`, `/api/runs`, 단일 run·목록·cancel·SSE. loopback과 host 내부 Bearer 사용, redirect 금지. 범용 Agent/state endpoint 추가 없음 |
| Discovery/Spec | SDK가 발급·반환한 Project/Session/Run ID, preview와 완성 round의 연결, JIT/수정/선택, entity별 revision, 명시적 Spec 확정과 Task 준비 |
| Builder/Helper | 같은 Project/Task에 역할별 run과 권한을 묶음. stream은 redaction된 실제 event, Agent turn과 durable Task 완료는 별도. 사용자가 입력한 선택·이유와 Agent 출력을 분리 |
| History/복원 | 빈 목록·진행 중·완료 및 권장 진입 화면. 조회만으로 Agent 호출 없음. 재시작 뒤 저장 결과 복원과 실행 중 stream 재연결 보장을 구분 |
| 오류/중복 | 원본 오류 code를 안전하게 유지하며 revision 충돌·미지원·연결 실패·Agent 실패 구분. 응답 유실 mutation은 자동 재전송하지 않음 |
| Evidence/분석 | 분석 실행 성공, Proposal 수락·기각, 이해 상태와 실제 개인화 품질을 분리. 현재 품질 제한을 숨기지 않음 |

DTO/schema 원본은 [local runtime 계약](../packages/contracts/src/local-runtime.ts), [UI 계약](../packages/contracts/src/ui-contracts.ts), [History/snapshot](../packages/contracts/src/ui-session.ts), [SDK](../packages/frontend-client/src/index.ts)다. 개발 fixture도 이 계약을 사용하며 사용자 Evidence로 저장하지 않는다.

## 6. 준비 순서와 완료 기준

| 단계 | 작업 | 다음 단계로 넘길 증거 |
| --- | --- | --- |
| 1. 계약과 답변 고정 | 이 문서를 frontend 최신 revision과 재대조. host 경계·지원 판정·오류·수정 예제를 확정 | A~D 답변, 적용 파일 목록, 제공/미제공 구분과 API 초안 |
| 2. host 연결부 준비 | 기존 runtime/worker/connection을 UI와 분리하고 `program` activation/factory/provider에 대응하는 최소 예제 작성 | 참조 패널 회귀, 지원 거절·준비·정리·rotation/no-replay 검증, 새 의존성·범용 권한 불필요 여부 확인 |
| 3. 외부 소비·Core 검증 | 기존 [독립 consumer 검사](../scripts/test-frontend-consumer.mjs)를 바탕으로 frontend의 TS/CJS 환경과 실제 Core를 확인. 식별자·revision·지연 결과 문제 검증 | SDK/host import·typecheck·bundle, fake client가 아닌 Core의 요청 수락·기각, 지연/실패 fixture PASS |
| 4. 최소 IDE 실연결 | 격리 합성 환경에서 자동 준비→새 Goal→preview/JIT·선택→Spec 생성·수정·확정→Task 준비→History 복원. stop과 오류 표시 포함 | 동일 lineage/revision, 실제 Agent와 저장 결과, 모델 없는 History 조회, 실패 원본·복구 기록 |
| 5. 인계 세트 고정 | 최종 revision의 clean checkout·빌드·package·문서 정합과 변경 범위 검증. SDK/host/설치물 hash를 함께 기록 | 최신 시작 문서, artifact 목록, 검증 명령/결과, 지원표·제한, frontend 적용 순서 |

단계 4는 먼저 준비된 Discovery·Spec·History 연결을 여는 기준이다. 나머지 Builder/Helper·Decision·결과 실행 화면의 frontend 연결 완료 또는 T19 전체 완료를 대신하지 않는다. W5의 두 실제 완주·설치 검증은 기존 근거로 재사용하고 host 변경이 영향을 주는 범위를 다시 검증한다.

소스 구현 단계의 전체 검증은 `pnpm check`, 관련 확장 CJS·host/SDK consumer·packaged 검증을 사용한다. 개발 도구는 Node 24.19.0 / pnpm 11.12.0, 설치는 `pnpm install --frozen-lockfile`이다. 단순 문서 작성 단계의 링크/정합 검사와 앱 실행 검증을 혼동하지 않는다.

최종 전달 manifest에는 다음을 실제 값으로 채운다. 미확정 값을 완료된 산출물처럼 배포하지 않는다.

- backend/frontend 기준 commit SHA와 SDK·host·VSIX 버전.
- artifact 파일명·크기·SHA-256, 빌드 명령·환경, 검증 결과 위치.
- 지원 OS/Kiro/Agent/API/source pin과 개발 도구, 조건부 runtime 다운로드 요구.
- 시작 문서, frontend 적용 파일·순서, 알려진 제한·복구와 후속 backlog.
- package에 DB/token/connection descriptor/개인 경로·대화 원문이 없는지 확인한 결과.

## 7. 인계 뒤 병행할 일과 유지할 제한

응답·기동 시간과 사용량, Analyst 의미 판정, Evidence 기반 답변 효과, 장기 반복성·추가 연결 단절 실측은 frontend 연결 작업과 병행한다. 이들 개선을 모두 끝낼 때까지 frontend 인계를 미루지 않는다. 계약·provenance·권한·저장 정합성을 깨는 결함은 인계 전에 해결하거나 해당 기능의 사용 제한을 명시한다.

- W5 Personal Need 흐름의 후속 Helper는 `NATIVE_ROLE_CATALOG_UNVERIFIED` 한 번 뒤 보조 창을 닫고 새 read-only 질문으로 복구했다. 진행 중 요청이 없고 실패가 확인된 경우의 절차를 인계한다. 무한 retry나 완료된 Builder mutation 재실행으로 처리하지 않는다.
- Analyst v1.0.7의 [마지막 전용 의미 평가](../tests/eval/results/evidence-analyst-v1.0.7.md)는 7개 중 3개 oracle PASS였다. W5 분석 job 성공은 이 품질 결함 해소의 증거가 아니다. UI 연결과 별도로 개선·평가한다.
- 생성 package script의 workspace 밖 간접 side effect에 대한 OS 수준 격리는 미입증이다. 기존 path/command/role guard의 범위를 정확히 설명하고 이를 보장된 OS sandbox로 표시하지 않는다.
- frontend 최종 디자인·실제 사람 학습 효과·CLI 정밀 성능 비교·다른 OS 지원은 이번 첫 연결 인계의 선행 조건으로 새로 추가하지 않는다.

frontend는 검증된 기준 revision으로 연결하고, backend는 별도 변경 단위에서 개선한다. 계약을 바꾸는 변경은 버전·변경표·회귀 결과를 함께 전달하며 frontend의 vendor 파일을 암묵적으로 갱신하지 않는다.

## 8. 이번 문서 작성의 범위

이번에는 계획서·결정 기록·다음 작업·기존 안내의 진입 링크를 갱신한다. host 모듈 분리, frontend 코드 수정, 새 모델 실행과 배포는 이 문서 작성의 실적으로 세지 않는다. commit/push·외부 전달은 기존 Git 지침과 사용자 요청 범위에 따라 별도로 수행한다. T19-W5 완료 기록은 유지하고, 상위 T19/T19-N은 완료로 바꾸지 않는다.

문서 검증: 변경 대상 문서 5개의 상대 링크 129개가 모두 존재하며 `docs/TASKS.md`의 다음 작업 표시는 T19 하나다. 변경 문서의 diff whitespace 검사와 새 계획서의 후행 공백 검사를 수행했다. 앱 코드·의존성 변경이 없는 문서 작업이므로 기존 W5 test 결과와 이번 문서 검증을 구분한다.
