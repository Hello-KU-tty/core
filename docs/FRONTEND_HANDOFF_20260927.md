# 백엔드 답변: 인계 적용 결과 확인과 Builder/Helper 연결 계약

2026-09-27. 프론트의 `BACKEND_HANDOFF_INTEGRATION_STATUS.md`(program `main` `048bce3`)에 대한 백엔드 답변과 다음 연결용 **update kit** `frontend-handoff-20260927` 안내다. 검증은 이 백엔드 Windows PC에서만 수행했다. 다른 기기 검증은 하지 않았다.

## 0. 요약

- **§1 기준 revision:** `73d0eb58`은 프론트 `main`에 있는 **PR #3 merge commit**이다. 작업 브랜치 `ed27132`와 tree가 byte 단위로 같다. 두 commit의 clean checkout에서 `apply-program.mjs --check`는 `core.autocrlf` true/false 모두 `READY`였다. 앞으로는 프론트 UI 파일을 patch하지 않는 update kit으로 인계한다(§2).
- **§3.4 교차 검증:** `main` clean clone에서 typecheck, 29 files/228 tests, build는 재현된다. 다만 VSIX 조립은 **실패**한다(`PORTABLE_INVENTORY_MISMATCH`). 원인은 저장소에 `portable/node_modules/` 28개(SQLite native binary 포함)가 커밋되지 않은 것과 Windows CRLF 변환이다. 프론트 PC의 VSIX는 ZIP에서 직접 복사한 로컬 파일로 만들어져 정상이었다. update kit이 추적 규칙을 추가해 이 문제를 고친다(§1.2).
- **§4 계약:** Builder/Helper/Decision/중지/추가 질문/workspace/결과 실행/Evidence/Final Upgrade 계약을 §3에 확정했다. reference panel JS에만 있던 판정 규칙은 SDK 타입 helper로 제공한다.
- **Core 결함 수정:** Final Upgrade 후보에 **취소·실패한 Helper turn의 trace가 섞이던 gap을 Core에서 막았다**(`FINAL_UPGRADE_HELPER_TURN_NOT_RECORDED`).

## 1. 요청 항목별 답변

### 1.1 `73d0eb58` 기준 문제 (§1, §5-1)

`git log --all`에서 `73d0eb5 Merge pull request #3 from Hello-KU-tty/feat/builder-helper-agent-panel`로 확인된다. `git diff ed27132 73d0eb5`는 비어 있다. 백엔드 PC에서 두 commit을 새로 clone해 재현한 결과는 다음과 같다.

| checkout | `apply-program.mjs --check` |
| --- | --- |
| `ed27132`, `core.autocrlf=true` | `READY` |
| `ed27132`, `core.autocrlf=false` | `READY` |

따라서 당시 `PROGRAM_FILE_CHANGED`는 kit 결함이 아니다. 적용 시점 작업 트리의 로컬 변경(예: 11개 대상 파일 중 하나의 미커밋 수정)으로 보인다. `git apply --3way` 결과는 백엔드의 적용 결과와 같다. 백엔드 consumer 검사가 `main` 기준으로 PASS했다(§4).

**앞으로의 방식:** kit은 이제 프론트 `main` HEAD(`048bce3`)를 기준으로 만든다. 프론트 UI 소스는 수정하지 않고 kit 관리 디렉터리만 교체한다.

### 1.2 교차 검증 결과와 저장소 추적 결함 (§3.1, §3.2, §3.4)

| 검증 (`main` `048bce3` clean clone) | 결과 |
| --- | --- |
| `npm ci --ignore-scripts` / `npm run typecheck` | PASS / exit 0 |
| `npm test` | 29 files / 228 tests PASS |
| `npm run build` | `dist/extension.js`, `dist/webview/main.js` 생성 |
| portable 무결성 (kit manifest 대비) | 116개 중 **28개 누락**, 80개 줄바꿈만 다름, 내용 변경 0 |
| `package-program.mjs` VSIX 조립 | **FAIL `PORTABLE_INVENTORY_MISMATCH`** |

