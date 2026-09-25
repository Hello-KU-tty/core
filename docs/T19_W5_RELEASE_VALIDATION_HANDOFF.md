# T19-W5 설치 검증 인계

> T19-W5 검증 완료. 외부 배포·상위 MVP 전체 완료와는 구분한다. 최신 근거는 [1.1.70 일반 모드 최종 결과](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md), 범위는 [계획](T19_W5_RELEASE_VALIDATION_PLAN.md)을 따른다.

2026-09-25 최종 설치물은 **0.3.15**다. Kiro **1.1.70 / Agent 1.1.158 / Windows x64**의 정확한 source pin을 일반 설치에서도 지원한다. 새 Personal Need 양쪽 프로젝트의 실제 수직 흐름·앱 실행·History·취소·재시작·최종 회귀를 검증했다. Need 있음의 후속 Helper는 MCP catalog 사전 실패 1회 뒤 전용 보조 창을 닫고 새 질문 1회로 복구했다. 해당 제한을 숨기거나 자동 mutation 재전송으로 처리하지 않는다. 외부 debug/실행 정책 flag는 필요 없으며 Windows 영구 정책과 일반 Kiro profile은 변경하지 않았다. 설치물 hash·크기·지원표·실측은 최종 결과를 따른다. 아래 진단 전용/미완료/승인 대기 기록은 모두 과거 시점이다.

일반 사용자는 Kiro에 VSIX를 설치하고 신뢰한 작업 폴더에서 Vibe Helper 패널을 연다. Node/pnpm·Playwright 수동 설치나 별도 Core 실행은 요구하지 않는다. 도구가 필요하면 확장 전용 위치에 준비한다. 현재 최종 검증은 기존 Edge를 사용했으며 별도 Chromium 다운로드는 없었다.

다른 기기에서 개발을 이어갈 때는 [재개 인계](CROSS_DEVICE_HANDOFF_20260924.md)의 checkout·도구 준비·새 합성 환경 절차부터 시작한다.

## 2026-09-25 Kiro 1.1.70 진단 재개

**최신 진행:** 추가 승인 대기를 해제하고 프로세스 범위 RemoteSigned로 실제 terminal 출력·성공/실패 이벤트를 확인했다. 원본 Task는 15번째 Builder의 원본 build/typecheck/17 tests/HTTP smoke 검증 후 COMPLETED, 16번째 후속 Helper와 분석 3건·HTTP 200·History 무재실행까지 PASS다. [프로세스 검증 결과](spikes/T19_W5_WINDOWS_PROCESS_SHELL_RESULTS_20260925.md)를 따른다. 아래 승인 대기·Task ACTIVE·14회 기록은 이전 시점이다. 새 Personal Need 유무 흐름과 일반 지원 판정은 진행 중이다.

**환경 정정:** 현재 PC는 사용자가 Kiro부터 새로 설치한 clean Windows 검증 환경이다. 이전 기기의 “별도 환경 없음”을 적용한 판단과 별도 PC/VM 또는 gate 분리 질문은 철회한다. 이후 검증용 임시 도구 준비는 초기 환경과 구분한다. 환경 확보와 전체 제품 흐름의 통과 여부는 별개이며 완료 기준은 변경하지 않는다.

**최신 인계:** 사용자 “지금 버전으로 w5 완료해” 후 0.3.11을 실제 업데이트하고 13·14번째 Builder를 별도 receipt에서 수행했다. 원본 앱의 세 오류는 실제 Builder가 수정했으며 변경 없는 복사본의 6개 명령·17 tests·HTTP smoke/결과 감독기 PASS다. 원본 Task는 terminal 출력/종료값 누락 때문에 ACTIVE다. 실제 TEXT 후 취소 PASS(응답 9ms), 최신 lifecycle 8개·portable 11개 PASS다. 아래 12회 소진 문단은 이전 판단 시점의 기록이다.

