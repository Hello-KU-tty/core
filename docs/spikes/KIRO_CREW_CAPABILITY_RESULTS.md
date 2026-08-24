# T01 Kiro/Crew Capability Spike 결과

## 1. 판정 상태

- 상태: 완료. 검증된 경로와 MVP fallback 확정
- 실행일: 2026-08-24~25
- 환경: macOS Mac mini prototype
- 최종 제품 target: Windows Kiro
- 상세 실험 계획: [KIRO_CREW_CAPABILITY_SPIKE.md](KIRO_CREW_CAPABILITY_SPIKE.md)

실제 runtime에서 관측한 항목만 `PASS` 또는 `PARTIAL`로 표시했다. `PARTIAL`인 Crew 기능은 이후 구현의 전제가 아니며, 각 항목에 검증된 fallback을 함께 고정했다.

## 2. 데이터·인증 경계

- 사용자가 Kiro 설치와 경진대회 계정 로그인을 직접 완료했다.
- 계정 정보, provider/model 설정, 인증 파일, token, 기존 Kiro 사용자 설정 내용은 열람하지 않았다.
- 사용자 home의 Kiro/Crew config를 직접 읽거나 repository로 복사하지 않았다.
- local dashboard auth token을 직접 요청하는 `kirocrew token`은 실행하지 않았다.
- raw chat/session payload는 수집하거나 저장하지 않았다.
- probe Agent prompt에도 계정, 인증 파일, credential과 사용자 설정을 읽지 말라는 경계를 명시했다.

`kirocrew restart`가 예상과 달리 local dashboard access token을 CLI 출력에 포함하는 보안상 중요한 동작을 한 차례 보였다. 값을 repository나 별도 파일에 저장·인용하지 않았고, 즉시 `kirocrew logout`으로 모든 dashboard session을 revoke했다. 사용자가 브라우저를 직접 재인증했으며 이후에도 token, cookie, storage와 계정 정보를 열람하지 않았다. 이후 자동 검증에서는 이 명령을 다시 실행하지 않고, restart가 필요하면 사용자가 출력 내용을 공유하지 않은 채 직접 실행하는 경계로 둔다.

## 3. 확인된 환경

| 항목 | 관측값 | 판정 |
|---|---|---|
| Kiro IDE | `/Applications/Kiro.app`, 1.0.337 | PASS |
| Kiro CLI | 2.19.1 | PASS |
| Kiro Crew | `/Applications/KiroCrew.app`, 0.3.0 | PASS |
| Crew CLI | `/Users/hurdoo/.local/bin/kirocrew` | PASS |
| Node.js | v26.4.0 | PASS, T02에서는 active LTS 고정 필요 |
| pnpm | 11.12.0 | PASS |
| Crew Gateway | loopback `127.0.0.1:5476`, root HTTP 200 | PASS |
| Windows runtime | 아직 실행하지 않음 | BLOCKED, macOS prototype 이후 별도 재검증 |

Gateway 확인은 root health에 한정했다. provider, model, usage 또는 사용자 식별 정보를 주는 endpoint는 조회하지 않았다.

macOS one-shot Agent 실행에서는 Crew가 Linux cgroup v2 자원 ceiling을 적용할 수 없다는 경고를 출력했다. 명령의 `RLIMIT_NOFILE`은 유지되지만 subprocess fork-bomb/memory-DoS 제한은 Linux와 같지 않다. 이는 prototype 실패는 아니지만 Windows target의 실제 process isolation과 함께 다시 확인해야 한다.

## 4. Probe artifact와 build

Probe source는 `spikes/kiro-crew/`에만 있다.

- root `app.json`: macOS/Windows platform, React UI, 세 개의 최소 Agent, `/api/chat`과 `slots:own`만 허용
- Builder/Helper/Analyst Agent: tool이 없는 최소 prompt
- React UI: Builder와 Helper용 visible slot 두 개, Analyst용 hidden slot 하나 생성/복원
- UI 표시: 두 `ChatEmbed` pane, native chat 비교 버튼, redacted event count와 synthetic Analyst run 상태
- negative permission test: manifest에 없는 `/api/status` 요청이 거절되는지 확인
- raw event 본문은 UI state나 repository에 저장하지 않고 event type별 count만 유지

