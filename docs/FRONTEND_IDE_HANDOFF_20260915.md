# Frontend IDE-only 인계 — 2026-09-15

> 새 frontend 구현은 [IDE-only frontend 구현 가이드](FRONTEND_IDE_IMPLEMENTATION_GUIDE.md)에서 시작한다. 이 문서는 2026-09-15~16 실측의 시간순 handoff와 세부 receipt를 보존한다.
>
> 목적: frontend 담당자가 **30분 착수 목표**로 IDE-only 화면 개발을 준비할 수 있게 현재 실행 경로, 계약, 책임과 막힌 gate를 한곳에 고정한다. 현재 pushed revision·backend installer가 없고 exact Kiro pin도 따로 확보해야 하므로, 30분은 모든 컴퓨터에서 보장되는 시간이 아니다.
>
> 이 문서는 `docs/FRONTEND_INTEGRATION.md`의 네 화면/Core 계약을 native IDE Agent 경로에 맞춰 좁힌 인계다. 기존 CLI/Crew 코드를 삭제하거나 T19/T19-N/MVP 완료를 선언하는 문서가 아니다.

시간 경계: 원래 4시간 wall-clock은 `2026-09-15 09:58Z`부터 `13:58Z`까지였고 사용자 승인 대기 중 기한을 넘겼다. 두 승인을 명시적으로 받은 `14:43Z`에 재개했으며, 이를 clock reset이나 wall-clock PASS로 기록하지 않는다.

## 1. 지금의 결론

세 결정을 분리한다.

| 결정 | 현재 판정 | 의미 |
| --- | --- | --- |
| frontend가 IDE-only 화면·상태·오류 UX의 설계·계약 개발을 시작 | **GO** | 아래 Core DTO와 reference panel을 기준으로 바로 개발할 수 있다. |
| pinned macOS IDE-only experimental native flow를 frontend 기준 경로로 채택 | **QUALIFIED GO** | exact pin의 ordinary profile에서 P3/P4와 생성 결과가 bounded PASS다. repository-backed backend와 experimental label을 유지하고 Evidence는 quality-not-ready로 표시한다. |
| 일반 사용자 production, Windows, CLI/Crew 완전 교체 | **NO-GO** | private Kiro adapter, OS 수준 간접 shell 격리 미증명, backend 독립 배포 부재, P2 의미 품질 실패와 Windows 미검증이 남아 있다. |

현재 FE가 바로 할 수 있는 범위:

- Discovery, Spec, Builder/Helper, History 네 화면을 versioned Core DTO에 연결한다.
- loading, partial, stale, failed, cancel-requested, durable-restore 상태를 구현한다.
- 실제 Agent stream과 Core의 durable 성공을 다른 상태로 표시한다.
- Evidence/개인화는 근거 trace와 검증 상태를 보수적으로 표시한다.

현재 FE가 성공으로 약속하면 안 되는 범위:

- Windows native 실행, 다른 Kiro/Agent 버전, marketplace 설치.
- 진행 중 native turn/SSE의 backend restart 재연결 또는 response-uncertain mutation 자동 재실행.
- IDE 경로가 기존 CLI와 성능·완료율·비용이 동등하다는 주장.
- Builder native shell이 repository 요구 Node 24.19.0으로 고정됐다는 주장.
- Analyst가 사용자 이해를 정확히 판정한다는 주장이나 개인화가 행동상 더 낫다는 주장.
- 일반 사용자 production, 전체 Evidence/Final Upgrade parity, MVP 완료.

## 2. 정확한 source와 지원 환경

현재 로컬 source:

```text
repository: /Users/hurdoo/coding/projects/vibe-helper/.local-experiments/kiro-native-recovery
branch: codex/kiro-native-recovery-20260913
Node.js: 24.19.0 exact
pnpm: 11.12.0 exact
local protocol: 1
frontend client: 0.1.0
```

위 Node.js 24.19.0 / pnpm 11.12.0은 repository build, backend와 독립 app-copy 검증의 exact toolchain이다. 최종 G의 실제 Builder native shell은 Node 26.4.0 / pnpm 11.12.0이었으므로 native shell Node까지 24.19.0으로 고정됐다고 보지 않는다. 이는 현재 qualified flow의 알려진 제한이다.

이 worktree에는 여러 날의 T19-N dirty 변경이 있다. reset, checkout, clean, stash, delete로 정리하지 않는다. 현재 외부에서 재현 가능한 pushed handoff revision이나 backend installer는 없다.

현재 native Agent 지원 pin은 하나뿐이다.

| 항목 | 지원 값 |
| --- | --- |
| OS / architecture | macOS / arm64 |
| Kiro IDE | 1.0.437 |
| extension-host API | 1.109.5 |
| Kiro Agent extension | 1.0.794 |
| native runtime source | `KIRO_IDE_1.0.437_AGENT_1.0.794_MACOS_ARM64` |
| packaged bridge Node | `/opt/homebrew/opt/node@24/bin/node`, version 24.19.0 exact |
| 한 창 native route | backend opt-in `VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1` |