현재 blocker는 Windows 기본 PowerShell Restricted 정책에서 Kiro 제공 shell integration 스크립트가 UnauthorizedAccess/PSSecurityException으로 로드되지 않는 것이다. 기본 terminal API도 30초 내 준비되지 않았다. 다음 명령은 정책·profile·모델을 변경하지 않고 이를 재현한다: `node scripts/probe-windows-shell.mjs '<Kiro.exe>'`. `dist/windows-shell-preflight-receipt.json`의 SCRIPT_BLOCKED/exit 2는 관찰된 차단이며 `SCRIPT_LOADABLE`도 interactive native 검증을 대신하지 않는다.

검증 terminal process에만 RemoteSigned를 적용하는 비교는 사용자에게 질문했고 **아직 승인받지 않았다**. 현재 PC가 clean Windows라는 확인은 실행 정책 변경 승인으로 해석하지 않는다. 일반 1.1.70 지원의 debug Cloud 증거 의존, 양쪽 fresh 완주·후속 Helper는 남아 있다. 이전 모델 요청이나 완료 기록을 재전송하지 말고, 새 조건 승인 후 새 receipt에서 재개한다.

검증 Kiro 창과 대기용 test process는 종료했고 임시 진단 driver는 해당 합성 profile에서 제거했다. 이번에 만든 `User/settings.json`도 정확히 빈 설정인 것을 확인해 제거하여 원래 상태로 복원했다. `dist/managed-host-location.json`의 PID는 종료된 값이고 receipt는 14번째 원본 FAIL이다. root의 기존 일회성 intent는 소비됐으므로 `.data`의 이전 복구 스크립트를 그대로 재실행하지 않는다. 추가한 읽기 전용 사전검사와 문서의 format/lint/diff 검사는 PASS다.

최신 후보는 **VSIX 0.3.11**, 실측·코드 보완은 [1.1.70 호환성 기록](spikes/T19_W5_KIRO_1170_COMPATIBILITY_20260925.md)과 [정제한 후속 receipt](spikes/T19_W5_KIRO_1170_ADAPTATION_RECEIPTS_20260925.json)를 따른다. 아래 1.1.14 결과는 과거 검증 범위로 보존한다.

**현재 재개 기준:** PowerShell 승인 대상은 개발 환경에서 상속된 PSReadLine 형식 파일로 확인했고, 검증 자식 환경의 `PSModulePath`만 제거해 해결했다. `--recover-shell-from`은 기존 Node/pnpm을 유지해야 하므로 `--without-project-tools`와 함께 쓰면 안 된다. 실제 11번째 요청은 이 옵션 조합 실수로 모델 전 실패했다. 마지막 12번째 Builder는 기존 도구로 실행했지만 CP949의 UTF-8 batch 한글 경로 오류로 미완료였다. 0.3.11은 코드페이지 저장/복원과 정확한 이전 launcher/shim migration을 보완했고 전체 check/CJS 105개를 통과했다.

명시적 요청 한도 12회는 소진됐다. 현재 `dist/managed-host-location.json`은 **종료된** 검사 host와 마지막 원본 FAIL receipt를 가리킨다. 반복 실행하지 말고 사용자 판단 뒤 새 bounded 계획과 receipt로 시작한다. 원본 Task ACTIVE·기존 생성 source는 유지했다. 모델 없는 별도 복사본은 타입 guard와 test glob 두 곳을 보완한 뒤 build/typecheck/17 tests, 제품 ResultRuntimeSupervisor HTTP 200/close를 통과했다. 원본 컴파일 오류·test script 오류와 생성 smoke의 `UV_HANDLE_CLOSING` 종료 assertion은 각각 실패 근거로 남겼다. 이 수동 결과를 Agent의 Task 완료 또는 fresh 수직 완주로 해석하지 않는다.

