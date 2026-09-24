# T19-W1 Windows runtime·native Agent 실측 계획

> 작성: 2026-09-24 KST. 상태: 승인 범위의 실측·회귀·감사 완료. [결과와 제한](spikes/T19_W1_WINDOWS_CAPABILITY_RESULTS_20260924.md).
> 기준: `codex/windows-extension-runtime-20260923`, 인계 commit `b88ae5f`.
> 2026-09-24 사용자가 이 계획의 실행을 승인했다. T19-W1을 `[~]`로 전환한다.
> 상위 기준: [PROJECT_BRIEF](../PROJECT_BRIEF.md) → [SPEC](SPEC.md) → [ARCHITECTURE](ARCHITECTURE.md) → [DECISIONS](DECISIONS.md) → [TASKS](TASKS.md), [Windows 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md).

## 1. 목표와 이번 판정

현재 Windows x64의 설치된 Kiro에서 Core와 native Agent를 안전하게 연결할 수 있는 실행 조합을 실측한다. 결과는 **Core 실행**, **native 역할별 실행**, **권한·취소·종료**로 나누고 W2를 진행할 근거를 남긴다.

Kiro child runtime → 기존 Node → 전용 portable Node 순서로 제품 runtime 후보를 검사한다. 개발 도구 pin을 충족하는 일과 제품 runtime 지원 범위를 결정하는 일은 분리한다. `/health`, worker attach, Agent turn 종료, Core 결과 저장도 각각 별도 결과다.

W1은 작은 합성 scope의 capability 검증이다. 확장 자동 다운로드·완성 VSIX·자동 Core lifecycle·생성 앱 도구 자동 준비·clean Windows 전체 수직 흐름은 W2~W5에서 구현·검증한다. 전체 Evidence 품질과 MVP 완료도 이번 판정에 포함하지 않는다.

## 2. 현재 확인한 출발점

아래는 파일·명령 조회 결과이며 live Agent 검증 결과가 아니다.

| 항목 | 현재 확인 | W1에서 할 일 |
| --- | --- | --- |
| checkout | 지정 branch, HEAD `b88ae5f`, 계획 작성 전 clean | 기존 source와 Mac baseline 보존 |
| OS | Windows x64, build 26200 | OS 세부 버전과 process architecture 기록 |
| Kiro | 설치 manifest `1.0.337` | 실제 host의 IDE/API/Agent/Node/Electron·source 확인 |
| 개발 Node | PATH에서 `24.18.0`, 요구 `24.19.0` | 별도 전용 도구 경로에 요구 버전 준비 |
| 개발 pnpm | PATH에서 `11.19.0`, 요구 `11.12.0` | 요구 버전의 실제 실행·frozen install 검증 |
| dependencies | `node_modules` 없음 | 최초 설치 실패도 원문 비밀 제거 후 보존 |
| native source gate | macOS arm64·IDE 1.0.437·Agent 1.0.794·Homebrew 경로 고정 | 현재 Windows source의 차이를 조사한 뒤 제한된 실험 분기 추가 |
| install scripts | `pnpm-workspace.yaml`: esbuild 허용, better-sqlite3 차단 | 기존 prebuilt SQLite 사용, allowlist 유지 |

## 3. 승인받을 실행 범위

- 이 branch에서 재현 가능한 진단 코드·합성 fixture·필요한 최소 Windows adapter 수정과 회귀 test를 작성한다. 검증 근거를 확보한 조합만 명시적으로 허용한다.
- 개발용 Node 24.19.0/pnpm 11.12.0 및 필요한 test browser를 기존 설치/cache에서 먼저 찾고, 없으면 공식 출처와 배포물 무결성을 확인하여 작업 전용 폴더에 준비한다. 의존성 설치는 `pnpm install --frozen-lockfile`로 한다.
- Kiro의 전용 Development Host와 합성 workspace를 사용한다. 진단용 확장 로드와 해당 검증 workspace에 한정된 trust·역할 설정을 범위에 포함한다. 기존 사용자 project와 일반 profile의 전역 설정은 건드리지 않는다.
- 사용자의 Kiro 로그인·제공 모델로 작은 합성 native Agent 실행을 수행한다. 이는 기존 Kiro 모델 경로의 검증이며 합성 prompt·fixture만 사용한다. 로그인 자체가 필요하면 사용자가 직접 수행해야 하며 credential을 복사하거나 출력하지 않는다.
- 초기 live 검증은 최대 8개 Agent turn으로 제한한다. Discovery 제출, Builder write/test, Helper 응답, Builder·Helper 취소와 재사용, Builder 중 Helper를 검증한다. 한 실행으로 겹쳐 확인할 수 있는 항목은 묶는다. 원인 미확인 반복 호출로 소진하지 않는다.
- Core·MCP bridge는 loopback과 작업 전용 data root를 사용한다. data root는 OneDrive 동기화 경로 밖의 전용 임시 로컬 폴더로 정하고, 생성 후 실제 절대 경로·소유권·ACL·reparse point를 확인한다. 비밀 없는 결과 요약만 repository로 옮긴다.
- 관리자 권한, 전역 PATH 변경, IDE downgrade/update, Kiro vendor 코드·fuse·보안 설정 변경, 인증정보 복제, 개인 데이터 전송, 공개 배포와 Git commit/push는 포함하지 않는다. 새로운 도구 선택이나 개발 pin 변경이 필요하면 오류를 재현하고 별도 결정안을 제시한다.

