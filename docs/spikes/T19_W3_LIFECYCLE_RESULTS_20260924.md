# T19-W3 Windows 확장 lifecycle 결과

> 2026-09-24 · **W3 완료**, W4 다음 착수. [계획](../T19_W3_LIFECYCLE_PLAN.md), [구현·재현 인계](../T19_W3_LIFECYCLE_HANDOFF.md), [sanitized receipt](T19_W3_LIFECYCLE_RECEIPTS_20260924.json).
> W3 범위는 통합 확장 자동 기동·연결·복구다. 생성 앱 도구는 W4, 개발 도구 없는 clean Windows 전체 수직 흐름은 W5로 남는다.

## 구현과 실제 결과

| 항목 | 검증 결과 |
| --- | --- |
| 설치 | 일반 Kiro의 별도 합성 profile에 제품 VSIX와 검증기 VSIX 설치·activation PASS. Development Host가 아닌 일반 창 사용 |
| 제품 패널 | 실제 Discovery·Spec·Builder·Helper·History UI와 lifecycle/retry 통합. 사용자 server 실행·connection 경로 입력 없이 Core 연결·History 조회 PASS |
| native gate | Kiro 1.1.14 / Agent 1.1.28 / API 1.131.0의 설치 source hash, 사용자 Workspace Trust, custom Agent mode·권한·catalog 검증 |
| runtime | Kiro child Node 24.18.0으로 Core·bridge 실행. 개발 pin Node 24.19.0 / pnpm 11.12.0 유지 |
| 실제 Discovery | native preview 요청 SUCCEEDED, preview 10개와 Project durable 저장 PASS |
| 실제 Helper | 합성 Task context에서 native 요청 SUCCEEDED / HELPER_RECORDED, 응답 durable 저장 PASS |
| 보조 창 | Helper 요청 시 Core 발급 workspace를 자동으로 열고 서로 다른 windowId의 두 창이 같은 Core instance를 사용함을 확인 |
| 주 창 종료 | owner 창을 닫고 Helper 창만 남긴 뒤 35초 이상 같은 Core health/instance 유지 PASS |
| 마지막 창 종료 | Helper 창 종료 후 grace 안에 SQLite/owner lock 정리, stopped owner archive와 해당 Core PID 종료 PASS |
| startup 경쟁 | 한글·공백 경로의 checkout 밖 package에서 두 manager가 동시 초기화해 단일 Core를 공유 PASS |
| reload/crash | owner manager 해제·재연결, 실제 Core process 종료 후 새 instance/token, 이전 token 거절과 동일 Project/Discovery 복원 PASS |
| update | 다른 package의 active owner 보호, 이전 owner 종료 후 synthetic forward migration·backup·기존 데이터 보존, 구버전 schema 거절 PASS |
| no replay | 응답 유실 mutation·SSE rotation 자동 재전송 금지, read-only durable 복원 회귀 PASS |

Discovery와 Helper는 별도 합성 lineage다. Helper Task 준비는 검증 fixture이며 Builder가 완료한 Task나 사용자의 학습 Evidence로 계산하지 않는다. W3에서 Builder와 Helper 모델을 실제로 겹쳐 실행한 것은 아니며, Windows 두 창 병행 capability는 W1 실측을 따른다. W3는 busy Builder host에서도 Helper 창을 열고 추가 role을 claim하지 않는 라우팅을 회귀 test로 확인했다.

Helper/Analyst의 파일·shell·웹 접근은 허용하지 않으며, Helper MCP는 Core가 발급한 scope로 제한한다. Windows custom Agent 경로를 추가하면서 macOS protected built-in gate와 canonical prompt/version을 완화하지 않았다.

## 산출물

