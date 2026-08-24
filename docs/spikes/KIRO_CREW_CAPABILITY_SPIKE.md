# T01 Kiro/Crew Capability Spike 계획

## 1. 상태

- 상태: 완료. 결과와 fallback은 [KIRO_CREW_CAPABILITY_RESULTS.md](KIRO_CREW_CAPABILITY_RESULTS.md)에 확정
- 작성일: 2026-08-24
- 상위 작업: [T01](../TASKS.md)
- 제품 계약: [SPEC.md](../SPEC.md), [ARCHITECTURE.md](../ARCHITECTURE.md)
- Kiro 설치와 경진대회 제공 계정 로그인은 사용자가 완료했다. 비식별 Gateway probe, dependency 설치, probe 구현·build, local install과 실제 dashboard 실행을 완료했다.
- Crew의 실행 정책이 third-party app을 기본 차단하는 것을 확인했고, dashboard의 단일 앱 확인 절차로 `vibe-helper-probe`만 신뢰했다. 전역 허용이나 기존 설정 덮어쓰기는 하지 않았다.
- 사용자의 명시적 요청에 따라 계정 정보, 인증 파일과 사용자 Kiro 설정 내용은 열람하지 않는다.
- 최종 target은 Windows Kiro지만 현재 spike와 첫 시안은 macOS Mac mini에서 수행한다. OS 차이는 capability 결과에 별도 표시한다.

## 2. 사전 검토 결과

### 공식 문서에서 확인된 사실

- Crew App은 root `app.json`, Agent, Skill과 React dashboard UI bundle로 구성할 수 있다.
- dashboard UI는 host가 제공하는 `@kirocrew/app-sdk`를 사용하고 `useAppApi`, `useAppEvents`, `useChatLauncher` 등의 hook을 제공한다.
- App API와 WebSocket event는 manifest의 `permissions.api`, `permissions.events`, `permissions.mcpTools` allowlist로 제한된다.
- chat slot 생성·조회·메시지 전송, streaming event, sync/async Agent dispatch, MCP 등록과 app-scoped storage API가 존재한다.
- Node.js용 공개 Gateway client package는 없으며 Node service는 REST/WebSocket endpoint를 직접 호출해야 한다.
- Crew의 각 chat tab은 context와 approval state가 독립적이다. session 사이에는 memory가 공유될 수 있지만 현재 대화 context는 자동으로 공유되지 않는다.
- background context injection은 다음 사용자 turn에 context를 넣을 수 있지만 그 자체로 Agent 응답을 시작하지 않는다.
- Kiro IDE는 Code OSS 기반이고 Open VSX extension을 지원하므로 Code 중심 thin surface는 extension/webview 접근을 검증할 가치가 있다.

### 아직 검증되지 않은 핵심 사항

1. Crew App 한 화면에서 Builder와 Helper 두 chat slot을 직접 표시·stream할 수 있는가?
2. App SDK allowlist로 chat history, send와 필요한 event를 모두 안전하게 사용할 수 있는가?
3. 별도 session인 Builder와 Helper가 Core의 project/task/context id를 통해 일관된 맥락을 공유할 수 있는가?
4. Agent별 MCP tool allowlist가 실제 runtime에서도 Helper/Analyst write를 차단하는가?
5. background Analyst dispatch와 task event가 Builder UI를 막지 않고 복구 가능한가?
6. Crew와 Kiro IDE가 동일 repository와 Core state를 사용할 때 Code 중심 surface가 어느 수준까지 가능한가?
7. restart, reconnect와 session timeout 이후 어떤 식별자가 유지되는가?

### 승인 전 확인한 로컬 환경

- 승인 전에는 `kirocrew`, `kiro`, `kiro-cli` executable과 Kiro application이 발견되지 않았다. 이후 사용자가 Kiro 설치와 로그인을 완료했다고 확인했다.
- Node.js `v26.4.0`, pnpm `11.12.0`, npm `11.17.0`이 발견됐다.
- 공식 Crew App 최소 요구는 Node.js 18+이므로 UI probe 자체는 현재 Node로 실행 가능하다. 제품 workspace의 active LTS version 고정은 T02에서 별도로 수행한다.

