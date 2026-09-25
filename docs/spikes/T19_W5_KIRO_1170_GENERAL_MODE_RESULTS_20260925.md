# Kiro 1.1.70 일반 설치 검증 — 2026-09-25

**판정: T19-W5 완료.** VSIX 0.3.15를 일반 설치한 Windows x64에서 새 학습 목표와 Personal Need 유무의 두 프로젝트를 실제 native Agent로 완주했다. Personal Need 흐름의 마지막 read-only Helper는 사전 MCP catalog 실패 1회 후 전용 Helper 창을 다시 열고 새 요청 1회로 복구했다. 무실패·무재시도 성공으로 기록하지 않는다. 상위 T19/T19-N, Evidence 의미 품질, 최종 frontend 디자인은 완료 판정에 포함하지 않는다.

현재 PC의 초기 clean Windows 상태와 Kiro 신규 설치는 사용자 확인을 근거로 한다. 이후 임시 개발 도구와 제품 실행 환경을 구분한다. 제품은 checkout 밖 한글·공백 경로의 합성 profile에서, 개발 Node/pnpm 없는 PATH와 외부 debug/실행 정책 환경 변수 없이 실행했다. 별도 PC/VM은 요구하지 않는다.

## 설치물과 지원 범위

- 파일: `dist/portable-win32-x64/vibe-helper-portable-core-0.3.15-win32-x64.vsix`
- SHA-256: `7f8914717bd5cb7c69687ed514988733ebeabc109e35c77145aadb72276957c8`
- VSIX 2,324,661 bytes, 설치 7,456,840 bytes / 70 files. portable payload 6,873,942 bytes / 63 files.
- 일반 사용: Kiro 설치·로그인 → VSIX 설치 → 신뢰한 작업 폴더에서 Vibe Helper 패널 열기. 별도 backend 기동, Node/pnpm 수동 설치, connection 경로 입력, Playwright 설치는 제품 사용 조건이 아니다.

| 환경 | 검증 판정 |
| --- | --- |
| Windows x64 build 26200, IDE 1.1.70 / Agent 1.1.158 / API 1.131.0 | 일반 설치 지원. 아래 Helper 연결 실패·복구 제한 포함 |
| Kiro Node 24.18.0 / Electron 42.7.0 / NAPI 10 | Core/SQLite/MCP 실제 재사용 PASS |
| 기존 Node 24.19.0 / pnpm 11.12.0 | W4 실제 native 재사용, 최신 packaged 회귀 PASS |
| 도구 없는 제품 PATH | private Node/pnpm 자동 준비와 두 실제 생성 앱 PASS |
| IDE 1.1.14 / Agent 1.1.28 | 기존 W1~W4 및 W5 복구 기록·source pin 유지. 이번 fresh 결과와 구분 |
| 다른 Kiro/Agent source, Windows ARM64 | 미지원/미검증. 넓은 semver 허용으로 바꾸지 않음 |
| macOS | 이전 T19-N 실측만 보존. 이번 Windows 변경의 재검증 아님 |

IDE commit `8ce1870416c7dc7e51fffb01765d93ef7ad55102`, Agent entry SHA-256 `cf6a5124f2fed75144b9d4236e0ffff85a5b22732d739807070783323c071b87`의 정확한 metadata/source pin을 유지한다.

## 제품 보완

- 표준 `extensionDependencies: ["kiro.kiroAgent"]`로 내장 Agent 의존성을 선언했다. Kiro source/experimental affinity/사용자 설정은 수정하지 않는다. 검증 확장만 제품 확장을 의존한다.
- Cloud config 부재와 fresh session의 명시적 `notEnabled` 양성 기록을 모델 실행 전에 확인한다. 같은 extension host의 debug는 이 구간에만 ref-counted scope로 켜고 성공·실패 모두 기존 환경으로 복원한다.
- 새 창의 이미 진행 중인 startup 조회는 이전 세션 identity와 실제 busy/queued 표식이 있을 때만 1개로 인식한다. 두 reconciliation의 `notEnabled`와 두 silent 반환이 모두 있어야 통과한다. 추가 호출·불완전 증거·fallback·변경은 거절한다.
- 신뢰된 Core 생성 Project의 realpath와 dev/ino를 확인한 뒤 공식 workspace-scoped terminal environment에 nonpersistent `RemoteSigned`를 적용한다. 부모 환경, registry, 일반 workspace와 일반 사용자 profile은 변경하지 않는다.
- Windows shell cwd의 대소문자/슬래시 차이는 동일 canonical 폴더와 dev/ino가 확인될 때만 허용한다. traversal·junction·UNC/ADS·보호 경로·명령 allowlist 경계는 유지한다.
- 긴 terminal 선행 공백을 제거한 뒤 출력 preview를 제한·redaction하여 실제 오류와 테스트 출력이 보이도록 했다. 실제 stdout과 성공/실패를 확인했다.
- 합성 Builder 입력은 실제 Decision을 기록하고 먼저 턴을 끝내도록 나눴다. Helper와 선택 뒤 구현·검증한다. canonical Agent prompt나 이해 상태 판정 정책은 바꾸지 않았다.