재현 명령:

```bash
cd spikes/kiro-crew/ui
pnpm install
pnpm run typecheck
pnpm run build
cd ..
kirocrew app install "$PWD"
```

관측 결과:

- `pnpm run typecheck`: 성공
- `pnpm run build`: 성공
- final output: `ui/dist/index.mjs`, 12.72 kB, gzip 4.01 kB
- Crew local path install: v0.0.1부터 v0.0.4까지 단계별 설치·재설치 성공
- dependency supply-chain gate가 `esbuild` postinstall을 기본 차단했으며, `esbuild` 하나만 명시적으로 승인한 뒤 build했다.

`dist/`, `node_modules/`와 local pnpm store는 Git 대상에서 제외한다.

## 5. App lifecycle 보안 관측

설치 직후 Crew는 app 파일은 받아들이되 executable resource 등록과 enable을 차단했다.

```text
third-party app execution is disabled; trust this app alone by adding
'vibe-helper-probe' to agent.apps_trusted
```

이 결과는 다음을 확인한다.

1. third-party app은 설치만으로 실행되지 않는다.
2. enable 단계에서도 실행 정책이 다시 fail-closed로 적용된다.
3. 전역 `apps_allow_third_party=true`와 앱별 `apps_trusted`가 분리돼 있다.
4. Crew dashboard에는 `POST /api/security/trusted-apps/{name}` 단일 앱 grant가 있으며, 기존 목록에 이름을 원자적으로 추가하도록 구현돼 있다.

Settings UI에는 실행 정책에 막힌 probe가 노출되지 않아, 사용자가 새 설치 상태임을 확인한 뒤 다음 공식 CLI 경로로 앱 하나만 신뢰했다.

```bash
kirocrew config set agent.apps_trusted '["vibe-helper-probe"]'
kirocrew app enable vibe-helper-probe
kirocrew restart
```

세 명령은 모두 성공했다. 이후 `kirocrew app info vibe-helper-probe`에서 `enabled: true`, source, manifest와 macOS/Windows platform을 확인했다. local app route는 HTTP 200을 반환했고, 인증 없이 직접 시도한 UI API 경로는 HTTP 403을 반환했다. 이는 dashboard HTML route와 API 인증 경계가 분리돼 있다는 관측이며 UI render 성공을 뜻하지는 않는다.

인증된 dashboard에서 v0.0.2와 최종 v0.0.4 UI render, `status:ready`, `permission:pass`를 확인했다. `/api/status` negative permission test는 manifest에 없는 API 요청을 실제로 거절했다. Gateway 재시작 전에 열어 둔 app route는 오래된 navigation snapshot 때문에 설치된 앱을 `unknown`으로 표시할 수 있었지만, 새 `/apps` tab에서 app을 선택하면 정상 복구됐다.

local source를 수정한 뒤 dashboard의 `동기화` 동작은 source app을 `origin: registry`로 잘못 취급해 registry 조회 오류로 실패했다. 사용자가 승인한 uninstall 후 local reinstall은 v0.0.2를 정상 반영했지만, 기본 `keep_data`에도 기존 v0.0.1 app-owned chat slot 기록은 보존되지 않았다. 설치 과정의 orphaned partial install 정리와 local source origin 표시는 Crew 0.3.0의 개발·업데이트 lifecycle 결함으로 기록한다.

재인증 뒤 v0.0.3/v0.0.4를 설치했을 때는 App detail의 `사용` 동작이 앱 이름을 명시한 단일 trust confirmation을 표시했고, 이를 통해 해당 App만 원자적으로 신뢰·활성화했다. 제품 설치 안내는 목록 전체를 쓰는 CLI보다 이 dashboard 확인 경로를 우선한다.

전역 third-party 실행은 허용하지 않았다. 해당 `config set`은 목록 전체를 쓰므로, 기존 trusted app이 있는 환경의 일반 설치 절차로 사용해서는 안 된다. 제품 installer에서는 Crew의 단일 앱 grant UI/API나 기존 목록을 보존하는 공식 경로가 필요하다.

## 6. SDK/API 관측

### 공식 문서로 확인

