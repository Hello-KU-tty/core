# T19 구현 계획 — 구현·검증 승인, 진행 중

> 작성: 2026-09-07. 사용자가 이 계획에서 push를 제외한 구현·실측·검증을 승인하고 착수를 지시했다. commit은 승인 범위에 포함하되 push는 실행 직전에 별도 승인을 받아야 한다. 프론트 개발자의 대상 OS는 Windows다.

> 2026-09-23 후속: 이 문서는 최초 CLI 기반 인계 계획의 기록이다. 현재 Windows 제품 목표는 [Windows 확장 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)와 T19-W 작업으로 갱신됐다. native recovery 구현을 이어받아 Kiro 확장 단독 설치·런타임 재사용·Core 자동 실행을 검증하며, 아래 수동 실행 절차를 최종 사용자 요구로 적용하지 않는다.

## 완료 시 제공할 상태

프론트 개발자가 push된 backend repository를 자신의 컴퓨터에 받아 문서대로 설치·실행하고, 자신의 Kiro 로그인으로 실제 Kiro IDE 안에서 Discovery, Spec, Builder(Helper 포함), History 화면을 모두 구현할 수 있어야 한다. 필요한 서버·Agent 실행·SDK·데이터 계약·오류 처리·예제가 repository 안에 있어야 하며, 작성자의 기존 Crew 설치·DB·secret·절대 경로나 미추적 임시 파일에 의존하지 않는다.

프론트 제품 화면은 프론트 담당자가 구현한다. 백엔드는 네 화면의 기능을 실제 Kiro IDE에서 사용하는 최소 연동 예제까지 제공·검증한다. 프론트 디자인 완성을 기다리는 것과 backend 인계 완료를 구분하며, mock이나 HTTP health 성공만으로 인계 완료를 표시하지 않는다.

## 검토 결과와 재사용 지점

- `ApplicationService`, contracts, SQLite, 역할별 MCP와 네 Agent의 canonical prompt는 재사용한다. Core에 모델 호출 책임을 넣지 않는다.
- History의 `UI_LIST_PROJECTS`, `UI_RESTORE_PROJECT_SESSION`, `ProjectHistory`, `ProjectSessionSnapshot`은 이미 있다. 새 로컬 client로 전달하고 재시작·단계별 재진입을 검증한다.
- 현재 production 진입점은 Crew proxy secret과 host 관리에 의존한다. root package에는 프론트 개발자용 Core 시작·진단 명령이 없고, E2E `4174` 실행기는 실제 Agent server가 아니다.
- Discovery phase 진행·결과 관찰과 Analyst dispatch 일부는 Crew React UI에 있다. 이를 backend runtime에서 재사용하도록 분리해야 패널이 닫혀도 저장과 분석의 실행 주체가 명확해진다.
- `program`의 `AgentAdapter`는 Builder/Helper turn UI용이다. 네 화면을 연결하려면 Project/Session/Task binding과 Core client, Discovery/Spec workflow 계약도 제공해야 한다.
- 현재 로컬에서 읽기 전용으로 확인한 버전은 Kiro IDE 1.0.337, Kiro CLI 2.21.1이다. CLI의 ACP help는 Agent·model·engine 선택을 제공하지만, 실제 session 생성·권한·stream 성공은 별도 검증이 필요하다.

## 제안하는 실행 구조

```text
Kiro IDE의 프론트 Webview
  ↕ 검증된 화면 메시지
Extension host + 배포 가능한 TypeScript client
  ↕ loopback HTTP JSON / 인증된 SSE stream
별도 Node.js 24.19.0 local backend
  ├─ ApplicationService → SQLite / 생성 workspace
  ├─ workflow runtime → Kiro CLI ACP → 역할별 MCP → Core
  └─ Analyst job worker / 생성 결과 실행 감독
```

