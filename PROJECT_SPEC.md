# Vibe Helper 프로젝트 최종 정리 합의본

> 상태: 구현 전 합의 기준 문서
> 작성 기준일: 2026-08-24
> 제품명: 아직 확정하지 않음. 대화 중 `BuildWhy`, `Vibe Helper`를 작업명으로 사용함.
> 목적: 이후 기획, 설계, 구현, 평가에서 우선 참조할 단일 기준 문서

## 1. 제품 정의

이 제품은 단순한 프로젝트 추천 AI도, 학습 상태만 추적하는 교육 도구도 아니다.

목표는 다음과 같다.

> 코딩 초보자가 바이브코딩을 도구로 삼아 자신에게 실용적이거나 매력적인 서비스를 고르고, Builder Agent와 함께 실제로 완성하면서 개발 동력을 얻는다. 개발 중 궁금하거나 판단이 필요한 순간에는 read-only Helper Agent와 자율적으로 대화하며 개념을 이해하고, 그 과정에서 관찰된 Evidence를 바탕으로 이후의 설명과 프로젝트 추천이 개인화된다. 궁극적으로 사용자가 자신에게 필요한 서비스를 자신의 판단으로 만들어낼 수 있게 한다.

제품 경험은 다음의 전체 패키지다.

```text
만들고 싶은 프로젝트 발견
→ 부담 없는 범위 확정
→ Builder 중심의 실제 개발
→ 필요한 순간 Helper와 대화
→ 실제 판단과 구현
→ 선택적인 Final Upgrade
→ 완성된 서비스와 개발 경험 축적
→ 다음 프로젝트와 설명의 개인화
```

기술적 중심은 `Personal Developer Engine`이다. 이 엔진은 프로젝트, Task, Decision, Concept, Evidence, 과거 Episode를 구조화하고 다음 추천과 설명에 활용한다. 그러나 사용자에게 보이는 핵심은 엔진 자체가 아니라 실제 서비스를 만들어내는 경험이다.

## 2. 제품 철학

### 2.1 Build-first

- 교육보다 개발을 우선한다.
- 학습을 위해 개발을 반복적으로 중단하지 않는다.
- 사용자가 Helper를 호출하지 않았다는 이유로 질문이나 퀴즈를 강요하지 않는다.
- 낮은 Concept State를 실패, 점수, 빨간 경고로 표현하지 않는다.
- 완성 화면에서는 학습 기록보다 실제 결과물과 사용 가능성을 먼저 보여준다.

### 2.2 실제 판단을 숨기지 않기

- Builder에 들어가기 전 Learning Spec 확정은 낮은 진입장벽으로 만든다.
- Builder가 실행된 이후에는 실제 바이브코딩에서 사용자가 판단해야 하는 의미 있는 제품·기술 선택을 숨기지 않는다.
- Builder는 추천을 제시하지만 사용자가 판단할 기회를 유지한다.
- Builder는 교육을 위해 가짜 선택지를 만들지 않는다.
- 파일명, 코드 스타일, 사소한 내부 리팩터링처럼 쉽게 되돌릴 수 있는 구현 세부사항은 Builder가 자율적으로 처리한다.

### 2.3 사용자 제어권과 낮은 부담

- 사용자는 언제든 Builder 추천대로 바로 진행할 수 있다.
- 판단이 필요하면 Helper에게 현재 맥락을 전달해 차이를 물어볼 수 있다.
- 사용자는 자연어로 기능, 범위, 후보, Spec을 자유롭게 수정할 수 있다.
- 사용자가 이해 Evidence를 남기도록 유도하기 위해 입력 접근성을 낮추지 않는다.

### 2.4 자연스러운 교육

- Helper는 강사가 아니라 옆자리 동료다.
- 설명은 현재 프로젝트와 실제 Decision에 연결한다.
- 이해 증거는 퀴즈 점수가 아니라 자기식 설명, 예측, 이유 있는 결정, 적용, 전이에서 찾는다.
- `AGENT_SUPPORT` 범위는 필수 학습 대상으로 만들지 않는다.

### 2.5 투명한 Agent 작업 경험

- Builder의 실제 메시지, ToolCall, 파일 변경, 명령, 테스트, 오류와 수정 흐름을 의도적으로 숨기지 않는다.
- 비공개 내부 추론을 노출하는 것이 아니라 실제로 관찰 가능한 Agent 행동을 보여준다.
- 사용자는 이 흐름을 보며 Agent가 일하는 방식과 바이브코딩의 작업 리듬을 익힌다.

## 3. 목표 사용자와 MVP 경계

### 3.1 목표 사용자

- 바이브코딩을 시작하거나 익숙해지는 개인 개발자
- 문법 학습 자체보다 자신이 쓸 서비스를 만들며 배우고 싶은 코딩 초보자
- Agent에게 구현을 맡기면서도 필요한 판단은 이해하고 싶어 하는 사용자

### 3.2 제품 진입 방식

- MVP는 `신규 프로젝트형`만 다룬다.
- 기존 임의 프로젝트를 연결해 분석하는 온보딩은 MVP 범위 밖이다.
- 서비스 안에서 만든 이전 프로젝트 기록은 이후 Discovery와 Helper 개인화에 사용할 수 있다.

### 3.3 기술 범위

- Domain Core와 데이터 계약은 언어 비종속적으로 설계한다.
- 실제 생성, 실행, 테스트, 배포 고려는 TypeScript 프로젝트만 지원한다.
- 특정 프레임워크 전체를 Domain 모델에 박아 넣지 않는다.
- 배포 실행 흐름과 구체적인 AWS 배포 profile은 추후 논의한다.
- 대회 MVP의 첫 host는 Kiro/Crew이지만 Personal Developer Core와 MCP contract는 Kiro 전용 데이터 구조로 만들지 않는다.
- 장기적으로 Claude Code와 Codex 같은 다른 coding Agent host에 얇은 adapter를 붙일 수 있게 한다. 동일한 Power나 UI package가 그대로 호환된다고 가정하지 않고, 공통 Core·MCP·정책만 재사용한다.

### 3.4 입력 경계

필수 입력:

- 배우고 싶은 기술 또는 개념

선택 입력:

- 최근 필요성을 느낀 일
- 개인적 불편
- 관심 영역이나 추가 맥락
- 현재 수준

입력하지 않는 항목:

- available time 또는 시간 예산