이 경로는 Kiro public SDK가 아니다. 설치본의 private local Agent mux/ACP observer에 의존하며 version, trust, role mode, permission/catalog 또는 asset pin이 달라지면 fail-closed한다. Windows frontend 개발자는 UI fixture와 계약 작업은 할 수 있지만 **현재 native 실행은 할 수 없다.** WSL이나 최신 Kiro/CLI로 자동 대체하지 않는다.

## 3. 30분 착수 목표 경로

이 절은 source와 exact toolchain 및 지원 pin이 이미 준비된 macOS frontend 컴퓨터의 목표 순서다. 현재 shared pushed revision은 없으며 담당자는 Kiro IDE 1.0.437와 Agent 1.0.794 설치본도 별도로 확보해야 한다. checkout 전달, 의존성 설치 또는 pin 확보 시간은 30분 목표에 포함한다고 보장할 수 없다.

### A. 현재 지원 macOS에서 실제 IDE-only 경로

repository root에서 exact toolchain을 먼저 확인한다.

```sh
cd /Users/hurdoo/coding/projects/vibe-helper/.local-experiments/kiro-native-recovery
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
pnpm panel:build
```

새 checkout이면 비어 있는 전용 local root를 초기화한다. 기본값은 repository의 `.data/local`이다. 다른 root를 쓰면 이후 모든 Core 명령에 같은 절대 경로를 지정한다.

```sh
pnpm core:init
VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1 pnpm core:native --port 0
```

`core:native`는 별도 Kiro CLI Agent를 사용하지 않는다. `core:doctor --live`는 CLI 2.21.1 경로를 검사하므로 IDE-only fast path의 native gate가 아니다. backend 출력의 `status`가 `NATIVE_READY`이고 `/health`의 Agent source가 `KIRO_IDE_BUILTIN_AGENT`인지 확인한다.

backend는 다음을 계속 별도 Node process로 소유한다.

- deterministic Core, local SQLite, Project/Task/Decision/Evidence 상태.
- authenticated `127.0.0.1` HTTP/SSE와 private `connection.json`.
- native job, role-bound MCP binding과 revoke.
- Analyst worker와 generated-result process.

즉 “Kiro Agent CLI 없이 실행”은 맞지만 “Kiro IDE process 하나만 실행”은 아니다.

### B. 패키지된 VSIX

일반 profile에 설치해 parser/activation/live를 확인한 historical 0.1.2 archive:

```text
/private/tmp/vibe-helper-kiro-panel-vsix-u30pMN/vibe-helper-local-panel-0.1.2.vsix
SHA-256 b2582b7544eb46a928ece8252c525e250ec6af8e030648a048243eb55555e8f6
```

0.1.2는 ordinary Kiro profile의 parser/install/activation, exact source gate, panel render와 idle backend token/instance rotation 뒤 명시적 read-only durable restore를 통과했다.

freeze한 최종 P1 **0.1.3 artifact**(먼저 pre-install 검증 후 ordinary profile 설치):

```text
/private/tmp/vibe-helper-kiro-panel-vsix-JGEmwa/vibe-helper-local-panel-0.1.3.vsix
size 575,538 bytes
SHA-256 88f21a8bfef37355b143c549d6cf6ef112b30c32b2e058c6c42ba6593a31f3c4
```

0.1.3은 exact 12-entry archive, runtime asset digest 5개, canonical prompt Discovery 1.3.5 / Builder 1.3.6 / Helper 1.2.0 / Evidence Analyst 1.0.7, panel CJS 87/87와 native client/protected source 48/48을 통과했다. bounded synthetic command도 실제 범위인 `Vibe Helper: Run Bounded Synthetic Validation (7 Analyst cells)`로 좁아졌다.

두 사용자 승인 뒤 root가 ordinary Kiro profile에 0.1.3을 설치하고 reload했다. activation과 exact command 등록, installed runtime asset digest 5개 일치, worker start/connect(`2026-09-15 14:45:19Z`)가 확인됐다. isolated 7-cell run은 `14:45:55Z`에 시작해 `14:48:45.437Z`의 reload-required notification까지 갔고 notification이 lease release를 기다리지 않게 한 fix도 actual PASS였다. 이 installed/operational PASS는 아래의 semantic quality `FAILED`를 성공으로 바꾸지 않는다. 후속 G gate까지 통과해 exact pin의 experimental native flow만 **QUALIFIED GO**다.

두 `/private/tmp` 경로는 다른 컴퓨터에 배포되는 위치가 아니다. 이후 source가 바뀌면 기존 archive를 최신이라고 간주하지 말고 다음으로 새 archive를 만든다.

```sh
pnpm panel:pack
```

VSIX에는 extension bundle, Webview asset, package-local Node 24 stdio Core bridge, build 시점 canonical Agent prompt와 integrity manifest가 들어 있다. 다음은 들어 있지 않다.

- Node binary.
- local backend executable/installer와 lifecycle manager.
- SQLite data, connection token 또는 사용자 설정.
- Kiro IDE/Agent extension.

