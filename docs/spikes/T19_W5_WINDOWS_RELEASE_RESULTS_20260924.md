# T19-W5 Windows 출하 검증 기록

> 진행 중. 현재 PC의 격리 profile 실측이며 clean machine 또는 출하 PASS가 아니다. [계획](../T19_W5_RELEASE_VALIDATION_PLAN.md), [receipt](T19_W5_WINDOWS_RELEASE_RECEIPTS_20260924.json), [설치 인계](../T19_W5_RELEASE_VALIDATION_HANDOFF.md)를 따른다.

## 현재 설치 후보

VSIX **0.3.7**, 70 files, 압축 **2,317,290 bytes**, 설치 **7,435,710 bytes**. SHA-256 `a0a179dd623de0b8fa2d9bed0b58311e590bb8f08c98ac91f4945bcc8d904ebf`. 제품에는 검증 driver가 포함되지 않는다. 환경은 Windows x64 build 26200, Kiro 1.1.14 / Agent 1.1.28 / API 1.131.0, 개발 Node 24.19.0 / pnpm 11.12.0이다.

Personal Need 복구 흐름은 0.3.6에서 Task 완료·결과 HTTP·Helper/분석·History까지 통과했다. 0.3.7은 Evidence 화면 설명 길이 경계를 추가 보완했다. 이 버전의 새 no-Personal-Need 시도는 후보 생성·상세화·수정·선택 뒤 Spec 질문에 답변하지 못해 NATIVE_CANCEL_UNCONFIRMED로 종료됐고, host 재시작 후 새 실행도 모델 prompt 전 catalog 검증에서 거절됐다. 최신 버전의 양쪽 새 프로젝트 완주는 아직 확보하지 못했다.

## 실제 시도 기록

| 시도 | 관측 결과 | 범위 |
| --- | --- | --- |
| 최초 driver | Agent 전 receipt rename EPERM | 파일 저장만 bounded 재시도하도록 수정 |
| 0.3.0, Personal Need 없음 | Preview 10·JIT·SHRINK·SELECT 저장, SPEC catalog 거절 | run 시도 4개, 성공 3개 |
| 0.3.1, Personal Need 있음 | Trust 대기 중 사용자 중단 | Agent 요청 0개 |
| 0.3.1 재개 | PRIVATE_DIRECTORY_UNSAFE | Agent 요청 전 ACL inspector 조사 |
| 0.3.2 첫 실행 | Core/Project 준비 후 PREVIEW 연결 timeout | NATIVE_CONNECT_TIMEOUT, 조회 실패 0 |
| 0.3.2 단독 실행 | Preview·JIT·SHRINK·Spec 생성/수정·확정·Task·workspace 전환 성공 | 성공 run 5개, 요청 6개, Builder는 NATIVE_RPC_TIMEOUT |
| 0.3.3 첫 재개 | 재시작 후 transient run ID 소멸을 검증기가 구분하지 못함 | RUN_NOT_FOUND_RESTORE_PROJECT, 추가 Agent 요청 0 |
| 0.3.3 다음 재개 | 기존 도구 실행기가 이전 설치 경로를 참조 | PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED, 모델 prompt 전 실패 |
| 0.3.4 | 이전 Core PID를 새 Kiro utility process가 재사용 | CORE_UPDATE_WAITING_FOR_OWNER_EXIT, 추가 Agent 요청 0 |
| 0.3.5 | Core/Project 복원, 도구 경로 갱신, Builder/Decision, Helper와 선택 저장 | Decision 적용 1개, Task ACTIVE/완료 보고 없음 |
| 0.3.6 | 같은 Personal Need Project의 bounded Build 후속 실행 완주 | Task COMPLETED, 결과 HTTP 200, 분석 4개 성공, History 무재실행 |
| 0.3.7 | 새 Personal Need 없음: Preview/JIT/SHRINK/SELECT 성공, Spec 질문 무응답 | native 요청 4개, NATIVE_CANCEL_UNCONFIRMED, 질문 생성 12:57:14 UTC·prompt timeout 13:00:44 UTC |
| 0.3.7 재시작 후 새 Project | Preview 초기화 catalog 거절 | 요청 1개, 모델 prompt 전 NATIVE_ROLE_CATALOG_UNVERIFIED |

0.3.2 단독 실행의 Spec revision은 1→2였고 workspace 전환 전후 같은 Core instance를 유지했다. host activation 2회 동안 요청 수 6이 유지돼 완료된 Discovery mutation을 재전송하지 않았음을 확인했다. 당시 Builder RPC 실패의 정확한 원인은 확정하지 않았다. 0.3.5에서는 catalog 총 10개(Core MCP 7개와 read/write/shell), AGENT_RUNNING 및 실제 Decision 저장을 확인했다.

