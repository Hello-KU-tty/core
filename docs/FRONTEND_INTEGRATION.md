# Kiro IDE 프론트 개발 안내

> 2026-09-26 최신 Windows 연결 계획과 요청서 답변은 [프론트 인계 계획](FRONTEND_HANDOFF_PLAN_20260926.md)을 따른다. Windows 확장 자동 실행은 [W5](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md)에서 검증됐고, 외부 frontend용 host 모듈·연결 예제는 준비할 항목이다. 아래 CLI/수동 connection/macOS 안내와 Windows 미검증 문장은 과거 개발 기록이다.

> 2026-09-23 이후 Windows 제품 개발의 시작점은 [Windows 확장 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)다. 확장 설치 후 Core 자동 기동과 런타임 재사용이 필수이며, 아래 수동 CLI/connection 설정은 과거 개발 경로다. Windows native가 미검증이라는 사실은 유지하며 CLI로 조용히 전환하지 않는다.

> 현재 pin한 macOS IDE-only experimental flow를 구현하려면 먼저 [IDE-only frontend 구현 가이드](FRONTEND_IDE_IMPLEMENTATION_GUIDE.md)를 따른다. 이 문서는 기존 CLI/Windows 경로를 포함한 더 오래된 전체 계약 기록이다.
>
> T19 진행 중, 2026-09-07. 아래 backend/SDK/예제는 구현돼 있다. **Windows native 설치·실제 Kiro 실행 gate는 미검증이며 인계 완료가 아니다.** macOS 실측과 Windows 완료를 구분한다. 최신 증거는 [실측 기록](spikes/T19_LOCAL_RUNTIME_RESULTS.md)을 따른다. push는 별도 승인 전까지 하지 않는다.

## 연결 구조와 기존 질문의 답

```text
Kiro IDE Webview (프론트 화면)
  ↕ 허용된 화면 메시지
IDE extension host + @vibe-helper/frontend-client
  ↕ 인증된 loopback HTTP / SSE
별도 Node 24.19.0 local backend
  ├─ Core → SQLite / 생성 workspace
  ├─ workflow → Kiro CLI ACP → 역할별 MCP → Core
  └─ Analyst worker / 생성 결과 process 관리
```

Crew 설치·proxy secret·작성자의 계정은 필요 없다. 내장 Agent 채팅에 HTML을 삽입하는 API가 아니라 코드 편집기 옆의 **자체 확장 Webview 패널**이다. 개발자 본인의 Kiro 로그인을 사용한다. IDE와 CLI의 로그인이나 raw chat session이 자동 공유된다고 가정하지 않는다.

| 기존 질문 | local backend 답 |
|---|---|
| host:port | 같은 컴퓨터의 `127.0.0.1:47831` 기본값. `--port 0`은 자동 port. connection 파일로 접속하며 port를 UI에 고정하지 않는다. 원격/LAN 서버는 지원하지 않는다. |
| `KIROCREW_PROXY_SECRET` | 사용하지 않는다. 매 backend 실행 새 Bearer credential을 private `connection.json`에 생성한다. extension host만 읽는다. |
| `/api/test/agent` 활성화 | 제품 경로에 없고 404가 정상. 모델 실행은 SDK `startRun()`, Agent 제출은 실행별 역할 제한 MCP다. |
| protocol | `LOCAL_PROTOCOL_VERSION=1`, SDK 0.1.0. Crew의 `CREW_UI_PROTOCOL_VERSION=9`와 별개. SDK가 envelope를 만든다. |
| application path | `/api/application`. Crew prefix `/apps/vibe-helper`와 HMAC header를 붙이지 않는다. |
| 로그인·모델 | backend 사용자 계정의 CLI 로그인 필요. `core:doctor --live`로 실제 호출한다. 일반 health/doctor는 로그인 검증이 아니다. |

## 1. 설치·실행 — PowerShell