## 실제 두 흐름

| 항목 | Personal Need 있음 | Personal Need 없음 |
| --- | --- | --- |
| 목표·결과 | TypeScript FSM, 집안 물건 수리 단계 추적 앱 | TypeScript discriminated union, 응답 상태별 화면 앱 |
| Discovery | preview 10 → JIT → 같은 후보 축소·선택 | 동일 단계 PASS |
| Spec | 생성 → 수정 → 확정 PASS | 동일 단계 PASS |
| Decision / Helper | 실제 저장 방식 Decision 1 → 설명 → 합성 선택 → 적용 | 동일 단계 PASS |
| 실제 Builder | frozen install, build, typecheck, 14 tests, HTTP smoke | frozen install, build, typecheck, 13 tests, HTTP smoke |
| 오류 복구 | 누락된 Node types·unused import를 Builder가 수정 | Windows test directory 인자를 glob으로 Builder가 수정 |
| Core 완료·실행 | Task COMPLETED, manifest, HTTP 200 | Task COMPLETED, manifest, HTTP 200 |
| 명시적 native 요청 | 10/12: 최초 9회 중 마지막 사전 실패, 새 Helper 1회 | 9/12, 추가 복구 없음 |
| 분석 | 4 SUCCEEDED | 4 SUCCEEDED |
| 다음 Helper | EVIDENCE_AWARE, basis 2 | EVIDENCE_AWARE, basis 4 |
| 이해 상태 | USER_UNDERSTANDING 0, 2 concepts 모두 OBSERVED | USER_UNDERSTANDING 0, 6 concepts 모두 OBSERVED |
| History | 조회가 새 run을 만들지 않음 | 동일 PASS |
| 최대 관측 extension-host RSS | 478,367,744 bytes | 461,352,960 bytes |

RSS는 검증기와 내장 Agent가 함께 있는 extension-host 한 프로세스의 표본 최댓값이다. Kiro 전체 또는 Core 전체 메모리로 해석하지 않는다. Analyst 후속 실행을 모두 기다린 최종 감사에서 active run 0을 확인했다.

실제 브라우저에서 수리 앱의 Assess → Order parts → Install → Test → Done 전환, 허용된 다음 단계만 노출, 완료 뒤 버튼 부재, 새로고침 시 저장 상태 유지를 확인했다. 응답 상태 앱은 pending/success/error 표시와 reload 시 기록 초기화를 확인했다. 이 앱의 mock API는 학습용 제품 기능이며 Agent/Task 완료를 mock으로 대체한 검증이 아니다.

Kiro 최소 연동 패널에서도 History의 현재 프로젝트를 선택하여 저장된 Spec, Builder/Helper 성공 기록과 분석을 확인했다. Discovery부터의 입력은 설치된 SDK driver의 합성 UI 요청이며 전체를 수동 GUI로 수행했다고 주장하지 않는다. 실제 사람의 학습 향상·개인화 이득은 별도 품질 gate다.

## 실패와 복구 한계

0.3.15 Personal Need의 후속 Helper는 Cloud 양성 검사와 empty catalog까지 관측한 뒤, 필요한 MCP 도구가 10초 내 나타나지 않아 `NATIVE_ROLE_CATALOG_UNVERIFIED`로 모델 실행 전에 거절됐다. 같은 환경의 다른 흐름은 catalog 0 → MCP 1로 정상 진행했다. 실패 로그에는 profile의 MCP server 1개 준비가 보이지만 root cause를 단정할 증거는 부족하다. timeout 또는 gate를 완화하지 않았다.

완료된 Builder/분석을 재실행하지 않고 전용 Helper 창만 닫은 뒤 새 read-only 후속 요청 1회를 보냈다. 자동으로 열린 새 창에서 Helper와 추가 Analyst가 성공했고 기존 Task/Decision/코드를 보존했다. 원본 FAIL receipt와 복구 receipt의 hash를 모두 남겼다. 같은 증상은 **진행 중 요청이 없고 실패가 확인된 뒤 Helper 보조 창을 닫고 질문을 다시 보내는** 복구 절차를 쓴다. 장기 반복성·무인 무실패 운용은 입증하지 않았다.

