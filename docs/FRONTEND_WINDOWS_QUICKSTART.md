# Windows 프론트 연결 시작

2026-09-26. `Hello-KU-tty/program`의 `73d0eb58e374357d6f28ea8db13e9b659cec5e5a`에 적용할 실행 kit다. 이 PC에서 **실제 프론트 VSIX 설치 → Core 자동 기동 → Kiro Agent → Discovery·Spec·Task·History**를 검증했다. 다른 기기 검증은 사용자 지시에 따라 제외했다. 기존 계획서와 macOS/수동 connection 안내보다 이 문서를 먼저 따른다.

## 1. 받는 파일과 적용

백엔드 저장소 `codex/windows-extension-runtime-20260923` branch의 `releases/frontend-handoff/20260926/`에서 `frontend-handoff-20260926.zip`과 `frontend-handoff-receipt.json`을 받는다. GitHub에서 ZIP은 **Download raw file**로 내려받는다. `Get-FileHash .\frontend-handoff-20260926.zip -Algorithm SHA256` 결과가 receipt의 `sha256`과 같은지 확인하고 원하는 개발 폴더에 푼다. 내부 구성은 다음과 같다.

| 파일 | 용도 |
| --- | --- |
| `apply-program.mjs`, `program.patch` | 검토한 frontend의 기존 UI/controller/port에 연결 패치 적용 |
| `portable/` | Core·SQLite·migration·prompt·native worker·host·license. 내용과 manifest를 함께 유지 |
| `vendor/frontend-client/` | protocol 1 SDK, CJS/ESM, 타입 |
| `vendor/frontend-host/index.d.ts` | UI와 독립된 host API 타입 |
| `package-program.mjs`, `archive.mjs` | frontend UI와 실행부를 하나의 Windows VSIX로 조립 |
| `verification/` | 이번 현재 PC의 Core 소비·실제 native 결과와 검증 요약 |
| `manifest.json` | 기준 frontend revision, backend 기준 HEAD와 미커밋 여부, 파일별 SHA-256 |
| `reference/` | 백엔드 참조 패널 VSIX 0.3.16. 기존 UI 적용물과 별도 확인용 |

프론트 개발 PC에 Node/npm과 Git이 있어야 아래 개발 명령을 실행할 수 있다. **최종 사용자에게 Node·pnpm 설치, 백엔드 checkout, 서버 실행, connection 파일 입력을 요구하지 않는다.** 최종 사용자는 지원 Kiro에 로그인한 뒤 조립된 제품 VSIX를 설치한다.

PowerShell에서 경로 변수 두 개를 실제 위치로 바꾼다.

```powershell
$kit = 'C:\dev\frontend-handoff-20260926'
$program = 'C:\dev\program'
node "$kit\apply-program.mjs" $program --check
node "$kit\apply-program.mjs" $program
Set-Location $program
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
node "$kit\package-program.mjs" $program
```

`--check`는 파일을 바꾸지 않는다. 스크립트는 변경할 원본 파일·기존 SDK의 hash와 패치 적용 가능성을 먼저 검사한다. 프론트 담당자의 수정이 있으면 중단하므로 `program.patch`를 검토해 같은 변경을 해당 branch에 수동 반영한다. 자동으로 덮어쓰거나 Git 상태를 되돌리지 않는다. 이미 적용된 파일에 대한 재적용도 중단한다. `git`이 PATH에 없으면 `VIBE_HANDOFF_GIT`에 git 실행 파일 경로를 지정한다.

생성된 `dist/builder-helper-agent-panel-0.0.1-win32-x64-<hash>.vsix`를 Kiro의 Extensions → Install from VSIX로 설치한다. 백엔드 참조 VSIX는 별도 패널 확인용이므로 프론트 제품 VSIX와 둘 다 설치할 필요가 없다. 서로 다른 extension ID는 별도의 저장소를 사용한다.

## 2. 처음 확인할 흐름

