# Discovery Agent v1.1.0 Learning Spec regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/discovery.md` version `1.1.0`
- 경로: selected Candidate → Agent draft → Agent/user revision → unchanged user confirmation
- 권한: Discovery role-bound MCP의 `get_discovery_context`, `submit_learning_spec`만 사용

## 통과한 결과

- semantic-only tool input에서 Spec ID, selected Candidate, revision, parent, timestamp, source와 redaction status를 role-bound adapter가 채웠다.
- 공식 in-memory MCP client를 통한 첫 draft와 다음 Agent revision이 Application validation 뒤 SQLite에 저장됐다.
- 사용자 직접 수정, stale revision 거절, 내용 불변 확정과 확정 전 Builder Task 미생성이 integration test를 통과했다.
- 새 Discovery Session 복귀가 이전 selected Session과 Spec history를 보존하고 current draft를 `SUPERSEDED`로 만들었다.
- `learning-spec-v1.1-webhook` prompt regression은 strict contract, 자동 scope boundary scorer와 기록된 사람의 scope 적절성 review를 통과했다.
- `LEARNER_FOCUS`의 `discriminated union`, `runtime validation`만 필수 Evidence target으로 도출됐고 `AGENT_SUPPORT`와 `EXCLUDED` concept는 제외됐다.

## Live Kiro 상태

2026-08-27 `pnpm test:eval:live-spec` 실행은 Kiro CLI가 로그아웃된 상태여서 browser/device 인증 단계에서 Agent 호출 전에 종료됐다. 실제 Kiro Learning Spec 성공은 주장하지 않는다. 로그인 후 같은 runner를 다시 실행하면 Agent Engine v2→role-bound stdio MCP→Application→SQLite 경로와 redacted subject 파일을 검증할 수 있다.

T08에서 같은 Agent Engine과 role-bound MCP transport의 uninterrupted 8-Candidate run은 이미 통과했다. T09은 새 Kiro capability를 가정하지 않고 그 경계 위의 Spec contract와 state transition을 확장했다.