- 제품: `dist/portable-win32-x64/vibe-helper-portable-core-0.2.0-win32-x64.vsix`
- VSIX **2,133,254 bytes**, 설치 파일 합계 **6,581,155 bytes**, archive **69 entries**.
- SHA-256: `b343af4156bcc91df970f4bb628d0bf4c35c712eff477a1bf5113fbf57d78e11`.
- build receipt의 `W3_IMPLEMENTED_REQUIRES_RECEIPT`는 build 자체가 live 실행을 주장하지 않는 상태다. 실제 검증은 이 문서와 별도 receipt를 따른다. `W5_PENDING`은 유지한다.

사용자 대화 원문·개인 경로·credential·DB는 제출물에 포함하지 않았다. 일반 사용자 Kiro profile과 전역 PATH를 변경하지 않았고 dependency 설치·prompt 변경·commit·push·공개 배포는 하지 않았다.

## 실패와 보정

1. Windows endpoint의 drive letter 대소문자 때문에 실제 workspace가 있어도 `NATIVE_WORKSPACE_NOT_BOUND`로 실패했다. canonical 경로 비교와 중복 endpoint 거절을 검증했다.
2. Helper 창은 열렸지만 Kiro Agent의 command/endpoint 등록보다 claim이 빨라 `NATIVE_IDE_TURN_FAILED`가 발생했다. Windows에서 폐기된 readiness command를 제거하고 모델 요청 전 endpoint 준비를 bounded read-only 대기로 확인하도록 수정했다. 실패한 run은 재생하지 않았다.
3. 첫 Helper 성공 뒤 owner 창 종료 검증은 `CORE_CONNECTION_UNAVAILABLE`로 실패했다. manager dispose만으로는 실제 host 종료를 증명하지 못했다. managed child를 창의 process group에서 분리한 뒤 새 Helper 요청과 실제 두 창 종료 검증이 모두 통과했다. 기존 native PASS receipt는 창 lifecycle PASS로 간주하지 않으며 최종 harness도 두 결과를 분리한다.
4. 초기 검증기의 `modelCalls`는 Discovery 요청만 세어 Helper 실행에서 0으로 표시됐다. 현재는 `nativeRequests`로 명명하고 두 종류 요청을 모두 센다. 이는 provider 내부 모델 호출 횟수가 아니다. 과거 0을 모델 미사용 근거로 해석하지 않는다.
5. Windows의 실제 ACL subprocess 준비가 relay integration의 1초 polling 제한을 넘었다. gate를 생략하지 않고 Windows 대기 예산을 늘리고 worker 수를 제한했다. Playwright 실행 경로와 개발 도구 pin을 명시해 전체 검증을 재실행했다. 중단·절전·부하에 따른 이전 실패는 최종 통과와 구분한다.
6. 최종 전체 검사에서 preview 즉시 선택 E2E의 background fixture가 1.2초 뒤 stale snapshot을 제출하는 경쟁이 재현됐다. 선택 완료를 확인할 때까지 background 응답을 명시적으로 보류하고, 실제 background 시작 후에 선택하도록 fixture를 바꿨다. 제품 성공 조건을 완화하지 않았으며 같은 시나리오 3회 반복을 통과했다.

## 검증과 잔여 범위

- 전체 `pnpm check`: format/lint/typecheck/db, unit 92, integration 274 + 기존 skip 1, eval 34, Campus Drop 3, build, smoke 6, E2E 12 PASS.
- `pnpm panel:pack:windows`: 최종 VSIX archive/hash 검증 PASS.
- packaged manager lifecycle: 7개 receipt 그룹 PASS. 위 실제 Kiro 창 검증과 구분한다.
- 관련 panel CJS: 22 tests PASS. native-client 집중 회귀: 43 tests PASS. 기존 macOS panel build·relocated activation PASS.

W3는 위 범위만 완료한다. W4의 생성 TypeScript 앱 Node/pnpm 전달·실행, W5의 clean 설치 전체 Discovery→Spec→Builder/Helper→Decision→결과→Evidence/개인화, 기존 T19/T19-N의 Evidence 품질·private API 지원·OS confinement 한계는 남는다.