1. Kiro에 로그인하고 작업 폴더를 연 뒤 그 폴더의 Workspace Trust를 승인한다.
2. Agent Panel을 연다. 연결 준비 중에는 `CORE_PREPARING`, 준비가 끝나면 실제 백엔드 연결 배너가 보인다.
3. 새 Learning Goal을 제출한다. preview run의 저장 완료 후 후보 10개를 표시한다. 이 적용본은 자동 전체 enrichment 대신 선택 후보의 JIT 상세화를 사용한다.
4. 후보 하나를 선택한다. JIT → 사용자 SELECT 저장 → Spec 생성 1회 순서로 진행한다.
5. Spec 수정 → 확정까지 진행하면 Core가 Task와 생성 workspace를 준비한다.
6. History를 새로 읽거나 확장을 재시작해 저장된 Project 요약을 확인한다. 조회만으로 Agent를 호출하지 않는다.

실제 검증은 설치된 프론트의 host와 동일한 `LocalCoreDiscoveryPort`를 driver에서 호출했다. 화면 전체의 수동 클릭·디자인 검수까지 했다는 뜻은 아니다. History의 현재 UI는 저장 요약 조회이며, 기존 진행 화면을 완전히 재구성하는 UX는 프론트 후속 범위다.

이 패치는 **Discovery·Spec·History를 실제 연결**한다. Builder/Helper 화면의 기존 Demo 응답은 제품 모드에서 차단하고 미연결 안내를 표시한다. 해당 화면·Decision·Evidence·Final Upgrade는 아래 실제 SDK 계약으로 이어 붙인다. 이 화면들이 이미 모두 연결됐다고 안내하지 않는다.

## 3. 수정되는 프론트 위치

| 위치 | 변경 이유 |
| --- | --- |
| `src/extension.ts` | host 생성/종료, 자동 준비를 받는 provider, 재연결·중지 명령 |
| `src/agent-panel-view-provider.ts` | host promise 주입, 상태/rotation 구독 정리, 제품 모드 Mock 차단, UUID 입력과 native 대기 예산 |
| `src/adapter/flow/flow-port-factory.ts` | `createManagedFlowPorts()` 추가. host의 exact source 판정 사용 |
| `src/adapter/flow/local-core-port.ts` | Project/Session 매핑, SSE terminal+durable 결과 대기, JIT/SELECT/Spec 중복 제거, entity별 revision/correlation |
| `src/core/flow/flow-controller.ts` | Core가 돌려준 Project ID를 후속 요청에 사용, live 대기 시간을 주입 |
| `src/core/flow/flow-snapshot.ts`, `src/webview/flow/flow-render.ts` | `unavailable` 연결 상태 표시 |
| `package.json`, `package-lock.json` | Kiro API engine과 내장 Agent dependency, 제품 명령. dependency 추가 없음 |
| `test/local-core-port.test.ts`, `test/integration.test.ts` | 잘못된 조회를 허용하던 fixture와 새 activation 계약 수정 |

기존 UI·FlowController·port 인터페이스를 유지한다. 기존 순수 Mock factory는 개발 테스트에서만 사용하며 실제 activation은 항상 managed factory를 사용한다. `win32` 조건만 지워서 지원 판정을 우회하지 않는다.

## 4. 재사용 host API

`portable/bin/frontend-host.cjs`는 extension host 전용 CommonJS 모듈이다. frontend 번들에 재포장하지 않고 확장 설치 루트에서 읽는다. 타입은 `vendor/frontend-host`에서 import한다. SDK client의 private 필드에 의존하지 않도록 `CoreClient`는 공개 method만 가진 구조 타입이다.

```ts
import { join } from 'node:path';
import type { FrontendHost } from '../vendor/frontend-host';

const api: typeof import('../vendor/frontend-host') =
  require(join(context.extensionPath, 'portable/bin/frontend-host.cjs'));
const host: FrontendHost = await api.createFrontendHost(context);
const unsubscribe = host.subscribeStatus(status => {
  // phase/native/nativeErrorCode만 UI 상태로 투영한다.
});
await host.prepare();
host.assertAgentReady();
const history = await host.client.listProjects();
// 확장 종료 시 unsubscribe(); await host.dispose();
```