1.1.70은 `--kiro-1170-diagnostic`을 명시한 합성 검사 host에 한정한다. 이 옵션은 그 process에 source-profile opt-in과 `KIRO_LOG_LEVEL=debug`를 전달한다. 새 Cloud 검사는 로그의 양성 증거가 필요하므로 일반 설치를 지원한다고 표시하지 않는다. 기존 사용자 profile 설정은 변경하지 않는다.

현재 PC의 전체 검증은 `VIBE_E2E_BROWSER_CHANNEL=msedge`로 설치된 Edge를 임시 profile에서 재사용할 수 있다. 기본 Chromium 설정은 유지하며 추가 브라우저 다운로드는 필요하지 않다. source build는 여전히 Node 24.19.0/pnpm 11.12.0과 frozen lock을 요구한다. 재사용 Node 옆에 LICENSE가 없으면 `VIBE_NODE_DISTRIBUTION_LICENSE`에 공식 v24.19.0 LICENSE 경로를 지정한다. 고정 hash를 통과해야 패키지에 들어간다.

**과거 0.3.10 초기 continuation:** Task ACTIVE / `TASK_COMPLETION_NOT_RECORDED`였다. native 파일 작성 후 PowerShell 승인 입력에 막혔으며 원본 실패 기록은 보존한다. 다음 문단은 UI 연결이 막혔던 당시 기록이다. 현재 승인 대상과 추가 진단 결과는 위 재개 기준을 따른다.

사용자의 보안 알림 닫기 후 화면에서 해당 알림 부재를 확인했다. 검증용 Kiro 창 활성화는 창 목록 재조회·재선택 후에도 `failed to activate captured window`로 실패했다. 기존 합성 session shell 출력에는 `[V]/[D]/[R]/[A]` 선택지만 있고 대상 파일·게시자는 없으며 host의 terminal/pty 로그는 비어 있다. `.kiro/vibe-tools.cmd` 자체가 승인 대상이라고 단정하지 않는다. 사용자에게 검증 창 선택과 Ctrl+J 패널 열기만 요청했으며 승인 선택·새 모델 요청·보안 설정 변경은 하지 않았다.

## 환경별 판정

| 환경/항목 | 확보한 범위 | 남은 확인 |
| --- | --- | --- |
| Windows x64 build 26200, Kiro 1.1.14 / Agent 1.1.28 | W1~W4 및 W5 Personal Need 복구 흐름 Task 완료·HTTP 200·History | 최신 버전의 양쪽 fresh 흐름과 반복성 |
| 일반 VSIX, 별도 합성 profile, 한글·공백 경로 | checkout 밖 설치·Core/SQLite·Spec/Builder/Helper/분석 실제 native 복구 완주 | 전체 GUI 조작 및 질문 응답을 포함한 새 실행 |
| 프로세스 PATH에 개발 Node/pnpm 없음 | private 도구 획득과 결과 HTTP는 W4에서 검증; 현재 0.3.11 portable 11개 PASS | 설치물의 독립 실행 근거와 검증 도구를 구분 |
| 현재 clean Windows PC, Kiro 1.1.70 / Agent 1.1.158 | 사용자 확인: 비개발 PC에서 Kiro 신규 설치부터 시작; 이후 임시 검증 도구 준비 | 현재 환경의 terminal 문제 해결·양쪽 fresh 전체 흐름 |
| 다른 Kiro/Agent 버전, Windows ARM64 | 미검증 | 지원으로 표시하지 않음 |
| macOS 기존 native 경로 | 과거 T19-N 결과만 보존 | 이번 Windows 변경으로 재검증한 것이 아님 |
| Agent 의미 품질·실제 사람 학습 | contract/fixture 및 합성 입력과 구분 | 기존 T19-N 품질 gate 유지 |

## 현재 PC 재현

repository 개발 pin인 Node 24.19.0/pnpm 11.12.0을 먼저 만족시킨다. `pnpm check`, `pnpm panel:pack:windows`, `node --test examples/kiro-panel/test/*.test.cjs`를 실행한다. 제품에는 검증 driver를 넣지 않는다.