후보의 대략적인 난이도나 규모는 보여줄 수 있지만, 사용자가 시작 전에 시간 계획을 반드시 입력하도록 만들지 않는다. 사용자는 반복 대화 중 `더 작게`, `범위를 줄여줘`라고 조절할 수 있다.

## 4. 전체 사용자 흐름

```text
1. Learning Goal 입력
2. 선택적으로 Personal Need 입력
3. 다채로운 프로젝트 후보 탐색
4. 반응과 대화로 반복적으로 좁히기
5. 프로젝트 방향 선택
6. 권장 Learning Spec을 가볍게 확인
7. Agent 중심 또는 Code 중심 화면 선택
8. Builder 개발 시작
9. 실제 Decision에서 Helper와 선택적으로 대화
10. Task 완료와 Evidence 분석
11. 선택적인 Final Upgrade
12. 완성된 서비스와 Concept 근거 확인
13. 이후 프로젝트 추천에 경험 재사용
```

## 5. Project Discovery

### 5.1 Discovery의 역할

Discovery는 사용자가 입력한 기술에 맞는 정답 하나를 즉시 제시하는 기능이 아니다.

> 서로 다른 제품 가능성을 넓게 보여주고, 사용자의 선택·거절·변형 요청 자체를 개인화 정보로 사용해 만족할 때까지 한 프로젝트로 좁혀가는 초보자 친화적 탐색 과정이다.

### 5.2 초기 후보

- 기본적으로 약 10개를 보여주지만 계약상 고정값은 아니다.
- 행사 신청, 쇼핑몰, 파일 공유, 커뮤니티, 블로그 같은 10개 카테고리를 고정해서 순환하지 않는다.
- Agent는 매번 새로운 후보를 만들되 다음 차원이 충분히 다른지 검토한다.
  - 문제 영역
  - 대상 사용자
  - 핵심 상호작용
  - 사용 빈도
  - 중심 데이터 구조
  - 사용자가 끌릴 수 있는 이유
- 동일한 CRUD 구조에 테마만 바꾼 후보를 다양하다고 판단하지 않는다.

### 5.3 Personal Need가 없는 경우

- 기술만으로도 바로 후보를 생성한다.
- 개인 도구, 현실 운영, 콘텐츠, 커뮤니티, 창작, 친숙한 서비스 재현 등 다양한 가능성을 탐색할 수 있지만 이를 고정 slot으로 만들지 않는다.
- 재미, 호기심, 익숙한 서비스를 직접 재현해보려는 욕구도 유효한 동기다.

### 5.4 Personal Need가 있는 경우

- 자연스럽게 그 필요를 반영한 후보와 독립적인 탐색 후보를 섞는다.
- 기본 목표는 대략 절반씩이지만 강제 quota가 아니다.
- 기술과 필요를 억지로 연결해야 한다면 관련 후보를 줄이고 그 사실을 설명한다.
- Personal Need에 앵커링되어 다른 매력적인 프로젝트 가능성을 모두 잃지 않는다.

### 5.5 DIRECT / EXPAND / DISCOVER / UPGRADE

네 용어는 하나만 먼저 선택하는 hard router가 아니다. 후보가 만들어진 전략을 나타내는 내부 tag다.

- `DIRECT`: 입력한 필요를 직접 해결
- `EXPAND`: 필요에 기능을 더하면 목표 기술이 자연스럽게 필요
- `DISCOVER`: 입력한 필요와 무관한 새로운 프로젝트 가능성
- `UPGRADE`: 서비스 안에서 이전에 만든 프로젝트를 새로운 방향으로 확장

여러 전략에서 후보를 생성한 뒤 함께 평가한다. 첫 사용자는 이전 프로젝트가 없으므로 UPGRADE 후보가 없다.

### 5.6 추천 평가 기준

- `Concept Necessity`: 목표 기술을 빼면 핵심 기능이 약해지는가
- `Personal Utility`: 사용자가 실제로 쓸 이유가 있는가
- `Adoption Feasibility`: 실제 사용자의 접근, 승인, 운영 가능성이 있는가
- `Learner Fit`: 현재 사용자에게 완주 가능한가
- `Scope Feasibility`: TypeScript MVP로 적절한가
- `Adjacent Complexity`: 목표 밖의 필수 복잡성이 과도하지 않은가
- `Deployability`: 지원할 TypeScript 배포 경계 안에서 가능한가
- `Distinctiveness`: 다른 후보와 제품 경험이 실제로 다른가
- `Previous Experience`: 이미 한 경험의 반복인지, 자연스러운 확장인지

점수는 내부 ranking에 사용할 수 있지만 사용자에게는 숫자보다 이유를 보여준다.

### 5.7 반복적인 narrow-down

```text
Candidate Round
→ 사용자 반응 또는 자연어 요청
→ 후보 고정·삭제·병합·변형·축소·재생성
→ 다음 Candidate Round
→ 만족할 때까지 반복
```

- `RefinedCandidate`와 `FinalCandidate`를 별도 타입으로 만들지 않는다.
- 모든 후보는 같은 `ProjectCandidate`의 revision이다.
- 사용자가 명시적으로 `이걸로 만들자`고 하거나 확인 버튼을 눌러야 후보 선택이 끝난다.
- 기존 후보와 반응을 덮어쓰지 않고 lineage를 남긴다.

### 5.8 후보 카드

후보 카드는 최소한 다음을 설명한다.

- 제목과 한 줄 제품 설명
- 왜 만들고 싶을 수 있는지
- 목표 기술이 왜 필요한지
- 경험할 핵심 Concept
- 대략적인 난이도 또는 규모
- Agent가 맡을 가능성이 높은 보조 기능
- MVP에서 제외할 기능
- Personal Need가 있다면 어떻게 연결되는지

### 5.9 서술형 입력

모든 대화 입력에는 현재 화면에서 실제로 할 수 있는 자연어 예시를 placeholder로 제공한다.

예:

```text
2번과 5번이 마음에 드는데, 혼자 자주 사용할 수 있는 방향으로 섞어줘.
```

고정 명령 문법처럼 보이지 않게 하고, 사용자가 편하게 말해도 된다는 인상을 준다.

## 6. Learning Spec

### 6.1 진입장벽 최소화

Learning Spec은 사용자가 Builder에 들어가기 전에 모든 기술 범위를 설계하게 만드는 단계가 아니다.

Discovery가 권장 Spec을 먼저 완성해서 보여주고 다음을 기본 선택으로 제공한다.

```text
[이대로 시작]
[조금 바꾸기]
[다른 주제로 돌아가기]
```