`prepare()`는 runtime 선택·private data/ACL·Core lease·exact Kiro source 검증·worker 준비를 수행한다. `CORE_CONNECTED`는 HTTP 준비, `native: WORKER_READY`는 native 실행 준비다. 둘을 확인한다. native 미지원/Trust 실패 시에도 read-only History는 읽을 수 있고 mutation은 차단한다. 상태 callback에는 token·descriptor 경로가 없다.

`host.client`를 사용하면 재연결 세대를 유지한다. `onDidRotate()`에서 현재 stream의 결과를 버리고 durable snapshot/History를 읽는다. 응답을 받지 못한 mutation은 자동 재전송하지 않는다. 기존 run의 접수와 실제 Task 완료도 구분한다. 패널 dispose 때 구독을 해제하고, **확장 deactivate 때만** host를 dispose한다. 여러 창이 공유하는 Core는 lease가 관리한다.

API·payload의 원본은 kit의 SDK 타입이다. connection 파일·Bearer·host 객체·workspace 절대 경로는 webview message에 넣지 않는다. 기존 DTO projection을 유지한다.

## 5. 나머지 화면을 연결하는 순서

Builder/Helper 요청은 같은 client로 시작한다. 아래 코드는 host 내부에서 실행하며 `message`는 사용자가 명시적으로 제출한 내용이다.

```ts
import { entityId } from '../vendor/frontend-client';
const snapshot = await host.client.restoreProject(projectId);
if (!snapshot.currentTask) throw new Error('TASK_REQUIRED');
const run = await host.client.startRun({
  kind: 'BUILDER', projectId, taskId: snapshot.currentTask.id,
  expectedTaskRevision: snapshot.currentTask.revision,
  idempotencyKey: entityId('idem'), message,
});
const controller = new AbortController();
const terminal = await host.client.watchRun(run.id, event => {
  // event.kind(TEXT/TOOL/STATE/PERMISSION_DENIED)를 기존 화면 DTO에 매핑한다.
}, { signal: controller.signal, onRun: run => { /* 실행 상태 */ } });
const after = await host.client.restoreProject(projectId);
// terminal.status만으로 완료 표시 금지: after.currentTask/Completion Report도 읽는다.
```

Helper는 `kind: 'HELPER'`, 같은 `projectId/taskId`, 새 idempotency key, 사용자 질문을 보낸다. 필요한 경우 실제 pending `decisionId`를 포함한다. Helper 질문은 자동으로 Builder 재개나 사용자 이해 Evidence가 되지 않는다. 현재 Windows Helper/Analyst는 별도 보조 Kiro 창을 쓴다.

| 연결 영역 | 호출 및 처리 |
| --- | --- |
| 실행 중지 | `client.cancelRun(runId)` 반환 상태와 후속 `getRun/watchRun`으로 종료 확인. stream AbortController만 끊는 것은 Agent 취소가 아님 |
| native 추가 질문 | `host.worker.listUserInputs(projectId)`와 `subscribeUserInputs()`. `requestId/nativeJobId/Project/Task 또는 Session`을 현재 snapshot과 대조한 뒤 `submitUserInput(NativeAnswer)` 호출. 사용자 답변을 임의 생성하지 않음 |
| Decision | snapshot의 `pendingDecisions`와 `liveContext.contextVersion`을 읽고 `UI_RESOLVE_DECISION` 제출. 선택 또는 custom proposal, 사용자가 실제 입력한 rationale, source USER. 이어서 Builder 재개는 명시적 사용자 실행으로 처리 |
| 생성 workspace | idle일 때 `UI_PREPARE_BUILDER_SESSION`의 `purpose: WORKSPACE_VIEW`로 binding을 받아 host의 `vscode.openFolder`에 사용. webview에서 절대 경로를 받지 않음 |
| 결과 실행 | `UI_LAUNCH_RESULT` → 검증된 `RUNNING` loopback URL을 `vscode.env.openExternal()`로 열기 |
| Evidence/분석 | `UI_READ_EVIDENCE_TRACE`, `UI_READ_ANALYSIS_JOBS`. Agent 설명·실행 성공과 사용자 이해 상태를 분리 |
| Final Upgrade | 실제 개인화 trace와 사용자 개선 목표를 `UI_PREPARE_FINAL_UPGRADE_TASK`에 제출. Core가 eligibility/revision 검증 |

