# T19-N: 단일 Kiro 창·host 병렬성 재판별

2026-09-14. 사용자는 앞선 [두 Dev Host 실측](T19_NATIVE_PARALLEL_HELPER_SOURCE_ASSESSMENT_20260914.md)을 제품 해법으로 받아들이지 않고 **하나의 Kiro workspace 창과 하나의 일반 extension host**에서 Builder와 Helper가 겹쳐 실행되는 경로를 다시 찾도록 지시했다. 이 문서는 그 별도 실험의 범위와 판정 기준이다. 기존 두 창 코드·결과는 비교 근거로 보존하며, 단일 창 합격 근거로 재사용하지 않는다. 원본 repository, 설치 Kiro, 전역 profile 및 기존 synthetic DB는 변경하지 않는다. 기본 CLI/Crew 실행 경로도 유지한다.

## 합격 조건과 즉시 중단 조건

- 실제 UI에서 **창 하나**, 그 창의 canonical Project workspace W 하나, 일반 extension host 인스턴스 하나만 사용한다. 숨긴 Dev Host, helper 전용 H 창, 두 번째 Kiro 프로세스/host, 외부 모델 CLI/API를 사용하지 않는다. live 전에 부모가 두 번째 H 창을 닫고 현재 endpoint의 windowId·root를 확인한다.
- Builder custom Agent의 실제 Task가 ACTIVE인 동안 Helper가 현재 Task의 Core context를 읽고 답변을 화면에 표시한다. Helper의 응답·terminal이 Builder terminal보다 먼저여야 한다. 그 뒤 Builder가 실제 `update_build_context`와 `complete_task` Core 성공 receipt를 얻어 Task를 COMPLETED로 만든다.
- Helper·Analyst의 read-only 권한은 prompt, 모델의 자제 또는 질문별 승인에만 맡기지 않는다. Helper 경로의 tool catalog, permission deny, Core handler가 모두 read-only를 강제해야 한다. Helper가 Builder의 run-bound MCP credential·mutation tool을 볼 수 있는 shared pool union은 실패다. Builder의 기존 7개 Core 도구도 Helper 실행 뒤 계속 사용 가능해야 한다.
- Agent-authored 출력과 synthetic USER Evidence의 provenance를 구분한다. 오류, queue, tool-unavailable 및 MCP descriptor 교체를 성공으로 숨기지 않는다. 한 번의 자동 재시도나 사용자 UI 복구가 필요하면 그 사실을 별도 판정으로 기록한다.

초기 단계는 **소스·공식 문서 판별과 metadata-only capability probe**다. 이 단계에서 native Agent turn, 모델 요청, Core mutation, DB seed, 생성 앱 수정, live backend 재시작을 하지 않는다. 안전한 route가 소스 또는 재현 가능한 probe로 입증되지 않으면 live prompt를 시작하지 않는다. Probe 확장과 live turn은 구체적 설계·위험·결과를 부모가 검토한 뒤 UI에서만 수행한다.

## 우선 조사할 경로

1. 설치본 built-in ChatAgent의 즉시 실행과 custom profile의 prompt/tool policy 경로가 합쳐질 수 있는지, session/new 또는 mode selection에 **세션별 hard tool deny**와 MCP 서버 범위가 있는지 확인한다. 단순 queue 분기만으로는 충분하지 않다.
2. `vscode.lm`에 Kiro가 제공하는 실제 모델이 이 창의 extension host에서 등록돼 있는지 **model metadata만** 조회한다. 있어도 그 호출에 필요한 Agent wrapper·정확한 Helper prompt·Core context·무도구/role guard·Builder MCP 유지 설계를 별도로 검증해야 한다. Provider가 없거나 외부 계정/API만 노출되면 이 경로를 쓰지 않는다.
3. Kiro Focus/session 문서와 설치본의 실제 session/MCP lifecycle을 비교한다. 같은 host에서 서로 다른 세션을 여는 것만으로 custom Agent global queue와 shared pool이 분리되는지 가정하지 않는다.

