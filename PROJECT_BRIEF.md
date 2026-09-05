# Vibe Helper 프로젝트 브리프

> 상태: 구현 전 승인된 입력 브리프
> 작성 기준일: 2026-08-24
> 출처: 사용자가 승인한 [PROJECT_SPEC.md](PROJECT_SPEC.md)와 합의된 Agent Prompt
> 주의: 제품명은 아직 확정되지 않았으며 `Vibe Helper`, `BuildWhy`는 작업명이다.

## 1. 한 문장 정의

코딩 초보자가 바이브코딩으로 자신에게 실용적이거나 매력적인 서비스를 실제로 완성하면서, 필요한 순간 Helper와 대화하고 실제 판단을 내린 근거를 축적해 다음 개발 경험까지 개인화하는 Kiro-native 개발 환경이다.

## 2. 해결할 문제

- AI가 동작하는 코드를 만들어도 사용자는 중요한 제품·기술 판단을 이해하지 못할 수 있다.
- 일반적인 교육 도구는 설명, 퀴즈, 진도 때문에 실제 개발 흐름을 방해하기 쉽다.
- 배우고 싶은 기술을 입력해도 그 기술이 실제로 필요한 매력적인 프로젝트를 찾기 어렵다.
- Agent가 코드를 사용했다는 사실과 사용자가 개념을 이해했다는 사실이 혼동되기 쉽다.
- 일반 Agent memory는 작업 맥락을 기억할 수 있지만 사용자가 무엇을 독립적으로 설명·판단·재사용했는지 보수적으로 증명하지 않는다.

## 3. 목표 사용자

- 바이브코딩을 시작하거나 익숙해지는 코딩 초보자
- 문법 강의보다 자신이 쓸 서비스를 만들며 배우고 싶은 사용자
- Agent에게 구현을 맡기되 중요한 판단의 의미는 이해하고 싶은 사용자
- 대회 첫 검증에서는 실제 초보 사용자와 고려대학교 학생을 우선한다.

## 4. 제품 목표

1. 사용자가 배우고 싶은 기술에서 만들고 싶은 프로젝트를 발견한다.
2. 낮은 진입장벽으로 프로젝트 범위를 정하고 바로 개발을 시작한다.
3. Builder가 실제 제품을 앞으로 밀되 의미 있는 실제 판단은 사용자에게 남긴다.
4. 사용자가 필요할 때 read-only Helper와 현재 맥락을 놓치지 않고 대화한다.
5. 사용자 본인의 설명·예측·판단·적용만 학습 Evidence로 보수적으로 기록한다.
6. Evidence가 다음 Helper 답변과 Project Discovery를 실제로 바꾼다.
7. 사용자가 자신에게 필요한 동작하는 결과물을 완성하고 다시 만들 동기를 얻는다.

## 5. 제품 원칙

- Build-first: 교육을 위해 개발을 반복적으로 중단하지 않는다.
- 살아 있는 합의: Learning Spec은 빠르게 시작하기 위한 초기 기준선이며, 사용자는 Build 중에도 제품·기술 방향과 학습 범위를 다시 질문하고 바꿀 수 있다. Agent는 비용과 영향을 설명하되 이미 확정됐다는 이유로 변경 논의를 막지 않는다.
- 실제 판단: 교육용 가짜 선택지를 만들지 않고 실제 제품·기술 Decision만 사용자에게 요청한다.
- 낮은 부담: Learning Spec은 권장안을 기본으로 쉽게 시작할 수 있게 한다.
- 익숙한 조작감: UI는 SEED Design의 명확한 정보 위계, 목록형 선택과 모바일 터치 영역을 참고하고 Kiro의 보라색 계열을 대표색으로 사용한다.
- 자연스러운 교육: Helper는 강사가 아니라 현재 판단을 돕는 동료다.
- 투명한 작업: 실제 Agent 메시지, ToolCall, 파일 변경, 테스트와 오류 수정 흐름을 숨기지 않는다.
- 보수적 Evidence: Agent가 말하거나 작성한 내용은 사용자 이해 근거가 아니다.
- Local-first: 상태는 로컬 SQLite에 저장하고 필요한 Activity만 최소 수집한다.
- 최소 권한: Builder만 생성 workspace에서 write/shell을 사용하고 Helper와 Analyst는 제한된 읽기·제안 권한만 가진다.

## 6. 핵심 사용자 흐름