- 기본안은 Crew 설치·대시보드를 요구하지 않는 local backend와 Kiro CLI 연결이다. 기존 Crew 경로는 회귀 기준으로 유지한다. ACP가 목표 환경에서 실패하면 원인·지원 가능한 버전을 먼저 확인하며, Crew 필수 의존이나 다른 provider로 변경할 때는 대안을 사용자에게 제시한다.
- backend가 Agent process, Discovery 단계 진행, Analyst worker를 소유한다. UI는 사용자 intent를 보내고 snapshot·진행·오류를 받는다. 긴 Agent turn 동안 HTTP 요청을 무기한 열어 두지 않고 실행 접수와 완료를 구분한다.
- backend는 `127.0.0.1`에만 bind한다. 개발자별 local 인증과 connection descriptor를 생성하고 extension host가 이를 읽게 한다. secret은 stdout·repository·Webview로 전달하지 않으며 Crew HMAC secret을 공유하지 않는다.
- Webview는 Node·SQLite·Kiro subprocess를 직접 사용하지 않는다. SDK에는 backend storage/native module을 포함하지 않아 IDE의 내장 Node와 Core Node ABI를 분리한다.
- 프로젝트 상태의 원본은 기존 SQLite다. run/stream의 상태는 durable Project 상태와 구분하며, backend 중단 후 결과 재조회와 명시적 재시도를 지원한다. 실행 중 stream의 화면 이탈 후 재연결 보장은 추가하지 않는다.
- 구체적인 endpoint, SDK 메서드와 runtime 상태 enum은 첫 단계에서 versioned contract로 고정하고 이후 구현된 값으로 인계 문서를 갱신한다. 임의 role·tool·shell·Agent mutation을 받을 범용 endpoint는 만들지 않는다.

## 작업 순서와 단계별 산출물

| 단계 | 구현할 것 | 다음 단계로 넘어갈 증거 |
|---|---|---|
| 1. 실제 Kiro 연결 검증 | 격리된 개발 data/workspace에서 ACP 초기화·session 생성·역할별 config/MCP·stream·중지·권한·process 종료 확인 | 실제 Discovery 제출, Builder write/test, Helper 읽기 전용과 Analyst 응답이 동작하고 지원 버전·wire 형식 기록 |
| 2. 로컬 실행 기반 | Crew 환경변수 없이 실행하는 composition root, data/workspace 초기화, local 인증·endpoint 전달, 진단·종료·재시작 | 새 checkout에서 Node/pnpm·Kiro 설치와 로그인 여부를 진단하고 Core/SQLite가 실제로 열림 |
| 3. 공통 계약·client | 네 화면의 UI command/query, workflow 실행·진행·오류, snapshot, project/run binding과 배포용 TypeScript client | mock과 live가 같은 계약을 쓰고 외부 소비 프로젝트에서 typecheck·build·실제 Core 호출 성공 |
| 4. Discovery·Spec·History | 기존 phase 정책의 runtime 분리, preview/enrichment/refinement/선택, Spec 초안·수정·확정, 목록·복원 | 새 입력부터 실제 Agent 결과가 저장되고 History 재진입에서 동일 후보·Spec·현재 단계 복원 |
| 5. Builder·Helper와 후속 처리 | Core workspace/Task로 Agent 실행, Context·Decision·stream·중지, Helper exchange, Analyst worker와 결과 실행 | 실제 파일·테스트·Decision 적용·분석 결과와 Core 상태 일치, 완료 Project를 History에서 다시 열기 |
| 6. IDE 인계 예제·문서·출하 검증 | 최소 IDE 예제, program adapter 교체 예시, SDK package·설치/실행/복구 안내, clean checkout 재현과 push | 실제 Kiro IDE에서 네 화면 계약을 사용하고 push 대상 commit의 결과를 다른 경로에서 재현 |

1단계는 계획 승인 후 실제 Kiro 호출과 격리된 생성 workspace의 작은 파일·테스트 실행을 포함한다. 사용자 production DB나 현재 Crew session을 test fixture로 쓰지 않는다. 새 dependency가 필요하면 기존 공급망·lifecycle 규칙에 따라 선택 근거를 결정 기록에 먼저 남긴다.

## 화면별 backend 인계 범위

