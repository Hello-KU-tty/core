# T19-W5 Windows 출하 검증 계획

> 2026-09-25 완료: VSIX 0.3.15 / Kiro 1.1.70에서 두 fresh 프로젝트와 명시적 Helper 복구, 결과 앱·History·취소·재시작 및 최종 회귀를 검증했다. [최종 결과와 한계](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md)를 따른다. 아래 미완료·중단 문단은 당시 기록으로 보존한다.

> 2026-09-25 환경 정정: 사용자가 현재 PC는 Kiro부터 새로 설치한 clean Windows라고 확인했다. 2026-09-24 이전 기기의 환경 부재 기록을 현재 PC에 적용하지 않는다. 별도 PC/VM 요청은 철회한다.

## 실행 경계

- 기존 W1~W4 변경과 데이터를 보존한다. 지정 개발 도구 Node 24.19.0/pnpm 11.12.0을 재사용하며 제품 환경과 구분한다.
- 한글·공백 경로의 새 private Kiro profile에 packaged VSIX와 별도 검증 driver만 설치한다. 제품 Core/worker/UI는 설치물에서 실행하며 사용자 기존 profile과 DB를 사용하지 않는다.
- 사람의 선택·발화는 명시적 합성 UI 입력이다. Candidate, Spec, Builder 코드/Decision/완료, Helper와 Analyst는 실제 native 실행과 durable Core 결과로 판정한다. fixture로 Agent 성공을 대체하지 않는다.
- 새 학습 목표와 Personal Need 유무를 검증한다. Candidate 수정·선택, Spec 수정·확정, workspace 전환, Builder/Helper, Decision, 결과 실행, History와 Evidence/다음 context를 단계별 기록한다.
- mutation 전 의도를 저장하고 응답 불명확 요청을 자동 재전송하지 않는다. 일시적인 조회 오류는 같은 Core instance/run을 읽는 범위에서만 재관측하며 최초 오류를 기록한다. 재시작 후 진행 중 stream/turn 복원을 성공으로 주장하지 않는다.
- 취소·재시작·다중 창·업데이트, runtime 획득 및 권한 회귀를 검증한다. 설치물 hash·크기와 측정 가능한 process 메모리를 기록한다.
- native live 검증은 실패 원인을 먼저 조사하고 bounded 재시도를 명시한다. 계정 로그인·Workspace Trust 같은 사용자 host 단계는 우회하지 않는다.

## 완료 판정

현재 PC의 초기 clean Windows 상태와 Kiro 신규 설치는 사용자 확인을 근거로 기록한다. 이후 검증을 위해 준비한 임시 Node/pnpm·checkout·cache는 초기 환경과 구분하며, 제품의 도구 자동 준비·설치물 독립 실행은 해당 실행 receipt로 판정한다. 다른 PC/VM 확보는 남은 조건이 아니다. 현재 환경의 실제 native 실패와 frontend artifact/품질 미검증은 계속 검증한다. 통과한 contract/fixture는 실제 IDE 또는 의미 품질 성공을 대신하지 않는다. 최종 `pnpm check`와 관련 packaged/IDE 결과를 기록하고 미충족 조건이 남으면 W5를 완료 처리하지 않는다. 상위 T19/T19-N, commit/push·외부 배포는 이번 작업으로 자동 완료하거나 수행하지 않는다.

## 2026-09-24 중단 인계