```text
Learning Goal 입력
→ 선택적 Personal Need 입력
→ 다채로운 프로젝트 후보 탐색
→ 대화로 반복 refinement
→ 권장 Learning Spec 확인
→ Builder가 실제 개발
→ 실제 Decision 발생
→ 필요하면 Helper에게 질문
→ 사용자가 이유 있는 선택
→ Builder 구현·테스트
→ Episode 단위 Evidence 분석
→ Concept State 갱신 또는 보류
→ 다음 Helper 답변·Discovery 개인화
→ 동작하는 결과물 실행
```

## 7. Project Discovery 요구

- 필수 입력은 배우고 싶은 기술 또는 개념이다.
- Personal Need, 최근 불편, 관심 영역, 현재 수준은 선택 입력이다.
- available time 입력은 받지 않는다.
- 첫 응답은 제목, 요약, 매력 이유, 핵심 상호작용과 기술 필요성을 담은 가벼운 후보 미리보기 10개를 빠르게 보여준다. 미리보기 identity를 durable 저장한 뒤 같은 후보의 핵심 개념, MVP와 권장 범위를 background에서 보강한다.
- 미리보기 또는 상세 보강이 실패하면 이미 저장된 결과를 유지한 채 실패 구간만 재시도한다. 사용자는 새 staged 경로를 포기하고 기존 4~6개 완성 Candidate Round를 원자적으로 생성하는 복구 경로를 선택할 수 있다.
- 고정된 프로젝트 카테고리나 10개 주제 목록을 사용하지 않는다.
- 같은 CRUD 구조에 테마만 바꾼 후보를 다양하다고 판단하지 않는다.
- Personal Need가 있으면 관련 후보와 독립 탐색 후보를 자연스럽게 섞는다.
- DIRECT, EXPAND, DISCOVER, UPGRADE는 hard router가 아니라 내부 생성 tag다.
- 후보는 같은 ProjectCandidate의 revision으로 반복 수정한다.
- RefinedCandidate와 FinalCandidate 별도 타입은 만들지 않는다.
- 사용자가 명시적으로 선택할 때까지 pin, reject, merge, revise, shrink, regenerate와 추가 후보 생성을 반복할 수 있다.
- 첫 미리보기에는 제목, 요약, 매력 이유, 핵심 상호작용과 기술 필요성을 우선한다. 같은 identity의 background 보강이 핵심 개념, MVP와 권장 범위를 완성한다. Concept Necessity, Personal Utility, Adoption Feasibility, Learner Fit, Scope Feasibility, Adjacent Complexity, Deployability, Distinctiveness의 상세 평가는 관심·선택 이후 또는 비교가 필요할 때 지연 생성할 수 있다.
- 후보는 여러 열의 큰 카드가 아니라 한 줄씩 빠르게 훑는 목록으로 보여준다. 눈에 띄는 checkbox로 관심 후보를 담고 빼며, 선택 상태와 선택 개수를 즉시 확인할 수 있어야 한다.
- Background 상세 보강이 끝나 preview가 완성 Candidate로 바뀌어도 같은 Candidate ID의 관심 목록, 펼쳐 본 상세와 사용자의 목록 검토 맥락을 초기화하지 않는다.
- Background 상세 보강은 선택·조정의 선행 조건이 아니다. 사용자가 preview만으로 판단을 끝내면 참조한 identity만 즉시 필요한 형태로 보강해 다음 단계로 진행하고, 나머지 후보의 보강 완료를 기다리지 않는다.
- 자유 조정 입력은 후보 목록보다 위에 둔다. 사용자는 아래 목록에서 관심 후보를 담은 뒤 위 입력으로 돌아와 생각을 적으며, 범위 축소·확장 같은 조정은 후보별 버튼 대신 입력 예시와 자연어 요청으로 제공한다.

## 8. Learning Spec 요구