## 보완과 경계

- **catalog 순서:** session/new 응답 전 metadata를 최대 8개 session까지 보존하고 RPC로 자기 session 소유권이 확인된 목록만 반영한다. foreign permission/tool 요청에 응답하지 않는다. 0.3.2의 실제 Spec 생성/수정에서 성공을 확인했다.
- **패널:** Core의 workspaces/projects/project_*에서 다시 열며 Helper·무관한 directory는 제외한다.
- **ACL:** 정상 owner·보호 DACL·외부 Allow 0 상태에서 기존 5초 검사는 3회 false(5,769/5,374/5,306ms)였다. 검사 한도 30초와 검사 불가/UNSAFE 구분 후 같은 ACL에서 3회 true(4,615/4,778/5,191ms)였다. 권한 조건과 fail-closed를 유지하며 ACL을 자동 복구하지 않는다.
- **설치 경로 갱신:** 같은 extension parent/publisher의 더 높은 semver 경로만 허용한다. workspace·Node/pnpm·private root와 descriptor의 다른 내용이 같고 launcher가 정확한 Core 생성 내용이어야 한다. 변조·도구 변경·다른 설치·downgrade는 거절한다. launcher/descriptor atomic 교체 중간 상태는 실행을 거절하고 다음 준비에서 복구한다. 생성 source/데이터는 수정하지 않는다.
- **PID 재사용:** Windows process StartTime과 private owner 파일 기록 시각을 비교한다. 불명확한 순서·검사 실패·lock 변경은 fail closed한다. 해당 process를 종료하지 않고 기존 recover 절차로 오래된 잠금을 archive한다. 실제 다중 host의 owner 교체 경쟁은 최신 상태 재조회로 해결했다.
- **진단/검증기:** RPC timeout은 고정 operation/role만 기록하고 제품 Agent RPC 한도는 유지한다. mutation 의도를 먼저 저장하며 STARTED/응답 불명확 요청은 재전송하지 않는다. 알려진 terminal 초기화 실패만 원본 hash/계보와 함께 새 receipt에서 최대 2회 재시도한다. 같은 Core의 run 조회와 재시작 후 durable Project 복원을 구분한다. Helper 창은 두 번째 검증 flow를 시작하지 않는다.

[DECISIONS](../DECISIONS.md)에 선택과 경계를 기록했다. 실제 동시 복구의 ENOENT 실패 원본은 로컬 dist/w5-managed-recovery-race.log에 보존했다.

## 회귀 검증

| 검증 | 현재 결과 |
| --- | --- |
| TypeScript / VSIX package | PASS |
| native-client | 46 tests PASS |
| 확장 CJS 전체 | 102 tests PASS |
| 검증기 journal/retry/restart | 10 tests PASS (시도별 메모리·한 번의 미완료 Build 후속 검증 포함) |
| project tool 갱신/기존 경계 | 9 tests PASS |
| Windows PID 판정 | 4 tests PASS |
| packaged lifecycle | 0.3.7 진단 재실행 8개 PASS; 첫 실행 CORE_START_TIMEOUT 보존 |
| portable Core/SQLite/MCP | 0.3.7 재실행 11개 PASS; 최초 기동 실패 원본 보존 |
| 최종 pnpm check (0.3.7) | PASS: unit 97, integration 296+skip 1, eval 35, Campus Drop 3, build, smoke 6, E2E 12 |

packaged lifecycle 8개는 PID 재사용 복구(다른 process 유지), 두 host 단일 Core, owner reload, crash/credential 회전/History, 활성 Core 업데이트 보호, migration/backup, downgrade 거절, 상태의 경로/credential 미노출을 포함한다.

이전 전체 check는 unit 94, integration 283+skip 1, eval 35, Campus Drop 3, build, smoke 6까지 통과한 뒤 E2E에서 실패했다. 서버 기동 30초 초과, browser cache 누락, fixture 응답 전 UI 기대, test 전용 6초 deadline과 고정 1.2초 batch 지연을 구분했다. Windows webServer는 120초, test 전용 Agent deadline은 30초(제품 420초 유지), 긴 다단계 test 전체는 60초로 조정했다. 실제 chat/Core 응답과 FIRST/SECOND gate를 기다린 뒤 기존 5초 UI assertion을 적용한다. 수정 후 E2E 앞 7개와 뒤 5개가 split 실행에서 통과했다. 이후 최종 단일 pnpm check도 전체 PASS했다. Golden Path 21.1초, History 9.0초를 포함해 E2E 12개가 1.6분에 통과했다. fixture 통과를 native 의미 품질 PASS로 해석하지 않는다.

