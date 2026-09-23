# IDE-only frontend 구현 가이드

최종 판정일: 2026-09-16 KST. 이 문서는 새 frontend 작업의 기술 front door다. 시간순 실측과 예외는 [historical handoff](FRONTEND_IDE_HANDOFF_20260915.md), 최종 판단은 [cutover verdict](spikes/T19_NATIVE_IDE_CUTOVER_VERDICT_20260916.md)를 따른다.

> 2026-09-23 제품 요구 갱신: Windows가 주 사용 환경이며 제품 확장 설치만으로 Core·native worker까지 자동 준비해야 한다. 다음 작업은 [Windows 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)와 T19-W1부터 따른다. 아래 macOS exact pin·수동 `core:native`·connection 경로 설정은 기존 개발 baseline의 재현 방법이며 최종 사용자 설치 UX가 아니다. Windows native·자동 lifecycle은 아직 미구현/미검증이며 이 요구 갱신만으로 fail-closed를 해제하지 않는다.

## 개발 배경과 방향

초기 Core의 테스트용 frontend는 Kiro Crew였다. 구현 뒤 backend가 Crew 자체가 아니라 별도의 Kiro CLI를 사용한다는 사실을 확인했고, 백엔드 담당자는 이를 “IDE 내 학습”과 경진대회 출품 이후 다른 IDE로의 이식성을 추구하는 방향에 적합하지 않다고 판단했다.

현재 branch에서는 외부 Agent CLI 없이 Mac의 Kiro IDE로 제품을 만드는 IDE-only 경로를 테스트했다. 어느 정도 성공했지만 기존 CLI 경로만큼 안정적이지 않고 아직 experimental 기능이다.

Frontend 개발 담당 에이전트는 우선 Kiro-IDE-only frontend를 개발한다. Kiro IDE만으로 진행하기 어렵다고 판단되면 frontend 개발을 담당하는 사용자에게 명시적 합의를 요청한다. 제안에는 다음을 포함한다.

- 현재 Kiro IDE로 진행하기 어려운 이유.
- IDE 방식과 CLI 방식 각각의 장점과 단점.
- CLI를 사용할 경우 추구할 제품 철학 제안.
- 실제 사용자가 제품을 사용하는 구체적인 흐름.
- 백엔드 담당자와의 합의 요청.

사용자와 합의하기 전에는 CLI 경로로 일방적으로 전환하거나 조용히 fallback하지 않는다.

## 테스트용 프론트와 실제 프론트 설계

원래 Crew frontend와 현재 experiment/reference panel은 백엔드 담당자 관점에서 expected flow를 확인하려고 만든 단순한 테스트용 prototype이다. production frontend의 UI/UX, layout, information architecture 또는 interaction specification은 아니다.

Frontend 개발 담당 에이전트는 frontend 개발을 담당하는 사용자와 함께 실제 frontend를 자율적으로 설계한다. 학습자 필요에 따라 기존 테스트 UI를 재사용하거나 변경할 수 있으며, 화면 수·route·pane 구성·시각 스타일·interaction pattern도 제품 설계에서 결정한다.

## 1. 먼저 고정할 지원 경계

| 대상 | 판정 | frontend 표현 |
| --- | --- | --- |
| IDE-first frontend·계약 개발 | **GO** | 아래 기능 coverage와 Core 계약을 기준으로 실제 UI/UX를 자율 설계한다. |
| macOS arm64의 exact Kiro pin native 흐름 | **EXPERIMENTAL GO** | `macOS exact pin · experimental`을 항상 표시한다. |
| Evidence 품질·개인화 효과 | **NOT READY** | 근거와 `FAILED/NEEDS_REVIEW`를 보이고 학습 성공을 만들지 않는다. |
| Windows native, 다른 Kiro pin, production/marketplace | **NO-GO** | 실행 버튼 전에 fail-closed한다. |
| 기존 CLI/Crew 삭제 | **NO-GO** | source는 rollback·비교 근거로 보존하되 자동·조용한 runtime fallback으로 쓰지 않는다. |

지원 pin은 다음 하나다.

