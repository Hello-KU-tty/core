# 결정 기록

## 2026-09-24: 다른 기기 재개를 위한 개발 checkpoint

- **사용자 요청:** 현재 W1~W5 작업의 commit/push와 다른 기기 재개 준비. push 대상은 collaborator 권한이 있는 기존 조직 remote `https://github.com/Hello-KU-tty/core.git`의 `codex/windows-extension-runtime-20260923`으로 확인했다. 과거 작업별 local-only 또는 commit/push 제외 범위는 당시 기록으로 보존한다.
- **인계:** 필요한 source·검증 script·tests·canonical prompts와 sanitized 결과를 함께 commit한다. [재개 문서](CROSS_DEVICE_HANDOFF_20260924.md)에 도구 pin·빌드·실패 근거·남은 gate를 기록하고 새 기기에서는 새 합성 환경을 사용한다. private DB/profile/credential/원본 로그와 생성 설치물은 Git에 포함하지 않는다. PR/merge/release나 사용자 데이터 동기화는 수행하지 않는다.
- **상태:** 소스 인계가 W5 출하 완료를 뜻하지 않는다. W5와 T19/T19-N의 기존 미완료 상태를 유지한다.

## 2026-09-24 W5 packaged 검증기 준비 한도 정합

0.3.7 portable 검증에서 Kiro runtime 경로는 통과했지만 기존 Node 경로가 NATIVE_READY stdout 없이 기동에 실패했다. 이전 검증기는 30초 한도 초과와 process 조기 종료를 같은 오류로 처리해 정확한 원인을 구분하지 못했다. 설치 lifecycle은 이미 45초까지 준비를 관측하므로 검증기 한도만 같은 45초로 맞추고 runtime별 준비 시간/종료 원인 metadata를 기록한다. 제품 Core/Agent 한도나 권한 검증은 변경하지 않는다. 최초 실패 로그를 보존하고 실제 패키지 재검증으로 판정한다.

## 2026-09-24: W5 긴 no-Evidence 사유의 UI projection

- **실측:** native 분석 job은 SUCCEEDED 2개였으나 UI_READ_EVIDENCE_TRACE가 TRANSACTION_FAILED를 반환했다. 합성 DB의 read-only 재현에서 noEvidenceReason 길이 440/370자가 UI emptyReason의 240자 한도를 초과한 Zod 오류임을 확인했다. 분석 실패나 SQLite 손상으로 확정하지 않는다.
- **선택:** 기존 UI 계약 240자를 유지하며 긴 사유를 surrogate pair를 자르지 않는 말줄임 preview로 투영한다. 원문(최대 4,000자)은 저장된 분석 결과와 응답 analysis[].resultSummary에 그대로 유지한다. Evidence 채택·Concept State·provenance 계산은 바꾸지 않는다.
- **검증:** 짧은 값·긴 값·4,000자·Unicode 경계의 실제 storage/application 조회를 포함한 integration 35 tests PASS. 최신 전체 check와 설치물 검증은 W5 기록에 별도로 남긴다.

## 2026-09-24: W5 Windows의 승인 설정과 lockfile 복구

- **실측:** 0.3.5의 실제 Builder/Helper/Decision 적용은 저장됐으나 frozen install은 ERR_PNPM_OUTDATED_LOCKFILE로 실패했다. 승인된 allowBuilds.esbuild만 있는 설정에서도 lockfile 갱신을 거절하여 Task 완료가 기록되지 않았다. Agent는 완료를 거짓 보고하지 않았고 검증기는 실패를 보존했다.
- **선택:** Windows 보호 launcher를 검증한 경우에만 packages의 현재 점 경로, esbuild/better-sqlite3의 allowBuilds boolean 또는 onlyBuiltDependencies로 제한된 일반 파일(8 KiB 이하, 단일 link)을 유지한 채 정확한 --lockfile-only --ignore-scripts --ignore-pnpmfile 명령을 허용한다. Host runner가 설정을 다시 검사한다. 다른 config key·package·외부 workspace·npmrc·pnpmfile 및 root install lifecycle은 계속 거절한다. 기존 비-Windows native 경로는 설정 부재 조건을 유지한다. 새 dependency/lifecycle 허용은 없다.
- **Agent:** Builder prompt 1.3.8과 fixture에 Windows 복구 예외, 실제 frozen install 후 검증 및 실패 시 완료 금지를 기록한다. 특정 프로젝트/문구에 대한 예외는 추가하지 않는다.
- **후속 검증:** 종료 응답이 SUCCEEDED/TURN_ENDED이나 Task가 ACTIVE이고 완료 보고가 없는 경우만 원본을 보존한 별도 receipt에서 Build 적용을 한 번 이어 요청한다. 같은 Task revision·저장된 Decision 적용·Helper 응답·active run 부재를 확인한다. 알려지지 않은 mutation을 재전송하거나 기존 선택/응답을 다시 저장하지 않는다.

## 2026-09-24: W5 Windows의 Core PID 재사용 판별

- **실측:** 합성 0.3.3 Core 종료 후 owner.json에 남은 PID를 0.3.4의 새 Kiro utility process가 재사용했다. PID 생존만 검사하던 lifecycle은 오래된 packageHash를 살아 있는 구버전 Core로 간주해 CORE_UPDATE_WAITING_FOR_OWNER_EXIT를 반환했다. 새 Agent 요청은 0개였다.
- **선택:** Windows에서는 private owner 파일 mtime과 OS process StartTime을 읽기 전용으로 비교한다. process가 lock 기록보다 1초 초과 늦게 태어났다면 재사용된 PID로 구분한다. 순서가 불명확하거나 inspector 오류/출력 오류/검사 중 lock 변경이면 fail closed한다. 원래 Core나 재사용된 PID의 process를 종료하지 않는다. 다른 OS의 PID 생존 경계는 유지한다.
- **복구:** lifecycle과 recover 명령이 같은 검사 함수를 사용한다. recover는 기존 전용 잠금과 owner 원문 재확인을 유지하고 오래된 lock을 archive한다. 두 OS 검사와 복구를 수용하도록 lifecycle의 recovery child 대기는 10초에서 45초로 조정한다. Agent RPC/응답 예산과 모델 재전송 정책은 바꾸지 않는다.
- **검증:** PID 재사용·원래 소유자·불명확 timestamp·검사 오류·lock 변경 regression, 실제 OS를 사용하는 packaged stale-lock 복구를 수행한다. 과거 receipt와 사용자 일반 Kiro process는 보존한다.

## 2026-09-24: W5 업데이트 후 생성 앱 도구 실행기 경로 갱신

- **실측:** 기존 0.3.2 Project를 0.3.3에서 재개하자 설치 버전 directory를 담은 host-owned descriptor/launcher가 달라 PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED로 실패했다. 새 Agent prompt 전에 거절됐으며 원본 receipt를 보존했다.
- **선택:** 동일 extension parent의 vibe-helper.vibe-helper-portable-core-<semver>/portable에서 더 높은 버전으로 옮기는 경우만 Core가 자동 갱신한다. workspace·Node/pnpm·private root와 descriptor의 나머지 직렬화 내용이 모두 같고 launcher도 이전 또는 이번 Core가 만드는 정확한 내용이어야 한다. 다른 도구 선택·publisher·설치 parent·downgrade·변조는 계속 거절한다. 이전 설치물 코드는 읽거나 실행하지 않는다.
- **중단 복구:** owner Core 안의 준비 요청을 직렬화하고 launcher를 먼저 atomic 교체한 뒤 descriptor를 교체한다. 중간 상태는 실행 검증이 거절하며 다음 준비에서 같은 이전 descriptor와 정확한 새 launcher를 확인해 마친다. 사용자 생성 source·데이터는 수정하지 않는다.
- **검증:** 실제 파일 기반 업데이트·변조·중단·중복 준비·downgrade/다른 설치 거절 test와 기존 명령/환경 경계를 검증한다. 설치물 재개와 packaged 회귀는 별도 기록한다.

## 2026-09-24: W5 알려진 Builder 초기화 실패의 진단과 검증 재시도

- **관측:** 0.3.2 단독 설치 실행에서 실제 Discovery/Spec 생성·수정과 workspace 전환은 성공했다. Builder는 AGENT_RUNNING 전 NATIVE_RPC_TIMEOUT으로 실패했으나 기존 로그만으로 정확한 RPC를 구분할 수 없었다.
- **선택:** native-client는 timeout된 RPC의 고정 allowlist operation만 전달하고 worker는 role/operation만 기록한다. params·credential·session ID·Agent 본문은 제외하며 제품 연결/RPC 한도를 바꾸지 않는다.
- **검증기:** 원본 receipt와 실패 run을 보존한 채 새 receipt로 알려진 terminal Builder 실패만 재시도한다. 원본 hash·이전 run·요청 수를 연결하고 같은 Core면 FAILED/outcome NONE을 다시 조회한다. Core 재시작으로 transient run ID가 사라진 경우에는 private receipt의 terminal 응답을 원본 근거로 보존하고, 현재 복원된 동일 Project/Task·확정 Spec revision과 active run/Decision/completion 부재를 확인한다. 재시작된 Core에서 이전 run을 직접 조회했다고 표시하지 않는다. 응답 불명확 STARTED, 진행 중 run, 이미 Decision/적용으로 진전된 상태는 거절한다. 검증기 재시도는 최대 2회이며 제품 자동 재전송 정책을 추가하지 않는다.
- **검증:** timeout 진단 포함 native-client 46 tests, retry 거절/계보·재시작 경계와 기존 무재전송 driver 8 tests PASS. 실제 실행 결과는 W5 실측 기록에 남긴다.

## 2026-09-24: W5 Windows ACL 검사 지연과 판정 구분

- **실측:** 격리 profile의 Core data/tools/workspaces는 owner 일치·보호된 DACL·외부 Allow 0개였으나 기존 runtime 검사는 3회 모두 5.3~5.8초에 false를 반환했다. 단순 Windows PowerShell 시작도 4.964초가 걸렸다. 재개 native 실행은 모델 요청 전에 `PRIVATE_DIRECTORY_UNSAFE`, 전체 회귀는 실제 ACL 검증 test의 15초 한도에서 중단됐다.
- **선택:** 동일한 읽기 전용 ACL 검사 조건을 유지하고 Core/native 검사 process의 한도를 30초로 둔다. inspector 시작/시간 초과/비정상 출력은 `PRIVATE_DIRECTORY_CHECK_UNAVAILABLE` 또는 `NATIVE_PRIVATE_PATH_CHECK_UNAVAILABLE`로 구분하여 계속 fail closed한다. 실제 UNSAFE, junction/hardlink·owner·DACL 거절은 그대로다. 자동 ACL 복구나 사용자 경로 권한 변경은 하지 않는다.
- **검증 경계:** 실제 Windows ACL test는 여러 OS 검사 process를 순차 실행하므로 해당 test만 최대 150초로 둔다. 제품 Agent 응답 시간 기준과 나머지 test 기본값을 늘리지 않는다. 새 regression·실제 검사·VSIX 0.3.2·전체 check를 검증한 뒤 결과를 W5 기록에 남긴다. clean Windows gate와 기존 native SPEC 실패의 해결 여부는 별도다.

## 2026-09-24: W5 Windows E2E 서버 시작 대기

- **관측:** 전체 check와 E2E 단독 실행이 각각 `config.webServer`의 30초 기동 한도에서 중단됐다. 진단 실행에서는 backend 23.858초, frontend 14.552초 후 health/HTTP 준비를 확인했다. 변동이 있는 환경의 기동 문제와 앱 테스트 실패를 구분한다.
- **선택:** Windows에서만 E2E webServer 준비 한도를 120초로 둔다. 나머지 OS는 30초를 유지한다. 개별 E2E timeout, 제품 Agent/응답 제한, 재시도 정책은 바꾸지 않는다.
- **환경:** 기존 W1 검증용 Playwright browser cache를 명시해 실행한다. cache 환경 변수 누락으로 발생한 browser launch 실패는 제품 회귀나 통과로 해석하지 않고 원본 로그를 보존한다.

## 2026-09-24: W5 Discovery E2E의 fixture 완료와 UI 확인 분리

- **관측:** 올바른 browser cache를 지정한 단독 전체 check에서도 E2E 8 PASS / 4 FAIL이었다. Golden Path는 실제 두 번째 상세 batch 저장 중 `10개 후보` 표시의 5초 기대 한도를 소진했고, 선택/새 Discovery/Spec 재시도 세 흐름도 Spec 저장 응답을 기다리는 동안 같은 5초 기대 한도를 소진했다. 다른 단계의 unit/integration/eval/build/smoke는 통과했다.
- **선택:** 기능 흐름 테스트에서 해당 Discovery fixture의 실제 Core mutation 후 chat response를 먼저 기다리고 UI를 검증한다. 초기 상세 두 batch, round/merge, Spec과 명시적 복구 응답을 구분한다. 고정 sleep이나 임의 성공 응답을 추가하지 않는다. UI assertion 기본 5초와 응답 대기 한도는 유지하고 네 다단계 test의 전체 실행 한도만 60초로 둔다. Golden Path의 기존 전체 120초 한도와 제품 응답/Agent 예산은 그대로다.
- **추가 원인 확인:** 응답 동기화 후에도 Golden Path가 상세 5/10과 timeout UI에 머물렀다. `App.tsx`의 test 모드 전용 6초 deadline이 실제 Core/SQLite 두 batch 저장 도중 만료되는 것을 source/화면으로 확인했다. test 모드 deadline만 30초로 조정하며 제품 모드 420초 deadline·30초 foreground 기준은 유지한다. 이후 Golden Path 실제 E2E는 통과했다. 별도 preview/basket test의 고정 1.2초 지연은 FIRST/SECOND 명시적 gate로 바꾸어 사용자 조작을 마친 뒤 각 batch를 완료한다.
- **History 전체 한도:** 반복 reload/권한/형식/연결 복구를 한 test에서 확인하는 History flow는 단독 성공 18.7~28초와 마지막 assertion 직전 30초 전체 한도 소진을 반복 관측했다. 이 test의 전체 한도만 60초로 두며 각 UI assertion은 기존 5초다.
- **경계:** E2E fixture 통과는 native Agent 또는 사용자 의미 품질 통과가 아니다. 수정 후 실제 E2E와 최종 `pnpm check` 결과를 별도로 기록한다.

## 2026-09-24: W4 생성 앱 전용 도구와 Windows native 명령 진입점

- **범위:** 사용자 `T19 W4`와 승인된 설치 요구를 구현한다. 기존 일반 Node(검증 범위 24.18.0/24.19.0)와 pnpm 11.12.0을 우선하며 없으면 W2 Node 획득과 공식 pnpm 배포물을 private cache에 준비한다. Core용 Kiro executable은 생성 앱 runtime 후보가 아니다.
- **source spike:** pin한 Agent 1.1.28 SHA의 Windows native `DefaultTerminal`은 `process.env`에서 직접 PowerShell child를 만들며 VS Code terminal 환경 collection을 사용하지 않는다. 전역 환경이나 Agent private source를 수정하지 않는다. Core가 생성 workspace의 보호된 `.kiro/vibe-tools.cmd`를 발급하고 native shell은 이 고정 진입점으로 기존 허용 명령만 실행한다. worker는 파일·scope를 검증한 뒤 기존 one-time permission/command guard를 적용한다. 일반 workspace와 기존 Mac/CLI 경로는 유지한다.
- **획득:** 공식 npm `pnpm/11.12.0` metadata를 2026-09-24 조회했다. tarball은 `https://registry.npmjs.org/pnpm/-/pnpm-11.12.0.tgz`, integrity는 `sha512-ggpvvQ2fBMImY4ACrq0eRTQKkTndXcB3wdg+9EqiSByOtmN7TJqmlqPH41uoGOSc8nIT5fK5ETjQm3o+JuiYug==`다. 고정 URL·hash·크기·timeout 후 일반 파일만 private staging으로 추출하고 cache를 다시 검증한다. dependency/install script 추가 없이 Node 기본 API를 쓴다.
- **권한:** launcher는 Core 환경을 상속하지 않고 선택한 Node/pnpm과 private pnpm config/cache/store만 제공한다. package script는 기존 생성 앱 실행 권한 안에서 동작하며 승인된 esbuild/better-sqlite3 이외 dependency lifecycle은 거절한다. 이는 임의 생성 코드에 대한 OS sandbox 완성을 주장하지 않는다.
- **검증:** [W4 계획](T19_W4_TOOLCHAIN_PLAN.md), [실측 결과](spikes/T19_W4_TOOLCHAIN_RESULTS_20260924.md). 두 도구 환경에서 native shell·실제 HTTP, 실패·복구와 최종 `pnpm check`를 통과했다. 중간 조회 실패는 같은 run의 read-only 재관측으로 확인했으며 최초 실패를 보존했다. clean machine·workspace 전환 host crash·조회 안정성과 전체 수직 흐름의 출하 판정은 W5에 남긴다.

## 2026-09-24: W3 Core 소유권과 Windows Helper 보조 창

- **승인:** 사용자 `T19 W3` 착수 요청 및 “필요할 때 Helper 전용 창 자동 열기” 선택. W1의 두 창 capability를 제품 adapter에 통합한다. 한 창 protected built-in gate를 완화하지 않는다.
- **선택:** global storage의 단일 Core lock/instance를 여러 확장 창이 공유한다. 각 host는 인증된 짧은 lease를 갱신하며, 한 창 종료나 workspace 전환 중에도 다른 창의 Core를 종료하지 않는다. 마지막 lease가 사라진 뒤 30초 유예를 지나면 Core가 SQLite를 닫고 credential을 폐기한다. crash 후 새 instance에는 durable state만 복원하며 응답 불명확 mutation과 진행 중 stream은 자동 재생하지 않는다. 정상 연결된 구버전 owner의 임의 종료 없이 업데이트 대기 상태를 표시한다.
- **데이터:** 초기화와 migration은 owner lock 안에서 수행하며 기존 SQLite backup/quick_check를 재사용한다. 새 schema를 구버전 코드로 여는 것은 거절한다. DB/backup과 runtime cache/quarantine은 자동 삭제하지 않는다.
- **native/UI:** Windows pinned source custom Agent와 기존 worker·SDK·제품 패널을 재사용한다. Helper/Analyst의 Core 발급 전용 workspace를 보조 창으로 열며 두 창 모두 같은 extension global storage를 사용한다. 준비/연결/native 가능 상태와 실제 Core 저장 완료를 구분한다.
- **검증:** [W3 계획](T19_W3_LIFECYCLE_PLAN.md). 결과 확인 전 W3/W5 PASS를 주장하지 않는다. 새 dependency·Agent prompt 정책·전역 IDE 설정 변경은 없다.
- **결과:** [W3 실측](spikes/T19_W3_LIFECYCLE_RESULTS_20260924.md)에서 통합 VSIX 일반 창 설치, native Discovery·Helper 저장, 자동 보조 창과 실제 owner/마지막 창 종료를 확인했다. 실제 owner 종료에서 발견한 Core 중단은 managed child의 process group 분리로 보정하고 lease 종료까지 검증했다. crash/rotation·update/backup·downgrade와 전체 회귀도 통과했다. W3 완료만 판정하며 W4/W5·T19/T19-N 한계는 유지한다.

## 2026-09-24: W2 portable Core와 검증된 private runtime

