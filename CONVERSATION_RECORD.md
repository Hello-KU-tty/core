# Vibe Helper 전체 대화 흐름 및 결정 기록

> 작성 기준일: 2026-08-24
> 목적: 프로젝트가 어떤 문제의식에서 시작했고, 대화 중 무엇이 구체화·수정·폐기되었는지 사용자가 다시 확인할 수 있도록 남긴 상세 기록
> 최종 구현 기준: 이 기록 자체보다 [PROJECT_SPEC.md](PROJECT_SPEC.md)를 우선한다. 이 문서는 결정의 맥락과 변천을 설명한다.

## 1. 기록 범위와 원본

이 문서는 두 대화 시기를 함께 정리한다.

1. [chatgpt-share-6a87d0ba.txt](chatgpt-share-6a87d0ba.txt)에 저장된 초기 ChatGPT 대화
2. 그 파일을 다시 검토하고 대회·Kiro 현황을 검증하면서 현재 합의까지 발전시킨 후속 대화

초기 대화는 아이디어를 넓히고 제품 구조를 탐색하는 과정이었다. 후속 대화는 공식 정보 검증, Kiro Crew와의 중복 확인, 기술적 차별화 재정의, 구체적인 데이터 계약·Evidence 규칙·UI·Agent 책임 확정에 집중했다.

문서에 등장하는 제안은 다음 세 종류로 구분한다.

- `확정`: 현재 합의본에 반영됨
- `수정`: 핵심 의도는 유지됐지만 방식이 바뀜
- `폐기/보류`: 현재 구현 기준이 아니거나 추후 검토

---

# Part I. 저장된 초기 ChatGPT 대화

## 2. 출발점: 초보 바이브코더를 위한 프로젝트 제안

### 사용자 문제의식

처음 출발한 생각은 코딩 초보자가 배우고 싶은 기술을 입력하면 실제 만들어볼 프로젝트를 추천해주는 서비스였다. 단순 강의보다 자신에게 필요한 것을 만들 때 동기가 생기고, AI가 코드를 작성해주는 시대에는 문법 암기보다 코드가 왜 그렇게 구성되는지를 이해하는 것이 중요하다는 문제의식이 있었다.

### 초기 제안

ChatGPT는 프로젝트를 단순 추천하는 GPT는 쉽게 복제될 수 있다고 판단했다. 그래서 다음 흐름을 제안했다.

```text
사용자가 배우고 싶은 기술과 개인적 필요 입력
→ 그 기술이 실제로 필요한 프로젝트 추천
→ Kiro Spec으로 실제 구현
→ AI가 사용한 개념 중 사용자가 이해하지 못한 부분 추적
→ 필요한 순간 설명
→ 결과물을 완성하고 이후 프로젝트로 연결
```

작업명으로 `BuildWhy`가 제안됐고 다음 문구가 사용됐다.

> 만드는 건 AI에게. 왜 그렇게 만드는지는 나에게.

### 중요한 첫 결정: 기술 필연성

예로 Redis를 배우고 싶은 사용자에게 Redis Todo List를 추천하는 것은 나쁜 추천으로 지적됐다. Todo List는 Redis가 없어도 잘 동작하므로 사용자는 Redis를 썼지만 왜 필요한지 알기 어렵다.

반대로 학교 축제 한정 수량 굿즈 선착순 신청은 다음 때문에 Redis가 자연스럽게 필요했다.

- 동시 신청
- 중복 예약 방지
- 잔여 수량
- 임시 예약 TTL

여기서 `Concept Necessity`가 핵심 추천 기준으로 등장했다.

> 목표 기술을 제거하면 프로젝트가 얼마나 약해지는가?

추천 기준은 관심, 개인적 필요, 기술 필연성, 난이도, 구현 가능성 등을 함께 보는 방향으로 발전했다.

### 상태

- 기술을 억지로 붙이지 않는다는 원칙: 확정
- 처음부터 Personal Need가 반드시 있어야 한다는 가정: 이후 수정
- 단순 Project Matcher가 아니라 Need-to-Learn Engine이라는 방향: 유지

## 3. Kiro Spec을 Learning Spec으로 확장

초기 제안에서는 Kiro의 requirements, design, tasks 흐름에 학습 메타데이터를 붙이는 방안이 나왔다.

예를 들어 `S3 presigned URL 기반 파일 업로드` Task라면 단순 구현 지시 외에 다음을 연결한다.

- HTTP PUT
- presigned URL
- Object Storage
- CORS
- 이 기술이 필요한 이유

프로젝트 계획이 제품 요구사항뿐 아니라 학습 목표를 포함하는 `Learning Spec`이 되는 구조였다.

이 아이디어는 이후에도 유지됐지만, 교육 정보가 사용자에게 과도하게 노출되면 Builder 진입장벽이 된다는 우려가 생겼다. 최종적으로 Learning Spec은 다음처럼 바뀌었다.

- Discovery가 권장안을 먼저 완성
- 사용자는 `이대로 시작`으로 쉽게 확정 가능
- 상세 범위는 Learning, Agent Support, Excluded로 구분
- Builder가 시작된 뒤 실제 판단에서 학습이 자연스럽게 발생

## 4. Knowledge Debt의 등장

### 초기 정의

바이브코딩의 핵심 문제를 Technical Debt가 아니라 `Knowledge Debt`가 쌓이는 것으로 정의했다.

AI가 500줄의 코드를 작성해 앱은 동작하지만 사용자가 다음을 모를 수 있다.

- 인증이 왜 필요한가
- CORS가 무엇인가
- DB transaction을 왜 쓰는가
- IAM 권한이 왜 실패했는가

초기 UI는 프로젝트에 등장한 개념을 빨강·노랑·초록으로 보여주고 이해하지 않은 개념 수를 Knowledge Debt로 표시하는 형태였다.

### 사용자 피드백

사용자는 기술이 추가될 때마다 교육을 강요하면 개발이 교육에 종속될 수 있다고 지적했다. 핵심은 개발이 먼저이고, 사용자가 판단을 내리기 위해 궁금한 내용을 별도 Helper에게 물어보는 흐름이어야 한다고 했다.

사용자의 실제 바이브코딩 경험은 구현 Agent와 간단한 설명 Agent를 동시에 활용하는 것이었다. 구현은 강한 Agent에게 맡기고, 중간중간 필요한 개념은 가벼운 Agent에게 물어본다는 비유가 제품 구조에 반영됐다.

### 방향 전환

Knowledge Debt를 계속 사용자에게 경고하고 자동 교육하는 방식에서 다음으로 바뀌었다.

- Knowledge Debt는 사용자-facing 경고보다 내부 상태
- Builder는 개발을 계속 진행
- Helper는 사용자가 원할 때만 호출
- 자동 개입은 보안, 비용, 데이터 손실, 큰 아키텍처 같은 실제 판단에 한정
- Final Mission은 시험이 아니라 `배포 전 마지막 업그레이드`로 표현

이것이 첫 번째 큰 전환이었다.

> 교육 기능이 개발을 끌고 가는 구조에서, 개발 중 실제 판단이 교육 기회를 만드는 Build-first 구조로 바뀌었다.

## 5. Builder와 Helper 분리

### Builder

- 실제 구현 주도
- 프로젝트를 앞으로 진행
- 사용된 기술과 중요한 Decision 기록
- 사용자의 이해 여부는 판단하지 않음

### Helper

- 현재 프로젝트를 읽음
- 사용자가 질문할 때 설명
- 구현 파일을 수정하지 않는 read-only 역할
- 현재 선택을 내리는 데 필요한 지식만 제공
- 과거 프로젝트 경험을 연결

초기에는 Helper가 이해 상태도 직접 업데이트하는 안이 있었지만, 이후에는 Evidence Analyst와 deterministic Core를 분리하는 쪽으로 강화됐다.