Kiro에서 VSIX를 설치한 뒤 machine setting `vibeHelper.connectionFile`에는 backend가 출력한 **`connection.json`의 절대 파일 경로만** 넣는다. token 값을 복사하지 않는다. Command Palette에서 `Vibe Helper: Open Local Integration Panel`을 실행한다. VS Code에서 연 결과는 Kiro 검증이 아니다.

현재 exact pin의 synthetic validation command는 이미 승인된 `currentApprovedBuiltinHelperScope`의 기존 runtime exact path에 한정된다. 제품 범위의 정상 명령 검증은 generated workspace를 realpath로 확인하는 `productBuiltinHScope`가 담당하므로, 전자를 모든 macOS 사용자의 portable product scope로 복제하거나 반대로 모든 Mac을 막는 hard-code로 해석하지 않는다.

### C. 별도 frontend repository에서 client 사용

client artifact를 만든다.

```sh
pnpm client:pack
```

생성물은 `dist/vibe-helper-frontend-client-0.1.0.tgz`다. frontend extension project에서 local tarball을 설치하고 **extension host에서만** 연결한다.

```ts
import { LocalProgramAdapter } from '@vibe-helper/frontend-client'
import { connectLocalCore } from '@vibe-helper/frontend-client/node'

const client = await connectLocalCore(connectionFilePath)
const adapter = new LocalProgramAdapter(client, () => selectedProjectId)
```

`LocalProgramAdapter`는 `Hello-KU-tty/program`의 commit `c639a595353f0db38e09112ba094ce5510fb1cbd`에 있던 `AgentAdapter` 구조와 맞춘 최소 교체점이다. `startTurn({ agent: 'builder' | 'helper', text, allowWorkStream }, onEvent)`를 제공한다. `allowWorkStream`은 표시 힌트일 뿐 권한을 선택하지 않는다. 명시적 `agent` 역할이 backend의 session과 MCP 권한을 결정한다.

2026-09-15 현재 local source에서는 Node 24.19.0 / pnpm 11.12.0으로 `pnpm client:pack`과 `pnpm test:client-consumer`가 exit 0이었다. 임시 독립 consumer(`/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-helper-sdk-consumer-3X9PNW`)가 source-pack `@vibe-helper/frontend-client` 0.1.0을 TypeScript 5.4.5 `strictLibraryCheck: true`, CJS, esbuild 0.21.5에서 소비했고 live Core read도 통과했다. 계정 token은 출력되지 않았으며 임시 폴더는 보존됐다. 이는 **현재 local source tarball의 외부 소비 확인**이지 pushed checkout 재현이나 Windows/native 실행 확인은 아니다.

## 4. 보안상 넘지 말아야 할 경계

`connection.json`은 64-hex bearer를 포함한다. 이 파일과 `LocalCoreClient`는 extension host 전용이다.

- Webview에 connection object, token, Authorization header 또는 임의 backend URL을 보내지 않는다.
- Webview에서 backend를 직접 fetch하지 않는다.
- token을 DOM, URL, localStorage, VS Code globalState, log, screenshot 또는 오류 문구에 넣지 않는다.
- Webview→extension host는 `action`이 정해진 메시지만 허용하고 schema/type/length를 다시 검증한다.
- 범용 HTTP, MCP, SQL, file, shell bridge를 만들지 않는다.
- Agent text와 tool detail은 신뢰하지 않는 입력으로 보고 `textContent` 또는 안전한 renderer로 표시한다.
- 절대 workspace path는 `openWorkspace` 직전에 extension host에서만 사용한다. 화면·log·durable state에는 상대 reference만 표시한다.

기준 구현은 `examples/kiro-panel/src/extension.cjs`의 `onDidReceiveMessage` allowlist와 `packages/frontend-client/src/node.ts`의 private connection-file validation이다.

## 5. 네 화면 계약

단일 source of truth:

- request/response: `packages/contracts/src/ui-contracts.ts`
- History/snapshot: `packages/contracts/src/ui-session.ts`
- Agent run/SSE: `packages/contracts/src/local-runtime.ts`
- 실제 orchestrated action 예: `examples/kiro-panel/src/extension.cjs`
- 최소 Webview render 예: `examples/kiro-panel/media/panel.js`

모든 request는 SDK의 `entityId(...)`, `uiMetadata(...)`와 snapshot의 current ID/revision/correlation을 사용한다. Agent 결과를 `source: USER`로 바꾸지 않는다.

### 5.1 Discovery

읽기:

- `startDiscovery({ learningGoal, personalNeed? })` 뒤 `watchRun`과 `restoreProject(projectId)`.
- `snapshot.discoveryContext.previewRound.previews`는 먼저 durable해질 수 있다.
- `candidateEnrichments`는 부분 집합일 수 있다.
- complete current list는 latest Round의 `{candidateId, revision}`을 `discoveryContext.candidates`에 정확히 join한다.

쓰기:

