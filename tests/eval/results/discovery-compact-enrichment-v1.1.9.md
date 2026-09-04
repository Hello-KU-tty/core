# Discovery compact enrichment v1.1.9

- 상태: target preview 30초 gate 및 complete Round 수렴 통과
- model: `claude-haiku-4.5`
- first useful contract: 의미가 다른 lightweight preview 10개 유지
- enrichment context: 전체 preview 10개와 요청 batch 5개의 중복을 제거하고 요청된 5개만 주입
- enrichment output: 상세 필드는 유지하되 대표 사용자 1명, 핵심 개념·MVP 기능 2개, scope별 1개로 제한
- recovery: 저장된 preview·성공 batch 유지, 누락 batch만 순차 재시도, 기존 atomic Round fallback
- 개인정보: synthetic fixture만 사용

v1.1.8 target에서 preview는 21.635초로 30초 gate를 통과했고 Candidate identity 10개와 Session revision 1→2가 보존됐다. 다만 순차 enrichment 완료에는 217.934초가 걸렸다.

v1.1.9 설치본의 synthetic WebRTC 상태 머신 측정에서 preview 10개는 23.241초에 durable 저장돼 30초 gate를 다시 통과했다. FIRST 5개는 107.273초, complete Round는 enrichment 시작 후 148.371초에 저장됐다. v1.1.8보다 전체 enrichment가 약 31.9% 줄었고 Candidate identity 10개와 Session revision 1→2가 유지됐다. 상세 완료 시간은 30초 목표가 아니라 별도 background 수렴 지표이며, 사용자는 preview가 나온 뒤 checkbox와 basket을 사용할 수 있다. SELECT·refinement가 완성 전 잠기는 148초는 MVP의 알려진 제한으로 T21에서 계속 측정한다.