## 관측 한계와 남은 gate

- 최신 버전에서 Personal Need 유무 fresh Project 완주와 반복성: 현재는 Personal Need의 여러 버전 복구 흐름만 완주
- Windows native catalog 초기화 안정성: Spec 질문 timeout 뒤 취소 검사와 host 재시작 후 새 Project에서 NATIVE_ROLE_CATALOG_UNVERIFIED 재현
- 실제 실행 중 취소·반복 실행·전체 GUI 조작과 Agent 의미 품질: 취소 보조 검사는 TEXT/TOOL 응답 전에 native 초기화가 실패하여 취소 PASS 미확보
- Core 기동 안정성: 최신 lifecycle 최초 CORE_START_TIMEOUT 뒤 재실행 성공, 긴 연결 시간과 변동성 유지
- 전체 GUI 및 통합 frontend 실설치 검증
- 별도 clean Windows에서 개발 Node/pnpm/source 없는 설치와 frontend 연결
- OS 수준 shell confinement와 실제 사람의 학습/이해도

사용자 입력은 합성이며 Agent 결과는 실제 native 실행이다. installed SDK driver와 패널 열기 관측을 전체 GUI 클릭 검증으로 표시하지 않는다. 지정 Kiro와 다른 창을 반환한 캡처는 GUI 근거에서 제외했다. 0.3.2 extension-host RSS는 최종 258,121,728 bytes/관측 최대 261,771,264 bytes이며 Kiro/Core 전체 메모리가 아니다. 재시도 receipt의 상속된 관측과 새 host 기준을 구분한다. 총 메모리 15.6 GiB/free 약 1.0~1.4 GiB 관측은 실패 원인으로 확정하지 않았다.

실패 원본은 private root와 로컬 dist에 보존한다. 제출 receipt에는 credential·개인 경로·대화 원문을 넣지 않는다. W5 및 상위 T19/T19-N 완료 판정은 보류하며 commit/push는 수행하지 않는다.

## 0.3.6 lockfile 복구 검증

Windows 보호 runner에서 검증된 packages 점 경로 및 esbuild/better-sqlite3 설정에만 script 없는 lock 갱신을 허용한다. native guard와 host runner가 각각 검사하며 다른 native 경로는 기존 설정 부재 조건을 유지한다. 실제 copied package에서 승인 설정의 lock refresh/frozen install, 외부 lifecycle 거절, npmrc 거절, offline cache·손상/중단/취소 복구가 PASS했다. Builder prompt 1.3.8 관련 native permission/adapter/eval 55 tests PASS, driver 10 tests PASS. Evidence 조회의 TRANSACTION_FAILED는 분석 실패가 아니었다. read-only 재현에서 성공한 분석의 noEvidenceReason 440/370자가 UI emptyReason 240자 한도를 넘는 오류를 확인했다. 0.3.7은 화면 preview만 안전하게 줄이고 원문과 분석 결과를 보존한다. 짧은/긴/4,000자/Unicode 경계 포함 integration 35 tests PASS이며 이후 최신 전체 pnpm check도 integration 296+skip 1과 E2E 12를 포함해 PASS했다.

## Personal Need 복구 흐름 완주 (0.3.6)

0.3.2에서 시작한 같은 Project/Spec/Task를 이어 검증해 0.3.6에서 VERTICAL_COMPLETE/PASS를 기록했다. Task COMPLETED revision 3, Decision 적용 1개, 결과 HTTP 200/1,290 bytes, Helper 응답 2개, 다음 Helper 이후 분석 job 4개 SUCCEEDED, History 읽기 무재실행, USER_UNDERSTANDING 0을 확인했다. Concept State는 10개 모두 OBSERVED였다. source/개발 Node/pnpm은 host PATH에서 제외했고 checkout 밖 한글 profile의 실제 native 실행이다.

실제 tool stream에서 lock refresh/frozen install exit 0과 build/test/smoke의 실패 후 수정·exit 0을 확인했다. 생성 코드를 검증기가 수동으로 고치지 않았다. 후속 실행의 extension-host 관측 최대 RSS는 268,693,504 bytes다. 이전 실패와 bounded 재개를 포함한 복구 흐름이며, fresh clean 설치 또는 모든 단계가 한 버전에서 새로 성공했다는 뜻은 아니다. 원본은 dist/w5-036-vertical-pass-receipt.json과 dist/w5-036-final-observation.json에 보존했다.


## 추가 GUI 및 취소 관측

