# 채팅 스트림·Helper 준비 배너 수정 (0.0.13)

프론트 개발자가 바로 이어서 작업할 수 있도록 현재 검증된 수정과 남은 한계를 구분한다.

**즉시 인계 완료:** `Hello-KU-tty/program`의 기존 `ca586f4`/`5519b18`을 merge로 보존하고 로컬0.0.10~0.0.13 변경과 함께 `main`에 push했다. 원격 HEAD는 `950f83fd064804611d697bd79613235f16976258`, 최종 소스 버전은 **0.0.14**다. 병합 후 typecheck·57 files / **780 tests**·build PASS. 개발자는 이 main을 pull하면 된다. 다음 확장 버전은0.0.15 이상, 다음 backend kit은2026.09.29.3 이상이다. 아래0.0.13은 병합 전 설치 후보의 정확한 기록이다.

- TEXT 조각을 문단으로 만들던 renderer를 수정했다. 조각을 정확히 연결하고 문단·제목·목록·강조·인라인/블록 코드를 안전한 DOM/textContent로 표시한다. HTML·이미지·활성 링크와 신규 dependency는 추가하지 않는다.
- Builder/Helper 응답에 역할 표시와 대화 영역 스타일을 적용했다. Helper 스크롤을 보존하고, 내용이 그대로인 상태 갱신에는 transcript DOM을 재생성하지 않는다. 저장된 사용자 발췌와 답변 요약은 별도 표시한다.
- W 창의 HELPER_WINDOW_OPENING이 H 창의 완료 뒤에도 남는 문제를 수정했다. Helper run의 TEXT/TOOL/거절 및 terminal에서 해제하고, 늦은 로컬 상태가 다시 켜지 못하게 했다. 무한 blink와 중복 worker 준비 표시는 제거했다.
- **검증 PASS:** Node24.19.0, frontend typecheck, 57 files / 779 tests, build, 실제 provider/controller→Core HTTP/SSE→SQLite 소비 회귀. kit2026.09.29.2의118관리파일 hash 유지. 합성 Agent 회귀를 실제 native 모델 실행으로 확대하지 않는다.
- **설치:** Kiro CLI가0.0.13 설치 성공과 설치 버전을 확인했다. W 창 reload 뒤 이전0.0.12 H 창이 Core owner를 유지해 UPDATE_WAITING 상태를 확인했다. 새 버전 실제 채팅 화면 검증은 이 인계 시점에서 아직 완료하지 않았다.
- **VSIX:** `dist/submission-chat-20260929/builder-helper-agent-panel-0.0.13-win32-x64-662e679fbe9d.vsix`, 71 files / 2,562,697 bytes, SHA256 `6ce90cc550db6738799a834a0650bd54d23d0c8b6155b27671c6d990baa11a63`.

## 바로 이어서 볼 항목

1. 사용자 실행이 없는 상태에서 이전 H 창 정상 종료→Core 연결 갱신→History 복원 후 실제 화면을 확인한다. 기존 프로젝트·Task·Decision은 유지하며 자동 모델 재실행은 하지 않는다.
2. Windows는 별도 H 창을 유지한다. 과거 Mac 한 창 protected built-in 성공을 Windows 지원으로 확대하지 않는다. 같은 custom Agent host의 공유 queue/MCP catalog와 권한 격리를 입증하기 전 gate를 풀지 않는다. 공식 [Agent Focus](https://kiro.dev/docs/ide/experimental/focus-mode/)의 병렬 세션 설명도 이 확장의 역할별 도구 격리를 보증하지 않는다.
3. 재시작 뒤 전체 transcript 대신 저장된 Helper 요약만 복원되는 기존 제한이 있다. 현재 LocalRun은 transient이며 taskId가 없어 임의 latest run을 현 Task로 붙이는 수정은 하지 않았다. 채팅 이력 복원 계약과 응답 요약 품질은 다음 개선 대상이다.
4. 영어 진행 서술도 실제 모델 출력이다. 프론트가 숨기거나 번역하지 않았다. 사용자 언어 prompt의 실제 모델 품질은 별도 재검증이 필요하다.
5. B13 Core 진단 변경은 이번 VSIX에 포함하지 않았다. backend kit은2026.09.29.2 그대로다.0.0.10 source ZIP도 갱신되지 않은 이전 제출 후보다.

현재0.0.13 설치 전후 확인까지 추가 native 호출은0이다. 원본 사용자 입력·Agent 대화 원문은 이 문서와 fixture에 기록하지 않는다.
