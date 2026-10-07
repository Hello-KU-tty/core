# 새 세션 인계 — 백엔드 전달 완료, 프론트 연동·Windows 검증 준비

이 문서는 2026-09-28 Mac 개선 작업과 Git 전달이 끝난 뒤 작성했다. 새 세션은 이전 대화 전체를 복원할 필요 없이 이 문서와 아래 지정 문서에서 시작한다. 이 문서 자체를 작성한 것은 새 Goal·프론트 수정·유료 실측을 시작했다는 뜻이 아니다.

## 1. 현재 상태와 확정 기준

- 백엔드: `Hello-KU-tty/core`, remote `origin = https://github.com/Hello-KU-tty/core.git`.
- 브랜치: `codex/windows-extension-runtime-20260923`.
- 전달 완료 커밋: `5af5eb0c4bcc095cfab3fc2066cd63d0556767fc` (`perf(core): improve Mac runtime and frontend recovery reliability`). `@hurdooagent`로 push했고 원격 branch SHA와 일치함을 확인했다.
- 이전 비교 기준: `04117c520c10e732af709b0d064c020d1d001e55`. 성능 비교 도구 일부는 이 Git object를 읽으므로 정상 이력이 필요하다.
- 이번 커밋은104개 파일이다. 기존 `.vscode`, 과거 native probe/Helper host/parser 실험 등 미추적40개 파일은 **의도적으로 제외·보존**했다. 새 세션에서 `git add .`, `git clean`, reset으로 함께 올리거나 삭제하지 않는다. 현재 상태는 매번 다시 확인한다.
- Mac Goal은 사용자의09:50경 조기 마무리 요청으로 **complete**다. 옛09시/10시 마감이나 Goal objective의 날짜 오기를 새 실행 지시로 해석하지 않는다. 새 시간제 Goal은 사용자가 다시 요청할 때만 설정한다.
- 제품 수정과 Mac 검증은 완료했지만 **이번 변경의 Windows 실측·새 kit/VSIX·프론트 직접 수정은 아직**이다. T19/T19-N과 MVP 전체를 완료로 표시하지 않는다.
- 이전 일지·receipt·프론트 답변의 ‘미커밋/미푸시’는 Mac Goal 종료 당시 snapshot이다. 현재 Git 전달 상태는 위 `5af5eb0`이 갱신한다. 역사적 receipt를 새 Windows 성공처럼 다시 쓰지 않는다.
- 이 인계 문서는 `5af5eb0` 이후의 별도 로컬 문서다. 새 세션 시작 시 이 문서의 commit/push 여부도 확인한다. 문서 작성 요청만으로 추가 push를 수행하지 않았다.

## 2. 먼저 읽을 것

1. 현재 저장소의 `AGENTS.md`, `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TASKS.md`. T19/T19-N 상태와 `[>]`/`[~]` 작업 규칙을 따른다.
2. [Windows 재개 지침](WINDOWS_RESUME_20260928.md): 전달 후 환경·검증·패키징 순서.
3. [프론트 후속 답변](FRONTEND_LIVE_TEST_RESPONSE_20260928.md): B1–B5, 실제 오류코드, PREVIEW 재시도 계약.
4. [최종 Mac 인계](../../spikes/T19_MAC_PERFORMANCE_HANDOFF_20260928.md): 채택·기각, 측정 범위, Windows 명령. 필요할 때만 [상세 대조](../../spikes/T19_FRONTEND_LATE_LIVE_TRIAGE_20260928.md)와 [정제 receipt](../../spikes/T19_MAC_PERFORMANCE_RECEIPTS_20260928.json)를 읽는다.
5. 프론트 수정에 착수하면 사용자가 지정한 별도 `Hello-KU-tty/program` clone의 `AGENTS.md`와 해당 저장소의 명세/작업 지침, 최신 `BACKEND_LIVE_TEST_ISSUES_20260928.md`도 읽는다. 백엔드 지침만으로 프론트 규칙을 대신하지 않는다.

과거 장시간 실험 일지와 중간 resume 체크포인트 전체를 처음부터 다시 읽을 필요는 없다. 새 작업에 필요한 실패/채택 근거가 있을 때 해당 절만 확인한다.

## 3. 사용자의 다음 의도와 두 저장소 작업 경계