원인은 두 가지다.

1. `.gitignore`의 `node_modules/` 규칙이 `portable/node_modules/`까지 제외했다. 그래서 `better-sqlite3` native binary(`prebuilds/win32-x64.node`)와 `drizzle-orm` 파일이 커밋되지 않았다.
2. Windows 기본 `core.autocrlf=true` checkout은 portable text 자산을 CRLF로 바꾼다. Core runtime은 **모든 portable 파일의 SHA-256을 시작 시 검사**하므로(`CORE_RESOURCE_HASH_MISMATCH`), byte가 달라지면 Core가 시작하지 않는다.

프론트 PC의 VSIX는 ZIP에서 풀어 둔 로컬 파일을 썼기 때문에 정상이었다. 다른 PC, CI, 새 clone에서는 재현되지 않는다. update kit은 아래 규칙을 추가해 이 문제를 고친다. 규칙은 이미 있으면 건너뛰는 append 방식이다.

```gitignore
# .gitignore
!/portable/node_modules/
```

```gitattributes
# .gitattributes
/portable/** -text
/vendor/frontend-client/** -text
/vendor/frontend-host/** -text
```

적용 뒤 결과를 커밋하고 **새로 clone한 저장소**(`autocrlf=true`)에서 확인했다. `--verify` 118개 byte 일치, typecheck, 228 tests, build, VSIX 조립(71 files)이 모두 통과했다.

### 1.3 런타임 실측 (§3.3)

이번 변경 뒤 모델을 호출하는 native 수직 흐름은 **다시 실행하지 않았다**. 근거는 두 가지다.

- 2026-09-26 인계 때 같은 PC에서 설치한 프론트 제품 VSIX로 native 4회를 통과했다(후보 10개 → JIT/선택 → Spec 1회/수정 2회 → 확정/Task READY → History 무재실행).
- 이번에는 프론트 `main`의 실제 controller/port를 갱신된 Core(HTTP/SSE/SQLite)에 붙인 consumer 검사를 다시 PASS했다(§4).

다른 기기 검증은 kit 범위 밖이다. 필요하면 프론트 데모 PC에서 §2 절차 뒤 §3.3 순서로 확인해 달라. 실패 시 status/error code와 `host.worker.getStatus()` 값을 보내 주면 된다.

### 1.4 지원 pin 확대 (§5-5)

현재 지원은 **Windows x64, Kiro 1.1.70 / Agent 1.1.158 / API 1.131.0**, Kiro commit `8ce1870416c7dc7e51fffb01765d93ef7ad55102`, Agent entry SHA-256 `cf6a5124f2fed75144b9d4236e0ffff85a5b22732d739807070783323c071b87`의 exact 조합뿐이다. 이번 인계에서 **확대하지 않는다**.

새 Kiro/Agent 버전은 private native API·권한·catalog 동작이 달라질 수 있다. 그래서 해당 버전 설치본으로 source capability spike와 수직 흐름을 다시 실측한 뒤에만 pin을 추가한다. 데모 PC 버전이 다르면 host가 `NATIVE_INSTALLATION_*`으로 fail-closed한다. 이때 History 조회는 가능하다. 데모 PC의 Kiro/Agent 버전을 알려 주면 그 버전을 다음 검증 대상으로 잡는다.

## 2. update kit 적용

백엔드 저장소 `codex/windows-extension-runtime-20260923` branch의 `releases/frontend-handoff/20260927/`에서 ZIP과 receipt를 받는다. ZIP은 GitHub에서 **Download raw file**로 받는다. `Get-FileHash -Algorithm SHA256` 값이 receipt의 `sha256`과 같은지 확인하고 푼다.