- Crew App UI는 host-provided `@kirocrew/app-sdk`를 사용한다.
- API path, WebSocket event와 MCP tool은 manifest permission allowlist로 제한된다.
- chat slot, history, send, streaming event와 async task surface가 있다.
- chat session의 현재 context와 approval state는 서로 독립적이며, session 간에는 live context가 자동 공유되지 않는다.
- 공개된 Node 전용 Gateway client package는 없으므로 non-UI TypeScript adapter는 REST/WebSocket을 좁게 감싸야 한다.

### 설치된 Crew 0.3.0에서 추가 확인

host SDK bundle은 공식 hook 외에 `ChatEmbed`, `ChatPanel`, `useChatSession`을 export한다. `ChatEmbed`은 app-owned slot을 읽고 메시지 전송·stream·approval을 표시하는 구현을 포함한다.

이 세 export는 현재 공개 SDK 문서에 명시되지 않았으므로 아직 안정된 제품 전제로 확정하지 않는다. 실제 dashboard render와 reconnect까지 통과한 뒤에도 `kiro-adapter` 또는 얇은 UI wrapper 뒤로 격리해야 한다.

또한 동일 workspace에서 hook이 자동 생성하는 기본 slot key를 Builder와 Helper가 함께 사용하면 충돌할 수 있어, probe는 서로 다른 slot key를 명시적으로 생성한다.

### 실제 App event bridge 판정

v0.0.1과 v0.0.2에서 각각 두 pane의 실제 응답 streaming을 완료했지만, `useAppEvents`로 구독한 모든 event count는 0이었다. v0.0.2는 설치된 SDK가 인정하는 `chat_message`, `chat_status`, `chat_chunk`, `chat_done`, `tool_call`, `approval`, `subagent_status`, `subagent_done`, `slots`를 사용했으며, 원 계획의 `task_update`와 `task_complete`는 현재 SDK가 인정하는 event명이 아니어서 제거했다.

설치된 Crew 0.3.0 bundle을 추적하면 `useAppEvents`는 `mc:app:<event>` DOM event를 구독하지만, dashboard WebSocket reducer는 state와 `mc:app-reload`만 갱신하고 Gateway event를 해당 DOM event로 dispatch하지 않는다. 따라서 이 버전에서 app event hook은 실질적으로 연결되지 않은 것으로 판정한다. 이는 source inspection과 두 차례 실제 streaming 관측이 일치하는 결론이다.

제품 구현은 `useAppEvents`를 전제로 두지 않는다. 명시적인 structured MCP checkpoint를 primary 경로로 삼고, history 복원은 REST 조회로 처리한다. 필요하면 app backend가 Gateway REST/WebSocket을 직접 감싸되 `kiro-adapter` 뒤로 격리한다.

Crew 0.3.0의 `useAppApi().post()`는 허용 path를 검사한 뒤 성공 응답 본문을 항상 JSON으로 파싱한다. `/api/chat`은 SSE라서 실제 Analyst 호출은 완료돼도 client가 `Unexpected token 'd', "data: ..." is not valid JSON`으로 실패했다. host의 `ChatEmbed`도 이 endpoint를 일반 JSON API와 별도로 처리한다. 최종 probe는 `POST /api/chat` 하나만 고정한 same-origin streaming adapter로 dispatch하고, slot 생성·history/result polling은 계속 permission-checked App API를 사용한다. 범용 raw HTTP surface는 만들지 않는다.

설치된 SDK source에서 `permissions.api` 검사는 `useAppApi`가 path prefix를 확인하는 browser-side wrapper로 구현돼 있다. 활성화된 App JavaScript가 same-origin `fetch`를 전혀 호출할 수 없도록 막는 별도 server-side app identity는 이 경로에서 관측되지 않았다. 따라서 manifest allowlist를 credential·개인정보 보호의 유일한 강제 경계로 간주하지 않는다. 앱별 trust dialog, 좁은 고정 adapter, Agent별 물리적 MCP catalog와 Core validation을 함께 사용한다. 인증 없는 외부 `curl`은 403이므로 dashboard session auth 경계와 App 내부 capability 경계는 구분해야 한다.

## 7. Capability matrix