- PREVIEW, ENRICH_ALL, ENRICH_SELECTED, ROUND, MERGE, SPEC run은 `LocalRunRequest`를 사용한다.
- 사용자의 PIN/REJECT/REVISE/SHRINK/EXPAND/REGENERATE/MORE/MERGE/SELECT는 `UI_RECORD_DISCOVERY_FEEDBACK`이며 실제 `USER` provenance다.
- preview-only 선택/조정은 필요한 target만 `ENRICH_SELECTED`로 보강한 뒤 feedback을 기록한다.
- SELECT는 사용자 명시 action이며 이어 SPEC run을 시작한다.

표시:

- preview와 enrichment를 같은 Candidate ID로 유지하고 checkbox/펼침 local UI state도 ID+revision key로 유지한다.
- background 보강은 선택·조정의 UI blocker가 아니다.
- run 종료가 아니라 preview/Round/Session revision의 durable snapshot으로 성공을 판정한다.

### 5.2 Spec

읽기:

- `snapshot.learningSpec`의 제품 목적, 사용자, 성공 순간, MVP와 `LEARNER_FOCUS` / `AGENT_SUPPORT` / `EXCLUDED`, 예상 Decision을 읽기 중심으로 표시한다.
- `expectedDecisions`는 빈 배열일 수 있다. 교육용 Decision을 채우지 않는다.

쓰기:

- 자유 입력 수정은 최신 Session/Spec revision으로 SPEC run을 시작한다.
- 확정은 `UI_CONFIRM_LEARNING_SPEC`, 성공 snapshot 재조회 후 `UI_PREPARE_BUILDER_TASK` 순서다.
- `다른 주제로 돌아가기`의 단순 화면 이동은 모델 호출 0회다. 입력을 바꾸고 새 후보 생성을 명시했을 때만 `UI_RETURN_TO_DISCOVERY`와 새 PREVIEW를 실행한다.

표시:

- Agent 설명이 아니라 durable Spec revision 증가로 수정 성공을 판정한다.
- confirm receipt만으로 Builder가 준비됐다고 표시하지 않고 `snapshot.currentTask` 또는 prepared task descriptor를 확인한다.

### 5.3 Builder / Helper

읽기:

- `snapshot.currentTask`, `liveContext`, `pendingDecisions`, `decisions`, `completionReport`가 durable truth다.
- `listRuns(projectId)`와 `watchRun`은 transient Agent 실행/stream이다.
- Builder와 Helper는 독립 composer와 run으로 표시한다. Helper는 read-only다.

쓰기:

- Builder run은 current Task ID/revision과 user text를 보낸다.
- Helper run은 같은 Task와 선택적 Decision ID, `origin: FREE_TEXT | QUICK_ACTION`을 보낸다.
- Decision은 current pending Decision과 Context version을 다시 읽고 `UI_RESOLVE_DECISION`으로 저장한다. option/recommendation/custom proposal과 선택적 사용자 rationale를 구분한다.
- 사용자가 만든 이유와 선택만 `USER` provenance다. Agent 문장, quick-action click, 단순 확인을 사용자 이해 Evidence로 만들지 않는다.

표시:

- 실제 redacted TEXT/TOOL/STATE/PERMISSION_DENIED를 숨기지 않는다.
- Agent run `SUCCEEDED` / `TURN_ENDED`는 Task 완료나 test 성공이 아니다.
- Task `COMPLETED`에는 durable Completion Report가 필요하다. Agent-authored report와 실제 command/test/result health를 같은 것으로 표시하지 않는다.
- stop button click은 `중지 요청`이다. Core의 `LocalRun: CANCELLED`는 cancel acceptance이며 native terminal ACK보다 먼저 기록될 수 있다. 이를 모델 process 종료로 번역하지 않는다. native ACK receipt가 별도로 확인되지 않으면 `Core 취소 수락 · native 종료 미확인`으로 남긴다.
- Decision은 `미해결`, `사용자 해결·Builder 적용 대기`, `적용됨`을 구분한다.

### 5.4 History

읽기만으로 동작한다.

- `listProjects()` → title/status/updatedAt, `suggestedSurface`, active Task, pending Decision 수, current Context version.
- `restoreProject(projectId)` → Discovery/Spec/Task/Decision/Context/Completion/Helper summary.
- History 조회·Project 선택만으로 Agent run을 시작하지 않는다.

복원:

- backend restart 뒤 새 connection descriptor로 client를 새로 만들고 durable snapshot을 다시 읽는다.
- raw chat transcript, 이전 backend의 in-memory run 또는 진행 중 stream을 복원됐다고 가장하지 않는다.
- 완료 Project의 workspace는 `UI_PREPARE_BUILDER_SESSION`의 `purpose: WORKSPACE_VIEW`로만 연다. 완료 Task를 재실행하지 않는다.

## 6. 오류·취소·restore UX