| 파일 | 용도 |
| --- | --- |
| `update-program.mjs` | kit 관리 디렉터리 교체. `--check`(읽기 전용 사전 검사), `--verify`(현재 상태 byte 검사) |
| `portable/` | Core·SQLite·migration·prompt·native worker·host. Core 수정 포함 |
| `vendor/frontend-client/` | SDK 0.1.0 + 새 helper(§3) |
| `vendor/frontend-host/index.d.ts` | host 타입. `NativeWorker` 확정 |
| `package-program.mjs`, `archive.mjs` | 제품 VSIX 조립(기존과 동일) |
| `reference/` | 백엔드 참조 패널 VSIX 0.3.17 |
| `verification/update.json` | 이번 검증 기록 |
| `manifest.json` | 기준 frontend revision, 이전 kit 관리 파일 hash, 파일별 SHA-256 |

```powershell
$kit = 'C:\dev\frontend-handoff-20260927'
$program = 'C:\dev\program'
node "$kit\update-program.mjs" $program --check
node "$kit\update-program.mjs" $program
Set-Location $program
git add portable vendor .gitattributes .gitignore
npm run typecheck
npm test
npm run build
node "$kit\update-program.mjs" $program --verify
node "$kit\package-program.mjs" $program
```

- `--check`는 파일을 바꾸지 않는다. 관리 디렉터리의 파일은 이전 kit 내용(CRLF 차이 허용)이거나 이번 kit 내용이어야 한다. 프론트가 `portable/`이나 `vendor/`를 직접 고쳤다면 `PROGRAM_MANAGED_FILE_MODIFIED: <파일>`로 중단하고 아무것도 덮어쓰지 않는다. 수정 내용은 관리 디렉터리 밖으로 옮긴다.
- 누락된 파일(현재 `main`의 `portable/node_modules/`)은 정상으로 보고 kit에서 복원한다. `git add` 뒤 새로 추적되는 파일이 31개 생긴다.
- UI 소스(`src/`, `media/`, `package.json`)는 건드리지 않는다. 기존 Discovery·Spec·History 연결은 그대로 동작한다.
- **SDK와 portable을 반드시 함께 교체한다.** Core 응답에 새 선택 필드 `helperConversations[].correlationId`가 추가됐다. strict schema를 쓰는 이전 SDK는 이 필드를 `INVALID_CORE_RESPONSE`로 거절한다. kit은 두 디렉터리를 한 번에 교체한다.
- 같은 Kiro에 이전 제품 VSIX가 설치돼 있다면 `package.json`의 `version`을 올려(예: `0.0.2`) 설치하기를 권장한다.

## 3. §4 연결 계약 확정

아래 helper는 모두 `vendor/frontend-client`에서 import한다. host(extension) 쪽에서만 호출한다. 모두 Core를 호출하지 않는 순수 함수다. Core가 모든 권한, revision, gate를 다시 검사한다. webview에는 결과 DTO만 보낸다.

```ts
import {
  entityId, uiMetadata, isRunActive, projectRunEvent, classifyBuilderTurn,
  createDecisionResolutionRequest, summarizeEvidenceTrace, eligibleFinalUpgradeTraces,
  classifyNativeWorkerStatus,
} from '../vendor/frontend-client';
```

### 3.1 Builder (§4-1)

```ts
const before = await host.client.restoreProject(projectId);
const task = before.currentTask; // null이면 Builder 불가
const run = await host.client.startRun({
  kind: 'BUILDER', projectId, taskId: task.id,
  expectedTaskRevision: task.revision, idempotencyKey: entityId('idem'),
  message, // 사용자가 입력한 원문
});
const terminal = await host.client.watchRun(run.id, event => {
  post(projectRunEvent(event)); // TEXT / TOOL / STATE / PERMISSION_DENIED
}, { signal, onRun: r => post({ run: r }) });
const after = await host.client.restoreProject(projectId);
const outcome = classifyBuilderTurn(terminal, after, task.id);
```