| Gate | 현재 판정 | 증거 | 남은 확인 |
|---|---|---|---|
| G0 설치·Gateway | PASS | 실제 version과 loopback HTTP 200 | Windows에서 재검증 |
| G1 App build/install | PASS | typecheck/build/install, 단일 신뢰, enable, 실제 dashboard render와 negative permission | Windows 재검증, local update lifecycle fallback |
| G2 두 chat slot·event | PARTIAL | 독립 slot의 동시 stream, 정확한 pane 분리와 reload history 복원 | App event hook 대신 검증된 REST/MCP fallback 사용 |
| G3 동시 Builder/Helper pane | PASS | v0.0.1·v0.0.2 두 pane 동시 응답, reload 복원, native chat 전환 후 복원 | undocumented `ChatEmbed` wrapper 유지 |
| G4 Core Decision·Agent 권한 | PASS | 분리된 Builder/Helper MCP catalog, stale write 차단, 실제 Decision handoff와 Builder 재개 | 제품 contract로 일반화 |
| G5 background Analyst | PARTIAL (MVP path PASS) | hidden app-owned slot, 20~37ms dispatch, responsive Helper, schema/correlation validation, same-slot repeat | native spawn/cancel은 사용하지 않음; durable Core job은 제품 구현 |
| G6 restart·지속성 | PARTIAL | page reload history 복원, Gateway restart 후 app 재진입, Core stable id handoff | pending Crew spawn과 reinstall chat data는 유실; Core DB만 source of truth |
| G7 Kiro IDE thin surface | PARTIAL (fallback 확정) | 실제 CLI에서 동일 project-local Agent/MCP 실행, 공식 IDE/CLI workspace Agent 지원 | macOS 시각 smoke와 Windows 재검증 |

### Agent registration smoke

두 custom Agent를 동시에 one-shot 실행했다.

```bash
kirocrew chat --agent vibe-probe-builder -m '... Reply with exactly BUILDER_OK ...'
kirocrew chat --agent vibe-probe-helper -m '... Reply with exactly HELPER_OK ...'
```

두 명령은 exit code 0으로 약 12초 안에 완료됐고 각각 `BUILDER_OK`, `HELPER_OK`만 응답했다. 이는 enabled app의 custom Agent registration, Kiro runtime 호출과 역할 선택이 작동하며 병렬 호출 출력이 서로 섞이지 않음을 보여준다. dashboard chat slot, live event와 history 격리는 별도 검증이므로 G2 전체를 `PASS`로 올리지는 않는다.

Crew one-shot teardown 때 `AcpRuntime dead ... killed` warning이 뒤따랐지만 명령은 이미 정상 결과와 exit code 0을 반환했다. 정상적인 one-shot teardown인지 runtime 결함인지는 반복·restart 실험에서 구분한다.

### Dashboard 두 pane·history 관측

v0.0.1에서 동시에 보낸 합성 prompt는 각각 `BUILDER_SLOT_OK`, `HELPER_SLOT_OK`를 약 3초 안에 정확한 pane으로 반환했다. reload 후 두 기록이 복원됐다. v0.0.2에서도 `BUILDER_EVENT_OK`, `HELPER_EVENT_OK`가 각각 정확한 pane으로 반환됐고 reload 후 유지됐다. 응답이나 stream의 pane 혼합은 관측되지 않았다.

`Compare native chat`은 `vibe-probe-builder`가 선택된 native chat route로 전환했고, browser back으로 app에 돌아온 뒤에도 두 pane history가 유지됐다. 따라서 Agent 중심 App과 native chat surface 간 전환은 가능하다. 다만 local app uninstall/reinstall은 v0.0.1 기록을 잃었으므로 설치 lifecycle을 persistence 보장으로 간주하면 안 된다.

### Synthetic Core와 Agent별 MCP 권한

`spikes/kiro-crew/mcp/`에 S4 전용 MCP server와 deterministic Decision controller를 만들고 `spikes/kiro-crew/s4-workspace/`에 project-local Builder/Helper Agent를 분리했다. 두 Agent 모두 `includeMcpJson: false`이며 generic file, shell, SQL, network tool을 갖지 않는다.

Builder MCP catalog:

- `probe_get_context`
- `probe_get_decision`
- `probe_publish_context`
- `probe_create_decision`
- `probe_read_resolution`

Helper MCP catalog:

- `probe_get_context`
- `probe_get_decision`
- `probe_check_context_freshness`

공식 MCP TypeScript SDK 2.0.0의 stdio server/client로 contract test를 실행했다. Helper가 `probe_publish_context`를 호출하면 tool 자체가 없어 protocol error로 거절됐고 state는 불변이었다. Builder의 존재하는 mutation에 오래된 revision을 주면 tool error로 거절되고 state는 불변이었다. 같은 test에서 correlation id 하나로 pending Decision 생성, deterministic resolve와 Builder resolution read가 revision 0→1→2→3으로 이어졌다.

실제 Kiro CLI runtime에서도 두 project-local Agent config를 validate한 뒤 같은 흐름을 재현했다. Builder는 context publish와 Decision 생성을 병렬 호출해 실제 revision race를 만들었다. Core가 Decision 생성을 stale error로 차단하자 Builder가 revision 1로 재시도해 성공했다. Helper runtime은 세 개의 read-only tool만 노출됐다고 확인하고 context, pending Decision과 stale 여부만 읽었다. Agent 밖 deterministic controller가 `option-once`를 선택한 뒤 새 Builder session은 같은 `corr-registration-shape`의 resolution과 revision 3을 읽고 재개했다.

따라서 Helper read-only는 prompt 규칙만이 아니라 물리적으로 분리된 MCP process/catalog와 Core revision validation으로 강제할 수 있다. Crew/Kiro chat session의 암묵적 공유는 필요하지 않다. 프로젝트의 stable `projectId`, `taskId`, `decisionId`, `correlationId`와 revision이 session 사이 handoff의 source of truth다.

재현:

```bash
cd spikes/kiro-crew/mcp
pnpm install
pnpm run check
pnpm test

cd ../s4-workspace
kiro-cli agent validate --path .kiro/agents/vibe-probe-builder-core.json
kiro-cli agent validate --path .kiro/agents/vibe-probe-helper-core.json
```

실제 Agent smoke는 위 workspace에서 `kiro-cli chat --agent vibe-probe-builder-core`와 `--agent vibe-probe-helper-core`를 사용한다. 두 config의 MCP 경로는 workspace-relative라 repository 밖 사용자 설정을 읽지 않는다.

### Background dispatch와 선택한 fallback

`kirocrew spawn run --async`에 파일·설정·계정 접근을 금지한 합성 task를 보내자 약 2초 안에 8자리 task id를 반환했고, 첫 `spawn list`에서는 실행 중 상태로 조회됐다. 동기 polling task도 별도 id를 받았으나 두 task 모두 2분 이상 실행 중으로 남았다.

설치된 Crew 0.3.0 구현을 확인한 결과, CLI `spawn run`은 `approval_mode`를 보내지 않아 dashboard의 interactive spawn approval callback을 기다린다. 앱 SDK/backend는 internal API에 `approval_mode: "auto"`를 보낼 수 있으며, 이 값은 spawn 승인과 해당 subagent session의 tool approval을 함께 건너뛰는 강한 권한이다. 따라서 background Analyst는 단순 CLI dispatch가 아니라 다음을 명시적으로 설계해야 한다.

- trusted app/backend의 좁은 Analyst dispatch 경로
- `vibe-probe-analyst`처럼 tool이 없거나 최소 allowlist인 Agent
- synthetic Episode payload만 전달하고 file/account/context를 기본 제외
- task id, timeout, cancel/retry와 result validation
- auto approval 사용 사실을 manifest·audit에 드러내기

제가 실행한 동기 polling client만 `Ctrl-C`로 종료했으며, 대기 task 자체를 임의로 삭제하지 않았다. Gateway restart 뒤 `spawn list`에는 pending subagent가 남아 있지 않았다. 즉 현재 CLI spawn 경로는 interactive approval 때문에 완료되지 않고, 대기 task의 restart 복구도 되지 않는다. `approval_mode: auto`를 쓰는 Python App backend는 TypeScript-only 계약과 맞지 않고 subagent tool 전체의 자동 승인 경계가 강하므로 MVP에서 제외한다.