사용자는 Windows에서 백엔드 평가를 이어갈 예정이며, 프론트 담당자의 크레딧 부족 때문에 우리가 프론트 수정까지 맡는 방안을 검토했다. 권장 방식은 **program을 core 안에 중첩하지 않고 별도 clone으로 두고, 한 세션에서 양쪽 계약을 함께 점검하는 것**이다. 아직 사용자가 영구 프론트 checkout 경로를 알려주지 않았고 프론트 구현은 시작하지 않았다.

- 현재 OS, 두 checkout의 절대 경로·branch·HEAD·dirty 상태·remote를 먼저 확인한다. 프론트 경로가 없으면 요청한다. 사용자가 추가한 폴더라고 하더라도 실제 쓰기 권한을 확인하고, 밖의 경로에 대한 sandbox 거절을 우회하지 않는다.
- 이전 임시 program clone은 읽기 전용 consumer 참조용이었다. 새 수정 checkout으로 자동 전환하지 않는다.
- 백엔드/프론트 변경·검사·커밋은 저장소별로 구분한다. 다른 담당자/에이전트가 같은 branch나 파일을 동시에 고치지 않도록 확인한다. 별도 에이전트 위임이 기본 승인된 것은 아니다.
- 기존 core 브랜치에 대한 직전 push는 사용자에게 방식을 확인받아 완료했다. 이를 program push나 향후 모든 push의 포괄 승인으로 확대하지 않는다. GitHub 에이전트 계정은 `@hurdooagent`, 본계정은 `@hurdoo`이고 토큰은 출력/기록하지 않는다.
- 다음 세션에 주어진 실제 요청이 작업 범위를 정한다. 검토만 요청받았다면 수정하지 않는다. 프론트 수정 승인 후에는 아래 우선순위의 기존 계약 내 수정부터 진행한다.

## 4. 우선순위와 완료 조건

### P1. 프론트의 실패 후 명시적 PREVIEW 재시도

가장 구체적으로 재현된 미해결 문제다. backend는 같은 Project/DiscoverySession에서 새 idempotency key로 PREVIEW를 재시도할 수 있다. 하지만 기존 program의 `LocalCoreDiscoveryPort.previews`가 이전 실패 run ID를 기억한다. 단순히 `generatePreviewRound()`를 다시 호출하면 옛 run을 기다리며, 다른 경로로 새 run이 성공했어도 원래 port는 옛 오류를 표시한다.

수정할 때 최신 코드에서 문제를 다시 확인하고 다음 계약을 유지한다.

- 사용자 명시적 재시도만 새 요청을 만든다. History restore·화면 재진입·실패 조회만으로 모델을 자동 호출하지 않는다.
- 먼저 durable 상태와 최신 Session revision을 restore한다. 저장 preview가 있으면 재사용하고, active run이 있으면 다시 붙는다. 확정 Spec/Task가 있으면 PREVIEW를 새로 만들지 않는다.
- 새 시도에만 새 key를 만든다. 응답 유실 시 새 key로 자동 재전송하지 않는다.
- 수락된 새 run ID로 Session→run cache를 갱신하고 그 run을 watch한다. 실패해도 Project/Session을 버리지 않는다.
- 성공은 Core terminal status와 durable 결과를 함께 확인한다. Core run 기록은 최대100개이고 eviction/restart 때 key도 사라지므로 영구 idempotency라고 가정하지 않는다. `RUN_NOT_FOUND_RESTORE_PROJECT`는 restore 후 사용자의 새 시도로 처리한다.

완료 조건: 기존 실패 재현 검사, 새 run 수락·cache 갱신·성공 표시, 중복 클릭/응답 유실/기존 active run/재로드/취소 회귀, restore만으로 호출0을 실제 adapter/controller와 Core 경계에서 검사한다.

### P2. 오류·업데이트 대기·Trust 안내

- B1: 알려진 structured RPC type을 backend가 고정 코드로 분류한다. `PortError.message`에 코드가 남지만 기존 상위 분류는 `unknown`이다. quota/auth/access/model/rate/service/unknown의 안전한 안내를 분리한다. provider 원문·토큰·민감 경로는 UI로 보내지 않는다.
- worker의 `AGENT_FAILED_*` 뒤 `AGENT_SESSION_CLOSED_DISCOVERY`가 마지막 상태가 될 수 있다. session closed는 성공이 아니다. **Core run status/errorCode가 실패 판정 기준**이다.
- B2: `CORE_UPDATE_WAITING_FOR_OWNER_EXIT`를 기존 Core 사용 창의 정상 종료 대기로 안내한다. 설치 경로가 다르면 같은 package bytes라도 old lease를 갱신하지 않는다. 시작 예산45초, 마지막 lease 뒤 기존30초 유예이며 shared PID 강제종료/lock 삭제를 하지 않는다. 준비 성공 시 errorCode가 null로 해제된다.
- B4: `NATIVE_WORKSPACE_TRUST_REQUIRED`와 일반 `WORKSPACE_SWITCH_UNCONFIRMED`를 구분한다. Trust가 없어도 History 읽기는 가능하다. 자동 Trust 승인·원래 폴더 자동 복귀를 추가하지 않는다.

