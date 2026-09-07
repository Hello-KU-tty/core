# T19 독립 Kiro runtime capability 기록

> 2026-09-07. 진행 중이며 T19 완료·Windows 지원 완료 기록이 아니다. 사용자 기존 Crew·DB·workspace를 사용하거나 변경하지 않았다. push는 승인되지 않았다.

## 실행 환경과 근거

- 실제 실행: macOS arm64, Node.js 24.19.0, pnpm 11.12.0, Kiro CLI 2.21.1, engine v2, `claude-haiku-4.5`, effort low.
- IDE: Kiro 1.0.337. 초기 표는 backend→CLI transport 실측이며, 후속 실제 extension-host 검증은 아래 별도 기록이다.
- frontend 대상: Windows. 공식 [설치 안내](https://kiro.dev/docs/getting-started/installation/)는 CLI의 Windows 11/PowerShell을 기재하지만 이 안내만으로 현재 2.21.1/v2의 Windows 실행 성공을 주장하지 않는다. Windows 버전과 실행 환경 확인이 필요하다.
- [Kiro ACP](https://kiro.dev/docs/cli/acp/)와 [ACP session setup](https://agentclientprotocol.com/protocol/session-setup), [prompt turn](https://agentclientprotocol.com/protocol/prompt-turn)을 기준으로 실제 wire를 확인했다. 설치 버전은 `session/update`와 snake-case `sessionUpdate`, prompt의 `prompt` 배열을 사용한다. 공식 Kiro 예제의 다른 표기를 무조건 복사하지 않았다.

## 확인한 결과

| 검증 | 결과 |
|---|---|
| no-tool ACP initialize/session/new | protocol 1, Agent version 2.21.1, 지정된 Agent·model identity 일치 |
| 합성 모델 응답 | `agent_message_chunk` 수신, `end_turn`, 도구 요청 0회 |
| 격리 경계 | 임시 Agent config의 tools·allowedTools·MCP·resources 빈 목록, includeMcpJson=false; 기존 Crew 의존 없음 |
| Preview 실제 생성 | 약 17,956ms, 실제 모델이 10개 preview를 Core SQLite에 저장, Session revision 1 유지 |
| SELECTED enrichment | 약 14,636ms, 지정된 preview identity 1개만 실제 보강·저장 |
| 사용자 SELECT→Spec 실제 생성 | Core UI SELECT 후 약 14,945ms, 선택 identity 동일, DRAFT Spec revision 1, Project SPEC_REVIEW |
| MCP scope | 역할/phase allowlist에 추가로 run의 project/session/correlation binding과 활성 여부를 확인; 취소·다른 scope 거절은 contract test 통과 |
| protocol·process 회귀 | 지정 Agent/model 불일치, 중복 turn, cancel, 잘못된 frame, 응답 timeout, 권한 요청 거절과 raw provider error 미전달 test 통과 |
| redaction 회귀 | split credential, thought/다른 session 이벤트 제외, Windows 사용자 경로·Linux home 경로 test 통과 |

시간은 한 합성 표본의 Agent 연결+turn 종료까지이며 latency/P95 보장이나 Windows 측정이 아니다. Agent 설명만으로 성공 처리하지 않고 같은 DB의 preview/enrichment/Spec을 별도로 조회했다. 최소 probe의 종료는 부모가 자기 child에 SIGTERM을 보내 확인했으며, production 후보는 own process-group 종료와 Windows own-PID tree 종료 분기를 가진다. Windows 분기는 실제 검증 전이다.

## 실패를 분리한 기록

- sandbox 안의 첫 no-tool 호출은 initialize 전에 `not logged in`으로 종료됐다. 같은 코드의 승인된 일반 실행은 기존 CLI 로그인으로 통과했다. 로그인 상태를 토큰 추출이나 Crew secret 공유로 우회하지 않았다.
- 현재 CLI 2.21.1의 `--agent-engine=v3`는 `--agent`, `--model`, `--effort` 조합을 거절했다. default Agent나 다른 provider로 fallback하지 않았다. v3/Windows 경로는 별도 capability 조건이며 이 v2 성공으로 해결됐다고 간주하지 않는다.
- 첫 Discovery probe는 runner의 idempotency key가 `idem_<uuid>` contract와 달라 모델 호출 전에 INVALID_PAYLOAD로 거절됐다. runner를 수정한 새 격리 실행에서 위 전체 경로를 통과했다. Core validation은 완화하지 않았다.

## 재현 가능한 현재 명령

Node/pnpm 고정 버전과 자신의 Kiro CLI 로그인이 필요하다. 명령은 실제 모델 호출과 합성 임시 파일·DB 생성을 포함한다. 임시 파일은 자동 삭제하지 않는다.

```sh
pnpm build
node scripts/spike-local-kiro-acp.mjs
node scripts/spike-local-discovery.mjs
```

`VIBE_HELPER_KIRO_CLI`는 실행할 CLI binary를 지정할 수 있다. 설치나 global Agent 설정을 변경하지 않는다. no-tool probe의 명시적 `VIBE_HELPER_KIRO_ENGINE=v3`는 비교용일 뿐 지원 완료 경로가 아니다. 결과에는 raw 모델 대화, 인증 header나 DB 원문을 내보내지 않는다.

## 독립 제품 경로 후속 실측

- backend startup/auth/doctor, workflow/Analyst worker, SDK, 최소 IDE 예제를 구현했다. local protocol 1 / frontend-client 0.1.0, Discovery 1.3.0 / Builder 1.3.1 / Helper 1.2.0 / Analyst 1.0.1. Core schema version 1과 기존 Crew protocol 9는 유지한다.
- no-Personal-Need 합성 Project `project_3ed9c434-2221-4861-a3df-2aeb057fbe40`: SDK→실제 ACP preview10→JIT→REVISE/ROUND→SELECT/SPEC→자유 수정 Spec revision3→Task 준비→Builder Decision/Helper read-only/사용자 선택→Task 완료5→History 복원. Analyst 3 jobs SUCCEEDED. 단, 생성 결과 health와 달리 독립 TypeScript build는 실패했으므로 이 표본의 코드 품질 성공은 인정하지 않는다.
- 위 Builder 1.3.0은 `cd … && npm install`, `cd … && node dist/tests.js`가 GUARD_SHELL_DENIED인데도 PASSED를 보고했다. source에 Node types/narrowing 오류가 남았다. 실패 DB/코드를 수정하거나 완료 보고를 덮어쓰지 않았다. canonical Builder 1.3.1에 단일 허용 command, 실제 결과 근거와 NOT_RUN/FAILED, 미검증 시 완료 금지를 추가했다. prompt fixture는 행동 보장/실측 성공이 아니다.
- Personal Need 있는 새 합성 Project `project_0cc718ff-33c7-4086-b8af-a7830139921c`: 같은 실제 Discovery/Spec 수정·확정 경로, Task `task_57cac58f-59c3-4f5d-b838-05991eb23830`. Builder 첫 turn 28 TEXT/12 TOOL, Helper 50 TEXT/2 TOOL와 Context version 불변, 사용자 option 적용 후 Builder 80 TEXT/135 TOOL, 완료 revision5. 저장된 완료 Task는 재실행하지 않았다.
- 이 새 결과는 monorepo 상위 compiler와 기존 dist/node_modules를 배제한 별도 임시 폴더에서 generated package-lock의 `npm ci --ignore-scripts`, `npm run build`, `npm run test`를 통과했다(13 tests). runner는 Agent-authored source를 수정하지 않았다. 원본 manifest entry loopback HTTP200도 확인했다. Analyst는 2 SUCCEEDED / 1 FAILED(ANALYST_INVALID_RESULT)로 실패를 숨기지 않았다. 모든 모델 출력의 성공이나 일반 품질 보장은 아니다.
- backend 정상 종료/재시작 후 동일 completed Task revision5와 History를 읽었다. 완료 workspace는 WORKSPACE_VIEW read-only 목적을 명시해야 하며 기본 Agent-session 준비/완료 Task 실행은 계속 거절한다.

## package·IDE·설치 증거

- SDK tarball을 독립 npm 프로젝트에 설치해 TypeScript 5.4.5 strict/skipLibCheck=false, Node16 module resolution, CJS require, esbuild 0.21.5 bundle, 실제 Core health/History 조회를 통과했다. native SQLite/Core 내부 import나 workspace dependency가 없다. `scripts/test-frontend-consumer.mjs`로 재현한다.
- 실제 `/Applications/Kiro.app/Contents/MacOS/Electron`을 별도 profile로 실행한 host test가 IDE_HOST_PASSED였다. appName Kiro / VS Code API 1.109.5 / embedded Node 22.22.0 / platform darwin. extension 활성화·패널 명령·Discovery/Spec/Builder/History용 Core snapshot을 확인했다. `visualReview: NOT_ASSERTED_BY_HOST_TEST`이며 실제 IDE 클릭 검토를 대체하지 않는다. launcher shim의 exit0만 나온 첫 시도는 성공으로 세지 않았다.
- 별도 clean source 폴더에서 기존 node_modules/dist/agents/data 없이 frozen install→build→core:init→core:doctor를 통과했다. SQLite quickCheck=ok / FK violations=0. 설치 로그에 better-sqlite3 node-gyp 실행이 없었고 esbuild lifecycle만 실행됐다. macOS 증거이며 Windows 설치 완료가 아니다.
- better-sqlite3 12.11.1은 고정 Node24의 실제 Builder 중 Statement GC native assertion으로 SIGABRT였다. 13.0.3 N-API exact pin 이후 10,000 prepare/insert/query와 반복 global.gc·explicit close 후 GC stress를 통과했고 실제 장기 workflow에서 같은 crash가 재현되지 않았다. 기존 synthetic DB quickCheck/FK 복원도 정상. Node/schema/migration을 우회하지 않았다.

## 남은 gate

- Windows 버전/architecture, CLI 2.21.1/v2 native 제공 여부, ACL/공백 경로/native prebuild/owned child 종료, 실제 Kiro 네 화면 클릭·렌더링·재시작 검증.
- 위 Windows 조합을 확보할 수 없으면 CLI 3.x 대응 등 추가 capability 검토가 필요하다. macOS 성공을 Windows 보장으로 바꾸거나 WSL을 조용히 전제하지 않는다.
- 최종 revision의 전체 회귀/clean checkout 결과는 아래 후속 기록으로 남긴다. T19는 진행 중이며 push는 별도 사용자 승인이다.

## 10:35 최종 로컬 검증

- Node 24.19.0 / pnpm 11.12.0 `pnpm check` 전체 통과: unit 2, package/app integration 241, eval 23, Campus Drop 3, smoke 6, Chromium E2E 12. 새 SQLite GC stress와 run-state fixture도 포함한다. macOS sandbox의 Chromium Mach port 거절로 실패한 시도는 제품 오류로 숨기지 않고 일반 실행 권한으로 같은 명령을 다시 검증했다.
- `client:pack` → 독립 TS5.4/CJS consumer → 실제 Core read 통과. `panel:build` → 실제 Kiro 별도 profile host 재검증도 통과했다. 최신 History가 취소된 Discovery여도 실제 Spec/Task가 있는 합성 Project를 선택해 검증하며 모델을 호출하지 않는다.
- 실제 ACP 초기화 중 cancel은 약 232ms 뒤 CANCELLED로 종료, preview/Task 생성 없이 같은 Project를 History에서 복원했다. 초기화 단계부터 AbortSignal을 연결하고 owned process를 닫는다. MCP scope/cancel contract 및 POSIX root 종료 후 descendant 정리는 자동 회귀로 확인했다. Windows process tree 성공은 이 측정에 포함하지 않는다.
- 최종 commit 기반 별도 clean checkout 검증은 commit 뒤 수행하고 결과를 인계 응답에 남긴다. Windows gate 때문에 T19는 `[~]`이며 push는 하지 않았다.