| 항목 | exact 값 |
| --- | --- |
| OS / architecture | macOS / arm64 |
| Kiro IDE | 1.0.437 |
| extension-host API | 1.109.5 |
| Kiro Agent extension | 1.0.794 |
| runtime source | `KIRO_IDE_1.0.437_AGENT_1.0.794_MACOS_ARM64` |
| packaged Core bridge Node | `/opt/homebrew/opt/node@24/bin/node`, 24.19.0 |
| repository pnpm | 11.12.0 |
| local protocol / client | 1 / 0.1.0 |

repository, backend와 독립 app-copy 검증은 Node 24.19.0에서 했다. 실제 final Builder native shell은 Node 26.4.0 / pnpm 11.12.0이었다. 따라서 native shell까지 Node 24로 고정됐다고 표시하지 않는다.

## 2. 검증된 것과 아직 아닌 것

| 상태 | 사실 |
| --- | --- |
| 검증됨 | 0.1.3 VSIX ordinary-profile install/reload/activation, exact source/asset/prompt gate |
| 검증됨 | 같은 Kiro `windowId=2`의 Builder + late protected Helper 3/3, confirmed Helper cancel/reuse |
| 검증됨 | 합성 UI Decision resolve → same-scope Builder apply/resume → Task `COMPLETED` revision 5 |
| 검증됨 | 생성 앱 33 tests/typecheck/build/smoke, independent app-copy hash, loopback result와 same-origin reload |
| 검증됨 | idle backend credential/instance rotation 뒤 read-only durable restore, mutation no-auto-replay source test |
| 검증됨 | frontend-client tarball의 TS 5.4.5 strict/CJS/esbuild 0.21.5 소비와 live Core read |
| 제한적 실패 | Analyst 1.0.7은 7/7 operation을 끝냈지만 semantic quality는 3/7 `FAILED` |
| 미검증 | Windows native, 다른 Kiro/Agent version, public/stable Kiro SDK 계약 |
| 미검증 | active SSE 또는 response-uncertain mutation 중 backend rotation의 end-to-end UX |
| 미검증 | cold-network 독립 install, OS-level package-script confinement, CLI latency/cost/완료율 동등성 |
| 미검증 | generated-result origin restart 복원, 사람 학습과 개인화의 인과 효과 |
| source baseline | `origin/codex/kiro-native-recovery-20260913`의 `445497b` 사용 가능; repository 없이 설치하는 backend binary/service/lifecycle UI는 미제공 |

위 판정은 동일 조건의 IDE-vs-CLI 안정성·성능 A/B benchmark 결과가 아니다. 현재 pinned private Kiro API 자체가 다른 IDE로의 이식성을 제공하지 않으며 IDE-only 구조도 별도 Node Core를 유지한다.

## 3. 실행 구조와 소유권

```text
Kiro Webview
  └─ credential 없는 semantic action / host가 만든 안전한 view model
       ↕ postMessage
Kiro extension host
  ├─ connection generation, action validation, view-model projection
  ├─ @vibe-helper/frontend-client → authenticated 127.0.0.1 HTTP/SSE
  └─ 기존 packaged native worker → pinned private Kiro mux/ACP
             ↕ native job / role-bound binding
별도 Node local backend
  ├─ deterministic Core, id/revision/idempotency/state machine
  ├─ SQLite durable Project/Episode/Evidence
  ├─ generated workspace/result process
  └─ Builder/Helper/Analyst role·MCP·revoke policy
```

| frontend 소유 | extension-host integration 소유 | Core/native adapter 소유 |
| --- | --- | --- |
| 사용자와 정한 UI/UX·IA, a11y, form validation, local selection | connection file 읽기, safe projection, action allowlist, stream subscription | Project/Task/Decision/Evidence 상태와 revision |
| loading/partial/stale/error/cancel-requested/restore UX | generation gate, read-only reconnect, no-replay mutation handling | private Kiro source/model/mode/catalog/permission gate |
| transient event와 durable state의 의미 분리 | loopback result URL와 workspace open 검증 | role-bound MCP, workspace/command guard, terminal revoke |
| Evidence provenance와 quality 경고 | credential/path/redaction boundary | Analyst job, deterministic Evidence reducer |

중요한 구현 선택:

- 새 frontend의 모든 기능 영역은 **`LocalCoreClient`가 canonical API**다.
- `LocalProgramAdapter`는 legacy `AgentAdapter` migration용 lossy seam이다. started/message/work/completed/failed만 내보내고 richer `STATE`, native ACK, revision과 error detail을 숨긴다. subscribe-only dispose도 없고 `cancel()`은 backend mutation을 호출한다. 새 UI의 상태 source로 쓰지 말고, 기존 composer를 잠시 연결할 때도 `LocalCoreClient` 기반 view model을 함께 둔다.
- frontend-client tarball만으로 native Kiro worker가 생기지 않는다. 현재 검증된 native path는 packaged 0.1.3 extension의 worker/permission/observer 구현이다.
- frontend가 private mux/ACP observer, permission 응답, role session 또는 MCP bridge를 다시 만들지 않는다. 현재 repository에서는 [extension handler](../examples/kiro-panel/src/extension.cjs), [native worker](../examples/kiro-panel/src/native-worker.cjs), [permission gate](../examples/kiro-panel/src/native-permission.cjs)와 [protected lifecycle](../examples/kiro-panel/src/protected-lifecycle.cjs)을 그대로 재사용한다. 외부 repository로 분리하려면 adapter 담당자가 먼저 이 경계를 package로 추출해야 한다.

Windows 제품 목표에서는 backend/adapter 담당이 이 경계와 Core package·runtime 선택·자동 기동/복구를 제공하고 frontend가 사용자에게 준비/연결/실패를 표시한다. runtime은 Kiro 내장 → 기존 호환 Node → 필요 시 private 자동 준비 순서로 검증한다. 소스 repository가 나뉘어도 사용자는 하나의 제품 확장을 설치하며 `connection.json`은 host 내부에서 관리한다. `health()` 성공과 native worker 준비·실제 Agent 결과 저장을 구분하고 live 실패는 명시적으로 보여준다.

## 4. source에서 시작하는 portable 경로

아래 placeholder를 각 컴퓨터의 **절대 경로**로 바꾼다. source baseline은 `origin/codex/kiro-native-recovery-20260913`의 `445497b`에 있고 backend installer는 아직 없으므로 repository checkout이 필요하다.

```sh
cd "<vibe-helper-recovery-checkout>"
node --version   # v24.19.0 exact
pnpm --version   # 11.12.0 exact
pnpm install --frozen-lockfile
pnpm build
pnpm panel:build

pnpm core:init --root "<absolute-empty-local-core-root>"
VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1 \
  pnpm core:native --root "<absolute-empty-local-core-root>" --port 0
```

backend가 `NATIVE_READY`를 출력하고 `/health`의 Agent source가 `KIRO_IDE_BUILTIN_AGENT`인지 확인한다. `core:doctor --live`는 Kiro CLI 2.21.1 경로라 IDE-only gate가 아니다. backend와 Kiro IDE는 별도 process다.

VSIX도 source에서 만든다.

```sh
pnpm panel:pack
pnpm client:pack
pnpm test:client-consumer \
  "<absolute-empty-local-core-root>/connection.json"
```

`panel:pack`이 출력한 새 archive와 digest를 사용한다. 검증 receipt인 0.1.3 archive는 575,538 bytes, SHA-256 `88f21a8bfef37355b143c549d6cf6ef112b30c32b2e058c6c42ba6593a31f3c4`였지만 `/private/tmp`의 과거 경로는 배포 경로가 아니다. VSIX에는 Webview/extension/native bridge/prompt assets가 있고 Node binary, backend, SQLite, token, Kiro는 없다.

Kiro에서 VSIX를 설치하고 machine setting `vibeHelper.connectionFile`에는 `<absolute-empty-local-core-root>/connection.json`의 절대 **파일 경로만** 넣는다. token을 복사하지 않는다. Command Palette에서 `Vibe Helper: Open Local Integration Panel`을 실행한다.

## 5. 실제 SDK anchor

public package export는 [frontend client](../packages/frontend-client/src/index.ts)와 [Node-only connection reader](../packages/frontend-client/src/node.ts)다.