- **이벤트 스키마:** `LocalRunEvent.update`는 transport 진단값이 섞인 `record<string, unknown>`이다. 화면은 `projectRunEvent()`의 `RunEventView`만 쓴다. TOOL은 `toolId`, `tool`(`read`/`search`/`write`/`shell`/`core` 또는 transport 제목), `status`, `relativePath`, `command`, `exitCode`, `coreAction`, `errorCode`, `output`(Core redaction 후 최대 2,048자), `truncated`를 갖는다. `status`는 `RUNNING`/`SUCCEEDED`/`FAILED`/`UNKNOWN`이다. 같은 `toolId`는 한 행으로 갱신한다. 모르는 형태는 성공으로 추정하지 않고 `UNKNOWN`으로 둔다. 모든 문자열은 text로만 렌더링한다.
- **완료 판정:** `terminal.status === 'SUCCEEDED'`와 `outcome: 'TURN_ENDED'`는 **모델 turn이 끝났다는 뜻일 뿐이다**. `classifyBuilderTurn()` 결과는 다음과 같다.

  | kind | 의미와 UI |
  | --- | --- |
  | `TASK_COMPLETED` | Task `COMPLETED`이고 같은 Task의 Completion Report가 있다. 완료 표시·결과 실행 가능 |
  | `DECISION_REQUIRED` | pending Decision이 있다. §3.3 |
  | `TURN_ENDED_TASK_ACTIVE` | 완료가 아니다. 사용자가 새 메시지로 계속 진행 |
  | `FAILED` / `CANCELLED` | `errorCode`를 표시한다. 저장된 결과는 유지 |
  | `TASK_BINDING_CHANGED` | 현재 Task가 바뀌었다. snapshot을 다시 읽음 |
  | `RUNNING` | 아직 진행 중 |

- **시작 오류:** `RUN_BUSY`(같은 Project에서 같은 역할이 실행 중), `STALE_TASK_REVISION`(snapshot 재조회), `TASK_ALREADY_COMPLETED`, `TASK_BINDING_MISMATCH`, `RUNTIME_CAPACITY`(동시 4개 초과). 같은 `idempotencyKey`를 재전송하면 같은 run을 돌려준다. 다른 내용으로 재사용하면 `RUN_IDEMPOTENCY_CONFLICT`다.
- **창 전환:** Builder job은 Core가 발급한 생성 workspace에서 실행한다. 현재 창이 다른 폴더이고 실행 중 job이 없으면 worker가 **현재 창을 생성 workspace로 전환**한다(`vscode.openFolder`, worker 상태 `WORKSPACE_SWITCHING`). 이때 확장 host가 다시 시작되고 SSE도 끊긴다.
  - 재활성화 뒤에는 `listRuns(projectId)`에서 `isRunActive(run)`인 run을 찾아 `watchRun(run.id, …, { after: 0 })`로 다시 붙는다.
  - 마지막 선택 Project ID는 `context.globalState`에 저장해 둔다.
  - 전환이 확인되지 않으면 상태가 `WORKSPACE_SWITCH_UNCONFIRMED`/`WORKSPACE_SWITCH_FAILED`가 된다. job은 lease 만료 뒤 `NATIVE_IDE_WORKER_UNAVAILABLE`로 끝난다.
- **완료 뒤 재실행:** run 기록은 Core 프로세스 메모리에 최근 100개까지만 남는다. Core가 재시작되면 목록이 비고, durable 결과는 snapshot에 있다. `STREAM_DISCONNECTED_RESTORE_PROJECT`나 `RUN_NOT_FOUND_RESTORE_PROJECT`를 받으면 snapshot을 기준으로 삼는다. 응답을 못 받은 mutation을 자동으로 재전송하지 않는다.

### 3.2 Helper (§4-2)

```ts
const run = await host.client.startRun({
  kind: 'HELPER', projectId, taskId: task.id,
  ...(decisionId ? { decisionId } : {}), // 실제 pending/기존 Decision만
  idempotencyKey: entityId('idem'),      // 필수 (요청서 표에서 누락됨)
  message,                               // 사용자 질문 원문
  origin: 'FREE_TEXT',                   // 빠른 질문 버튼이면 'QUICK_ACTION'
});
```