Builder와 Helper의 시스템 프롬프트와 권한이 제품 성과를 좌우한다는 인식이 이때부터 명확해졌다.

## 6. 이전 프로젝트와 실제 배포

사용자는 이전에 만든 프로젝트를 새 학습 목표에 맞춰 변형하거나 확장하는 후보도 추천하면 좋겠다고 제안했다. 새 프로젝트만 만드는 것뿐 아니라 기존 서비스를 업그레이드하는 경험도 중요하다는 생각이었다.

또 실용적 서비스를 만든다는 철학을 지키려면 배포도 쉽게 이어져야 한다는 논의가 나왔다. 사용자의 AWS 계정을 경계로 배포 자유도와 상업성을 확보할 수 있다는 아이디어가 제시됐다.

당시 MVP에는 한 가지 AWS deployment profile을 포함하는 안도 있었다. 이후 공식 현황 검증과 범위 재평가를 거쳐 다음처럼 바뀌었다.

- Discovery 단계에서 deployability는 고려
- 실제 구현 언어는 TypeScript
- 구체적인 배포 workflow와 provider는 추후 논의
- 여러 AWS architecture와 자동 배포는 MVP에서 보류

### 당시 검토한 배포 방식

초기에는 제품이 사용자의 서비스를 직접 hosting하지 않고 사용자의 계정 경계에서 배포하는 `Bring Your Own AWS`가 적절하다고 봤다. 서비스가 직접 hosting하면 compute, DB, storage, 악성 사용, 트래픽, 개인정보, 서비스 종료 뒤 데이터까지 떠안기 때문이다.

당시 검토한 최소 deployment profile은 다음과 같았다.

- React/Next 계열 정적·웹 앱 → AWS Amplify
- Django/FastAPI/Express 같은 범용 서버 → Docker → Lightsail Container
- 사용자의 로컬 AWS CLI/session을 사용해 credential을 서비스 서버가 보관하지 않는 방식

App Runner는 신규 고객 제공 범위 변경 때문에 새 MVP의 기본 타깃으로 삼지 않는 판단도 나왔다. 배포 과정에서 Compute, Object Storage, Database, 환경 변수 같은 개념을 Helper가 설명할 수 있다는 교육적 연결도 제안됐다.

다만 이 profile들은 당시 탐색안이지 현재 구현 확정안은 아니다. 이후 TypeScript-only 경계와 핵심 Evidence loop에 집중하면서 실제 배포 provider와 workflow 전체를 보류했다.

## 7. Knowledge Debt에서 Concept Ledger로

### Builder와 Helper의 공통 메모리

사용자가 제안한 핵심 발전은 Builder와 Helper가 같은 개념 목록을 공유하되 서로 다른 영역만 업데이트하는 구조였다.

```text
Builder ──┐
          ▼
     Concept Ledger
          ▲
Helper ───┘
```

Builder는 다음을 판단한다.

- 어떤 Concept가 등장했는가
- 왜 사용됐는가
- 어느 Task에서 중요한가

Helper는 사용자와 대화하면서 다음을 관찰한다.

- 설명을 요청했는가
- 차이를 질문했는가
- 자기 언어로 다시 설명했는가
- 적절한 결정을 했는가
- 과거 개념을 재사용했는가

### 중요한 분리

> 코드에 등장했다는 사실과 사용자가 이해했다는 사실은 다르다.

Builder가 Race Condition을 해결했다고 해서 사용자가 Race Condition을 배웠다고 기록하면 안 된다는 원칙이 확정됐다.

### 초기 상태 모델

초기 Concept Ledger는 다음 세 단계였다.

- Encountered
- Understood
- Applied

필드는 concept, level, confidence, importance, projects, evidence, last seen 등을 고려했다.

이후 후속 대화에서 더 audit 가능한 다음 상태로 바뀌었다.

- OBSERVED
- EXPLAINED
- DEMONSTRATED
- TRANSFERRED

### Knowledge Debt 재정의

Knowledge Debt를 직접 저장하지 않고 다음 차이로 계산하는 안이 제안됐다.

> 현재 프로젝트에서 필요한 이해 수준 − 확인된 사용자 이해 수준

현재 프로젝트에 필요하지 않은 CSS Grid를 모른다고 Debt가 되지 않고, Redis를 조금 알아도 동시성 판단이 필요한 프로젝트라면 Atomic Operation 관련 차이가 Debt가 되는 방식이었다.

최종적으로 Knowledge Debt라는 사용자-facing 용어는 약화됐고, Concept Ledger와 Evidence가 핵심 데이터 구조가 됐다.

## 8. Concept Normalization

Agent에게 자유롭게 Concept 이름을 만들게 두면 다음처럼 중복될 수 있다는 문제가 제기됐다.

- Database Transaction
- DB Transaction
- Transactional Operation
- Atomic DB Update

그래서 Agent가 Ledger를 직접 수정하는 대신 `Concept update proposal`을 보내고 Normalizer가 기존 Concept와 비교하는 구조가 나왔다.

Normalizer의 질문:

- 기존 Concept의 alias인가
- 정말 새로운 일반화 가능한 Concept인가
- 너무 세부적인 구현 디테일인가
- 다른 프로젝트에서 다시 판단할 가치가 있는가

syntax와 특정 함수보다 architecture, decision, transferable concept를 기록하는 원칙이 만들어졌다.

## 9. Project Discovery Engine의 구체화

초기 구조는 세 단계였다.

```text
Router
→ Candidate Generator
→ Judge / Ranker
```

입력은 Learning Goal, Personal Problem, Skill Level, Available Time, Previous Projects, Concept Ledger였다.

Router 결과는 다음 네 가지였다.

- DIRECT
- EXPAND
- DISCOVER
- UPGRADE

Generator는 사용자에게 보여줄 수보다 더 많은 후보를 내부 생성하고, Judge는 Concept Necessity, Personal Utility, Scope, Skill Fit, Previous Project Leverage, Deployability, Novelty를 평가하는 방식이었다.

후속 대화에서 다음이 바뀌었다.

- Personal Need는 선택 사항
- Available Time 입력 삭제
- 네 route 중 하나를 먼저 선택하는 hard routing 폐기
- route는 후보 생성 전략 tag로 사용
- 초기 후보는 약 10개지만 고정 주제 목록은 없음
- Personal Need가 있으면 관련 후보와 독립 후보를 대략 절반씩 혼합
- 사용자 반응으로 후보 revision을 무제한 반복
- 하나의 최종 후보를 Agent가 결정하지 않음

## 10. Discovery와 Concept Ledger의 flywheel

초기 프로젝트는 Learning Goal과 Personal Need를 중심으로 추천한다. 프로젝트가 쌓이면 다음에는 Concept Ledger와 과거 Project Episode가 후보 ranking과 Helper 설명에 들어간다.

예:

```text
Redis
- Caching: Applied
- TTL: Understood
- Pub/Sub: Encountered
- Atomic Operation: Unseen
```

이때 단순 Redis 프로젝트보다 Atomic Operation이 실제로 필요한 후보를 조금 우선할 수 있다.

그러나 후속 합의에서 중요한 제한이 추가됐다.

- Ledger는 추천을 지배하는 커리큘럼이 아님
- 사용자의 흥미와 실용성이 우선
- 비슷하게 매력적인 후보 사이에서 개인화 보조 신호로 사용

## 11. Cloud ADE에서 Kiro 중심 local architecture로

초기에는 별도 cloud ADE나 자체 개발 환경을 만드는 그림도 검토됐다. Electron, Docker/WSL sandbox, React UI, SQLite, 배포 adapter 등이 논의됐다.