| API | 용도 | 주의 |
| --- | --- | --- |
| `connectLocalCore(file)` | private descriptor 읽기 + `health()` | extension host only |
| `health()` | protocol/backend instance/Agent source 확인 | 화면 성공 판정 아님 |
| `execute(request)` | typed `UiRequest` → kind별 validated response | mutation 자동 retry 없음 |
| `listProjects(limit?)` | `ProjectHistory` | read-only, 모델 호출 0 |
| `restoreProject(projectId)` | `ProjectSessionSnapshot` | durable truth; host에서 Webview model로 변환 |
| `startDiscovery(input, options?)` | Project 생성 + PREVIEW run | `{ projectId, run }` 반환 |
| `startRun(LocalRunInput)` | Discovery/Builder/Helper run 시작 | fresh revision/key 사용 |
| `getRun(id)`, `listRuns(projectId)` | transient run 상태 | backend restart 뒤 과거 run 없음 |
| `watchRun(id, onEvent, options?)` | SSE `LocalRunEvent`; `signal`, `after`, `onRun` | Abort는 구독만 중단 |
| `cancelRun(id)` | 사용자가 명시한 Core cancel mutation | native process 종료 receipt 아님 |
| `entityId(prefix)`, `uiMetadata(correlationId?)` | 새 entity/idempotency와 UI metadata | correlation은 해당 durable entity에서 읽기 |

주요 DTO source:

- [UI request/response](../packages/contracts/src/ui-contracts.ts): `UiRequest`, `GeneratedResultDescriptor`, `PreparedBuilderTaskDescriptor`, `BuilderSessionBindingDescriptor`.
- [durable session](../packages/contracts/src/ui-session.ts): `ProjectHistory`, `ProjectSessionSnapshot`, `DecisionSessionItem`.
- [transient runtime](../packages/contracts/src/local-runtime.ts): `LocalRunInput`, `LocalRun`, `LocalRunEvent`, `LocalConnection`.

`ProjectSessionSnapshot`은 extension host가 읽는 canonical durable DTO이고 현재 schema에는 `workspaceDirectory`가 없다. 그래도 typed snapshot과 sanitized event를 화면별 Webview model로 projection해 필요한 필드만 보낸다. 절대 `workspaceDirectory`는 `UI_PREPARE_BUILDER_SESSION`의 `BuilderSessionBindingDescriptor`에만 있으며 connection object와 함께 host-only로 유지한다.

## 6. reference 기능 영역과 action mapping

아래는 필요한 기능 coverage와 현재 reference action 이름을 정리한 표다. 네 개의 별도 화면, 현재 route/layout 또는 동일한 interaction을 요구하는 제품 UI 명세가 아니다.

| 기능 영역 | Webview reference action | extension-host API / request | 성공 source |
| --- | --- | --- | --- |
| Discovery | `start` | `startDiscovery({ learningGoal, personalNeed? })` | durable Discovery Session + preview revision |
| Discovery | `retryDiscovery` | `startRun({ kind:'DISCOVERY', phase:'PREVIEW'|'ENRICH_ALL'|'ROUND', ... })` | fresh snapshot의 current Session/Round |
| Discovery | `feedback` | 누락 target `ENRICH_SELECTED` → durable enrichment 확인 → exact candidate ID/revision의 `UI_RECORD_DISCOVERY_FEEDBACK` → `ROUND`/`MERGE`/`SPEC` | feedback receipt 뒤 new durable revision |
| Spec | `refineSpec` | Discovery run `phase:'SPEC'`, `message`, `expectedSpecRevision` | higher `learningSpec.revision` |
| Spec | `restartDiscovery` | `UI_RETURN_TO_DISCOVERY`, 이어 `PREVIEW` | Project/Session snapshot |
| Spec | `confirm` | `UI_CONFIRM_LEARNING_SPEC` → fresh restore → `UI_PREPARE_BUILDER_TASK` | `currentTask` / prepared descriptor |
| Builder | `agent: BUILDER` | `startRun({ kind:'BUILDER', taskId, expectedTaskRevision, message, ... })` | stream + fresh `currentTask/liveContext` |
| Helper | `agent: HELPER` | `startRun({ kind:'HELPER', taskId, decisionId?, message, origin, ... })` | `HELPER_RECORDED` + Helper conversation/Episode |
| Builder/Helper | `decision` | `UI_RESOLVE_DECISION` with current Context version and USER-source resolution | `decisions[].resolution`, then Builder application |
| Builder/Helper | `cancel` | `cancelRun(runId)` | Core cancel acceptance; native ACK 별도/미노출 |
| Builder | `openWorkspace` | idle 확인 뒤 `UI_PREPARE_BUILDER_SESSION`, `purpose:'WORKSPACE_VIEW'` | READY binding; host만 absolute path 사용 |
| Builder | `launch` | `UI_LAUNCH_RESULT` | `RUNNING` + validated `http://127.0.0.1:<port>/` |
| History | `history` / `refresh` | `listProjects()` → `restoreProject(projectId)` | durable snapshot; run 자동 시작 없음 |

