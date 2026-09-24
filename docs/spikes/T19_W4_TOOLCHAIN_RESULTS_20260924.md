# T19-W4 Windows 생성 앱 도구 검증

> 2026-09-24, win32-x64. 합성 TypeScript HTTP 앱과 격리된 Kiro profile을 사용했다. 현재 판정은 [TASKS](../TASKS.md), 구현·재현 절차는 [W4 인계](../T19_W4_TOOLCHAIN_HANDOFF.md), 경로·credential 없는 수치는 [receipt](T19_W4_TOOLCHAIN_RECEIPTS_20260924.json)를 따른다.

## 구현과 실제 경로

Core는 검증된 Kiro child runtime을 재사용하고, 생성 앱에는 별도 일반 Node와 pnpm descriptor를 발급한다. 기존 Node 24.18.0/24.19.0과 pnpm 11.12.0을 우선한다. 없는 도구는 private directory에 공식 배포물의 고정 hash를 확인하여 준비한다. repository 개발 pin은 Node 24.19.0/pnpm 11.12.0이다.

고정 Kiro 1.1.14/Agent 1.1.28의 native shell은 VS Code terminal 환경 collection을 사용하지 않는다. `.kiro/vibe-tools.cmd`와 packaged runner를 통해 선택된 도구와 제한된 환경을 전달한다. worker는 protected launcher와 descriptor를 검증한 뒤 기존 native one-time permission을 적용한다. 관측된 명령과 exit code는 Core의 실행 기록 검증도 거쳐 저장된다. Builder prompt는 1.3.7이다.

결과 launcher도 동일 descriptor의 일반 Node를 사용한다. Core credential, `NODE_OPTIONS`, `NODE_PATH`, `ELECTRON_RUN_AS_NODE`, 개인 npm 설정과 전역 PATH는 생성 앱에 전달하지 않는다. 새 generated workspace에는 Core의 Windows private-directory policy를 적용하며 기존 unsafe directory를 임의로 고치지 않는다.

## 실제 관측

| 검증 | 결과와 범위 |
| --- | --- |
| 기존 도구, packaged runner | PASS: pnpm.cmd 재사용, lock/frozen install/build/test/HTTP, launcher 변조·descriptor hardlink 거절 |
| PATH 도구 부재, packaged runner | PASS: private Node/pnpm 준비, 동일 다섯 명령과 실제 HTTP, 한글·공백 경로 |
| 기존 도구, 실제 native Builder | PASS: 다섯 명령 모두 exit 0, `W4_HTTP_SMOKE_PASS`, `TURN_ENDED`; result supervisor의 별도 실제 HTTP PASS |
| PATH 도구 부재, 실제 native Builder | PASS: managed Node 24.19.0/pnpm 11.12.0, 다섯 명령 exit 0와 HTTP smoke, 동일 run의 `SUCCEEDED`/`TURN_ENDED` 재관측, packaged result supervisor HTTP PASS |
| 도구 실패·복구 | PASS: offline cache 재사용, 첫 offline·hash 불일치·network 실패, 다운로드 중단·취소, 손상 cache quarantine와 검증된 재획득, 암묵적 install·허용 밖 lifecycle·npmrc 거절 |
| 전체 회귀 | 최종 `pnpm check` PASS: unit 93, integration 280+1 platform skip, eval 35, Campus Drop 3, smoke 6, E2E 12; 확장 CJS 89/89, portable package 11개 검증 PASS |

다섯 명령은 `pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile`, `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm test`, `pnpm run smoke`다. native에서는 모두 보호된 Windows launcher를 앞에 붙였다. 기존 도구 native turn 중 launcher를 사용하지 않은 명령은 거절됐고 이후 올바른 명령은 실제 실행됐다.

result supervisor 검증은 설치된 VSIX의 코드를 기존 도구 환경에서는 Kiro extension host, 미설치 도구 환경에서는 Kiro child runtime에서 호출하여 수행했다. seeded Task는 도구 검증용이므로 `complete_task`나 `UI_LAUNCH_RESULT` 성공을 주장하지 않는다. fixture·Agent 실행·도구 출력은 사용자 이해 Evidence가 아니다.

## 실패에서 확인한 수정

- 합성 fixture의 private data/agents ACL 초기화 누락, Windows resource 경로 대소문자 비교, 기존 pnpm.cmd의 Windows 인수 quoting 문제를 수정했다.
- native shell의 launcher 명령을 Core event 검증기가 거절하여 취소되는 문제가 있었다. 실행 권한과 별개인 실행 기록의 명령 검증을 맞추고 허용·체이닝·변형 경로 회귀를 추가했다.
- pnpm 11의 run/test 전 자동 dependency install은 error 정책으로 제한했다. 로컬 npmrc/pnpmfile, 허용 목록 밖 lifecycle 설정, root install lifecycle은 명시적으로 거절한다.
- 결과 도구 준비 실패는 private 진단 원문 대신 `RESULT_PROJECT_RUNTIME_UNAVAILABLE`로 반환한다.
- Golden Path 종료 시 남은 Analyst 처리가 다음 테스트에 섞이지 않도록 완료를 기다린다. 전체 flow의 테스트 시간 한도를 120초로 조정했으며 개별 제품 응답 시간 기준은 바꾸지 않았다. 역사적 prompt hash 테스트는 Windows 줄바꿈을 정규화하고 고정 hash를 유지한다.
- 빠른 preview 선택에서는 정상적인 `FIRST`와 `SELECTED` 상세화가 함께 발생할 수 있다. trace로 이 경로를 확인한 뒤 재시작 테스트는 preview 호출을, Spec 재시도 테스트는 Spec 호출을 직접 세도록 수정했다. 임의 총 호출 번호로 실패 응답을 주입하지 않는다.
- 초기 workspace 전환 경로에서 Kiro extension host가 `0xc0000005`로 종료된 시도가 있었다. 원인은 확정하지 않았다. W4의 도구 검증은 생성 workspace를 직접 열어 수행하며 Discovery→Builder workspace 전환 안정성은 W5에 남긴다. 실패 시도는 성공 receipt로 대체하지 않았다.
- 미설치 환경의 driver는 도구 준비 중 상태 조회에서 `CORE_CONNECTION_UNAVAILABLE`로 먼저 실패 처리했다. 실제 native run은 같은 Core instance에서 다섯 명령을 마치고 `SUCCEEDED`로 끝났다. 별도 관측 script가 원래 receipt를 보존한 채 동일 run의 stored events와 managed descriptor를 검증하고 Kiro child에서 결과 HTTP를 확인했다. 재전송한 Agent 요청은 0개다. 이 간헐적인 조회 실패의 원인은 확정하지 않았고 W5 안정성 점검에 남긴다.

## 남은 출하 경계

PATH에서 개발 도구를 제외한 합성 환경은 Node/pnpm이 설치되지 않은 일반 사용자 machine 자체의 증거가 아니다. W5에서 clean Windows 설치, 실제 전체 수직 흐름, workspace 전환, 업데이트와 사용자 데이터 복구를 검증해야 한다. 도구 경로가 제거·이동된 기존 descriptor의 자동 migration과 임의 package script에 대한 OS sandbox는 구현하지 않았다. T19/T19-N 또는 학습 효과를 이 결과로 완료 처리하지 않는다.
