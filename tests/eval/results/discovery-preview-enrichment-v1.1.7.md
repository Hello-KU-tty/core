# Discovery preview/enrichment v1.1.7

- 상태: local contract·storage·MCP·UI 검증 완료, target 측정 전
- model: `claude-haiku-4.5`
- first useful contract: lightweight preview 10개
- background contract: 고정 identity의 `FIRST` 1~5, `SECOND` 6~10
- finalize: 두 batch가 모두 저장된 transaction에서 Candidate 10개와 Round 1개 materialize
- recovery: preview 재시도, 누락 batch 재시도, 기존 atomic Round fallback, fallback 뒤 late enrichment stale 거절
- 개인정보: synthetic fixture만 사용

target 설치본에서 preview durable 시간과 complete Round 수렴 시간을 기록한 뒤 T15 성능 gate를 판정한다.