## 4. 실행 순서와 확인할 증거

### 단계 A — 개발 환경과 재현 기준

1. 승인 기록과 함께 T19-W1을 `[~]`로 전환한다. 기존 T19/T19-N 상태는 보존한다.
2. 전용 도구 경로로 Node/pnpm pin을 충족하고 `pnpm preflight`, `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm panel:build`를 실행한다. process 환경만 지정하며 shell profile은 수정하지 않는다.
3. source-only checkout에서 누락 import·Mac 경로·Windows script 문제가 나타나면 원인별로 기록한다. 필요한 source만 검토해 수정하고 외부 Mac의 untracked 산출물을 복사하지 않는다.
4. 설치된 Kiro의 실제 app root와 manifest, API·Agent·host runtime version, architecture를 수집한다. endpoint credential·개인 경로·환경 변수 전체는 수집하지 않는다.

통과 증거: 정확한 도구 버전, command/exit code, build 결과, 설치 source metadata. pnpm 11.12.0 설치 실패가 재현되면 pin을 우회하지 않고 선행 장애로 기록한다.

### 단계 B — runtime·SQLite·Core

1. 실제 Kiro host에서 child process를 실행할 수 있는지 검사한다. executable뿐 아니라 args/env·Node/Node-API·architecture·필수 API와 종료 동작을 기록한다. Electron의 Node 실행 모드가 지원되지 않으면 해당 후보를 불가로 판정한다.
2. Kiro 후보가 실패하면 기존 호환 Node를 검사하고, 그것도 실패하면 단계 A의 전용 Node를 fallback 후보로 검사한다. 재현용 portable 도구 준비와 제품용 자동 acquisition 구현은 구분한다.
3. 각 실제로 시험한 후보에서 win32-x64 SQLite prebuild load, disk transaction commit/rollback, close/reopen, migration과 `quick_check`를 확인한다. 실행되지 않은 후보는 `NOT_TESTED`로 둔다.
4. 선택 가능한 runtime으로 Core를 시작해 인증된 SDK 조회와 종료를 확인한다. Core health 성공에 native Agent 성공을 합산하지 않는다.

통과 증거: 후보별 capability 표, 재현 command/exit code, 합성 DB의 재조회 값과 무결성 결과. Node 버전 숫자만으로 SQLite 호환을 선언하지 않는다.

### 단계 C — native source·MCP·권한

1. 설치본의 재현 가능한 capability 조사로 private command/observer, custom Agent identity, mode, permission 응답, 역할별 catalog와 bridge 연결 방식을 확인한다. 기존 Mac source의 지원을 Windows에 복사하지 않는다.
2. 발견한 source를 전용 W1 진단 경로에 명시하고 필요한 최소 adapter 변경을 한다. 알 수 없는 source·role·permission은 계속 거절한다. 제품용 광범위 runtime descriptor·패키징 재설계는 W2로 넘긴다.
3. role/run/project/task/correlation에 묶인 stdio MCP bridge에서 initialize → tools/list → tools/call → Core receipt를 확인한다.
4. 다른 scope 요청, 취소·종료 뒤 revoke된 binding, Helper write/shell·Decision mutation 요청을 합성 조건에서 거절한다. 실제 client catalog와 실행 경계의 거절을 구분해 기록한다.
5. 한글·공백 경로, connection/binding/DB ACL, 경로 이탈과 junction을 확인한다. 경로 이탈 test의 대상도 전용 임시 root 안의 무해한 sentinel로 한정한다. 안전 경계 확인 전 실제 Builder write/shell을 시작하지 않는다.

통과 증거: source/version·catalog 요약, scope-valid Core receipt, 거절 code, 권한 회수 결과와 ACL 검사. 단순 MCP 설정값이나 Agent의 성공 설명은 통과 근거가 아니다.

### 단계 D — 작은 실제 native 실행

| 검증 | 실행과 통과 증거 |
| --- | --- |
| Discovery | 합성 Learning Goal로 실제 native 제출을 수행하고 Core 저장 ID/revision을 확인한다. 후보 선택·전체 Spec 생성은 W1 필수로 늘리지 않는다. |
| Builder | 별도 fixture-seeded Task와 Core-issued workspace에서 작은 TypeScript 파일 write와 guard가 허용한 검증 명령을 수행한다. 실제 파일·검증 exit code·Core 기록을 대조한다. Discovery와 이어진 전체 수직 흐름으로 표현하지 않는다. |
| Helper | 같은 Task의 최신 Context를 읽고 실제 답변을 저장한다. read-only catalog와 mutation 거절을 확인한다. |
| Builder 중 Helper | Builder가 실제 진행 중인 구간에 Helper를 요청하고 두 실행의 시간·terminal 상태를 대조한다. queue/직렬 처리면 병행 성공으로 기록하지 않는다. |
| Stream | 메시지/ToolCall/파일·검증 event의 실제 전달 시점과 terminal 상태를 대조하고 저장·표시 전 redaction을 확인한다. 종료 후 일괄 전달이면 live stream과 구분한다. |
| Cancel/reuse | Builder·Helper 각각 native cancel 응답과 Core terminal, binding revoke·늦은 mutation 거절을 확인한다. 이후 새 실행으로 재사용 여부를 확인한다. |

