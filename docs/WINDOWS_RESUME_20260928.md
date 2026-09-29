# Windows 재개 — Mac 성능·프론트 신뢰성 수정 인계

2026-09-28 사용자가 Mac 작업 종료 후 기존 `Hello-KU-tty/core`의 `codex/windows-extension-runtime-20260923` 브랜치에 `@hurdooagent`로 commit/push하도록 승인했다. 이 문서가 포함된 커밋을 Windows의 재개 기준으로 삼는다. 새 Windows 실행·VSIX 검증 결과가 아니라 **검증할 소스 인계**다.

## 시작 순서

1. Windows 기존 변경을 먼저 확인하고 보존한다. 깨끗한 checkout에서 해당 브랜치를 fetch하고 fast-forward로 갱신한다. 로컬 변경/분기 충돌이 있으면 reset이나 강제 덮어쓰기를 하지 않는다.
2. `AGENTS.md`, `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TASKS.md`와 [최종 Mac 인계](spikes/T19_MAC_PERFORMANCE_HANDOFF_20260928.md), [프론트 후속 답변](FRONTEND_LIVE_TEST_RESPONSE_20260928.md)을 읽는다.
3. Node24.19.0/pnpm11.13.1 및 Kiro1.1.70/Agent1.1.158/API1.131.0 exact gate를 확인한다. `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm panel:build` 및 인계의 추가 CJS/consumer 검사를 실행한다. 버전 검사를 우회하지 않는다.
4. Windows portable/managed lifecycle/host/toolchain 검사를 실행한다. 특히 동일 bytes·다른 설치 root에서 옛 Core lease를 갱신하지 않고 정상 만료를 기다리는지 확인한다.
5. 현재 코드의 새 Windows receipt를 남긴 뒤 kit/VSIX를 만든다. `frontend:handoff`의 기존20260927 검증 metadata는 이번 변경을 검증한 것이 아니므로 그대로 새 검증본처럼 배포하지 않는다.

성능 비교에는 기준 Git object `04117c520c10e732af709b0d064c020d1d001e55`도 필요하다. shallow checkout이면 해당 이력을 확보한다. read-only 합성 비교 명령은 최종 Mac 인계에 있다.

## 이번 변경과 검증

- Core 최근 이력 전용 조회·요청 내 중복 검증 제거. 합성 SQLite 전체 응답·정상/오류/재생·테이블 동등성을 유지했다.
- B2 Core 설치/runtime identity 및 lease 갱신/종료 경합 수정. B1 알려진 structured RPC 오류만 안전한 고정 코드로 분류. Builder 빈 메시지 재개·Mac catalog/bridge·Helper 복원/취소 경계 보강.
- 최종 Mac `pnpm check`: unit130+3SKIP, integration325+8SKIP, eval41, Campus3, smoke6, E2E12 PASS. 별도 panel161+2SKIP, panel build, 실제 program controller/port+HTTP/SSE/SQLite consumer PASS. Windows SKIP은 PASS가 아니다.
- Discovery1.3.5/Builder1.3.10/Helper1.2.0/Analyst1.0.8 유지. Analyst 채택 근거는 출력 구조 신뢰성에 한정하며 의미 판단 오류와 생성 앱 경계값 실패는 남아 있다.
- 원본 로그·DB·생성 앱·연결정보는 Mac의 private 실험 디렉터리에 보존하고 Git에 넣지 않는다. 공개 receipt는 선택한 측정값/해시이며 모든 원본 보고서를 포함하는 bundle은 아니다. 역사적 일지의 `<CORE_CHECKOUT>`/`<PRIVATE_MAC_EXPERIMENT_ROOT>`는 비공개 절대 경로를 가린 표기이고 Windows 실행 경로가 아니다.
- 기존 `.vscode`, 과거 native probe/Helper host/9월13일 parser 실험 등 이번 변경과 무관한 미추적 파일은 로컬에 보존하되 이번 커밋에서 제외한다. 빌드 산출물·의존성·자격증명도 포함하지 않는다.