상세 범위는 확인할 수 있지만 읽고 판단하지 않아도 시작할 수 있어야 한다.

### 6.2 세 가지 범위

- `LEARNER_FOCUS`: 사용자가 이번 프로젝트에서 자연스럽게 이해하고 판단할 목표 기능·개념
- `AGENT_SUPPORT`: 제품 동작에 필요하지만 현재 학습 범위 밖이어서 Builder가 구현하는 기능·개념
- `EXCLUDED`: MVP에서 구현하지 않는 기능

규칙:

- `LEARNER_FOCUS`만 필수 Evidence와 목표 수준을 가질 수 있다.
- `AGENT_SUPPORT`는 Knowledge Debt로 계산하거나 학습을 강요하지 않는다.
- 안전, 비용, 개인정보와 관련된 Agent Support 기능은 최소한의 운영 안내를 제공할 수 있다.
- 사용자가 Agent Support 개념을 자발적으로 질문하고 Evidence를 보이면 기록할 수 있지만 요구사항으로 만들지 않는다.

### 6.3 Learning Spec 최소 내용

- 제품 목적과 핵심 사용자
- 실제 사용 장면과 성공 순간
- MVP 기능
- Learning Scope
- Agent Support Scope
- Excluded Scope
- 예상되는 실제 Decision 영역
- TypeScript 구현 제약
- 현재 알려진 배포 제약
- Helper의 기본 개입 정책

## 7. Builder Task와 실제 Decision

### 7.1 Builder Task

Learning Spec은 제품 기능 단위 Builder Task로 변환한다.

Task에는 다음이 포함된다.

- 제품 목표
- 구현 요구사항
- 수락 조건
- 예상 Concept
- 제외 작업
- 예상 가능한 실제 Decision 영역
- 선행 Task

예상 Concept는 Builder가 가르칠 목록이 아니라 실제 사용 여부를 보고하기 위한 hint다. Builder는 예상하지 못했지만 실제로 중요했던 Concept도 보고할 수 있다.

### 7.2 실제 Decision 원칙

Builder는 다음에 의미 있는 영향을 미치는 실제 선택을 사용자에게 제시한다.

- 제품 동작과 UX
- 데이터 모델과 상태 규칙
- API 계약
- 인증과 권한
- 보안과 개인정보
- 저장, 보관, 삭제
- 비용
- 주요 아키텍처
- 목표 Concept와 직접 연결된 구현 방향

Builder는:

- 선택이 필요한 이유를 말한다.
- 실제 선택지와 영향을 설명한다.
- Builder 추천을 말한다.
- `Helper에게 물어보기`, `Builder 추천대로 진행`, `직접 선택/다른 방식 제안`을 모두 제공한다.
- Helper는 Concept State와 관계없이 항상 접근 가능하게 한다.
- 결정 때문에 막힌 부분 외에 진행 가능한 작업은 계속한다.

사용자가 추천대로 바로 진행하면 구현은 계속되지만 그 선택만으로 학습 Evidence를 만들지 않는다. Helper와 대화하거나 독립적으로 이유를 제시한 뒤 판단하면 Evidence 후보가 될 수 있다.

### 7.3 Task Completion Report

Task 완료 시 Builder는 다음을 구조화해서 보고한다.

- 구현한 기능
- 테스트와 검증 결과
- 실제 사용된 핵심 및 보조 Concept와 이유
- 적용한 Decision
- 관련 코드 참조
- Learning Spec에서 벗어난 변경
- 남은 이슈와 제한사항

Builder는 사용자 이해 여부를 판정하지 않는다.

## 8. Builder 실시간 작업 맥락

Task 완료 시점만 기록하면 Helper가 개발 중간의 현재 상황을 이해할 수 없다. Builder는 의미 있는 checkpoint마다 `Live Project Context`를 갱신한다.

갱신 시점:

- Task 시작
- 구현 방향 결정 또는 변경
- 중요한 Concept 도입
- 사용자 판단 필요
- 오류로 계획 변경
- 테스트 단계 진입
- Task 완료

Live Context 내용:

- 현재 Task
- 현재 단계
- 현재 목표
- 최근 변경
- 주요 결정
- 사용 중인 Concept
- 관련 파일
- 다음 작업
- 마지막 갱신 시각과 version

Live Context는 학습 Evidence가 아니라 Helper와 UI를 위한 최신 snapshot이다.

## 9. Builder와 Helper의 맥락 공유

Helper는 Builder 작업 맥락에 접근할 수 있어야 하지만 전체 대화를 매번 주입하지 않는다.

조회 우선순위:

1. 최신 Live Project Context
2. 현재 Task와 Learning Spec
3. 관련 Decision
4. 관련 Concept State
5. 과거 Project Episode
6. 관련 코드와 diff
7. 필요한 경우에만 Builder 대화 일부

Helper의 질문별 context package는 관련 Concept 약 3~5개와 필요한 최소 맥락을 목표로 한다. 맥락이 없거나 오래됐으면 추측하지 않고 Builder Context 갱신을 요청한다.

## 10. Agent 구성과 책임

### 10.1 Discovery Agent

- 후보 생성, 평가, 반복 refinement, Learning Spec 초안
- 코드와 shell 접근 없음
- 학습 상태 직접 변경 없음

### 10.2 Builder Agent

- 실제 코드 작성, 명령, 테스트, 디버깅
- 투명한 작업 stream
- Live Context 갱신
- 실제 Decision 요청
- Task와 Concept Report
- 학습 상태 직접 변경 없음

### 10.3 Helper Agent

- read-only
- 현재 Builder 맥락과 관련 코드 조회
- 현재 판단에 필요한 설명
- 더 쉽게, 더 자세히, 현재 코드로 예시, 선택지 비교, 내 이해 확인 지원
- 코드 수정, shell, Decision 직접 확정, Concept State 수정 금지

### 10.4 Evidence Analyst

- 완료된 Episode에서 Evidence Proposal 생성
- Concept 정규화 후보와 오해 가능성 제안
- 사용자와 직접 대화하지 않음
- 상태 직접 변경 없음

### 10.5 TypeScript Core

- 입력 validation
- Concept normalization과 deduplication
- Evidence acceptance/rejection
- deterministic State Reducer
- SQLite 저장
- Agent별 권한과 context package 제공

### 10.6 Agent 프롬프트

실제 합의된 프롬프트 원문은 다음 파일을 기준으로 한다.