| 화면 | 실제로 제공·검증할 기능 |
|---|---|
| Discovery | Learning Goal·선택적 Personal Need, 10개 preview, background/JIT enrichment, 후보 수정·병합·추가·명시적 선택, 부분 실패 재시도, 저장된 후보 복원 |
| Spec | 선택 후보의 실제 초안·세 scope, 자유 입력 수정과 revision 확인, 이전 후보로 즉시 돌아가기, 최신 Spec의 명시적 확정과 Builder Task/workspace 준비 |
| Builder | 실제 작업 시작·추가 메시지·응답/도구/파일/테스트 stream·중지, Context/Task 상태, Decision 조회·선택·적용, read-only Helper, 완료 보고·workspace/결과 열기 |
| History | 저장된 Project 목록·제목·상태·갱신 시각·권장 진입 단계, Discovery/Spec/Build 중단 지점과 완료 Project 복원, current Task·pending Decision·Context·completion report 조회 |

History 목록·조회만으로 Agent를 자동 호출하거나 새 후보/Spec/Task를 생성하지 않는다. backend·IDE를 다시 실행한 뒤에도 같은 Project·revision이 복원되는지 검증한다. 화면 재진입 후 사용자가 작업을 명시적으로 이어갈 수 있게 하며, host의 전체 raw 대화 transcript를 History의 필수 데이터로 추가하지 않는다. 삭제·cloud sync·기존 임의 repository import는 포함하지 않는다.

## 코드와 인계물의 배치안

아래 새 위치는 승인용 제안이며 아직 생성된 구현이나 실행 명령이 아니다.

| 위치 | 책임 |
|---|---|
| `apps/local-backend` | 독립 Node process의 HTTP/SSE·local auth·lifecycle·Core/runtime 조합 |
| `packages/runtime` | Discovery·Spec·Builder·Helper workflow와 durable 결과 관찰, Analyst worker orchestration |
| `packages/kiro-adapter` | 실제 Kiro ACP 연결과 역할별 config, host event 정규화, 권한·stream redaction |
| `packages/contracts` | 기존 DTO와 새 runtime/UI 계약의 단일 source |
| `packages/frontend-client` | extension host용 typed client, 요청·stream·오류 처리, schema/호환 version |
| `examples/kiro-panel` | 실제 IDE에서 네 화면의 계약을 확인하는 최소 확장 예제와 program 연결 참조 |
| `docs/FRONTEND_INTEGRATION.md` | 구현 후 확정된 설치·실행·설정·API·SDK·오류·재현 안내 |

client는 타입 선언과 필요한 runtime 의존성을 포함하는 버전 고정 package artifact로 전달한다. `workspace:*`, backend 내부 import 또는 작성자 경로가 외부 소비 프로젝트에 남지 않도록 별도 소비 테스트를 둔다. `program`의 npm·TypeScript·CJS extension build 환경도 확인한다. 공개 npm registry 배포 없이 backend repository의 재현 가능한 package 생성 절차로 인계한다.

제품 프론트 repository에 직접 push하는 작업은 이 계획에 포함하지 않는다. 필요한 adapter 예제와 최소 IDE 검증 코드를 backend 쪽에 제공하고, 참조한 program revision과 연결 위치를 문서에 고정한다.

## 개발자가 따라 할 실행 흐름

최종 인계 문서는 다음을 실제 명령과 결과 예시로 채운다. 아직 구현되지 않은 startup/doctor/package 명령은 사용 가능한 명령처럼 제시하지 않는다.

1. 지원하는 OS에 Git, Node.js 24.19.0, pnpm 11.12.0, 검증된 Kiro IDE/CLI를 설치하고 개발자 본인이 Kiro에 로그인한다.
2. push된 Core revision을 받고 `pnpm install --frozen-lockfile`과 build를 수행한다. 새 컴퓨터에 이전 `dist`, `node_modules`, Crew 설정이 없어도 재현돼야 한다.
3. 초기화/진단 절차로 개발 data·workspace·local 인증을 만들고 backend를 실행한다. Node·Kiro 버전 불일치, 로그인 누락, port 충돌과 SQLite native dependency 오류를 구분한다.
4. client package와 연결 설정을 extension host에 추가한다. secret 값은 Webview에 입력하지 않는다.
5. 최소 예제를 실제 Kiro IDE에서 열어 Discovery→Spec→Builder/Helper→History를 확인한 뒤 동일 client를 제품 화면에 사용한다.
6. IDE/backend를 종료·재실행해 History에서 같은 Project를 선택하고 이전 후보·Spec·작업 결과가 복원되는지 확인한다.