| code/상황 | frontend 동작 |
| --- | --- |
| `LOCAL_AUTH_FAILED`, `BACKEND_RESTARTED_RELOAD_CONNECTION`, `CORE_CONNECTION_UNAVAILABLE` | 최신 descriptor를 extension host에서 다시 읽고 client를 교체한다. read만 한 번 재시도한다. |
| `CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED` | 해당 mutation을 자동 재전송하지 않는다. durable snapshot을 복원하고 사용자에게 다시 확인받는다. |
| `CORE_CONNECTION_RECOVERY_IN_PROGRESS_RETRY_ACTION` | action을 queue하지 않는다. read-only recovery가 끝난 뒤 명시적 재시도를 제공한다. |
| `STREAM_DISCONNECTED_RESTORE_PROJECT` / `CORE_STREAM_DISCONNECTED_RESTORE_PROJECT` | stream loss를 표시하고 snapshot/run 목록을 다시 읽는다. backend rotation이면 이전 SSE/native turn을 자동 reattach/replay하지 않는다. |
| `STALE_DISCOVERY_REVISION`, `STALE_SPEC_REVISION`, `STALE_TASK_REVISION` | 최신 snapshot을 읽고 사용자의 오래된 action을 다시 확인한다. body/key를 무한 재전송하지 않는다. |
| `RUN_BUSY`, `RUNTIME_CAPACITY` | 현재 run을 보여주고 대기 또는 명시적 stop만 제공한다. |
| `RUN_NOT_FOUND_RESTORE_PROJECT`, backend restart | durable Project를 복원한다. 이전 run의 완료를 추정하지 않는다. |
| `GUARD_*`, `PERMISSION_DENIED`, `CORE_GUARD_DENIED` | 거절을 그대로 표시하고 허용된 경로/명령으로 바꾸도록 한다. 권한을 넓히지 않는다. |
| `NATIVE_*` source/policy/catalog/worker 오류 | 현재 pin에서 native 실행 불가로 표시한다. CLI/default Agent/mock으로 자동 fallback하지 않는다. |
| `AGENT_RESULT_NOT_STORED`, `AGENT_TURN_INCOMPLETE` | 저장 전 결과로 표시하지 않는다. snapshot 확인 뒤 명시적 새 run을 제공한다. |
| `RESULT_*` | build/test/Completion과 결과 launcher 실패를 분리한다. healthy loopback URL만 연다. |

Webview의 AbortSignal이나 panel close는 SSE 구독만 끊는다. backend run cancel이 아니다. `cancelRun(runId)`를 사용자가 명시적으로 눌렀을 때만 호출한다. cancel은 이미 저장된 Core 결과를 rollback하지 않는다.

실측에서는 Core `CANCELLED`가 native terminal ACK보다 먼저 기록됐다(각각 `28.801`, `28.849`). 현재 SDK DTO만으로는 native process 종료를 증명할 수 없다. frontend는 Core cancel acceptance, native ACK 확인 여부, 이후 durable retry 결과를 별도 상태로 표시해야 한다. typed adapter receipt는 알려진 계약 gap이며 이번 인계에서 Webview 추정이나 새 DTO로 메우지 않는다.

0.1.2에서 입증된 reconnect는 **idle backend rotation 뒤 read-only durable restore**다. active SSE, response-uncertain mutation, native turn no-replay race는 아직 live 통과 근거가 없다.

## 7. 역할 분담

| frontend 담당 | 기존 adapter/Core 담당 |
| --- | --- |
| 네 화면 layout, theme, keyboard/a11y, responsive pane와 composer | Project/Session/Spec/Task/Decision ID·revision·state transition |
| schema-valid DTO를 view model로 변환 | connection file 인증, loopback HTTP/SSE와 response validation |
| allowlisted semantic action을 extension host에 전달 | private Kiro source/version/trust/mode/model ACK와 native session 수명 |
| loading/partial/failed/stale/cancel-requested/restore UX | protected H 준비, Builder/Helper/Analyst role/catalog/permission 분리 |
| Candidate local basket/펼침, selected Project 같은 비민감 UI state | role-bound MCP bearer/binding, workspace/command guard와 terminal revoke |
| transient stream과 durable snapshot을 함께 보여주되 의미를 분리 | redaction, Core receipt, SQLite, Analyst job과 result supervisor |
| Evidence 출처·보류·거절·미검증 표시 | Evidence proposal 검증과 deterministic reducer |

frontend가 새로 구현하지 말아야 할 것:

- Kiro private observer/permission protocol.
- role별 MCP bridge 또는 Core state machine.
- retry/idempotency/revision 정책의 화면별 복제.
- credential 전달, shell/file proxy, Agent output→USER provenance 변환.

## 8. Evidence와 개인화 표시 제한

2026-09-15의 0.1.2 native 13-cell baseline은 transport상 13/13 완료, retry 0, runtime Core mutation 0이었지만 deterministic semantic 판정은 `FAILED`였다.

- Analyst strict oracle은 2/7 통과했다. 이 수치는 일반 정확도가 아니다.
- 미래 계획을 `APPLICATION`으로, 일반 정의·사후 관찰을 강한 `PREDICTION`으로 분류한 genuine regression이 있었다.
- exact one-Proposal oracle과 reasoned-choice fixture에도 결함이 있었다.
- Helper/Discovery contract 6/6은 통과했지만 뚜렷한 행동상 개인화 이득, Discovery의 실용 우위와 인과 효과는 입증되지 않았다.
- 기존 H actual graph에는 Personal Need 없음 후보 10건이 완료됐지만, 이번 P2 pair에는 포함되지 않았다. clean personalization 비교와 truly held-out learning goal에서의 효과는 여전히 검증되지 않았다.