대신 v0.0.4 App에서 도구가 전혀 없는 `vibe-probe-analyst` 전용 temporary chat slot을 숨은 runtime으로 사용했다. 사용자가 버튼을 누르면 다음 순서로 실행된다.

1. UI가 synthetic Episode와 고유 `episodeId`·`correlationId`를 만든다.
2. 고정 `/api/chat` streaming adapter가 전용 slot으로 전송한다.
3. dispatch는 첫 실행 37ms, 같은 slot 반복 실행 20ms에 반환됐다.
4. 실행 중에도 Helper 입력이 계속 보이고 활성화돼 있었다.
5. App은 전용 slot만 polling해 새 assistant 결과를 찾는다.
6. 결과의 proposal kind, Episode/correlation ID, status와 concept 배열을 runtime validation한다.

두 실행 모두 약 12초 안에 `evidence_proposal` validation을 통과했다. Agent에는 file, shell, MCP와 state mutation tool이 하나도 없고 UI에도 세 번째 대화 pane을 노출하지 않았다. 별도 Bedrock provider, Python backend나 Crew spawn 없이 같은 Kiro runtime에서 background 분석과 foreground Builder/Helper를 분리할 수 있다.

제품에서는 Crew slot key를 job id로 사용하지 않는다. Core가 durable `analysisJobId`, Episode/correlation ID, attempt, deadline과 `pending/running/succeeded/failed` 상태를 SQLite에 저장한다. Crew slot은 교체 가능한 runtime일 뿐이며 timeout 뒤 새 attempt를 만들고, 늦게 도착한 이전 결과는 attempt/revision 불일치로 버린다. Crew 0.3.0에 안전한 per-run cancel primitive가 확인되지 않았으므로 hard cancel은 MVP 전제가 아니다.

### Kiro IDE Code 중심 surface

S4의 `.kiro/agents/vibe-probe-builder-core.json`과 `vibe-probe-helper-core.json`을 Kiro CLI가 실제로 validate하고 실행했으며, Agent별 MCP catalog와 동일 Core revision handoff를 통과했다. Kiro 공식 문서는 project-level `.kiro/agents/`가 IDE와 CLI 양쪽에서 지원되고 UI에서 Agent를 전환할 수 있다고 명시한다. MCP 설정도 Agent config가 workspace/global 설정보다 우선한다.

따라서 MVP Code 중심 surface는 별도 extension/webview가 아니라 **Kiro IDE의 editor + 내장 Agent panel의 Workspace Builder/Helper 선택기 + 같은 Core MCP**로 확정한다. Helper와 Builder는 서로의 raw chat session을 공유하지 않고 stable project/task/decision/correlation ID로 이어진다. Agent 중심 Crew App의 side-by-side ADE와 Code 중심 Kiro IDE를 실제 사용자 취향 비교 대상으로 유지하되, `apps/kiro-panel`은 MVP에서 만들지 않는다.

공식 근거:

- <https://kiro.dev/docs/custom-agents/>
- <https://kiro.dev/docs/mcp/configuration/>
- <https://kiro.dev/docs/ide/chat/>

## 8. 최종 판정과 후속 확인

T01이 이후 구현에 남기는 확정 경계는 다음과 같다.

1. Crew App은 두 독립 chat pane을 제공하되 undocumented `ChatEmbed`과 SSE fetch를 `kiro-adapter` 뒤로 감싼다.
2. Core MCP checkpoint와 stable ID가 유일한 상태 공유 경로다. Crew event, memory와 raw session은 source of truth가 아니다.
3. Analyst는 TypeScript App의 숨은 no-tool slot으로 dispatch하고, durable job lifecycle은 Core가 소유한다.
4. Code 중심 MVP는 Kiro IDE 내장 Workspace Agent 선택기를 사용한다. 별도 IDE extension/panel은 만들지 않는다.
5. Windows Kiro render, process isolation과 installer lifecycle은 제출 전 별도 smoke다. macOS 시각 IDE picker 확인도 낮은 위험의 후속 smoke로 남긴다.

이 fallback들은 Crew 0.3.0의 부분 기능에 의존하지 않으므로 T02 이후 구현을 차단하지 않는다.