사용자가 frontend 개발자의 대상 OS를 Windows로 확인했다. Windows native 실행과 PowerShell 안내를 인계 기준으로 두며 WSL을 묵시적으로 전제하지 않는다. 현재 직접 검사 가능한 환경은 macOS다. Windows의 실제 Kiro 실행 환경에서 설치·native dependency·path·process 종료·IDE 연동을 검증해야 하며, 해당 실행 환경이 확보되지 않으면 Windows gate는 미검증으로 유지한다. Windows 버전·architecture·IDE/CLI 지원 버전은 capability 검증에서 명시한다.

## 검증과 완료 gate

- **계약·권한:** UI와 Agent provenance, protocol/revision mismatch, idempotency, role/run/project 분리, Helper/Analyst write/shell 차단, Builder workspace containment, secret redaction.
- **실제 workflow:** unseen goal과 Personal Need 유무, preview/JIT/refinement, Spec 수정·no-tool 복구·명시적 확정, 실제 Builder 파일·테스트·Decision/Helper와 정상 Analyst job 처리. 모델 출력 대신 fixture를 제출해서 실측 성공을 만들지 않는다.
- **History·복구:** Discovery 중·Spec 검토 중·Build 중·완료 후 프로젝트의 목록/restore, backend 재시작·stale/late 결과, 중복 Decision 거절. 조회만 할 때 모델 호출 0회.
- **인계 package:** clean checkout에서 frozen install·build·package 생성, 독립 소비 프로젝트의 SDK 설치·typecheck·bundle, 실제 Kiro IDE 예제 실행. 개발 중인 monorepo 내부 import만 통과한 상태로 완료하지 않는다.
- **전체 회귀:** Node.js 24.19.0·pnpm 11.12.0에서 `pnpm check`, 추가 runtime/client/IDE 검증과 기존 Crew 흐름의 회귀를 확인한다.
- **검증 기록:** OS·IDE/CLI/engine/model/prompt·Core/SDK version·검증 revision, 사용한 명령, 실제 결과·오류·지원 제한을 남긴다. target OS의 실제 Kiro 검증 환경이 없으면 이 gate를 미검증으로 유지한다.
- **완료 판단:** 위 증거가 갖춰진 backend 인계 revision을 T19 완료로 기록한다. 프론트 담당자의 모든 제품 화면 디자인 완성을 선행 조건으로 삼지 않되 네 화면에 필요한 실제 backend 기능과 최소 IDE 예제는 완료돼야 한다.

## commit·push 계획과 승인 범위

현재 remote는 `https://github.com/Hello-KU-tty/core.git`, default branch는 `main`이다. read-only API에서 현재 agent 인증의 push 권한을 확인했다. 저장소 지침은 push 전에 계정·대상 방식을 사용자에게 확인하도록 요구하므로, 기존 조직 저장소에 `@hurdooagent` 권한으로 올리는 경로를 이번 계획과 함께 확인한다. 권한이 있어도 push target 승인으로 간주하지 않는다.

승인된 target에 한해 T19 관련 변경을 검증된 commit으로 정리하고 일반 push한다. remote를 임의로 바꾸거나 force push하지 않는다. push 전에는 해당 revision의 깨끗한 별도 checkout에서 인계 절차를 검증하고, push 후 remote commit SHA가 일치하는지 확인해 frontend에 전달할 revision·시작 문서·package 생성 방법을 보고한다. private token, 사용자 data/workspace, local connection descriptor는 commit 대상이 아니다.

2026-09-07 사용자는 위 계획에서 push를 제외하고 승인했다. 실행 구조, 화면별 구현·실측·검증, 최소 IDE 예제·SDK·개발 안내와 검증 후 commit까지 진행한다. 현재 remote 권한이나 이번 승인으로 push 승인을 대신하지 않으며, push 직전에 target·branch·revision을 제시하고 다시 승인받는다.