- [Discovery Prompt](docs/agent-prompts/discovery.md)
- [Builder Prompt](docs/agent-prompts/builder.md)
- [Helper Prompt](docs/agent-prompts/helper.md)
- [Evidence Analyst Prompt](docs/agent-prompts/evidence-analyst.md)

## 11. Helper UX와 행동

### 11.1 항상 접근 가능

- `OBSERVED`, `EXPLAINED`, `DEMONSTRATED`, `TRANSFERRED` 모든 상태에서 Helper를 계속 표시한다.
- 사용자가 이미 적용한 Concept라도 현재 상황과 무엇이 같은지 바로 알아채지 못할 수 있다.
- State는 Helper의 표시 여부가 아니라 설명의 출발점과 과거 경험 연결 방식만 바꾼다.

### 11.2 입력 방식

자유 입력창을 중심으로 두고 빠른 카드 선택을 함께 제공한다.

- 더 쉽게
- 더 자세히
- 현재 코드로 예시
- 선택지 비교
- 내 이해가 맞는지 확인

카드 선택 자체는 Evidence가 아니다. `내 이해가 맞는지 확인`은 사용자가 자기 설명을 편하게 적을 수 있게 입력창을 전환한다.

Helper placeholder 예:

```text
지금 Builder가 왜 token을 hash해서 저장하는지 쉽게 설명해줘.
```

### 11.3 설명 깊이

- 처음에는 간결하게 답한다.
- 사용자의 요청으로 깊이를 늘린다.
- 현재 코드와 Decision을 우선 예시로 사용한다.
- 과거 프로젝트와 연결할 때 공통점뿐 아니라 다른 점도 설명한다.
- `이미 알고 있잖아` 같은 표현을 사용하지 않는다.

### 11.4 비유

질문형 비유도 대응 관계가 정확하면 의미 있는 Evidence가 될 수 있다.

예:

```text
DB 모델 추가가 엑셀 열 추가이고 실제 데이터가 행 추가인 거네?
```

이 발언은 하나로 판정하지 않는다.

- 실제 데이터와 행의 대응: 올바른 부분
- Model과 열의 대응: 보통은 불완전함. Model은 표/시트, field가 열에 더 가까움

Helper는 맞는 부분을 인정하고 필요한 부분만 수정한다. Analyst는 주장별 Evidence와 오해 가능성으로 분리한다.

## 12. Concept와 Evidence 모델

### 12.1 Concept State

```text
OBSERVED
→ EXPLAINED
→ DEMONSTRATED
→ TRANSFERRED
```

- `OBSERVED`: 프로젝트에서 실제 사용됨
- `EXPLAINED`: 사용자가 자기 언어로 원리나 결과를 설명함
- `DEMONSTRATED`: 현재 프로젝트 판단 또는 문제 해결에 사용함
- `TRANSFERRED`: 새로운 기능이나 프로젝트에서 직접적인 유도 없이 재사용함

내부 confidence는 저장할 수 있지만 사용자 UI에는 가짜 정밀도의 퍼센트를 기본으로 보여주지 않는다.

### 12.2 Evidence 신호

- `QUESTION`
- `REPHRASE`
- `PREDICTION`
- `JUSTIFIED_DECISION`
- `APPLICATION`
- `TRANSFER`
- `CONTRADICTION`

강도:

- `NONE`: 확인 응답, 카드 클릭, Agent 답 반복
- `WEAK`: 단순 질문이나 Concept 언급
- `MEDIUM`: 올바른 전제의 질문, 부분 설명, 가벼운 hint 후 판단
- `STRONG`: 정확한 설명, 예측, 이유 있는 결정, 적용, 독립 전이

Agent 의존성:

- `INDEPENDENT`
- `LIGHT_HINT`
- `DIRECTLY_LED`

### 12.3 상태 전이 규칙

- Builder가 Concept 사용을 보고하고 코드/Task 근거가 있으면 `OBSERVED` 후보
- 강한 자기식 설명 또는 예측, 혹은 서로 다른 시점의 중간 Evidence가 충분하면 `EXPLAINED` 후보
- 강한 이유 있는 결정 또는 실제 적용이면 `DEMONSTRATED` 후보
- 새로운 맥락에서 직접적인 Agent 유도 없이 적용하면 `TRANSFERRED` 후보
- Agent가 정답을 직접 이끈 반복은 강한 Evidence로 사용하지 않는다.
- Analyst는 제안만 하고 Core가 deterministic rule로 실제 상태를 계산한다.

### 12.4 오해 가능성

`MISCONCEPTION`은 학습 단계가 아니다.

- negative Evidence 또는 `possible_misconception` open issue로 저장한다.
- Helper가 즉시 정정했더라도 사용자가 이해했다는 뜻은 아니다.
- 첫 모순 발언만으로 상태를 즉시 강등하지 않는다.
- 이후 올바른 판단이 나오면 issue를 해결한다.
- 독립된 시점에 같은 핵심 오해가 반복되면 confidence를 낮추거나 가장 확실한 이전 단계로 재계산할 수 있다.
- 사용자 UI에는 낙인처럼 표시하지 않는다.

기본 흐름은 다음과 같다.

```text
사용자 발언에서 부분적 오류 발견
→ Helper가 현재 판단에 필요한 차이만 즉시 정정
→ Analyst가 맞는 주장과 contradiction을 분리해 제안
→ Core가 possible_misconception issue를 열되 State는 즉시 강등하지 않음
→ 이후 자연스러운 설명·Decision·적용에서 다시 관찰
→ 올바른 독립 Evidence면 issue 해결
→ 같은 핵심 오류가 독립된 시점에 반복되면 confidence/State 재계산
```

## 13. Concept State 활용

### 13.1 Builder

- 전체 Ledger를 거의 읽지 않는다.
- State에 따라 구현 품질을 바꾸지 않는다.
- 현재 Learning Scope와 Task를 따르고 Concept 사용을 보고한다.

### 13.2 Decision UI

- State와 관계없이 Helper를 항상 표시한다.
- 낮은 State에서는 첫 Helper affordance를 가볍게 강조할 수 있다.
- 높은 State에서는 과거 경험을 짧게 연결할 수 있지만 이해를 가정하지 않는다.

### 13.3 Helper

- OBSERVED: 현재 프로젝트를 기준으로 기초 원리부터 설명 가능
- EXPLAINED: 기본 반복을 줄이고 실제 차이에 집중
- DEMONSTRATED: 사용자가 과거에 내린 판단과 연결
- TRANSFERRED: 이미 경험한 원리는 짧게 하고 새로운 차이를 설명
- open issue: 낙인 없이 핵심 구분부터 설명