이후 Kiro 자체를 host로 사용하는 편이 훨씬 현실적이라는 판단이 나왔다.

- Kiro IDE가 기존 editor, terminal, file tree, Git을 제공
- Kiro Extension 또는 panel로 UI 추가 가능성
- Local MCP와 SQLite로 중앙 상태 유지
- Builder와 Helper를 Kiro Agent로 구성

나중에는 Kiro Crew App이 새 주요 후보로 등장했고, 최종적으로 두 UI surface를 모두 시험하는 방향으로 발전했다.

### AWS 지원 불확실성 때문에 검토한 실행환경

사용자는 AWS cloud를 지원받지 못하고 Kiro 계정만 받을 수도 있다고 지적했다. 이때 별도 cloud ADE를 운영하면 다음을 팀이 직접 책임져야 한다는 문제가 드러났다.

- 사용자별 VM 또는 container
- CPU, RAM, 저장공간과 서버 비용
- Agent가 실행하는 shell의 격리
- 악성 코드와 credential 보호
- editor, terminal, Git, file tree 재구현

그래서 `Kiro itself becomes our IDE shell`이라는 원칙이 나왔다. 당시 기술안은 TypeScript extension logic, React Webview, SQLite, 로컬 project runtime의 조합이었다.

Kiro 지원 형태가 불명확해서 세 경우도 검토했다.

1. API key가 제공되면 CLI/headless 또는 ACP 사용
2. 계정만 제공되면 CLI login과 ACP 가능성 확인
3. IDE만 가능하면 project custom agent와 extension을 fallback으로 사용

또 Windows shell 차이를 줄이기 위해 코드는 로컬에 두고 실행은 Linux container 또는 WSL에서 하는 안도 제안됐다. Docker Desktop을 사전조건으로 두거나 Windows만 WSL2, macOS/Linux는 native로 가는 MVP 절충안도 있었다.

이 실행환경 제안은 이후 핵심 우선순위에서 내려갔다. 현재 합의는 Crew/Kiro가 제공하는 실행환경을 최대한 사용하고, 별도 containerized IDE나 sandbox 설치 UX를 MVP에서 만들지 않는 것이다.

### 당시 검토한 provider-independent 배포

AWS가 없을 때를 대비해 공통 `DeploymentPlan`과 provider adapter를 두고 AWS, Render, Railway 중 하나로 배포하는 구상도 있었다. Render Blueprint와 Deploy 버튼, Railway CLI 흐름이 비교됐고 당시에는 무료 데모 편의상 Render가 유력하다는 의견이 나왔다.

이것 역시 현재는 보류다. 다만 Discovery가 처음부터 `Deployability`와 목표 밖 인프라 복잡성을 평가해야 한다는 원칙은 남았다.

## 12. 대회 요구와 기술적 우월성 우려

대회 평가에서 기술적 우월성 비중이 크다는 점이 중요해졌다. 사용자는 다음 우려를 명확하게 제기했다.

> 결국 Kiro Power, Builder/Helper, 프로젝트 추천, 학습 목록, Extension, 배포를 잘 엮은 것뿐이라면 프롬프트 체인을 정교하게 만든 프로젝트로 보이지 않는가?

ChatGPT의 최종 판단은 다음이었다.

- 구조를 정교하게 설계했다는 것만으로는 기술적 우월성이 부족
- 프로젝트 추천만으로는 prompting으로 평가될 위험이 큼
- 학습 과정 추적을 noisy development activity에서 latent knowledge state를 추론하는 문제로 정의하고 실제 엔진과 평가를 만들면 기술 경쟁력이 생김

이때 핵심 R&D 흐름이 정의됐다.

```text
Concept Extraction
→ Evidence Inference
→ State Graph/Ledger
→ Experience Retrieval
→ Evaluation
```

Builder와 Helper는 이 엔진을 보여주는 UX이고, 기술적 중심은 Personal Developer Model이라는 방향이었다.

## 13. Personal Developer Engine과 MCP Core

기술적 차별화를 위해 다음 컴포넌트가 정리됐다.

- Concept Ledger
- Evidence Store
- Project History
- Episode Retrieval
- State Transition
- Normalization / Validation
- Project Discovery

Agent가 직접 DB를 수정하지 않고 MCP 도구로 proposal을 보내고 Core가 검증하는 구조가 선택됐다.

MCP는 Domain Core가 아니라 protocol adapter로 두고, TypeScript Core와 SQLite를 중앙에 두는 방향이 형성됐다.

### Kiro 제출물과 장기적인 host portability

사용자는 대회에는 Kiro용으로 제출하더라도 실제로는 Claude Code나 Codex에도 붙여 사용하고 싶다고 했다. 이 요구 때문에 Kiro Power나 Extension을 제품 본체로 두지 않고 다음 구조를 택했다.

```text
Kiro / Claude Code / Codex
→ host별 Prompt·Skill·얇은 Adapter
→ 공통 MCP contract
→ TypeScript Personal Developer Core
→ SQLite
```

핵심 가치와 데이터는 host가 바뀌어도 남아야 한다. Kiro는 첫 번째이자 대회용 host이고, Claude Code와 Codex adapter는 장기 방향이다.

후속 공식 문서 검토로 portability의 경계도 더 정확해졌다.

- Kiro와 Codex는 Agent Skills와 MCP를 지원하므로 이 두 component는 재사용 여지가 큼
- Claude도 MCP를 사용할 수 있으므로 같은 Core와 MCP server를 연결할 수 있음
- 그러나 Kiro Power나 UI package 전체가 모든 host에서 그대로 동작한다고 가정하지 않음
- host별 instruction, permission, packaging, UI adapter는 별도로 필요할 수 있음

즉 `한 번 만든 Kiro Power를 그대로 이식`하는 것이 아니라 `공통 Core와 MCP contract를 재사용`하는 것이 portability의 기준이다.

### Prompt·Host LLM·MCP·Core의 역할 분리

사용자는 MCP가 DB structure만 제공하고 추론 방향은 Skill이 제어하는지 물었다. 답은 다음처럼 구체화됐다.

- `Prompt/Skill`: 무엇을 관찰하고 어떻게 행동·판단할지 정하는 정책
- `Host LLM`: 비정형 대화와 코드 맥락에서 semantic proposal 생성
- `MCP`: 상태 조회, 구조화된 proposal 제출, 검색과 검증을 노출하는 tool contract
- `TypeScript Core`: 입력 검증, normalization, Evidence acceptance, deterministic state transition, persistence

MCP는 단순 DB schema도, 제품의 Domain Core 자체도 아니다. Agent가 DB를 직접 만지지 않게 하는 protocol adapter다. 반대로 모든 추론을 MCP 내부의 거대한 prompt로 숨기지도 않는다.

초기에는 host LLM이 의미 판단을 많이 수행하고 Core가 검증한다. 평가 결과가 필요성을 보여주면 나중에 특정 inference를 provider 내부로 옮길 수 있도록 경계를 남긴다는 안도 나왔다.

## 14. 초기 대화가 남긴 핵심 결과

### 당시 팀 역할 분담과 회의 제안

초기 저장 대화 마지막에 팀은 잠정적으로 다음처럼 역할을 나눴다.

- FE: Kiro Extension 동작 조사, Helper panel/Webview 표시 가능성 확인
- BE: MCP 구조, Concept/Evidence/Project 모델과 tool contract 초안

당시 답변은 48시간짜리 기술 spike 뒤 8월 22일 저녁에 다시 만나 다음을 결정하자고 제안했다.

- Kiro UI와 Agent interaction 제어 가능 범위
- MCP tool과 내부 Domain 경계
- `Helper → MCP → Helper` 한 사이클의 I/O
- 첫 end-to-end vertical slice 일정