- 답변은 TEXT 이벤트로 흐른다. 성공하면 `status: 'SUCCEEDED'`, `outcome: 'HELPER_RECORDED'`이다. 이때 Core가 질문과 답변 요약(답변의 마지막 240자)을 Helper Episode로 기록한다. 재진입 뒤에는 snapshot `helperConversations`에서 보인다. 답변 전문은 durable 저장하지 않는다.
- Helper는 read-only다. Builder를 재개하거나 Decision을 해결하지 않는다. Helper 질문과 답변만으로 이해 상태가 오르지 않는다.
- **Windows 동작:** Helper와 Evidence Analyst는 생성 workspace 옆의 별도 보조 폴더 `__vibe-native-helper-*`를 연 **보조 Kiro 창**에서 실행된다. 첫 Helper 요청 때 worker가 `HELPER_WINDOW_OPENING` 상태를 내며 새 창을 연다. 이 창을 닫으면 다음 요청 때 다시 연다. 같은 창 Builder 실행 중에도 Helper 병행이 가능한 이유가 이 분리다.
- 오류 `DECISION_BINDING_MISMATCH`(Task에 없는 Decision), `HELPER_EMPTY_RESPONSE`가 있다. 기존 W5에서 관측된 `NATIVE_ROLE_CATALOG_UNVERIFIED`는 보조 창을 닫고 새 질문으로 복구한다.

### 3.3 Decision → Builder 재개 (§4-3)

```ts
const s = await host.client.restoreProject(projectId);
const request = createDecisionResolutionRequest(s, {
  decisionId,
  selection: { kind: 'OPTION', optionId } /* | { kind: 'RECOMMENDATION' } | { kind: 'CUSTOM', customProposal } */,
  rationale,        // 사용자가 실제로 입력한 이유만. 없으면 생략. 생성 금지
  helperUsed,       // 이 Decision 화면에서 Helper를 실제 사용했는지
});
await host.client.execute(request);
```

- helper는 현재 pending 여부, 선택지 존재, custom 길이(4,000자 이하), 현재 `liveContext.contextVersion` 결합을 미리 검사한다. 실패하면 `DecisionInputError.code`를 던진다(`DECISION_NOT_PENDING`, `DECISION_OPTION_INVALID`, `DECISION_CUSTOM_INVALID`, `DECISION_CONTEXT_REQUIRED`).
- Core 쪽 오류는 다음과 같다. 다른 화면이나 Crew가 먼저 해결했으면 `DECISION_ALREADY_RESOLVED`, context가 바뀌었으면 `LIVE_CONTEXT_STALE`이나 다른 `DECISION_*` 코드가 온다. snapshot을 다시 읽고 사용자에게 다시 보여 준다. 같은 요청을 재전송하면 같은 receipt가 오고 중복 적용되지 않는다.
- **재개 계약:** 해결하면 Task는 `BLOCKED`에서 `ACTIVE`가 되고 Builder는 **자동 재개되지 않는다**. 사용자가 명시적으로 Builder 실행을 누르면 새 `startRun({ kind: 'BUILDER', expectedTaskRevision: 최신 revision, message })`을 보낸다. Builder는 `get_builder_task`로 해결 결과를 읽고 적용 기록(`decisions[].application`)을 남긴 뒤 계속한다. 적용되지 않은 Decision이 있으면 Task 완료가 거절된다.
- 이 전체 순서(Decision 요청 → Helper 기록 → Helper 취소 → 해결 → 오래된 revision 거절 → Builder 적용·완료)를 실제 HTTP/SSE Core와 SDK helper로 검증했다: `apps/local-backend/test/builder-helper-contract.integration.test.ts`.

### 3.4 실행 중지 (§4-4)

`cancelRun(runId)`는 run이 terminal이 될 때까지 기다린 뒤 결과를 돌려준다.

| 결과 | 의미 |
| --- | --- |
| `status: 'CANCELLED', errorCode: 'CANCELLED', outcome: 'NONE'` | **Core 쪽 중지 확정.** 해당 run의 Core 도구 binding을 즉시 revoke했다. 이후 그 Agent turn의 Core mutation은 모두 거절된다 |
| 이미 terminal이던 run | 그 terminal 상태 그대로 (성공한 run을 취소로 바꾸지 않음) |