### 13.4 Evidence Analyst

- 기존 State와 맥락을 보고 현재 적용인지 Transfer인지 구분한다.
- 열린 오해가 해결됐는지 판단한다.

### 13.5 Discovery

- 흥미와 실용성이 우선이다.
- 비슷하게 매력적인 후보 사이에서 아직 충분히 적용하지 않은 Concept를 자연스럽게 사용하는 후보를 조금 높일 수 있다.
- Ledger가 추천을 지배하는 자동 커리큘럼이 되어서는 안 된다.

### 13.6 Final Upgrade

- 실제 제품 가치를 높이는 기능이어야 한다.
- 현재 프로젝트 범위를 크게 깨지 않아야 한다.
- 핵심 Concept의 자연스러운 적용 기회를 만들 수 있다.
- 교육을 위해 쓸모없는 기능을 추가하지 않는다.
- 사용자는 언제든 건너뛸 수 있다.

## 14. Activity, Episode, 코드 분석

### 14.1 수집 원칙

모든 IDE 행동을 감시하거나 메시지마다 LLM을 호출하지 않는다. 의미 있는 사건을 저장하고 Episode가 끝날 때 분석한다.

핵심 Activity:

- Task 시작/완료
- 사용자 메시지
- Helper 응답
- Decision 요청/해결
- Concept Report
- 검증 결과
- 필요한 코드 변경 참조

### 14.2 수집 경로

- MCP: Builder Report, Live Context, Decision, Task Completion
- Crew Events: 사용자와 Helper 대화, ToolCall, 응답 완료
- Kiro Hooks: Task와 세션 경계
- Git diff: Task 종료 시 관련 변경 확인

MVP에서는 모든 PostFileSave와 전체 shell 로그를 별도 학습 데이터로 저장하지 않는다. Builder UI에서 실제 stream은 보여주되 장기 분석 데이터는 의미 있는 사건으로 정규화한다.

### 14.3 Episode

- `BUILD_TASK`
- `DECISION`
- `HELPER_CONVERSATION`
- `FINAL_UPGRADE`

관련 Event를 묶고 다음 시점에 완료한다.

- Task Completion Report
- Decision의 실제 적용
- Helper 대화 종료 또는 Builder 복귀
- Final Upgrade 구현·검증 완료

Analyst는 개별 Event가 아니라 Episode 전체를 분석한다.

### 14.4 코드 분석 경계

장기 저장의 중심은 코드가 아니라 Concept와 Evidence다.

기본 분석 입력:

- Learning Spec의 예상 Concept
- Builder의 구조화된 Concept Report
- Task의 최종 diff
- 관련 함수 또는 코드 조각
- 관련 사용자·Helper 대화

전체 repository를 반복 분석하지 않는다. 전체 scan은 누락 검증이나 모호한 판정이 있을 때만 고려한다.

코드의 역할:

- Concept가 프로젝트에 실제 사용됐는지 확인
- 사용자의 이해 여부를 판정하는 근거로는 사용하지 않음

저장 가능한 코드 근거:

- path
- diff 또는 commit hash
- redacted된 짧은 snippet
- 관련 Task와 이유

## 15. 세 종류의 메모리

### 15.1 Live Project Context

- 최신 Builder 상태
- 최신 값이 중요하며 갱신 가능한 snapshot
- Helper가 가장 먼저 읽음
- 학습 Evidence가 아님

### 15.2 Project History

- 완료 Task
- Decision
- Helper Conversation
- Builder Report
- 테스트 결과
- Episode

### 15.3 Concept Ledger

- Canonical Concept
- 현재 State
- Evidence
- Project와 Task 참조
- open issue
- 과거 경험 연결

```text
Live Context
→ Task와 Episode 완료
→ Project History
→ Evidence 분석
→ Concept Ledger
```

## 16. Concept Normalization

Builder와 Helper가 같은 Concept를 다른 이름으로 부를 수 있다.

예:

```text
DB unique
Unique Constraint
중복 방지 제약
UNIQUE index
```

Normalizer는 다음을 판단한다.

- 기존 Concept의 확실한 alias인가
- 구현 패턴과 일반 Concept의 관계인가
- 너무 세부적인 라이브러리·문법인가
- 앞으로 다른 프로젝트에서도 판단에 사용할 가치가 있는가

확실한 alias는 같은 Canonical Concept에 연결한다. 애매하면 자동 merge하지 않고 proposal 또는 별도 Concept로 남긴다. 완전한 Concept Ontology나 Graph DB는 MVP 범위가 아니다.

## 17. UI 구조

### 17.1 두 가지 UI는 숙련도 단계가 아님

- `Agent 중심`: Builder와 Helper를 나란히 보며 Agent orchestration을 중심으로 작업
- `Code 중심`: Kiro 코드 편집기를 중심으로 Builder와 Helper를 side panel에서 사용

둘은 개인 취향과 작업 방식의 차이다. Agent 중심을 초보자용, Code 중심을 고급 사용자용으로 정의하지 않는다. 진정한 바이브코더가 Agent 중심을 선호할 수도 있다.

### 17.2 Agent 중심

- Crew App을 주요 구현 surface로 검토
- 왼쪽은 실제 Builder session과 ToolCall stream
- 오른쪽은 Helper 일반 대화창
- Builder stream 위에 Task, Live Progress, Decision Card, Helper로 보내기 기능을 얹음
- 코드와 diff는 필요할 때 펼쳐보고 Kiro에서 열 수 있음

### 17.3 Code 중심

- Kiro의 기존 편집기를 코드 surface로 사용
- Builder와 Helper를 tab 또는 분할 panel로 제공
- 필요하면 Helper를 별도 panel로 pin
- Agent 중심과 동일한 session, Decision, Context, Ledger를 사용
- Crew App 안에 별도 완전한 IDE를 새로 구현하지 않음

### 17.4 공통 UI

- BuilderChat
- HelperChat
- TaskProgress
- DecisionCard
- CodeDiffPreview
- ProjectHeader
- ConceptRecap

모드 전환 시 대화와 현재 Task 상태가 이어져야 한다.

### 17.5 Builder 작업 stream

