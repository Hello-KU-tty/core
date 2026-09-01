# Evidence Analyst v1.0.1 mixed-strength regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/evidence-analyst.md` version `1.0.1`
- 경로: closed Helper Episode → durable Analysis Job → hidden no-tool Analyst → deterministic Core Evidence policy → Concept Ledger
- 런타임: Kiro CLI 2.20.2 Agent Engine v2, `claude-haiku-4.5`, low effort
- 권한: file, shell, network와 MCP tool이 없는 빈 allowlist

## 결정론적 회귀

- `evidence-analyst-v1.0-mixed` fixture는 한 Episode의 직접 유도 재표현과 독립적인 runtime-validation 적용을 strict semantic result로 재생한다.
- 기록된 사람 review는 모든 직접 근거가 USER_MESSAGE인지, Helper 설명이 context로만 쓰이는지, 직접 유도 반복이 `NONE/DIRECTLY_LED`이며 독립 적용만 `STRONG/INDEPENDENT`인지 판정했다.
- Application integration은 빈 Proposal 성공과 이유 요약 보존, late result 거절, 30초 soft timeout, 중단된 RUNNING lease의 재시작 회수, 자동 재시도 1회, terminal failure/dead-letter, UI 상태 조회와 수동 재시도를 검증했다.
- SQLite integration은 pending Analysis Job과 Episode/Event/Evidence trace가 재시작 뒤 복구되는지 검증했다.

## Live Kiro 결과

2026-09-02 `pnpm test:eval:live-analyst`가 실제 로그인된 Kiro 실행에서 통과했다.

- Agent tool 호출은 0회였고 semantic Proposal 2개를 반환했다.
- Helper가 바로 제시한 명제를 반복한 discriminated-union Proposal은 Core가 State 비지지로 거절했다.
- 사용자가 별도로 제시한 외부 webhook runtime-validation 적용은 Core가 채택해 `DEMONSTRATED`를 만들었다.
- 결과 적용 뒤 durable Analysis Job은 `SUCCEEDED`, Episode는 `ANALYZED`였다.
- 첫 live 시도는 빈 `contextSources` 누락과 직접 유도 재표현 과대평가를 드러냈다. prompt v1.0.1에서 필수 빈 배열과 DIRECTLY_LED 경계를 명시하고, 동일 언어의 실제 근접 반복 fixture로 수정한 뒤 최종 실행이 통과했다.