각 turn에는 기존 runtime 제한에 맞는 timeout을 둔다. 실패 재시도는 확인한 원인을 수정한 뒤 남은 실행 한도 안에서 수행한다. 모델 로그인·quota·명령 미지원은 각각 별도 실패 사유다. Analyst 의미 품질 평가와 전체 다음 개인화 검증은 확장하지 않는다.

### 단계 E — 회귀와 종료 감사

- 변경에 맞는 기존 unit/contract/storage integration/native adapter test와 신규 Windows 경계 test를 실행한다. `examples/kiro-panel/test`의 CJS test가 전체 check에 포함되는지 확인하고 빠진 관련 test는 명시적으로 실행한다.
- prompt를 변경해야 할 경우 canonical 문서·version·평가 fixture 결과를 함께 변경한다. 기본 계획은 prompt 정책을 유지하는 것이다.
- 최종 `pnpm check`와 실제 Kiro host 검증을 별도로 기록한다. 실행 불가능한 검증을 생략한 성공으로 표시하지 않는다.
- 종료 시 소유한 Core/bridge/검증 host process만 종료하고 active run, binding revoke, DB reopen·integrity를 확인한다. 소유권이 불명확한 process는 일괄 종료하지 않는다. 합성 DB와 진단 자료는 삭제하지 않고 private root에 보존한다.

## 5. 예상 변경 위치와 산출물

아래는 조사 결과에 따라 필요한 파일만 수정할 후보이며 모두를 수정한다는 뜻은 아니다.

| 영역 | 후보 |
| --- | --- |
| W1 진단·fixture | `scripts/` 및 `examples/kiro-native-host/`의 제한된 Windows probe, 재현용 test |
| source/runtime 확인 | `examples/kiro-panel/src/native-runtime.cjs`, `examples/kiro-native-host/native-installation-source.cjs`, `native-client.cjs` |
| worker/bridge/relay | `examples/kiro-panel/src/native-worker.cjs`, `scripts/native-core-stdio-bridge.mjs`, `apps/local-backend/src/native-agent-relay.ts` |
| Windows 권한·실행 | `apps/local-backend/src/private-files.ts`, 관련 host launcher·tests |
| storage | `packages/storage-sqlite/`의 Windows 재현 fixture와 필요할 경우 최소 수정 |
| 기록 | `docs/spikes/T19_W1_WINDOWS_CAPABILITY_RESULTS_20260924.md`, `docs/DECISIONS.md`, `docs/TASKS.md` |

결과 문서에는 환경/support matrix, runtime 후보별 판정, native 역할·stream/cancel·권한별 판정, sanitized receipt, 재현 명령, 변경 파일, 검증 command/exit code, 실패와 W2 진입 판단을 담는다. token·connection 원문·사용자 SID·개인 절대 경로·DB·IDE 원시 log는 repository 산출물에 넣지 않는다.

## 6. 완료와 다음 단계 판단

- 각 필수 항목을 `PASS`, `FAIL`, `UNSUPPORTED`, `NOT_TESTED`로 분리한다. 모든 결과에 실제 관측·재현 근거를 연결한다.
- **W1 완료:** 개발 pin과 변경 검증이 충족되고, 적어도 하나의 runtime으로 Core/SQLite/bridge가 동작하며 Discovery 제출·Builder write/test·Helper read-only·stream/cancel/revoke와 Windows 권한 경계가 통과한다. 이때만 `[x]`로 바꾸고 W2를 유일한 `[>]`로 지정한다.
- 필수 gate가 남으면 W1을 완료하지 않는다. 현재 범위에서 수정 가능한 실패는 `[~]`, 로그인·필수 도구 배포물·host capability 등 외부 조건이 막으면 `[-]`와 구체적인 이유를 기록한다. W2를 먼저 시작하지 않는다.
- 현재 Kiro 조합에서 실패하면 그 조합의 실패로 보고한다. Windows 전체에서 불가능하다고 확대하지 않고 필요한 업데이트·다른 조합의 추가 검증을 제안한다. IDE 변경은 이번 승인에 포함하지 않는다.
- 기존 Mac live PASS는 그대로 과거 관측이다. 이번 Windows 회귀 test로 Mac live를 재검증했다고 표현하지 않는다. W1 PASS 역시 제품 설치 완료, Windows ARM64 지원, Evidence 품질 또는 전체 MVP 완료를 뜻하지 않는다.

## 7. 승인 요청

2026-09-24 사용자가 위 범위의 전용 개발 도구 준비·frozen install, 진단 코드와 최소 adapter 수정, 합성 data/Core 실행, 검증용 Kiro host와 최대 8개 native turn, 회귀 test 및 결과 기록까지 일괄 승인했다.