실제 Kiro 설치 경로를 인자로 다음 명령을 실행한다. 명령은 합성 profile과 새 receipt를 만들고, installed SDK/Core를 통해 실제 native 요청을 보낸다. `--personal-need`를 생략한 경우와 포함한 경우를 각각 기록한다.

```powershell
node scripts/test-managed-host.mjs '<Kiro.exe의 실제 절대 경로>' --vertical --without-project-tools --personal-need --hold
```

`--reuse '<이 검증기가 만든 임시 root>'`는 기존 합성 profile에 새 receipt/Project로 새 실행을 시작한다. 기본 모드는 실패한 mutation을 이어 보내는 기능이 아니다. 사용자 일반 profile이나 임의 경로를 넣지 않는다. `dist/managed-host-location.json`은 로컬 경로와 PID를 담으므로 제출물에 복사하지 않는다. 원본 receipt·DB는 private root에 보존하고 결과 문서에는 credential/개인 경로 없는 수치만 남긴다.

알려진 Builder 초기화 실패만 이어 확인하려면 `--retry-builder-from receipt-<UUID>.json`을 `--vertical --reuse`와 함께 지정한다. private root 내 원본의 hash와 terminal FAILED 응답을 새 receipt에 보존한다. 같은 Core면 이전 run을 다시 조회하고, Core가 재시작되어 transient run ID가 사라졌다면 원본 terminal 응답과 현재 복원된 Project/Task·확정 Spec revision을 구분해 검증한다. 새 Core의 active run·Decision·completion이 있거나 mutation 응답이 불명확하면 거절한다. 완료된 Discovery 요청은 다시 보내지 않는다. 최대 2회이며 제품의 자동 재시도 기능이 아니다.

완료되지 않은 Build turn에 대한 보완 검증은 `--continue-build-from receipt-<UUID>.json`을 `--vertical --reuse`와 함께 사용한다. 원본이 SUCCEEDED/TURN_ENDED 응답을 받았고 Task는 ACTIVE/완료 보고 없음, 저장된 Helper/Decision 적용이 확인된 경우만 한 번 허용한다. 현재 Task revision·Decision·Helper·active run 부재를 다시 확인하고 Build 적용만 새로 요청한다. 이전 mutation이나 선택은 재전송하지 않는다.

Workspace Trust와 계정 인증은 실제 Kiro 사용자 단계이며 설정 파일 수정으로 우회하지 않는다. `--hold` 종료 후에는 기록된 PID의 command line이 해당 합성 root를 포함하는지 확인하고 그 process tree만 닫는다. 사용자의 다른 Kiro 창은 대상이 아니다.

## 현재 clean Windows에서 남은 최종 검증 절차

1. 현재 PC의 사용자 확인 초기 상태와 OS/Kiro/Agent 버전·아키텍처, 이후 준비한 검증용 도구를 구분해 기록한다. 다른 PC/VM을 요구하지 않는다. 사용자 일반 profile과 credential을 합성 환경에 복사하지 않는다.
2. 검증할 VSIX의 `Get-FileHash -Algorithm SHA256 '<VSIX>'`를 결과 기록의 hash와 비교한다. checkout 밖의 합성 Kiro profile에 설치하며 실제 설치와 업데이트를 구분해 기록한다. 작업용 Workspace Trust는 사용자가 위임했으며 계정 인증이 필요하면 사용자가 수행한다.
3. 외부 terminal backend 없이 제품 패널의 Core/Agent 준비 상태를 확인한다. 설치 크기, 조건부 도구 다운로드, 준비 시간과 오류 코드를 기록한다. 도구를 수동 설치해 미설치 조건을 없애지 않는다.
4. 서로 다른 새 학습 목표로 Personal Need 유무 두 Project를 시작한다. preview·JIT·후보 수정/선택·Spec 수정/확정·Builder workspace 전환·실제 Decision/Helper·검증·결과 HTTP를 연결한다. 클릭/확인만으로 이해 상태가 높아지지 않는지도 확인한다.
5. 진행 중 취소, 새 실행, 창 전환, 두 창에서 같은 Core 연결, owner 창과 마지막 창 종료, 재시작 History를 확인한다. mutation 중 연결 단절을 성공으로 간주하거나 자동 재전송하지 않는다.
6. 이전 버전의 합성 데이터가 있는 경우 업데이트 전후 같은 Project/Task/History 보존과 SQLite 무결성을 확인한다. 새 설치와 업데이트 결과를 구분한다.
7. Evidence provenance, 분석 실패/복구, 다음 context의 실제 사용 근거와 답변 품질을 각각 기록한다. 합성 USER 입력은 실제 사람 학습의 증거가 아니다.
8. 설치물 hash/압축·설치 용량, 조건부 도구 용량, Core/extension-host RSS 측정 시점, 단계별 결과와 실패 원본을 기록한다. 모든 gate가 충족되기 전 W5와 상위 T19/T19-N을 완료로 표시하지 않는다.