Discovery candidate는 `{candidateId, revision}`로 join한다. preview와 enrichment가 부분적으로 도착할 수 있으므로 array index를 identity로 쓰지 않는다. Spec/Task/Decision mutation은 클릭 시점의 fresh snapshot revision을 사용한다. Builder run `SUCCEEDED/TURN_ENDED`는 Task `COMPLETED`나 test PASS가 아니며, Completion Report도 Agent-authored 보고다.

Spec에서 Discovery 화면만 다시 보는 navigation은 model call 0회다. 사용자가 입력을 바꾸고 재생성을 명시한 `restartDiscovery`에서만 `UI_RETURN_TO_DISCOVERY` 뒤 새 `PREVIEW`를 시작한다.

Final Upgrade는 첫 PR의 완료 조건으로 두지 않는다. 현재 `PersonalizationTrace` 생성과 성공한 `HELPER_RECORDED` eligibility가 완전히 연결되지 않아 취소된 Helper trace가 후보로 보일 수 있다. frontend-only 추정 필터 대신 Core가 same-correlation CLOSED Helper Episode + `HELPER_RESPONSE`를 검증한 authoritative list를 제공할 때 연결한다.

## 7. TypeScript 통합 골격

다음은 API 사용 순서를 보여주는 **source-accurate pseudocode**다. message parser, safe projection, generation manager, error mapping과 dispose를 생략했으므로 production-complete sample이 아니다.

```ts
import {
  entityId,
  uiMetadata,
  type LocalCoreClient,
  type LocalRun,
  type LocalRunEvent,
  type ProjectSessionSnapshot,
} from '@vibe-helper/frontend-client'
import { connectLocalCore } from '@vibe-helper/frontend-client/node'

let client: LocalCoreClient = await connectLocalCore(connectionFilePath)
let selectedProjectId: string | undefined

async function restoreForHost(): Promise<void> {
  const history = await client.listProjects()
  const snapshot = selectedProjectId
    ? await client.restoreProject(selectedProjectId)
    : undefined

  webview.postMessage({
    kind: 'restored',
    history: projectHistoryView(history),
    snapshot: snapshot ? safeProjectView(snapshot) : undefined,
  })
}

async function startBuilder(text: string): Promise<LocalRun> {
  if (!selectedProjectId) throw new Error('PROJECT_REQUIRED')
  const snapshot = await client.restoreProject(selectedProjectId)
  if (!snapshot.currentTask) throw new Error('TASK_REQUIRED')
  return client.startRun({
    kind: 'BUILDER',
    projectId: selectedProjectId,
    taskId: snapshot.currentTask.id,
    expectedTaskRevision: snapshot.currentTask.revision,
    idempotencyKey: entityId('idem'),
    message: text,
  })
}
```

구독도 mutation과 분리한다.

```ts
const subscription = new AbortController()

const watching = client.watchRun(
  run.id,
  (event: LocalRunEvent) => renderSafeEvent(event),
  {
    signal: subscription.signal,
    onRun: (current) => renderRunState(current),
  },
).then(async (terminal) => {
  await restoreForHost()
  return terminal
}).catch((error) => {
  if (!subscription.signal.aborted) renderStreamError(error)
  return undefined
})

function disposeView(): void {
  // panel hide/dispose: SSE 구독만 끝낸다.
  subscription.abort()
}

async function onExplicitUserStop(): Promise<void> {
  // watcher가 진행 중이어도 별도의 사용자 "중지" action에서만 호출한다.
  const coreCancel = await client.cancelRun(run.id)
  renderCoreCancelAccepted(coreCancel)
}
```

`coreCancel.status === 'CANCELLED'`는 Core가 취소를 수락했다는 뜻이다. 실측에서는 이 상태가 native terminal ACK보다 먼저 기록됐다. 현재 SDK에는 typed native ACK receipt가 없으므로 `모델 종료 확인`으로 번역하지 않는다. `LocalProgramAdapter.cancel()`도 이 한계를 해결하지 않는다.

Decision mutation은 현재 entity correlation과 Context version을 사용한다.