## 3. 목적과 비목적

### 목적

- 이후 구현이 의존할 수 있는 Kiro/Crew capability만 재현 가능한 증거로 확정한다.
- Agent 중심 primary UI와 Code 중심 thin prototype의 현실적인 경계를 결정한다.
- Gateway/API 세부사항을 `kiro-adapter` 뒤로 숨길 수 있는 최소 contract를 도출한다.
- 불가능하거나 불안정한 기능은 구현을 시작하기 전에 fallback으로 전환한다.

### 비목적

- Discovery, Builder, Helper와 Evidence Analyst의 실제 제품 prompt 구현
- SQLite schema와 Concept reducer 구현
- Campus Drop 생성
- production UI 디자인과 접근성 polish
- cloud 배포, App Store 게시와 GitHub push
- Kiro memory가 Vibe Helper Evidence Engine을 대체할 수 있는지에 대한 제품 평가

## 4. 실행 경계와 산출물

### 실행 경계

- probe source는 `spikes/kiro-crew/` 안에만 둔다.
- Kiro/Crew가 생성하는 사용자 설정과 인증 파일은 공식 app data 위치 밖으로 복사하지 않는다.
- token, app secret, 전체 session log와 사용자 계정 정보는 repository에 저장하지 않는다.
- manifest 권한은 각 실험에 필요한 API prefix, event와 MCP tool만 선언한다. 외부 network 권한은 사용하지 않는다.
- 설치나 로그인처럼 workspace 밖을 변경하는 작업은 실행 시 사용자 승인을 받고, 로그인은 사용자가 직접 완료한다.
- 실패한 probe artifact도 원인 재현에 필요하면 보존하며 임의로 삭제하지 않는다.

### 산출물

1. `spikes/kiro-crew/`: 제품 기능이 없는 최소 Crew App/MCP/Agent probe
2. `docs/spikes/KIRO_CREW_CAPABILITY_RESULTS.md`: 환경, 절차, 관측 결과와 로그에서 redaction한 증거
3. capability matrix: `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`
4. Builder/Helper session과 context 연결 sequence
5. Crew adapter와 Code 중심 surface의 최종 경계
6. R2·R3 및 새 위험에 대한 [DECISIONS.md](../DECISIONS.md) 갱신

진행 중인 관측 결과는 [KIRO_CREW_CAPABILITY_RESULTS.md](KIRO_CREW_CAPABILITY_RESULTS.md)에 누적한다. `PASS` 판정은 실제 runtime 관측이 끝난 항목에만 부여한다.

## 5. 단계별 실험 계획

### S0. 공식 설치와 preflight

**작업**

- 사용자가 완료한 macOS용 Kiro 설치와 로그인을 전제로 실행 파일과 version만 확인한다.
- 계정·인증 파일이나 사용자 설정 내용을 열람하지 않는다.
- 계정 정보를 출력할 수 있는 진단 대신 Gateway의 비식별 health만 확인한다. provider, model과 사용자 식별자는 조회하지 않는다.
- 실험 전 manifest, data home과 permission 경로를 확인한다.

**통과 조건**

- Crew Gateway와 Kiro IDE가 실행되고 비식별 health가 정상이다.
- 실제 application/CLI version을 결과 문서에 기록한다.
- 인증 정보가 repository나 terminal capture에 노출되지 않는다.

**중단 조건**

- 사용자가 로그인 완료를 확인했는데도 Gateway가 정상화되지 않으면 계정 정보를 조사하지 않고 사용자에게 Kiro 화면의 상태 확인을 요청한다.

### S1. 최소 Crew App lifecycle과 UI

**작업**

- 최소 `app.json`과 React ESM UI를 만든다.
- local path에서 install, enable, dashboard render와 dev reload를 검증한다.
- `useAppInfo`, `useTheme`, `useAppApi`와 `useAppEvents`를 한 화면에서 확인한다.
- 허용하지 않은 API path와 event가 실제로 차단되는지 negative test를 수행한다.

**통과 조건**

- clean build한 UI가 Crew sidebar에서 열리고 reload된다.
- 허용된 API/event만 동작하며 out-of-scope 요청은 명시적으로 실패한다.
- App lifecycle을 재현할 명령과 version이 기록된다.

