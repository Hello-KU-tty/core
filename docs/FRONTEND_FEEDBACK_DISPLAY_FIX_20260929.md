# 새 후보 표시 복구 — 2026-09-29

현재 설치 후보는 **0.0.11**이다. 실제 사용자 실측에서 MERGE가 성공하고 새 revision의 전체 상세가 저장됐지만, 화면에는 후보 ID와 상세 로딩 안내만 남는 문제를 수정했다. Core의 생성·저장 실패가 아니었다.

## 원인과 수정

- `LocalCoreDiscoveryPort.submitFeedback`이 완료 후 이미 읽은 snapshot에서 round 참조만 반환했다. controller는 새 후보의 상세 map을 갱신하지 않았다. 이제 round와 정확한 revision의 저장 상세를 함께 전달하고 같은 성공 콜백에서 반영한다.
- renderer가 `candidateId`로만 상세를 선택해 이전 라운드에 최신 revision을 표시했다. `candidateId:revision`으로 매칭해 이력의 제목·설명을 보존한다.
- 추가 enrichment나 모델 호출 없이 처리한다. 상세 누락은 오류로 반환하며 무한 로딩 카드를 새로 반영하지 않는다. 입력·바구니 보존과 화면 이탈 후 늦은 응답 차단을 검증했다.
- Agent prompt, Core 런타임·저장 계약, 사용자 저장 데이터는 변경하지 않았다. backend kit는 **2026.09.29.2** 그대로이며 관리 파일118개 hash가 일치한다.

## 검증

- 실제 `program`: typecheck, **56 files / 758 tests**, build PASS. 기존753개와 새 회귀5개.
- `node scripts/test-program-consumer.mjs ../program` PASS. 실제 controller/port → HTTP/SSE → SQLite → 실제 webview messaging/renderer에서 MERGE와 REGENERATE 직후 제목·설명 표시, 정확한 revision, 입력·바구니 보존, 추가 enrichment 없음 확인. Agent 계산만 명시적 합성 fixture다.
- 새 VSIX 조립·Kiro CLI 설치 성공, 설치 목록 **0.0.11** 확인.
- 실제 Kiro 재시작 후 기존 사용자 프로젝트 자동 복원. preview10개, 기존 round1의 후보2개, round2의 새 후보1개가 저장된 상세로 표시된다. 이전 후보의 원래 제목·설명도 복원된다.
- 재시작 전후 두 프로젝트의 durable 상태 hash 동일. 이 복구에서 새 모델 run **0**. 진단 시 기존 PREVIEW/ENRICH_SELECTED/MERGE는 모두 `SUCCEEDED`였다. 사용자의 원문·후보 전문·식별자는 기록하지 않았다.
- Core runtime 소스 변경은 없고 소비 검증 script만 확장했다. frontend 전체 검사·실제 소비 검증 및 core format/diff 검사를 실행했다. 앞선 backend 전체 `pnpm check` 결과를 이번에 다시 실행한 것으로 주장하지 않는다.

## 설치 파일

- [0.0.11 VSIX](../dist/submission-feedback-20260929/builder-helper-agent-panel-0.0.11-win32-x64-8e4b64524d60.vsix): 71 files / 2,560,222 bytes.
- SHA-256: `6ef23a90b01501e4606118716b1571c95f09cab3ff8c9599fa8a10006f8b2542`.
- [VSIX receipt](../dist/submission-feedback-20260929/program-vsix-receipt.json), [실제 소비 검증 receipt](../dist/frontend-consumer-receipt.json).

0.0.10 VSIX와 앞선 source ZIP은 이전 검증 산출물이다. 이 수정은 해당 ZIP에 소급 반영하지 않았다. 최신 확장 설치 기준은 위0.0.11이다. `Hello-KU-tty/program` push는 기존 HURDOO Write 권한 대기를 유지하며 권한 없는 push를 반복하지 않는다. 전체 Builder/Helper 이후 실측·사람 pilot·공식 제출은 이 수정으로 완료 처리하지 않는다.

프론트 수정 commit은 `3c9412d`다. core push 중 원격에 먼저 올라온 `eb215ef`(B13, 거절된 Builder 명령의 내용 없는 분류)를 발견해 해당 변경을 보존하며 검증 기록 commit을 rebase했다. B13은 이0.0.11의 기존 backend kit에는 포함되지 않으며, 다음 backend kit 반영 대상으로 남는다.