그러나 실제 회의는 아직 열리지 않았고, 후속 검증에서 Crew App이 주요 surface로 새로 등장했다. 따라서 이 역할 분담과 8월 22일 일정은 역사적 기록일 뿐 현재 실행 계획이 아니다. 현재 사용자는 개발 전에 문서 합의를 먼저 끝내기로 했다.

초기 저장 대화가 끝날 때 제품은 다음으로 진화해 있었다.

```text
프로젝트 추천 AI
→ Build-first 실전 개발 학습 시스템
→ Builder/Helper 분리
→ Knowledge Debt
→ Concept Ledger
→ Personal Developer Model
→ Kiro event와 MCP를 사용하는 Evidence Engine
```

다만 다음은 아직 검증되지 않았거나 과도했다.

- Kiro의 최신 Crew 기능과 중복
- Kiro API와 UI surface의 실제 가능 범위
- Bedrock 필요 여부
- Activity를 어떻게 정확히 수집할지
- Evidence를 어느 행동에서 인정할지
- Project Discovery의 first-use UX
- 두 UI 방식
- 실제 대회 live demo와 평가 설계

---

# Part II. 후속 검증 및 현재 합의 대화

## 15. 원본 대화 전체 흐름 요약 요청

사용자는 저장된 ChatGPT 대화 전체 흐름, 구현 방향 변화, 구체화 정도, 흐름이 꺾인 지점을 요약해달라고 요청했다.

검토 결과 다음 변화가 특히 강조됐다.

1. 프로젝트 추천에서 Build-first full package로 확대
2. 교육적 자동 개입에서 사용자 호출형 Helper로 변경
3. Knowledge Debt 목록에서 Evidence 기반 Concept Ledger로 발전
4. cloud ADE에서 local Kiro host로 변경
5. 프롬프트 chain에서 Personal Developer Model을 기술 core로 재정의
6. Kiro-specific wrapper에서 TypeScript Core + SQLite + adapter 구조로 이동

## 16. 대회와 Kiro 공식 정보 검증

사용자는 대회 지원을 앞두고 실제 검증이 필요한 ChatGPT 주장과 더 나은 제안을 요청했다.

### 대회 공식 페이지에서 확인한 내용

후속 대화 당시와 2026-08-24 재확인 기준으로 정적 페이지에서 확인한 내용은 다음과 같다. 다만 페이지 일정에는 연도가 직접 표기되지 않아, 대화 맥락상 2026년 일정으로 이해한 것이다.

- 공식 노출명은 AI Innovators Challenge
- AWS가 지원하는 LLM API를 활용한 AI 서비스 개발
- 고려대학교 학부·대학원생 대상
- 개인 또는 1~5인 팀, 팀장은 재학생
- 예선에서 탈락 팀이 있음
- 결선은 live demo이며 새로운 입력도 확인
- 다른 대회 제출작이 아닌 신규 제품이어야 함
- Kiro token 약 2개월 제공
- 기술적 우월성 30점
- 서비스 활용성·완성도 30점
- 데이터 활용성 10점
- 목적 적합성 10점
- 코드·Markdown 10점
- 발표 5점
- 공개 투표 5점

페이지에 표시된 일정과 시상은 다음과 같다.

- 참가 등록: 8월 10일까지
- 킥오프: 8월 12일
- 예선: 8월 18일~9월 29일
- 예선 심사: 9월 30일~10월 2일
- 본선: 10월 3일~10월 18일
- 최종 발표 및 심사: 10월 19일
- 데모 및 시상: 10월 20일
- 총상금: 2천만 원

FAQ accordion은 당시 외부 수집 결과에 답변 본문이 노출되지 않았다. 사용자가 직접 페이지를 확인한 뒤 다음처럼 정리했다.

1. 별도 전용 API를 제공하는 형태는 아닌 것으로 보임
2. 자체 AWS/Bedrock 사용은 가능한 것으로 보임
3. live demo에 별도 제한은 두드러지지 않음

이 세 항목은 사용자가 확인한 FAQ 해석으로 기록하며, 정적 페이지에서 독립적으로 재현한 답변은 아니다.

대화 시점에는 등록 마감 표기가 이미 지난 상태였지만 참가 등록 링크는 남아 있었다. 페이지에 연도가 없고 현재 접수 가능 여부가 명확하지 않으므로 실제 지원 가능 여부는 주최 측에 재확인해야 한다. 페이지에 표시된 문의처는 `02-3290-4504`, 문의 이메일 입력 예시는 `ask@korea.ac.kr`였다.

### Kiro 공식 기능 검증

- Kiro는 Custom Agents, tools, permissions, resources, MCP를 지원
- Hooks는 file/tool/prompt/session/task 경계를 지원
- Kiro CLI는 ACP와 JSON-RPC session/tool event를 지원
- Crew App SDK는 React dashboard, chat slot, tool event, background agent dispatch, MCP 등록, memory search 등을 지원
- Kiro Crew 자체가 cross-session memory, lesson, project/history, knowledge graph, App UI를 제공
- Kiro Crew의 사용자-trigger Agent와 background Agent 모두 같은 Kiro plan usage를 사용하므로 실행 시점 구분만으로 Bedrock 같은 별도 provider가 필요하지 않음

### 중요한 경쟁 중복 발견

단순 `personal developer memory`는 Kiro Crew와 겹치므로 새롭지 않다는 결론이 나왔다.

차별화는 다음으로 옮겨갔다.

> Kiro가 무엇을 기억하는가가 아니라, 사용자가 무엇을 설명·판단·재사용했다는 근거를 audit 가능하게 추적하고 false mastery를 줄이는가.

Programming Knowledge Tracing도 기존 연구 영역임을 확인했다. 따라서 연구 이름을 차용하는 데 그치지 않고 개발 Activity와 실제 제품 판단에 맞는 Evidence system을 만들어야 했다.

### GO / NO-GO 판단

- `Project Generator + Helper + Checklist + Extension`이면 NO-GO에 가까움
- `Evidence-Calibrated Developer Mastery/Personal Developer Engine`과 실제 평가가 있으면 GO

## 17. Crew App 우선 방향과 Activity 경로

사용자는 회의 전 혼자 개발해볼 경우 Crew App 방향을 먼저 고려했다.

Activity 수집 후보를 다음처럼 정리했다.

- Kiro Hooks: prompt, tool, file, task, session 경계
- Crew WebSocket Events: chat message, response complete, tool call, task 상태
- MCP: Builder Report, Decision, Evidence처럼 의미가 명확한 구조화 사건
- Git/diff/test: 실제 구현 결과
- ACP: 정밀하지만 우리 앱이 client 역할을 해야 하므로 MVP 보류
- IDE Extension API: Code Mode 후보지만 초기 필수는 아님

최종 수집 원칙은 하나의 source에 의존하지 않는 것이었다.

```text
MCP 구조화 Event
+ Crew 대화 Event
+ Kiro Task/Session Hook
+ Task 종료 diff
```

## 18. Bedrock 분리 제안과 철회

초기 후속 답변에서는 Kiro를 interactive Builder로, Bedrock을 concept/evidence classifier로 두는 방안이 제안됐다.

이유는 다음과 같았다.

- semantic 판단과 deterministic state를 분리
- Kiro가 만든 코드를 Kiro가 자기 인증하는 문제 완화
- Bedrock Structured Output 활용
- AWS 기술 사용을 명확히 보여줌

사용자는 Kiro API와 token을 제공받는데 굳이 별도 비용을 내며 Bedrock을 써야 하는지 질문했다.

재검토 결과 Bedrock은 필수 근거가 없다는 결론이 났다.