- **native ACK:** Kiro 내장 Agent 세션의 종료 확인은 run 결과에 **포함되지 않는다**(typed ACK 없음). Core 중지 뒤에도 native가 진행 중이던 파일 쓰기나 shell 한 단계를 마저 끝낼 수 있다. UI는 "중지됨"을 표시하되, worker 상태가 `AGENT_ENDED_<ROLE>` 또는 `AGENT_SESSION_CLOSED_<ROLE>`(Helper 보조 창은 `BUILTIN_H_CANCEL_CONFIRMED_REUSABLE`)로 바뀔 때까지 "Agent 정리 중"을 함께 보여 주기를 권장한다.
- 다음 run을 바로 보내도 된다. worker는 같은 창의 이전 native 세션이 끝난 뒤에만 다음 job을 잡는다.
- SSE `AbortController`만 끊는 것은 취소가 아니다. 패널 dispose도 run을 취소하지 않는다.

### 3.5 native 추가 질문 (§4-5)

`host.worker`의 타입은 `vendor/frontend-host`의 `NativeWorker`로 확정했다.

- `listUserInputs(projectId)`는 현재 Project의 대기 질문(`NativeQuestion[]`)을 돌려준다. `subscribeUserInputs(cb)`는 알림만 준다. 알림을 받으면 목록을 다시 읽는다.
- 질문의 `role`에 따라 `taskId`(Builder/Helper) 또는 `discoverySessionId`(Discovery)가 현재 snapshot과 같은지 확인한 뒤 제출한다.
- `submitUserInput(answer)`의 반환값은 다음 중 하나다.
  - `SUBMITTED`
  - `ALREADY_SUBMITTED`: 같은 답변을 Kiro가 아직 처리하는 중
  - `ALREADY_HANDLED`: 같은 답변을 Kiro가 이미 처리함
- 실패 코드는 다음과 같다.
  - `NATIVE_USER_INPUT_STALE`: 질문 종료, job 종료, 다른 답변과 충돌
  - `NATIVE_USER_INPUT_RESPONSE_INVALID`: 형식 오류, 또는 자유 입력이 redaction 대상(비밀값·사용자 경로)을 포함함
  - `NATIVE_NOT_READY`
- 질문은 extension host 메모리에만 있다. Core에 저장되지 않는다. 창 reload나 job 종료 때 사라지고, 해당 native turn은 실패하거나 취소된다. 사용자 답변을 자동 생성하지 않는다.
- `getStatus()`와 `subscribeStatus()`는 **진단 문자열**이다(`WORKER_CONNECTED`, `AGENT_RUNNING_BUILDER` 등). `classifyNativeWorkerStatus()`로 `stage`/`role`을 얻어 표시만 한다. 접미사로 제품 로직을 분기하지 않는다. 문자열 목록은 호환성을 보장하지 않으며, 모르는 값은 `DIAGNOSTIC`이 된다.

### 3.6 생성 workspace 열기 (§4-6)

```ts
if ((await host.client.listRuns(projectId)).some(isRunActive)) throw new Error('WORKSPACE_SWITCH_REQUIRES_IDLE');
const s = await host.client.restoreProject(projectId);
const binding = await host.client.execute({ ...uiMetadata(s.currentTask.correlationId),
  kind: 'UI_PREPARE_BUILDER_SESSION', purpose: 'WORKSPACE_VIEW', projectId, taskId: s.currentTask.id });
await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(binding.workspaceDirectory), { forceNewWindow: false });
```

- `workspaceDirectory`는 Core가 검증한 생성 workspace root 안의 **절대 경로**다. host 안에서만 쓰고 webview에 보내지 않는다. webview에서 경로를 받아 열지도 않는다.
- 오류는 `BUILDER_SESSION_NOT_AVAILABLE`, `BUILDER_WORKSPACE_NOT_ASSIGNED`, `BUILDER_TASK_NOT_FOUND`다. `openFolder`는 창을 reload하므로 §3.1의 재활성화 복원을 적용한다.

