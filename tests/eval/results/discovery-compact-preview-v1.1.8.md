# Discovery compact preview v1.1.8

- 상태: preview 30초 gate 통과, background enrichment 추가 최적화 필요
- model: `claude-haiku-4.5`
- first useful contract: 의미가 다른 lightweight preview 10개
- preview limit: 제목 16자, 핵심 문장 35~45자, tag 1개, rationale 60자
- background contract: fixed identity `FIRST` 1~5 저장 확인 뒤 `SECOND` 6~10 자동 시작
- recovery: 저장된 preview·성공 batch 유지, 누락 batch만 재시도, 기존 atomic Round fallback
- 개인정보: synthetic fixture만 사용

v1.1.7 target은 project 생성부터 preview durable까지 29.595초와 clean 31.723초가 관측돼 30초 경계에서 흔들렸다. 동시 enrichment에서는 한 slot이 durable submit 없이 끝나는 편차가 재현됐고, 다른 batch의 5개는 보존됐다.

v1.1.8 설치본의 synthetic WebRTC 상태 머신 측정에서는 preview 10개가 21.635초에 durable해 30초 gate를 통과했다. Candidate identity 10개가 그대로 유지됐고 Session revision은 preview 저장 시 1, 완성 Round materialize 시 2였다. 순차 batch로 완성 후보 10개가 모두 저장됐지만 enrichment에는 217.934초가 걸려, 상세 필드의 입력·출력 크기를 더 줄이는 v1.1.9 follow-up을 수행한다.