- Crew API의 sync/async Agent dispatch로 사용자-trigger/background 처리를 모두 할 수 있음
- Kiro Custom Agent와 MCP tool schema로 구조화된 결과를 받을 수 있음
- 제공 token을 우선 사용하는 것이 solo 개발 복잡성과 비용 면에서 유리
- AnalyzerProvider interface만 남기고 초기에는 Kiro provider만 구현

이것은 중요한 방향 전환이었다.

> Background와 사용자-trigger를 구분하기 위해 provider를 분리할 필요는 없고, Kiro 안에서 실행 시점을 나누면 된다.

Bedrock은 Kiro 정확도가 부족하거나 독립 evaluator가 필요할 때만 재검토하기로 했다.

Kiro background Agent도 사용량을 소비하므로 `비용이 전혀 없다`는 뜻은 아니다. 결론은 별도 Bedrock 비용과 통합 복잡성을 먼저 추가하지 말고, 대회에서 제공되는 Kiro 사용량을 우선 활용한 뒤 측정 결과로 provider 추가 여부를 판단하자는 것이었다.

## 19. 제품 목적의 재정의

후속 대화 중 Assistant가 제품을 `프로젝트 추천 도구인가, 학습 검증 도구인가`라는 이분법으로 정리했다. 사용자는 둘 다 아니라고 바로잡았다.

사용자가 직접 제시한 제품 목적은 다음이었다.

- 코딩 초보가 바이브코딩을 도구로 사용
- 자신에게 실용적인 것을 만들어 개발 원동력을 얻음
- Builder가 개발을 주도
- 사용자는 자연스럽게 Helper에게 Builder가 무엇을 하는지 질문
- 교육에 매몰되지 않음
- 개발 중 자연스러운 상호작용에서 학습 성과 추적
- 궁극적으로 자신에게 필요한 서비스를 자기 손으로 완성

이 설명이 현재 최종 제품 정의의 기준이 됐다.

## 20. MISCONCEPTION 논의

초기 상태안에 `MISCONCEPTION`을 단계처럼 두는 제안이 있었다. 사용자는 Agent가 현장에서 바로 정정할 텐데 굳이 별도 상태가 필요한지 물었다.

정리된 결론:

- MISCONCEPTION은 level이 아님
- negative Evidence 또는 `possible_misconception` open issue
- 정정받았다는 사실은 이해했다는 증거가 아님
- 한 번 틀렸다고 기존 수준을 즉시 초기화하지 않음
- 다음 관련 판단에서 자연스럽게 다시 확인
- 해결되면 open issue를 닫되 이력은 보존
- 반복된 강한 contradiction은 confidence 또는 state 재계산 근거
- 사용자에게 낙인처럼 표시하지 않음

Transaction을 모든 요청을 순서대로 실행하는 장치로 오해한 예가 사용됐다. Helper는 현재 코드의 실제 차이를 짧게 바로잡고, 재고 확인과 차감 범위를 판단하는 실제 Decision으로 연결하는 흐름이 제안됐다.

## 21. 신규 프로젝트형과 Discovery MVP의 중요성

사용자는 기존 프로젝트 분석형을 제외하고 신규 프로젝트형만 먼저 생각하기로 했다. 동시에 MVP라고 해서 프로젝트 추천을 단순하게 만들면 첫 핵심 가설을 검증할 수 없다고 지적했다.

Discovery는 다음을 실제로 포함해야 한다고 합의했다.

- 학습 기술 분석
- 다양한 제품 Concept 생성
- 필요가 있으면 일부 반영
- 기술 필연성 검증
- 현재 수준에 맞지 않는 보조 기술 분리
- 후보에 대한 반응 수집
- 만족할 때까지 반복 refinement
- 최종 Learning Spec

Project Discovery는 기술적 우월성의 유일한 핵심은 아니지만 제품 UX의 핵심 P0다.

## 22. 코드 전체 분석 여부

사용자는 저장하려는 것이 코드가 아니라 Agent가 사용한 Concept인데 전체 코드를 분석하면 token 사용량이 크지 않겠느냐고 질문했다.

결론:

- Builder가 같은 작업 안에서 구조화된 Concept Report를 제출
- Learning Spec의 예상 Concept와 비교
- code reference가 실제 존재하는지 확인
- Task 종료 diff와 관련 code snippet만 선택적으로 확인
- 전체 repository 분석은 누락 검증이나 모호한 경우에만

`snippet`은 전체 파일이 아니라 판단에 필요한 짧은 코드 조각을 뜻한다고 설명했다.

중요한 분리:

- 코드와 Builder Activity는 Concept 사용 여부 근거
- 사용자 질문, 설명, Decision은 사용자 이해 근거

평가 실험은 기능 개발 뒤 실제 초보자를 대상으로 하기로 했다. 다만 나중에 증언만 수집하고 정량 근거가 없는 상태가 되지 않도록 Event, Episode, baseline 비교에 필요한 log schema는 구현 전에 설계해야 한다는 결론도 함께 남았다. 최종 검증의 핵심은 초보 사용자가 실제로 Helper를 자발적으로 사용하고, 판단을 이해하며, 자기에게 필요한 결과물을 완성했다고 말할 수 있는지다.

## 23. 사용자 개인 경험과 Golden Path

사용자는 고등학교 시절 세 프로젝트 경험을 공유했다.

### 행사 신청 사이트

- Django를 배우기 위해 학교 행사 신청 사이트 제작
- 기술적으로 만들었지만 선생님 설득에 실패
- 실제 사용하지 못한 아쉬움

여기서 `Adoption Feasibility`가 추천 평가에 추가됐다. 실용적으로 보이는 프로젝트라도 실제 운영자 승인과 도입 경로가 없으면 사용 가능성이 낮다.

### 파일 공유 시스템

- 학교 PC에서 USB 없이 파일을 옮기는 실제 문제 해결
- 반 친구들도 많이 사용
- 실용성은 매우 높았음
- Django 외에 파일 저장, 파일시스템, 배포를 고려해야 해서 진입장벽 발생

여기서 `Adjacent Complexity`, Agent Support, Excluded Scope가 구체화됐다.

### Popcat와 WebSocket

- 실시간 통신을 만들고 싶어 Popcat 형태 제작
- UI click count를 즉시 올림
- 클릭을 일정 주기로 모아 서버에 전송
- 서버 부하 감소, batching, optimistic update 개념 경험

이 사례는 개인 효용이 낮아도 재미와 기술적 호기심이 강한 동기가 될 수 있고, 목표 기술 주변에서 새로운 일반화 가능한 Concept가 등장한다는 근거가 됐다.

### Campus Drop Golden Path

파일 공유 경험을 TypeScript로 옮긴 Campus Drop이 첫 end-to-end 검증 시나리오로 제안됐다. 다만 이후 사용자는 Campus Drop과 함께 추천된 후보들이 너무 비슷하고 매력이 부족하다고 지적했다.

따라서 Campus Drop은 고정 추천 template가 아니라 integration test scenario로만 남고, Discovery는 항상 자유롭고 다채로운 후보를 생성해야 한다는 제한이 생겼다.

## 24. 고정 10개 주제 제안과 폐기

DB를 배우는 사용자에게 다음과 같은 다양한 10개 예시가 제안됐다.

- 행사 신청
- 결제 없는 쇼핑몰
- 파일 공유
- 동호회 커뮤니티
- 개인 블로그
- Instagram 핵심 clone
- 콘텐츠 기록장
- 물품 대여
- 여행 계획
- 개인 지원 관리 CRM

사용자는 이 10개를 고정 구조로 만들면 다시 같은 흐름이 반복된다고 지적했다.

최종 결정:

- 위 목록은 Agent diversity를 평가하는 참고 예시일 뿐
- 제품에 고정 topic taxonomy로 넣지 않음
- 고정할 것은 주제가 아니라 다양성을 관찰하는 차원
- Agent가 새로운 영역과 제품 Concept를 자유롭게 생성