### 별도 결정 또는 Windows가 필요한 항목

- 재시작 후 durable 실패 History, Project abandon/delete API는 **미구현**이다. 저장/schema/API·데이터 삭제 의미가 달라지므로 P1에 몰래 포함하지 말고 별도 범위 승인을 받는다.
- Windows 실제 RPC가 structured type을 보존하는지 아직 모른다. service log에 quota가 있어도 RPC가 정보를 잃으면 generic을 유지한다. quota를 일부러 소진하지 않는다.
- 실패 즉시 Core grant401/공개route404/descriptor REVOKED는 검증했다. Windows 잔여 bridge PID·role 파일 종료/보존과 Enterprise 정책 영향은 미확정이다. 권한 회수와 프로세스 종료를 혼동하지 않는다.
- 프론트는 마지막 확인 main `0858811195753e5c7312a79f3aede53c9aff9571`, 실제 consumer는 `cce7751dcd40732c700f5576a088ebdf6f91fac7`이었다. 두 버전의 controller/port/vendor는 같았지만 최신 UI 전체는 실행하지 않았다. **새 세션에서 최신 원격/차이를 다시 확인**한다.

## 5. 완료한 변경·검증을 다시 망가뜨리지 않기

- Core 최근 이력 전용 조회, request-local 중복 검증 제거를 채택했다. 마지막 합성1,000 Concept의 재구성 reference 비교는 restore139.345→9.665ms, 별도 Episode 단일 Concept Evidence114.954→1.499ms였다. 전체 응답·상태 동등성을 확인했지만 HTTP/모델/Windows 전체 속도가 아니다.
- B2 설치/runtime identity, lease maintenance 직렬화/종료 전 drain, B1 bounded 오류 분류, Mac ESM bridge/catalog, Builder 빈 문자열 재개, Helper 복원/취소 경계를 수정했다.
- 최종 prompt: Discovery1.3.5, Builder1.3.10, Helper1.2.0, Analyst1.0.8. 기각한 prompt archive는 제품으로 복원하지 않는다. Analyst1.0.8은 출력 구조 개선 한정이며 미래 계획을 실제 수행 Evidence로 오인하는 의미 오류는 남아 있다.
- Git 전달 전 **선택한 추적 파일만 새 디렉터리에 복사하고 frozen install**한 검사도 PASS: unit130+3SKIP, integration325+8SKIP, eval41, Campus3, smoke6, E2E12. 별도 panel161+2SKIP, 측정도구34, panel build, actual program consumer PASS.
- consumer는 실제 program 코드+인증 HTTP/SSE+SQLite지만 Agent 경계는 delayed deterministic fixture다. native 모델 성공으로 세지 않는다. Windows SKIP도 PASS가 아니다.
- 측정도구 첫 clean-copy 실행은 Git metadata 부재로1개 실패했다. 원본 기준 object를 읽기 전용으로 제공한 재실행은34PASS였다. Windows에 기준 Git 이력을 가져가면 되며 검사를 완화하지 않는다.
- local protocol1, SDK·revision/idempotency·provenance·read-only Helper/Analyst·Builder 생성 workspace 제한을 유지한다. Agent 코드/카드 클릭만으로 사용자 이해 상태를 높이지 않는다. 새 dependency/DB migration은 이번 Mac 작업에 없었다.

## 6. 실행 환경·검사

Node24.19.0/pnpm11.12.0을 사용하고 preflight를 우회하지 않는다. 새 clone 설치는 `pnpm install --frozen-lockfile`. Mac에서는 이전에 PATH 앞에 `/opt/homebrew/opt/node@24/bin`을 사용했지만 새 세션의 실제 설치를 확인한다. Windows에 Mac PATH를 복사하지 않는다.

