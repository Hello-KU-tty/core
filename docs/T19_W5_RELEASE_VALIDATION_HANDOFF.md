# T19-W5 설치 검증 인계

> 출하 승인이 아니다. 현재 결과는 [실측 기록](spikes/T19_W5_WINDOWS_RELEASE_RESULTS_20260924.md), 범위는 [계획](T19_W5_RELEASE_VALIDATION_PLAN.md)을 따른다.

다른 기기에서 개발을 이어갈 때는 [재개 인계](CROSS_DEVICE_HANDOFF_20260924.md)의 checkout·도구 준비·새 합성 환경 절차부터 시작한다.

## 환경별 판정

| 환경/항목 | 확보한 범위 | 남은 확인 |
| --- | --- | --- |
| Windows x64 build 26200, Kiro 1.1.14 / Agent 1.1.28 | W1~W4 및 W5 Personal Need 복구 흐름 Task 완료·HTTP 200·History | 최신 버전의 양쪽 fresh 흐름과 반복성 |
| 일반 VSIX, 별도 합성 profile, 한글·공백 경로 | checkout 밖 설치·Core/SQLite·Spec/Builder/Helper/분석 실제 native 복구 완주 | 전체 GUI 조작 및 질문 응답을 포함한 새 실행 |
| 프로세스 PATH에 개발 Node/pnpm 없음 | private 도구 획득과 결과 HTTP는 W4에서 검증 | OS 자체에 개발 도구/source가 없는 환경 |
| 별도 clean Windows PC/VM/계정 | 사용자 확인: 준비된 환경 없음 | 최종 설치 gate 미검증 |
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

## 별도 clean Windows 최종 검증 절차

1. 개발용 Node/pnpm과 source checkout이 없는 Windows x64 환경 및 Kiro 계정을 준비한다. OS/Kiro/Agent 버전과 아키텍처를 기록한다. 현재 테스트 계정의 credential/profile을 복사하지 않는다.
2. 검증할 VSIX 한 개와 공개 가능한 hash/설명서만 옮긴다. `Get-FileHash -Algorithm SHA256 '<VSIX>'`를 결과 기록의 hash와 비교한다. Kiro의 VSIX 설치 기능으로 설치하고 필요한 Trust/로그인은 사용자가 수행한다.
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