### 3.7 결과 실행 (§4-7)

```ts
const r = await host.client.execute({ ...uiMetadata(s.project.correlationId),
  kind: 'UI_LAUNCH_RESULT', projectId, idempotencyKey: entityId('idem') });
if (r.status === 'RUNNING') await vscode.env.openExternal(vscode.Uri.parse(r.url));
```

- Core는 Task `COMPLETED`와 Completion Report를 먼저 확인한다(없으면 `GENERATED_RESULT_NOT_READY`).
- 그다음 생성 앱의 `.vibe-helper/result.json`에 있는 entry를 선택된 Node로 실행한다. 실행 전에 health 경로 응답을 확인한다.
- `RUNNING` 응답의 `url`은 schema가 `http://127.0.0.1:<port>/…`로 강제한다. 이미 떠 있고 health가 정상이면 `reused: true`로 재사용한다.
- 실패 코드: `RESULT_MANIFEST_INVALID`, `RESULT_ENTRY_NOT_FOUND`, `RESULT_PATH_ESCAPE`, `RESULT_WORKSPACE_NOT_FOUND`, `RESULT_PROJECT_RUNTIME_REQUIRED`, `RESULT_PROJECT_RUNTIME_UNAVAILABLE`, `RESULT_START_FAILED`, `RESULT_RUNTIME_CLOSED`.
- `openExternal`이 false를 돌려주면 URL을 보여 주고 수동으로 열게 한다.

### 3.8 Evidence·분석 (§4-8)

```ts
const trace = await host.client.execute({ ...uiMetadata(), kind: 'UI_READ_EVIDENCE_TRACE', projectId });
const view = summarizeEvidenceTrace(projectId, trace);
```

- `QUALITY_FAILED`/`NEEDS_REVIEW`는 백엔드 평가 harness 판정이다. **제품 API 필드가 아니다.** 제품 화면은 아래 두 값을 쓴다.
- Concept `displayState`의 값과 의미는 다음과 같다.

  | 값 | 의미와 표시 |
  | --- | --- |
  | `NO_STATE` | 아직 상태 없음 |
  | `OBSERVED_ONLY` | 코드·Agent 활동에서 관찰됨. **사용자 이해 아님** |
  | `USER_EVIDENCE_EXPLAINED` / `_DEMONSTRATED` / `_TRANSFERRED` | Core가 수락한 사용자 발화 Evidence가 뒷받침하는 상태 |

  `userUnderstandingCount`가 0이면 "학습됨/이해함"류 표현을 쓰지 않는다. Agent 설명, run 성공, 카드 클릭은 Evidence가 아니다.
- 분석 `displayState`는 `WAITING` / `ANALYZING` / `ANALYZED` / `ANALYSIS_FAILED`다. **`ANALYZED`라도 `acceptedCount`가 0일 수 있다.** 이 경우 `noEvidenceReason`을 보여 준다. 분석 완료를 학습 성공으로 표시하지 않는다.
- 실패한 분석의 재시도 순서는 다음과 같다.
  1. `UI_READ_ANALYSIS_JOBS`(status `FAILED`)로 job을 읽는다.
  2. 사용자가 명시적으로 누르면 `UI_RETRY_ANALYSIS`(`analysisJobId`, `expectedJobRevision`)를 보낸다.
  3. 오류: `ANALYSIS_RETRY_NOT_ALLOWED`, `ANALYSIS_JOB_STALE`.
- Evidence Analyst 의미 품질은 아직 개선 중이다(과수락 사례가 알려져 있다). 그래서 UI는 수락된 Evidence의 원문 excerpt와 근거를 함께 보여 주고 단정적 문구를 피한다.

### 3.9 Final Upgrade (§4-9)

