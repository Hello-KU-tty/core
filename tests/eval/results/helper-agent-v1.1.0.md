# Helper Agent v1.1.0 revisable Spec regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/helper.md` version `1.1.0`
- 경로: confirmed Learning Spec 조회 → 현재 Decision과 별도의 기술 대안 질문 → tradeoff 비교 → Builder composer handoff
- 런타임: Kiro CLI Agent Engine v2, `claude-haiku-4.5`, low effort
- 권한: Helper role-bound MCP 2개만 허용하며 code, shell, Decision Resolution과 Builder/Core state mutation은 없음

## 결정론적 회귀

- `helper-v1.1-revisable-spec` fixture는 confirmed Spec의 `PostgreSQL 14+`를 시작 기준선으로 정확히 인식하면서도 사용자의 변경 권한을 막지 않는 답변을 고정했다.
- 기록된 사람 review는 SQLite의 local MVP 장점, PostgreSQL의 동시 접근·운영 장점, 기존 schema·migration·test 전환 비용과 Builder용 자연어 handoff를 각각 판정했다.
- `사용자가 결정할 범위가 아니다`, `확정됐으므로 바꿀 수 없다` 같은 응답은 회귀 test에서 실패한다.
- 기존 `helper-v1.0-analogy`의 focused Decision, claim 단위 비유, 높은 Concept State 접근성과 no-forced-quiz 회귀도 함께 유지한다.

## 실제 Kiro 결과

2026-09-05 `pnpm test:eval:live-helper`가 actual credit을 사용한 prompt v1.1.0 실행에서 통과했다.

- Agent는 `get_helper_context`를 정확히 1회 호출하고 `PostgreSQL 14+ database required`가 포함된 confirmed Spec, current Decision, `DEMONSTRATED` state, 관련 Episode와 redaction된 source excerpt를 읽었다.
- 답변은 PostgreSQL을 시작 기준이라고 밝힌 뒤 사용자가 언제든 다시 질문하고 바꿀 권한이 있다고 명시했다.
- SQLite의 설치 없는 file 기반 local 실행, PostgreSQL의 동시 접근과 운영 배포, 기존 PostgreSQL schema·adapter·test의 전환 비용을 비교했다.
- `로컬 MVP는 SQLite로 바꾸고 해당 제약과 테스트도 갱신해줘`라는 Builder composer용 지시를 제안했다.
- Context refresh는 0회였고 Task revision 1, Context version 1, Decision과 Builder-owned state는 불변이었다. synthetic secret은 preflight context와 응답 stream에 남지 않았다.