- Discovery가 권장안을 먼저 완성한다.
- 사용자는 `이대로 시작`, `조금 바꾸기`, `다른 주제로 돌아가기`를 선택할 수 있다.
- `다른 주제로 돌아가기`는 Agent 호출 없이 즉시 이전 후보를 보여준다. 새 후보 생성은 사용자의 별도 선택 뒤 시작한다.
- 실행 중인 Agent 요청을 둔 채 화면을 이탈했다가 돌아왔을 때 stream과 진행 표시를 다시 연결하는 기능은 MVP 범위에 포함하지 않는다. 이미 Core에 저장된 결과와 기존 프로젝트 상태의 복원은 유지한다.
- Spec은 작은 textbox가 반복되는 직접 편집 form이 아니라 제품 흐름과 역할 분담을 초보자가 읽기 쉬운 시각적 요약으로 보여준다. 수정은 큰 자유 입력으로 Agent에게 반복 요청한다.
- 범위는 다음 세 가지로 나눈다.
  - LEARNER_FOCUS: 이번 프로젝트에서 자연스럽게 이해하고 판단할 목표
  - AGENT_SUPPORT: 제품에 필요하지만 Builder가 주로 구현하고 학습을 강요하지 않는 부분
  - EXCLUDED: MVP에서 구현하지 않는 부분
- Spec에서는 시작 부담을 줄이되 Builder 실행 뒤 실제 Decision은 숨기지 않는다.
- 확정된 Spec도 Build 중에는 변경 불가능한 권한 경계가 아니다. 이후의 명시적인 사용자 지시나 Decision이 일부 항목을 바꾸면 Builder는 영향과 이탈을 기록하고 새 방향으로 진행한다.
- `AGENT_SUPPORT`와 `EXCLUDED`는 초기 구현·학습 계획일 뿐 사용자가 질문하거나 학습 범위를 넓히는 일을 금지하지 않는다. 단, workspace·secret·데이터 삭제·외부 비용 같은 안전 경계는 그대로 지킨다.

## 9. Agent와 Core

### Discovery Agent

- 후보 생성, 평가, 반복 refinement, Learning Spec 초안
- 코드와 shell 접근 없음
- 상태 직접 변경 없음

### Builder Agent

- 실제 코드 작성, 명령, 테스트와 디버깅
- 실제 작업 stream 표시
- Live Project Context 갱신
- 실제 Decision 요청과 Task Completion Report 제출
- Concept 사용은 보고하지만 사용자 이해는 판정하지 않음

### Helper Agent

- 항상 접근 가능한 read-only Agent
- 최신 Builder 맥락, 관련 Task·Decision·코드·과거 Evidence를 선택적으로 조회
- 더 쉽게, 더 자세히, 현재 코드로 예시, 선택지 비교, 이해 확인 지원
- 코드 수정, shell 실행, Decision 확정과 State 변경 금지

### Evidence Analyst

- 완료된 Episode에서 Evidence Proposal 생성
- 사용자 본인의 발언과 행동만 평가
- claim 단위 비유 분석, Prompt Dependence와 오해 가능성 제안
- 사용자 직접 대화와 State 직접 변경 금지

### TypeScript Core

- 입력 validation
- Concept normalization과 deduplication
- Evidence proposal acceptance/rejection
- deterministic State Reducer
- Agent별 context packaging과 권한 경계
- SQLite persistence

## 10. Builder와 Helper 계약

- Builder는 Task 시작, 방향 변경, Concept 도입, Decision, 오류 계획 변경, 테스트, 완료 시 Live Project Context를 갱신한다.
- 실제 Decision에는 이유, 선택지, 영향, Builder 추천, 관련 Concept와 코드가 포함된다.
- 사용자는 Helper에게 묻기, Builder 추천대로 진행, 직접 선택·다른 방식 제안을 모두 사용할 수 있다.
- Helper는 최신 Live Context를 먼저 읽고 부족하면 refresh를 요청한다.
- 전체 대화와 전체 Ledger를 매번 주입하지 않고 질문과 관련된 최소 맥락을 사용한다.
- Concept State가 높아도 Helper를 숨기지 않는다.
- 자유 입력창을 중심으로 빠른 설명 카드를 함께 제공한다.
- Builder와 Helper 모두 persistent 자유 입력을 기본 조작으로 사용한다. Decision 선택지와 빠른 설명 카드는 해당 입력창 바로 위의 선택적 추천 답장으로만 제공한다.

## 11. Concept와 Evidence

```text
OBSERVED → EXPLAINED → DEMONSTRATED → TRANSFERRED
```

- OBSERVED: 프로젝트에서 실제 사용됨
- EXPLAINED: 사용자가 자기 언어로 원리·결과를 설명함
- DEMONSTRATED: 현재 프로젝트 판단이나 문제 해결에 사용함
- TRANSFERRED: 새로운 기능이나 프로젝트에서 직접적인 유도 없이 재사용함

Evidence Signal:

