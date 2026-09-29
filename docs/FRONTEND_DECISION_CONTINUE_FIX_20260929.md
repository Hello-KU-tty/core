# 결정 선택 뒤 Builder 계속 실행 — 2026-09-29

사용자가 고른 결정은 저장됐지만 설치된 0.0.14의 선택 버튼은 `decision/resolve`만 호출했다. Builder는 별도 재개 버튼을 기다렸으며 선택 전 끝난 이전 turn을 자동으로 이어가지 않았다.

## 수정과 인계

- frontend `0f94445`의 화면 개편, kit 2026.09.29.3과 최신 인계 문서를 받은 뒤 확장 **0.0.16**으로 수정했다. 다음 확장은 0.0.17 이상을 사용한다.
- 선택 버튼을 **‘정하고 계속하기’**로 명시하고 `decision/resolveAndContinue`를 추가했다. 저장 성공 후 같은 Project/Task의 저장된 결정을 다시 읽고, 다른 미해결 결정이나 활성 Builder가 없을 때 한 번 실행한다. 최종 Builder 준비에서 Task가 바뀌어도 실행하지 않는다.
- 기존 저장 전용 `decision/resolve`, Helper와 History 복원은 Builder를 실행하지 않는다. Core 계약, 권한, provenance, prompt, dependency는 바꾸지 않았다.
- 별도 재개 버튼은 ‘선택한 내용으로 계속하기’다. 이미 실행 중이면 선택만 저장하고 중복 run은 생성하지 않는다.
- `program/HANDOFF_20260929.md`와 `NEXT_STEPS_20260929.md`에도 이번 후속과 이쪽에서 프론트 실측 중임을 기록했다.
- frontend 수정과 인계는 [`e1cffdd`](https://github.com/Hello-KU-tty/program/commit/e1cffdd)로 `Hello-KU-tty/program/main`에 HURDOO 인증으로 push했다.

## 검증

- 최종 program: typecheck, **57 files / 794 tests**, build PASS.
- 성공 1회, 저장 실패 0회, 중복 클릭 병합, 프로젝트 전환/dispose, 다른 미해결 결정, 기존 실행, Task 변경 회귀 PASS. 기존 resolve-only의 자동 실행 금지 검사도 유지했다.
- 실제 frontend dispatcher/controller/port → 인증 HTTP/SSE → SQLite/Core에서 blocking Decision 생성·저장·ACTIVE 전환·Builder 1회와 중복 클릭 병합 PASS. `node scripts/test-program-consumer.mjs ../program`으로 재현한다. Agent 경계는 delayed deterministic fixture이며 native 모델 검증과 구분한다.
- kit 2026.09.29.3의 receipt와 실제 관리 파일 **118개** SHA-256이 모두 일치했다. portable manifest hash 검사를 거쳐 VSIX를 조립했다.
- Core 소비 스크립트의 format/lint와 양쪽 `git diff --check` PASS. 이전 fixture ID 오류는 수정 후 재검증했고, 실제 program 경로의 sandbox 읽기 거부는 승인된 권한으로 다시 실행해 PASS했다. 이번 frontend orchestration 변경으로 전체 backend 검증을 새로 완료했다고 주장하지 않는다. 최신 backend 전체 검증은 [kit 3 기록](spikes/T19_FRONTEND_HANDOFF_UPDATE_20260929_3.json)에 있다.

## 실제 사용자 세션

- 저장된 선택을 다시 제출하거나 바꾸지 않고 기존 0.0.14의 명시적 재개 버튼을 한 번 눌렀다. 2026-09-29 **21:22:47 KST**에 새 Builder run이 시작됐다.
- Builder가 저장된 선택을 읽고 후속 파일을 작성한 것을 관찰했다. Core에서도 결정 `resolved=true`, `applied=true`, pending 0과 `DIRECTION_CHANGED`를 확인했다. 원문·프로젝트 ID·개인 경로는 이 문서에 넣지 않는다.
- 이후 **21:32:42 KST**에 run이 `NATIVE_BUILDER_BUDGET_TIMEOUT_CONFIRMED`로 종료됐다. 선택 연결 문제는 해소됐지만 Task는 ACTIVE이며 앱 완성이나 build/test 완료로 판정하지 않는다. 새 유료 실행은 자동 재시도하지 않았다.
- 0.0.16의 새 버튼을 native 모델로 누른 검증은 아직 별도다. 기존 실행은 설치 준비 동안 중단하지 않았다.

## 설치본

- `dist/submission-decision-20260929/builder-helper-agent-panel-0.0.16-win32-x64-47dade86cc02.vsix`
- SHA-256: `10503325d850df686f4ad308d06ca4785876c40ac59a692b68611e11f82fe610`
- 71 files / 2,568,371 bytes. DB·로그·환경 파일·source map은 포함하지 않는다.
- run 종료 후 W/H 창을 정상 종료하고 Kiro CLI 설치 목록에서 **0.0.16**을 확인했다. 기존 프로젝트를 다시 열어 최신 빌더/도우미 탭과 ‘정하고 계속하기’ 버튼 표시를 확인했다. 이미 적용된 결정은 disabled이며 새 모델 호출을 만들지 않았다.
- 두 프로젝트의 Project/Session/Discovery context/선택/Spec/Task/Decision을 포함하는 정규화 저장 hash가 재시작 전후 동일했다. 기존 선택의 `resolved/applied=true`, pending0과 Task ACTIVE도 유지됐다. run 목록은 기존 transient 계약에 따라 재시작 후 비며 오류 원인 보존 한계는 남는다.
- 새 버튼을 눌러 새 native run까지 잇는 실측은 남아 있다. 이전 선택의 native 재개·적용 관측, 새 버튼의 실제 Core 자동 회귀, 설치 화면 확인을 구분한다.