```text
pnpm preflight
pnpm check
pnpm panel:build
node --test examples/kiro-panel/test/*.test.cjs
node --test scripts/native-json-envelope.test.mjs scripts/native-discovery-enrichment.test.mjs
node --test scripts/benchmark-reference-source.test.mjs scripts/native-helper-cancel-observation.test.mjs
node scripts/test-program-consumer.mjs <PROGRAM_CHECKOUT>
```

- Mac 기존4173 서버를 보존하려고 `VIBE_E2E_FRONTEND_PORT=4183`을 사용했다. 새 환경의 포트를 확인하고 사용자 서버를 임의 종료하지 않는다. GUI 권한 부족을 앱 결함이나 PASS로 바꾸지 않는다.
- consumer의 새 checkout에는 `.data/frontend-handoff` 부모 디렉터리를 먼저 준비한다. 위 `<PROGRAM_CHECKOUT>`은 실제 확인한 별도 프론트 경로로 바꾼다.
- 프론트 자체 검사 명령은 program의 현재 package/config에서 읽는다. 마지막 임시 clone의537 tests PASS를 최신 frontend 전체 검증으로 대신하지 않는다.
- Windows exact gate는 Kiro1.1.70/Agent1.1.158/API1.131.0 기준이다. Mac 실측은 Kiro1.0.437/Agent1.0.794/API1.109.5였다. 양쪽 버전/실행 결과를 섞지 않는다.
- Mac의 Windows portable build 조기 거절은 의도된 source 검증이다. Windows Node SHA/license gate를 우회해 cross-build하지 않는다. 기존 `frontend:handoff`가 참조하는20260927 metadata를 새 Windows PASS처럼 사용하지 않는다. 새 Windows 검사→새 receipt/inventory→새 kit/VSIX가 필요하다.

## 7. Kiro 예산·현재 실행 상태

- 사용자의 이전 한도는 **계정 누적900크레딧**이지 추가900이 아니다. 보수적 신규 호출 중단선880, 사용량 관측 유효기간15분을 적용했다.
- Mac 계정 마지막 관측은815.91@2026-09-28 08:33:55 KST/overage disabled. **지금 잔량으로 사용할 수 없는 과거 값**이다. 프론트 보고1000/1000 계정과 합치지 않는다.
- 이전 Mac 유료 모델 호출은07:27 이후 없었다. 프론트 후속 수정·Git 전달 검사는 모델0이었다. 새 유료 실측은 사용할 계정·현재 사용량·새 예산/시간을 먼저 확인한다. 확인 전에는 모델0 검사만 한다. overage·요금제·계정 정책을 변경하지 않는다.
- `benchmark-native-*.mjs`는 유료 호출용이고 지난 Mac09:00 마감 guard가 남아 있다. 지금 재사용하려고 단순히 날짜/guard를 늘리지 않는다.
- 승인받았던 실험 개발 창과 소유 Core는08:41에 종료했다.09:50 검사에서 active lock 없음/listener 연결거절/SQLite50테이블 불변/quick_check ok/FK0이었다. 사용자의 일반 Kiro 창과 기존 서버는 종료하지 않았다. 새 세션에서는 현재 프로세스를 재확인한다.
- 원본 artifact는 로컬 임시 디렉터리 `vibe-helper-perf-20260928.RKh4au`에 보존했다. Git에는 DB·connection descriptor·token·raw 대화가 없다. 이 디렉터리 접근은 같은 Mac에서만 가능할 수 있으며 Windows 실행에 필수는 아니다. 임시 파일은 기본적으로 삭제하지 않는다.

## 8. 새 세션의 첫 응답/산출물

1. 위 핵심 문서와 실제 두 저장소 상태를 읽고, 완료된 사항과 새 작업 범위를 짧게 확인한다. 프론트 경로/권한만 빠졌으면 그 정보만 요청한다.
2. 최신 frontend에서 P1/P2의 재현과 필요한 최소 변경을 제시한다. 구현 승인이 있으면 회귀 테스트부터 추가해 수정한다. 추가 성능 탐색이나 새로운 저장 API로 범위를 넓히지 않는다.
3. repo별 변경 파일·검사·미해결 Windows 항목을 남긴다. 처음에는 실제 모델 호출0으로 진행할 수 있다. 실제 native 결과 없이 완전 연결 성공을 선언하지 않는다.
4. Windows에서는 이 커밋을 포함하는 소스와 새 frontend 변경을 함께 평가한다. 양쪽 commit SHA·패키지 버전·검사 receipt를 연결하고, 새 push/실측은 해당 요청 범위와 권한을 확인한다.