## 25. Discovery input과 50/50 mix

사용자는 Learning Technology만 필수로 하고 최근 필요성이나 개인적 불편은 선택으로 두는 안을 확정했다.

Personal Need가 있으면:

- 필요를 자연스럽게 반영한 후보 일부
- 필요와 독립된 탐색 후보 일부

를 대략 절반씩 보여준다.

하지만 자연스러운 관련 후보가 부족하면 억지로 절반을 채우지 않는다. 첫 추천은 완성된 개인화 결과가 아니라 사용자의 취향을 발견하는 넓은 진열대다. 이후 사용자가 후보를 고르고 자연어로 수정하는 행동이 개인화 signal이 된다.

## 26. Discovery 반복 loop와 데이터 계약

처음에는 복잡한 TypeScript interface가 제안됐으나 사용자가 쉽게 요약해달라고 요청했다. 최종적으로 핵심 데이터 다섯 개로 정리했다.

1. `DiscoveryInput`
2. `ProjectCandidate`
3. `CandidateRound`
4. `DiscoveryFeedback`
5. `LearningSpec`

중요한 결정:

- Available Time 제거
- Candidate count는 configurable
- ProjectCandidate 하나의 revision으로 계속 변형
- pinned, rejected, merged, reduced history 유지
- 사용자가 만족할 때까지 반복
- Candidate 선택 후 Learning Spec도 수정 가능
- 사용자가 명시적으로 확정해야 Builder 시작

## 27. Learning / Agent Support / Excluded

사용자는 현재 단계에 적합하지 않은 기술을 MVP에서 제외하거나 Agent가 구현만 하고 학습 범위에는 넣지 않는 구조를 제안했다.

이것이 다음 세 범위로 정리됐다.

- `LEARNER_FOCUS`: Evidence 추적 대상
- `AGENT_SUPPORT`: Builder가 구현, 학습 강요 없음
- `EXCLUDED`: 구현하지 않음

Agent Support 기능은 제품 동작에 꼭 필요한 경우에만 둔다. nice-to-have advanced 기능은 제외가 우선이다. 안전과 운영상 최소 이해가 필요한 경우 operational awareness는 제공할 수 있다.

## 28. Evidence State와 상태 전이

후속 합의에서 상태는 다음으로 확정됐다.

```text
OBSERVED
→ EXPLAINED
→ DEMONSTRATED
→ TRANSFERRED
```

Evidence 신호:

- 질문
- 자기식 설명과 비유
- 예측
- 이유 있는 Decision
- 현재 프로젝트 적용
- 새로운 맥락 Transfer
- Contradiction

Evidence 강도:

- NONE
- WEAK
- MEDIUM
- STRONG

Agent 의존성:

- INDEPENDENT
- LIGHT_HINT
- DIRECTLY_LED

규칙:

- `ㅇㅋ`와 카드 클릭은 Evidence가 아님
- Agent가 구현한 코드는 Evidence가 아님
- 강한 자기식 설명은 EXPLAINED 후보
- 강한 Decision/Application은 DEMONSTRATED 후보
- 새로운 맥락에서 독립 적용은 TRANSFERRED 후보
- Analyst가 제안하고 Core가 deterministic rule로 적용

## 29. 비유를 질문형으로 말한 경우

사용자는 다음 예를 물었다.

> DB 모델 추가가 엑셀에서 열 추가, 실제 데이터가 들어가는 것이 행 추가인 거네?

결론:

- 질문형이라는 이유만으로 WEAK 처리하지 않음
- 대응 관계를 주장별로 평가
- record와 행의 대응은 맞음
- model과 열의 대응은 보통 불완전함
- model은 table/sheet, field가 column에 더 가까움
- 맞는 부분은 Evidence, 틀린 부분은 open issue 후보
- 이후 사용자가 정확히 다시 표현하면 strong rephrase 가능

이 논의로 Evidence Analyst prompt에 claim-level analogy 분석이 포함됐다.

## 30. Helper 첫 사용 습관 형성

사용자는 Helper를 한 번 사용하기 시작하면 계속 질문할 가능성이 있지만 첫 사용을 어떻게 자연스럽게 만들지 고민했다. 강제 tutorial은 너무 노골적이고, Builder가 교육을 위해 일부러 질문을 만들면 Build-first와 충돌했다.

제안된 해법은 실제 `Decision Boundary`였다.

- Builder가 실제 제품·기술 판단이 필요한 순간 사용자에게 선택을 넘김
- 모든 Decision Card에 Helper 버튼
- 첫 Decision에서만 짧은 microcopy로 Helper를 안내
- Helper에는 Decision 맥락이 자동 전달
- 설명 뒤 선택을 Builder에게 전달
- 첫 실제 성공 경험이 Helper 습관을 만듦

보조 affordance:

- Task 완료 후 주요 Decision 옆에 `왜 이렇게 했는지 Helper에게 물어보기`
- 사용자가 `모르겠어`, `차이가 뭐야`, `알아서 해줘`라고 말하면 Helper 연결 제안

가짜 교육 질문은 금지됐다.

## 31. Helper 빠른 카드와 자유 입력

사용자는 `더 쉽게`, `더 자세히`를 카드로 제공하면 접근성이 좋아지지만 자유 입력이 줄어 Evidence가 적어질 수 있는지 질문했다.

결론은 hybrid UI였다.

- 자유 입력창은 항상 중심
- 빠른 카드는 접근 도구
- 카드 클릭 자체는 Evidence 아님
- `내 이해가 맞는지 확인` 카드는 사용자가 자기 설명을 적도록 입력창을 전환
- Evidence를 얻기 위해 사용자에게 서술을 강요하지 않음

모든 입력창에는 현재 상황에 맞는 구체적인 placeholder 예시를 둔다.

## 32. Concept State의 실제 활용

### Builder

- 전체 Ledger를 거의 읽지 않음
- State에 따라 코드 품질을 바꾸지 않음
- Learning Spec과 Task를 따르고 Concept를 보고

### Helper

- 관련 State와 과거 Episode만 조회
- State에 따라 설명 출발점과 과거 연결을 조절
- 높은 State에서도 Helper를 항상 표시

### Discovery

- 흥미와 실용성 다음의 보조 ranking signal

### Final Upgrade

- 실제 가치가 있으면서 아직 적용 Evidence가 부족한 핵심 Concept를 자연스럽게 사용할 수 있는 기능
- 사용자는 건너뛸 수 있음

### UI

- 퍼센트나 점수보다 실제 Evidence와 `접함/설명함/결정에 사용함/다른 곳에서 사용함`을 보여줌

## 33. Builder Task, Decision, Completion Report

Learning Spec 이후 필요한 핵심 데이터는 세 개로 정리됐다.

- `BuilderTask`
- `DecisionRequest`
- `TaskCompletionReport`

BuilderTask는 제품 기능, 요구사항, acceptance criteria, 예상 Concept, 제외 작업, 예상 Decision 영역을 가진다.

DecisionRequest는 category, 질문, 선택지, 결과, Builder 추천, 관련 Concept를 가진다.

Task Completion Report는 실제 구현, 테스트, Concept, Decision 적용, 제한사항을 기록한다.

## 34. Activity Event와 Episode

처음에는 모든 Hook과 파일 이벤트를 수집하는 그림이 있었지만 noise와 token 비용 때문에 최소화됐다.

핵심 Event:

- Task 시작/완료
- 사용자 메시지
- Helper 응답
- Decision 요청/해결
- Concept Report
- 검증 결과

Episode:

- BUILD_TASK
- DECISION
- HELPER_CONVERSATION
- FINAL_UPGRADE

메시지마다 분석하지 않고 Episode가 끝날 때 Kiro Analyst를 한 번 호출한다.