- **상태:** 사용자 `T19 w2` 착수 요청과 기존 Windows 설치 요구에 따른 구현 선택. [계획](T19_W2_PORTABLE_CORE_PLAN.md)의 실제 결과로 완료 여부를 판정한다.
- **결정:** 기존 esbuild로 Core/bridge/host adapter를 bundle하고 runtime resource manifest에 파일별 SHA-256·platform·prompt version을 기록한다. SQLite 13.0.3의 win32-x64 prebuild와 JS wrapper, migration SQL/journal 및 실행 dependency license만 포함한다. 런타임 탐색은 Kiro child → 기존 Node → 검증된 cache → 공식 Node 조건부 획득 순서를 따른다.
- **획득:** 공식 `https://nodejs.org/dist/v24.19.0/SHASUMS256.txt`를 2026-09-24 재조회했다. `win-x64/node.exe`의 SHA-256은 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`이다. HTTPS 고정 URL·redirect 금지·크기 제한·hash pin 후 private staging에서만 실행하며 완료 cache도 재검증한다. archive 대신 executable을 받아 임의 archive extraction을 피한다. Node license는 검증된 공식 ZIP의 LICENSE를 패키지에 동봉한다. 이 선택은 download bytes가 ZIP보다 커지는 tradeoff가 있어 실제 크기를 기록한다.
- **도구:** 새 npm dependency나 lifecycle script는 추가하지 않는다. Windows VSIX writer/reader는 기본 PowerShell/.NET System.IO.Compression을 사용한다. 경로는 환경 변수 data로 전달하며 shell 문자열에 삽입하지 않는다. 기존 macOS packaging은 유지한다.
- **경계:** 제품 지원 version은 capability가 확인된 Node 24.18.0/24.19.0으로 시작하고 Node-API 10, API, platform, SQLite transaction/reopen probe를 모두 요구한다. 개발 24.19.0/11.12.0 pin은 불변이다. Node fallback으로 Kiro private Agent source/permission gate를 해제하지 않는다. W3 자동 lifecycle·frontend, W4 생성 앱 도구와 W5 clean install gate는 별도다.
- **검증:** [W2 결과](spikes/T19_W2_PORTABLE_CORE_RESULTS_20260924.md). Kiro/기존/managed 세 후보에서 checkout 없는 Core·migration·SDK·stdio MCP·scope/권한/revoke·재시작 PASS. 공식 다운로드와 cache 재사용/손상/취소/offline/lock 복구를 검증했다. VSIX 1,875,725 bytes, 설치 파일 5,482,884 bytes, 조건부 Node 92,825,416 bytes다. 전체 `pnpm check`와 관련 native 회귀 PASS. W2 완료는 W3의 자동 실행/Windows native 제품 source gate 완료를 뜻하지 않는다.

이 문서는 현재 제품·기술 판단의 근거와 상태를 보존한다. `승인`은 사용자가 직접 합의했거나 `PROJECT_BRIEF.md`에 확정된 사항, `제안`은 구현 전 승인이 필요한 선택, `spike 후 결정`은 외부 기능을 실제로 검증해야 하는 사항이다. 상태가 바뀌면 기존 맥락과 tradeoff를 지우지 않고 같은 항목을 갱신한다.

## 2026-08-24: Build-first 제품 철학

- **상태:** 승인
- **맥락:** 대상 사용자는 코딩 교육 자체보다 자기에게 필요한 서비스를 완성하는 경험에서 동력을 얻는다. 교육 기능이 Builder의 진행을 인위적으로 막으면 바이브코딩의 장점과 프로젝트의 목적이 모두 약해진다.
- **결정:** 결과물 개발을 일차 목표로 둔다. 사용자는 실제 개발 과정에서 Builder가 마주친 의미 있는 판단을 맡고, 필요할 때 Helper와 대화하며 개념을 습득한다. 설명, Evidence와 개인화는 개발 흐름 위에 얹는다.
- **검토한 대안:** 교육 과정·퀴즈 우선, Builder가 모든 결정을 대행, 기능 완성만 제공하고 학습 추적은 하지 않음.
- **tradeoff:** 자연스러운 경험을 얻는 대신 학습 장면의 발생 빈도를 강제로 통제하기 어렵다. 따라서 실제 Decision과 Activity provenance가 중요하다.

## 2026-08-24: 신규 project의 동적 Discovery loop

- **상태:** 승인
- **맥락:** 같은 DB 기술도 행사 신청, 파일 공유, 커뮤니티처럼 맥락에 따라 매력이 달라진다. 고정된 10개 주제를 돌려주는 추천은 사용자의 실제 필요와 기술 학습 목표를 충분히 연결하지 못한다.
- **결정:** Learning Goal만 필수로 받고 Personal Need·최근 불편·관심·현재 수준은 선택으로 둔다. `availableTime`은 입력 계약에서 제외한다. 고정 taxonomy 없이 기본 약 10개의 다채로운 후보를 만들며, Personal Need가 있으면 이를 반영한 후보와 독립적인 후보를 함께 만든다. 사용자가 만족할 때까지 후보 수정과 선택을 반복한다.
- **검토한 대안:** 고정 주제 catalog, 필요 입력 필수화, 한 번의 추천 후 즉시 확정, 시간 기반 scope 추천.
- **tradeoff:** 다양성과 맞춤성이 커지는 대신 candidate mode collapse와 품질 편차가 생길 수 있어 fixture와 diversity eval이 필요하다.

## 2026-08-24: 권장 Learning Spec과 세 가지 scope

- **상태:** 승인
- **맥락:** 초보자에게 모든 기술 판단을 시작 전에 요구하면 Builder 진입장벽이 된다. 반대로 범위가 없으면 Agent가 대신 구현할 기술과 사용자가 배우려는 기술이 섞여 Evidence가 왜곡된다.
- **결정:** Discovery가 먼저 권장 Spec을 만들고 사용자는 가볍게 확정하거나 수정한다. 개념은 `LEARNER_FOCUS`, `AGENT_SUPPORT`, `EXCLUDED`로 나눈다. Builder 시작 전에는 부담을 낮추되 명시적 확정은 받는다.
- **검토한 대안:** 상세 spec 수동 작성, scope 구분 없이 전체 구현을 학습 범위로 간주, Spec 없이 즉시 Builder 시작.
- **tradeoff:** 시작은 쉬워지지만 권장안에 과도하게 끌릴 수 있다. 되돌리기와 자유 수정, Spec provenance가 필요하다.

## 2026-08-24: 네 Agent와 deterministic Core의 책임 분리

- **상태:** 승인
- **맥락:** 생성 Agent가 추천, 구현, 설명과 학습 판정까지 모두 담당하면 권한과 근거가 뒤섞이고 Agent가 만든 코드를 사용자 이해로 오인하기 쉽다.
- **결정:** Discovery, Builder, Helper, Evidence Analyst를 분리한다. Agent는 제안과 작업을 수행하지만, 상태 validation과 Concept State 계산은 deterministic Core가 담당한다. Analyst는 Evidence proposal만 만들며 state를 직접 변경하지 않는다.
- **검토한 대안:** 단일 범용 Agent, Analyst가 곧바로 state 변경, 모든 판단을 LLM에 위임.
- **tradeoff:** 계약과 orchestration이 복잡해지는 대신 권한 검증, 재현성, audit와 Agent 교체 가능성이 좋아진다.

## 2026-08-24: 실제 Decision만 사용자에게 맡김

- **상태:** 승인
- **맥락:** 사용자가 판단을 위해 Builder 추천과 Helper 설명을 비교하는 경험은 핵심 교육 가치다. 하지만 학습 장면을 만들기 위해 사소한 선택을 억지로 묻는 것은 build-first 철학에 어긋난다.
- **결정:** 제품 동작, 데이터, API, 인증, 보안, 보관, 비용, 주요 아키텍처 또는 Learning Concept에 영향을 주는 실제 선택만 Decision으로 요청한다. Builder는 추천과 영향을 제시하며 사용자는 Helper에게 묻기, 추천대로 진행, 직접 선택 또는 다른 방식 제안을 할 수 있다.
- **검토한 대안:** Builder가 전부 결정, 일정 간격으로 교육 질문 삽입, 모든 기술 선택을 사용자에게 전가.
- **tradeoff:** 자연스러운 학습 계기를 얻지만 project에 따라 Decision 수가 적을 수 있다. Decision 수 자체를 성공 지표로 삼지 않는다.

## 2026-08-24: Builder stream을 숨기지 않음

- **상태:** 승인
- **맥락:** 사용자는 Agent의 대화, 도구 호출, 오류 수정과 test 진행을 보며 바이브코딩의 흐름을 익힌다. 단순 task/status 화면만 보여주면 작업 대기 시간이 지루하고 Agent 작동 방식을 이해하기 어렵다.
- **결정:** 실제 Builder 메시지, tool call, file change, test와 error correction stream을 의도적으로 숨기지 않는다. Live Progress는 현재 위치를 보여주는 보조 정보로 둔다.
- **검토한 대안:** 결과와 task checklist만 노출, 내부 작업을 전부 접기, 교육용으로 재구성한 별도 stream만 표시.
- **tradeoff:** 투명성과 몰입은 좋아지지만 정보 과부하와 secret 노출 위험이 있다. redaction, 접기, stream 성능과 접근성 처리가 필요하다.

## 2026-08-24: Live Context는 작업 중간에도 갱신

- **상태:** 승인
- **맥락:** Helper가 Task 완료 시점의 요약만 보면 진행 중 질문에 낡은 답을 할 수 있다. 그렇다고 Helper가 Builder의 전체 대화와 repository를 항상 읽으면 비용과 개인정보 노출이 커진다.
- **결정:** Builder는 시작, 방향 변경, Concept 도입, Decision, 오류로 인한 계획 변경, test와 완료 checkpoint에서 versioned Live Context를 갱신한다. Helper는 최소 context를 먼저 읽고 부족하거나 오래됐을 때만 refresh와 관련 코드·diff·대화 일부를 요청한다.
- **검토한 대안:** 완료 시에만 context 저장, Builder 대화 전체 공유, repository 전체를 매 질문마다 분석.
- **tradeoff:** Helper 정확도와 비용의 균형을 얻지만 context freshness와 누락을 별도로 감시해야 한다.

## 2026-08-24: Helper는 항상 접근 가능하고 read-only

- **상태:** 승인
- **맥락:** 사용자가 무엇이 비슷한지 바로 알아채지 못할 수 있으므로 높은 Concept State에서도 질문 경로가 사라지면 안 된다. Helper가 Builder의 작업이나 Decision을 대신 확정하면 책임 경계가 무너진다.
- **결정:** Helper는 모든 Concept State에서 접근 가능하고 자유 입력을 중심으로 둔다. `더 쉽게`, `더 자세히`, `현재 코드 예시`, `선택지 비교` 같은 빠른 카드를 보조로 제공한다. Helper는 file/shell/write/Decision 확정 권한이 없는 read-only Agent다.
- **검토한 대안:** 초보 상태에서만 Helper 노출, card-only UI, Helper에게 Builder와 같은 실행 권한 부여.
- **tradeoff:** 안전하고 독립적인 설명 공간을 얻지만 실제 변경이 필요하면 Builder로 명시적으로 handoff해야 한다.

## 2026-08-24: 질문형 비유는 claim 단위 Evidence로 처리

- **상태:** 승인
- **맥락:** “DB model 추가가 Excel 열 추가이고 실제 data가 행 추가인 거네?” 같은 반문은 이해의 단서지만, 문장 전체를 무조건 맞음 또는 틀림으로 처리하면 부분적인 대응 관계와 한계를 잃는다.
- **결정:** Helper는 비유를 claim 단위로 나눠 맞는 대응, 다른 점과 적용 한계를 답한다. 사용자 주도의 관련 판단이나 전이 행동은 Evidence 후보가 될 수 있지만, Helper가 유도한 반복이나 단순 확인은 강한 Evidence로 보지 않는다.
- **검토한 대안:** 모든 비유를 정답/오답으로 이분, 대화 Evidence를 전부 제외, 한 번의 비유로 mastery 판정.
- **tradeoff:** 더 정교하지만 Analyst와 reviewer가 provenance와 prompt dependence를 함께 봐야 한다.

## 2026-08-24: Concept State와 MISCONCEPTION 모델

- **상태:** 승인
- **맥락:** 학습 상태는 단순 노출과 독립적인 적용을 구분해야 한다. 현장에서 Helper가 오해를 바로잡더라도, 오해가 있었고 이후 해결됐다는 이력은 다음 설명과 Evidence 해석에 유용하다.
- **결정:** State는 `OBSERVED`, `EXPLAINED`, `DEMONSTRATED`, `TRANSFERRED`를 사용한다. `MISCONCEPTION`은 별도 state가 아니라 근거와 해결 여부를 가진 open issue로 저장한다. 한 번의 contradiction으로 즉시 강등하지 않는다.
- **검토한 대안:** confidence 퍼센트, MISCONCEPTION을 다섯 번째 state로 사용, 최근 발화 하나로 즉시 승급·강등.
- **tradeoff:** 거친 이산 상태라 미묘한 차이는 audit trace에서 보완해야 한다. reducer threshold는 pilot 후 조정이 필요하다.

## 2026-08-24: 선택적 Activity와 Episode 단위 추론

- **상태:** 승인
- **맥락:** 전체 코드, terminal과 대화를 계속 LLM으로 분석하면 비용과 개인정보 위험이 커진다. Agent가 언급한 Concept만 믿으면 실제 구현에서 사용된 중요한 개념을 놓칠 수 있다.
- **결정:** Builder 보고, diff·관련 snippet, Decision, Helper 대화와 test 같은 의미 있는 Activity만 정규화한다. Event를 Episode로 묶고 Episode 종료 후 Analyst를 한 번 호출한다. 전체 repository scan은 누락 검증이나 모호한 사례에만 사용한다.
- **검토한 대안:** 모든 event마다 LLM 추론, Agent 자기보고만 저장, 전체 repository 상시 scan, Evidence를 전혀 수집하지 않음.
- **tradeoff:** 비용과 신호 품질이 좋아지지만 event selection이 잘못되면 Evidence를 놓칠 수 있다. episode/eval 관측성이 필요하다.

## 2026-08-24: local SQLite와 privacy 기본값

- **상태:** 승인
- **맥락:** MVP는 개인 사용과 검증이 중심이며 conversation, code context와 학습 Evidence는 민감할 수 있다.
- **결정:** Project History, Event, Evidence와 Ledger는 local SQLite에 저장한다. Activity 수집은 기본 활성화 사실을 첫 사용에 안내한다. secret redaction과 Agent별 최소 권한을 기본 계약으로 둔다.
- **검토한 대안:** 처음부터 cloud database, memory-only 상태, 원문 log 전체 보존.
- **tradeoff:** 개인정보와 구현 범위가 줄지만 기기 간 동기화와 공동 사용은 제공하지 않는다. local data의 export/delete 범위는 구현 전에 정해야 한다.

## 2026-08-24: Agent 중심과 Code 중심은 취향의 차이

- **상태:** 승인
- **맥락:** 사용자는 IDE처럼 code를 중심으로 볼 수도, Builder와 Helper를 동시에 보는 Agent Development Environment를 선호할 수도 있다. 이것을 초보·고급 단계로 해석할 근거는 없다.
- **결정:** Agent 중심 Crew App은 Builder와 Helper를 양쪽에서 동시에 보여주는 주 surface다. Code 중심은 Kiro editor와 panel/tab을 사용하는 thin prototype으로 같은 Core 상태를 읽는다. 두 mode는 사용자 취향으로 표현하고 실제 사용자 test로 비교한다.
- **검토한 대안:** Agent 중심만 구현, Code 중심만 구현, 숙련되면 자동으로 Code 중심으로 전환.
- **tradeoff:** 두 surface 때문에 UI 범위가 늘어난다. MVP에서는 Crew App을 완성도 높은 primary로, Code 중심은 가설 검증에 필요한 최소 범위로 제한한다.

## 2026-08-24: MVP host와 추론 제공자는 Kiro로 제한

- **상태:** 승인
- **맥락:** Kiro challenge에 맞춰 Kiro API를 제공받는 상황에서 Bedrock을 별도 추론 경로로 섞으면 비용, 인증과 디버깅 경계가 늘어난다. Claude Code와 Codex까지 동시에 지원하면 핵심 검증이 흐려진다.
- **결정:** MVP Agent host와 추론 경로는 Kiro/Crew를 우선 사용한다. Bedrock 별도 경로와 Claude Code·Codex adapter는 MVP 이후로 미룬다. background와 user-triggered 추론은 실행 시점과 quota를 구분하되 provider를 나누기 위한 이유로 사용하지 않는다.
- **검토한 대안:** Bedrock을 background 분석에 별도 사용, 처음부터 multi-provider, Kiro를 UI에만 사용.
- **tradeoff:** 범위와 대회 적합성은 좋아지지만 Kiro quota·latency·기능 제한에 더 의존한다. Core와 MCP contract는 host package와 분리한다.

## 2026-08-24: 생성 project는 TypeScript Golden Path

- **상태:** 승인
- **맥락:** 제품의 개념 모델은 언어 비종속적이어야 하지만 MVP에서 여러 언어의 생성·실행·배포 경계를 검증하기에는 범위가 크다.
- **결정:** contract와 domain은 언어 비종속적으로 설계하고, 실제 생성·실행 project와 배포 고려는 TypeScript만 지원한다.
- **검토한 대안:** Python/Django 우선, 여러 언어 동시 지원, 교육 내용까지 TypeScript에 종속.
- **tradeoff:** 구현과 검증은 집중되지만 다른 언어 사용자는 MVP 대상이 아니다. 언어별 adapter가 필요한 지점을 architecture에 남긴다.

## 2026-08-24: Campus Drop은 Golden Path fixture

- **상태:** 승인
- **맥락:** 사용자의 고등학교 경험에서 행사 신청, 실제로 사용된 파일 공유와 WebSocket click batching은 실용성, 범위와 인접 복잡성의 차이를 잘 보여준다. 다만 하나의 project에 최적화하면 범용 추천을 검증할 수 없다.
- **결정:** Campus Drop을 전체 수직 흐름의 회귀용 Golden Path로 사용한다. Discovery와 Evidence 품질은 다른 learning goal과 unseen input도 함께 검증한다.
- **검토한 대안:** Campus Drop만을 제품으로 구현, fixture 없이 매번 자유 생성, 고정 10개 예제 전체를 Golden Path로 구현.
- **tradeoff:** 안정적인 demo와 test가 생기지만 fixture 특화 위험이 있어 unseen eval과 baseline 비교가 필수다.

## 2026-08-24: 대회 경쟁력은 완성도와 검증으로 입증

- **상태:** 승인
- **맥락:** 접수는 완료됐고 계약 자체만으로 경쟁력이 보장되지는 않는다. 심사에서 핵심은 문제 정의, Kiro 적합성, 작동하는 end-to-end 제품과 차별화 근거다.
- **결정:** MVP 이전에는 핵심 수직 흐름과 안전성을 완성한다. MVP 이후 대회 제출 전에는 실제 초보 사용자 pilot, generic Kiro/단순 memory baseline, ablation, unseen input과 demo reliability를 우선한다. cloud·multi-host·기존 project import는 미룬다.
- **검토한 대안:** 기능 수 확대, 화려한 UI를 우선, 사용자 검증 없이 demo만 준비.
- **tradeoff:** breadth는 줄지만 제품 주장의 신뢰성과 심사 재현성이 높아진다.

## 2026-08-24: TypeScript workspace 개발 도구

- **상태:** 승인
- **맥락:** repository에는 아직 application code와 package manifest가 없다. architecture는 package boundary와 test 종류만 승인했고 구체 도구는 확정하지 않았다.
- **결정:** Node.js active LTS, pnpm workspace, TypeScript strict mode, Vitest와 Playwright를 사용한다. 정확한 Node version, runtime schema와 SQLite/migration library는 호환성 검토 후 Agent가 T02 시작 전에 결정 기록과 함께 확정한다.
- **검토한 대안:** npm workspace, Bun, Jest, Node test runner, 다른 runtime schema 및 SQLite library.
- **tradeoff:** pnpm은 workspace 효율이 좋지만 사용자 환경에 Corepack/pnpm 준비가 필요하다. 도구 수를 늘리면 초기 설정과 Kiro 환경 호환성 부담이 커진다.

## 2026-08-25: T02 repository skeleton 세부 도구와 경계

- **상태:** 승인
- **맥락:** T02를 시작하려면 active LTS의 정확한 Node version, runtime schema, SQLite/migration 조합, lint/format 도구와 실행 package 위치를 고정해야 한다. 로컬 기본 Node.js v26.4.0은 Current이고 Node.js v24.19.0 LTS가 별도로 설치돼 있다. `node:sqlite`는 v24.19.0에서도 release candidate이며, `better-sqlite3` v13은 Windows에서 불필요한 node-gyp toolchain을 요구하는 문제가 보고됐다. T01은 Zod 4와 MCP SDK 2.0.0, React 18.3 기반 Crew App을 실제 runtime에서 통과시켰다.
- **결정:** Node.js 24.19.0, pnpm 11.12.0, TypeScript 7.0.2 strict ESM, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1과 Biome 2.5.10을 고정한다. Crew App은 T01 host 경계를 유지해 React 18.3.1을 쓰고 Vite 8.2.2 및 `@vitejs/plugin-react` 6.1.0으로 빌드한다. local SQLite는 `better-sqlite3` 12.11.1과 Drizzle ORM 0.45.2/Drizzle Kit 0.31.10 조합을 사용한다. 실행 가능한 MCP process는 `apps/mcp-server`, 재사용 가능한 Core·storage·adapter는 `packages/*`에 둔다. pnpm recursive script와 TypeScript project reference로 orchestration하며 Turborepo는 추가하지 않는다. dependency lifecycle script는 실제 설치에 필요한 `better-sqlite3`와 `esbuild` package 이름만 허용한다.
- **검토한 대안:** 현재 기본 Node.js v26 사용, `node:sqlite`, `better-sqlite3` v13, Kysely, Drizzle 1.0 RC, ESLint+Prettier, `packages/mcp-server`, Turborepo.
- **tradeoff:** Node 24와 `better-sqlite3` v12 고정은 최신 Current runtime과 SQLite binding의 신기능을 늦게 받지만 Windows install과 재현성이 좋아진다. Drizzle stable은 SQL migration과 typed query를 제공하지만 storage implementation에만 격리해야 한다. Biome 단일 도구는 설정과 의존성을 줄이는 대신 package dependency graph는 별도 smoke test로 검증한다.

## 2026-08-25: T03 공유 contract 식별자·version·provenance 규칙

- **상태:** 승인
- **맥락:** T03 contract는 Agent, UI, Core와 이후 SQLite가 같은 record를 식별하고 검증하는 기준이다. `schema version`, entity revision과 stale-write token을 섞거나 Evidence source의 작성 주체를 자유 문자열로 받으면 구버전 payload, 잘못된 lineage와 Agent-authored false mastery를 contract 단계에서 구분하기 어렵다.
- **결정:** Zod strict object와 그 schema에서 추론한 TypeScript type을 단일 source로 사용한다. 첫 wire contract는 `schemaVersion: 1`만 수용하고 명시적 migrator가 생기기 전 구버전·미래 version과 초과 field를 거절한다. stable ID는 entity prefix와 소문자 RFC 4122 UUID v4를 결합하고, timestamp는 UTC RFC 3339, immutable record revision은 1부터 증가하며 stale-write용 expected revision은 0을 허용한다. correlation ID는 한 논리 흐름을, idempotency key는 한 제출 재시도를 추적한다. source reference는 kind가 작성 주체를 고정하는 discriminated union으로 만들고 Evidence Proposal의 직접 근거에는 user-authored source만 허용한다. code, diff, test와 Agent message는 보조 context reference로만 둘 수 있다. contract의 file reference는 상대 POSIX path만 허용하며 absolute path, `..`, backslash와 NUL을 거절한다. 실제 filesystem canonicalization과 workspace containment는 T06에서 다시 강제한다.
- **검토한 대안:** 임의 string ID, ULID 신규 의존성, offset 허용 timestamp, TypeScript interface와 Zod schema 중복 작성, 모든 source에 별도 `author` 문자열 허용, contract에서 filesystem 접근까지 수행.
- **tradeoff:** strict v1은 초기 호환성보다 오류의 조기 발견을 우선하며 contract 변경 시 fixture와 명시적 migration이 필요하다. UUID는 사람이 읽기 길지만 추가 의존성 없이 Core에서 안전하게 생성할 수 있다. path schema만으로 symlink나 실제 root 탈출을 막을 수 없으므로 T06의 canonical containment 검증이 필수다.

## 2026-08-25: Crew/Gateway/session 연동 방식

- **상태:** 승인
- **맥락:** T01에서 두 App chat slot과 history는 동작했지만 Crew 0.3.0의 App event bridge는 연결되지 않았고 native spawn은 interactive approval에서 멈췄다. `useAppApi().post()`도 `/api/chat` SSE를 JSON으로 파싱한다. 반면 분리된 MCP catalog, Core stable ID/revision handoff와 숨은 no-tool Analyst slot은 실제 runtime에서 통과했다.
- **결정:** 명시적인 Core MCP checkpoint와 local SQLite의 stable project/task/decision/episode/job ID를 source of truth로 사용한다. Crew App은 Builder/Helper app-owned slot을 얇게 감싸고 history를 REST로 복원한다. Analyst는 TypeScript App이 전용 숨은 slot으로 dispatch하며 durable job 상태, timeout, attempt와 late-result rejection은 Core가 소유한다. `/api/chat`은 경로·payload가 고정된 SSE adapter 하나로 격리하고 범용 raw Gateway client를 노출하지 않는다. App event, Crew memory, native spawn task와 raw chat session 공유를 MVP 전제로 쓰지 않는다.
- **검토한 대안:** event bridge가 고쳐질 것을 가정, Python App backend에서 `approval_mode:auto` spawn 사용, 별도 Bedrock worker, 모든 session transcript 공유.
- **tradeoff:** Crew native task progress와 hard cancel을 바로 얻지 못하지만 TypeScript-only, 최소 권한과 재시작 복구 경계가 명확해진다. runtime slot이 사라져도 Core job을 재시도할 수 있다. App API allowlist는 browser-side guard이므로 앱 신뢰와 Core/MCP 경계를 별도로 강제해야 한다.

## 2026-08-25: Code 중심 MVP는 Kiro 내장 Workspace Agent surface

- **상태:** 승인
- **후속 변경:** 아래 2026-09-07 T19 결정이 자체 패널을 제외한 UI 범위를 대체한다. 당시 spike 결과와 Core stable ID·권한 경계는 검증 이력으로 유지한다.
- **맥락:** 사용자는 Agent 중심 ADE와 Code 중심 IDE를 숙련도 단계가 아닌 취향으로 모두 시험하려 한다. T01에서 같은 `.kiro/agents` Builder/Helper가 Kiro CLI에서 Agent별 MCP 권한과 Core handoff를 통과했고, 공식 문서는 project-level Agent가 IDE/CLI 양쪽과 UI switching을 지원한다고 명시한다.
- **결정:** Code 중심 MVP는 별도 extension이나 custom webview 없이 Kiro IDE의 editor와 내장 Agent panel에서 project-local Builder/Helper를 선택하는 thin surface다. 두 Agent는 Crew App과 같은 Core MCP·stable ID를 사용하며 raw chat session을 공유하지 않는다. Agent 중심 Crew App은 Builder/Helper side-by-side primary를 유지한다. macOS 시각 picker와 Windows smoke는 제출 전 검증하되 `apps/kiro-panel`을 만들지는 않는다.
- **검토한 대안:** Open VSX extension/webview, Crew App 안에 Monaco editor, Code mode 삭제, Crew와 IDE의 raw session 동기화.
- **tradeoff:** custom Task/Decision widget은 Code mode에 없지만 구현 범위와 host 취약성이 크게 줄고, 사용자는 실제 Kiro 편집 경험을 그대로 쓸 수 있다.

## 2026-08-24: MVP 실행·배포 범위

- **상태:** 승인
- **맥락:** 초기 대화에서는 TypeScript 배포만 고려하기로 했지만 정확한 심사 실행 환경과 hosted endpoint 필요 여부는 제품 계약에 확정되지 않았다.
- **결정:** 첫 MVP 완료 기준은 재현 가능한 local Kiro/Crew App, MCP server와 생성 TypeScript 결과물의 실행이다. 대회 제출 요건을 다시 확인한 뒤 T28에서 하나의 공식 packaging·배포 경로를 승인한다.
- **검토한 대안:** 처음부터 hosted service, 생성 결과물만 배포, 배포를 전혀 고려하지 않음.
- **tradeoff:** core 검증에 집중할 수 있지만 심사자가 접근할 공개 surface가 필수라면 뒤늦은 packaging 위험이 있다. T00에서 요건 확인 책임을 정한다.

## 2026-08-24: Evidence threshold와 사용자 연구 규모

- **상태:** 승인
- **맥락:** `DEMONSTRATED`와 `TRANSFERRED`에 필요한 독립 Evidence 횟수, contradiction 해소 정책과 pilot 참가자 수는 언어만으로 최적값을 정하기 어렵다.
- **결정:** reducer는 보수적인 초기 규칙과 명시적 trace를 사용하되 숫자 threshold는 fixture와 초보 사용자 pilot 뒤에 조정한다. 연구 규모는 대회 일정, 모집 가능성, 동의와 annotation 역량을 확인한 뒤 확정한다.
- **검토한 대안:** 처음부터 고정 confidence score, LLM의 직관만 사용, 사용자 검증 생략.
- **tradeoff:** 초기 state가 보수적이거나 둔할 수 있지만 근거 없이 false mastery를 만드는 것보다 안전하다.

## 2026-08-25: T04 초기 domain reducer와 Evidence 정책

- **상태:** 승인
- **맥락:** T03 wire contract는 provenance와 기본 shape를 검증하지만 cross-record lineage, state transition, duplicate replay와 Evidence 채택은 아직 결정하지 않는다. 특히 기존 accepted Evidence union에는 contradiction을 정직하게 보존할 종류가 없어 `MisconceptionIssue.openedByEvidenceId`를 충족할 수 없고, accepted Evidence만으로 reducer 입력을 재현하는 데 필요한 Episode와 Evidence 분류 정보가 부족하다. 숫자 confidence threshold는 T07 fixture와 T23 pilot 전까지 확정하지 않기로 했다.
- **결정:** T04 domain 함수는 ID와 시각을 입력으로 받는 순수 함수로 만들고 `APPLIED`, `NO_OP`, `REJECTED` 결과와 versioned trace를 반환한다. Candidate merge는 첫 target Candidate의 다음 revision으로 이어가며 모든 target의 최신 revision을 parent로 보존한다. Spec 확인은 최신 draft와 내용이 같은 user-authored next revision만 허용한다. Task, Decision과 Episode는 명시적인 허용 전이만 적용한다. accepted Evidence에는 Episode, signal, strength와 prompt dependence를 보존하고 state를 지지하지 않는 `MISCONCEPTION_SIGNAL` variant를 추가한다. 초기 Evidence 정책은 QUESTION, NONE, WEAK와 DIRECTLY_LED로 state를 올리지 않고, 유효한 REPHRASE는 최대 EXPLAINED, 직접 유도되지 않은 STRONG PREDICTION·JUSTIFIED_DECISION·APPLICATION은 최대 DEMONSTRATED로 제한한다. TRANSFERRED는 이전 DEMONSTRATED 근거와 다른 Task 또는 Project의 STRONG·INDEPENDENT TRANSFER를 함께 요구한다. CONTRADICTION은 open issue를 열거나 보강하되 Concept State를 자동 강등하지 않는다.
- **검토한 대안:** domain이 현재 시각과 ID를 직접 생성, duplicate를 오류로만 처리, Analyst proposal의 maximum state를 그대로 적용, contradiction을 USER_UNDERSTANDING Evidence로 위장, 한 번의 contradiction으로 state 강등, pilot 전에 confidence score와 반복 횟수 threshold 고정.
- **tradeoff:** 초기 정책은 false mastery를 줄이는 대신 약한 학습 신호를 state에 반영하지 않아 보수적으로 보일 수 있다. accepted Evidence payload가 조금 커지지만 reducer replay와 audit가 단순해진다. 정책 조정은 reducer version, 결정 기록과 회귀 fixture를 함께 변경해야 한다.

## 2026-08-25: T05 SQLite hybrid schema와 복구 경계

- **상태:** 승인
- **맥락:** T03 strict contract와 T04 reducer 결과를 local SQLite에 보존하면서 revision lineage, restart 복구, Evidence Trace와 audit query를 지원해야 한다. 모든 nested DTO를 컬럼으로 완전 정규화하면 contract 변경마다 DDL이 과도하게 흔들리고, 단일 generic JSON table은 foreign key와 projection invariant를 강제하기 어렵다. 실제 OS app-data 위치는 packaging 전에는 확정되지 않았다.
- **결정:** stable ID, revision, status, correlation, timestamp와 조회·관계 key는 SQLite column과 foreign key로 두고, 각 strict contract DTO 전체는 canonical JSON과 SHA-256 hash로 함께 보존하는 hybrid schema를 사용한다. immutable revision/event/proposal/audit table과 selected Candidate, active Task, pending Decision, 최신 Context·Concept State projection을 분리하고 같은 transaction에서 갱신한다. application package에는 repository port와 Unit of Work interface만 두며 use case는 T06에서 구현한다. storage는 raw Crew/Agent transport payload를 받지 않고 contract schema로 재검증한 record만 저장하며, 알려진 credential pattern은 redaction status와 무관하게 마지막 방어선에서 거절한다. file DB는 host가 명시적으로 제공한 data directory 아래 고정 filename을 사용하고 production default path는 T28 packaging에서 결정한다. pending migration 전 sibling backup을 만들고, Drizzle transaction migration과 `PRAGMA quick_check`를 사용한다. corruption이나 migration 실패 시 원본을 자동 삭제·교체하지 않는다.
- **검토한 대안:** 모든 field 완전 정규화, entity 종류를 구분하지 않는 단일 event/JSON table, repository가 임의 SQL과 raw payload 저장을 노출, repository 내부에서 OS home directory를 추측, migration 전 backup 생략, corruption 시 DB 자동 재생성.
- **tradeoff:** canonical JSON과 indexed column이 일부 정보를 중복하지만 contract round trip과 relational query를 함께 얻는다. storage가 수행하는 credential pattern 검사는 redaction service를 대체하지 않으며 false negative를 막기 위해 T21에서 별도 redaction/eval을 강화해야 한다. backup 때문에 migration 시작 비용이 늘지만 local single-user DB의 recoverability를 우선한다. Drizzle 0.45의 전체 declaration surface는 TypeScript 7 strict build에서 optional backend type 오류를 만들므로 schema는 migration input으로 격리해 `drizzle-kit check`로 검증하고, runtime query는 strict TypeScript repository 안의 bound `better-sqlite3` statement로 제한한다.

## 2026-08-25: T06 application과 역할 고정 MCP 보안 경계

- **상태:** 승인
- **맥락:** T03 contract는 actor와 상대 path shape를 검증하고 T05 storage는 transaction과 immutable receipt를 제공하지만, 실제 caller role, payload 크기, symlink를 포함한 workspace containment, stale write와 idempotent replay를 application/MCP 경계에서 함께 강제하지 않는다. Architecture의 초기 tool 목록에는 user-authored Discovery feedback을 Agent가 기록하는 것처럼 보이는 항목도 남아 있었다.
- **결정:** application handler를 Agent와 UI가 공유하는 command/query 및 transaction 경계로 구현한다. MCP process는 시작 시 Discovery, Builder, Helper 또는 Evidence Analyst 한 role에 고정하고 해당 catalog만 등록하며 payload의 actor claim을 다시 검증한다. validated canonical JSON UTF-8 요청은 2 MiB로 제한한다. user-authored Discovery feedback은 UI application command로만 받고 Discovery Agent tool에서 제외한다. idempotent command는 canonical request SHA-256 hash와 결과 resource/revision receipt를 저장해 같은 key·같은 hash만 replay하고 key 재사용은 거절한다. workspace root와 project workspace는 host가 명시한 절대 path를 사용하며 existing target은 realpath, missing target은 nearest existing ancestor를 기준으로 containment를 확인한다. T06 MCP에는 raw SQL, 범용 file read/write, shell 또는 network tool을 노출하지 않는다. protocol-level allowlist test에는 server와 같은 2.0.0의 공식 MCP client package를 test dependency로 사용한다.
- **검토한 대안:** 하나의 MCP catalog를 prompt로만 제한, payload actor를 caller identity로 신뢰, SDK 기본 10 MiB transport 제한만 사용, lexical path prefix만 검사, 결과를 저장하지 않는 in-memory idempotency, Discovery Agent가 user feedback source를 대신 주장, custom JSON-RPC test client 작성.
- **tradeoff:** role별 process/config와 aggregate query가 늘어나지만 권한 누출과 session 간 상태 혼동을 줄인다. 2 MiB cap은 contract의 이론적 최대 조합보다 작을 수 있으므로 비정상적으로 긴 batch는 나눠 제출해야 한다. canonicalization은 filesystem 조회가 필요하지만 path-bearing mutation 전에만 수행하며 실제 Builder shell confinement는 T10에서 같은 policy에 연결한다. 공식 client test dependency 하나가 늘지만 실제 `tools/list`/`tools/call` protocol 회귀를 직접 검증할 수 있다.

## 2026-08-26: T07 속성 기반 평가와 reviewer 경계

- **상태:** 승인
- **맥락:** T03의 evaluation contract는 fixture와 run의 기본 envelope만 제공하고 실제 scorer, reviewer 판정 단위와 baseline 의미는 정하지 않았다. T08 이후 Agent 출력을 고정 문구나 Campus Drop 전용 답과 비교하면 unseen input의 품질을 측정하지 못하고, 모든 의미 판정을 자동화하면 후보 다양성·Decision 필요성·claim 단위 Evidence 같은 항목에 가짜 정밀도가 생긴다. 반대로 모든 항목을 사람에게 맡기면 contract·provenance·reducer 회귀를 재현 가능하게 막을 수 없다.
- **결정:** T07 평가는 고정 답안 대신 criterion별 허용·금지 속성을 사용한다. contract, revision, 필수 scope, stale version, provenance, reducer outcome과 redaction sentinel은 deterministic scorer가 판정하고, 의미적 다양성, Concept Necessity, scope 적합성, 실제 Decision 필요성과 Evidence claim 정확성은 근거와 rubric을 가진 human review로 남긴다. run은 criterion별 결과를 보존하며 `NEEDS_REVIEW`를 실패와 구분하고 가중 종합 점수나 confidence percentage를 만들지 않는다. Campus Drop과 personal need 유무가 다른 unseen corpus, 알려진 good/bad calibration output을 함께 둔다. T07 baseline은 harness가 알려진 차이를 검출하는 calibration baseline이며 일반 Kiro·memory baseline과 ablation은 T24까지 주장하지 않는다. fixture와 committed baseline은 개인정보가 없는 redacted JSON으로 유지하고 runtime evaluation run과 baseline은 같은 strict contract를 canonical JSON/hash와 함께 local SQLite에 저장한다. 외부 LLM judge와 새 평가 dependency는 추가하지 않는다.
- **검토한 대안:** exact string golden answer, 하나의 weighted score, 모든 항목 자동 heuristic, 모든 항목 수동 review, T07에서 실제 Kiro baseline을 미리 주장, 평가 결과를 repository JSON에만 저장.
- **tradeoff:** semantic 품질에는 reviewer 시간이 필요하고 T23 전에는 reviewer agreement를 주장할 수 없다. 대신 자동 검증의 재현성과 사람 판단의 정직한 경계가 분명해지고, prompt를 fixture 문구에 맞춰 과적합하는 위험과 false precision을 줄인다.

## 2026-08-26: T08 feedback-to-round 계약과 Discovery Agent 경계

- **상태:** 승인
- **맥락:** user feedback이 아직 생성되지 않은 결과 revision을 미리 참조하게 하면 retry와 실패 뒤 causal history가 거짓이 된다. 반대로 Agent에게 Candidate/Round ID, timestamp, source와 input snapshot까지 생성하게 하면 의미 생성과 Core 상태 소유권이 섞인다. Kiro CLI 2.19.2는 선언한 tool input 외에 `__tool_use_purpose` transport field를 주입하는 동작도 실제 실행에서 확인됐다.
- **결정:** user-authored feedback은 현재 round의 latest Candidate revision만 target으로 기록하고 결과를 소유하지 않는다. SELECT가 아닌 pending feedback은 다음 Candidate Round가 `appliedFeedbackIds`로 정확히 연결하며, round는 유지된 latest revision과 새 revision의 완전한 현재 집합을 보존한다. Application이 PIN, REJECT, MERGE, REVISE, SHRINK, EXPAND와 REGENERATE의 target·lineage·next revision·carried set을 deterministic하게 검증한다. SELECT는 UI command만 허용하고 Discovery Session과 Project를 terminal 상태로 바꿔 이후 feedback/round를 거절한다. Discovery Agent tool에는 의미 draft와 lineage만 노출하고 role-bound adapter가 검증된 context에서 Core-owned ID, revision, timestamp, provenance, redaction과 input snapshot을 채운다. `__tool_use_purpose`는 Agent-facing transport schema에서만 선택적으로 수용해 버린다. canonical prompt는 `docs/agent-prompts/discovery.md` version 1.0.1이며 tool allowlist 외의 file, shell, SQL, network 권한은 추가하지 않는다. live 회귀 runner는 prompt 품질 review를 통과하고 약 90초에 fresh 8-Candidate run을 완료한 `claude-haiku-4.5`를 기본으로 쓰되 제품 모델은 T24 전까지 고정하지 않는다.
- **검증:** synthetic unseen 입력에서 실제 Kiro CLI 2.19.2 Agent Engine v2→role-bound MCP→Application→SQLite가 8개 Candidate round를 중단 없이 저장하고 정상 종료했다. server metadata만 정규화한 v1.0.1 fixture가 strict contract·구조 scorer와 기록된 사람의 의미 다양성·Concept Necessity review를 통과한다. 반면 `auto` 모델의 느린 fresh run은 첫 submit에서 `Transport closed`가 재현됐고, 그 exact payload는 공식 in-memory와 fresh stdio MCP client에서 같은 server/Application/SQLite에 즉시 수락됐다.
- **검토한 대안:** feedback에 미래 resulting revision 저장, Agent가 완성된 Application command와 provenance 생성, PIN 후보만 별도 table로 관리, SELECT를 Agent tool에 노출, Kiro transport field를 Application strict contract까지 허용, server logging keepalive, Candidate draft를 여러 tool call로 staging한 뒤 atomic finalize, persistent HTTP MCP, Kiro Agent Engine v3로 즉시 전환, timeout을 mock 성공으로 대체.
- **tradeoff:** 다음 round는 전체 current Candidate reference와 적용 feedback 목록을 보내야 하고 transport adapter 코드가 늘어난다. 대신 실패 전 feedback과 성공한 결과의 인과관계, stale retry, user selection provenance가 재현 가능하며 Kiro 전용 세부사항이 stable Core contract로 누출되지 않는다. CLI 2의 느린 단일 tool input lifecycle 결함은 T09의 selected-Candidate→Spec 계약을 막지 않으므로 T09로 진행한다. server logging keepalive는 효과가 없어 제거했고, staging은 partial Agent draft 상태와 새 contract를 만들며 persistent HTTP는 process/security 경계를 늘리므로 target Crew host에서도 재현될 때 T15에서만 승인한다. v3 probe는 v2 custom Agent를 upgrade하지 못하고 default Agent로 fallback했으므로 비교 근거로 쓰지 않으며 T19에서 native config로 재검증한다. T21은 clean session의 fresh 8-Candidate run과 retry 무중복성을 release gate로 둔다.

## 2026-08-27: T09 Learning Spec revision과 Discovery 복귀 경계

- **상태:** 승인
- **맥락:** T03~T08은 Learning Spec record와 변경 없는 사용자 확정, selected Candidate와 terminal Discovery Session을 보존하지만, Discovery Agent가 Spec ID·revision·timestamp·source까지 직접 제출하고 최신 draft를 context에서 읽지 못한다. 또한 `조금 바꾸기`와 `다른 주제로 돌아가기`를 안전하게 표현할 application transition이 없다. 선택이 끝난 T08 Session을 다시 열면 terminal selection과 feedback-to-round 인과관계가 깨진다.
- **결정:** Agent와 UI는 Learning Spec의 의미 내용만 제안하며 role-bound/application adapter가 selected Candidate, Spec ID, next revision, parent, timestamp, source와 redaction status를 채운다. 첫 draft는 selected Candidate에 연결된 revision 1이고, 조정은 같은 Spec·Candidate의 current draft 바로 다음 revision만 허용한다. 사용자는 Agent가 다시 쓴 draft 또는 직접 편집한 draft를 명시적으로 확정할 수 있으며, 확정 revision은 current draft와 내용이 같아야 한다. `다른 주제로 돌아가기`는 selected Session을 재활성화하지 않고 같은 입력에서 새 Discovery Session을 만들며 current draft를 `SUPERSEDED`로 닫는다. Core의 필수 Evidence target은 `LEARNER_FOCUS` concept만 사용하고 `AGENT_SUPPORT`와 `EXCLUDED`를 제외한다.
- **검토한 대안:** Agent가 stable metadata를 계속 생성, 기존 selected Session 재개, Spec 수정을 confirmation payload에 함께 포함, Spec feedback 전용 table 추가, 세 scope의 모든 concept을 Builder/Evidence 목표로 사용.
- **tradeoff:** 새 session 때문에 Project의 Discovery history가 하나 늘고 Spec 조정에 revision이 추가되지만 T08 terminal invariant와 provenance를 보존한다. 별도 Spec feedback entity를 만들지 않아 자연어 요청 원문은 Crew conversation 경계에 남지만 저장된 draft의 author와 revision은 명확하다. 직접 편집과 Agent 재작성은 같은 domain policy를 공유해 UI 선택권과 deterministic validation을 함께 유지한다.

## 2026-08-27: T10 Builder Task 준비와 native workspace 실행 경계

- **상태:** 승인
- **맥락:** T09은 user-confirmed Learning Spec까지 보존하지만 Task 생성, generated workspace assignment와 Builder runtime은 아직 연결하지 않았다. Crew 0.3.0은 slot의 project directory를 첫 message 전에 지정할 수 있고 Kiro CLI 2.19.2 Agent Engine v2는 tool별 path 설정, shell `denyByDefault`와 pre-tool hook을 제공한다. 다만 host user 권한으로 실행되는 native file/shell tool은 Core MCP catalog 분리만으로 filesystem boundary가 되지 않으며, raw stream 전체를 durable storage에 넣으면 secret과 민감 경로가 섞일 수 있다.
- **결정:** Spec confirmation과 retry 가능한 `UI_PREPARE_BUILDER_TASK`를 분리한다. Core가 confirmed Spec을 deterministic Task로 변환하고 `projects/<projectId>` 상대 workspace를 발급한다. `LEARNER_FOCUS`는 expected Concept, `AGENT_SUPPORT`는 구현 지원 requirement, `EXCLUDED`는 excluded work로만 매핑한다. Builder는 기존 Kiro CLI 2.19.2 Agent Engine v2와 Crew 0.3.0을 유지하고 fresh slot을 canonical project workspace에 첫 message 전에 연결한다. native read/write/shell은 Kiro의 deny-by-default 설정과 Core workspace policy를 재사용하는 pre-tool guard를 모두 통과해야 하며 web, subagent, global MCP는 허용하지 않는다. runtime escape probe가 이 경계를 증명하지 못하면 임의 fallback이나 CLI 3 migration을 하지 않고 새 결정을 요청한다. Builder stream은 redaction 뒤 사용자에게 transient하게 보이고 raw transcript는 저장하지 않으며, durable state에는 versioned Live Context, Completion Report와 구조화된 source reference만 남긴다. 첫 Context는 `TASK_STARTED`, 완료 직전 마지막 Context는 `TASK_COMPLETED`로 강제한다. Completion Report의 Concept usage는 구현에서 사용됐다는 관찰이며 사용자 이해 판정이 아니다.
- **검토한 대안:** Spec 확정 transaction에서 즉시 Task와 workspace 생성, Agent가 Task acceptance criteria와 workspace path를 결정, Core MCP에 범용 file/shell tool 추가, Crew slot cwd만 믿고 별도 guard 생략, raw Builder transcript 전체 저장, Kiro CLI 3으로 즉시 migration.
- **tradeoff:** Task 준비 command와 runtime guard가 추가되고 허용 shell command가 보수적이어서 새로운 debug command는 명시적으로 확장해야 한다. 대신 confirmation retry 실패가 Spec lineage를 바꾸지 않고, Agent 작성 의미와 Core-owned state, filesystem 경계, 사용자에게 보이는 진행과 durable 최소 기록을 분리할 수 있다.

## 2026-09-01: T11 Decision gate와 Builder 재개·적용 경계

- **상태:** 승인
- **맥락:** T03~T06은 Decision Request, user Resolution과 Builder Application record 및 reducer·SQLite 골격을 만들었지만, T10 Builder runtime에는 실제 적용 command가 없고 Decision 요청과 `DECISION_REQUIRED` Live Context가 별도 write라 부분 실패 시 정합성이 깨질 수 있다. 또한 `independentWorkCanContinue`가 Task 상태를 바꾸지 않으며 이유 없는 추천 수락을 이후 이해 Evidence에서 배제할 deterministic 근거가 없다.
- **결정:** Builder-facing Decision tool은 category, 질문, 필요 이유, 선택지, 추천, 관련 Concept·source reference와 독립 작업 가능 여부만 받고 role-bound adapter가 Kiro transport metadata를 제거한 뒤 Application이 stable Decision/option ID, current Context version, timestamp, provenance와 redaction 상태를 채운다. Application은 Decision Request와 다음 `DECISION_REQUIRED` Context를 한 transaction에서 저장하고, 독립 작업이 불가능하면 Task를 `BLOCKED`로 전이한다. UI의 user-authored Resolution은 추천 수락, 직접 option 선택과 custom proposal을 보존하며, 해결되지 않은 다른 blocking Decision이 없으면 Core가 Task를 `ACTIVE`로 재개한다. Builder는 별도 `apply_decision_result` tool로 구현 결과와 source reference를 제출하고 DecisionApplication record와 active Decision ID를 제거한 다음 Live Context를 한 transaction에서 저장한다. 모든 요청된 Decision이 적용되기 전에는 Task completion을 거절한다. Helper에는 pending Decision context만 handoff하고 실제 Helper prompt·대화는 T12에 둔다. `DECISION_RESOLVED` Activity에는 사용자 rationale 원문 대신 rationale 존재 여부만 남겨, 이유 없는 수락을 이해 Evidence source로 수용하지 않는다.
- **검토한 대안:** Decision과 Context를 순차 저장, Task를 항상 ACTIVE로 유지, resolution만으로 적용 완료 처리, Builder가 stable metadata를 생성, 의미적 필요성을 filename keyword 같은 heuristic으로 자동 판정, T11에서 Helper 대화·Decision UI·Episode assembler까지 함께 구현.
- **tradeoff:** request와 application command가 Context version을 함께 다뤄 contract와 transaction test가 늘어난다. 대신 stale retry와 재시작에서도 pending gate가 재현되고 사용자의 선택, Builder 적용, Task 재개가 구분된다. Decision 필요성 자체는 LLM prompt와 기록된 human review가 담당하므로 사소한 질문을 완벽히 자동 차단하지는 않지만, Core가 의미 판단을 가장하거나 fixture 문구에 과적합하지 않는다.

## 2026-09-01: T12 bounded Helper context와 durable refresh 경계

- **상태:** 승인
- **맥락:** T06의 Helper scaffold는 Live Context, active Decision과 최대 5개 Ledger를 읽고 refresh 요청을 audit에만 남긴다. 하지만 활성 Task가 없는 완료 Project에서는 Helper를 열 수 없고, missing Context가 current처럼 보이며, 관련 Concept 이름이 비어 있으면 무관한 Ledger 앞 5개가 반환된다. code·diff·Builder 대화 reference도 실제 내용의 가용성을 구분하지 않아 Helper가 현재 코드를 추측할 위험이 있다.
- **결정:** Helper는 active Task가 없으면 마지막 current Task로 fallback하고 freshness를 `CURRENT`, `STALE`, `MISSING`으로 명시한다. Context package는 Live Context→Task/Spec→지정 또는 active Decision→질문·Context·Decision 관련 Concept 최대 5개→관련 과거 Episode→bounded source 순으로 조립한다. 무관한 Ledger fallback은 만들지 않는다. Builder가 이미 제출한 workspace-contained code reference만 질문 시점에 최대 3개, excerpt당 최대 8 KiB로 읽고 redaction한 뒤 응답하며 DB에는 복제하지 않는다. diff와 Builder transcript 원문은 장기 저장하지 않고 reference/availability만 전달한다. refresh는 versioned `ContextRefreshRequest`로 저장해 Builder가 pending 요청을 읽을 수 있게 하고, 더 새로운 Builder Context가 같은 transaction에서 이를 fulfilled로 닫는다. Helper는 Context, Decision, Evidence와 Builder Progress를 직접 변경하지 않는다. Prompt 원문은 `docs/agent-prompts/helper.md` version 1.0.0으로 고정하고, quick action은 답변 mode일 뿐 T13 Event/Evidence source가 아니다.
- **검토한 대안:** 완료 Project에서 Helper를 닫음, missing을 stale boolean 하나로 표현, 질문과 무관한 Ledger를 채워 반환, Helper에 전체 workspace `fs_read`나 shell 허용, 전체 repository·diff·Builder transcript를 매 질문 저장·주입, refresh를 audit summary로만 보존.
- **tradeoff:** Context response와 SQLite migration, bounded file read와 refresh lifecycle test가 늘어난다. 대신 AC-MVP-005의 현재성·최소성·복구 가능성을 재시작 뒤에도 검증할 수 있고, Helper가 넓은 file 권한이나 raw transcript 저장 없이 현재 코드에 근거한 답을 할 수 있다. 실제 Helper conversation Event와 Episode 조립은 T13, quick card UI는 T16에 남긴다.

## 2026-09-02: T13 structured Activity·Episode와 durable Analyst job 경계

- **상태:** 승인
- **맥락:** T03~T06은 Event, Episode, Evidence contract와 reducer·SQLite 골격을 만들었지만 T10~T12의 실제 Builder, Decision과 Helper 흐름은 아직 Event를 생성하지 않는다. Episode 종료 뒤 실행할 durable `AnalysisJob`, timeout/retry와 late result 차단도 없으며, 현재 Evidence batch는 근거가 전혀 없는 정상 분석을 표현하지 못한다. T01은 Crew event bridge나 native spawn 대신 hidden no-tool Analyst slot과 Core-owned durable job을 MVP 경계로 검증했다.
- **결정:** raw Crew event나 전체 transcript가 아니라 검증된 Application 상태 전이에서만 redacted Activity Event를 만든다. BUILD_TASK는 Task 시작부터 완료까지, DECISION은 요청부터 사용자 Resolution까지, HELPER_CONVERSATION은 첫 사용자 메시지부터 명시적 종료·관련 Decision 해결·Task 완료까지, FINAL_UPGRADE는 명시적 개인화 적용 행동 단위로 조립한다. Episode 종료와 `AnalysisJob` 생성은 한 transaction으로 처리한다. Job은 Episode revision, attempt와 30초 soft deadline을 가진 versioned `PENDING → RUNNING → SUCCEEDED/FAILED` 이력을 보존하고 자동 재시도는 1회로 제한한다. adapter startup/poll은 deadline이 지난 `RUNNING` lease를 Core command로 회수한다. 재시도 중 Episode는 `PENDING_ANALYSIS`, 두 attempt가 모두 실패하면 `ANALYSIS_FAILED`로 두며 명시적 수동 재시도만 다시 `PENDING_ANALYSIS`로 연다. current job revision·attempt와 맞지 않는 늦은 결과는 상태와 Evidence를 바꾸지 않고 거절한다. primary Analyst runtime은 bounded Episode context를 받은 hidden no-tool slot이며 semantic output의 ID, timestamp, provenance와 attempt token은 adapter/Core가 채운다. proposal 0개도 성공한 분석으로 허용하고 reason/count summary를 Job에 보존하며, Builder Concept usage는 사용자 이해와 분리된 deterministic `CONCEPT_OBSERVATION`으로 처리한다.
- **검토한 대안:** raw Crew stream을 Event source of truth로 사용, Event마다 Analyst 호출, hard cancel을 전제로 한 spawn task, Agent가 job/ID/provenance 생성, timeout 뒤 결과를 attempt 확인 없이 수용, Evidence가 없을 때 가짜 NONE proposal 생성, Builder 사용 Concept를 사용자 이해 Evidence로 처리.
- **tradeoff:** Event normalization, Episode close와 job transition을 기존 use case transaction에 연결해야 해 contract와 migration이 늘어나고 Helper conversation 종료 signal이 필요하다. 대신 provider/session이 사라져도 분석을 복구할 수 있고, 실패한 분석이 Builder 결과를 롤백하지 않으며, 한 Episode당 한 initial dispatch와 제한된 retry, provenance 분리와 빈 결과를 재현 가능하게 검증할 수 있다.

## 2026-09-02: T14 Crew Node backend와 durable session read model

- **상태:** 승인
- **맥락:** T05의 `recoverProject`는 stable project ID가 주어졌을 때 current Core 상태를 복구하지만 Crew App browser가 SQLite/Application을 호출할 production transport, Project History 목록 query와 UI용 session snapshot은 없다. Helper 원문 대화는 Crew slot history에 있고 durable Core에는 redacted user excerpt와 Helper summary만 남으므로 두 저장 경계를 같은 것으로 취급할 수도 없다. 설치된 Crew 0.3.0과 공식 manifest는 app-relative Node backend, same-origin reverse proxy와 Gateway proxy HMAC을 지원한다.
- **결정:** `apps/crew-backend`를 TypeScript Node composition root로 추가하고 Crew App UI는 고정 same-origin endpoint를 통해서만 기존 `ApplicationService.executeUi`를 호출한다. backend는 host가 제공한 absolute app-data와 generated-workspace 경계에서 SQLite/Application을 조합하고 proxy HMAC, method/content type, 2 MiB payload와 strict response schema를 검증한다. UI contract에는 project 목록과 session restore query/read model을 추가하며 project, Discovery/Spec, current 또는 active Task, pending Decision, Live Context와 redacted Helper conversation summary를 한 snapshot으로 반환한다. Project별 Builder/Helper slot key는 stable project ID에서 결정적으로 파생하고 Crew history를 runtime 보조 source로 복원한다. Crew 연결이 실패해도 Core snapshot과 redacted history는 유지하며 localStorage, seed나 mock을 production fallback으로 사용하지 않는다. UI route는 host subpath와 충돌하지 않는 hash route를 사용하고 React Router를 추가하지 않는다.
- **검토한 대안:** browser가 SQLite/storage package를 직접 bundle, 기존 Agent MCP를 UI transport로 재사용, app-scoped storage에 Core state를 복제, `apps/mcp-server`에 HTTP 책임 추가, Crew slot/history만 source of truth로 사용, production mock/seed fallback, 새 router/server framework dependency 추가.
- **tradeoff:** 별도 backend process와 HMAC·HTTP integration test, Project History query와 Crew/Core 부분 실패 상태가 늘어난다. 대신 UI와 storage dependency 방향, TypeScript-only 경계, Agent별 MCP 권한과 local-first 단일 source of truth를 유지하고 Crew Agent 연결과 durable project 조회를 독립적으로 복구할 수 있다. full Helper 원문은 Crew slot이 있을 때만 복원하며 offline에는 이미 저장된 redacted 요약만 정직하게 표시한다.

## 2026-09-02: T15 Discovery Crew Agent transport와 설치 package 경계

- **상태:** 승인
- **맥락:** T14 UI는 durable Core를 복원하지만 Discovery Agent dispatch와 app-owned Agent/MCP packaging이 없었다. Crew 0.3.0은 app Agent를 전역 Kiro Agent directory로 materialize하므로 상대 prompt file과 workspace package link를 유지하지 않으며, 앱 설치 시 `node_modules`를 제외한다. 반면 자동 포트 Node backend가 health check를 통과한 뒤 manifest의 loopback HTTP MCP URL을 실제 포트로 재등록하는 경로는 target host에서 확인됐다. T08 CLI 2 stdio의 느린 Candidate submit은 `Transport closed`를 냈지만 target Crew 0.3.0의 실제 10-Candidate run에서는 재현되지 않았다.
- **결정:** canonical Discovery prompt v1.1.0은 build에서 검증해 inline Agent config로 생성하고, Agent에는 app-owned `vibe-helper:discovery-core` 하나만 허용한다. Discovery MCP는 별도 범용 process가 아니라 Crew가 감독하는 기존 Node backend의 고정 `/mcp/discovery`에 role-bound Streamable HTTP handler로 조합한다. backend는 loopback에만 bind하고 handler는 `DISCOVERY` catalog만 노출하며 app manifest는 외부 network permission을 갖지 않는다. UI는 stable project ID에서 파생한 temporary slot과 고정 `/api/chat` SSE만 사용하고, Core tool turn에 필요한 schema version, project/session/correlation ID, expected session revision과 host-generated idempotency key를 Agent message에 명시한다. Agent가 이 값을 변경하거나 누락해도 Core validation이 최종 경계다. 완료 판정은 SSE 문장이 아니라 durable Candidate Round/Spec revision으로 하며, target 실측에 맞춰 420초 동안 진행 시간을 보여주고 timeout·host disconnect 뒤 retry 전에 Core를 먼저 복원한다. 설치물은 backend ESM bundle, `ui/dist/index.mjs` UI bundle, inline Agent, SQL migrations와 정확히 고정한 `better-sqlite3`·`drizzle-orm` runtime dependency만 담은 `dist/crew-package`로 staging한다. Crew host가 `ui.entry`를 고정 설치 `ui/` root에 상대적으로 해석하므로 manifest entry는 `dist/index.mjs`로 제한하고 smoke test가 manifest-entry와 staged file의 일치를 검증한다.
- **검증:** macOS target Crew 0.3.0에서 app별 trust만 추가하고 전역 third-party 허용은 사용하지 않았다. health-gated MCP initialize가 protocol `2025-11-25`와 Discovery tool capability를 반환했다. 실제 `auto` Agent는 `get_discovery_context`와 `submit_candidate_round`를 호출해 약 196초에 10개 Candidate, Round 1개를 SQLite에 저장하고 Session revision을 1에서 2로 올렸다. slot은 오류 없이 종료했고 `Transport closed`는 없었다. 따라서 T08의 staged partial draft fallback 조건은 충족되지 않았고 atomic round contract를 유지했다.
- **검토한 대안:** repository 전체를 그대로 설치, workspace package별 runtime install, prompt의 상대 `file://` 참조, app-relative stdio command, Agent가 session metadata를 추측, SSE 완료를 durable 성공으로 간주, 180초 고정 timeout, Candidate staged partial submit.
- **tradeoff:** backend가 UI HMAC route와 Agent HTTP MCP를 함께 조합하고 설치 시 두 native runtime package를 받아야 한다. 대신 Crew health lifecycle과 실제 포트 재등록을 사용해 별도 daemon·고정 포트를 만들지 않으며, role catalog·Core validation·SQLite transaction은 transport와 독립적으로 유지된다. T08에서 미뤘던 persistent HTTP는 stdio 오류 우회가 아니라 Crew app의 지원되는 supervised backend transport로 범위를 좁혀 승인하며, T19/T21은 clean install과 fresh retry 무중복 회귀를 계속 확인한다.

## 2026-09-03: T15 progressive Discovery와 즉시 복귀 latency 보완

- **상태:** 승인
- **맥락:** target 사용 흐름에서 최초 10개 후보는 약 193초가 걸렸고, 같은 project slot의 긴 transcript를 재사용한 재생성과 Spec→Discovery 자동 재생성은 각각 약 636초와 443초까지 늘었다. 두 흐름 모두 첫 tool submit에서 `candidates` 배열이 JSON 문자열로 이중 인코딩되어 validation에 실패한 뒤 Agent가 전체 의미 내용을 다시 생성했다. Candidate 카드가 첫 스캔에서 사용하지 않는 8개 criterion rationale와 risks까지 후보마다 요구한 점, Spec 뒤로가기가 새 Session과 Agent run을 즉시 시작한 점도 체감 대기를 키웠다.
- **결정:** 첫 round는 간결한 4~6개 Candidate로 줄이고, 사용자의 `MORE` feedback에서 기존 후보를 carry한 채 4~6개를 더해 누적 약 8~10개로 확장한다. 첫 스캔 계약은 상세 evaluation과 risks를 선택으로 두고 관심·비교 이후 지연 생성한다. Spec→Discovery는 local navigation만 수행해 이전 후보를 즉시 보여주며, 입력 수정과 `새 후보 받기`를 별도 명시 action으로 분리한다. 새 Discovery Session은 수정 입력을 저장하고, Agent slot은 project 장기 transcript 대신 Session ID와 expected revision으로 파생한다. MCP transport는 512 KiB 이하의 한 번 JSON-stringified candidate array만 복구한 뒤 기존 strict schema로 다시 검증한다. 60초 뒤 UI는 background 상태로 전환해 navigation을 풀되 durable Core 결과를 총 420초까지 관찰한다. prompt 1.1.1로 progressive 계약을 도입하고, 첫 target 재측정 77.2초에서 5개 카드 약 6 KiB와 round rationale 약 1 KiB가 남은 것을 확인해 1.1.2에서는 첫 round를 4개 우선으로 하고 카드 항목 수·자유 서술·round rationale·tool 전후 설명을 더 제한한다. 각 버전은 fixture/eval, contract와 UI/E2E를 함께 검증한다.
- **운영 목표:** Spec→Discovery 복귀 1초 이내·Agent 0회, 첫 4~6개 Candidate P95 60초, 단일 refinement와 Spec draft P95 45초, tool validation 재시도율 1% 미만을 초기 guardrail로 기록한다. provider 응답 보장은 아니며 target 관측에 따라 조정한다.
- **검토한 대안:** 매번 10개 full-detail Candidate 생성, Spec 뒤로가기 즉시 자동 재생성, project별 단일 장기 slot 유지, stringified payload를 Core schema에 영구 허용, 420초 동안 foreground 전체 잠금, validation 실패 때 모델 전체 재생성.
- **검증:** target Kiro Crew 0.3.0의 data-preserving update 뒤 설치 bundle hash, prompt 1.1.2, backend health와 기존 SQLite 보존을 확인했다. prompt 1.1.1은 첫 round 5개를 77.2초에 저장했고, 카드 항목과 round rationale을 더 제한한 1.1.2는 다른 unseen goal·Personal Need 없음 조건에서 4개를 47.4초에 atomic 저장했다. deterministic fixture/eval과 E2E도 함께 통과했다. 단일 47.4초 관측은 60초 guardrail 안이지만 P95 주장은 아니므로 반복 측정은 T21에 남긴다.
- **tradeoff:** 사용자가 전체 후보군을 보려면 한 번 더 선택해야 하고 상세 평가가 첫 화면에는 없으며 temporary slot 수가 늘어난다. 대신 첫 유용 결과와 되돌리기가 빨라지고, 상태는 Core에서 복원되며, transport 표현 오류와 의미 생성 실패를 분리할 수 있다. 첫 후보 품질과 model별 latency 비교는 동일 unseen fixture와 target 실측으로 계속 확인한다.

## 2026-09-03: T15 목록형 Discovery와 읽기 중심 Spec UI

- **상태:** 승인
- **맥락:** target 모바일 사용에서 2열 Candidate card는 8~10개 주제를 한눈에 비교하기 어렵고 작은 checkbox와 후보별 PIN/REJECT/SHRINK/EXPAND button이 선택의 위계를 흐렸다. 자유 조정 입력은 목록 아래에 있어 관심 후보를 고른 뒤 다시 의도를 표현하는 흐름과 떨어졌으며, Spec의 여러 작은 textbox는 초보 사용자에게 제품 범위를 이해하기보다 설계 문서를 직접 편집하도록 요구했다. 기존 짙은 녹색·serif 중심 styling도 Kiro 안의 앱으로서 일관성과 일상적인 제품 UI의 조작감이 부족했다.
- **결정:** 새 UI dependency를 추가하지 않고 SEED Design의 mobile-first list, semantic hierarchy, 큰 touch target과 명시적 selected state를 참고한다. Kiro의 대표 보라색 계열을 단일 brand token으로 사용하고 장식적인 serif·과도한 card nesting을 줄인다. Candidate는 한 열 목록과 24px check control로 보여주며 관심 후보를 local basket에 담는다. refinement composer와 선택 요약은 목록 위로 옮기고 SHRINK/EXPAND는 후보별 button 대신 placeholder 예시와 자연어 request로 제공한다. Spec은 direct edit form을 primary UI에서 제거하고 사용자·상황·성공의 story flow, MVP, 세 scope와 예상 Decision을 읽기 중심으로 시각화한다. 변경은 큰 자유 입력으로 Discovery Agent에 반복 요청하며 Core의 기존 direct update contract는 호환성을 위해 유지한다.
- **성능 목표:** 이번 UI 변경에서는 model/config를 바꾸지 않는다. 현재 설치 Agent가 `auto`이고 4개 후보 단일 관측이 47.4초이므로 무거운 특정 모델로 고정됐다고 단정하지 않는다. 다만 사용자 상호작용 turn은 각각 P95 30초 이내를 T15 완료 gate로 높이고 첫 유용 반응 3~5초를 지향한다. 동일 unseen 입력에서 `auto`와 승인된 빠른 model/config의 품질·latency를 비교하기 전에는 T15를 다시 완료 처리하지 않는다.
- **검토한 대안:** 기존 2열 card의 밀도만 낮춤, 모든 semantic feedback을 후보별 icon button으로 유지, Spec textarea 높이만 늘림, SEED React package와 styling pipeline을 즉시 도입, UI 변경과 동시에 model을 교체.
- **tradeoff:** SHRINK/EXPAND 같은 action의 발견성은 placeholder와 안내 문구에 의존하고 direct field-level 수정은 사라진다. 대신 첫 화면의 비교와 선택 책임이 명확해지고, 사용자는 세부 schema를 편집하지 않고 Agent와 대화하며 revision을 검토한다. SEED package 자체를 쓰지 않아 시각 원칙을 수동 검증해야 하지만 dependency·build 경계는 늘지 않는다.

## 2026-09-03: 선택 후보 refinement는 현재 목록을 좁힌다

- **상태:** 승인
- **맥락:** target에서 4개 중 2·3번을 checkbox로 담고 두 장점을 합쳐 달라고 요청했지만 다음 Round가 선택하지 않은 1·4번과 merge 결과를 함께 표시했다. Feedback target과 코멘트는 정확히 저장됐으나 기존 Core가 모든 unaffected Candidate 보존을 강제해, 관심 목록이 shortlist가 아니라 기존 목록에 결과를 추가하는 동작이 됐다. 또한 이전 10개 전체 생성에서 progressive 4개 starter로 바뀐 이유가 UI에 보이지 않아 데이터가 임의로 사라진 것처럼 느껴졌다.
- **결정:** target이 있는 `MERGE`, `REVISE`, `SHRINK`, `EXPAND`는 selection narrowing action이다. 다음 current Round에는 해당 결과와 같은 turn에서 명시적으로 pin된 Candidate만 포함하고, 선택하지 않은 이전 Candidate는 immutable revision/history에 보존하되 current 목록에서는 제외한다. 기존 목록을 유지해 넓히는 동작은 target 없는 명시적 `MORE`만 담당한다. prompt는 1.1.3으로 올리고 Core가 이 current-set 규칙을 deterministic하게 검증한다. 이미 old carry 규칙으로 저장된 narrowing Round는 UI projection에서 결과와 pin만 보여 다음 사용자 action 전에도 의도한 shortlist를 복원한다. 첫 Round 4개 우선 정책은 첫 응답 단축을 위해 유지하되 UI에서 빠른 첫 묶음과 8~10개까지 늘리는 action을 설명한다.
- **검토한 대안:** merge 결과를 기존 목록에 계속 추가, 담지 않은 Candidate에 자동 REJECT feedback 생성, 저장된 과거 Round 수정, 첫 Round를 다시 항상 10개로 복원.
- **tradeoff:** 한 번 좁힌 뒤 제외된 후보를 현재 목록에서 즉시 되살리는 별도 action은 없고 History 또는 새 후보 요청을 거쳐야 한다. 대신 checkbox basket과 결과 목록의 의미가 일치하고, historical provenance를 삭제하거나 소급 변경하지 않으며, `MORE`의 확장 의미와 refinement의 축소 의미가 분리된다.

## 2026-09-04: T15 Discovery는 Haiku와 ephemeral Core context를 우선 사용

- **상태:** 승인
- **맥락:** target `auto`의 첫 Candidate 4개는 47.4~50.9초, 첫 Spec은 47.5초로 T15 P95 30초 gate를 넘었다. 동일한 redacted unseen fixture의 Kiro CLI 2.21.0 live screening에서 `auto`는 Candidate를 41.6초에 저장했고 `claude-haiku-4.5`는 Candidate를 22.1초, Spec을 18.2초에 저장했다. `gpt-5.6-luna`는 Candidate field를 계약과 다른 이름으로 바꾸며 `submit_candidate_round`를 17회 재시도한 뒤 결과를 저장하지 못했다. Personal Need가 있는 두 번째 Haiku Candidate run은 36.4초였고 첫 round에서 생략해야 할 evaluation을 Candidate마다 8개씩 생성해 payload가 10.7KB로 증가했다. 모든 정상 저장에서 Core validation과 SQLite write는 밀리초 수준이었으며 매 turn 선행 `get_discovery_context` Agent 왕복은 약 9초였다.
- **결정:** T15 Discovery Crew Agent의 명시 model을 `claude-haiku-4.5`로 고정한다. App이 strict Core response로 이미 복원한 현재 aggregate를 current Round, current Candidate, pending user Feedback, selected Candidate와 current Spec만 남긴 bounded snapshot으로 만들고 app-owned temporary slot의 ephemeral context에 주입한다. snapshot의 session ID와 expected revision이 dispatch metadata와 일치하면 Agent는 정상 경로에서 `get_discovery_context`를 건너뛰고 바로 submit tool을 호출한다. context 주입 실패, 누락, ID/revision 불일치와 stale submit에서는 기존 read-only tool을 fallback으로 사용한다. Session/revision별 clean slot, Core optimistic revision, strict submit validation과 atomic Round/Spec 저장은 유지한다. 첫 screening에서 계약을 지키지 못한 Luna는 사용하지 않고 Terra 비교는 Haiku가 이후 품질 또는 P95 gate를 충족하지 못할 때만 수행한다.
- **검토한 대안:** `auto` 유지, Luna를 속도만 보고 채택, 과거처럼 한 slot transcript 재사용, Core validation 생략, context 조회 tool만 남기고 UI polling 최적화.
- **tradeoff:** Haiku는 hardest reasoning보다 짧은 구조화 Discovery 처리에 맞지만 Auto보다 의미 품질이 낮아질 수 있어 unseen fixture와 target 반복 측정이 필요하다. ephemeral context도 model input에는 포함되지만 별도 Agent 추론 왕복과 visible transcript 누적을 없앤다. Crew의 app context API를 사용할 수 없는 host에서는 fallback 조회 때문에 개선 폭이 줄어들며, 첫 round optional evaluation 과출력은 후속 phase-specific schema가 필요할 수 있다.

## 2026-09-04: T15 Discovery phase를 분리하고 MERGE metadata는 Core가 계산

- **상태:** 승인
- **맥락:** Haiku와 ephemeral context를 적용한 target 5회 측정에서 first Candidate와 first Spec의 보수적 P95는 각각 26.4초와 20.7초로 30초 gate를 통과했지만, 일반 `submit_candidate_round`로 전체 lineage를 다시 쓰는 MERGE는 한 번 52.7초까지 늘어 P95 gate를 넘었다. Candidate와 Spec이 한 Agent prompt/tool catalog에 같이 있고 MERGE Agent가 pending Feedback, parent reference, revision과 Round metadata까지 반복 생성하는 비용이 남아 있었다. 별도 Spec run에서는 Agent stream이 설명만 남기고 submit tool 없이 종료해 UI가 durable 결과를 오래 기다리는 실패도 확인했다.
- **결정:** canonical Discovery prompt는 v1.1.5 하나를 유지하되 build 시 ROUND·MERGE·SPEC의 bounded prompt와 Agent config로 분리한다. 각 Agent/MCP route는 `get_discovery_context`와 해당 phase의 submit tool만 허용한다. MERGE는 의미 Candidate 하나만 받는 `submit_candidate_merge`를 추가하고 role-bound adapter/Core가 pending user Feedback 하나, applied Feedback ID, parent revisions, Candidate revision과 Round metadata를 현재 durable context에서 계산한다. 일반 Round와 immutable lineage contract는 변경하지 않는다. Spec Agent는 설명보다 `submit_learning_spec`을 정확히 한 번 먼저 호출해야 하며, stream 종료 뒤 짧은 propagation grace에도 Core revision이 증가하지 않으면 UI는 장기 polling 대신 즉시 재시도 가능한 `TOOL_REJECTED` 상태를 표시한다.
- **검증:** target Kiro Crew 0.3.0에서 같은 redacted synthetic fixture를 최종 5회 실행했고 15개 phase 모두 ephemeral context가 주입되어 durable submit에 성공했다. nearest-rank P95는 first Candidate 26.564초, MERGE 21.044초, first Spec 22.900초였고 사용자 action부터 durable 결과까지도 26.582초, 21.066초, 22.919초였다. 실제 narrowed Candidate와 Spec의 strict contract, 두 parent lineage, 사람 Concept Necessity·scope review와 privacy-safe latency 배열을 v1.1.5 regression fixture로 고정했다.
- **검토한 대안:** 하나의 전체 Discovery Agent와 일반 Round schema 유지, Agent가 모든 stable metadata를 계속 생성, preview/staged Candidate 저장 계약 도입, 더 큰 모델로 교체, tool 없는 Spec 응답을 420초까지 polling.
- **tradeoff:** 설치 package에 세 Agent와 세 고정 MCP route가 생기지만 각 surface의 권한과 prompt 크기가 작아지고 MERGE 품질 책임과 stable metadata 책임이 분리된다. 5표본 P95는 T15 gate에 쓰는 보수적 회귀일 뿐 장기 분포를 대표하지 않으므로 T21에서 표본을 늘린다. 모든 구간이 30초 안이어서 preview/lazy enrichment 계약 변경은 하지 않으며 3~5초 first-useful 목표는 후속 metric으로 남긴다.

## 2026-09-04: T15 stale UI·실행 복원·Spec revision 보장

- **상태:** 승인
- **맥락:** 실제 사용자 재검증에서 업데이트 전에 열린 UI가 제거된 legacy Discovery Agent를 호출했고, 화면 이탈 뒤에는 실행 표시가 사라져 같은 Session이 처음부터 시작하는 것처럼 보였다. 기존 Spec 수정 두 번은 Agent가 설명만 반환하고 submit tool을 호출하지 않아 Core Spec revision이 1에 머물렀다. Crew slot의 긴 170초 관측은 model 추론만이 아니라 범용 file permission 대기까지 포함했다.
- **결정:** UI가 모든 Core 요청에 protocol v2를 보내고 backend는 불일치 요청을 Agent dispatch 전에 409로 차단한다. app version과 UI entry filename을 함께 올려 새로 연 화면이 갱신 bundle을 사용하게 한다. 화면 재진입 때 current Session/revision/phase에서 파생한 exact slot을 조회해 `running`이면 중복 dispatch 없이 Core polling만 복원하고, 완료됐지만 durable 결과가 없으면 저장 상태 기반 재시도 또는 수정문 재입력을 명시한다. prompt v1.1.6의 정상 SPEC Agent/MCP는 주입된 Core snapshot과 `submit_learning_spec`만 사용하고, context 주입이 불가능할 때만 별도 recovery Agent에 read tool을 노출한다. Spec stream이 tool 없이 정상 종료하면 최신 Core snapshot에서 같은 수정 의도를 한 번만 자동 재제출하며 두 번째 실패는 현재 revision을 유지한 오류로 표시한다. 성공은 Agent 문장이 아니라 durable Spec revision 증가로만 판정한다.
- **검증:** Chromium E2E에서 stale protocol 차단, 실행 중 slot 재진입과 중복 dispatch 0회, 첫 Spec revision 1, 정상 수정 revision 2, 첫 no-tool 뒤 bounded recovery revision 2를 검증했다. target raw Haiku 수정 2회 중 1회는 no-tool이었고 정상 수정은 23.384초에 revision 2를 저장했다. 같은 fixture에서 SPEC만 Terra는 첫 Spec 43.257초, Auto는 첫 Spec 39.240초·수정 36.027초로 30초를 넘겨 Haiku를 유지한다.
- **검토한 대안:** 구 UI의 실패를 일반 host 오류로 처리, 화면 재진입마다 새 Agent dispatch, project 단위 장기 slot 재사용, 정상 SPEC에도 context read tool 유지, 설명 응답을 수정 성공으로 표시, no-tool 종료를 420초 동안 계속 polling, Spec에 Terra 또는 Auto 사용.
- **tradeoff:** 네 번째 recovery Agent와 protocol 호환성 경계, Spec에 한정된 최대 1회 자동 재제출이 생긴다. 대신 stale 실행과 중복 요청을 빠르게 분리하고 Agent의 말과 durable 상태가 어긋나는 성공 표시를 막는다. 자동 복구가 필요한 예외 turn은 30초를 넘을 수 있고 first Candidate 49.310초 outlier도 관측됐으므로 T15 성능 gate는 완료 처리하지 않는다.

## 2026-09-04: T15 최종 사용자 승인과 MVP 재진입 경계

- **상태:** 승인
- **맥락:** 사용자는 T15 UI/UX 승인 테스트에서 Spec을 revision 2로 수정하고 Builder 화면까지 이동하는 실제 흐름을 이미 확인했다. 남은 항목으로 제시한 실행 중 화면 이탈·재진입 복원은 MVP에서 요구하지 않으며, 성능은 최종 설치본으로 한 번 더 확인한 뒤 승인 결과와 합쳐 종료하기로 했다.
- **결정:** 저장 완료된 Project/session/Task/Decision/Context의 durable 복원은 기존 T14 경계로 유지한다. 반면 진행 중 Agent stream과 progress를 화면 재진입 시 다시 연결하는 기능은 MVP acceptance에서 제외한다. 이미 구현된 exact-slot 조회와 중복 dispatch 방지는 방어 기능으로 남기지만 release 보장을 주장하지 않는다. T15 성능은 최종 v1.1.6·Haiku target 대표 실행 한 번에서 first Candidate, 단일 MERGE refinement와 첫 Spec이 각각 30초 이내이면 통과로 판정하고, 사용자의 UI/UX 및 Spec revision 2→Builder 승인을 최종 human acceptance로 사용한다. 장기 P95 표본은 T21에서 수집한다.
- **검토한 대안:** in-flight 재진입을 T15 blocker로 유지, 구현된 복원 기능 제거, 5회 이상을 다시 수행한 뒤에만 T15 종료, 49.310초 과거 outlier만으로 즉시 실패 확정.
- **tradeoff:** MVP는 앱 이탈 중 진행 표시의 연속성을 보장하지 않으며 단일 대표 성능 실행은 장기 tail latency를 증명하지 않는다. 대신 저장된 결과의 정합성과 핵심 Discovery→Spec→Builder 흐름에 완료 판단을 집중하고, 더 넓은 성능 분포는 T21 release 검증에서 다룬다.
- **재검증:** 최종 설치본의 대표 실행은 MERGE 13.226초, 첫 Spec 18.860초, Spec 수정 23.097초에 durable 저장됐고 수정 결과는 revision 2였다. first Candidate만 50.132초로 30초 gate를 넘었으므로 T15는 완료하지 않으며 잔여 범위는 첫 Candidate latency로 좁힌다.

## 2026-09-04: T15 First Candidate preview와 background enrichment

- **상태:** 사용자 승인 및 target 검증 완료
- **맥락:** 사용자는 가능하면 상세 Candidate 10개를 유지하되 6개 축소, 설명 축소와 다른 구조까지 같은 target에서 비교하도록 승인했다. 현재 Haiku 4개 상세 baseline은 50.132초였다.
- **결과:** Haiku 10개 compact는 완전한 상세 필드와 고유 제목·상호작용 10개를 33.940초에 저장했지만 gate를 넘었다. Luna 6개 exact-envelope는 성공 시 14.420~16.063초였으나 4회 중 3회만 저장됐고 Luna 10개도 19.991초 성공 뒤 no-durable 실패가 재현됐다. Haiku 4개 ultra와 6개 compact는 잘못된 tool 표현 또는 envelope로 저장되지 않았다. initial-only 최소 prompt는 최대 70.837초였고 저장 실패도 남았다. Haiku 5×2 병렬은 첫 시도 두 batch가 22.727초·24.561초였지만 10개 중 4개 방향이 의미상 겹쳤으며, partition 지시 재시험은 한 batch가 저장되지 않았다. Luna+Haiku hedge도 두 호출 모두 저장되지 않아 43.194초에 실패했다.
- **판정:** 기존 single Round contract에서 개수, 설명량, prompt 길이와 model만 바꾸는 저위험안 중 latency와 durable reliability를 함께 충족한 것은 없다. production은 Haiku v1.1.6으로 복원했고 실험 variant를 직접 채택하지 않는다.
- **결정:** prompt v1.1.7에서 10개 lightweight preview를 작은 전용 contract로 먼저 durable 저장하고, Core가 발급한 Candidate identity와 final Round identity를 고정한다. 두 background enrichment run은 각각 preview 1~5와 6~10의 완전한 Candidate 의미 필드만 제출하며 새 후보를 발명하거나 preview 제목·핵심 방향을 바꿀 수 없다. 각 batch는 독립적으로 idempotent 저장하고 마지막 누락 batch가 도착한 transaction에서 기존 ProjectCandidate revision 10개와 Candidate Round를 원자적으로 materialize한 뒤에만 Session revision을 올린다. preview를 보는 동안 checkbox basket은 사용할 수 있지만 SELECT·refinement·Spec은 complete Round 뒤에 허용한다.
- **복구:** 구현 전 안정 상태를 git commit `09edb18`로 보존한다. SQLite 변경은 기존 Candidate·Round table을 수정하지 않는 additive preview/enrichment table과 자동 검증 backup migration으로 제한한다. preview 전 실패는 preview만, 일부 enrichment 실패는 누락 batch만 재시도한다. 사용자가 기존 방식으로 전환하면 같은 Session revision에서 v1.1.6-compatible atomic `submit_candidate_round`를 허용하고, 그 뒤 도착한 staged 결과는 revision/round existence 검사로 거절한다. 새 UI가 staged 상태를 읽지 못하더라도 기존 저장 구조와 complete Round는 손상되지 않는다.
- **tradeoff:** 사용자는 10개 제목·핵심 방향을 먼저 볼 수 있고 전체 상세도 결국 받지만 일부 행은 잠시 loading 상태가 된다. Candidate preview 상태, staging/finalize transaction, enrichment 실패·재시도와 UI projection이 새로 필요하다. background run 두 개는 호출 수를 늘리지만 서로 다른 고정 identity만 처리해 중복 생성 위험을 줄이고, 실패 범위를 절반으로 제한한다. 이 구조의 실제 preview latency와 최종 수렴 시간은 target 설치본에서 별도로 검증한다.

## 2026-09-05: T15 compact preview·순차 enrichment로 최종 gate 통과

- **상태:** 사용자 조건부 승인에 따른 완료
- **맥락:** v1.1.7 preview는 29.595초와 31.723초로 30초 경계에서 흔들렸고, 두 enrichment를 동시에 실행하면 한 batch가 durable submit 없이 끝나는 편차가 재현됐다. v1.1.8은 preview prompt와 출력 길이를 줄여 21.635초에 10개를 저장했지만 순차 enrichment 완료에 217.934초가 걸렸다. 사용자는 최종 성능 gate를 한 번 더 실행해 통과하면 기존 UI/UX·Spec revision 2→Builder 승인과 합쳐 T15를 승인하도록 했다.
- **결정:** prompt v1.1.9와 `claude-haiku-4.5`를 유지한다. PREVIEW는 10개 제목·핵심 방향을 보존하되 문장과 tag 수를 제한한다. ENRICHMENT는 FIRST 저장 확인 뒤 SECOND를 시작하고, ephemeral context에는 Preview Round identity와 요청된 5개만 넣는다. 상세 의미 필드는 유지하면서 대표 사용자 1명, 핵심 개념·MVP 기능 2개, scope별 1개로 제한한다. preview·각 batch의 독립 idempotency, 부분 저장, 누락 batch 재시도, legacy atomic fallback과 additive migration은 유지한다.
- **검증:** 최종 Kiro 설치본의 unseen synthetic WebRTC 입력에서 preview 10개는 23.241초에 durable 저장됐고 FIRST 5개는 107.273초, complete Round는 enrichment 시작 후 148.371초에 저장됐다. identity 10개와 Session revision 1→2가 보존됐으며 v1.1.8보다 background 완료가 약 31.9% 단축됐다. 기존 MERGE 13.226초, 첫 Spec 18.860초와 Spec 수정 23.097초를 합쳐 T15 대표 interaction gate는 모두 30초 이내다. 설치 전후 기존 56 project·57 Discovery Session·23 Learning Spec과 SQLite `quick_check=ok`가 보존됐고 설치 Agent/UI hash가 source package와 일치했다.
- **복구:** 구현 전 기준점은 `09edb18`, staged storage·UI 기준점은 `9866670`이다. 기존 Candidate/Round schema와 atomic fallback은 제거하지 않았고, migration은 additive다. preview 전 실패는 preview만, 일부 enrichment 실패는 누락 batch만 다시 실행한다. 늦은 staged submit은 current revision/round 검증에서 거절된다.
- **tradeoff:** 첫 유용 목록은 23초에 나타나 checkbox와 basket을 쓸 수 있지만 SELECT·refinement는 complete Round까지 최종 관측 148초 잠긴다. 이는 T15가 정의한 background 수렴 조건에는 부합하지만 이상적인 3~5초 상호작용은 아니다. T21에서 장기 P95, background 완료 분포와 선택 후보 우선 상세화 가능성을 평가한다.

## 2026-09-05: Background 완료 시 Candidate 검토 상태 유지

- **상태:** 사용자 승인
- **맥락:** 사용자가 enrichment 중 준비된 preview 상세를 펼친 뒤 complete Round가 materialize되면 preview 카드와 완성 Candidate 카드의 React component type이 바뀌며 native `details.open` 상태가 초기화됐다. Candidate와 basket identity는 유지됐지만 펼쳐 본 항목이 닫혀 검토 맥락이 끊겼다.
- **결정:** 펼침 상태를 개별 카드 DOM이 아니라 `DiscoveryWorkspace`의 Candidate ID·revision key 집합으로 제어한다. Preview revision 1과 materialized Candidate revision 1은 같은 key를 사용하므로 표현이 교체돼도 열린 상태를 이어받는다. 새로운 Candidate revision은 별도 key로 취급한다.
- **검증:** 390x844 Chromium E2E에서 FIRST enrichment 뒤 첫 preview 상세를 펼치고 SECOND 완료·10개 Candidate 전환 뒤 같은 Candidate의 완성 상세가 열린 상태임을 검증했다. 전체 `pnpm check`의 unit 2개, integration 189개, eval 17개, smoke 6개와 Chromium E2E 11개가 통과했다. versioned UI를 0.1.3으로 올려 data-preserving Kiro update를 수행했고, 설치 전후 58 project·59 Discovery Session·24 Learning Spec과 SQLite `quick_check=ok`가 유지됐다. 설치 UI hash가 source package와 일치하고 Gateway의 실제 Core read 요청이 HTTP 200으로 성공했다.
- **tradeoff:** 펼침 상태는 현재 앱 화면의 local UI state이므로 완전한 페이지 이탈·재진입까지 durable 복원하지 않는다. 이는 in-flight UI 재연결을 MVP 밖으로 둔 기존 결정과 일치한다.

## 2026-08-24: 구현 세부 선택 위임

- **상태:** 승인
- **맥락:** 사용자는 제품 방향과 기본 기술안을 승인했고, 호환성에 좌우되는 세부 library와 실험 수치는 구현 과정에서 근거를 남겨 선택하도록 위임했다.
- **결정:** package manager와 local-first MVP 경계는 승인한다. runtime schema·SQLite/migration library는 T02, Code 중심 최소 surface는 T01, eval reviewer/fixture는 T07, pilot 규모는 T23에서 Agent가 비교 근거와 결과를 결정 기록에 남긴다. 사용자 연구는 명시적 동의, secret redaction, local 저장과 익명화 결과만 평가·제출에 사용하는 원칙을 지킨다.
- **검토한 대안:** 구현자가 묵시적으로 선택, 모든 선택을 지금 고정, 라이브러리 선택을 제품 Spec에 포함.
- **tradeoff:** 짧은 승인 단계가 추가되지만 추론한 가정을 확정 요구로 오인하는 것을 막는다.

## 2026-09-05: T16 Builder slot workspace 일회성 전달 경계

- **상태:** 사용자 승인
- **맥락:** T10은 Core가 canonicalize한 generated workspace를 Builder slot에 첫 message 전에 연결하고 native tool을 그 workspace에 한정하도록 요구한다. T16 capability gate에서 target과 현재 설치본의 Crew route를 대조한 결과, 이미 생성된 slot의 project directory는 browser App API가 `POST /api/chat/slots/{slot}/project`에 절대 directory를 보내야 바뀐다. Crew가 시작한 app backend에는 app data root와 proxy 검증 secret은 주어지지만, backend가 사용자 Crew gateway에 역방향으로 같은 mutation을 요청할 지원 endpoint나 credential은 제공되지 않는다. 상대 `projects/<projectId>`는 gateway process의 working directory에서 해석되므로 Core workspace를 가리키지 않으며, 첫 turn 뒤 Builder가 스스로 바꾸는 방식은 T10의 pre-message binding을 위반한다.
- **결정:** Core/backend가 project ID와 current Task를 다시 검증하고 canonical workspace를 계산한 뒤, browser에 일회성 binding descriptor로 전달한다. UI는 이 값을 함수의 local 변수 이외에는 보관하지 않고 고정 Crew project endpoint에 즉시 전송하며 React state, DOM, URL, localStorage, log와 durable Core state에는 기록하지 않는다. endpoint 성공과 반환된 canonical path 일치를 확인한 뒤에만 Builder message를 보낸다. stream과 오류에는 기존 redaction을 적용한다. 이 호환성 경계와 Decision lifecycle·Completion Report를 추가하므로 UI protocol은 v4, app bundle은 0.2.0으로 올린다.
- **검토한 대안:** 지원되는 Crew backend→gateway binding capability가 생길 때까지 T16 Builder 실행을 보류, 상대 path를 전송, Builder 첫 turn에서 project 변경, UI가 app-data root를 추측, native tool guard 완화.
- **tradeoff:** 절대 local path가 잠깐 browser memory와 host request payload를 통과해 backend-only 경계보다 약하다. 대신 현재 Crew API에서 pre-message binding과 native tool confinement를 둘 다 유지할 수 있다. browser는 임의 path를 선택하지 못하고 Core가 해당 Project의 current Task와 workspace를 검증해 반환한 값만 사용하며, read-only Helper slot에는 이 경로를 전달하지 않는다.

## 2026-09-05: T16 target Builder policy와 versioned session 복구

- **상태:** 사용자 승인 및 target 검증 완료
- **맥락:** 실제 Project Builder 실행에서 첫 session은 app-owned Core MCP가 없었고, Agent definition을 갱신한 다음 session도 Kiro shell `deniedCommands`의 `*../*`가 단순 `pnpm test`까지 거절했다. PreToolUse hook process의 cwd와 host event의 top-level `cwd`도 달랐다. 이를 고친 뒤에는 npm으로 설치된 generated workspace를 pnpm 11이 다시 점검하면서 esbuild build 승인을 요구했고, `onlyBuiltDependencies`는 `allowBuilds` placeholder로 대체됐다. 이미 생성된 Crew slot은 Agent resource를 고쳐도 같은 runtime을 계속 사용하며, 중단된 MCP turn 뒤 follow-up은 새 model turn이 아니라 status만 반환할 수 있었다.
- **결정:** Builder slot key에 revision을 넣고 현재 revision은 fresh session으로 dispatch하되 legacy와 모든 이전 revision history를 redaction 후 병합한다. filesystem guard는 host event `cwd`가 app-owned generated projects root의 정확한 단일 Project child인지 realpath로 검증한다. Kiro `deniedCommands`는 비우되 `denyByDefault`, 좁은 host allowlist와 pre-tool exact command/path guard를 유지한다. 기존 test/run/install 외 lifecycle 명령은 저장소에서 이미 승인된 esbuild의 정확한 `pnpm rebuild esbuild` 하나만 허용한다. pnpm 11 generated workspace에는 사용자가 승인한 `allowBuilds.esbuild: true`를 기록하고 대체된 `onlyBuiltDependencies`는 남기지 않는다. transport chunk·token metric은 UI stream에서 제거하고 자유 follow-up composer를 제공한다.
- **검증:** current v6 target session에서 Core Task/Context를 읽고 generated workspace만 수정했다. esbuild postinstall 뒤 같은 `pnpm test` 실행에서 Vitest 2 files·20 tests·exit 0을 직접 관찰했으며, 기존 applied Decision과 Context v4를 참조한 Completion Report가 Task revision 3 `COMPLETED`로 저장됐다. Chrome completion surface는 실제 구현 기능과 자동 test, 외부 typecheck/build를 구분하고 result descriptor의 상대 workspace만 표시했다. 최종 `pnpm check`의 package/app integration 197개, eval 17개, smoke 6개와 Chromium E2E 11개가 통과했다. 설치된 package 28개 hash가 모두 source와 일치하고 SQLite `quick_check=ok`, 기존 58 project·59 Discovery Session·24 Learning Spec이 유지됐다.
- **검토한 대안:** shell 권한 전체 허용, `*../*` glob을 유지한 채 외부 test 결과만 믿음, Core workspace가 아닌 hook process cwd 사용, 기존 slot history 삭제, 중단된 slot 무한 재사용, `dangerouslyAllowAllBuilds` 또는 모든 dependency build 허용.
- **tradeoff:** Agent resource 또는 오염된 runtime을 복구할 때 새 current slot이 생겨 Crew session 수가 늘고 history 병합 비용이 추가된다. 대신 과거 사용자 가시 기록을 보존하면서 새 정책을 확실히 적용하며, shell과 lifecycle 권한은 exact generated workspace와 승인된 명령에 계속 한정된다. npm audit의 개발 의존성 취약점 5건과 실제 다중 terminal TCP 확인은 결과 limitations로 남는다.

## 2026-09-05: T16 conversation-first native Agent Session

- **상태:** 사용자 승인 및 target 검증 완료
- **맥락:** target Chrome 검토에서 T16 UI가 실제 Crew session을 별도 event log와 plain paragraph로 평탄화해 Codex CLI 같은 연속 대화 경험을 잃었다. 그 결과 Builder의 fenced diff와 `[OPTIONS: ...]` marker가 그대로 보였고, Helper는 화면에도 Core용 240자 summary를 사용해 장문 답변이 중간에서 끊겼다. 완료 view는 transcript 전체를 교체했다. 같은 native Kiro session에서는 Markdown/diff/tool/follow-up renderer와 persistent composer가 정상 동작했다.
- **결정:** Agent Mode의 primary surface는 installed Crew host의 실제 structured slot session과 native `ChatMessageList` renderer로 바꾼다. app adapter가 slot payload의 모든 문자열을 먼저 redaction하고 host renderer에 전달하며 같은 slot에 연결된 persistent composer를 제공한다. Builder와 Helper를 각각 독립 slot로 표시하고 app은 Core 기반 compact status, Decision intervention과 completion result만 주변에 주입한다. host component는 공개 SDK 문서에 없는 installed capability이므로 `NativeChatSession` 하나에 격리하고, capability 실패 시 plain text pseudo-chat으로 조용히 퇴행하지 않는다. visible message에는 자연어만 보내고 Core identifier와 실행 지시는 ephemeral slot context로 분리한다. Helper full response는 native session이 표시하며 Core에는 독립된 240자 이하 summary를 기록한다. 완료 뒤에도 transcript를 유지한다. 진행 중 turn은 exact Vibe Helper slot에만 허용된 stop endpoint로 중지하고 transport의 raw stop event는 자연어 상태로 정규화한다. Builder shell은 generated workspace의 canonical path, `denyByDefault`, host allowlist와 pre-tool exact guard를 유지하면서 실제 build에 필요한 `execute_bash`만 Agent allowed tools에 포함한다.
- **검증:** target KiroCrew에서 Helper 장문 응답의 마지막 문장까지 표시되는 것을 확인했고, structured Builder transcript는 `[OPTIONS]`와 fenced diff 원문 대신 native option/diff control로 렌더링됐다. 두 실제 Decision을 선택·적용한 Builder가 generated WebRTC project에서 TypeScript typecheck와 Vitest 4 files·19 tests를 통과했으며, 허용된 npm 명령은 실행되고 pipe가 포함된 shell 명령은 거절됐다. Core Completion Report가 Task revision 3 `COMPLETED`로 저장됐고 SQLite `quick_check=ok`를 확인했다.
- **검토한 대안:** 기존 event log에 Markdown parser만 추가, `[OPTIONS]` 정규식 제거만 적용, Helper summary 길이만 확대, 완료 view 유지, native session 전체를 app 고유 renderer로 복제.
- **tradeoff:** undocumented host export 변화에 대한 capability regression과 test SDK shim이 필요하다. 대신 Kiro가 이미 제공하는 대화·diff·tool·option semantics를 그대로 사용해 이중 renderer의 형식 drift를 없애고, Vibe Helper 고유 UI는 실제 판단과 학습 맥락에만 집중한다.

## 2026-09-05: Discovery background enrichment는 사용자 진행을 막지 않음

- **상태:** 사용자 승인 및 target 검증 완료
- **맥락:** durable preview는 약 23초에 보이지만 기존 UI는 10개 전체 enrichment가 끝날 때까지 SELECT와 refinement Agent 호출을 막아 최종 관측 148초 동안 사용자의 판단을 실행할 수 없었다. background는 선택지를 더 설명하기 위한 보조 작업이지 사용자의 판단 완료 여부를 결정하는 필수 단계가 아니다.
- **결정:** complete Round 전에도 preview를 선택하거나 refinement 대상으로 참조할 수 있다. 이때 참조된 identity만 `SELECTED` enrichment로 보강하고 Core가 해당 후보만 포함한 partial Candidate Round를 materialize한 뒤 같은 user-authored Feedback을 적용한다. 이미 보강된 후보는 재사용하며 나머지 background batch를 기다리지 않는다. 늦은 background submit은 current Session revision과 Round 검증에서 거절한다.
- **검증:** Application·MCP contract와 Chromium E2E에서 background 중 SELECT·refinement 활성, 1개 preview partial Round, late background stale rejection을 확인했다. 설치본 v1.2.0 Haiku 실제 실행은 preview 10개를 20.037초, 선택 후보 1개 enrichment를 10.525초에 저장했고 나머지 9개 없이 273ms의 Core 적용으로 Session revision 2 `SELECTED`, Project `SPEC_REVIEW`가 됐다.
- **검토한 대안:** 전체 10개 enrichment 완료 유지, preview 의미만으로 Candidate를 Core가 합성, SELECT만 허용하고 refinement는 차단.
- **tradeoff:** 선택 시 짧은 Agent turn이 추가될 수 있고 partial Round 뒤 나머지 상세는 current 목록에 나타나지 않는다. 대신 Agent-authored 의미와 user-authored 판단 provenance를 분리하면서 사용자가 충분히 안다고 판단한 시점에 즉시 진행할 수 있다.

## 2026-09-05: Agent transcript는 viewport 안에서 독립 스크롤

- **상태:** 사용자 승인 및 구현 검증 완료
- **맥락:** native message list에 overflow는 있었지만 상위 Agent pane 높이가 정해지지 않아 긴 Builder 대화가 pane과 페이지 전체를 계속 늘렸다.
- **결정:** Builder와 Helper pane을 viewport 기반의 bounded flex container로 만들고 transcript만 `min-height: 0`과 vertical overflow를 가진 유일한 가변 영역으로 둔다. header, Vibe Helper Decision/completion intervention과 composer는 같은 pane의 고정 sibling으로 유지한다.
- **검증:** Chromium E2E에서 24개 진행 문장, native diff와 option이 있는 transcript의 `scrollHeight > clientHeight`, pane 높이 760px 이하와 composer가 pane 안에 계속 보이는 것을 확인했다. desktop conversation-first 수직 흐름과 390×844 Builder/Helper tab 회귀도 함께 통과했다.
- **검토한 대안:** 전체 페이지 스크롤 유지, transcript 고정 pixel 높이, 메시지 virtualization을 즉시 도입.
- **tradeoff:** 작은 화면에서 transcript가 짧아질 수 있으나 composer와 판단 UI가 계속 보이고, virtualization 없이도 현재 대화 규모의 레이아웃 성장을 차단한다.

## 2026-09-05: T16 living Spec과 composer-first Builder UX

- **상태:** 사용자 승인 및 target 검증 완료
- **맥락:** 실제 최신 project의 light theme에서 native transcript 배경이 고정 dark인데 글자는 light theme color를 사용해 읽을 수 없었다. Helper는 confirmed Learning Spec의 PostgreSQL 14+ 요구와 focused Decision 유무를 사용자 권한의 상한처럼 해석해 SQLite 질문을 현재 판단 범위 밖으로 밀어냈다. Builder surface도 자유 대화보다 Decision/button control이 더 커 Codex CLI 같은 vibe-coding 흐름을 방해했다. Chrome 재검토에서는 과거 Decision application의 literal `\\uXXXX`도 화면에 노출됐다.
- **결정:** Learning Spec은 provenance가 있는 “확정된 초기 합의”이지만 최신 명시적 사용자 요청으로 언제든 revision할 수 있는 living agreement로 정의한다. `AGENT_SUPPORT`, `EXCLUDED`, current/focused Decision은 Helper가 설명할 수 있는 범위나 사용자가 바꿀 수 있는 범위를 제한하지 않는다. Helper v1.1.0은 실제 Spec과 구현 상태를 읽어 tradeoff와 전환 비용을 설명하고 Builder에 보낼 자연어를 제안하며, Builder v1.2.0은 안전 경계 안에서 가역 변경은 수행하고 비용·privacy·배포 의미가 큰 변경만 Decision으로 되묻는다. UI는 native transcript와 persistent composer를 primary surface로 유지하고 compact Decision·추천 답장·Helper 추천 질문을 composer 바로 위에만 주입한다. pending Decision 중 Builder 자유 입력은 exact user text를 visible follow-up으로 보내면서 Core에는 `CUSTOM` Resolution으로 저장한다. light/dark native chat color는 app theme token으로 통일하고 legacy Unicode escape는 durable 값을 수정하지 않는 표시 전용 decoder로 복원한다. 새 prompt/runtime은 Builder v7·Helper v2 slot로 시작하고 모든 prior revision의 redacted structured history를 병합한다.
- **검증:** prompt fixture는 confirmed PostgreSQL을 가진 project에서 SQLite 재검토 권한, project-specific tradeoff, Builder handoff와 meaningful-impact Decision 경계를 검증했다. 실제 Kiro Helper는 최신 project context를 1회 읽고 41초·0.45 credits에 “Spec의 PostgreSQL은 확정된 초기 합의지 못 건드리는 규칙이 아니다”라고 답한 뒤 SQLite/PostgreSQL 장단점, 현재 adapter 전환 비용과 Builder 전달 문장 두 가지를 끝까지 표시했다. Chrome에서는 light theme transcript 대비, Builder/Helper 독립 스크롤, 추천 UI→composer 순서, 자유 입력과 legacy Unicode 복원을 확인했다. 자동 검증은 unit 2개, package/app integration 201개, eval 20개, smoke 6개와 Chromium E2E 12개가 통과했다. app 0.2.3 보존 업데이트 전후 60 project·61 Discovery Session·26 Learning Spec·5 Task·2 Completion Report와 SQLite `quick_check=ok`가 동일했고 설치 UI/backend/Builder/Helper hash가 package와 일치했다.
- **검토한 대안:** confirmed Spec을 변경하려면 Discovery로 강제 복귀, Helper가 focused Decision에만 답변, 모든 선택을 버튼/form으로만 제출, light mode에서도 terminal black 고정, 과거 structured transcript 폐기, literal escape를 Core storage migration으로 일괄 수정.
- **tradeoff:** 사용자 자유 입력은 predefined option보다 넓으므로 `CUSTOM` Resolution의 실제 영향은 Builder가 다시 검증하며 이유 없는 click/text만으로 이해 Evidence를 높이지 않는다. prompt revision마다 새 native slot이 생기고 history merge 비용이 추가된다. 과거의 잘못된 Helper 답변도 provenance 때문에 남아 있지만 새 답변과 이후 turn은 수정된 정책을 사용한다. display decoder는 literal Unicode escape만 복원하므로 저장된 과거 payload와 audit trail은 바뀌지 않는다.

## 2026-09-06: T17 Evidence Trace와 개인화 provenance 경계

- **상태:** 사용자 승인
- **맥락:** T13은 Concept Ledger와 raw Evidence Trace 조회를 구현했지만 UI용 응답 계약과 화면이 없고, Discovery aggregate는 현재 Project에 연결된 Ledger만 반환해 새 Project가 과거 Evidence를 사용할 수 없다. Helper도 관련 Ledger를 읽을 수 있으나 특정 turn에 어떤 근거가 제공됐는지 durable하게 남지 않는다. Agent가 실제로 어떤 입력을 내적으로 사용했는지는 자기보고만으로 확정할 수 없다.
- **결정:** UI에는 저장소 내부 Trace를 그대로 노출하지 않고 Concept State, 지지 Evidence와 Episode, Core의 거절·보류 이유, 분석 no-evidence/failure와 열린 확인 항목을 조립한 strict response를 제공한다. Personalization은 local single-user Ledger에서 accepted Evidence만 bounded retrieval하고, Helper에는 질문·Context·Decision 관련 Concept 최대 5개를, Discovery에는 과거 Project의 최근 Ledger를 흥미·실용성 다음의 tie-break 자료로 제공한다. 각 Agent-bound context에는 evidence·episode·source Project reference가 있는 Core-owned personalization basis를 넣고, immutable Personalization Trace에는 `제공된 근거`와 명시적 no-evidence fallback을 저장한다. UI와 문서는 이를 Agent가 반드시 활용했다는 인과 주장으로 표현하지 않으며 실제 영향은 동일 입력의 evidence 있음/없음 A/B fixture와 live regression으로 검증한다. Builder 관찰은 `OBSERVED` 이상 이해로 해석하지 않고 rejected/directly-led Proposal은 개인화 basis로 사용하지 않는다. State percentage와 점수는 만들지 않는다.
- **검증:** Helper v1.2.0·Discovery v1.3.0과 동일 질문 A/B fixture가 no-evidence 추측 금지, source Project/Episode/Evidence 연결과 흥미·실용성 우선순위를 통과했다. target Crew 실제 Helper의 no-evidence turn은 34초·0.40 credits에 과거 경험을 만들지 않았고, evidence-aware turn은 35초·0.53 credits에 과거 WebRTC `OBSERVED` 기록을 현재 업로드 상태 전이와 연결하되 숙달로 과장하지 않았다. 실제 검토에서 발견한 restore 시 false Discovery trace, 연속 Helper turn의 Episode correlation 충돌과 Evidence panel cache는 dispatch 직전 prepare, Episode/turn correlation 분리와 조회 갱신으로 수정하고 회귀 test를 추가했다. app 0.3.2 보존 업데이트 후 설치 artifact hash·backend health와 SQLite `quick_check=ok`, 기존 61 Project·62 Discovery Session·27 Learning Spec·6 Task·13 accepted Evidence·13 Ledger·2 Completion Report 보존을 확인했다. pre-fix probe의 불일치 Trace 1개는 immutable 이력을 지키기 위해 삭제하지 않고 Project-scoped query에서 제외한다. standalone live runner는 Kiro CLI 2.21.1 ACP `new_session` 단계에서 외부 종료되어 mock으로 대체하지 않았으며 product Crew 경로로 live 결과를 검증했다.
- **검토한 대안:** 현재 Project Ledger만 유지, 전체 Ledger·대화 원문을 Agent에 전달, Agent가 사용한 Evidence ID를 자기보고하게 함, personalization provenance를 저장하지 않고 현재 Ledger만 재조회, confidence score나 교육용 remediation ranking 도입.
- **tradeoff:** immutable Trace와 additive migration, context/query DTO 및 UI가 늘어나지만 나중에 Ledger가 바뀌어도 어떤 근거가 turn에 제공됐는지 재현할 수 있다. bounded recent retrieval은 embedding 없이 의미적으로 먼 Concept를 포함할 수 있으므로 Discovery prompt가 자연스러운 관련성 없이는 사용하지 않도록 하고 T17 human review와 T24 ablation에서 품질을 검증한다.

## 2026-09-06: T18 Campus Drop Golden Path 실행·분석·Final Upgrade 경계

- **상태:** 사용자 승인
- **맥락:** T08~T17은 Discovery, Builder, Helper, Evidence와 개인화 Core를 갖췄지만 제품 UI는 Evidence Analyst의 durable job을 실제 Agent slot으로 소비하지 않고, Builder 결과 열기는 완료된 workspace를 확인해 `READY`만 반환한다. `FINAL_UPGRADE` Episode type도 정의되어 있으나 사용자가 Evidence를 바탕으로 다음 개선을 선택하고 두 번째 Builder Task로 이어지는 경로는 없다. Campus Drop은 이 분리된 조각을 실제 TypeScript 결과 실행까지 연결하는 Golden Path fixture여야 하며 production 문구나 고정된 최종 Evidence로 제품 동작을 하드코딩해서는 안 된다.
- **결정:** Evidence Analyst는 app package에 포함한 hidden no-tool Agent slot으로 실행한다. Crew host 호출 권한이 있는 UI runtime의 단일 background worker가 slot을 dispatch하고, backend/Core가 expired lease 회수와 pending job claim, 30초 soft timeout, 최대 1회 자동 재시도, revision·attempt가 맞지 않는 late result 거절을 기존 deterministic 계약으로 담당한다. browser에는 별도 narrow analysis route만 열고 일반 Agent·UI mutation으로 확대하지 않는다. Agent에는 redacted bounded Episode context만 전달하고 raw transcript나 workspace write 권한은 주지 않는다. 생성 결과는 workspace의 strict `.vibe-helper/result.json` manifest가 선언한 상대 JavaScript entry만 허용하며 containment와 symlink를 검증한 뒤 최소 환경의 Node child를 `127.0.0.1` 동적 port에서 실행한다. health check 성공 URL만 UI에 반환하고 project별 중복 실행, 실패 진단과 backend 종료 시 child 정리를 감독한다. public/LAN bind, hosted deploy와 object storage는 이 경로에 포함하지 않는다. Evidence 분석 뒤 사용자가 Helper 제안을 보고 명시적으로 개선 목표를 선택한 경우에만 sequence 2 Builder Task를 만들며, evidence-aware Personalization Trace와 Task를 연결하고 해당 행동을 `FINAL_UPGRADE` Episode로 기록한다. skip은 정상 경로이고 Agent 출력·card click만으로 이해 상태를 높이지 않는다.
- **Campus Drop fixture:** 학습 범위는 TypeScript runtime boundary, SQLite metadata와 file/blob 분리, access token·expiry 상태 전이로 한정한다. 작은 파일 upload와 만료되는 one-time download link를 MVP로 두고, multipart·대용량·object storage·로그인·영구 보관·hosted deployment는 `AGENT_SUPPORT` 또는 `EXCLUDED`로 둔다. 실제 Decision은 첫 다운로드 뒤 token 즉시 소비와 만료 전 재사용의 tradeoff처럼 구현 결과를 바꾸는 판단이어야 한다.
- **Evidence 검증:** Builder 코드·test 관찰만으로는 `OBSERVED`를 넘지 않는다. 이유 없는 Decision click, quick action이나 Agent 답변 반복은 상태를 올리지 않는다. 사용자가 자신의 말로 설명하면 최대 `EXPLAINED`, 독립 적용이나 근거 있는 판단은 최대 `DEMONSTRATED`로 제한하며 같은 session의 개인화 upgrade로 `TRANSFERRED`를 주장하지 않는다. E2E는 정확한 최종 state가 아니라 provenance와 이 허용 범위를 검증한다.
- **검증:** Campus Drop의 Discovery→Spec→consume-once Decision→Helper 사용자 설명→Builder 완료→Evidence 분석→evidence-aware Helper→사용자 목표→sequence 2 Final Upgrade를 한 Chromium session에서 통과시켰고, 별도 fixture package의 실제 TypeScript build·SQLite/blob storage·loopback HTTP upload/download/consume 회귀와 제품 result child-process integration도 통과했다. 전체 자동 검증은 unit 2개, integration 212개, eval 22개, Campus Drop 3개, smoke 6개와 Chromium E2E 12개다. target Crew를 app 0.4.1로 data-preserving update한 뒤 설치 UI·backend·Builder·Analyst hash와 backend health, 실제 History render를 확인했다. target Agent가 설명과 single fenced JSON을 함께 반환하는 형식 회귀를 발견해 exactly-one fenced block parser와 복수 block 거절 회귀 test를 추가했고, 새 versioned UI에서 실제 no-evidence Job 2개가 13.8초·17.8초에 `SUCCEEDED`가 됐다. 검증 중 strict parser가 거절한 legacy Job 6개와 기존 실패 1개는 revision provenance를 보존하며 삭제하지 않았다. SQLite `quick_check=ok`이고 61 Project·62 Discovery Session·27 Learning Spec·6 Task·13 accepted Evidence·13 Ledger·2 Completion Report가 유지됐다. 새 live Campus Drop Agent session은 추가 durable fixture data를 만들지 않고 deterministic E2E 및 실제 local runtime integration으로 대체했다.
- **검토한 대안:** UI polling만 두고 Analyst 실행은 standalone script에 맡김, browser가 analysis runtime command를 직접 호출, workspace의 임의 package script나 shell command 실행, host 전체 환경 상속, 고정 port·LAN bind, 분석 성공 즉시 자동 upgrade 생성, Campus Drop 문구를 prompt나 reducer에 삽입, 같은 흐름에서 `TRANSFERRED`까지 자동 승격.
- **tradeoff:** backend에 job worker와 child-process supervisor가 생기고 결과 manifest 및 두 번째 Task 계약이 추가된다. 대신 실패를 숨기지 않으면서 실제 결과를 열 수 있고, 분석과 실행이 Core authorization·workspace boundary 안에 남으며, Golden Path가 unseen learning goal과 Personal Need 유무 회귀에도 재사용 가능한 일반 수직 흐름을 검증한다.

## 2026-09-07: T19 자체 IDE 패널과 Discovery·Spec부터의 프론트 연동

- **상태:** 범위·상세 구현·검증 사용자 승인, transport는 spike 후 결정, 진행 중
- **승인 근거:** 사용자는 Kiro IDE의 코드 편집기 옆에 자체 Agent 화면을 두는 방향과 `Hello-KU-tty/program` 프론트 prototype을 제시했다. 기존 T19 수정에 동의하고, mock으로 개발 중인 Discovery·Spec도 실제 연결을 준비하도록 범위에 포함했다.
- **맥락:** 기존 T19는 내장 Workspace Agent 선택기만 사용하는 범위라 자체 Webview에 Core 상태와 실제 모델 실행을 공급하지 않는다. 확인한 `program` main commit `c639a595353f0db38e09112ba094ce5510fb1cbd`에는 Builder/Helper Webview, `AgentAdapter`, 기본 `DemoAdapter`와 주입형 `KiroAcpAdapter`가 있고 실제 `AcpTransport`·Core 연동은 없다. Discovery·Spec mock 개발 계획은 사용자 전달 사항이며 해당 commit의 구현 완료로 간주하지 않는다.
- **결정:** T19를 자체 Kiro IDE 패널의 프론트 연동 작업으로 변경한다. 기존 Core·MCP·Agent prompt를 재사용하고, Project 연결과 UI command/query, 실제 Agent 실행·stream·실패·중지, Candidate/Spec durable 결과 관찰을 프론트가 교체 가능한 연결부로 제공한다. 새 Learning Goal→10개 preview→background/JIT enrichment→refinement·선택→Spec 생성·수정·확정→Core workspace/Task→Builder·Helper/Decision까지 인계 범위에 포함한다. mock은 공통 계약을 쓰는 명시적 개발 모드로만 허용하고 실제 연결 완료나 Agent 품질 검증으로 세지 않는다.
- **역할 분담:** 프론트 담당자는 IDE 확장/Webview·화면·입력·rendering을 개발한다. 백엔드 담당자는 공통 DTO·validation·Core client·단계 제어·역할별 runtime 연결부·로컬 실행 안내를 제공한다. 두 repository의 교체 지점과 최소 실제 연결 예제를 함께 검증한다. UI 전체를 이 저장소에 복제하지 않는다.
- **transport 결정 조건:** extension host에서 사용할 Kiro CLI ACP 등을 작은 spike로 비교하고 실제 설치 버전의 identity·model·MCP allowlist, Discovery 단계 제출, Builder/Helper session 분리, stream·cancel·process 종료와 workspace 권한을 확인한다. T17에서 관측한 ACP session 생성 실패를 해결된 것으로 가정하지 않는다. local Core process의 시작·종료·endpoint 전달·HTTP/IPC 인증·Node/native dependency 호환성과 Analyst worker 소유자도 결정한다. Crew runtime 재사용 여부는 실행 안내에 명시하고 범용 Gateway·Agent mutation API를 공개하지 않는다.
- **계속 유지하는 경계:** Core는 모델을 호출하지 않는다. `ApplicationService.executeAgent`와 `/api/test/agent`는 실제 Agent 생성 API가 아니며 후자는 E2E 전용으로 유지한다. secret은 Webview에 주지 않는다. 사용자 선택은 UI command, Agent 제출은 역할별 MCP로 구분하고 provenance·revision·idempotency·redaction·Builder workspace 제한·Helper/Analyst read-only를 유지한다. 새 패널의 Helper exchange와 Builder checkpoint는 기존 Episode/AnalysisJob·개인화에 연결한다.
- **완료 판정:** 계약·mock 인계, transport 실측, Discovery/Spec 실제 연결, Builder/Helper·Decision 연결과 프론트 로컬 재현을 단계별로 기록한다. T19 완료는 자체 패널의 실제 연속 흐름과 Crew/Core 저장 상태 일치로 판정하며 화면 mock이나 내장 Agent 선택기만으로 대체하지 않는다. Evidence/Final Upgrade 전체 화면 parity·polish와 공개 배포는 별도 후속 범위로 남긴다.
- **tradeoff:** 내장 Agent config만 제공할 때보다 runtime lifecycle과 프론트 협업 계약이 늘어난다. 대신 프론트가 데이터 저장과 모델 실행을 혼동하거나 Crew 구현을 화면별로 복제하지 않고 Discovery부터 실제 프로젝트 작업까지 연결할 수 있다. 별도 IDE 제작, 다른 model provider·host adapter, 기존 project import, cloud sync와 외부 공개 서버는 추가하지 않는다.
- **참조:** [프론트 prototype](https://github.com/Hello-KU-tty/program/tree/c639a595353f0db38e09112ba094ce5510fb1cbd), [Kiro ACP 공식 문서](https://kiro.dev/docs/cli/acp/), [프론트 연동 계획](FRONTEND_INTEGRATION.md). 공식 지원 설명은 설치 환경에서의 성공 증거를 대신하지 않는다.
- **완료 기준 보완:** 같은 날 사용자는 계획 승인을 요청하며, push된 backend와 지침을 받은 frontend 개발자가 자신의 컴퓨터에서 실행하고 실제 Kiro IDE의 Discovery·Spec·Builder·History 화면을 모두 구현할 수 있어야 한다고 명시했다. History 목록·단계별 복원·재시작, 외부 client 소비와 clean checkout, 네 화면의 실제 IDE 최소 예제를 인계 조건에 포함한다. frontend 제품 화면의 최종 디자인 완료와 backend 인계 완료는 구분한다. 독립 local backend·HTTP/SSE·ACP·client 배치안은 [T19_IMPLEMENTATION_PLAN.md](T19_IMPLEMENTATION_PLAN.md)에 제안했으며 상세 계획 승인은 아직 받지 않았다.
- **착수 승인:** 이후 사용자는 위 상세 계획에서 push를 제외하고 승인했다. 구현·실측·검증과 검증 후 commit은 진행하되 push 직전에 다시 승인받는다. frontend OS는 Windows로 확인됐다. Windows native/PowerShell 경로를 기준으로 하고 WSL이나 macOS 검증만으로 Windows 실행을 보장하지 않는다. 기존 사용자 Crew 설치·DB·설정은 변경하지 않고 격리된 synthetic data/workspace에서 첫 transport spike를 수행한다.

## 2026-09-07: T19 장기 실행의 SQLite 네이티브 충돌 검증

- **상태:** 승인된 T19 capability spike의 의존성 검증 중, 기존 설치물 배포 없음
- **관측:** 고정 Node.js 24.19.0 / better-sqlite3 12.11.1의 실제 Builder turn 중 Statement GC에서 `RemoveEnvironmentCleanupHook`의 `env != nullptr` assertion으로 backend가 SIGABRT 종료했다. 예외 처리나 모델 retry로 해결할 수 없는 native failure다. 기존 synthetic SQLite의 무결성과 저장 상태를 별도로 검사한다.
- **검증 선택:** Node 버전과 schema/migration은 바꾸지 않고 better-sqlite3 13.0.3의 N-API 구현을 exact pin으로 검증한다. upstream v13은 Node-API로 전환했고 13.0.2는 worker 종료 abort를 수정했다. 이 변경이 관측한 문제를 해결하는지는 GC stress와 실제 장기 workflow로 확인하며 동일 원인이라고 단정하지 않는다. 13.0.3 npm metadata는 Node >=22, `gypfile: false`, install script 없음, dependency `node-addon-api`를 명시한다. 기존 v13 Windows node-gyp 우려를 재검토하되 실제 Windows 설치 gate는 유지한다.
- **공급망/데이터 경계:** registry package와 lock integrity를 고정하고 install은 frozen lockfile로 수행한다. 새 lifecycle 허용 항목은 추가하지 않는다. public registry publish, 사용자 DB migration/삭제, 현재 Crew update는 하지 않는다. storage contract·backup/restore·전체 회귀가 실패하면 인계 완료로 처리하지 않는다.
- **출처:** [better-sqlite3 v13 release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0), [v13.0.2 수정](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.2), [Node ObjectWrap cleanup 변경](https://github.com/nodejs/node/pull/63642).
- **설치 관측/제한:** pnpm 11.12.0은 `gypfile: false`인데도 implicit `node-gyp rebuild`를 실행했다. package 안에 darwin/win32 x64·arm64 N-API prebuild가 존재하고 loader가 이를 사용하므로 better-sqlite3 build script를 명시적으로 차단하고 esbuild만 허용한다. 이 정책은 허용 범위를 축소하며 Windows 개발자에게 불필요한 Python/Visual Studio C++ 설치를 요구하지 않기 위한 것이다. prebuild 없는 platform은 doctor에서 실패시킨다. 새 checkout frozen install 및 실제 Windows 검증 전에는 설치 문제 해결을 확정하지 않는다.

## 2026-09-07: T19 local transport와 완료 workspace 조회

- **결정:** macOS capability 결과로 별도 local backend HTTP/SSE + CLI 2.21.1/v2 ACP를 구현했다. `LOCAL_PROTOCOL_VERSION=1`, SDK 0.1.0을 Crew protocol 9와 구분한다. role/run-bound MCP, private connection file, extension-host-only 인증, backend 소유 Analyst/결과 process를 사용하며 Windows gate는 미검증이다.
- **완료 workspace:** 기존 `UI_PREPARE_BUILDER_SESSION`은 완료 Task에서 거절되어 History의 workspace 열기까지 막혔다. 승인된 인계 범위의 읽기 전용 복원을 위해 선택적 `purpose: WORKSPACE_VIEW`를 추가한다. 기본 `AGENT_SESSION` 동작과 완료 Task Agent 실행 거절은 유지한다. view는 canonical workspace 경로만 반환하며 Task/session/revision을 생성하거나 변경하지 않는다.
- **검증 보고:** 실제 Builder 1.3.0은 guard-denied 명령을 통과로 보고했다. 실패 기록을 보존하고 canonical prompt 1.3.1에 허용 command·실제 결과·NOT_RUN/FAILED·미검증 시 미완료 지침을 추가한다. fixture 계약 평가와 실제 모델 검증을 분리한다. runtime의 TURN_ENDED, Core Agent-authored completion report, launcher health와 독립 build/test 성공을 같은 의미로 취급하지 않는다. 범용 shell/Agent endpoint와 자동 상태 덮어쓰기는 추가하지 않는다.

## 2026-09-07: 프로젝트 GitHub push 경로

- **상태:** 사용자 승인
- **결정:** 이 프로젝트는 `@hurdooagent` 소유의 별도 repository로 복제하지 않는다. `@hurdoo` 측 현재 repository `Hello-KU-tty/core`에 `@hurdooagent`를 collaborator로 사용해 `origin/main`에 일반 push하는 2번 경로를 사용한다.
- **운영 경계:** remote를 임의 변경하거나 force push하지 않는다. 이 경로의 기록은 앞으로의 push 대상을 명확히 하지만, repository 지침에 따라 각 push 직전의 사용자 승인은 계속 별도로 받는다. 권한 거부 시 반복 시도하지 않고 `@hurdooagent` collaborator 권한을 확인한다.

## 2026-09-12: T19-N 내장 Kiro IDE Agent 연결 실험

- **상태:** 사용자 승인, capability spike 후 구체 transport 결정
- **맥락:** 현재 자체 IDE 패널은 local backend→별도 Kiro CLI 2 ACP로 모델을 실행한다. 사용자는 CLI의 별도 설치 없이 IDE 자체 Agent를 쓰고자 한다. 설치 IDE 1.0.337의 초기 격리 probe는 내부 `sessions.create/sendPrompt` 호출과 합성 파일 write를 보였지만 공개 extension API, turn text/stream/cancel, custom Agent 선택과 MCP attach는 입증하지 못했다. 별도 IDE UI profile에도 Kiro harness가 `~/.kiro`에 새 합성 session/log를 저장한다는 점은 사용자가 수용했다.
- **결정:** 현재 main을 건드리지 않는 분리 worktree에서 native adapter를 실험한다. 기존 Core/SQLite/MCP 계약, CLI/Crew 경로와 T19 Windows gate는 유지한다. 설치본 patch, token 추출, 기존 사용자 session/DB/workspace/config 수정, global HOME 변경은 하지 않는다. 비공개 host 명령 사용은 이 실험 안에서만 허용하고 version/capability gate와 명시적 실패를 둔다. Custom Agent/역할·MCP, Decision, Helper, Analyst와 개인화는 각각 실제 Core 상태와 Agent side effect로 판정한다. CLI나 외부 LLM으로 native 성공을 대체하지 않는다.
- **선행 gate:** `workspace.isTrusted`를 기록하고, IDE UI의 정상 초기화와 내부 `sessions.create` 차이를 확인한다. `/native-builder` 같은 문자열을 Agent 선택 증거로 쓰지 않는다. 역할별 MCP attach/권한이 확인되기 전에는 제품 flow 연결 성공을 주장하지 않는다. stream/end/cancel이 검증되지 않으면 기존 `WorkflowAgentPort.invoke`에 거짓 결과를 주입하지 않는다.
- **검토한 대안:** 곧바로 CLI 경로 삭제, 기본 Agent 하나로 Builder/Helper 표시, 모델 file write만으로 Core Decision 성공 처리, 내장 log scraping, mock Core state를 실제 SQLite로 표기.
- **tradeoff:** 비공개 host 명령은 버전 변경에 취약하다. 대신 실제 IDE 내장 Agent와 Core를 연결할 수 있는지 가장 작은 격리 증거로 판단하고, 불가능한 capability는 기존 검증된 경로와 구분해 보존한다. commit/push/merge는 이번 작업 범위에 포함하지 않는다.
- **실측 후 연결 결정:** private `sessions.create/sendPrompt` 명령은 Agent mode와 raw turn result를 충분히 반환하지 않으므로 동일 workspace의 단일 내부 observer WS/ACP endpoint를 이 버전에 한해 사용한다. `session/new`의 mode 선택지를 확인하고 `set_config_option`의 `currentValue`로 실제 선택을 검증한다. 서버 요청과 응답을 구분하고, 세션 소유·timeout·cancel·redaction을 adapter 안에서 제한한다. 이 경로는 Kiro 공개 extension API가 아니다.
- **Core와 권한 gate:** `core-only`는 CLI 검사 없이 기존 ApplicationService/SQLite를 열지만 Agent run을 명시적으로 거절한다. Task-bound MCP는 기존 role-server factory를 재사용하고 Builder/Helper의 도구 이름·project/task/correlation 및 active lifetime에 묶는다. IDE config는 canonical prompt를 사용하고 초기 설치본 loader에서 제외됐던 legacy 혼합 필드를 넣지 않는다. `allowedTools` 자체는 최신 IDE 문서에 남아 있으나 이 실험에서 자동 승인으로 사용하지 않는다. Builder의 file/shell은 설치 IDE에서 containment가 확인되기 전까지 제공하지 않는다.
- **후속 실측과 정정:** 설치본이 IDE 1.0.437/extension 1.0.794로 바뀐 뒤 별도 profile의 정상 workspace `.kiro/settings/mcp.json` 등록으로 합성 stdio 서버가 시작되고 MCP `initialize`·`tools/list`를 받았다. 정확한 custom mode에서 read-only 합성 `get_task`의 `tools/call`과 handler 실행도 확인했다. 초기 `configureMCP=Disabled`·`getCanEnableMCP=false` 및 이전 managed-setting 쓰기 오류는 MCP 도구 사용 불가의 증거가 아니었다. 따라서 자체 `mcpReady` 선차단을 제거하고 설치 버전·workspace trust·정확한 role config·ACP mode 응답은 계속 검증한다. 조직 정책을 변경하거나 기존 사용자 설정을 조작하지 않는다.
- **남은 연결 gate:** 기존 Task-bound HTTP Core 서버는 Kiro에서 `server/discover`에 MCP 2026-07-28 및 tools capability를 응답했지만 `tools/list`·`tools/call` 요청과 Core `executeAgent` receipt가 없었다. Agent의 도구 없음 답변이나 tool activity를 Core 성공으로 세지 않는다. 공식 SDK의 modern-era `server/discover` 자체는 정상 negotiation이며, Kiro HTTP 후속 등록/호환 또는 안전한 stdio Core 경로를 별도 결정·검증해야 한다. 전체 수직 흐름과 Windows gate는 열어 둔다.

## 2026-09-12: T19-N native 전체 수직 흐름 재개와 stdio Core bridge

- **상태:** 사용자 추가 승인 후 구현·실측 중.
- **맥락:** 최신 Kiro 1.0.794의 합성 stdio MCP는 exact custom mode에서 `initialize`·`tools/list`·`tools/call`과 handler side effect까지 성공했다. 기존 Task-bound HTTP Core route는 Kiro 직접 연결에서 modern discovery 뒤 도구가 노출되지 않았다. 사용자는 전체 Discovery→Builder→Decision→Helper→Evidence/Analyst→개인화 흐름 검증을 요청했다.
- **결정:** CLI 모델 실행이나 새 LLM API 없이 Kiro 내장 Agent와 기존 run-bound Core HTTP handler 사이에 고정 대상 stdio MCP bridge를 실험한다. backend가 ApplicationService/SQLite의 소유권과 binding revoke를 유지하고 bridge는 descriptor의 exact role/tool subset만 노출한다. 개발 중에는 합성 disk DB와 Core-issued workspace만 사용한다. Builder file/shell은 IDE-native containment를 실제 검증한 범위에서만 허용하고 Helper/Analyst는 read-only/tool-less로 유지한다.
- **판정:** fixture seed, Kiro Agent tool call, 결정적 UI 선택, 합성 사용자 발언 및 Core 수락을 서로 다른 receipt로 기록한다. 사용자 발언은 UI source이며 Agent 답변·선택 클릭만으로 Concept State를 올리지 않는다. native Core read를 먼저 입증하고 그 뒤 실제 파일·Decision·Helper·Episode·Analyst·다음 개인화를 순서대로 확인한다. Kiro 직접 HTTP 호환성은 별도 미해결로 남기며 기존 CLI/Crew와 T19 Windows gate는 유지한다.

## 2026-09-13: T19-N 제품 relay의 내장 도구·권한·동시성 실험 경계

- **상태:** 격리 실험 중. 제품 기본 CLI 경로 전환 또는 Windows 승인 아님.
- **도구 선택:** 범용 file/shell MCP를 추가하지 않는다. Kiro 1.0.794에 이미 있는 `read`(디렉터리 `search` 포함), `write`, `shell`만 Builder role config에 노출하고 각 tool의 native permission은 `ask`로 둔다. Core 도구는 기존 role/run-bound MCP subset만 쓴다. Helper는 `get_helper_context` 외 file/shell 권한이 없고 Analyst는 tool-less다. `search`는 설치본의 directory listing 입력 `{path,explanation?,depth?}`와 ACP `kind=search`가 실제로 관측된 뒤 exact read mapping으로 제한했다.
- **권한 판단:** private observer에서 들어온 owned session/toolCallId와 native kind+rawInput shape를 연결한다. 파일 path는 생성 workspace canonical/symlink/`.kiro` 경계, shell은 bounded command/cwd/timeout/경고 값을 확인한 후 제공된 `allow_once`만 선택한다. 불명확한 tool/field는 `reject_once`로 거절한다. Kiro mux는 observer의 보통 JSON-RPC permission 응답을 폐기하므로 설치본의 `_kiro/permission/respond`와 `{toolCallId,optionId}`를 사용하고 `{success:true,toolCallId}` ACK를 확인한다. 이 private method와 번들 버전은 공개 안정 API가 아니므로 제품 native mode는 1.0.794에 고정한다.
- **동시성:** backend는 workspace별 CLAIMED role을 중복 claim하지 않으며 IDE worker는 동일 workspace에서 Builder/Helper/Analyst를 각각 최대 한 session으로 병행한다. active session이 있는 동안 다른 generated workspace로 자동 전환하지 않고 dispose 시 owned session에 cancel signal을 전달한다. Helper가 Builder 진행 중 claim된 것은 확인됐지만 별도 실제 응답 완료는 아직 gate다.
- **보안 한계:** native shell의 top-level `npm test`/`pnpm run` 허용은 package script의 하위 명령을 OS 차원에서 가두지 않는다. synthetic 비실행 bypass fixture로 확인했으므로 generated code가 신뢰되지 않는 경우 write/shell containment gate는 실패다. OS sandbox를 제공한다고 주장하지 않고 실제 명령·파일 receipt를 계속 분리해 기록한다. 이 spike는 user workspace·global Kiro config·기존 기록을 읽거나 바꾸지 않는다.

## 2026-09-12: T19-N 단계별 실측 판정과 기본 경로 유지

- **상태:** 격리 native 경로의 단계별 구현·검증 완료, 단일 전체 MVP lineage는 미검증. [receipt와 실패·재시도](spikes/T19_NATIVE_FULL_FLOW_RESULTS.md)를 남긴다.
- **실측:** 새 Discovery lineage에서 Kiro 내장 Agent의 Candidate·Spec 제출→Core Task 발급→Builder Task 시작과 guided 파일·Decision 적용까지 성공했다. 별도 fixture-seeded lineage에서는 Helper의 독립 read-only session, UI 원문 출처 Episode, native tool-less Analyst의 Core job 성공·Evidence 승인, 새 correlation의 Evidence-aware Helper 답변까지 성공했다. 초기 Builder Context fixture, Helper 이후 미연결, Browser 결과·build/test/`complete_task` 미도달을 이 둘의 연결 성공으로 계산하지 않는다.
- **한정 복구:** Kiro가 제출한 초기 Round의 수신 raw MCP input에서 필수 빈 collection 두 개가 누락됐다. 첫 Round이고 동일 Core session/project/correlation의 rev1·Round 0·Feedback 0을 검증한 경우에만 누락값을 `[]`로 복원한다. 명시적 잘못된 값이나 다른 scope/revision은 기존 strict validation에 맡긴다. Agent가 필드를 보냈다고 말한 것만으로 전송 결함의 원인은 단정하지 않는다. Spec 첫 시도와 Discovery 앞선 시도는 schema error·timeout/cancel 미확인으로 기록하고 성공 재시도와 구분한다.
- **Core 결함 수정:** 같은 Decision resolution을 다른 idempotency key로 반복할 때 기존 NO_OP가 Event/Episode/job을 중복 생성할 수 있어 즉시 반환하도록 수정했다. Helper마다 고유 correlation을 발급해 이전 `NO_RELEVANT_EVIDENCE` personalization cache를 다음 turn에 재사용하지 않게 했고 project/task scope 및 Episode correlation을 검증했다. 두 수정은 native 성공 주장에 필요한 deterministic Core 경계이며 기존 CLI/Crew 경로도 보존한다.
- **결정:** 현재 자체 패널·CLI 2 ACP를 기본 경로로 유지하고 native private API를 제품 호환성으로 선언하지 않는다. 단일 lineage에서 native 초기 Context·Helper/Evidence 이후까지, 완성 Browser result의 build/test/health, 권한·live stream·Windows 검증이 끝난 뒤에만 교체를 재판단한다.

## 2026-09-13: T19-N 제품 실행 경로의 IDE extension-host relay 실험

- **상태:** 사용자 요청에 따른 격리 capability spike. 제품 기본 실행기 전환은 미결정.
- **맥락:** 이전 stdio MCP 실험은 Kiro 내장 Agent의 단계별 Core 호출을 보였지만 `/api/runs`는 `NATIVE_RUNTIME_NOT_ATTACHED`로 거절했고 기존 IDE 패널에서 같은 전체 흐름을 시작할 수 없었다. Node backend에는 VS Code extension API가 없으므로 설치 Kiro의 private observer endpoint에 직접 연결할 수 없다.
- **결정:** 기존 `/api/runs`와 패널 행동을 유지하고, backend의 run-bound `WorkflowAgentPort`가 인증된 loopback relay로 현재 workspace의 IDE extension host에 한 turn을 전달한다. extension host만 private observer WS/ACP로 Kiro 내장 Agent를 호출한다. Core 상태·MCP tool binding·revoke는 backend가 소유하며 stdio bridge는 기존 role별 MCP 계약만 중계한다. Discovery, Builder, Helper와 tool-less Analyst는 별도 mode/session이고 canonical `docs/agent-prompts/`에서 Agent config를 생성한다. 새 CLI 설치나 외부 LLM API 호출은 없다.
- **권한:** Builder의 native read/write/shell은 permission `ask`와 생성 workspace 기준 path·symlink·명령 guard가 승인한 단일 호출만 허용하도록 설계한다. `.kiro`는 거절하고 Helper/Analyst는 write/shell이 없다. 이 guard는 OS sandbox가 아니며 package script의 2차 side effect까지 통제한다고 주장하지 않는다. 실제 IDE의 permission request shape와 deny/allow를 receipt로 검증하기 전에는 containment 성공으로 세지 않는다.
- **stream·복구 gate:** native text는 완결된 줄을 redaction한 뒤 transient event로 보내고 Core가 다시 redaction한다. Tool event는 안전한 분류 필드만 전송한다. cancel은 Core binding을 즉시 revoke하고 owned session에 요청하지만 Kiro acknowledgment는 별도 확인한다. backend 재시작 뒤 기존 Core Project/History 복원은 유지하되 진행 중 turn의 재연결은 브리프의 MVP 범위가 아니다.
- **현재 검증:** typecheck/build와 격리 relay의 exact-workspace claim·role-bound descriptor·safe event·revoke integration이 통과했다. 첫 새 프로젝트의 실제 패널 PREVIEW run은 IDE worker가 300초 내 attach하지 않아 `NATIVE_IDE_WORKER_UNAVAILABLE`로 실패했다. 이것은 앱 경로의 명시적 실패 처리 증거이며 Kiro Agent의 capability 판정은 아니다. 같은 lineage의 native Agent 실행과 전체 완료 판정은 후속 GUI 실측을 기다린다.

## 2026-09-13: T19-N 장시간 IDE-only 판정의 Builder 정합성 복구

- **상태:** 분리 worktree의 실험 변경이며 기본 CLI/Crew 교체 결정 아님. [10시간 판정 기준](spikes/T19_NATIVE_10H_REPLACEMENT_DECISION_20260913.md)과 [같은 Project 실측](spikes/T19_NATIVE_LIVE_RUN_20260913.md)을 구분한다.
- **관측:** 같은 Task의 Decision request/resolution/application이 모두 durable인데 Live Context v4의 `activeDecisionIds`에 그 적용 완료 ID가 다시 들어갔다. `apply_decision_result`는 이를 제거한 Context를 저장했으나 일반 `update_build_context`의 Core 경로는 중복 여부만 확인하고 이후 재삽입을 받아들였다. `complete_task`는 active ID가 하나라도 남으면 거절한다. 같은 native 입력에서 빈 `activeDecisionIds` 필드 누락도 반복됐다. 이 병목은 IDE의 완료 불가능성 증거가 아니라 기존 Core 정합성/transport 결함이다.
- **결정:** Core의 일반 Live Context update에서도 `activeDecisionIds`가 해당 Task의 Decision request 중 아직 application이 없는 ID 집합과 정확히 같아야 한다. 이미 적용한 ID의 재삽입, 미적용 ID 누락, 중복과 다른 Task ID는 거절한다. 기존 Decision 요청·적용 로직의 의미와 Core 계약을 바꾸지 않고 불변식을 강화한다. Kiro 전용 stdio bridge는 입력에서 이 필드가 **없을 때만** exact binding, Project/Task/correlation, confirmed Spec, ACTIVE Task, 현재 Context version과 `expectedPreviousVersion`, request→resolution→application의 동일 scope 관계를 조회한다. 그 권위 집합이 공집합일 때만 `[]`를 복원한다. 명시적 null/오류/구식 version, 적용되지 않은 Decision, 다른 scope에는 손대지 않는다. Core의 version 검사가 조회 이후 경합을 다시 막는다. Agent-authored stage, files, Concept, report나 학습 Evidence는 생성하지 않는다.
- **Native shell cwd:** 설치 Kiro 1.0.794의 shell 경로가 `cwd: "."`/`"./"`를 session workspace 아래로 해석하고, native client는 단일 IDE root와 endpoint folder가 Core-issued generated workspace의 realpath와 일치할 때만 session/new를 만든다. 이 검증된 두 별칭만 canonical generated workspace로 **permission guard 입력에서** 정규화한다. IDE에 보낸 원래 tool input과 Core workspace 범위는 바꾸지 않는다. 다른 상대 경로, symlink workspace, 외부 절대 경로, `.kiro`와 미승인 명령은 계속 거절한다. 공식 custom Agent/MCP와 shell tool 지원은 별도로 확인되지만 현재 observer attach 및 `_kiro/permission/respond` extension 진입점의 안정적 공개 지원은 확인되지 않았다.
- **다음 진단:** 설치본에는 별도의 `_kiro/userInput` server request와 `_kiro/userInput/respond` 응답 경로가 있다. 기존 observer는 이 method를 지원하지 않아 ToolCall이 `user_input` 대기라면 반복 schema 오류 뒤의 긴 대기를 설명할 수 있다. 실제 발생 여부는 아직 미확인이다. 질문/옵션/답을 로그에 남기지 않고 owned session의 request shape와 `user_input` tool marker만 bounded telemetry로 수집한다. 사용자 답을 자동 생성하거나 승인하지 않는다. 실제 발생하면 panel의 명시적 사용자 입력과 동일 session 응답 계약을 별도 검증한다.
- **검증 경계:** deterministic Core 통합 28/28, bridge negative/positive 5/5, native permission/client 및 relay 집중 검증을 포함한 4개 파일 53/53, `pnpm typecheck`, `pnpm build`, `pnpm panel:build`, `pnpm format:check`, `git diff --check`가 이 source 변경에서 통과했다. 실제 IDE turn의 적용과 새 Project에서의 재삽입 방지는 아직 검증해야 한다. package script의 간접 shell side effect는 기존 CLI와 native가 공유하는 OS-level hardening 과제로 유지하며 어느 경로도 OS sandbox라고 주장하지 않는다.

## 2026-09-13: T19-N 실제 native user-input 응답과 완료 형식 진단

- **관측:** 기존 Task 재개에서 native Builder가 `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`를 각각 실제 IDE shell ToolCall `completed`/exit 0으로 실행했고 Core Context v5가 applied Decision ID를 정상 정리했다. manifest도 생성됐다. 그러나 `complete_task`의 세 호출은 schema-shape 오류로 거절됐고, 이어 Kiro 1.0.794가 `_kiro/userInput` request와 `user_input` pending ToolCall을 실제로 보냈다. 기존 observer는 이 요청에 응답할 수 없어 parent가 run을 취소했다. Task는 ACTIVE, Completion Report는 없다.
- **결정:** 질문과 선택지는 extension-host 메모리에만 유지하고 기존 redactor로 제한한 뒤 Project/Task 또는 Discovery Session, native job, owned session과 toolCall ID에 묶어 패널에 표시한다. 사용자가 직접 고른 option/suboption, 자유 답변 또는 dismissal만 `_kiro/userInput/respond`로 전달하고 ACK의 success와 동일 toolCall ID를 확인한다. 중복 클릭은 멱등이며 취소·다른 scope·늦은 응답은 거절한다. 질문은 권한 승인, Core Decision, USER Evidence와 독립이다. Completion Report는 Agent 원본을 바꾸지 않고 현재 strict contract의 allowlisted field/index/expected/actual type만 기록해 다음 거절 원인을 분별한다. output 변환 `CLIPPED`/`OFFLOADED`와 ACP marker는 경로·원문 없이 DTO에만 알리며 `run_command`의 combined stdout/stderr를 무손실 스트림으로 주장하지 않는다.
- **검증 경계:** user-input queue의 scope·redaction·중복·취소·ACK 전 대기와 observer의 명시 responder/ACK 실패를 synthetic fixture로 검증했다. Completion shape diagnostic은 알려진 계약 field/index/type만 내보내고 비밀 fixture 값을 유출하지 않았다. 현재 응답 UI와 완료 진단을 실제 IDE에서 재실행하기 전이므로 Task 완료/건강한 결과를 PASS로 표시하지 않는다.

## 2026-09-13: T19-N 기존 파일 편집 형식과 Completion JSON 운송 비교

- **실측:** 새 native Builder turn에서 질문/명시 응답/ACK 후 `scripts/verify-loopback.mjs` write는 성공했지만, `package.json` 변경에 사용된 설치 IDE edit 입력 `{path,oldStr,newStr,replace_all}` 두 건은 native permission adapter가 `{path,text}`만 허용해 거절했다. 이 때문에 smoke package script와 entry health는 미검증이다. 같은 turn의 `complete_task`에는 `report.diffReferences`·`report.specDeviations` 필수 배열이 수신되지 않아 Core strict schema가 거절했다. Task는 ACTIVE이고 Completion은 없다.
- **근거와 결정:** 설치 Kiro 1.0.794의 MCP SchemaStream이 빈 JSON 배열/객체를 버리는 동작을 버전 고정된 합성 재현으로 확인했다. 모델이 특정 필드를 원래 생성했는지는 증명하지 못한다. 기존 Core schema와 state policy를 바꾸지 않고, 먼저 실패가 관측된 `complete_task`만 전체 Agent-authored 인자를 하나의 JSON 문자열 `inputJson`으로 받는 stdio MCP facade 비교를 진행한다. 원래 JSON Schema를 도구 설명에 제공하고, 크기 제한·wrapper 검증 뒤 객체로 파싱해 같은 Core 도구에 그대로 보낸다. 이 경로에는 legacy missing-empty 보정을 적용하지 않는다. Agent가 작성하지 않은 빈 배열·Evidence·보고 의미를 생성하지 않으며 잘못된 원본은 Core가 그대로 거절한다.
- **권한 경계:** native `write`의 관측된 기존 파일 edit 입력만 string·byte bound와 알려진 key 집합으로 받아들이고 동일 generated workspace canonical/symlink/`.kiro` path guard에 통과한 단일 `allow_once`만 선택한다. shell 허용 문법, 다른 role 권한, Core 계약, backend binding은 그대로 둔다. 위 두 수정의 단위 테스트 통과만으로 앱 smoke/Completion 성공을 주장하지 않는다. Native user-input 왕복은 새 panel에서 실제 ACK까지 성공했으며 답변은 Core Decision/Evidence로 자동 변환되지 않았다.

## 2026-09-13: T19-N Discovery 모델 선택의 세션 범위

- **목적:** 기존 CLI Discovery의 Haiku 선택과 native IDE 비교에서 Auto 기본 모델 차이를 분리한다. 모델 이름을 prompt에 쓰거나 전역 IDE 설정을 바꾸는 방식은 선택 증거가 아니다.
- **결정:** 제품 native Discovery의 **새 owned session**에서 role `mode`를 먼저 선택하고 응답 `currentValue`로 확인한 뒤, 동일 응답의 `model` 옵션에 `claude-haiku-4.5` exact ID가 하나 있을 때만 `session/set_config_option`의 model 설정을 호출한다. model 응답에서도 mode와 model `currentValue` 및 exact 옵션을 확인한다. 부재·중복·형식 오류·RPC 실패는 Auto 대체 없이 fail closed한다. Builder/Helper/Analyst 모델은 이 정책으로 바꾸지 않는다. 기존 task의 turn을 hot-swap하지 않고 fresh Discovery run에서만 실측한다.
- **경계:** Kiro 1.0.794 설치 소스의 owned session config API를 바탕으로 한 version-pinned 실험이며 현재 extension 진입점의 공식 안정 지원 증거는 아니다. helper/observer 단위 테스트와 실제 IDE의 선택 ACK 및 Agent/Core 결과를 별도 기록한다.

## 2026-09-13: T19-N immutable Preview 상세화의 native 운송

- **실측:** 첫 unseen Project의 Preview 10개와 FIRST 상세 5개는 Core에 저장됐다. SECOND는 `submit_candidate_enrichments` 네 번 모두 `CANDIDATE_ENRICHMENT_IDENTITY_CHANGED`로 거절됐다. 기존 안전 receipt는 여섯 immutable 의미 필드, round/session 참조 중 어느 항목이 달랐는지 식별하지 못한다. Kiro의 빈 JSON container 손실은 별도 pinned 재현이지만 이 네 오류의 직접 원인이라고 단정하지 않는다.
- **결정:** 원래 Core/MCP Candidate schema와 CLI 경로는 변경하지 않는다. native stdio facade의 상세화 도구만 `inputJson` 문자열 안에 `candidateId`와 Agent가 새로 작성하는 상세 필드를 받으며, 여섯 immutable Preview 필드가 들어오면 명시적으로 거절한다. 같은 role-bound Core의 `get_discovery_context`에서 이미 저장된 Preview Round를 읽어 정확한 Project/Session/correlation/Preview ID 및 10개 preview record를 확인하고 여섯 필드를 그대로 복사한 뒤, 기존 strict MCP와 Core에 보낸다. 필수 상세 내용이나 빈 배열은 추론해 채우지 않는다. Zod에서 도출한 전체 native 입력 JSON Schema를 도구 설명에 제공하고 128 KiB JSON scalar만 파싱한다.
- **범위와 재시도:** per-run binding에 runtime이 발급한 Discovery mode와 `ENRICH_SELECTED`의 요청 Candidate ID를 넣어 `FIRST` 1–5, `SECOND` 6–10 또는 정확한 SELECTED 집합만 허용한다. Agent의 batch 선언만으로 범위를 넓히지 않는다. Preview는 최종 Round 이후에도 SQLite에서 읽을 수 있으므로 facade가 ACTIVE/current revision을 선제 검사해 Core idempotent replay를 막지 않는다. 동일 key/동일 command는 Core 저장 receipt, 동일 key/변경 command는 `IDEMPOTENCY_KEY_REUSE`, 새 stale key는 기존 Core revision gate로 처리한다. native binding은 job 종료 시 폐기된다.
- **검증 경계:** synthetic facade/unit 9/9, 원래 Core 및 relay 집중 통합 31/31, 전체 integration 250/250, eval fixture 25/25, typecheck/build/format/lint를 통과했다. 실제 IDE SECOND retry가 다섯 상세를 저장하기 전까지 end-to-end 성공이 아니다. 설치본 observer permission 응답은 primary IDE와 first-response 경쟁이 가능하므로 native file/shell의 hard confinement 동등성은 별도 검증 과제로 남긴다.

## 2026-09-13: T19-N 새 생성 workspace의 pnpm 잠금 파일 준비

- **맥락:** fresh native Builder workspace는 Agent가 `package.json`을 작성하기 전에는 `pnpm-lock.yaml`이 없다. `pnpm install --frozen-lockfile`은 잠금 파일이 없으면 실패한다. 저장소 자체의 의존성 설치는 계속 frozen 규칙을 지킨다.
- **결정:** 새 생성 workspace의 native Builder 권한에만 `pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile` 정확한 한 명령을 추가한다. 동일 Core 발급 workspace의 canonical cwd, 단일 one-time permission, foreground, bounded timeout, `ignoreWarning:false`, 작성된 일반 `package.json`, 잠금 파일 부재, `.npmrc`·`pnpm-workspace.yaml`·`.pnpmfile.cjs` 부재를 모두 확인한다. 이어 Agent가 필요한 승인된 `allowBuilds.esbuild` 또는 `allowBuilds.better-sqlite3` 설정을 작성하고 실제 설치는 `pnpm install --frozen-lockfile`로만 한다. 기존 CLI/Crew shell guard와 npm 경로는 바꾸지 않는다. 잠금 준비를 실제 설치·테스트 성공으로 세지 않는다.
- **실측과 한계:** 격리 `/private/tmp`의 pnpm 11.12.0 fixture에서 이 네-flag 명령은 lock을 생성했지만 `node_modules`와 `preinstall` sentinel을 만들지 않았다. 별도 local `.pnpmfile.cjs` hook 대조군은 `--ignore-scripts`만으로 sentinel을 썼고, `--ignore-pnpmfile`을 더한 실험군은 쓰지 않았다. 초기 잠금 준비 후 승인된 `allowBuilds.esbuild:true`만 넣은 frozen install은 exit 0으로 esbuild postinstall을 실행했다. fixture의 `.npmrc global-pnpmfile` 대조군에서는 hook이 발동하지 않아 전역 hook 억제 효과는 따로 입증하지 못했다. native guard가 local `.npmrc`·pnpmfile·workspace config를 초기 준비 전에 거절하고 네-flag 명령만 허용하는 이유다. 이 명령도 IDE primary/observer permission 응답 경쟁이나 package script의 기존 OS-level 간접 실행 한계를 해결했다는 증거는 아니다. 생성 앱의 실제 native 실행과 잠금/검증 영속 결과는 별도 gate다.

## 2026-09-14: T19-N 생성 앱 의존성 변경 후 잠금 갱신

- **실측:** fresh Project C의 native Builder가 루트 `package.json`에 `@types/node`를 선언했지만 당시 `node_modules/@types/node`는 없었다. `pnpm run build`는 `node:http` 등 Node 선언과 `Buffer`/`process`를 찾지 못해 exit 2였다. 같은 정확한 잠금 준비 명령은 기존 lock 때문에 `LOCKFILE_PREPARE_DENIED`였다. 당시 lock importer 원문은 보존되지 않았으며, 사후 검사는 pnpm YAML의 따옴표를 놓쳐 `@types/node` 부재를 잘못 분류했다. 뒤늦은 의존성 변경에서는 기존 lock을 다시 맞춰야 할 수 있으므로 초기의 잠금 파일 부재 전용 조건이 회복 경로를 막을 수 있으며, Agent가 작성한 앱 파일이나 Core 상태를 adapter가 대신 수정해서는 안 된다.
- **결정:** 앞선 T19-N 잠금 준비 결정의 native 전용 정확한 네-flag 명령 `pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile`을 **기존 잠금 갱신에도** 허용한다. Core가 발급한 단일 canonical workspace의 foreground/one-time permission/timeout 검증은 유지한다. 루트 `package.json`과 기존 `pnpm-lock.yaml`이 각각 일반 파일, 단일 hard-link, 비-symlink여야 하며 `.npmrc`, `.pnpmfile.cjs`, `pnpm-workspace.yaml`은 여전히 없어야 한다. 일반 `pnpm install`, `pnpm add`, 명령 연결, background나 다른 경로는 추가하지 않는다. 잠금 갱신은 설치/검증 성공이 아니므로 뒤이어 `pnpm install --frozen-lockfile`와 실제 build/test/smoke가 필요하다. 이미 workspace 설정이 있는 앱의 잠금 갱신은 이번 조건으로 해결하지 않고 제한으로 보고한다.
- **검증:** 허용/거절 unit fixture는 초기 준비, 기존 일반 lock 갱신, 설정 파일, package/lock symlink 및 hard-link, 명령/flag/cwd/timeout 경계를 확인한다. 별도 무해한 `/private/tmp`의 pnpm 11.12.0 실제 fixture에서 새 local 의존성을 선언한 뒤 같은 네-flag 명령이 lock을 갱신하고 dependency install script sentinel을 실행하지 않았으며, 명시적으로 그 synthetic dependency의 build를 거절한 다음 frozen install이 성공했다. 이 fixture는 생성 Project C의 실제 Agent 재시도나 설치 성공을 대신하지 않는다. 기존 CLI/Crew 경로와 Core schema는 불변이다.

## 2026-09-13: T19-N Builder mutation의 빈 collection 무손실 운송

- **실측:** 첫 fresh Task의 native Builder는 `update_build_context` 세 번을 `SCHEMA_SHAPE`로 거절당했고 Core 에러에는 필수 `activeDecisionIds`와 `relatedFiles`가 함께 언급됐다. 기존 매우 좁은 Core-owned 빈 Decision 복구는 Agent-authored `relatedFiles`가 배열로 존재해야만 작동하므로 세 입력에서 `INPUT_NOT_ELIGIBLE`로 정상 중단했다. 이후 Agent가 실제 `package.json`을 쓰고 관련 파일을 명시해 Context v1·v2를 저장했으나 `request_user_decision` 첫 호출도 `SCHEMA_SHAPE`였다. 설치 Kiro 1.0.794의 SchemaStream이 빈 JSON 배열·객체를 삭제하는 동작은 별도 pinned 합성 재현이다. 이 개별 요청의 모델 원토큰은 수집하지 않았으므로 원인 단정은 하지 않는다.
- **결정:** native stdio MCP의 Builder mutation 네 도구 `update_build_context`, `request_user_decision`, `apply_decision_result`, `complete_task`에만 `inputJson` 문자열 envelope를 광고한다. 원래 Core JSON Schema를 도구 설명에 그대로 제공하고, 최대 128 KiB의 Agent-authored JSON 객체만 파싱해 원래 role-bound Core 도구에 보낸다. 빈 collection이나 의미 필드를 adapter가 생성하지 않는다. envelope 경로에서 legacy `activeDecisionIds` 복구와 관련 skip 진단은 건너뛴다. `get_builder_task`·`start_task`·`get_decision_result` 및 다른 role/Core 계약은 바꾸지 않는다.
- **검증 경계:** synthetic codec 3/3에서 네 도구의 원래 schema 광고, 빈 배열/객체 roundtrip, 빠진 필드가 빠진 채 남는 점, wrapper 형식/크기 거절을 확인했다. 원래 도구 schema 직렬화 크기는 2.4/7.0/5.7/8.1 KiB로 광고 상한 64 KiB 이하다. format/lint/diff check가 통과했다. 현재 live Builder run은 이전 MCP catalog로 시작돼 이 변경을 사용하지 않는다. bundle 적용 후 새 native run의 실제 Core receipt가 있어야 성공이다.

## 2026-09-15: Learning Spec의 예상 Decision은 없을 수 있음

- **상태:** 사용자 승인. 분리 worktree에서 검증 중이며 실제 Kiro IDE turn 결과와 구분한다.
- **맥락:** Spec의 `expectedDecisions` 최소 1개 제약은 실질적인 갈림길이 없는 작은 앱에서도 Discovery가 교육용 선택지를 만들도록 압박한다. 이는 실제 Decision만 묻고 Decision 수를 성공 지표로 삼지 않는 기존 결정과 맞지 않는다.
- **결정:** `expectedDecisions` 필드는 계속 필수 배열로 보존하되 0~20개를 허용한다. 이미 의미 있는 제품·기술 분기가 보일 때만 후보를 쓰고, 없으면 `[]`로 둔다. 빈 예고는 Build 중 새로 생긴 실제 Decision을 금지하지 않는다. Builder의 실제 요청, 사용자 선택, 적용 및 Golden Path의 최소 한 번 실제 Decision 검증은 유지한다.
- **검토한 대안:** 모든 Spec에 후보 1개 강제, 정답형 구현 질문으로 할당량 채우기, Builder Decision 경로 제거.
- **tradeoff:** 일부 Project에는 Decision이 없을 수 있어 일반 Project의 Decision 수로 성공을 판정할 수 없다. Golden Path는 실제 갈림길을 가진 시나리오에서 별도로 검증하고, 빈 예고 Spec과 실제 갈림길 Spec을 함께 평가한다.

## 2026-09-15: JUSTIFIED_DECISION Evidence의 저장된 사용자 이유 검증

- **상태:** T19-N Evidence 의미 회귀의 좁은 Core hardening 승인, 분리 worktree에서 검증 중.
- **맥락:** 직접 인용 exact-substring 검사는 인용이 USER_MESSAGE에 존재함을 보장하지만 실제 선택과 사용자가 제시한 이유가 있었는지는 보장하지 않는다. 그 결과 자기 설명이 실제 선택 없이 `JUSTIFIED_DECISION`으로 오수락될 수 있다. 반대로 모든 자연어 예측·적용을 구조화 Event가 없다는 이유로 거절하면 현재 제품의 사용자 발화 기반 Evidence 정책과 충돌한다.
- **결정:** `JUSTIFIED_DECISION`만 좁게 강화한다. Proposal은 같은 Episode의 실제 `USER_DECISION`을 직접 인용해야 하고, 대응하는 `DECISION_RESOLVED` Event와 같은 project/task/correlation scope의 저장된 사용자 `DecisionResolution`을 가져야 한다. resolution에는 비어 있지 않은 사용자 rationale이 있어야 하며 Proposal의 원래 표현과 Evidence 인용은 그 resolution의 rationale 또는 custom proposal에 실제 포함돼야 한다. Application이 기존 transaction에서 해당 Task aggregate의 resolution을 읽어 pure domain evaluator의 내부 입력으로 전달하며 Agent wire contract와 DB schema는 바꾸지 않는다. 근거가 없거나 scope·인용이 맞지 않는 `JUSTIFIED_DECISION`은 거절하고 다른 Signal로 자동 변환하지 않는다.
- **유지하는 경계:** `REPHRASE`와 기존 독립적 `PREDICTION`의 정책 상한은 바꾸지 않는다. 자연어로 보고한 실제 수행·결과의 `APPLICATION`도 일괄 금지하지 않는다. Analyst prompt는 같은 발화 안에서도 미래 계획과 이미 수행한 적용을 claim별로 분리해야 하지만 deterministic Core가 일반 문장을 regex로 의미 판정하지 않는다. completed user-action Event는 더 강한 provenance가 필요한 경우의 후속 tradeoff이며 이번 승인 계약이 아니다.
- **데이터·검증:** 기존 오수락 Evidence와 파생 상태는 소급 수정·삭제하거나 새 성공 근거로 재사용하지 않는다. 새 clean fixture와 domain/application negative·positive test로 cited Event, stored resolution, rationale, scope와 exact quote 연결을 검증한다. source/fixture test를 native model 준수나 실제 사람 학습 결과로 표시하지 않는다.

## 2026-09-15: pin한 native IDE panel의 독립 VSIX와 무재생 재연결

- **상태:** T19-N P1 source·패키징 경계 승인 및 검증 완료. 일반 profile 설치·활성화와 live 회귀는 별도 승인 전이다.
- **결정:** native IDE panel은 macOS arm64의 Kiro IDE 1.0.437 / extension-host API 1.109.5 / Kiro Agent 1.0.794 / Node.js 24.19.0 exact source에 pin한 독립 VSIX로 패키징한다. extension bundle·Webview·독립 stdio Core bridge·build 시점 canonical Agent prompt를 package root에 포함하고 manifest SHA-256, regular non-symlink single-link file과 package-root containment를 activation 전에 검증한다. Node binary는 포함하지 않고 machine configuration의 `/opt/homebrew/opt/node@24/bin/node`와 exact version을 확인한다. digest는 publisher signature나 authenticity 증명이 아니다. 지원하지 않는 source·OS·architecture·version·Node·asset은 fallback하지 않고 fail-closed한다.
- **재연결:** backend connection/token 또는 instance가 바뀌면 read는 새 descriptor에서 한 번만 재시도하고, 응답 유실 가능성이 있는 mutation과 진행 중 SSE/native turn은 자동 replay·reattach하지 않는다. panel-owned stream을 중단한 뒤 connection generation마다 durable History·Project snapshot·Analysis/Evidence·run 목록 restore 하나만 수행한다. recovery 중 새 mutation은 queue하지 않고 명시적으로 재시도를 요구한다.
- **설치 경계:** packaging은 extension 설치, Kiro profile, vendor extension, workspace trust, hook, security/global 설정 또는 backend lifecycle을 바꾸지 않는다. 향후 별도 승인된 설치는 선택한 profile의 이 extension 등록·활성화만 범위로 삼는다. 최소 zip archive를 공식 `vsce package`와 동등하다고 주장하지 않으며 Kiro install parser acceptance, 일반 설치 macOS 회귀, Windows, backend 독립 distribution과 CLI 기본 경로 교체는 미완료다.

## 2026-09-15: 4시간 최소 실측 뒤 IDE-only frontend 전환 판단

- **상태:** 사용자 승인, 09:58~13:58 UTC의 bounded 판단 진행 중. T19-N은 `[~]`이고 기존 CLI/Crew source는 보존한다.
- **결정:** 이미 입증한 native 가능성을 다시 탐색하지 않는다. 일반 profile의 기존 0.1.2 package와 한 창 protected built-in H 경로에서 새로 승인된 Task 하나를 사용해 실제 Builder 작업과 겹친 late Helper 성공을 세 번 반복하고, 소유 H cancel의 terminal 확인 뒤 같은 pair 재사용, 새 Core Decision의 사용자 rationale 포함 해결과 후속 Builder의 `get/apply` receipt를 우선 검증한다. 세 Builder run이나 예산 실패를 인위적으로 만들지 않는다. P2는 깨끗한 Analyst 의미 회귀만 bounded 재평가한다. 각 단계는 UI 상태, backend run/Decision/Task와 binding, sanitized 동일 `windowId` receipt가 함께 맞아야 통과다.
- **전환 기준:** 위 P3/P4 실제 lineage가 안전하게 통과하면 IDE-only frontend 구현을 pin한 macOS 실험 경로에 우선 착수할 수 있다. 이는 CLI 기본 실행기 삭제나 일반 출시 판정이 아니다. 진행 중 SSE/mutation 재연결 live race, backend 독립 배포·onboarding, private Kiro API/고정 버전, Windows, 장기 안정성과 정밀 CLI latency/cost 비교는 명시적 제한 또는 후속 gate로 남긴다. 안전·권한·데이터 경계나 실제 실패는 시간 절약을 이유로 숨기지 않는다.
- **중단 기준:** 오래된 거절 Decision/Task를 우회해야 하거나, 다른 workspace/global 설정을 바꿔야 하거나, 취소 ACK·binding revoke·동일 창 격리·새 Decision provenance가 확인되지 않으면 live 확장을 멈추고 그 정확한 blocker를 frontend 인계에 기록한다. 상세 순서와 PASS/STOP 표식은 [4시간 계획](spikes/T19_NATIVE_IDE_ONLY_4H_CUTOVER_PLAN_20260915.md)을 따른다.

## 2026-09-23: Windows 우선 확장 설치와 런타임 재사용

- **상태:** 사용자가 Windows 중심 실사용, Kiro 확장 설치만으로 backend 작동, 기존 런타임 재사용과 필요한 도구만 자동 준비하는 방향을 승인하고 문서 반영·브랜치 판단·commit을 요청했다. 이 commit은 문서 인계이며 Windows 구현·실측 또는 배포 완료가 아니다.
- **맥락:** frontend의 [연결 요청서](https://github.com/Hello-KU-tty/program/blob/main/BACKEND_CONNECTION_REQUEST.md)는 local Core/connection 파일/macOS pin을 요구한다. 현재 Core endpoint와 descriptor 생성은 있으나 SDK 연결만으로 native worker가 제공되지는 않는다. Mac의 repository checkout·수동 `core:native`는 개발 재현 경로이며 새 제품 설치 완료 조건을 충족하지 않는다.
- **결정:** 확장은 UI·SDK·compiled Core·native worker/bridge·권한 코드·canonical prompts·SQLite driver/migrations를 제공하고 별도 Core process를 자동 관리한다. Windows x64를 첫 검증 대상으로 삼고 ARM64는 별도 검증한다. host runtime → 기존 호환 Node → 확장 전용 portable Node 순서로 검증·재사용하며 Node 전체를 VSIX에 기본 포함하지 않는다. 설치된 SQLite를 탐색하거나 storage를 재작성하지 않고 해당 플랫폼 `better-sqlite3` binary만 배포한다.
- **버전 정책:** 사용자 runtime은 검증된 호환 범위를 허용한다. 현재 repository 개발 pin·frozen install·preflight는 그대로이며 Windows에서 pin 문제를 재현하면 별도 결정과 regression 후 변경한다. SQLite의 Node-API 10 및 실제 load/transaction, Kiro private API·권한/source 지원은 독립 gate다. Node runtime 대체는 CLI/다른 LLM provider fallback 승인이 아니다.
- **Builder 구분:** extension backend가 Kiro runtime을 재사용하더라도 생성 앱의 shell/build/run에 Node/pnpm이 있다는 뜻은 아니다. 기존 호환 도구를 우선하고 없는 도구만 사용자 전용 폴더에 준비한다. 별도 global installer, 관리자 권한, 전역 PATH 수정과 사용자 설치 덮어쓰기는 요구하지 않는다. 프로젝트 의존성은 generated workspace에서 기존 lifecycle allowlist로 설치한다.
- **참고 근거:** [ESLint client](https://github.com/microsoft/vscode-eslint/blob/main/client/src/client.ts)와 [languageclient](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/node/main.ts)의 editor runtime/fork, [.NET acquisition](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/commands.md)의 기존 탐색·user-level install, [Java extension](https://github.com/redhat-developer/vscode-java#setting-the-jdk)의 embedded JRE와 project JDK 구분을 2026-09-23 조회했다. [Electron runAsNode](https://www.electronjs.org/docs/latest/tutorial/fuses#runasnode)는 비활성화될 수 있어 Windows Kiro의 지원을 별도로 측정한다. 이는 Kiro public Agent API 또는 해당 dependency 추가 승인이 아니다.
- **용량 관측:** 공식 npm `better-sqlite3-13.0.3.tgz`의 `prebuilds/win32-x64.node`는 압축 전 1,989,632 bytes다. Node 24.19.0 win-x64 전체 ZIP의 Content-Length는 37,304,352 bytes였다. 실제 VSIX/설치 디스크/RAM 측정값과 구분하며 총 용량 목표를 측정 없이 보장하지 않는다.
- **대안과 tradeoff:** 모든 Node/OS binary를 포함하면 offline 최초 기동은 단순해지지만 중복 용량이 늘어난다. 설치된 Node만 요구하면 초보자의 무설치 경험이 깨진다. editor runtime 우선은 패키지를 줄이지만 host compatibility 검증이 필요하고, 조건부 다운로드는 network·재시도·무결성 관리가 필요하다. runtime 파일 재사용이 별도 Core process의 메모리 사용량을 없애지는 않는다.
- **진행 경계:** [Windows 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)와 T19-W0~W5로 요구·artifact 목록·수직 흐름 검증을 관리한다. 기존 T19/T19-N 미완료와 Evidence quality 제한을 유지한다. 과거 macOS-only/fixed-path 결정은 그 baseline의 관측으로 보존하며, 제품 설치 목표는 이 결정이 갱신한다. runtime/Agent gate를 삭제해 성공으로 만들지 않는다.

## 2026-09-23: Windows 작업은 native recovery에서 분기

- **결정:** `codex/kiro-native-recovery-20260913`의 `21674e8`에서 `codex/windows-extension-runtime-20260923`을 만든다. native 구현 baseline은 `445497b`이고 그 뒤 세 commit은 frontend 방향 문서다. 확인 당시 `main`은 `c8b3425`로 native baseline을 포함하지 않으므로 Windows 작업의 출발점으로 쓰지 않는다.
- **이유:** recovery branch의 macOS 검증 근거를 보존하면서 Windows runtime·설치 변경을 독립적으로 검토·회귀할 수 있다. Core/frontend 계약을 보존하고 Windows 결과가 나온 뒤 통합 여부를 판단한다.
- **Git 범위:** 이번 사용자 요청은 새 branch와 문서 commit까지다. 기존 untracked 실험 파일·생성 runtime·개인 설정은 보존하되 commit하지 않는다. remote 변경·push·PR·merge는 이번 작업에 포함하지 않는다. Windows에서 remote branch를 받으려면 별도 허용된 push/전달이 먼저 필요하다.

## 2026-09-24: W1 Windows runtime 재사용과 native capability 판정

- **상태:** 사용자 승인 [W1 계획](T19_W1_WINDOWS_CAPABILITY_PLAN.md)의 8개 native turn과 회귀/종료 감사를 완료했다. [결과와 한계](spikes/T19_W1_WINDOWS_CAPABILITY_RESULTS_20260924.md), [sanitized receipt](spikes/T19_W1_WINDOWS_RECEIPTS_20260924.json)를 근거로 W1만 완료하고 W2를 다음 작업으로 둔다.
- **runtime:** 설치된 Kiro IDE 1.1.14 / Agent 1.1.28 / API 1.131.0 / Windows x64에서 extension-host의 Node 24.18.0·Electron 42.7.0·NAPI 10을 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` child로 재사용할 수 있었다. 실제 win32-x64 SQLite transaction/reopen, Core/SDK와 stdio bridge가 통과했다. 개발 pin 24.19.0/11.12.0은 별도로 충족했으며 바꾸지 않는다. 다른 product runtime 후보나 ARM64를 검증했다고 확대하지 않는다.
- **Windows 경계:** private directory/descriptor의 owner·DACL 검증을 추가하고 unsafe ACL/junction/hardlink를 거절한다. cloud session hash는 설치 source에 맞게 drive 경로의 slash/lowercase를 정규화한다. CRLF·separator·fixture portability를 고쳤고 canonical prompt 정책, dependency/lifecycle 허용 범위는 유지한다.
- **native 동시성:** 한 창의 custom Builder/Helper queue는 여전히 직렬이었다. 이 Agent 버전은 `agentArtifacts`를 항상 켜는 승격 목록에 포함하여 과거 stable-empty-experiments 가정이 성립하지 않는다. 기존 protected built-in Helper를 Windows에 그대로 허용하지 않는다. 합성 profile에서 별도 Development Host를 만든 뒤 Helper의 empty catalog/all-deny, 별도 windowId와 실제 응답 중첩을 확인했다. 이는 **두 창 capability 관측**이며 제품 UX 채택 승인이 아니다. W3의 source gate와 lifecycle/UX 설계에 이 제한을 명시한다.
- **판정 경계:** Discovery는 10 preview 제출, Builder는 별도 seeded Task에서 두 파일·검증 exit 0·Context v2, Helper는 실제 Core context/저장, 취소 후 새 실행·binding 401을 검증했다. 최종 harness의 기본 test reporter 오판은 원본 FAIL을 보존하고 같은 hash 파일의 TAP 9 tests 및 DB/ACL 감사를 별도 PASS로 남겼다. `pnpm check`, panel build 및 CJS 18 tests는 통과했다. 실제 사용자 Evidence, Analyst 의미 품질, clean Windows 설치·자동 Core lifecycle·전체 수직 흐름과 기존 T19/T19-N의 완료는 별도다.
- **진행 경계:** W1용 진단만 새 Windows source SHA에 pin한다. 기존 제품의 Mac exact source gate는 보존하며 W2에서 검증된 portable descriptor/package를 구현한다. 추가 모델 turn, IDE 변경, commit/push는 이번 승인에 포함하지 않는다.
