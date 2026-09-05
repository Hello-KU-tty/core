# Discovery just-in-time selection v1.2.0

- fixture: `discovery-v1.2.0-jit-selection`
- status: automated contract regression and target Haiku run passed
- privacy: synthetic identifiers and content only

사용자가 complete Round 전에 preview를 참조하면 `SELECTED` enrichment는 해당 identity만 완성한다. Core는 Agent-authored Candidate 의미와 user-authored Feedback provenance를 분리한 채 참조 후보만 partial Round로 materialize한다. 나머지 FIRST·SECOND background 완료는 진행 조건이 아니며, feedback으로 Session revision이 바뀐 뒤 도착한 batch는 stale context로 거절된다.

설치본 actual-credit synthetic 실행에서 preview 10개는 20.037초, 선택한 1개 enrichment는 10.525초에 durable 저장됐다. Core는 273ms 안에 후보 1개짜리 partial Round와 `SELECTED` Session revision 2를 만들고 Project를 `SPEC_REVIEW`로 전환했다. context는 두 Agent turn 모두 ephemeral injection에 성공했으며 나머지 9개 enrichment는 호출하지 않았다.