첫 probe는 격리 test extension의 command가 자신의 `vscode.lm.selectChatModels()` 결과를 **ID fingerprint·허용된 vendor/family·숫자 version·count 같은 비밀 없는 metadata로만** 보여 주고, Kiro Agent/Builder session은 열지 않는 방식으로 준비한다. 실제 UI command 실행은 부모가 맡는다. 이 probe는 model availability만 말해 주며 병렬 생성 가능성이나 read-only 실행의 증거가 아니다.

## 결과 기록 방식

각 후보를 `입증된 사용 가능`, `metadata만 확인`, `소스상 배제`, `미검증`으로 구분한다. 단일 창·단일 host live 실측까지 끝나지 않으면 두 창 결과를 대신 합격으로 쓰지 않는다. T19-N은 일반 설치·Windows·계약 안정성과 전체 parity가 남아 `[~]`다.

## 2026-09-14 설치본 판별과 첫 실측

실제 W Dev Host의 extension command에서 `vscode.lm.selectChatModels()`를 무필터와 `vendor: 'kiro'`로 조회했다. 결과는 `LM_MODELS all=0 kiro=0 []`였다. 모델 요청·새 native session·추가 Host 없이 확인한 값이므로 **현재 설치본의 `vscode.lm` 경로는 사용 불가**다. 나중에 모델 등록이 바뀌면 별도 재평가가 필요하다.