실제 native 취소 보조 검증은 vertical 실행이 terminal인 합성 root에 `node scripts/test-installed-native-cancel.mjs "<합성 root>"`를 사용한다. 설치 SDK로 별도 Project를 만들고 실제 TEXT/TOOL 응답 후 한 번 취소한다. terminal이 먼저 오면 실패로 기록하며 재전송하지 않는다. receipt는 합성 root와 로컬 dist에 남긴다.

기존 packaged 회귀 명령은 `node scripts/test-portable-core.mjs '<Kiro.exe의 실제 절대 경로>'`, `node scripts/test-managed-core.mjs`다. 이 검증들의 PASS는 모델 기반 전체 수직 흐름 또는 clean machine PASS를 대체하지 않는다.


## 현재 남은 native 조사

0.3.7의 새 no-Personal-Need Project는 Spec의 확인 질문 무응답으로 native prompt timeout/NATIVE_CANCEL_UNCONFIRMED가 났다. 이후 별도 취소 검사 및 검증용 host 재시작 후 새 Project 모두 catalog 검증에서 모델 prompt 전에 거절됐다. catalog 0개를 관측했으며 권한 검증이나 최소 MCP tool 조건을 완화하지 않았다. 첫 session/new catalog 알림 순서 보완만으로 모든 초기화 실패가 해결됐다고 볼 수 없다.

다음 재현에서는 해당 synthetic session의 MCP bridge 시작·종료와 catalog 준비 시간/오류를 고정 metadata로 대조한다. 실제 등록 지연인지 bridge 실패인지 확인하기 전에 무한 재시도나 timeout 확대를 적용하지 않는다. 질문을 제때 처리한 fresh no-Personal-Need 완주와 실제 TEXT/TOOL 뒤 명시적 취소가 확보돼야 해당 gate를 닫을 수 있다. 기존 실패 receipt의 STARTED mutation을 지우거나 재전송하지 않는다.


최신 0.3.7 packaged lifecycle은 최초 CORE_START_TIMEOUT 뒤 제품 변경 없는 진단 재실행에서 8개가 통과했다. crash 재연결 39.1초, 업데이트 연결 45.6초 관측을 포함하므로 빠르고 안정적인 기동을 확정한 결과가 아니다. 전체 제품 코드 pnpm check와 CJS 102개는 PASS했으며 후속 검증기의 시간 기록/한도 정합은 별도 실제 실행과 Biome로 확인한다.

최신 portable 재실행도 11개 PASS했다. Kiro/기존 Node/관리 Node의 Core 준비·MCP·재시작을 검증했고, 관측 기동 시간은 7.2~35.8초다. 최초 기동 실패 원인은 이전 검증기가 timeout과 조기 종료를 구분하지 않아 확정하지 못했으며 원본을 유지한다. 설치 후보는 0.3.7, hash/크기와 전체 결과는 상단 실측 기록 및 sanitized receipt를 따른다.