## 35. Builder 중간 status와 Helper Context

사용자는 Task 완료 전 Helper를 열었을 때 Helper가 Builder 상태를 모르는 문제를 지적했다.

그래서 Builder가 다음 checkpoint에서 Live Project Context를 갱신하기로 했다.

- Task 시작
- 중요한 방향 결정
- Concept 도입
- 사용자 판단 필요
- 오류로 계획 변경
- 테스트 단계
- Task 완료

Helper는 Builder 대화 전체를 항상 읽는 대신 다음 순서로 context를 얻는다.

1. Live Project Context
2. Task와 Learning Spec
3. Decision
4. 관련 Concept State
5. 관련 코드/diff
6. 필요한 대화 일부

맥락이 부족하면 Builder에게 refresh를 요청하고 추측하지 않는다.

## 36. 세 종류의 메모리

정보를 한곳에 섞지 않기 위해 다음을 분리했다.

### Live Project Context

- 현재 작업 snapshot
- 최신 값으로 갱신
- Helper가 먼저 읽음
- Evidence 아님

### Project History

- 완료 Task
- Decision
- Helper Conversation
- Builder Report
- Test와 Episode

### Concept Ledger

- Canonical Concept
- Evidence
- State
- open issue
- Project 연결

## 37. Agent 도구와 권한

네 Agent와 TypeScript Core의 역할이 확정됐다.

### Discovery

- Discovery context 조회
- Candidate Round 제출
- Learning Spec 초안 제출
- 코드와 shell 없음

### Builder

- read/write/shell
- start task
- update live context
- request decision
- read decision result
- complete task
- Concept State 수정 금지

### Helper

- read-only
- helper context 조회
- Builder context refresh 요청
- code write/shell/Decision 확정 금지

### Analyst

- Episode 조회
- Evidence Proposal 제출
- 사용자 직접 대화와 상태 변경 금지

### Core

- validation
- normalization
- reducer
- SQLite
- context packaging

Agent끼리 자유롭게 chatter하지 않고 MCP contract로 구조화된 정보를 주고받는 원칙이 선택됐다.

## 38. 두 UI Mode

사용자는 두 UI를 모두 만들고 테스트해야 한다고 제안했다.

### Code 중심

- Kiro 코드 editor가 중심
- 오른쪽 side에 Builder
- Helper는 tab 또는 별도 panel
- 코드와 Agent를 함께 보고 싶은 사용자 취향

### Agent 중심

- 원래 사용자가 구상한 ADE 형태
- 왼쪽 Builder, 오른쪽 Helper
- 둘을 동시에 보며 자유롭게 왕복
- 코드는 필요할 때 확인

초기 Assistant는 초보자가 Agent Mode를 쓰고 성장하면 Code Mode로 이동할 수 있다는 가설을 제시했다. 사용자는 이를 수정했다.

> 진정한 바이브코더일수록 IDE보다 ADE를 선호할 수도 있으며, 두 UI는 숙련 단계가 아니라 개인 취향이다.

최종적으로 두 Mode에 초보/고급 label을 붙이지 않고 동일한 기능과 상태를 공유하기로 했다.

## 39. Builder stream을 숨길 것인가

Assistant는 처음에 Agent Mode에서 Task와 Progress를 요약하고 verbose ToolCall을 접는 UI를 제안했다. 사용자는 Builder가 실제로 작업하는 과정을 눈으로 따라가는 것이 바이브코딩의 핵심 경험이라고 지적했다.

수정된 결론:

- 실제 Builder session을 그대로 중심에 둠
- 메시지, ToolCall, 명령, 파일 변경, 테스트, 오류와 수정이 보임
- Task Progress는 실제 stream을 대체하지 않는 sticky summary
- 긴 로그는 사용자가 접을 수 있지만 의도적으로 숨기지 않음
- Helper는 일반 chat UI를 유지
- 우리의 기능은 Kiro Agent 작동 방식 위에 Context, Decision, Helper, Concept 기능을 얹는 형태

## 40. Spec 부담과 Builder 판단에 대한 오해 수정

Assistant는 사용자 부담을 줄인다는 말을 Builder Decision까지 단순 확인으로 축소해 해석했다. 사용자는 이를 즉시 바로잡았다.

사용자의 의도:

- Builder 진입 전 Spec 선택에서 부담을 만들지 말 것
- Builder가 시작된 뒤 실제 바이브코딩에서 필요한 판단은 사용자에게 물을 것
- Builder는 계속 추천을 제공
- `그대로 해줘` 버튼도 유지
- 가장 교육적으로 바람직한 경로는 사용자가 Helper에게 차이를 물어보고 판단하는 것
- 판단을 위해 공부하는 경험 자체가 제품의 교육적 가치
- 단, 억지 Decision은 금지

최종 분리:

```text
Spec 단계
→ 권장안 + 이대로 시작
→ 낮은 진입장벽

Builder 단계
→ 실제 제품·기술 Decision
→ 추천 + Helper + 직접 선택
→ 사용자 판단 경험
```

이 수정은 최종 Builder prompt와 프로젝트 합의본에 반영됐다.

## 41. Agent Prompt 확정과 파일화

Discovery, Builder, Helper, Evidence Analyst의 행동 원칙이 정리됐다.

특히 중요하게 들어간 내용:

- Discovery: 고정 카테고리 금지, optional need, 반복 refinement
- Builder: build-first, 실제 stream, authentic decision, status update, 이해 판정 금지
- Helper: read-only, current context, always available, no forced quiz, analogy correction
- Analyst: user-authored Evidence만, claim-level, prompt dependence, conservative proposal

사용자는 prompt 내용이 중요하므로 별도 파일로 남길 것을 요청했다. 현재 다음에 저장돼 있다.

- [Discovery](docs/agent-prompts/discovery.md)
- [Builder](docs/agent-prompts/builder.md)
- [Helper](docs/agent-prompts/helper.md)
- [Evidence Analyst](docs/agent-prompts/evidence-analyst.md)

## 42. 현재 문서화 전환

사용자는 아직 개발하지 말고 먼저 다음을 만들라고 요청했다.

1. 지금까지 합의한 프로젝트 최종 기준 문서
2. 모든 대화 흐름, 세부 Spec, 중요한 방향 전환을 담은 기록 문서
3. Agent prompt 별도 보존

이 문서와 [PROJECT_SPEC.md](PROJECT_SPEC.md), 네 Prompt 파일이 그 요청의 결과다. 애플리케이션 코드와 dependency 설치는 아직 시작하지 않았다.

---

# Part III. 중요한 방향 전환 요약

## 43. 전환 1: 프로젝트 추천 AI → 전체 개발 경험

초기:

```text
기술 입력 → 프로젝트 추천
```

현재:

```text
발견 → 선택 → 개발 → Helper → Decision → Evidence → 완성 → 개인화
```

이유: 프로젝트 제목만 추천하는 AI는 쉽게 복제되고, 사용자가 실제 개발 동력을 얻고 결과물을 완성한다는 목표를 충족하지 못함.

## 44. 전환 2: 교육 자동 개입 → Build-first Helper

초기:

- Concept가 등장할 때마다 교육
- Knowledge Debt 경고

현재:

- Builder가 계속 개발
- 사용자가 필요한 순간 Helper 호출
- 실제 Decision이 자연스러운 학습 계기
- 강제 퀴즈 없음

이유: 교육이 목적을 삼키면 사용자는 서비스를 만드는 동력을 잃음.

## 45. 전환 3: Knowledge Debt checklist → Evidence Ledger

초기:

- 배웠음/안 배웠음 목록

현재:

- immutable Evidence
- OBSERVED / EXPLAINED / DEMONSTRATED / TRANSFERRED
- open misconception issue
- deterministic reducer