- QUESTION, REPHRASE, PREDICTION, JUSTIFIED_DECISION, APPLICATION, TRANSFER, CONTRADICTION

Evidence Strength:

- NONE, WEAK, MEDIUM, STRONG

Prompt Dependence:

- INDEPENDENT, LIGHT_HINT, DIRECTLY_LED

규칙:

- 확인 응답, 카드 클릭, Agent 답 반복, Agent가 작성한 코드는 사용자 이해 Evidence가 아니다.
- Analyst는 proposal만 만들고 Core가 deterministic rule로 State를 계산한다.
- MISCONCEPTION은 상태 단계가 아니라 possible_misconception open issue다.
- 한 번의 오류로 즉시 강등하지 않고 독립된 반복 오류와 이후 올바른 Evidence를 함께 본다.
- 사용자 UI에는 가짜 정밀도 퍼센트나 낙인형 경고를 기본으로 표시하지 않는다.

## 12. Activity와 데이터

- 모든 IDE 행동을 감시하거나 Event마다 LLM을 호출하지 않는다.
- MCP structured report, Crew chat/tool event, Kiro task/session hook, Task 종료 diff를 조합한다.
- 핵심 Event를 BUILD_TASK, DECISION, HELPER_CONVERSATION, FINAL_UPGRADE Episode로 묶어 종료 시 분석한다.
- 전체 repository를 반복 분석하지 않고 Builder Concept Report, 최종 diff, 관련 snippet과 사용자 대화를 사용한다.
- 장기 저장 중심은 코드가 아니라 Concept, Evidence, Decision과 참조다.
- 메모리는 Live Project Context, Project History, Concept Ledger로 분리한다.
- secret redaction과 workspace path validation을 적용한다.

## 13. UI

- Agent 중심과 Code 중심 두 UI는 숙련도 단계가 아니라 취향 차이다.
- MVP 주 surface는 Crew App 기반 Agent 중심 vertical flow다.
- Agent 중심은 왼쪽 실제 Builder session, 오른쪽 Helper chat을 기본으로 한다.
- Code 중심은 Kiro editor와 Builder/Helper panel을 사용하는 얇은 prototype으로 검증한다.
- 두 Mode는 같은 session, Task, Decision, Context와 Ledger를 사용한다.
- 실제 Builder stream은 숨기지 않고 Task Progress는 현재 위치만 보조한다.
- 실제 Builder chat과 composer가 기본 조작면이며, Decision·추천 선택지·Helper quick action은 composer 바로 위에 필요한 동안만 주입한다.
- 완료 화면은 학습 점수보다 완성된 서비스 실행을 먼저 보여준다.

## 14. 기술 경계

- Core와 데이터 계약은 언어 비종속적으로 설계한다.
- MVP가 생성·실행·테스트하는 프로젝트는 TypeScript로 제한한다.
- Kiro/Crew가 대회 MVP의 첫 host다.
- Core, MCP contract, Agent 정책은 Kiro 전용 구조로 만들지 않는다.
- 장기적으로 Claude Code와 Codex adapter를 고려하지만 MVP에는 구현하지 않는다.
- Kiro Power나 UI package 전체가 다른 host에서 그대로 동작한다고 가정하지 않는다.
- Prompt/Skill은 행동 정책, Host LLM은 semantic proposal, MCP는 tool contract, Core는 검증·상태 전이를 책임진다.
- Kiro Agent와 background Analyst를 먼저 사용하며 Bedrock provider는 MVP에서 구현하지 않는다.

## 15. MVP 정의

MVP는 다음 흐름이 실제 Kiro/Crew 환경에서 한 번 끝까지 동작하는 상태다.

```text
새 Learning Goal
→ Discovery와 candidate revision
→ Learning Spec 확정
→ TypeScript Golden Path 생성
→ Builder Task 실행
→ 실제 Decision과 Helper 질문
→ 사용자 선택 적용과 테스트 통과
→ Evidence Proposal과 State 처리
→ Evidence 근거 조회
→ State가 다음 Helper 또는 Discovery 결과를 변경
→ 결과물 실행
```

MVP 필수:

- Discovery, Builder, Helper, Analyst Agent
- TypeScript Core와 SQLite
- MCP 기반 structured contract
- Crew App Agent 중심 UI
- Code 중심 얇은 prototype
- Live Context와 실제 Builder stream
- Decision, Episode, Evidence, Reducer
- Concept recap과 Evidence trace
- Golden Path 한 개와 unseen Discovery input
- baseline과 평가 log를 수집할 수 있는 구조