이전 0.3.11 cwd 실패, 0.3.12 개발/일반 host 차이, 0.3.13 검증기 의존성 및 과거 startup 로그 혼입, 0.3.14 새 창 Cloud overlap과 도구 조건 혼합 실패도 원본 그대로 보존했다. 수동 수정 복사본, offline 재평가, model-0 검사를 fresh native 완주로 바꾸지 않는다.

## 최종 회귀와 재시작

- 0.3.15 `pnpm check` exit 0: unit 113, integration 298 + 기존 skip 1, eval 35, Campus Drop 3, smoke 6, Edge E2E 12. format/lint/typecheck/db/build 포함. 개발 Node 24.19.0/pnpm 11.12.0 pin 유지.
- 확장 CJS 106개, driver 12개 PASS. terminal 폴더 경계·정리, exact source 거절, Cloud startup/fallback/증거 누락/임시 logging 복원, cwd 경계를 검증했다.
- 최종 packaged lifecycle 8개 PASS: 다중 host, owner 종료, crash/credential 회전/History, active owner 업데이트 보호, migration/backup, downgrade 거절, redacted 상태. 업데이트 연결 약 47.5초 관측을 기록한다.
- 최종 portable 11개 PASS: Kiro/기존/managed runtime의 Core/SQLite/MCP/restart, ACL 및 경로·자원 변조, 획득·손상·중단·취소·lock 복구. 시작 표본 825~902ms. 조건부 Node 공식 다운로드 92,825,416 bytes; 전역 설치 아님.
- 0.3.15 실제 native TEXT 이후 명시적 취소 PASS: CANCELLED, 응답 9ms, Task 생성 없음, History 무재실행.
- 두 완료 프로젝트의 Kiro 종료·재개 및 별도 소유 Core crash 후 자동 복구를 확인했다. Core instance/credential 회전, Task·완료 보고·Spec·Decision·Helper 이력의 전체 비교 PASS, 새 run 0. 자동 Core 복구 5,119ms / 5,112ms.
- 검증 종료 후 두 SQLite DB의 read-only `quick_check=ok`, 해당 합성 profile 소유 프로세스 0을 확인했다. 일반 Kiro 창과 저장된 검증 자료는 유지했다. [최종 무결성·GUI·정리 감사](T19_W5_KIRO_1170_FINAL_AUDIT_20260925.json).
- model-0 실제 terminal 검사는 stdout·성공 0·실패 nonzero·복구 PASS. 독립 PowerShell 정책 전후 Restricted / 모든 scope Undefined. Kiro shell integration이 실패 코드 7을 1로 변환하므로 exact 실패 코드 보존으로 주장하지 않는다.

검증기 오류도 제품 실패와 구분한다. portable 최초 재실행은 필수 Kiro 인자를 빠뜨려 모델 0회에서 중단됐고 올바른 인자로 11개 PASS했다. 재시작 보조 스크립트는 Decision wrapper의 필드 비교를 잘못 작성해 중단됐다. 계약의 `request.id`와 전체 durable 객체 비교로 바로잡은 별도 Core crash 검사가 위 두 PASS를 생성했다.

개발 E2E에는 기존 Edge를 사용했고 별도 Chromium을 다운로드하지 않았다. 일반 사용자 Kiro profile·전역 PATH·Windows 영구 실행 정책은 바꾸지 않았다. 합성 profile/DB·실패 receipt·임시 도구 cache·Kiro 로그는 보존되어 있으므로 무흔적 실행이라고 주장하지 않는다.

## 근거와 재현

정제 근거: [adaptation receipt](T19_W5_KIRO_1170_ADAPTATION_RECEIPTS_20260925.json)의 `completedFlows`, `cancellation`, `packagedRegression`을 최종 판정으로 읽는다. `vertical`의 원본 FAIL은 그대로 남아 있다. 상세 private receipt와 재현 로그는 로컬에 보존하며 token·개인 경로·대화 원문을 공유 문서에 넣지 않는다.

```powershell
node scripts/test-managed-host.mjs '<Kiro.exe>' --vertical --without-project-tools --clean-windows-user-confirmed --personal-need --hold
```

Personal Need 없는 경우 `--personal-need`를 생략한다. 검증기 설치/빌드만 지정 개발 도구를 사용하고 제품 실행 PATH에서는 제외한다. 기존 profile에 도구 유무 옵션을 섞어 재사용하지 않는다. Workspace Trust는 사용자 위임에 따라 실제 UI에서 처리했다. 수직 검증 terminal FAIL/성공 이후에만 취소 보조 검사 `node scripts/test-installed-native-cancel.mjs '<합성 root>'`를 실행한다. 응답 불명확 mutation은 재전송하지 않는다.
