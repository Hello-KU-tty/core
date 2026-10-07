# 스펙 확정에서 Builder 시작 연결 — 2026-09-29

현재 설치된 프론트는 **0.0.12**다. 사용자가 스펙의 `이걸로 시작`을 눌렀지만 실제로는 CONFIRMED Spec과 PENDING Task만 저장되어 Builder가 시작되지 않던 연결 누락을 수정했다.

## 원인과 변경

- 기존 provider는 `confirmSpec` 뒤 화면만 갱신했다. 같은 명시적 시작 동작에서 준비 성공·동일 Project·현재 PENDING Task를 확인하고 Builder를 한 번 실행하도록 연결했다. 중복 클릭, 준비 실패, 화면 이탈과 dispose 뒤에는 추가 실행하지 않는다.
- History와 재시작은 읽기 전용 복원이다. 이미 준비된 PENDING 작업에는 `시작 대기` 안내와 `빌더 시작` 버튼을 제공하며 추가 메시지 없이 명시적으로 시작할 수 있다. 일반 작업의 빈 메시지 보내기는 그대로 무동작이다.
- 초기 Task 제목은 Core가 Project의 최초 학습 목표를 복사한 값이었다. 첫 작업 제목이 이 기본값과 같을 때만 선택한 후보의 제품명을 화면에 표시한다. 다음 작업의 고유 제목은 유지하고 저장 제목을 수정하지 않는다. 상단 제목도 선택한 정확한 후보 revision을 따른다.
- 이전 DISCOVERY의 `AGENT_ENDED`를 Builder 오류처럼 보이게 하던 표시를 `탐색 작업이 끝났어요.`로 바꿨다. raw code는 지원용 tooltip에 유지한다.
- Core API, prompt, SQLite schema, Builder의 생성 workspace·도구·완료 검증 경계는 변경하지 않았다. backend kit는2026.09.29.2이며 관리 파일118개 hash가 일치한다. 원격 B13 진단 변경은 다음 backend kit에 반영할 별도 항목이다.

## 검증과 실제 시작

- 실제 program typecheck, **56 files / 767 tests**, build PASS. 새 회귀9개는 PENDING의 명시적 시작, 빈 일반 메시지 무동작, 제목 fallback, 탐색 종료 문구, 준비 실패·이탈·dispose 경계를 검증한다.
- `node scripts/test-program-consumer.mjs ../program` PASS. 실제 provider/adapter → 인증 HTTP/SSE → SQLite 경계에서 스펙 시작의 중복 클릭에도 Builder1회, 재시작/History의 추가 실행0을 확인했다. 이 자동 검증의 Agent는 합성 fixture이며 실제 모델 실측과 구분한다.
- VSIX 조립, Kiro CLI 설치 및 설치 목록0.0.12 확인. 업데이트 전후 두 프로젝트의 durable 상태 hash 동일·재시작만으로 새 run0.
- 실제 Kiro에서 기존 사용자 PENDING 작업의 제품명·시작 안내를 확인했다. 최신 계정 대시보드는836.86/2000, Overages Disabled였고 기존 누적900·신규중단880 제한을 유지했다.
- `빌더 시작`을 **한 번** 눌렀다. Core가2026-09-29T09:22:02.482Z에 Builder run을 수락했고 생성 프로젝트로 같은 창이 이동했다. 실제 native 도구의 작업 조회·검색·작업 시작이 성공했으며 Project BUILDING, Task ACTIVE/revision2를 확인했다. 이는 시작·도구 실행 검증이며 앱 완성·전체 수직 흐름 통과가 아니다.
- 같은 실제 turn은 제품 동작에 대한 첫 사용자 Decision을 요청하고 대기했다. 사용자가 패널에서 선택하도록 두었으며 대신 선택·해결하거나 자동 재개하지 않았다. 사용자 입력·스펙·후보·Builder 전문, 원시 식별자와 credential은 이 문서에 기록하지 않았다. 중복 시작이나 완료 조작도 하지 않았다.

## 설치 파일

- [0.0.12 VSIX](../../../dist/submission-builder-start-20260929/builder-helper-agent-panel-0.0.12-win32-x64-76b2a36cbcfb.vsix): 71 files / 2,560,874 bytes.
- SHA-256: `1794945177a89e33135c7014a97554a15b5468e67da1ed733c52a0634dceb8f6`.
- [VSIX receipt](../../../dist/submission-builder-start-20260929/program-vsix-receipt.json), [실제 소비 검증 receipt](../../../dist/frontend-consumer-receipt.json).

앞선0.0.10/0.0.11 VSIX와 source ZIP은 당시 검증 자료이며 이 수정을 소급 반영하지 않았다. program push는 기존 HURDOO Write 권한 대기다.

프론트 수정 commit은 `36b7716`이다.
