# Repository 작업 지침

## 문서와 범위

- 구현 전에 `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TASKS.md`를 읽는다.
- 충돌 시 우선순위는 `PROJECT_BRIEF.md` → `docs/SPEC.md` → `docs/ARCHITECTURE.md` → `docs/DECISIONS.md` → `docs/TASKS.md` → `docs/agent-prompts/` → `PROJECT_SPEC.md` → `CONVERSATION_RECORD.md`다.
- `PROJECT_BRIEF.md`는 승인된 입력이다. 범위 변경이 필요하면 사용자의 승인을 받고 관련 문서와 결정 기록을 먼저 갱신한다.
- MVP는 Discovery부터 다음 개인화까지 이어지는 수직 흐름이다. 단편 UI demo나 mock 응답만으로 작업을 완료 처리하지 않는다.
- Bedrock 별도 경로, Claude Code·Codex adapter, 기존 project import, 다중 언어 실행과 cloud sync를 MVP에 추가하지 않는다.

## 작업 진행

- `docs/TASKS.md`에서 `[>]`가 붙은 작업만 다음 착수 대상으로 본다. 동시에 `[>]`는 하나만 유지한다.
- 작업 시작 시 `[~]`, 검증까지 끝나면 `[x]`, 외부 조건으로 기다리면 `[-]`로 바꾸고 이유를 남긴다. 다음 작업을 정할 때만 새 `[>]`를 둔다.
- 각 작업의 선행 조건, 산출물과 완료 조건을 확인한다. 관련 test 또는 재현 가능한 검증 없이 완료 처리하지 않는다.
- 승인되지 않은 도구 선택은 `docs/DECISIONS.md`에서 먼저 승인하거나 spike 결과로 결정한다.
- app code와 dependency 설치는 T00 승인 전 시작하지 않는다.

## 설계 불변식

- Discovery, Builder, Helper와 Evidence Analyst는 Agent이고, validation과 Concept State 계산은 deterministic Core의 책임이다.
- Helper와 Analyst는 read-only다. Builder의 write/shell은 생성 workspace로 제한한다.
- Agent-authored 설명·코드와 사용자 Evidence의 provenance를 분리한다. Agent 출력, 확인 응답이나 card click만으로 이해 상태를 높이지 않는다.
- `MISCONCEPTION`은 Concept State가 아니라 해결 가능한 open issue다.
- Builder stream을 숨기지 않되 저장·표시 전에 secret과 민감 경로를 redaction한다.
- Event마다 추론하지 않는다. 의미 있는 Event를 Episode로 묶은 뒤 Analyst를 호출한다.
- Core/MCP contract는 Kiro/Crew UI와 transport 구현에 종속시키지 않는다.

## Agent prompt

- Agent 동작을 바꿀 때 `docs/agent-prompts/discovery.md`, `builder.md`, `helper.md`, `evidence-analyst.md`를 source of truth로 사용한다.
- prompt 변경은 version과 평가 fixture 결과를 함께 남긴다. fixture 하나를 통과시키기 위한 hard-coded 문구를 넣지 않는다.
- 문서에 정의되지 않은 범용 file, shell, SQL 또는 state mutation tool을 Agent에게 추가하지 않는다.

## 코드와 검증

- Node.js 24.19.0, pnpm 11.12.0과 TypeScript strict mode를 사용하고 package boundary를 지킨다. `.node-version`, `package.json` engine과 preflight를 우회하지 않는다.
- 설치는 `pnpm install --frozen-lockfile`, 전체 검증은 `pnpm check`를 사용한다. 개별 검증 명령은 `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm test:smoke`, `pnpm test:e2e`다.
- lifecycle build script는 `pnpm-workspace.yaml`에 명시된 `better-sqlite3`와 `esbuild`만 허용한다. 새 package의 install script를 허용하기 전에 필요성과 공급망 경계를 결정 기록에 남긴다.
- 변경 범위에 맞는 unit, contract, storage integration, Agent fixture/eval과 UI/E2E를 실행한다.
- Kiro 기능은 공식 문서 또는 재현 가능한 capability spike로 확인한다. 검증되지 않은 API나 session 공유를 가정하지 않는다.
- Campus Drop은 Golden Path fixture일 뿐이다. unseen learning goal과 Personal Need 유무를 함께 검증한다.
- 오류를 숨기거나 mock 성공으로 바꾸지 않는다. 실패 상태, 복구 경로와 알려진 제한을 기록한다.

## 보안과 데이터

- token, credential, 개인정보와 민감한 대화 원문을 repository, fixture, log와 제출물에 넣지 않는다.
- 환경 변수 파일은 commit하지 않는다. 필요 시 이름과 설명만 담은 `.env.example`을 사용한다.
- local SQLite와 생성 workspace path를 명시적으로 제한하고 path traversal, payload와 권한을 validation한다.
- 사용자 데이터 삭제, 외부 전송, hosted 배포처럼 데이터 경계를 바꾸는 작업은 별도 승인을 받는다.

## Git과 GitHub

- 사용자 기존 변경을 보존하고 관련 없는 파일을 되돌리거나 삭제하지 않는다.
- push 전 사용자에게 다음 중 어떤 방식을 사용할지 확인한다: `@hurdooagent`가 소유한 부계정 repository에 직접 push, 또는 `@hurdoo` 본계정 repository에 `@hurdooagent`를 collaborator로 초대한 뒤 push.
- 권한 거부 시 같은 push를 반복하지 않는다. 해당 repository에 `@hurdooagent`를 collaborator로 초대해 달라고 요청하고 완료 후 다시 시도한다.
- 인증 token 값은 지침, source, log와 repository 파일에 기록하지 않는다.
- remote 추가, commit과 push는 사용자가 요청한 범위에서만 수행한다.