- 요약된 Task 상태만 보여주고 실제 Agent 과정을 숨기지 않는다.
- ToolCall, 파일 변경, 명령, 테스트, 오류와 수정이 실제 Agent 방식 그대로 보인다.
- 긴 항목은 사용자 선택으로 접을 수 있다.
- Live Progress header는 stream을 대체하지 않고 현재 위치를 알려준다.

### 17.6 완료 화면

먼저 보여줄 것:

- 완성된 서비스
- 실행 또는 열기
- 공유 또는 이후 배포 진입점

그다음 보여줄 것:

- 이번 프로젝트에서 접한 Concept
- 직접 설명한 Concept
- 판단에 사용한 Concept
- 실제 Evidence

배포를 어떤 서비스와 workflow로 연결할지는 보류한다.

## 18. Local-first, 개인정보, 보안

확정 원칙:

- 데이터는 로컬 SQLite에 저장
- Activity 수집이 기본 활성화된다는 사실을 사용자에게 안내
- secret redaction
- 전체 repository, 모든 파일 저장 이력, 전체 terminal output을 장기 저장하지 않음
- 관련 발언, Decision, Concept, Evidence, 참조만 저장
- Helper는 read-only
- Analyst는 Episode만 접근
- Builder write/shell은 생성된 project workspace로 제한

MCP 서버는 자체적으로 입력과 path를 다시 검증해야 한다. Agent permission만 신뢰하지 않는다. 임의 SQL, 임의 파일 read/write, workspace 밖 path를 Agent 도구로 노출하지 않는다.

## 19. 기술 아키텍처

```text
Crew App Agent Mode ─────┐
Kiro Extension Code Mode ├─→ Application/Core API
                         │
Discovery Agent ─────────┤
Builder Agent ───────────┤
Helper Agent ────────────┤
Evidence Analyst ────────┘
                         ↓
                 Personal Developer Core
                 - Discovery
                 - Task / Decision
                 - Live Context
                 - Episode
                 - Concept Normalizer
                 - Evidence Reducer
                 - Retrieval
                         ↓
                       SQLite
```

권장 module 경계:

- TypeScript Domain Core
- SQLite storage adapter
- MCP adapter
- Kiro/Crew agent adapter
- Crew App UI
- Kiro Extension UI
- evaluation fixtures와 test harness

MCP는 Domain Core 자체가 아니라 protocol adapter다. Agent가 DB를 직접 수정하지 않고 구조화된 tool contract를 통해 Core에 proposal을 보낸다.

### 19.1 추론과 상태 책임

```text
Agent Prompt / Skill
→ Host LLM의 semantic 판단
→ 구조화된 MCP tool call
→ TypeScript Core의 validation·normalization·deterministic reducer
→ SQLite
```

- Prompt/Skill은 Agent가 무엇을 관찰하고 어떻게 행동할지 정한다.
- Host LLM은 대화와 코드 같은 비정형 맥락에서 Candidate, Concept, Evidence proposal을 만든다.
- MCP는 상태 조회, 검색, proposal 제출과 검증 기능을 노출한다.
- Core는 승인 규칙과 상태 전이를 책임진다.
- Agent와 MCP tool이 임의로 SQLite를 직접 수정하지 않는다.

### 19.2 host portability

- Kiro/Crew는 대회 제출과 MVP의 첫 host다.
- Kiro, Codex, Claude Code가 공통 MCP server를 사용할 수 있다는 점을 장기 확장 기반으로 삼는다.
- 재사용 단위는 Core, MCP contract, Agent 정책과 평가 fixture다.
- Kiro Power, Crew App, IDE panel, permission 설정 전체가 다른 host에서 그대로 동작한다고 가정하지 않는다.
- 다른 host adapter 구현은 MVP 범위 밖이다.

## 20. Kiro와 Bedrock 결정

### 확정

- 대회는 별도 전용 API보다는 Kiro token을 지원하는 형태로 이해하며, 실제 지급 방식과 quota는 확인 후 adapter에 반영한다.
- 대회에서 제공되는 Kiro 호출 수단과 token을 우선 사용한다.
- 사용자-facing Builder/Helper뿐 아니라 background Evidence Analyst도 Kiro Agent 호출로 구현하는 방향이다.
- 동기 호출과 background 호출을 Kiro/Crew API 안에서 나눌 수 있다.
- Bedrock을 비용을 감수하며 별도로 붙이는 것을 MVP 기본안으로 두지 않는다.
- 분석기는 `AnalyzerProvider`처럼 교체 가능한 경계를 둘 수 있지만 초기 구현은 Kiro provider만 만든다.

Kiro Crew의 background Agent도 Kiro plan usage를 소비한다. 따라서 Kiro-only는 무비용이라는 뜻이 아니라, 제공 사용량을 먼저 쓰고 별도 provider 비용·인증·평가 복잡성을 추가하지 않는다는 뜻이다.

### Bedrock을 나중에 검토할 조건

- Kiro Evidence 분류 정확도가 평가셋에서 부족
- 독립적인 비교 evaluator가 필요
- 특정 Bedrock model이 비용·지연·구조화 출력에서 실질적으로 유리
- 대회 요구 또는 가점이 명확해짐
- Kiro API의 호출량, model, background 처리 제약이 발견됨

## 21. SQLite 최소 데이터 영역

- `projects`: 프로젝트와 Learning Spec
- `tasks`: Builder Task와 상태
- `live_project_context`: 최신 Builder snapshot
- `decisions`: Decision 요청, 선택, 적용 결과
- `activity_events`: 정규화된 사용자·Agent 사건
- `episodes`: 분석 단위
- `concepts`: Canonical Concept와 alias
- `concept_evidence`: 사용자 발언·판단 근거
- `concept_states`: State와 confidence/open issue
- Discovery session, candidate round, feedback, candidate revision, spec revision을 위한 영역

### 21.1 Discovery 논리 계약

`DiscoveryInput`

- 필수: Learning Goal
- 선택: Personal Need, 현재 수준, 관심 영역, 자유 맥락
- 포함하지 않음: available time

`ProjectCandidate`

- candidate id, revision, parent candidate 또는 merge source
- 제목, 한 줄 설명, 대상 사용자, 핵심 사용 장면
- 왜 끌릴 수 있는지
- Personal Need와의 관계
- 목표 기술이 왜 필요한지와 핵심 Concept
- MVP 핵심 기능
- Learner Focus, Agent Support, Excluded 제안
- 난이도·범위와 주요 위험
- 내부 generation tag와 평가 근거

`CandidateRound`