0.1.3의 Evidence Analyst prompt 1.0.7은 canonical hash `0d0c7f…`와 일치한 Sonnet 4.5/window 2에서 live 실행됐다. 7/7 operation은 `COMPLETE`, retry 0, Core mutation 0, `finalIdle: true`였고 aggregate 111,788ms/model 97,713ms였다. metadata는 mode `0600`인 `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-clean-eval-4O67Iu/metadata.json`에 저장됐고 SHA-256은 `0cf9a2110c82a60970a6d0784c1277c980ebeb58a12cfbc52970874271036a2d`다.

그러나 deterministic semantic 판정은 다시 **`FAILED`(3/7 통과)**였다. root raw review에서는 미래 의도를 `APPLICATION`으로 분류한 것, timeless 문장을 강한 `PREDICTION`으로 분류한 것, choice-hint dependence와 `U+FFFD`가 든 invalid quote(원인 미확인)가 genuine failure였다. 수행 보고를 두 `APPLICATION`·prediction 없음으로 분류한 cell은 실제로 맞았지만 compound-excerpt oracle 때문에 false negative였다. request, 직접 유도된 반복과 future prediction 3개만 통과했다. 추가 prompt tuning은 하지 않으며 일반 정확도나 Evidence readiness를 주장하지 않는다.

run 뒤 DB의 accepted Evidence 76, Proposal 46, Ledger 54, Completion 11과 Analysis Job 46/46 `SUCCEEDED`는 모두 불변이었고 SQLite `quick_check=ok`였다. 이는 read-only 격리가 유지됐다는 근거이지 semantic 품질 PASS가 아니다.

이후 사용자가 승인한 synthetic G가 끝난 최종 Core count는 accepted Evidence 80, Proposal 47, Ledger 54, Completion 12, Analysis Job 51/51 `SUCCEEDED`다. 이 증가는 G가 허용한 synthetic 실행의 결과이며 실제 사람의 학습이나 개인화 효과가 아니다. P2-only run에는 위 DB mutation이 없었다.

FE 표시 원칙:

- `PLAN_FINISHED`와 품질 `PASSED/FAILED/NEEDS_REVIEW`를 동시에, 같은 위계로 보여준다.
- Agent 출력, 사용자 발화, Core acceptance/rejection을 별도 provenance로 보여준다.
- `OBSERVED`를 사용자 이해로, accepted Evidence를 학습 효과로 번역하지 않는다.
- confidence percentage, 숙달 배지, 자동 성공 문구를 만들지 않는다.
- Evidence Trace의 원문 근거, Episode, signal/strength/prompt dependence와 Core reason을 보수적으로 노출한다.

## 9. 착수 blocker와 병행 gap

### qualified experimental flow가 통과한 bounded live gate

exact macOS pin의 P3/P4 root 실측에서 다음이 모두 bounded PASS였다.

1. ordinary-profile 한 창에서 W Builder 작업 중 protected H Helper가 늦게 시작해 답하고 Builder가 계속 진행한다.
2. confirmed H cancel 뒤 같은 protected pair를 계약대로 재사용하고, 미확인 cancel은 fail-closed한다.
3. 사용자가 승인한 synthetic 이유 입력이 있는 Decision이 Core에 resolve되고 Builder가 같은 Decision을 읽어 apply한 뒤 durable snapshot에 반영된다.
4. terminal 뒤 active native job 0, role binding `REVOKED`, permission/source/prompt gate가 유지된다.

후속 regression에서 하나라도 실패하면 frontend 개발 자체를 멈추지는 않되 해당 버튼/상태를 `실험적·현재 미지원`으로 낮추고 qualified label을 차단한다. 이 PASS를 production, 다른 pin이나 Windows로 일반화하지 않는다.

### FE와 병행 가능한 productization gap

