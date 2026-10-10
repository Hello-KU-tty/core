# 현재 Windows 프론트 인계 구현 결과

2026-09-26. 사용자 지시대로 다른 기기·외부 환경 검증은 제외하고 현재 PC에서 실제로 적용 가능한 kit을 구현했다. 시작점은 `FRONTEND_WINDOWS_QUICKSTART.md`다. 압축 파일 내부에서는 `README.md`를 따른다.

## 전달 상태

- UI 독립 `createFrontendHost()`와 구조 타입 `CoreClient`: runtime/Core/worker 자동 준비, source gate, 상태·rotation 구독, readiness guard와 lease 종료. 기존 참조 패널도 같은 host 사용.
- 검토된 `program` revision `73d0eb58e374357d6f28ea8db13e9b659cec5e5a`용 11개 파일 패치와 원본 hash 검사 적용 스크립트.
- SDK·portable·license·확인용 VSIX 0.3.16과 frontend 제품 VSIX 조립 스크립트. 제품 package에 DB/credential/connection descriptor/개인 경로를 넣지 않는다.
- `dist/frontend-handoff-20260926.zip`과 파일별 hash manifest. 압축 파일 자체의 크기·SHA-256은 `dist/frontend-handoff-receipt.json`에 생성한다. 저장소 전달본은 `releases/frontend-handoff/20260926/`에 ZIP과 receipt를 함께 둔다.
- 사용자 요청에 따른 전달 branch는 `codex/windows-extension-runtime-20260923`이다. 소스 구현을 먼저 commit하고 그 commit을 기준으로 kit을 재생성한 뒤 전달 파일을 별도 commit한다. ZIP과 receipt의 `backendHead`는 소스 commit이며, `backendWorkingTreeDirty: false`로 고정한 전달본을 사용한다. 이전 문서 commit `59fa0e35dbd4ea0dbda3353eadecf57c477816a3`만 받아서는 이번 구현을 사용할 수 없다.

## 현재 PC 검증

| 검증 | 결과 |
| --- | --- |
| 실제 frontend TS/CJS/esbuild | TypeScript 검사와 두 번들 생성 PASS. 프론트 package-lock의 기존 TS 5.4.5·esbuild 0.21.5 사용 |
| frontend 기존 회귀 | 29 files / 228 tests PASS |
| 실제 frontend controller/port + HTTP/SSE/SQLite Core | 서로 다른 Project/Session, 지연된 preview/JIT/Spec, SELECT 뒤 Spec 1회, session/spec revision 분리, stale conflict, 확정·Task, 재생성 port의 History, Agent 실패·취소, controller Project ID 확인 PASS. Agent는 지연 deterministic fixture |
| 실제 프론트 VSIX 설치·native | Windows x64 / Kiro 1.1.70 / Agent 1.1.158에서 Core 자동 기동·Kiro runtime 재사용·WORKER_READY. 실제 Agent 4회 모두 SUCCEEDED/DURABLE_RESULT. 후보 10개 → JIT/선택 → Spec 1 → 수정 2 → 확정/Task READY → History 조회 중 새 run 0 |
| host/CJS 회귀 | 110 tests PASS. 새 host의 중복 prepare·Trust/source 거절·read-only History·실패/종료 포함. connection 세대 교체와 mutation 무재전송 검증 포함 |
| kit 적용·제품 조립 | 원본 frontend에 `--check`→적용 PASS, 기존 npm cache만 사용한 `npm ci --ignore-scripts`·typecheck·build·제품 VSIX 조립 PASS. 재적용과 수정된 원본은 덮어쓰지 않고 거절 |
| packaged Core lifecycle | 8 checks PASS: 동시 초기화, 공유 소유권, crash/credential 회전과 History, update 대기/backup, downgrade 거절, 상태의 민감 정보 제외 |
| backend 전체 검사 | format/lint/typecheck/DB/build PASS, unit 113, integration 298 + 기존 skip 1, eval 35, Campus Drop 3, smoke 6 PASS. 마지막 E2E는 미설치 기본 Chromium으로 launch 실패 후 설치된 Edge 채널로 해당 단계 12 PASS |

새 native 검증의 첫 시도는 합성 폴더가 신뢰되지 않아 `NATIVE_WORKSPACE_TRUST_REQUIRED`, Agent 요청 0회로 차단됐다. 다음 시도는 사용자 위임에 따라 **격리 shared-data DB에 해당 합성 workspace 하나만 trust**로 기록했다. trust 자체를 끄거나 일반 profile의 설정을 수정하지 않았다. 지원 pin과 권한 gate는 그대로다.

native 검증물: backend `docs/spikes/T19_FRONTEND_HANDOFF_NATIVE_20260926.json`, 소비 검사: `docs/spikes/T19_FRONTEND_HANDOFF_CONSUMER_20260926.json`. kit에는 같은 JSON을 `verification/native.json`, `verification/consumer.json`으로 제공한다. 설치된 제품 host와 동일한 frontend adapter를 driver가 호출했다. 수동 화면 클릭 전수 검사나 다른 PC 검증을 완료했다고 주장하지 않는다.

검증한 frontend 제품 VSIX의 SHA-256은 `88128313ffee4834ae49c84b401ad412725a3aa283bbca572e817cb806bc0ab5`, 참조 VSIX 0.3.16은 `fc997ef724c4879bedeba381464f169d2433ce98b9c92b93ca1af59164bea53d`다. 코드·manifest 변경으로 다시 빌드하면 해당 재생성 receipt 값을 사용한다.

kit을 원본에 적용해 조립한 결과는 native 검사물과 실행 JS·portable 자산이 byte 단위로 같았고 package.json은 Git의 줄바꿈 차이만 있었다. 이후 선택 후보의 revision을 엄밀히 비교하는 보수적 guard를 추가하고 실제 Core 소비 검사로 재검증했다. 이 마지막 stale guard에 대해 추가 모델 실행을 반복하지 않았다. frontend main은 인계 시점에도 검토 revision과 동일함을 `ls-remote`로 확인했다.

## 남은 작업

이번 인계는 프론트의 연결 작업을 시작할 수 있는 기준이다. 기존 Discovery·Spec·History는 적용 패치로 동작하며, Builder/Helper 화면·Decision·결과/Evidence/Final Upgrade의 UI 연결은 프론트가 SDK와 실행 참조로 이어갈 작업이다. 제품 모드에서는 이 화면의 기존 Demo 실행을 차단했다.

백엔드의 성능, Analyst 의미 품질과 개인화 효과 개선은 병행한다. 기존 W5 Helper catalog 한 차례 실패와 보조 창 복구 절차도 유지한다. T19/T19-N 전체와 MVP 완료로 표시하지 않는다.

재현 명령은 `pnpm frontend:handoff`, `node scripts/test-program-consumer.mjs <program-path>`, `node scripts/test-program-host.mjs <Kiro.exe> <program-path> <program.vsix>`다. 실제 native 명령은 합성 profile에 설치하고 모델을 호출한다. 현재 기기의 전체 회귀는 `VIBE_E2E_BROWSER_CHANNEL=msedge` 환경에서 `pnpm check`로 실행한다.