- discovery session과 round index
- 당시 input/context snapshot
- 표시한 candidate revision 목록
- 생성 이유와 다양성 점검 결과

`DiscoveryFeedback`

- 대상 round와 candidate
- 자연어 feedback
- pin, reject, merge, revise, shrink, expand, regenerate, select 같은 의도
- 새 candidate revision과의 lineage

`LearningSpec`

- 선택한 candidate revision
- 제품 목적, 핵심 사용자, 사용 장면, 성공 순간
- MVP 기능
- Learner Focus, Agent Support, Excluded Scope
- 예상 실제 Decision 영역
- TypeScript와 배포 제약
- revision, 상태, 사용자 확정 여부

`RefinedCandidate`와 `FinalCandidate`라는 별도 객체는 만들지 않는다. 같은 `ProjectCandidate`의 revision과 사용자의 명시적 selection으로 표현한다.

### 21.2 Build 논리 계약

`BuilderTask`

- 제품 목표, 요구사항, acceptance criteria
- 예상 Concept, 제외 작업, 선행 Task
- 예상 가능한 실제 Decision 영역
- 상태와 실행 순서

`DecisionRequest`

- category와 질문
- 선택이 필요한 이유
- 실제 선택지와 영향
- Builder 추천과 추천 이유
- 관련 Task, Concept, 코드 참조
- 사용자 선택, 설명한 이유, Helper 사용 여부
- 실제 적용 결과와 상태

`LiveProjectContext`

- 현재 Task, 단계, 목표
- 최근 변경, 주요 결정, 사용 중인 Concept
- 관련 파일, 다음 작업
- version과 갱신 시각

`TaskCompletionReport`

- 구현 기능과 검증 결과
- 실제 사용 Concept와 이유
- 적용된 Decision
- 코드·diff 참조
- Spec 이탈, 남은 이슈와 제한사항

### 21.3 Evidence 논리 계약

`ActivityEvent`

- actor와 event type
- project, task, decision, conversation 참조
- 발생 시각과 source
- redacted payload 또는 원본 참조

`Episode`

- BUILD_TASK, DECISION, HELPER_CONVERSATION, FINAL_UPGRADE 중 type
- 포함 Event와 관련 Concept 후보
- 시작·종료 경계와 완료 이유
- 필요한 code/diff 참조

`EvidenceProposal`

- Canonical Concept 후보와 원래 표현
- Signal, Strength, Prompt Dependence
- 정확한 사용자 발언·행동 참조
- 판정 이유, 불확실성, 지지 가능한 최대 State
- possible misconception 생성·해결 제안

`ConceptState`

- Canonical Concept
- OBSERVED, EXPLAINED, DEMONSTRATED, TRANSFERRED 중 현재 State
- 내부 confidence와 채택된 Evidence 참조
- open issue와 과거 Project/Task 연결
- reducer version과 갱신 시각

실제 TypeScript 타입, enum 세부값, DDL과 index는 구현 계획 단계에서 이 논리 계약을 깨지 않는 범위로 확정한다.

## 22. MVP 포함 범위

- Learning Goal 입력과 선택적 Personal Need
- 자유롭게 생성되는 초기 후보와 반복 narrow-down
- Candidate revision과 사용자 feedback 기록
- 낮은 장벽의 Learning Spec 확정
- Discovery, Builder, Helper, Analyst Agent
- Builder Task와 실제 Decision 흐름
- Helper always available와 빠른 설명 카드
- Builder Live Context와 실제 작업 stream
- MCP 기반 구조화된 report
- Activity Event와 Episode
- Concept normalization 최소형
- Evidence Proposal과 deterministic State Reducer
- Concept recap과 근거 조회
- Agent 중심 Crew App vertical flow
- Code 중심 얇은 Kiro panel/extension prototype
- TypeScript 프로젝트 Golden Path
- 평가를 위한 baseline과 log

## 23. MVP 제외 또는 보류 범위

- 기존 임의 프로젝트 가져오기와 전체 분석
- Python, Django 등 다언어 실제 생성·실행
- 완전한 Concept Ontology 또는 Graph DB
- 장기 기억 감쇠와 망각 모델
- 점수, 랭킹, 게임화
- 강제 퀴즈와 자동 학습 커리큘럼
- 모든 코드·파일·terminal log 장기 저장
- 모든 Event마다 LLM 호출
- ACP 기반 자체 IDE client
- 별도 Electron IDE
- Crew App 안에 완전한 Monaco IDE 재구현
- 여러 cloud provider와 deployment adapter
- 실제 deployment workflow 확정
- Bedrock provider 구현
- 복잡한 multi-agent chatter

## 24. 개인 경험에서 얻은 Golden Path와 설계 원칙

### 24.1 행사 신청 사이트

- Django와 DB를 배우기 좋은 구조였음
- 선생님 설득 실패로 실제 사용하지 못함
- `Adoption Feasibility`가 실용성 평가에 포함되어야 한다는 근거
- 외부 운영자 승인에 의존하면 기술적으로 적합해도 실제 효용이 낮을 수 있음

### 24.2 파일 공유 시스템

- USB 없이 학교 PC와 개인 기기 사이에서 파일을 옮기는 명확한 필요
- 반 친구들도 사용한 강한 실제 효용
- 파일 저장, 보안, 만료, 배포처럼 목표 framework 밖의 복잡성이 진입장벽이 됨
- `Adjacent Complexity`, `AGENT_SUPPORT`, `EXCLUDED`를 나누게 된 핵심 사례

### 24.3 Popcat와 WebSocket

- 재미와 기술적 호기심도 충분한 개발 동기
- UI count는 즉시 올리고 클릭을 일정 주기로 묶어 보내는 batching을 경험
- WebSocket 외에도 optimistic UI, load reduction, eventual consistency 같은 emergent Concept가 나타날 수 있음을 보여줌

### 24.4 첫 Golden Path 권장안

개인 경험을 TypeScript로 옮긴 `Campus Drop`을 첫 end-to-end 검증 시나리오로 권장한다.

- TypeScript backend와 관계형 DB 학습
- 공용 PC에서 브라우저로 파일 전송
- QR 또는 일회용 link
- metadata와 실제 파일 저장 분리
- 만료와 접근 token
- object storage 연결은 Agent Support가 될 수 있음
- 로그인, 영구 보관, 대용량 upload는 제외

Campus Drop은 제품의 고정 추천이 아니라 첫 통합 test scenario다. Discovery가 항상 Campus Drop 또는 유사 후보를 우선하도록 고정하지 않는다.