필수: Git, Node.js **24.19.0**, pnpm **11.12.0**, 검증할 Kiro IDE/CLI, 본인 로그인. Core Node와 IDE 내장 Node는 별도다. 실측 조합은 macOS arm64, Kiro IDE 1.0.337(내장 Node 22.22.0), CLI **2.21.1 / engine v2 / claude-haiku-4.5**다.

[Kiro 공식 설치 안내](https://kiro.dev/docs/getting-started/installation/)는 IDE Windows 10/11과 CLI Windows 11/PowerShell을 구분한다. Windows가 이 CLI 2.21.1/v2 조합을 제공하는지는 확인 전이다. 최신 CLI 3.x와 호환된다고 가정하거나 사용자 Kiro를 임의 downgrade하지 않는다. 해당 조합을 설치할 수 없거나 doctor가 거절하면 Windows 버전/architecture와 IDE/CLI 버전을 backend 담당자에게 전달하고 지원 경로를 먼저 결정한다. WSL은 전제하지 않는다.

```powershell
# 전달받은 backend revision을 checkout한 repository 루트
node --version
pnpm --version
kiro-cli --version
pnpm install --frozen-lockfile
pnpm build
pnpm core:init
pnpm core:doctor
# 실제 모델 호출 1회와 본인 Kiro 사용량을 소비하는 진단
pnpm core:doctor --live
pnpm core:start
```

CLI가 PATH에 없으면 doctor/start에 `--kiro-cli "C:\실제설치경로\kiro-cli.exe"`를 추가한다. 모델/Agent identity가 다르면 실패하며 default Agent/provider/v3 fallback은 없다. port 충돌은 `pnpm core:start --port 0`으로 해결한다. `READY` 출력에는 `baseUrl`, `connectionFile` 경로, instance/version만 있고 token 값은 없다. backend 터미널을 켜 둔다.

기본 root는 `<checkout>/.data/local`이다. `--root "C:\dev\vibe-helper-local"`로 바꾸면 init/doctor/start/recover 모두 같은 root를 지정한다. **새 빈 local drive 폴더만** 사용한다. 사용자 홈 전체, Crew DB, 다른 프로젝트, UNC/network drive를 지정하지 않는다. 공백은 quoting하지만 Windows hook 경로에 `% ! & | < > ^ $` 등 shell 확장 문자는 지원하지 않는다.

root 안에는 `data`(SQLite), `workspaces/projects/project_<uuid>`(생성 코드), `agents`, private `connection.json`, 실행 lock이 생긴다. Git·스크린샷·채팅에 올리지 않는다. Windows에서는 `whoami.exe` SID와 `icacls.exe`로 새 디렉터리의 상속 ACL을 제한한다. 실제 Windows ACL 검증은 아직 필요하다. 종료한 Agent의 credential은 폐기하고 backend credential은 시작마다 갱신한다.

SQLite는 better-sqlite3 13.0.3의 packaged N-API prebuild를 사용한다. lifecycle 실행은 esbuild만 허용한다. 오류를 이유로 `pnpm approve-builds`로 임의 package를 허용하거나 Node pin을 우회하지 않는다. Windows native load 실패 시 OS/architecture와 오류 코드를 공유하되 credential/개인 경로를 제거한다.

## 2. 실제 Kiro IDE 최소 패널

backend를 켜 둔 상태에서 새 터미널로 `pnpm panel:build`를 실행한다.

1. **Kiro IDE**에서 `examples/kiro-panel` 폴더를 연다.
2. Run and Debug의 `Kiro Local Integration Panel`을 F5로 실행한다. `${execPath}`를 사용하므로 VS Code에서 실행한 결과는 Kiro 검증이 아니다.
3. 새 Extension Development Host의 Command Palette에서 `Vibe Helper: Open Local Integration Panel`을 실행한다.
4. backend가 출력한 `connection.json` **파일**을 선택한다. token을 복사하지 않는다. 반복 사용 시 machine 설정 `vibeHelper.connectionFile`에 절대 파일 경로만 저장한다.
5. Learning Goal → preview → 후보 선택/수정 → Spec 초안/수정/확정 → Builder/Helper → History를 확인한다.

예제는 디자인 완성품이 아니라 snapshot·Agent stream을 확인하는 최소 참조다. Builder가 Decision을 요청하면 Helper에 질문하고 사용자 option을 선택한 뒤 Builder에 이어서 진행하라고 명시적으로 보낸다. `workspace 열기`는 Core가 생성한 폴더를 새 창에서 열며 기존 임의 repository import가 아니다.

자동 extension-host 검증은 실제 Kiro 실행파일 경로를 확인해 실행한다. shim 대신 `Kiro.exe`를 사용한다. 별도 임시 profile을 사용하며 기존 설정/확장 설치를 바꾸지 않는다.

```powershell
node scripts/test-kiro-panel.mjs "C:\실제설치경로\Kiro.exe" ".data\local\connection.json"
```

`IDE_HOST_PASSED`는 확장 활성화·패널 명령·네 화면용 Core 데이터 접근을 입증한다. `visualReview: NOT_ASSERTED_BY_HOST_TEST`이며 실제 클릭/렌더링 검토를 대체하지 않는다. 빈 root에서는 먼저 예제로 프로젝트를 만든다.

## 3. program에서 SDK 사용

backend 루트의 `pnpm client:pack`은 `dist/vibe-helper-frontend-client-0.1.0.tgz`를 만든다. 공개 registry publish는 필요 없다. program 폴더에서:

```powershell
npm install "C:\실제backend경로\dist\vibe-helper-frontend-client-0.1.0.tgz"
```

SDK는 ESM/CJS·타입 선언·exact Zod를 포함하고 `workspace:*`, SQLite/native storage, Core application import가 없다. TypeScript 5.4.5/esbuild 0.21.5/CJS 외부 소비 조건을 검증했다. **extension host용**이며 Webview에서 import하지 않는다.

```ts
import { connectLocalCore } from '@vibe-helper/frontend-client/node'
import { LocalProgramAdapter } from '@vibe-helper/frontend-client'

const client = await connectLocalCore(connectionFilePath) // IDE 설정/파일 선택
const adapter = new LocalProgramAdapter(client, () => selectedProjectId)
// program의 AgentAdapter injection에서 DemoAdapter 대신 adapter를 전달한다.
// selectedProjectId는 아래 Discovery/History에서 선택한 실제 Core Project ID다.
```

[참조 program c639a59](https://github.com/Hello-KU-tty/program/tree/c639a595353f0db38e09112ba094ce5510fb1cbd)의 `AgentAdapter`에 구조적으로 대응한다. `startTurn({agent:'builder'|'helper',text,allowWorkStream}, onEvent)` → `{turnId,cancel()}`와 started/message_chunk/work_item/work_item_result/completed/failed를 제공한다. 기존 `KiroAcpAdapter`에 임의 transport를 끼우거나 `allowWorkStream`으로 권한을 선택하지 않는다. 명시적 agent 역할로 backend의 별도 session·MCP 권한을 선택한다.

`completed`는 **Agent turn 종료**이지 Task 완료/테스트 성공이 아니다. `restoreProject()`로 Task/Context/Decision/report를 다시 읽는다. failed tool output도 Work Stream에 표시한다. `isAvailable()`은 Core/Task/run 상태만 확인하며 로그인/모델 보장은 아니다.

Webview 메시지는 [예제 handler](../examples/kiro-panel/src/extension.cjs)처럼 명시적 화면 action을 validation한다. credential, 임의 인증 URL fetch, 범용 MCP/tool/SQL/file/shell bridge를 제공하지 않는다. Agent text는 untrusted text로 render한다. mock/live를 명시적으로 구분하고 live 실패를 DemoAdapter 성공으로 바꾸지 않는다.

## 4. 네 화면 계약

SDK가 export하는 DTO/schema를 view model로 변환한다. 원본은 [UI contracts](../packages/contracts/src/ui-contracts.ts), [History/snapshot](../packages/contracts/src/ui-session.ts), [run contracts](../packages/contracts/src/local-runtime.ts)다. `entityId('project'|'idem'|'feedback'|…)`, `uiMetadata(correlationId)` helper를 사용한다. revision/correlation은 현재 snapshot의 해당 entity에서 읽는다. Agent 결과를 USER provenance로 만들어 제출하지 않는다.

loading/부분 보강/실패/stale/cancel mock 상태와 Candidate·Spec 합성 자료의 위치는 [mock 개발 자료](../examples/kiro-panel/fixtures/README.md)에 있다. 동일 runtime schema로 validation하며 live 결과를 대신하지 않는다.

### Discovery

```ts
const { projectId, run } = await client.startDiscovery({
  learningGoal: goal,
  ...(personalNeed ? { personalNeed } : {}),
})
const result = await client.watchRun(run.id, event => showProgress(event))
const snapshot = await client.restoreProject(projectId)
```

기본은 preview 후 background enrichment 두 batch다. 직접 JIT 제어하려면 두 번째 인자로 `{enrichAfterPreview:false}`를 준다. `discoveryContext.previewRound.previews`의 10개 identity가 먼저 저장되고 `candidateEnrichments`는 일부만 있을 수 있다. 완성 Round의 `candidates`는 ID/revision reference이며 `discoveryContext.candidates`에서 정확한 ID+revision으로 찾는다.

| 동작 | extension host 처리 |
|---|---|
| 보강 재시도 | 최신 Session revision으로 DISCOVERY `ENRICH_ALL` run |
| preview 중 선택/조정 | active Discovery cancel → 누락 target만 `ENRICH_SELECTED` → 저장 확인 → `UI_RECORD_DISCOVERY_FEEDBACK` |
| 수정·축소·확장·추가 등 | Core feedback intent PIN/REJECT/REVISE/SHRINK/EXPAND/REGENERATE/MORE, 이어 `ROUND` run |
| 병합 | Core MERGE feedback, 이어 `MERGE` run |
| 명시적 선택 | Core SELECT feedback, 이어 `SPEC` run |

run에는 `kind:'DISCOVERY'`, projectId, discoverySessionId, expectedSessionRevision, 새 idempotencyKey, phase와 필요시 candidateIds를 보낸다. feedback에는 현재 Round ID·candidate revision·USER source가 필요하다. preview-only의 MORE처럼 전체 Round가 필요한 동작은 먼저 ENRICH_ALL을 완료한다. 필드별 실행 코드는 [예제](../examples/kiro-panel/src/extension.cjs)와 [실측 runner](../scripts/test-live-local.mjs)에 있다.

### Spec

`snapshot.learningSpec`의 실제 초안과 세 scope를 표시한다. 자유 입력 수정은 `startRun({kind:'DISCOVERY',phase:'SPEC',message,expectedSpecRevision,…})`에 최신 Session revision을 함께 보낸다. 단순 문자열을 UI_UPDATE_LEARNING_SPEC에 넣는 것은 모델 수정이 아니다. runtime이 user feedback·실제 모델·더 높은 durable Spec revision을 확인한다. no-tool Spec은 recovery 한 번 후에도 저장이 없으면 실패다.

확정은 UI_CONFIRM_LEARNING_SPEC(projectId, learningSpecId, expectedSpecRevision, idempotencyKey), 성공 snapshot을 읽은 다음 UI_PREPARE_BUILDER_TASK다. [예제 confirm action](../examples/kiro-panel/src/extension.cjs)을 재사용한다. 뒤로가기는 UI_RETURN_TO_DISCOVERY와 snapshot 조회뿐이며 모델을 호출하지 않는다. 확정 뒤 같은 Discovery를 재실행하지 않는다.

### Builder / Helper

`currentTask.id/revision`으로 BUILDER run을 시작하거나 LocalProgramAdapter를 쓴다. watchRun은 redaction된 TEXT/TOOL/STATE/PERMISSION_DENIED만 전달하며 thought는 제외한다. `outcome:'TURN_ENDED'`와 Task COMPLETED는 다르다.

- `liveContext`: 현재 작업·오류·다음 단계, `pendingDecisions`: 실제 사용자 판단.
- UI_RESOLVE_DECISION: 실제 option/recommendation/custom proposal과 선택적 본인 rationale를 USER source로 제출한다. Builder 후속 turn이 MCP로 읽고 적용한다. stale Context면 새 snapshot으로 재확인한다.
- HELPER run: 같은 Task/선택적 Decision ID의 read-only 설명과 bounded Helper exchange/Episode 기록. 자유 질문은 `origin:'FREE_TEXT'`, 버튼은 QUICK_ACTION으로 구분한다. Helper 사용/확인 클릭만으로 이해도를 승격하지 않는다.
- UI_READ_ANALYSIS_JOBS: backend worker의 pending/running/succeeded/failed. 패널이 닫혀도 backend가 켜져 있으면 worker가 실행된다.
- UI_PREPARE_BUILDER_SESSION의 `purpose:'WORKSPACE_VIEW'`: 완료 Task에서도 canonical `workspaceDirectory`만 읽는다. 기본 Agent-session 준비와 완료 Task 재실행은 여전히 거절한다.
- UI_LAUNCH_RESULT: compiled web entry의 loopback 실행 후 RUNNING/url. 이는 build/test 검증 endpoint가 아니다.

Completion Report는 **Agent-authored 보고**다. launcher 200/COMPLETED만으로 독립 build/test 통과를 주장하지 않는다. 실제 Builder 1.3.0이 guard-denied 명령을 통과라고 보고한 실패를 발견했다. 1.3.1에 허용 command·실행 증거·NOT_RUN/FAILED와 미검증 시 미완료 지침을 추가했지만 deterministic 검증기는 아니다. 실제 명령 결과를 별도로 확인한다. 저장된 완료 보고를 조용히 수정하지 않고 후속 작업은 기존 Core의 명시적 사용자 goal 기반 Final Upgrade로 분리한다. 전체 Final Upgrade UI는 후속 범위다.

Builder guard는 native 경로/cwd와 제한된 shell 문법을 검증한다. `cd … && …`는 거절되고 npm run build/npm test 등 단일 명령을 사용한다. **Agent-authored package script를 OS 수준에서 격리하는 sandbox는 아니다.** 신뢰하지 않는 프로젝트 import/외부 plugin/credential을 생성 workspace에 넣지 않는다. 외부 데이터·배포·비용 작업은 local 개발 권한에 포함하지 않는다.

### History / 중단 복원

`listProjects()` → ProjectHistory.projects의 제목/상태/updatedAt/권장 진입 단계. `restoreProject(projectId)` → ProjectSessionSnapshot의 Session/후보/선택/Spec/currentTask/Decision/Context/report/Helper 대화. **조회만으로 모델 호출 0회**다. 작업 재개는 사용자가 명시적으로 새 run을 시작한다.

run/stream은 메모리 상태다. backend 재시작 후 listRuns는 비고 기존 ID는 RUN_NOT_FOUND_RESTORE_PROJECT다. durable Project는 SQLite에서 복원한다. 같은 backend에서도 run 100개, run당 500 events/약 1MiB만 유지한다. `retainedFromSequence > lastSeen+1`이면 일부 stream 유실을 표시한다. 무한 replay/raw transcript 영구 보관을 전제하지 않는다.

## 5. 오류·중지·재시작

HTTP 202는 접수다. protocol mismatch 409, 인증 실패 401, browser Origin/잘못된 Host 403이다. SDK LocalClientError.code를 상태/복구 UI로 변환한다.

| 오류/상태 | 복구 |
|---|---|
| STALE_*_REVISION, Context conflict | snapshot 재조회 후 최신 값으로 사용자 작업 재확인. 오래된 body 무한 재전송 금지 |
| RUN_BUSY / RUNTIME_CAPACITY | listRuns로 진행 표시, 기다리거나 사용자 중지 |
| AGENT_RESULT_NOT_STORED, ACP timeout/RPC/identity 오류 | 기존 결과를 먼저 복원, 로그인/CLI/phase 확인 후 새 key로 명시적 재시도. mock fallback 금지 |
| RUN_IDEMPOTENCY_CONFLICT | 같은 key를 다른 요청에 재사용 금지. 같은 접수 응답만 유실됐으면 같은 body/key로 조회 효과. SDK 자동 mutation retry 없음 |
| stream disconnect / BACKEND_RESTARTED_RELOAD_CONNECTION | 최신 connection 파일을 읽어 새 client를 만들고 History 복원. 완료 추정 금지 |
| GUARD_* / PERMISSION_DENIED | 거절을 그대로 표시, 허용된 작업으로 수정. 범용 권한 추가 금지 |
| RESULT_* | manifest/compiled entry/실행 실패와 Task 보고 분리. 실제 healthy URL만 열기 |

`cancelRun(runId)`는 owned Agent 중지와 run/MCP authority 폐기다. 이미 저장된 Core 결과를 rollback하지 않는다. watchRun의 AbortSignal/패널 닫기는 구독 중지일 뿐 backend run 취소가 아니다. 동시 4개, 같은 Project/role은 하나만 실행한다.

backend 터미널 Ctrl+C로 정상 종료한다. IDE 종료는 별도 backend를 종료하지 않는다. 재실행 후 최신 connection으로 다시 접속한다. 비정상 종료 lock은 원래 process가 끝났는지 확인한 후:

```powershell
pnpm core:recover
pnpm core:doctor
pnpm core:start
```

recover는 owner PID가 실제로 없을 때만 lock을 archive하며 DB/코드는 삭제하지 않는다. 실행 중 PID나 판별 불가능한 lock을 강제 삭제하지 않는다. 임시·진단 디렉터리는 자동 삭제하지 않는다.

## 6. 인계 검증 / Windows gate

```powershell
pnpm check
pnpm client:pack
node scripts/test-frontend-consumer.mjs ".data\local\connection.json"
pnpm panel:build
```

다음 live 검증은 **본인 Kiro 사용량·합성 프로젝트 생성·생성 code/package script 실행**이 있다. 사용자/Crew data가 아닌 새 테스트 root에서만 실행한다. 첫 명령의 Project ID를 두 번째에 넣는다. `--personal-need`를 빼면 Personal Need 없는 입력이다.

```powershell
node scripts/test-live-local.mjs ".data\local\connection.json" --personal-need
node scripts/test-live-local-build.mjs ".data\local\connection.json" "project_출력된UUID"
```

첫 명령은 실제 preview/JIT/refinement/Spec 수정·확정·Task/History다. 두 번째는 Decision→Helper read-only→사용자 선택→Builder에 더해 **별도 임시 폴더에서 generated dependency frozen install/build/test**, 실제 결과 health·Analyst를 검증한다. Agent가 작성한 결과 코드는 runner가 수정하지 않는다. 실패 exit code를 성공으로 취급하지 않는다. fixture eval은 모델 실측과 별개다.

Windows gate에는 OS 버전/x64·arm64, Node/pnpm, IDE/CLI/engine, backend commit SHA, SDK 0.1.0/protocol 1과 다음 실제 결과가 필요하다.

- 새 checkout frozen install/build/SQLite load, ACL 비공개·공백 포함 경로.
- doctor live/Agent identity, Builder 실제 write/test·workspace 밖 쓰기 거절, Helper/Analyst 권한.
- 실제 Kiro 네 화면 클릭·렌더링, credential/개인 경로 redaction.
- 중지/Ctrl+C/restart 후 owned child 종료, token 갱신, 같은 Project/revision 복원.
- 실제 생성 코드 build/test·loopback 결과, Analyst 정상 job. health/mock만으로 완료하지 않음.

**Windows gate는 미검증이다.** CLI 2.21.1/v2 native Windows를 확보할 수 없다면 CLI 3.x 대응이나 다른 실행 구조를 별도 capability 검토로 결정한다. 현재 구현으로 Windows 완료를 선언하지 않는다. 전체 Evidence/Final Upgrade UI parity, 제품 polish, marketplace 배포, 기존 repository import, 원격 서버/cloud sync는 이번 인계에 포함하지 않는다.