- Computer Use 도구가 사용자 physical Escape에 의한 중단을 보고하여 작업을 중단했다. W5는 진행 중이며 완료가 아니다.
- 검증 driver: `examples/kiro-panel/test/windows-vertical.cjs`. `node scripts/test-managed-host.mjs "<Kiro.exe>" --vertical --without-project-tools --hold` 및 `--personal-need`로 두 합성 입력을 구분한다. Workspace Trust는 실제 Kiro 단계다. 이 driver는 제품 VSIX에 들어가지 않으며 fixture seed 없이 설치된 SDK/Core/native Agent를 호출한다.
- 첫 live 시도의 VSIX 0.3.0은 새 no-Personal-Need Project에 preview 10개, JIT, SHRINK round와 SELECT를 저장했다. SPEC은 `NATIVE_ROLE_CATALOG_UNVERIFIED`로 실패했다. 최초 기록은 로컬 `dist/w5-first-live-receipt.json`에 보존했다. 별도 첫 driver 시도는 Agent 요청 0회에서 atomic receipt rename의 EPERM으로 실패했고 bounded 파일 저장 재시도와 회귀를 추가했다.
- source에서 session/new 응답 전 catalog를 버리는 순서 문제를 확인했다. 최대 8개 session의 sanitized metadata만 일시 보존하고 RPC로 소유권이 확인된 session 하나만 반영하도록 수정했다. permission/tool 응답의 소유권 gate는 그대로다. 실제 SPEC 실패와의 인과관계는 아직 재검증하지 못했다. catalog 진단은 count/분류만 기록한다.
- 생성 project 경로가 `workspaces/projects/project_*`인데 startup이 한 단계 child만 확인하던 문제를 수정했다. Helper workspace와 무관한 폴더는 자동 패널 열기에서 제외한다.
- native-client 44 tests, panel startup/driver 5 tests PASS. `pnpm panel:pack:windows`의 지정 도구 preflight/typecheck/package 검증 PASS. 로그: `dist/w5-native-client.log`, `dist/w5-driver-tests.log`, `dist/w5-package.log`. 최종 `pnpm check`는 아직 실행하지 않았다.
- 새 VSIX: `dist/portable-win32-x64/vibe-helper-portable-core-0.3.1-win32-x64.vsix`, 2,312,988 bytes; 설치 7,423,345 bytes; SHA-256 `c038f571a762b6a0eb70dc686a2ffb332b1bf51901bee3d800213df503959da7`. 수정본의 Personal Need live 시도는 Trust 대기 중 중단됐다. 이 artifact를 출하 검증 PASS로 취급하지 않는다.
- 재개 시 기존 변경을 보존하고 새 live 요청을 명시적으로 시작한다. 실패 receipt의 `STARTED` mutation을 지우거나 재전송하지 않는다. Builder/Helper·Decision·result·History·Evidence/개인화와 종료/업데이트/RSS, 양쪽 입력의 실제 완주 및 clean machine gate를 계속 확인해야 한다. 사용자 데이터, commit/push는 변경하지 않았다.

## 재개 기록

사용자 `resume`으로 작업을 재개했다. 위 중단 시점의 결과는 과거 기록으로 보존하며 이후 결과는 [W5 실측 기록](spikes/T19_W5_WINDOWS_RELEASE_RESULTS_20260924.md)에 누적한다. 재개 후 실제 private path 검사가 정상 DACL에서도 PowerShell 시작 지연으로 5초를 넘는 것을 재현했다. 권한 조건은 유지하고 검사 timeout과 판정 오류를 구분하는 0.3.2를 준비한다. synthetic profile 재사용 시 새 receipt와 새 Project로 실행하며 이전 실패 mutation은 재전송하지 않는다.

2026-09-24 후속 재개: 현재 후보는 0.3.5다. 0.3.2에서 실제 Spec 생성/수정과 workspace 전환을 확인했고, 0.3.3/0.3.4 진단에서 설치 경로 갱신과 Windows PID 재사용 경계를 발견해 보완했다. packaged lifecycle 8개와 확장 CJS 100개가 통과했다. 알려진 terminal Builder 실패의 재개는 원본 hash/계보를 새 receipt에 보존하고, transient run ID와 durable Project 복원을 구분하는 검증 전용 옵션을 쓴다. 0.3.5 실제 Builder는 Core 도구 7개와 허용된 built-in catalog를 확인한 뒤 AGENT_RUNNING에 도달했다. 전체 수직 흐름/최종 check/clean 환경은 각각 후속 기록으로 판정한다.


2026-09-24 후속 실측: 0.3.6에서 기존 Personal Need Project의 bounded Build 복구가 Task COMPLETED·HTTP 200·Helper 2회·분석 4회 성공으로 끝났다. 이후 Evidence preview의 240자 경계 오류를 수정한 0.3.7을 빌드했다. 새 no-Personal-Need 실행은 Spec의 실제 확인 질문을 무인 driver가 답변하지 못해 prompt timeout/NATIVE_CANCEL_UNCONFIRMED로 종료됐다. 확인 질문과 GUI 상호작용이 필요한 구간을 합성 SDK 자동화의 한계로 기록하고 명시적 취소와 최종 설치물 회귀를 계속 검증한다.