```ts
const snapshot: ProjectSessionSnapshot = await client.restoreProject(projectId)
const decision = snapshot.pendingDecisions.find((item) => item.id === decisionId)
if (!decision || !snapshot.liveContext) throw new Error('DECISION_STALE')

await client.execute({
  ...uiMetadata(decision.correlationId),
  kind: 'UI_RESOLVE_DECISION',
  idempotencyKey: entityId('idem'),
  resolution: buildValidatedUserResolution(
    decision,
    snapshot.liveContext.contextVersion,
    form,
  ),
})
await restoreForHost()
```

`buildValidatedUserResolution`은 option 또는 custom proposal, 선택적 rationale, `source:{kind:'USER'}`, matching correlation과 current Context version을 만드는 host 함수다. Agent 문장, quick-action click이나 단순 확인을 USER 이해 Evidence로 바꾸지 않는다.

## 8. generation, revision, idempotency와 restore

현재 검증된 정책은 [connection manager](../examples/kiro-panel/src/core-connection.cjs)와 [reference handler](../examples/kiro-panel/src/extension.cjs)에 있다.

1. connection descriptor가 바뀌면 새 client/health를 하나만 만든다.
2. generation과 restore sequence를 올리고, 이전 async restore가 늦게 끝나도 화면에 publish하지 않는다.
3. 기존 SSE AbortController를 끝낸다. connection rotation에서는 active/retained stream을 자동 reattach/replay하지 않는다.
4. `UI_LIST_PROJECTS`, `UI_RESTORE_PROJECT_SESSION`, `UI_READ_ANALYSIS_JOBS`, `UI_READ_EVIDENCE_TRACE` 같은 read만 한 번 재시도한다.
5. mutation은 Core에 도착한 뒤 response만 유실됐을 수 있다. 자동 재전송하지 않고 `CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED`를 보여준 뒤 durable snapshot과 사용자 확인으로 돌아간다.
6. 새 사용자 action마다 새 idempotency key를 만든다. response uncertainty의 정확히 같은 body/key 재사용 여부를 화면이 임의 판단하지 않는다.
7. `STALE_*_REVISION`은 fresh snapshot → form intent 재확인 → 새 mutation 순서로 처리한다.

같은 backend에서 panel만 닫았다 다시 열면 `listRuns()`로 active run을 찾아 구독할 수 있다. panel dispose의 Abort는 backend cancel이 아니다. backend instance rotation은 이 경로와 다르며 durable state만 복원한다. active-operation rotation end-to-end는 아직 미검증이다.

## 9. Webview 보안 경계

- `connection.json`, `LocalConnection`, bearer와 `Authorization`은 extension host 밖으로 보내지 않는다.
- typed `ProjectSessionSnapshot`과 sanitized event를 화면별 model로 project한다. `UI_PREPARE_BUILDER_SESSION`의 absolute `workspaceDirectory`와 connection object는 host-only다.
- Webview→host는 discriminated semantic action만 받고 kind/type/length/현재 화면 ownership을 다시 검증한다.
- 임의 URL/HTTP, MCP, SQL, file, shell, command bridge를 만들지 않는다.
- Agent text/tool detail은 untrusted다. HTML injection 없이 `textContent` 또는 검증된 renderer를 쓴다.
- workspace absolute path는 `vscode.openFolder` 직전 host에서만 쓰고 UI/log/durable state에 노출하지 않는다.
- result는 `UI_LAUNCH_RESULT`의 `RUNNING`이며 `http://127.0.0.1:<valid-port>/`인 경우만 `openExternal`한다.
- CSP nonce와 제한된 `localResourceRoots`를 유지한다. credential, 개인 경로와 raw model transcript를 screenshot/log에 남기지 않는다.

[connection reader](../packages/frontend-client/src/node.ts)는 absolute regular non-symlink file, 16KiB 상한, POSIX private mode, loopback URL과 64-hex token을 검사한다. 이를 Webview에서 다시 구현하지 않는다.

## 10. 첫 frontend PR 순서와 검증

이 순서는 위 **개발 배경과 방향** 및 **테스트용 프론트와 실제 프론트 설계**를 따른다. 첫 PR은 Kiro-IDE-only로 시작하고, Kiro IDE만으로 진행하기 어렵다면 위 내용을 포함해 프론트 담당 사용자에게 명시적 합의를 요청한다. 다음은 기능 계약을 위험이 낮은 순서로 연결하는 예시일 뿐 화면 수, IA, layout, repository 또는 구현 순서를 강제하지 않는다. `examples/kiro-panel/media`를 reference로 삼아 재사용하거나 실제 frontend 설계에 맞게 변경할 수 있다. 현재 검증된 native adapter/handler 재사용을 권장한다.