실제 제품 패널에서 History 새로고침과 진행 중 Project 선택·저장된 후보/상태 복원을 관측했다. Spec 질문은 첫 GUI 관측 전 native 240초 prompt deadline에 의해 이미 닫혀 답변 UI를 검증하지 못했다. 질문 UI 결함으로 단정하지 않는다. 무인 driver는 이 질문을 대신 답변하지 않았으며 최초 실패 원본을 보존했다.

설치 SDK를 쓰는 `scripts/test-installed-native-cancel.mjs`는 별도 합성 Project에서 TEXT/TOOL 이후 한 번 취소하고 History 읽기 무재실행을 확인하도록 만들었다. 최초 실행은 SDK metadata export 차이로 Agent 요청 전에 실패해 검증기를 바로잡았다. 실제 시도는 native catalog 거절로 모델 활동 전에 terminal이 되어 취소 PASS가 아니다. 정상 취소인 것처럼 timeout/실패를 바꾸지 않는다. host를 재시작한 새 no-Personal-Need 실행에서도 같은 catalog 오류가 모델 prompt 전에 재현됐으며 추가 무한 재시도는 하지 않았다. 원본은 `dist/w5-native-cancel-first-failure.json`, `dist/w5-037-no-need-failure-receipt.json`, `dist/w5-037-no-need-restart-failure.json`에 보존했다.


## 최신 전체 회귀 (0.3.7)

지정 Node 24.19.0/pnpm 11.12.0에서 단일 `pnpm check`가 exit 0으로 끝났다. format/lint/typecheck/DB schema, unit 97, integration 296+skip 1, eval 35, Campus Drop 3, build, smoke 6, Chromium E2E 12가 모두 통과했다. E2E 총 3.7분, History 14.1초·Golden Path 43.2초였다. 별도 CJS 전체도 102/102 PASS다. 로그는 `dist/w5-check-037.log`, `dist/w5-panel-final.log`에 있다. 실제 native 실패를 이 회귀로 상쇄하지 않는다.


## 최종 packaged lifecycle 재측정

0.3.7 최초 실행은 첫 다중 host/PID 복구 중 CORE_START_TIMEOUT으로 끝났다. 제품 변경 없이 검증기에 단계별 시간 기록만 추가한 재실행은 8개 모두 PASS했다. crash 후 연결은 한 host에서 39,069ms, 업데이트 연결은 45,583ms 관측됐다. 제품의 45초 루프 예산과 개별 검사 대기를 구분하며, 첫 실패를 해결 완료로 지우지 않는다. 기동 안정성/지연은 남은 gate다. 로그는 `dist/w5-managed-037-first-failure.log`, `dist/w5-managed-037-diagnostic.log`, 성공 receipt는 `dist/managed-w3-receipt.json`이다.

portable 검증은 최초 9개를 통과한 뒤 기존 Node 기동이 NATIVE_READY 없이 실패했다. 원본 검증기는 30초 한도 초과와 process 조기 종료를 같은 오류로 처리하므로 원인은 확정하지 못했다. 기존 제품 lifecycle은 45초이므로 검증기만 같은 예산으로 정합하고 startup 시간/실패 metadata를 추가해 한 번 재검증한다. 첫 실패는 `dist/w5-portable-037-first-failure.log`에 보존한다. 이 후속 변경은 검증기만의 변경이며 제품 Agent/기동 한도와 권한은 그대로다.


portable 재실행은 exit 0, 11개 모두 PASS였다. Kiro Node 24.18.0, 기존/관리 Node 24.19.0의 SQLite transaction/reopen 및 Core/MCP/재시작을 확인했다. native Core 기동 시간은 Kiro 14,939/21,934ms, 기존 Node 17,085/8,938ms, 관리 Node 35,769/7,171ms다. 이 중 관리 Node의 35.8초는 이전 검증기 30초 한도를 넘지만 기존 제품 45초 예산에는 들어간다. 이 관측이 최초 기존 Node 실패의 원인을 확정하지는 않는다. 조건부 관리 Core Node 실행파일은 92,825,416 bytes이고, 호환 Kiro runtime을 선택하면 이 다운로드가 필요 없다. 최종 로그 `dist/w5-portable-037-retry.log`, 원본 receipt `dist/portable-w2-receipt.json`과 sanitized receipt를 함께 보존한다.

W5는 `[~]`로 유지한다. 최신 제품 코드의 `pnpm check` 전체와 CJS 102개, 후속 검증기 Biome 검사 및 실제 portable/lifecycle 재실행은 통과했지만, fresh 양쪽 수직 흐름·native catalog 안정성·실행 중 Agent 취소·전체 GUI/frontend·clean Windows 및 기존 의미 품질 gate는 남아 있다.