- repository 없이 시작할 backend binary/installer/service가 없다.
- connection-file 선택, backend start/stop/update의 일반 사용자 onboarding이 없다.
- active SSE/mutation restart race live gate가 없다.
- 실제 B2 native shell은 Node 26.4.0이었다. repository와 독립 app-copy 검증의 Node 24.19.0 요구를 native shell까지 만족했다고 표시하지 않는다.
- independent app-copy의 frozen install은 shared warm pnpm store에서만 확인됐다. cold-network/repository-independent 재현으로 확대하지 않는다.
- 이전에 관찰한 generated-result origin restart 뒤 상태 소실은 이번에 재검증하거나 수정하지 않았다. same-origin reload 복원 PASS가 이를 대신하지 않는다.
- generated app의 depth-only rejection은 위반한 wardrobe subset의 `min width 120`만 보여 전체 layout 최소처럼 오해될 수 있다. acceptance 오류는 아니지만 frontend copy/field-scope 개선 대상이다.
- **Known medium eligibility issue:** `PersonalizationTrace` 생성은 성공한 `HELPER_RECORDED` eligibility와 같지 않다. Helper invocation 전에 만들어진 trace가 취소 뒤에도 Final Upgrade dropdown에 나타날 수 있다. 이는 cancel button이나 permission 실패가 아니라 eligibility 계약의 불충분함이다. `eligibleFinalUpgradeTraces`는 same Task/mode/basis만 보고, Core도 trace와 같은 Task의 임의 성공 Analysis만 확인한다. snapshot의 Helper summary에는 trace를 완료 응답에 정확히 연결할 correlation ID가 없어 FE-only 필터는 신뢰할 수 없다. 제품 계약은 동일 correlation의 CLOSED Helper Episode와 `HELPER_RESPONSE`를 Core eligibility로 검증하고 authoritative eligible list를 내려줘야 한다. 그 전에는 dropdown 항목을 “완료된 Helper 응답”의 증거로 표현하지 않는다.
- Windows native path가 없다.
- private adapter의 공개·안정 지원 계약이 없다.
- generated package script의 W 밖 간접 side effect를 막는 OS sandbox가 입증되지 않았다.
- 네 화면 reference는 integration UI이며 최종 visual polish/accessibility 전체 감사가 아니다.

시간 절약을 위해 이번 4시간에는 Windows, 동일 CLI latency/cost/완료율 비교, 장기 안정성, 개인화의 정밀한 행동 효과 재실험을 실행하지 않는다. 이는 미지원·미검증 제한이며 결과가 나쁘다는 증거로 확대하지 않는다.

## 10. 최신 live gate 결과 — root 갱신란

아래 gate 표는 root의 새 P2/P3/P4 actual 결과만 기록한다. source test나 과거 성공으로 gate를 채우지 않는다.

현재 source readiness receipt: 최종 `pnpm check`는 unit 88/88, integration 271/271, eval 34/34, Golden Path 3/3, smoke 6/6, GUI E2E 12/12(52.6초)를 포함해 exit 0이었다. 같은 Core root/port 58498에서 새 backend snapshot `efcccfb9-2df6-4b80-acb3-19753356379e`(OS PID 11203)가 canonical Evidence Analyst 1.0.7 build와 일치했고 `WORKER_CONNECTED`는 `10:24:31.603Z`였다. 새 connection으로 History를 refresh한 CUA 확인에서도 durable restore, Analysis Job 46/46 `SUCCEEDED`, SQLite `quick_check=ok`였다. instance/PID는 그 시점 receipt일 뿐 고정 설정이 아니다. 이는 뒤이어 별도 실측한 0.1.3 install/7-cell/G 근거와 섞지 않으며 active restart race나 production readiness를 대신하지 않는다.

| gate | 상태 | 실제 receipt/한계 |
| --- | --- | --- |
| P2 Analyst 1.0.7 bounded native rerun | `OPERATIONAL_PASS / QUALITY_FAILED` | 7/7 operation COMPLETE, retry/Core mutation 0, final idle; deterministic 3/7과 raw review상 genuine failure 3개. 일반 정확도·Evidence readiness·개인화 효과를 주장하지 않는다. |
| P3 ordinary-profile one-window W + late H 반복 | `BOUNDED_PASS` | exact window 2에서 3/3 직접 확인: H1 `native_010aaac6-ceca-4315-8e30-d03dd23b1767` (`14:56:47.382Z`), H2 `native_04f34b67-23ab-4eb7-a731-0c3b31b75933` (`15:02:53.553Z`), H3 `native_0e9dedfb-c73d-45b8-bf52-2120bdaca741` (`15:05:27.015Z`). 장기 안정성/SLA로 일반화 금지. |
| P3 confirmed H cancel → same-pair reuse | `BOUNDED_PASS` | ordinary 0.1.2의 단독 H에서 native cancel ACK와 Core `CANCELLED`를 보존한 뒤 같은 prepared pair retry가 `SUCCEEDED/HELPER_RECORDED`; 자동 Analyst도 `SUCCEEDED`, accepted/proposal count 불변. Builder overlap 성공으로 세지 않는다. |
| P3 Builder budget failure → fresh pair, same Task resume | `NOT_RERUN` | 과거 G에서 600초 cancel 미확인과 590초 owned cancel 확인 뒤 pair를 닫고 idle 재준비해 같은 Core Task를 후속 turn에서 완료한 실측 및 현재 source regression을 재사용한다. 새 590초 timeout을 강제로 만들지 않으며 현재 작업에서 자연 발생할 때만 새 receipt를 기록한다. |
| P4 reasoned Decision resolve → Builder apply | `BOUNDED_PASS` | B2 `SUCCEEDED/TURN_ENDED` `15:09:54.910Z`; sequence-2 Task(ID prefix `5ced`, suffix `373b9a`) `COMPLETED` revision 5, Completion Report `completion_report_269d7e80-0002-415f-81de-f1f095a5c478`와 Decision(ID prefix `3b86`, suffix `a394`)이 일치했다. source last mtime `15:07:25.525Z` < completion `15:08:20.316Z` < native end. |
| generated app frozen copy + product result | `BOUNDED_PASS` | app-only copy의 24 source file hash가 original과 같았고 Node 24.19.0에서 install/tests 33/33/typecheck/build/HTTP smoke가 통과했다. ordinary panel result도 healthy loopback에서 UI/state 검증을 통과했다. warm store와 same-origin 범위 한정. |
| active SSE / response-uncertain mutation rotation | `NOT_RUN` | idle read-only restore PASS가 대신하지 않음. |