## 프론트 수정 후보와 작업 경계

### push 직전 선택 파일만으로 재검증

Git index의 전체 추적 파일만 새 임시 디렉터리에 복사해 기존 미추적 실험/빌드 결과에 의존하지 않는지 확인했다. `pnpm install --frozen-lockfile` 뒤 `VIBE_E2E_FRONTEND_PORT=4183 pnpm check` exit0: unit130+3SKIP/integration325+8SKIP/eval41/Campus3/smoke6/E2E12(54.4초). 별도 panel build와 panel161+2SKIP, 측정도구34, 실제 program consumer도 PASS였다. 유료 모델0이다.

측정도구 첫 실행은33PASS/1FAIL: 파일 복사본에는 `.git`이 없어 기준 커밋을 읽는1개 검사가 실패했다. 제품/검사 코드를 바꾸지 않고 원본 Git object를 읽기 전용 `GIT_DIR`로 연결하여34PASS를 확인했다. Windows는 정상 Git checkout과 위 기준 커밋 이력이 필요하다. consumer 검사의 새 환경에는 먼저 `.data/frontend-handoff` 부모 디렉터리를 준비했다. 원본 실패와 재실행 로그는 모두 private 실험 디렉터리에 보존한다.

최종 index104개 변경 파일의 실제 bytes 일치, 선택된 credential/개인경로 패턴 부재와 원본39artifact/현재source22/prompt4의 해시 감사도 PASS였다. 완전한 비밀정보 탐지나 Windows 검증을 뜻하지 않는다. 이 절 추가는 문서 변경뿐이며 검증한 제품 source는 불변이다.

확인한 program main은 `0858811195753e5c7312a79f3aede53c9aff9571`; 실제 consumer clone은 `cce7751dcd40732c700f5576a088ebdf6f91fac7`이다. controller/port/vendor 동일성은 확인했으나 최신 UI 전체를 실행한 것은 아니다. 수정 시작 시 최신 원격과 프론트 저장소 지침을 다시 확인한다.

- 우선: 명시적 PREVIEW retry로 받은 새 run ID를 port cache에 반영한다. 기존 Project/Session을 유지하고 실패 조회 자체로 자동 유료 재시도를 만들지 않는다.
- 오류코드/업데이트 대기/Trust 안내를 실제 Core terminal 결과에 연결한다. worker의 session closed 이벤트를 run 성공으로 표시하지 않는다.
- 재시작 후 durable 실패 History와 Project abandon API는 미구현이다. 저장/계약 변경이 필요한 별도 범위이며 완료로 간주하지 않는다.
- 프론트 수정은 아직 수행하지 않았다. 별도 program clone과 수정 권한을 확보한 뒤 두 저장소를 대조하고, 커밋/push는 저장소별로 분리한다. 다른 에이전트와 같은 브랜치/파일을 동시에 수정하지 않는다.

## 실측 예산과 미완료 구분

Mac Goal은 사용자 요청으로 완료됐다. 당시 계정 누적 상한900, 보수적 중단880, 마지막 관측815.91@08:33:55 KST이며 **현재 사용량이 아니다**. 프론트 보고의1000/1000은 별도 계정 관측이다. Windows에서 새 유료 실측을 시작하기 전 사용할 계정·현재 사용량·새 시간/예산을 확인한다. 크레딧이 없는 상태에서도 단위·통합/합성 consumer 검사는 가능하지만 실제 native 성공을 대신하지 않는다.

`benchmark-native-*.mjs`는 유료 호출을 포함하며 지난 Mac09:00 마감 guard를 유지했다. guard를 임의로 늘리거나 자동 재시도로 quota를 소진하지 않는다. 사용자 기존 Kiro 창·공유 Core를 강제 종료하거나 임시 데이터를 삭제하지 않는다. Windows 실제 연결·프로세스 정리·새 배포물·T19/T19-N/MVP와 사람 학습 효과는 완료가 아니다.