### S2. Chat slot과 event fidelity

**작업**

- Builder probe와 Helper probe용 독립 chat slot을 만든다.
- 양쪽에 메시지를 보내고 `chat_message`, `chat_chunk`, `chat_done`, `chat_error`, `tool_call`, `approval`, `task_update`, `task_complete`의 실제 payload를 관측한다.
- history 재조회, unsubscribe, reconnect와 중복 event 여부를 확인한다.
- raw payload는 영구 저장하지 않고 contract 작성에 필요한 redacted field만 결과 문서에 남긴다.

**통과 조건**

- 두 slot의 stream이 서로 섞이지 않고 slot/task 식별자로 상관관계를 만들 수 있다.
- history와 live event로 Builder stream을 복원할 수 있다.
- 문서와 다른 payload·누락 event가 있으면 명확히 기록된다.

### S3. 한 App 화면의 Builder·Helper 동시 대화

**작업**

- native embedded chat component가 있다고 가정하지 않는다.
- App SDK의 permission-scoped API와 event를 이용해 두 slot의 메시지·stream을 custom React pane에 표시하고 입력을 전송하는 최소 실험을 한다.
- `useChatLauncher`를 통한 native chat 이동도 비교한다.
- Builder가 동작 중일 때 Helper 메시지를 보내고 두 session의 responsiveness와 approval UI 영향을 확인한다.

**통과 조건**

- 같은 Crew App 화면에서 Builder와 Helper를 동시에 읽고 각각 대화할 수 있다.
- 각 pane이 올바른 Agent, slot과 project id를 유지하고 reload 후 복원된다.
- 불가능하면 정확히 어느 API·permission·event 경계에서 막혔는지 증명한다.

### S4. Core context와 실제 Decision handoff

**작업**

- 제품 DB 대신 in-memory 또는 작은 probe state로 `project`, `task`, versioned `liveContext`와 pending `decision`을 만든다.
- Builder probe만 context update와 Decision 생성 tool을 쓸 수 있게 한다.
- Helper probe는 context/Decision read와 refresh 요청만 허용한다.
- Helper가 설명한 뒤 사용자가 App UI에서 선택하고 Builder가 같은 Decision 결과를 읽는 한 흐름을 검증한다.
- 별도 chat session 사이의 맥락은 Crew memory가 아니라 explicit Core id와 필요 시 context injection으로 전달한다.

**통과 조건**

- `Builder → Decision → Helper → 사용자 선택 → Builder 재개`가 correlation id 하나로 이어진다.
- Helper의 write, shell과 Decision resolve 시도가 runtime에서 거절된다.
- stale context를 감지하고 refresh할 수 있다.

### S5. Background Analyst와 task lifecycle

**작업**

- 사용자 메시지와 분리된 최소 background Agent task를 dispatch한다.
- async task id, polling과 `task_update`/`task_complete` event를 비교한다.
- UI가 계속 반응하는지, 실패·취소·재시도와 Gateway reconnect 후 결과 조회가 가능한지 확인한다.

**통과 조건**

- background Agent가 사용자 chat slot을 점유하거나 Builder stream을 막지 않는다.
- task id로 진행·완료·실패를 복원할 수 있다.
- 이 실험만으로 background Agent를 별도 provider로 나눌 필요가 없음을 확인하거나 반례를 기록한다.

### S6. Restart와 최소 지속성

**작업**

- App reload, Gateway restart와 Crew session timeout 전후에 slot history, task, App data와 probe Core id가 어떻게 유지되는지 확인한다.
- `injectContext`의 ephemeral/maxAge 동작과 다음 user turn 반영을 확인한다.
- 사라지는 runtime id와 Vibe Helper가 자체 저장해야 할 stable id를 구분한다.

**통과 조건**

- 재시작 후 복원 가능한 정보와 불가능한 정보가 matrix에 분리돼 있다.
- 이후 architecture가 Crew의 session memory를 source of truth로 사용하지 않아도 된다.

### S7. Kiro IDE Code 중심 thin surface

**작업**

