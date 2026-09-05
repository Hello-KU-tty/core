# Builder Agent v1.2.0 revisable Spec regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/builder.md` version `1.2.0`
- 경로: confirmed Spec 기준 작업 → 최신 사용자 scope 변경 → 영향 분류 → reversible change 또는 실제 Decision → Context·Completion Spec deviation
- 권한: generated workspace와 기존 exact shell allowlist, Builder Core tool 경계를 변경하지 않음

## 결정론적 회귀

- `builder-v1.2-revisable-spec` fixture는 local-only·hosted storage 제외로 확정된 Spec 뒤 사용자가 팀 공유와 hosted storage를 명시적으로 요청하는 사례를 재생했다.
- 기록된 사람 review는 Builder가 confirmed Spec을 이유로 요청을 거절하지 않고 최신 사용자 방향을 인정하는지, 개인정보·비용·배포 경계처럼 의미 있는 영향만 실제 Decision으로 요청하는지 판정했다.
- 변경된 방향은 Live Context와 Completion Report의 Spec deviation에 남기며, workspace·secret·데이터 삭제·권한·외부 비용 안전 경계는 변경 가능한 제품 scope와 분리한다.
- 기존 v1.1 Decision lifecycle fixture의 strict contract, apply-before-complete, false mastery 금지와 redaction 회귀를 함께 유지한다.

## UI 통합 결과

- Chromium E2E에서 pending Decision 중 Builder persistent composer에 자연어를 직접 보내 custom user Resolution을 durable 저장하고 같은 문장으로 Builder session을 재개했다.
- predefined option은 composer 바로 위의 compact 추천 답장으로 남고, 클릭만으로 이유 있는 이해 Evidence가 생기지 않는다.