위 상세 payload와 안전한 action 순서는 백엔드의 `examples/kiro-panel/src/local-panel.cjs`가 실행 가능한 참조다. 범용 shell/file/HTTP bridge를 webview에 추가하지 않는다.

## 6. 오류와 지원 범위

| 상태 | 대응 |
| --- | --- |
| `NATIVE_WORKSPACE_TRUST_REQUIRED` | 작업 폴더를 신뢰한 뒤 준비 재시도. trust 이벤트도 자동 준비를 요청 |
| `NATIVE_INSTALLATION_*` / source 불일치 | 아래 exact 조합 확인. OS만 같다고 gate 해제 금지 |
| `CORE_*` / 연결 실패 | 명령 팔레트의 **Vibe Helper: Retry Core Connection**. 성공 시 창을 reload해 새 host/port로 저장 상태 복원 |
| `DISCOVERY_RUN_ACTIVE_STOP_OR_WAIT` | 현재 run 종료를 기다리거나 **Vibe Helper: Stop Active Discovery** 사용. 이 명령은 해당 확장의 Core에서 진행 중인 Discovery들을 취소 |
| revision conflict | 최신 snapshot을 읽어 사용자가 다시 검토. 실패 요청을 무조건 반복하지 않음 |
| timeout/Agent 실패 | 기존 저장 결과를 유지하고 원본 code 확인. 10분 관찰 deadline은 Agent 자동 취소가 아니므로 상태 확인/명시적 중지 후 다음 작업 |
| `NATIVE_ROLE_CATALOG_UNVERIFIED` | 기존 W5 Helper에서 관측. 실패와 진행 중 요청이 없음을 확인한 뒤 보조 창을 닫고 새 read-only 질문으로 복구. Builder mutation 재실행 금지 |

이번 지원은 Windows x64 build 26200, **Kiro 1.1.70 / Agent 1.1.158 / API 1.131.0**의 검증된 설치 source다. Kiro commit `8ce1870416c7dc7e51fffb01765d93ef7ad55102`, Agent entry SHA-256 `cf6a5124f2fed75144b9d4236e0ffff85a5b22732d739807070783323c071b87`. ARM64·다른 Kiro/Agent source를 지원한다고 표시하지 않는다. 검사 자체는 host에 포함돼 있다.

이번 실제 frontend host는 Kiro 내장 Node를 재사용했다. 기존 runtime 선택 경로는 Kiro → 호환 기존 Node → private runtime 다운로드 순서이며, 다운로드 경로는 네트워크가 필요하다. 생성 앱의 도구 준비는 별도 자동 경로다. backend source 개발 pin은 Node **24.19.0 / pnpm 11.12.0**이고 프론트의 npm 사용과 별개다.

## 7. 백엔드에서 재생성

```powershell
pnpm install --frozen-lockfile
pnpm frontend:handoff
# 현재 설치된 Edge로 전체 검사
$env:VIBE_E2E_BROWSER_CHANNEL = 'msedge'
pnpm check
```

`frontend:handoff`는 SDK·portable·reference VSIX·kit을 생성한다. 빌드에 쓰는 검증된 Node 배포 디렉터리에 LICENSE가 없다면 공식 v24.19.0 LICENSE를 별도로 두고 `VIBE_NODE_DISTRIBUTION_LICENSE`에 경로를 지정한다. 빌더가 해당 LICENSE의 정확한 hash를 확인한다.

검증 명령과 결과는 [이번 인계 결과](FRONTEND_HANDOFF_RESULTS_20260926.md)에 기록한다. 전달 ZIP의 manifest와 receipt는 소스 commit을 `backendHead`로 기록하고 `backendWorkingTreeDirty: false`인 상태에서 생성한다. ZIP을 저장소에 추가한 전달 commit과 소스 commit은 다르다. 로컬에서 수정 후 재생성하면 dirty 상태와 파일 hash가 달라지므로 해당 receipt를 함께 관리한다.