설치본 Agent extension 1.0.794의 source에서 custom Agent 실행은 공통 직렬 queue를 쓰고, 별도 즉시 실행 분기의 built-in ChatAgent에는 custom Helper의 prompt/tool policy가 전달되지 않는다. MCP pool은 세션 간 공유되어 Helper의 hard read-only와 Builder credential 비노출을 둘 다 만족하는 built-in ChatAgent 변환은 확인되지 않았다. [Kiro custom agent config](https://kiro.dev/docs/custom-agents/configuration-reference/)의 `tools`·`permissions`는 custom Agent에 적용되나 built-in ChatAgent와 병합된다는 계약은 아니다. [Kiro subagent 문서](https://kiro.dev/docs/custom-agents/subagents/)는 IDE의 custom subagent가 각자 tool/permission 설정을 지닌 채 병렬 실행될 수 있다고 설명한다. 설치본 source에서도 child는 `workspace.withToolPolicy(VL(childProfile))`로 생성되고 `orchestrate_subagent`의 독립 stage는 `Promise.all`로 실행된다. 그러나 이 도구는 `subagentOrchestration` feature flag가 켜졌을 때만 catalog에 나타난다. `_kiro/tools/didChange`는 `SUBAGENT` 범주까지만 표시해 실제 tool ID를 판별하지 못한다. **현재 이 후보는 source-supported 조건부 경로이지 live 사용 가능 판정이 아니다.**

Child의 `filterTools()`는 allowlist와 무관하게 `report_progress`, `subagent_response`, `user_input`을 다시 추가한다. 따라서 child를 문자 그대로 1-tool/0-tool이라고 주장하지 않는다. `user_input`은 별도 permission callback 없이 UI 질문을 만들 수 있어 capability probe에서 발생하면 전용 observer가 dismissed로 닫고 횟수를 기록하며 불합격으로 판정한다. `subagent_response.files`는 절대 경로를 받을 수 있고 parent invoke handler가 그 파일을 직접 읽어 parent context에 넣는다. **Child fs_read allowlist만으로 임의 파일 읽기를 막았다고 주장할 수 없다.** Probe 응답은 `files` 없이 합성 문장만 허용하고, 제품 단계에서는 이 우회 경로를 막기 전에는 hard read-only/민감경로 PASS를 내지 않는다. 설치본의 parent `workspace.readFile`은 tool policy를 검사하지 않고, ACP observer는 primary client의 FS capability를 바꿀 수 없으며 `fs/read_text_file`도 primary로만 전달되므로 현재 private observer에서 W-root broker를 추가하는 방식은 소스상 불가능하다. `user_input`을 Helper 전용 질문 운반에 사용하지 않으며, 공통 `_session/steer`도 모든 child가 읽고 메시지 원문을 Kiro store에 저장하므로 사용하지 않는다. 제품 단계의 질문은 Core가 Task에 묶어 보관하고 Helper-only read tool이 대기·조회하는 구조가 별도 검증되어야 한다. 부모 custom orchestrator의 MCP pool은 두 서버를 포함하되 parent tool policy는 orchestration만 허용하고, child별 `@server/tool` exact allowlist와 server 측 role/binding 검사를 모두 실측한다. 강제 MCP 환경변수나 tool-policy bypass가 확인되면 즉시 중단한다.

## 다음의 한 번짜리 capability turn 설계 — 제품 PASS 아님

부모가 UI로 제어하는 **기존 완료된 synthetic Project D의 W**에서, parent custom profile 하나와 child A/B profile 두 개를 준비한다. Fresh Project E와 Core Task는 이 capability probe에 만들지 않는다. Parent profile은 이름이 서로 다른 **로컬 read-only probe MCP 서버 두 개**를 고정 연결하지만 자신의 tool allowlist는 `orchestrate_subagent` 하나로 둔다. 각 child는 자기 서버의 inert tool 하나만 명시 허용하고 `fs_write`·`shell`을 deny한다. 두 tool은 공통 0700 작업 폴더의 marker에 각각 진입을 기록한 뒤 상대 marker를 최대 45초 기다린다. 둘이 실제로 겹쳐 들어왔을 때만 양쪽이 정상 반환하므로 텍스트상 병렬 주장이나 단순 빠른 순차 호출은 통과하지 못한다. Probe 서버에는 실제 Core bearer, 생성 앱 mutation, 외부 API가 없다. 같은 W의 endpoint/windowId 하나, parent의 실제 `orchestrate_subagent` ToolCall, 서로 다른 child `subExecutionId`, 두 marker의 교차 진입과 도구 반환, 역할별 실제 tool trace, permission/user_input 요청을 비밀 없는 metadata로만 기록한다.

`orchestrate_subagent`가 실제 ToolCall로 나타나지 않거나 한 child가 45초 안에 진입하지 않으면 이 flag/build의 DAG 경로는 불합격으로 중단한다. 반복 prompt나 feature flag 변경은 하지 않는다. Probe가 통과해도 **실제 Builder/Helper 대체는 아직 미입증**이다. 현재 `subagent_response.files` 우회의 격리 경로가 없어 실제 Core role-bound 서버 연결, fresh UI Project E 및 Builder/Helper 제품 flow로 확대하지 않는다. Capability turn 뒤 별도 허용된 containment 수단이 입증될 때만 설계를 다시 검토한다. 부모 review 후 기존 D W의 `.kiro/agents`에 token-free profile 3개(0600)와 marker 폴더(0700)를 `wx`로 준비했으며, Core backend·DB·생성 앱 코드는 변경하지 않았다. Marker 파일은 합성 도구 진입·반환 시각만 기록하는 실험 계측이다.

## 실제 단일 창 결과와 판정

부모가 CUA로 두 번째 H Dev Host가 닫힌 상태를 확인하고, 기존 D W `windowId=4` 하나에서만 probe command를 실행했다. 첫 클릭은 Agent session 생성 전 `SINGLE_HOST_PROBE_SERVER_INVALID`로 종료됐다. esbuild가 native helper를 panel `dist/extension.cjs`에 번들하면서 `__dirname`이 바뀌어 검증 코드가 잘못된 script path를 기대한 원인이었다. source/bundle 두 고정 layout을 검증하게 수정하고 unit test를 추가했다. Token-free W profile은 덮어쓰거나 삭제하지 않았다. 그 뒤 W extension만 reload해 부모가 **실제 native turn을 한 번** 실행했다.

두 로컬 MCP 서버는 모두 `tools/list`를 완료했다. 그러나 최종 UI metadata는 `SINGLE_HOST_PROBE UNCONFIRMED window=4 overlap=false orchestrate=false meetA=false meetB=false childIds=false permissionRequests=0 userInputRequests=0 unsafe=false overflow=false`였다. Marker에도 A/B `listed` 2개만 있고 `entered`·`returned`는 0개다. 이 명령은 정상 `end_turn`까지 갔지만 `orchestrate_subagent`/child tool action이 **관측되지 않았다**. 모델이 그 도구를 호출하지 않았는지, 현재 flag 때문에 catalog에 없었는지, 다른 이유인지는 이 계측만으로 구분할 수 없다. 모델 원문이나 `DAG_TOOL_UNAVAILABLE` 정확 sentinel은 수집하지 않았고 확인된 것처럼 기록하지 않는다. 재시도·feature flag 변경·다른 native Agent turn은 하지 않았다.

| 후보 | 소스·문서 근거 | 실제 단일 W 관측 | 판정 |
| --- | --- | --- | --- |
| built-in ChatAgent를 custom Helper처럼 사용 | 별도 즉시 queue가 있지만 custom prompt/toolPolicy 경로를 상속하지 않고 MCP pool을 공유 | 새 live Helper turn은 이 경로로 시도하지 않음 | 현 hard read-only/Builder credential 조건상 소스에서 배제 |
| `vscode.lm` | 모델 provider가 있으면 extension이 독립적으로 호출 가능 | `all=0`, `kiro=0` | 현 설치본에서 사용 불가 |
| 단일 session의 custom subagent DAG | flag가 켜지면 독립 stage `Promise.all`; child별 policy 필터 | MCP A/B 연결 성공, 실제 DAG/child action 없음 | capability 미입증 (`UNCONFIRMED`) |
| Focus 또는 별도 session | Focus는 병렬 UX를 설명하지만 custom 실행 queue와 MCP pool은 같은 Agent 인스턴스에서 공유 | 제품 Helper turn 시도 안 함 | 이번 설치본의 보안·동시성 해법으로 확인되지 않음 |

설치 source의 `subagent_response.files`는 child의 tool allowlist를 우회해 parent workspace가 임의 절대 경로를 직접 읽는 경로다. `workspace.readFile`은 toolPolicy를 확인하지 않으며, 현재 private mux observer는 primary client의 ACP FS capability를 바꾸거나 `fs/read_text_file` 요청을 대신 받을 수 없다. 따라서 **설령 DAG 도구가 활성화되어도 지금 설계로는 Helper의 bounded Core-context-only 읽기 경계를 입증할 수 없다.** 이 결론은 현 설치본·현 adapter 계약에 한정한다. 지원되는 다른 플랫폼/API까지 전부 불가능하다고 주장하지 않는다.

요구한 Builder ACTIVE 중 새 Helper 질문→Builder보다 먼저 화면 답변→Builder Core `update_build_context`/`complete_task`의 fresh Project E 전체 검증은 위 capability·보안 gate가 충족되지 않아 **실행하지 않았다**. 기존 두 창의 Project D 성공은 관측 사실로 보존하지만 사용자가 요구한 단일 창의 합격 근거가 아니다. 그러므로 현 요구사항에서 CLI 기본 경로 제거 또는 IDE-only 완전 대체 인수인계는 할 수 없고 T19-N `[~]`를 유지한다.

검증: Node 24.19.0·pnpm 11.12.0으로 panel build/typecheck 통과, probe config/barrier/marker/verdict·기존 panel restore 집중 test 8/8 통과, probe server format/lint 통과. 실제 turn 전후 Core Project D run은 9/9 `SUCCEEDED`, active 0이고 native binding descriptor는 80/80 `REVOKED` 그대로다. 별도 Core run·binding·Task·generated app write가 없었다. Original main repository의 `git status --short`는 clean이다. 격리 worktree의 실험 코드, W의 token-free profile·marker는 삭제하지 않고 보존했다.