- **gap 해소:** Helper가 context를 읽는 순간 PersonalizationTrace가 기록된다. 그래서 답변 전에 취소·실패한 turn의 trace도 남았다. 이제 Core는 같은 Project/Task/correlation의 Helper 답변이 **실제로 기록된 trace만** 허용한다. 아니면 `FINAL_UPGRADE_HELPER_TURN_NOT_RECORDED`로 거절한다.
- 후보 목록은 `eligibleFinalUpgradeTraces(snapshot, trace)`로 만든다. snapshot의 `helperConversations[].correlationId`와 대조하므로 취소된 turn은 나오지 않는다. 이 동작은 contract test에서 기록 1건, 취소 1건으로 검증했다.

```ts
await host.client.execute({ ...uiMetadata(s.project.correlationId), kind: 'UI_PREPARE_FINAL_UPGRADE_TASK',
  idempotencyKey: entityId('idem'), projectId, sourceTaskId: s.currentTask.id,
  expectedSourceTaskRevision: s.currentTask.revision, personalizationTraceId, userGoal /* 사용자 입력 */ });
```

- 거절 코드: `FINAL_UPGRADE_SOURCE_NOT_CURRENT`, `FINAL_UPGRADE_HELPER_TURN_NOT_RECORDED`, `FINAL_UPGRADE_ANALYSIS_REQUIRED`(해당 Task 분석 성공 전), `FINAL_UPGRADE_EVIDENCE_REQUIRED`, `PERSONALIZATION_TRACE_NOT_FOUND`, `BUILDER_TASK_STALE`. 거절되면 목록을 새로 읽는다.
- 성공하면 sequence 2 Task가 `READY`로 생긴다. 이후 흐름은 §3.1과 같다.

## 4. 이번 백엔드 검증

| 검증 | 결과 |
| --- | --- |
| 이전 kit 기준 재현 (`ed27132`, autocrlf true/false) | `apply-program --check` 모두 READY |
| `main` clean clone 정적 검증 | typecheck, 228 tests, build PASS / VSIX 조립 FAIL(§1.2) |
| update kit `--check` → 적용 → 커밋 → **새 clone** `--verify` | 118 파일 byte 일치, 추적 규칙 4개 |
| 새 clone의 frontend `npm ci`/typecheck/test/build/VSIX | PASS, 29 files/228 tests, VSIX 71 files |
| 프론트 TS 5.4.5에서 새 SDK helper·`NativeWorker` 타입 사용 | typecheck exit 0 (임시 probe) |
| 관리 파일 수정 시 | `PROGRAM_MANAGED_FILE_MODIFIED`로 중단, 변경 0 |
| 프론트 실제 controller/port + 갱신 Core consumer 검사 | PASS (11 checks, 지연 deterministic Agent) |
| Builder/Helper/Decision/취소 HTTP 계약 test | PASS (실제 loopback Core, deterministic Agent) |
| Final Upgrade 미기록 Helper turn 거절 | application integration PASS |
| SDK helper unit | 8 tests PASS |
| 백엔드 전체 `pnpm check` (Edge E2E) | exit 0: unit 113, integration 307 + 기존 skip 1, eval 35, Campus Drop 3, smoke 6, E2E 12 |
| 확장 host CJS 회귀 | 110 tests PASS |

검증의 Agent는 deterministic fixture이며 실제 모델 실행이 아니다. native 실측 근거는 2026-09-26 기록(`docs/spikes/T19_FRONTEND_HANDOFF_NATIVE_20260926.json`)을 유지한다.

## 5. 알려진 제한

- Kiro/Agent pin은 exact 1.1.70/1.1.158이다(§1.4). Windows x64만 지원한다.
- native 세션 종료 ACK는 run 계약에 없다(§3.4). native 추가 질문은 창 reload에서 유지되지 않는다(§3.5).
- run 기록과 이벤트 버퍼(run당 최근 500개 또는 1 MiB)는 Core 메모리에만 있다. durable 원본은 snapshot이다.
- Evidence Analyst 의미 품질, 개인화 효과, 성능 개선은 백엔드에서 병행 중이다. 상위 T19/T19-N과 MVP 완료가 아니다.
- History의 이전 진행 화면 전체 복원 UX는 프론트 범위다.