이유: Agent가 코드를 작성했다는 사실과 사용자 이해를 구분하고 false mastery를 줄이기 위해서.

## 46. 전환 4: Cloud ADE → Kiro/Crew local surfaces

초기:

- 자체 IDE와 sandbox까지 고려

현재:

- Crew App Agent Mode
- Kiro native editor Code Mode
- 공통 TypeScript Core, MCP, SQLite

이유: 기존 editor, terminal, Agent runtime을 재구현하지 않고 제품 핵심에 집중하기 위해서.

## 47. 전환 5: Kiro wrapper → Personal Developer Engine

초기:

- Power와 Agent prompt를 잘 조합

현재:

- Event → Episode → Concept → Evidence → State → Retrieval → Evaluation
- Kiro는 첫 host이며 공통 TypeScript Core와 MCP contract가 본체
- Claude Code와 Codex는 장기적으로 host별 adapter를 통해 연결

이유: 기술적 우월성을 prompt 구조가 아니라 실제 비정형 추론과 평가로 증명해야 하기 때문.

## 48. 전환 6: Personal Memory → Evidence-calibrated differentiation

초기:

- Kiro가 사용자를 장기 기억

현재:

- Kiro Crew memory와 차별화
- 무엇을 기억하는지가 아니라 무엇을 이해했다는 근거가 있는지 추적

이유: Kiro Crew가 이미 project/history/lesson/memory 기능을 제공.

## 49. 전환 7: Bedrock 분리 → Kiro-only MVP

초기 후속안:

- Kiro interactive
- Bedrock background classifier

현재:

- Kiro sync/async agent 모두 활용
- Kiro AnalyzerProvider만 구현
- Bedrock은 평가 결과가 필요성을 증명할 때만

이유: 제공 token, 구현 복잡성, 비용, 동일 provider에서 실행 시점 분리 가능.

## 50. 전환 8: Hard Router → Dynamic Mix와 반복 loop

초기:

- DIRECT/EXPAND/DISCOVER/UPGRADE 중 하나 선택

현재:

- 여러 전략에서 후보 생성
- Personal Need가 있으면 관련/독립 후보 혼합
- 고정 topic 없음
- 사용자 만족까지 Candidate revision 반복

이유: 한 route가 좋은 후보를 너무 일찍 버리고, 고정된 추천 흐름을 만들 수 있음.

## 51. 전환 9: 한 UI → 두 취향 Mode

초기:

- ADE 또는 Extension 중 하나 선택

현재:

- Agent 중심과 Code 중심 모두 prototype/test
- 동일 Core와 session 공유
- 숙련도 단계가 아닌 개인 취향

이유: 사용자가 통제감을 얻는 방식이 다르고, 숙련된 바이브코더도 ADE를 선호할 수 있음.

## 52. 전환 10: Progress 요약 UI → 실제 Builder stream 위에 기능 추가

초기 후속안:

- Task 상태와 요약 위주

현재:

- 실제 Kiro Builder session과 ToolCall을 계속 보여줌
- Progress는 보조 snapshot

이유: Agent의 작업 과정을 보는 경험 자체가 바이브코딩 학습과 재미의 일부.

## 53. 전환 11: 사용자 부담 축소의 범위 명확화

오해된 안:

- Builder Decision도 대부분 단순 승인으로 축소

현재:

- Spec 단계만 낮은 진입장벽
- Builder 단계는 authentic decision을 사용자에게 전달
- 추천대로 진행과 Helper 학습 경로를 함께 유지

이유: 판단하기 위해 공부하고 자기 서비스의 방향을 결정하는 경험이 이 제품의 핵심 교육 가치.

---

# Part IV. 현재 결정 상태

## 54. 확정된 사항

- Build-first full package
- 신규 프로젝트형 MVP
- Learning Technology 필수, Personal Need 선택
- Available Time 입력 없음
- 고정 주제 taxonomy 없음
- 초기 약 10개 후보와 반복 refinement
- Learning/Agent Support/Excluded 범위
- Spec은 쉽게 확정
- Builder는 authentic decision 요청
- Helper는 항상 접근 가능하고 read-only
- 실제 Builder stream 표시
- Agent 중심과 Code 중심 두 UI
- UI는 숙련 단계가 아닌 취향
- TypeScript actual implementation
- Local SQLite와 secret redaction
- Kiro-only Analyzer MVP
- Builder intermediate Live Context
- Activity를 Episode로 묶어 분석
- selective code/diff analysis
- Evidence-based Concept State
- MISCONCEPTION은 open issue
- deterministic TypeScript reducer
- Agent별 MCP와 최소 권한
- 실제 초보자 테스트와 baseline 평가

## 55. 폐기된 사항

- 고정된 10개 프로젝트 카테고리
- Personal Need 필수 입력
- Available Time 필수 입력
- Concept 등장 때마다 자동 교육 popup
- Knowledge Debt 빨간 경고 중심 UX
- Agent가 작성한 코드로 사용자 이해 판정
- MISCONCEPTION을 상태 단계로 저장
- 모든 file save와 shell log를 학습 데이터로 저장
- 전체 repository를 매번 LLM 분석
- 모든 Event마다 inference
- Bedrock을 MVP 필수 provider로 사용
- Code Mode를 고급 사용자 단계로 규정
- Agent Mode를 초보자 단계로 규정
- Builder의 실제 작업을 Task summary 뒤에 숨김
- Spec에서 모든 세부 기술 판단을 사용자에게 요구
- Builder가 실제 판단까지 대부분 대신 처리

## 56. 보류된 사항

- 최종 제품명
- 실제 deployment workflow
- AWS service 선택
- 배포를 완료 조건으로 둘지 여부
- 정확한 Crew App/Extension packaging
- Kiro/Crew session 공유 구현
- model 선택과 quota
- Evidence threshold 수치
- Concept embedding과 similarity algorithm
- DB DDL
- user research 규모
- Bedrock fallback

## 57. 개발 전 남은 다음 단계

현재 사용자는 개발 전에 대화와 명세를 먼저 정리하기로 했다. 문서 승인 이후 별도 개발 계획에서 다음을 정해야 한다.

- repository/package 구조
- 첫 vertical slice
- Kiro/Crew capability spike
- MCP tool schema와 SQLite DDL
- Agent Mode와 Code Mode의 최소 prototype 경계
- Discovery evaluation fixtures
- Evidence fixture와 reducer test
- Campus Drop Golden Path fixture
- 구현·검증 순서

이 단계는 아직 실행하지 않았다.

---

# Part V. 검증에 사용한 주요 공식 자료

- 대회: <https://ku-aws-challenge.framer.ai/>
- Kiro Custom Agents: <https://kiro.dev/docs/custom-agents/>
- Kiro Agent Configuration: <https://kiro.dev/docs/custom-agents/configuration-reference/>
- Kiro Hooks: <https://kiro.dev/docs/hooks/>
- Kiro MCP: <https://kiro.dev/docs/mcp/>
- Kiro MCP Security: <https://kiro.dev/docs/mcp/security/>
- Kiro ACP: <https://kiro.dev/docs/cli/acp/>
- Kiro Crew: <https://kiro.dev/crew/>
- Kiro Crew App SDK: <https://kiro.dev/docs/crew/apps/sdk/>
- Agent Plugins compatible clients: <https://agent-plugins.org/compatible-clients>
- Codex MCP: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>
- Claude MCP: <https://docs.anthropic.com/en/docs/mcp>
- Programming Knowledge Tracing 연구: <https://aclanthology.org/2025.acl-long.1343.pdf>
- Bedrock Evaluation: <https://docs.aws.amazon.com/bedrock/latest/userguide/evaluation.html>
- Bedrock Structured Outputs: <https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html>
- AWS App Runner availability change: <https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html>