- 같은 probe workspace를 Kiro IDE에서 열고 project-local Agent/MCP 설정이 인식되는지 확인한다.
- local Open VSX/VS Code-compatible extension 또는 최소 webview가 probe Core 상태를 읽을 수 있는지 검증한다.
- IDE Agent conversation과 Crew slot이 자동으로 같은 session인지 검증하고, 아니라면 explicit project/task/context 연결만 사용한다.
- code editor 옆에서 Helper 또는 Decision으로 이동하는 최소 interaction을 확인한다.

**통과 조건**

- 구현 가능한 Code 중심 최소 surface를 한 문장으로 확정할 수 있다.
- Agent 중심과 Code 중심이 같은 Core project/task/Decision을 보되 raw chat session 공유를 요구하지 않는다.
- extension 방식이 불가능하거나 과도하면 deep-link/pop-out fallback의 실제 usability 한계를 기록한다.

### S8. 판정과 문서 반영

**작업**

- 각 capability를 `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`로 판정하고 재현 절차를 붙인다.
- 증거 없이 기대한 기능을 `PASS`로 표시하지 않는다.
- adapter boundary, manifest permissions, event normalization과 UI mode 범위를 Architecture·Decisions·Tasks에 반영한다.

**통과 조건**

- 다른 개발자가 같은 환경에서 핵심 결과를 재현할 수 있다.
- T02가 검증되지 않은 Kiro 기능을 전제로 하지 않는다.
- R2·R3을 계속 수용할지 fallback으로 바꿀지 결정돼 있다.

## 6. Capability 판정표

| Gate | 반드시 확인할 결과 | 실패 시 기본 fallback |
|---|---|---|
| G0 | Crew/IDE 설치, 인증, Gateway health | 사용자 계정·token 확인 후 중단 |
| G1 | Crew App render, lifecycle, permission 차단 | dashboard 외 standalone UI는 즉시 채택하지 않고 범위 재승인 |
| G2 | 두 chat slot과 stream/history 식별 | native Crew chat tab + Core context handoff |
| G3 | 한 App에서 Builder/Helper 동시 pane | pop-out/native chat 전환의 UX를 보고 primary UI 재승인 |
| G4 | MCP Agent별 권한과 Decision handoff | Agent별 server/tool surface를 물리적으로 분리 |
| G5 | async dispatch, task event와 복구 | 명시적 queue/polling adapter, background 기능 축소 |
| G6 | restart 후 Core/session 연결 복원 | Core stable id와 저장 상태만 source of truth로 사용 |
| G7 | IDE thin surface가 같은 Core state 조회 | Code mode를 context/deep-link 수준으로 축소 |

G1 또는 G4가 실패하면 현재 Crew App/MCP architecture의 핵심 전제가 깨지므로 T02로 자동 진행하지 않는다. G3 또는 G7 실패는 제품 UI 계약에 영향을 주므로 fallback을 구현하기 전에 사용자에게 다시 승인받는다.

## 7. 승인 후 첫 실행 순서

1. 공식 Kiro Crew와 Kiro IDE 설치를 위한 권한을 요청한다.
2. 사용자가 직접 로그인을 완료한다.
3. S0 결과를 먼저 보고하고, 환경이 정상일 때만 probe dependency와 source를 추가한다.
4. S1~S7을 순서대로 수행하되 핵심 gate 실패 시 즉시 결과를 기록하고 불필요한 후속 구현을 멈춘다.
5. S8 결과와 T02에서 사용할 실제 architecture 변경안을 사용자에게 승인받는다.

## 8. 검토 근거

- [Kiro Crew App 첫 구현](https://kiro.dev/docs/crew/apps/build-first-app/)
- [Crew App SDK/API](https://kiro.dev/docs/crew/apps/sdk/)
- [Crew App manifest와 permissions](https://kiro.dev/docs/crew/apps/manifest/)
- [Crew session 격리와 memory](https://kiro.dev/docs/crew/chat/sessions/)
- [Kiro Crew 설치와 Gateway](https://kiro.dev/docs/crew/installation/)
- [Kiro IDE extension 호환성](https://kiro.dev/docs/guides/migrating-from-vscode/)