최종 G 상세 한계: B2 native shell에서는 Node 26.4.0 / pnpm 11.12.0으로 native tests 33/33, typecheck/build/smoke가 통과했다. 최초 frozen install 두 번은 esbuild lifecycle 차단으로 실패했고 generated project에만 `allowBuilds.esbuild: true`를 명시한 뒤 actual postinstall이 통과했다. 독립 app-only copy `/private/tmp/vibe-g-cutover-frozen-DfU8O7`는 `.kiro`, `.vibe-helper`, `node_modules`, `dist`를 제외한 24 source file의 SHA가 original과 같았고, Node 24.19.0 / pnpm 11.12.0에서 warm store를 사용한 frozen install과 33/33 tests, typecheck, build, HTTP smoke가 모두 exit 0이었다.

ordinary panel에서 연 snapshot URL `http://127.0.0.1:63269/`는 healthy였다. fresh 400×300에서는 Undo/Redo가 disabled였고 invalid width 100/101은 400과 모든 furniture를 보존하며 min 360×290를 표시했다. depth 250은 300을 보존하고 wardrobe만 위반 대상으로 표시했다. valid width 450 → Undo 400 → invalid 100 거절은 Redo를 보존했고 Redo 450과 same-origin reload 뒤 450×300 복원·예상된 history reset이 통과했다. canvas fit, console error/warn 0이었다. URL은 해당 실행의 ephemeral receipt다. origin restart 소실은 미재검증이고 depth-only 오류 copy의 `min width 120` scope는 위 known issue다.

terminal 뒤 Core는 active run 0, Analysis Job 51/51 `SUCCEEDED`, binding 115/115 `REVOKED`와 관련 artifact mode 전부 `0600`, SQLite `quick_check=ok`였다. 이는 exact pin experimental flow의 clean terminal 근거이며 production/Windows/Evidence quality 근거가 아니다.

## 11. qualified GO에서 첫 frontend PR의 최소 완료 조건

1. Webview bundle에 credential/connection object가 없고 임의 URL/file/shell/MCP action이 없다.
2. 네 화면이 `ProjectSessionSnapshot`과 `LocalRun`을 구분해 렌더한다.
3. Discovery/Spec success가 durable revision으로 판정된다.
4. Builder turn 종료, Task 완료, test 결과와 result health가 각각 구분된다.
5. cancel requested, Core cancel accepted, native ACK 확인/미확인과 panel-close unsubscribe가 구분된다. Core `CANCELLED`만으로 모델 process 종료를 주장하지 않는다.
6. backend rotation에서 read-only restore만 수행하고 mutation/SSE를 자동 replay하지 않는다.
7. Windows/unsupported pin은 실행 button 전에 fail-closed 상태와 지원 환경을 보여준다.
8. Evidence는 provenance와 `NEEDS_REVIEW`를 보이고 거짓 학습 성공을 표시하지 않는다.
9. 지원 상태를 `macOS exact pin · experimental`로 표시하며 production/Windows/CLI 교체 또는 Evidence readiness로 확대하지 않는다.
10. `pnpm panel:build`와 변경 범위 test를 통과한다. live 실패를 mock success로 바꾸지 않는다.

## 12. 빠른 source 지도

| 목적 | 파일 |
| --- | --- |
| 기존 전체 frontend 계약 | `docs/FRONTEND_INTEGRATION.md` |
| 최종 cutover 판정과 지원 경계 | `docs/spikes/T19_NATIVE_IDE_CUTOVER_VERDICT_20260916.md` |
| native adapter 책임/한 창 계약 | `docs/spikes/T19_NATIVE_IDE_ADAPTER_CONTRACT_20260915.md` |
| 최신 P1/P2 경계 | `docs/spikes/T19_NATIVE_P1_P2_CONTINUATION_20260915.md` |
| P2 실패와 oracle 결함 | `docs/spikes/T19_NATIVE_P2_LIVE_CLEAN_EVAL_20260915.md` |
| UI/Core schema | `packages/contracts/src/ui-contracts.ts`, `ui-session.ts`, `local-runtime.ts` |
| extension-host client | `packages/frontend-client/src/index.ts`, `node.ts`, `program-adapter.ts` |
| 실제 allowlisted UI action | `examples/kiro-panel/src/extension.cjs` |
| 최소 Webview render | `examples/kiro-panel/media/panel.html`, `panel.js` |
| native worker/permission/lifecycle | `examples/kiro-panel/src/native-worker.cjs`, `native-permission.cjs`, `protected-lifecycle.cjs` |
| package/runtime pin | `examples/kiro-panel/package.json`, `runtime-config.json`, `scripts/package-kiro-panel.mjs` |