## 25. 평가 계획

평가는 구현 이후 실제 초보 사용자를 대상으로 수행하지만, 측정 가능한 log와 비교 조건은 구현 전에 설계한다.

정성 검증의 중심은 실제 초보 사용자의 행동과 증언이다. 사용자가 Helper를 자발적으로 호출했는지, 판단을 이해했다고 느끼는지, 결과물을 자기 손으로 완성했다는 감각과 다시 만들 동기를 얻었는지를 확인한다. 정량 log는 이 증언을 대체하는 점수가 아니라 false mastery와 흐름 이탈을 검증하는 보조 근거다.

### 25.1 Project Discovery

- 후보 다양성
- 목표 기술의 필요성
- 사용자의 후보 선택과 수정 횟수
- 최종 후보에 대한 실제 만들고 싶은 정도
- 고정 카테고리나 단순 테마 반복 여부

### 25.2 Evidence Engine

- Evidence 분류 정확도
- false mastery rate: 이해하지 않았는데 이해했다고 판단하는 비율
- Concept 추출 precision/recall
- alias 중복률과 잘못된 merge
- Contradiction과 Transfer 판정 품질

### 25.3 Helper 비교

- 일반 Kiro Helper
- Concept/Episode context가 제공된 Helper

비교 항목:

- 설명 관련성
- 이미 아는 내용의 불필요한 반복
- 과도한 설명
- 과거 경험의 적절한 연결
- 실제 Decision에 도움이 되었는지

### 25.4 UI 비교

- Agent 중심과 Code 중심을 숙련도 단계가 아닌 취향으로 비교
- 동일한 기능·프로젝트 사용
- 사용 순서를 바꿔 순서 bias 완화
- 자발적 Helper 사용
- Decision 이해와 완료
- Builder 상태 이해
- 통제감
- 결과물을 자신이 만들었다는 감각
- 선호 이유와 사용자 증언

### 25.5 Live Demo

- 미리 고른 입력뿐 아니라 새로운 Learning Goal과 Personal Need에서도 Discovery가 동작해야 함
- Builder 작업, Helper 질문, Decision, Evidence 변화가 한 vertical flow로 보여야 함
- 단순 prompt chain이 아니라 구조화된 state와 이전 데이터가 다음 결과를 실제로 바꾸는 장면이 필요함

## 26. 외부 검증과 대회 전략

2026-08-24 공식 대회 페이지 재확인 기준 핵심은 다음과 같다. 페이지의 일정에는 연도가 직접 표기되지 않으며, 대화 맥락상 2026년 일정으로 이해했다.

- 대회 주제는 AWS가 지원하는 LLM API를 활용한 AI 서비스
- 기술적 우월성 30점, 서비스 활용성·완성도 30점이 가장 큼
- 데이터 활용성, 코드·Markdown 품질, 발표, 공개 투표도 포함
- 예선 탈락이 있으며 결선 live demo에서 새로운 입력도 확인
- Kiro token을 약 2개월 제공
- 기존 다른 대회 제출작이 아닌 신규 제품이어야 함

페이지 표기 일정은 참가 등록 8월 10일까지, 예선 8월 18일~9월 29일, 최종 발표 10월 19일, 데모·시상 10월 20일이다. 대화 시점에는 등록 마감 표기가 이미 지났지만 등록 링크는 남아 있었다. 실제 참가 가능 여부와 지급 자원은 주최 측에 확인해야 한다.

FAQ 답변은 사용자가 직접 확인해 `별도 전용 API 없음`, `자체 AWS/Bedrock 사용 가능`, `live demo의 두드러진 별도 제한 없음`으로 이해했다. 이 세 항목은 정적 페이지에서 답변 본문을 독립적으로 수집하지 못했으므로 구현 전 운영 조건으로 다시 확인한다.

따라서 발표의 기술적 중심은 Custom Agent나 Power를 만들었다는 사실 자체가 아니다.

> 개발 Activity라는 noisy observation에서 사용자가 어떤 Concept를 실제로 이해하고 적용했는지 Evidence를 보수적으로 추론하고, 그 구조화된 경험이 다음 Helper 답변과 Project Discovery를 실제로 바꾸는가

를 구현과 평가로 보여줘야 한다.

Kiro Crew 자체가 cross-session memory, lesson, history, knowledge graph, App UI를 제공하므로 `개인 개발자 메모리`만으로는 차별화가 약하다. 차별점은 audit 가능한 Evidence, 상태 전이, false mastery 제어, Project Discovery와 Decision 지원에 있다.

## 27. 보류·미확정 사항

다음은 이 문서에서 의도적으로 확정하지 않는다.

- 최종 제품명과 branding
- 실제 AWS 배포 경로와 UX
- 배포를 필수 완료 조건으로 둘지 여부
- Agent 중심 Crew App과 Code 중심 Extension의 정확한 packaging
- Code Mode에서 Helper를 tab, secondary sidebar, bottom panel 중 어디에 기본 배치할지
- Kiro Crew SDK와 Kiro IDE 사이 session 공유 구현 방식
- 실제 Kiro model 선택과 호출 quota 대응
- 대회 참가 등록과 실제 지급 자원의 최종 확인
- Evidence confidence threshold와 state reducer 세부 수치
- Concept similarity algorithm과 embedding 도입 여부
- SQLite DDL과 migration 방식
- 사용자 연구 인원과 모집 방식
- Bedrock adapter 추가 여부

이 항목은 구현 계획 또는 spike 결과를 근거로 별도 결정 기록을 남긴다.

## 28. 공식 참고 링크

- 대회: <https://ku-aws-challenge.framer.ai/>
- Kiro Custom Agents: <https://kiro.dev/docs/custom-agents/>
- Kiro Agent Configuration: <https://kiro.dev/docs/custom-agents/configuration-reference/>
- Kiro Hooks: <https://kiro.dev/docs/hooks/>
- Kiro MCP: <https://kiro.dev/docs/mcp/>
- Kiro MCP Security: <https://kiro.dev/docs/mcp/security/>
- Kiro ACP: <https://kiro.dev/docs/cli/acp/>
- Kiro Crew App SDK: <https://kiro.dev/docs/crew/apps/sdk/>
- Kiro Crew: <https://kiro.dev/crew/>
- Agent Plugins compatible clients: <https://agent-plugins.org/compatible-clients>
- Codex MCP: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>
- MCP: <https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro>
- Bedrock Structured Outputs: <https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html>
