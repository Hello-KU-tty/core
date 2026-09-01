# Helper Agent v1.0.0 bounded context regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/helper.md` version `1.0.0`
- 경로: Helper open → bounded current context → focused Decision 비교 → claim 단위 비유 → 선택적 다음 설명
- 런타임: Kiro CLI 2.20.2 Agent Engine v2, `claude-haiku-4.5`, low effort
- 권한: Helper role-bound MCP 2개만 허용하며 native file, shell, web과 Builder/Decision/Evidence state mutation tool은 없음

## 결정론적 회귀

- `helper-v1.0-analogy` fixture는 unknown-field Decision, CURRENT freshness, `DEMONSTRATED` Concept State와 redaction sentinel을 strict contract로 재생했다.
- 기록된 사람 review는 첫 답변이 현재 선택과 Builder 추천의 한계에 머무는지, `데이터 한 건=행`은 인정하고 `모델=열`은 `필드=열`로 나누어 정정하는지, 높은 State에서도 Helper가 접근 가능하고 강제 퀴즈를 만들지 않는지 판정했다.
- Application/MCP integration은 CURRENT/STALE/MISSING, focused Decision, 관련 Ledger·닫힌 Episode, bounded source excerpt, 완료 Task fallback과 durable refresh→Builder fulfillment를 검증했다.
- quick action은 설명 mode일 뿐 Evidence나 Concept State를 만들지 않는다. 실제 UI click과 conversation Event 정규화는 각각 T16과 T13 범위다.

## Live Kiro 결과

2026-09-01 `pnpm test:eval:live-helper`가 실제 로그인된 Kiro 실행에서 통과했다.

- Agent는 `get_helper_context`를 정확히 1회 호출해 current Decision, `DEMONSTRATED` Ledger, 관련 Episode와 redaction된 `src/events.ts` excerpt를 읽었다.
- CURRENT Context이므로 `request_builder_context_refresh`는 0회였다.
- 답변은 reject/preserve의 제품 동작 차이와 Builder 추천의 한계를 비교하고, 실제 데이터 한 건과 행의 대응은 인정하되 DB 모델 자체보다 모델 필드가 열에 가깝다고 분리해 설명했다.
- 높은 Concept State에서도 질문과 더 깊은 설명을 계속 허용하고, `더 쉽게`, `더 자세히`, `현재 코드로 예시`, `선택지 비교`를 자유 입력과 함께 선택적으로 제시했다. 퀴즈나 repeat-back은 요구하지 않았다.
- Task revision 1, Context version 1, Decision과 refresh 목록은 바뀌지 않았다. source의 synthetic secret은 preflight Context, Agent 답변과 redaction된 stream에 남지 않았다.