## 16. MVP 제외

- 기존 임의 프로젝트 전체 분석
- Python/Django 등 다언어 실제 생성·실행
- 완전한 Concept Ontology와 Graph DB
- 장기 기억 감쇠 모델
- 점수·랭킹·게임화와 강제 퀴즈
- 모든 코드·파일·terminal log 저장
- 모든 Event별 inference
- ACP 기반 자체 IDE client와 별도 Electron IDE
- Crew App 안의 완전한 Monaco IDE
- 여러 배포 provider
- Bedrock provider
- Claude Code/Codex adapter
- 복잡한 multi-agent chatter

## 17. MVP 이후 방향

### 대회 제출 전 강화

- 실제 초보자 사용성 테스트와 증언
- 일반 Kiro 대비 Evidence/Helper/Discovery baseline 평가
- false mastery, Concept extraction, alias merge와 Transfer 품질 측정
- Agent 중심 UI polish와 Code 중심 취향 비교
- 오류·빈 상태·권한·접근성·성능 hardening
- 한 가지 실행 또는 배포 Golden Path 검토
- live demo, 코드·Markdown, 발표와 fallback 준비

### 대회 이후 확장

- Claude Code와 Codex adapter
- 기존 프로젝트 import
- 다언어 project runtime
- cloud sync와 다중 device
- 장기 기억 감쇠와 고급 Concept retrieval
- 여러 배포 provider
- Golden Path와 사용자군 확장

## 18. 평가

- Project Discovery: 다양성, Concept Necessity, 만들고 싶은 정도, 반복 테마 여부
- Evidence Engine: precision/recall, false mastery, contradiction, transfer, alias merge
- Helper: 일반 Kiro 대비 관련성, 반복 감소, Decision 도움
- UI: 자발적 Helper 사용, Decision 이해, Builder 상태 이해, 통제감, 선호
- 사용자 검증: 실제 초보자가 결과물을 완성하고 다시 만들 동기를 얻었는지
- Live Demo: 새로운 입력에서도 전체 vertical flow와 state 기반 개인화가 동작하는지

## 19. 외부 제약

- AI Innovators Challenge는 AWS가 지원하는 LLM API를 활용한 AI 서비스를 요구한다.
- 공식 평가에서 기술적 우월성과 서비스 활용성·완성도가 각각 30점으로 가장 크다.
- 참가팀에는 Kiro token 약 2개월이 제공된다.
- Kiro 지급 방식, model과 quota는 실제 환경에서 확인해야 한다.
- 제품은 기존 다른 대회 제출물이 아닌 신규 결과물이어야 한다.
- Activity 수집 안내, 개인정보 최소화와 secret redaction이 필요하다.

## 20. 첫 Golden Path

사용자의 학교 파일 공유 경험을 TypeScript로 옮긴 `Campus Drop`을 첫 통합 검증 fixture로 사용한다.

- 공용 PC와 개인 기기 사이 파일 전송
- QR 또는 일회용 link
- metadata와 실제 파일 저장 분리
- 만료와 접근 token
- object storage는 Agent Support 가능
- 로그인, 영구 보관, 대용량 upload는 제외

Campus Drop은 고정 추천 template가 아니라 테스트 fixture다. Discovery가 항상 같은 종류의 후보를 생성해서는 안 된다.

## 21. 명시적으로 보류한 결정

- 최종 제품명과 branding
- 실제 배포 workflow와 AWS service
- 배포를 MVP 완료 조건으로 둘지 여부
- Crew App과 Kiro IDE session 공유 방식
- Code Mode의 기본 Helper 위치
- 실제 Kiro model과 quota 대응
- Evidence confidence threshold와 reducer 세부 수치
- Concept similarity와 embedding
- SQLite DDL과 migration
- 사용자 연구 규모
- Bedrock fallback

## 22. 구현 전 문서 우선순위

1. 이 `PROJECT_BRIEF.md`
2. `docs/SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. `docs/TASKS.md`
6. `docs/agent-prompts/*.md`
7. `PROJECT_SPEC.md`
8. `CONVERSATION_RECORD.md`

충돌하면 더 높은 문서를 우선한다. `PROJECT_SPEC.md`와 대화 기록은 상세 맥락을 제공하지만 구현 기준은 bootstrap 문서로 이동한다.