1. 지원 boundary와 필요한 기능 navigation/state model을 설계한다. 하나 또는 여러 화면인지는 제품 설계 결정이며, unsupported OS/pin에서는 native action을 disabled한다.
2. `ProjectHistory`/`ProjectSessionSnapshot`을 host-side safe view model로 변환하고 History read-only restore를 먼저 연결한다.
3. Discovery preview/partial enrichment/ID+revision selection과 stale UX를 연결한다.
4. Spec refine/confirm/prepare의 두 단계 durable 성공을 연결한다.
5. Builder와 Helper composer, stream, Decision, cancel-requested/Core-accepted/native-unconfirmed 상태를 연결한다.
6. result launcher와 read-only restart restore를 연결한다. mutation/SSE auto replay는 넣지 않는다.
7. Evidence에는 provenance와 `QUALITY_FAILED/NEEDS_REVIEW`를 표시한다. Final Upgrade eligibility는 위 Core gap이 닫힐 때까지 제외한다.
8. keyboard/focus/label/색상 비의존 상태와 좁은 pane을 검증한다.

source 검증:

```sh
pnpm panel:build
node --test examples/kiro-panel/test/*.test.cjs
pnpm client:pack
pnpm test:client-consumer \
  "<absolute-empty-local-core-root>/connection.json"
pnpm check
```

PR에서 반드시 추가하거나 유지할 test:

- credential/absolute path가 Webview bundle/message에 없는지.
- unknown action, invalid type/length, stale Project/Decision/user-input ownership 거절.
- run `TURN_ENDED`, Task `COMPLETED`, Completion Report와 result health가 별도 표시되는지.
- Abort/unsubscribe와 explicit cancel mutation이 별도인지.
- connection rotation에서 old generation render와 mutation/SSE replay가 없는지.
- preview→enrichment에서 Candidate ID+revision과 local selection이 유지되는지.
- Windows/unsupported pin fail-closed와 `macOS exact pin · experimental` label.
- Evidence quality failure가 학습 성공, confidence 또는 숙달 badge로 바뀌지 않는지.

실제 Kiro model/live 재실행은 이 문서 작업이나 일반 frontend PR의 기본 test가 아니다. 새 합성 데이터, 사용량과 process 변화가 필요하므로 별도 승인을 받는다. mock 실패를 live 성공으로 바꾸지 않는다.

## 11. source와 근거

| 목적 | source |
| --- | --- |
| 최종 GO/NO-GO와 bounded evidence | [cutover verdict](spikes/T19_NATIVE_IDE_CUTOVER_VERDICT_20260916.md) |
| 시간순 실측, 오류·취소·Evidence 한계 | [historical frontend handoff](FRONTEND_IDE_HANDOFF_20260915.md) |
| 전체 제품/frontend 계약 | [frontend integration](FRONTEND_INTEGRATION.md) |
| native adapter 책임 | [native IDE adapter contract](spikes/T19_NATIVE_IDE_ADAPTER_CONTRACT_20260915.md) |
| request/response schemas | [ui-contracts.ts](../packages/contracts/src/ui-contracts.ts) |
| durable snapshot | [ui-session.ts](../packages/contracts/src/ui-session.ts) |
| run/SSE/connection schemas | [local-runtime.ts](../packages/contracts/src/local-runtime.ts) |
| SDK implementation | [frontend-client index.ts](../packages/frontend-client/src/index.ts), [node.ts](../packages/frontend-client/src/node.ts) |
| legacy migration seam | [program-adapter.ts](../packages/frontend-client/src/program-adapter.ts) |
| connection generation/no-replay | [core-connection.cjs](../examples/kiro-panel/src/core-connection.cjs) |
| allowlisted actions/native reuse | [extension.cjs](../examples/kiro-panel/src/extension.cjs) |
| current minimal Webview | [panel.js](../examples/kiro-panel/media/panel.js) |
| contract/reference tests | [frontend client tests](../packages/frontend-client/test/client.test.ts), [connection tests](../examples/kiro-panel/test/core-connection.test.cjs), [restore/watch tests](../examples/kiro-panel/test/restore-watch.test.cjs) |
