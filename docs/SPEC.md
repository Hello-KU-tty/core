# Vibe Helper 제품 명세

## 1. 상태

- 상태: 사용자 승인 완료, 구현 전
- 기준일: 2026-08-24
- 입력 원본: [PROJECT_BRIEF.md](../PROJECT_BRIEF.md)
- 상세 맥락: [PROJECT_SPEC.md](../PROJECT_SPEC.md), [CONVERSATION_RECORD.md](../CONVERSATION_RECORD.md)
- 제품명: 미확정. 문서에서는 `Vibe Helper`를 작업명으로 사용한다.

이 문서는 제품 요구사항의 구현 기준이다. 아직 애플리케이션 기능은 구현되지 않았다.

## 2. 목표와 해결할 문제

### 2.1 목표

사용자가 자신에게 가치 있는 TypeScript 서비스를 Kiro Builder와 실제로 완성하면서, 필요한 순간 Helper에게 질문하고 실제 판단을 내리게 한다. 사용자 본인의 설명·예측·판단·적용 근거를 보수적으로 축적하고 다음 설명과 프로젝트 추천에 활용한다.

### 2.2 해결할 문제

- Agent가 코드를 완성해도 사용자가 중요한 판단을 이해하지 못하는 문제
- 교육을 강요하면 실제 개발 동력이 사라지는 문제
- 배우고 싶은 기술이 실제로 필요한 매력적인 프로젝트를 찾기 어려운 문제
- Agent가 사용한 Concept와 사용자가 이해한 Concept를 혼동하는 문제
- 일반 Agent memory가 사용자 숙련을 근거 없이 추정하는 문제

### 2.3 제품 성공 정의

제품이 성공하려면 다음이 함께 관찰돼야 한다.

1. 사용자가 새 Learning Goal에서 만들고 싶은 프로젝트를 찾는다.
2. Builder가 실제로 실행 가능한 TypeScript 결과물을 만든다.
3. 실제 Decision에서 사용자가 Helper를 선택적으로 이용할 수 있다.
4. Evidence Engine이 상태 승격과 보류 이유를 원문 근거와 함께 설명할 수 있다.
5. 이전 Evidence가 다음 Helper 답변 또는 Discovery 결과를 바꾼다.
6. 초보 사용자가 개발을 방해받았다고 느끼지 않고 결과물을 자신이 만들었다는 감각을 보고한다.

## 3. 주요 사용자

### 3.1 주 사용자

- 바이브코딩을 시작하거나 익숙해지는 코딩 초보자
- 문법 강의보다 자신이 쓸 서비스를 만들며 배우고 싶은 사용자
- Agent에게 구현을 맡기면서도 중요한 판단의 의미는 이해하고 싶은 사용자

### 3.2 첫 검증 사용자

- 고려대학교 학생
- TypeScript 또는 웹 개발 경험이 적은 사용자
- 실제 필요나 기술적 호기심을 프로젝트 동기로 가진 사용자

### 3.3 사용자에게 요구하지 않는 것

- 시작 전에 available time 입력
- 모든 기술 범위와 아키텍처를 직접 설계
- Concept마다 퀴즈 응답
- 이해도를 증명하기 위한 강제 서술
- 코드 문법을 직접 작성하는 능력

## 4. 핵심 사용 흐름

### 4.1 Discovery와 Spec

```text
Learning Goal 입력
→ 선택적 Personal Need 입력
→ 다양한 후보 확인
→ pin/reject/merge/revise/regenerate
→ 후보 명시적 선택
→ 권장 Learning Spec 확인
→ 이대로 시작 또는 수정
```

### 4.2 Build와 Decision

```text
Builder Task 시작
→ 실제 Agent 작업 stream
→ Live Project Context 갱신
→ 실제 제품·기술 Decision 발생
→ Builder 추천 + Helper + 직접 선택
→ 사용자 결정 적용
→ 테스트와 Task 완료
```

### 4.3 Helper와 Evidence

```text
사용자가 Helper 호출
→ 현재 Task/Decision/코드 맥락 조회
→ 필요한 깊이로 설명
→ 사용자가 질문·비유·예측·이유 있는 판단
→ Episode 종료
→ Analyst Evidence Proposal
→ Core 검증과 State 계산
→ Evidence Trace 표시
```

### 4.4 개인화

```text
Concept Ledger + Project History
→ 다음 Helper context 또는 Discovery ranking
→ 과거 경험과 현재 차이를 연결
→ 자동 커리큘럼이 아니라 흥미·실용성을 보조
```

## 5. 기능 요구사항

### 5.1 Project Discovery

- `FR-DIS-001`: 시스템은 Learning Goal을 필수 입력으로 받아야 한다.
- `FR-DIS-002`: Personal Need, 최근 불편, 관심 영역과 현재 수준은 선택 입력이어야 한다.
- `FR-DIS-003`: 시스템은 available time을 필수·선택 입력으로 요구하지 않아야 한다.
- `FR-DIS-004`: 첫 round는 응답 대기와 첫 판단 부담을 낮추기 위해 제목, 요약, 매력 이유, 핵심 상호작용과 기술 필요성을 담은 lightweight preview 10개를 먼저 durable 저장해야 한다. 같은 preview identity의 핵심 개념, MVP와 권장 범위는 background enrichment로 완성하고, UI는 준비된 필드와 보강 중인 필드를 구분해야 한다.
- `FR-DIS-005`: 고정된 주제 taxonomy에서 후보를 순환하지 않아야 한다.
- `FR-DIS-006`: 후보는 문제 영역, 대상 사용자, 핵심 상호작용, 데이터 구조와 매력 이유가 실제로 달라야 한다.
- `FR-DIS-007`: Personal Need가 있으면 관련 후보와 독립 후보를 함께 제안해야 한다.
- `FR-DIS-008`: DIRECT, EXPAND, DISCOVER, UPGRADE는 생성 tag로만 사용하고 hard routing으로 좋은 후보를 배제하지 않아야 한다.
- `FR-DIS-009`: 사용자는 관심 후보를 checkbox로 담거나 빼고, 선택한 후보에 대한 merge, revise, shrink와 expand를 자연어로 요청해 현재 목록을 그 결과로 좁힐 수 있어야 한다. 이때 담지 않은 후보는 immutable history에는 남지만 다음 current round에서는 제외한다. 기존 후보를 보존하며 넓히는 동작은 명시적 `다른 후보 더 보기`로만 수행한다. reject와 regenerate도 지원하되 shrink와 expand는 후보별 버튼으로 노출하지 않는다.
- `FR-DIS-010`: 모든 후보 수정은 동일 ProjectCandidate의 revision과 lineage로 저장해야 한다.
- `FR-DIS-011`: 사용자의 명시적 선택 전에는 후보를 Final로 간주하지 않아야 한다.
- `FR-DIS-012`: 첫 스캔용 후보는 화면에 쓰는 간결한 의미 필드만으로 유효해야 한다. Concept Necessity, Personal Utility, Adoption Feasibility, Learner Fit, Scope, Adjacent Complexity, Deployability, Distinctiveness의 상세 평가와 위험은 관심·선택 이후 또는 비교 요청에서 지연 생성할 수 있고, 생성했다면 근거를 저장해야 한다.
- `FR-DIS-013`: Spec에서 Discovery로 돌아갈 때 Agent를 호출하지 않고 1초 안에 이전 후보와 입력을 복원해야 한다. 입력 수정과 새 후보 생성은 사용자의 명시적 action이어야 한다.
- `FR-DIS-014`: Candidate는 여러 열의 고정 높이 card grid가 아니라 제목·요약·핵심 경험을 한 줄 흐름으로 비교할 수 있는 목록이어야 한다.
- `FR-DIS-015`: Candidate checkbox는 선택·비선택 상태를 색상 외에도 check mark, outline과 설명으로 구분하고 모바일에서 충분한 터치 영역을 제공해야 한다.
- `FR-DIS-016`: Candidate refinement 자유 입력은 목록보다 먼저 보여야 하며 선택된 후보의 제목과 개수를 입력 옆에서 확인할 수 있어야 한다.
- `FR-DIS-017`: preview identity가 저장된 뒤 enrichment Agent는 새 후보를 발명하거나 제목·핵심 방향을 바꾸지 않고 지정된 preview만 완성해야 한다. 모든 preview가 완성될 때 기존 ProjectCandidate revision과 Candidate Round를 한 transaction에서 materialize해야 한다.
- `FR-DIS-018`: preview와 enrichment는 독립적인 idempotency 경계를 가져야 한다. 실패 시 저장된 preview와 성공한 enrichment를 보존하고 누락된 batch만 재시도하며, 사용자는 같은 Session revision에서 기존 atomic Candidate Round 생성으로 전환할 수 있어야 한다. 늦게 도착한 staged 결과는 이미 생성된 Round를 덮어쓰지 않아야 한다.
- `FR-DIS-019`: preview는 상세 보강 중에도 checkbox 관심 목록에 담을 수 있지만, SELECT·refinement와 Spec 생성은 참조하는 Candidate가 complete revision으로 materialize된 뒤에만 허용해야 한다.
- `FR-DIS-020`: background enrichment가 complete Round를 materialize해 preview 표현을 완성 Candidate 표현으로 교체해도 동일 Candidate ID의 checkbox와 펼친 상세 상태를 유지해야 한다.

완료 관찰:

- 고정 fixture 밖의 새 Learning Goal에서 후보가 생성된다.
- 같은 CRUD 구조의 테마 변경만으로 후보 목록을 채우지 않는다.
- 사용자의 merge 또는 revise 요청이 lineage를 보존한 새 revision으로 나타난다.

### 5.2 Learning Spec

- `FR-SPEC-001`: Discovery는 선택한 후보에 대한 권장 Learning Spec을 먼저 완성해야 한다.
- `FR-SPEC-002`: 사용자는 `이대로 시작`, `조금 바꾸기`, `다른 주제로 돌아가기`를 선택할 수 있어야 하며, 돌아가기 자체는 새 Agent 작업을 시작하지 않아야 한다.
- `FR-SPEC-003`: Spec은 LEARNER_FOCUS, AGENT_SUPPORT, EXCLUDED를 구분해야 한다.
- `FR-SPEC-004`: AGENT_SUPPORT는 필수 Evidence 목표 또는 Knowledge Debt로 계산하지 않아야 한다.
- `FR-SPEC-005`: 사용자가 명시적으로 Spec을 확정하기 전 Builder를 시작하지 않아야 한다.
- `FR-SPEC-006`: Spec은 제품 목적, 사용자, 성공 순간, MVP 기능, 예상 Decision, TypeScript와 배포 제약을 포함해야 한다.
- `FR-SPEC-007`: Spec의 기본 UI는 직접 편집 textbox를 제공하지 않고, 사용자·사용 순간·성공 순간·MVP·세 scope와 예상 Decision을 초보자가 읽기 쉬운 시각적 요약으로 보여줘야 한다.
- `FR-SPEC-008`: 사용자는 하나의 충분히 큰 자유 입력으로 Agent에게 Spec 수정을 반복 요청하고, 새 revision을 다시 검토한 뒤에만 확정해야 한다.
- `FR-SPEC-009`: Spec 수정 성공은 Agent 설명이 아니라 durable Spec revision 증가로 판정해야 한다. 첫 응답이 tool 없이 끝나면 최신 Core 상태에서 한 번만 자동 복구하고, 두 번째 실패는 현재 revision을 유지한 채 명시적으로 보여줘야 한다.

완료 관찰:

- 사용자는 기본 권장안으로 추가 기술 설계 없이 시작할 수 있다.
- 범위 밖 기술이 Agent Support 또는 Excluded로 구분된다.

### 5.3 Builder Task와 작업 stream

- `FR-BLD-001`: Learning Spec을 acceptance criteria가 있는 Builder Task로 변환해야 한다.
- `FR-BLD-002`: Builder는 생성 workspace에서 실제 파일 수정, 명령, 테스트와 디버깅을 수행해야 한다.
- `FR-BLD-003`: 사용자에게 보이는 실제 메시지, ToolCall, 파일 변경, 테스트, 오류 수정 흐름을 의도적으로 숨기지 않아야 한다.
- `FR-BLD-004`: Live Progress는 작업 stream을 대체하지 않고 현재 위치만 보조해야 한다.
- `FR-BLD-005`: Builder는 예상 Concept와 실제 사용 Concept를 보고하되 사용자 이해를 판정하지 않아야 한다.
- `FR-BLD-006`: Task 완료 시 구현, 테스트, Concept, Decision, Spec 이탈, 제한과 코드 참조를 보고해야 한다.

완료 관찰:

- Golden Path의 한 Task가 실제 파일 변경과 테스트 결과를 남긴다.
- UI에서 정상 작업, 오류, 수정과 완료를 순서대로 확인할 수 있다.

### 5.4 Live Project Context

- `FR-CTX-001`: Builder는 Task 시작, 방향 변경, Concept 도입, Decision, 오류 계획 변경, 테스트와 완료 checkpoint에서 context를 갱신해야 한다.
- `FR-CTX-002`: context에는 Task, 단계, 목표, 최근 변경, Decision, Concept, 관련 파일, 다음 작업, version과 시각이 포함돼야 한다.
- `FR-CTX-003`: Live Context는 Evidence와 분리된 최신 snapshot이어야 한다.
- `FR-CTX-004`: Helper는 오래되거나 없는 context를 추측하지 않고 refresh를 요청해야 한다.

완료 관찰:

- Task 중간에 Helper를 열어도 현재 Builder 작업을 설명한다.
- 오래된 version에서 최신 version으로 갱신되는 이력이 확인된다.

### 5.5 실제 Decision

- `FR-DEC-001`: Builder는 제품 동작, 데이터, API, 인증, 보안, 보관, 비용, 주요 아키텍처 또는 Learning Concept에 영향을 주는 실제 선택만 사용자에게 요청해야 한다.
- `FR-DEC-002`: 파일명, 코드 스타일과 쉽게 되돌릴 수 있는 내부 세부사항은 Builder가 처리해야 한다.
- `FR-DEC-003`: Decision은 이유, 선택지, 영향, Builder 추천, 관련 Concept와 코드 참조를 포함해야 한다.
- `FR-DEC-004`: 사용자는 Helper에게 묻기, Builder 추천대로 진행, 직접 선택·다른 방식 제안을 모두 사용할 수 있어야 한다.
- `FR-DEC-005`: Decision 때문에 막힌 작업 외에 독립적으로 진행 가능한 작업은 계속할 수 있어야 한다.
- `FR-DEC-006`: 이유 없는 추천 수락만으로 사용자 이해 Evidence를 만들지 않아야 한다.

완료 관찰:

- Golden Path에서 교육용으로 조작되지 않은 실제 Decision이 최소 하나 발생한다.
- Helper와 대화한 뒤 사용자의 선택이 Builder 작업에 적용된다.

### 5.6 Helper

- `FR-HLP-001`: Helper는 모든 Concept State에서 항상 접근 가능해야 한다.
- `FR-HLP-002`: Helper는 read-only여야 하며 파일 수정, shell, Decision 확정과 State 변경을 할 수 없어야 한다.
- `FR-HLP-003`: Helper는 Live Context, Task, Spec, Decision, 관련 State, 과거 Episode, 코드·diff, 필요한 대화 일부 순으로 최소 맥락을 조회해야 한다.
- `FR-HLP-004`: 첫 답은 간결하고 사용자의 요청으로 더 쉽게, 더 자세히, 현재 코드 예시, 선택지 비교를 제공해야 한다.
- `FR-HLP-005`: 자유 입력창을 중심으로 빠른 카드를 제공하되 카드 클릭 자체를 Evidence로 보지 않아야 한다.
- `FR-HLP-006`: 질문형 비유도 claim 단위 대응 관계로 처리해야 한다.
- `FR-HLP-007`: 설명 후 강제 퀴즈나 다시 말하기를 요구하지 않아야 한다.

완료 관찰:

- Helper가 현재 Decision과 코드에 연결된 답변을 제공한다.
- write/shell 호출이 권한 계층에서 거부된다.
- 일부 맞고 일부 틀린 비유에 부분 인정과 정정이 나타난다.

### 5.7 Activity, Episode와 Evidence

- `FR-EVD-001`: 시스템은 의미 있는 Event만 정규화해 저장해야 한다.
- `FR-EVD-002`: Event를 BUILD_TASK, DECISION, HELPER_CONVERSATION, FINAL_UPGRADE Episode로 묶어야 한다.
- `FR-EVD-003`: Analyst는 Episode 종료 후 한 번 분석하고 Event마다 LLM을 호출하지 않아야 한다.
- `FR-EVD-004`: Agent 설명, Agent 코드, 확인 응답, 카드 클릭과 직접 유도된 반복은 강한 사용자 Evidence가 아니어야 한다.
- `FR-EVD-005`: Evidence는 Signal, Strength, Prompt Dependence, 원문·행동 참조, 이유, 불확실성, 최대 지지 State를 포함해야 한다.
- `FR-EVD-006`: Analyst는 State를 직접 변경하지 않고 proposal만 제출해야 한다.
- `FR-EVD-007`: Core는 validation과 deterministic reducer로 proposal을 채택·거절하고 State를 계산해야 한다.
- `FR-EVD-008`: MISCONCEPTION은 state가 아니라 open issue로 저장해야 한다.
- `FR-EVD-009`: 한 번의 contradiction으로 즉시 강등하지 않고 독립된 반복과 이후 해결 Evidence를 처리해야 한다.
- `FR-EVD-010`: 사용자는 State 변경·보류의 근거를 Evidence Trace에서 확인할 수 있어야 한다.

완료 관찰:

- 같은 Episode에 NONE과 STRONG proposal이 함께 존재할 수 있다.
- Core가 잘못된 schema, Agent-authored 근거 또는 과도한 State proposal을 거절한다.
- State 승격 또는 보류의 원문 근거를 UI에서 역추적할 수 있다.

### 5.8 Concept State와 개인화

- `FR-PER-001`: State는 OBSERVED, EXPLAINED, DEMONSTRATED, TRANSFERRED를 사용해야 한다.
- `FR-PER-002`: 사용자 UI에는 기본적으로 confidence 퍼센트를 표시하지 않아야 한다.
- `FR-PER-003`: Builder는 State에 따라 코드 품질을 바꾸지 않아야 한다.
- `FR-PER-004`: Helper는 State와 과거 Episode로 설명의 출발점과 연결만 조절해야 한다.
- `FR-PER-005`: Discovery는 흥미와 실용성을 우선하고 Ledger를 보조 ranking signal로만 사용해야 한다.
- `FR-PER-006`: 개인화 결과에는 어떤 과거 Evidence가 사용됐는지 추적 가능해야 한다.

완료 관찰:

- 같은 질문에 관련 Evidence가 있을 때와 없을 때 Helper context와 답변이 의미 있게 달라진다.
- Ledger 때문에 명백히 덜 매력적인 후보만 추천하지 않는다.

### 5.9 UI Mode

- `FR-UI-001`: Agent 중심과 Code 중심을 초보·고급 단계로 표시하지 않아야 한다.
- `FR-UI-002`: Agent 중심은 Builder stream과 Helper를 동시에 볼 수 있어야 한다.
- `FR-UI-003`: Code 중심 prototype은 Kiro editor에서 Builder/Helper panel과 같은 Core 상태에 접근해야 한다.
- `FR-UI-004`: Mode 전환 또는 기존 Project 재진입 시 Core에 저장된 session, Task, Decision과 Context가 유지돼야 한다. 실행 중 Agent stream과 progress의 재연결은 MVP 보장 범위가 아니다.
- `FR-UI-005`: 완료 화면은 Concept 점수보다 결과물 실행을 먼저 보여줘야 한다.
- `FR-UI-006`: 업데이트 전 UI protocol은 제거된 Agent를 호출하기 전에 차단해야 한다. exact Session/revision slot 복원은 중복 dispatch를 줄이는 방어 기능으로 유지하지만 MVP acceptance gate로 사용하지 않는다.

## 6. 비기능 요구사항

### 6.1 성능

- `NFR-PERF-001`: Event 저장과 deterministic reducer는 Agent 응답과 분리돼 UI를 불필요하게 막지 않아야 한다.
- `NFR-PERF-002`: Helper context는 관련 Concept 약 3~5개와 최소 project context를 기본으로 해야 한다.
- `NFR-PERF-003`: 전체 repository scan은 누락 검증 또는 모호한 판정에만 사용해야 한다.
- `NFR-PERF-004`: token, latency와 Agent 호출 횟수를 Episode·Agent별로 관측할 수 있어야 한다.
- `NFR-PERF-005`: local Analyst dispatch는 UI를 막지 않고 1초 안에 반환하는 것을 초기 목표로 하며, 한 attempt의 soft timeout은 30초로 둔다.
- `NFR-PERF-006`: Analyst는 Event마다가 아니라 닫힌 Episode마다 한 번 호출한다. 자동 retry는 초기값 1회로 제한하고 이후 재시도는 명시적 상태로 남긴다.
- `NFR-PERF-007`: Discovery→Spec→Discovery 복귀는 local Core 조회만으로 1초 안에 끝내고 Agent 호출 횟수는 0회여야 한다.
- `NFR-PERF-008`: 사용자와 직접 상호작용하는 Discovery 첫 durable Candidate preview, 단일 refinement와 Spec 초안은 target 환경에서 각각 30초 이내를 목표로 하고, 첫 유용 반응은 3~5초를 지향한다. T15 release gate는 최종 설치본의 대표 end-to-end 실행 한 번에서 10개 preview 저장, refinement와 Spec 구간이 모두 30초 이내이고 background enrichment가 complete Round로 수렴하며 사용자가 결과를 승인하는 것으로 판정한다. 장기 P95 표본은 T21에서 수집한다. provider/model/config별 latency를 같은 unseen 입력으로 비교하며 30초가 지나면 작업은 백그라운드에서 이어지되 사용자가 저장된 결과를 보거나 다른 화면으로 이동하는 것을 막지 않아야 한다.
- `NFR-PERF-009`: Agent tool input의 구조적 형식 오류는 transport 경계에서 안전하게 정규화하거나 즉시 표시하고, 같은 의미 내용을 모델이 다시 생성하게 만들지 않아야 한다. tool validation 재시도율의 초기 목표는 1% 미만이다.

T01 macOS probe의 두 실행은 20~37ms에 dispatch가 반환되고 약 12초 안에 결과 validation을 마쳤다. T15 model screen에서는 `auto` 첫 Candidate 41.6초, `claude-haiku-4.5` 22.1초였고 Luna는 contract를 지키지 못했다. Haiku 고정, ephemeral Core context, phase별 최소 prompt/tool과 Core-derived MERGE를 적용한 v1.1.5 target 5회에서 first Candidate·MERGE·first Spec의 nearest-rank P95는 각각 26.564초·21.044초·22.900초였고 15개 phase가 모두 durable 저장에 성공했다. v1.1.6 Spec 수정 재검증에서는 Haiku 정상 수정이 19.256~24.903초였지만 raw 2회 중 1회가 no-tool로 끝나 bounded 1회 UI 복구를 추가했다. SPEC만 Terra는 첫 Spec 43.257초, Auto는 첫 Spec 39.240초·수정 36.027초로 30초 gate를 넘겨 Haiku를 유지한다. 사용자 승인에 따른 대표 MERGE 13.226초, 첫 Spec 18.860초와 Spec 수정 23.097초는 통과했지만 기존 first Candidate는 50.132초였다. single Round 대안은 latency와 durable reliability를 함께 충족하지 못해 staged 경로를 적용했다. v1.1.8 target preview는 21.635초, v1.1.9 최종 preview는 23.241초로 30초 gate를 통과했고 둘 다 identity 10개와 Session revision 1→2를 보존한 complete Round로 수렴했다. v1.1.9의 enrichment 완료는 148.371초로 v1.1.8의 217.934초보다 약 31.9% 짧아졌지만 SELECT·refinement가 그동안 잠기는 것은 MVP의 알려진 제한이다. 3~5초 first-useful과 background 장기 분포는 T21에 남긴다. timeout 뒤 늦은 결과는 현재 Session revision과 staged identity가 일치하지 않으면 버린다.

### 6.2 보안·개인정보

- `NFR-SEC-001`: Activity 수집이 기본 활성화된다는 사실을 첫 사용에 안내해야 한다.
- `NFR-SEC-002`: secret, token, credential과 민감 경로를 저장·출력 전에 redaction해야 한다.
- `NFR-SEC-003`: MCP는 workspace path와 payload를 독립적으로 검증해야 한다.
- `NFR-SEC-004`: 임의 SQL과 임의 파일 read/write를 Agent tool로 노출하지 않아야 한다.
- `NFR-SEC-005`: Builder write/shell은 생성 workspace로 제한해야 한다.
- `NFR-SEC-006`: Helper와 Analyst 권한은 코드로도 강제해야 한다.
- `NFR-SEC-007`: 전체 terminal output과 file save 이력을 장기 저장하지 않아야 한다.

### 6.3 접근성

- `NFR-A11Y-001`: 핵심 기능은 keyboard만으로 사용할 수 있어야 한다.
- `NFR-A11Y-002`: 상태와 Decision은 색상만으로 구분하지 않아야 한다.
- `NFR-A11Y-003`: 빠른 카드 사용 여부와 관계없이 자유 입력이 항상 가능해야 한다.
- `NFR-A11Y-004`: Agent stream, 오류와 진행 상태에 접근 가능한 label과 읽기 순서를 제공해야 한다.

### 6.4 호환성

- `NFR-COMP-001`: MVP 생성·실행 project는 TypeScript Golden Path에 한정한다.
- `NFR-COMP-002`: Core와 MCP contract는 Kiro UI package와 분리해야 한다.
- `NFR-COMP-003`: MVP host는 Kiro/Crew이며 Claude Code·Codex adapter는 구현하지 않는다.
- `NFR-COMP-004`: Code 중심 surface의 정확한 기능은 capability spike 결과를 넘지 않아야 한다.

### 6.5 운영과 신뢰성

- `NFR-OPS-001`: local SQLite schema version과 migration 경계를 가져야 한다.
- `NFR-OPS-002`: Agent 실패, tool 거절, stale context와 분석 실패를 사용자에게 복구 가능한 상태로 표시해야 한다.
- `NFR-OPS-003`: Evidence 분석 실패가 Builder의 완료된 코드와 Project History를 손상시키지 않아야 한다.
- `NFR-OPS-004`: Event→Episode→Proposal→State 전이를 correlation id로 추적할 수 있어야 한다.

## 7. 데이터 요구사항

### 7.1 주요 데이터 영역

- Project와 Learning Spec
- Discovery Session, Candidate Round, Feedback와 Revision
- Builder Task와 Live Project Context
- Decision Request와 적용 결과
- Activity Event와 Episode
- Canonical Concept와 alias
- Evidence Proposal, accepted Evidence, State와 open issue
- 평가 run, fixture, baseline과 결과

### 7.2 저장 원칙

- 기본 저장소는 local SQLite다.
- 최신 snapshot, 변경 이력, 학습 Evidence를 분리한다.
- 코드 근거는 path, diff/commit reference와 redacted snippet 중심이다.
- 사용자 원문 Evidence는 project/task/episode와 연결한다.
- 삭제·보관 기간과 export는 MVP 이후 운영 결정으로 남긴다.

### 7.3 데이터 품질

- Concept alias가 불확실하면 자동 merge하지 않는다.
- Proposal 원문과 Core 채택 결과를 모두 보존한다.
- State reducer version을 저장해 결과를 재현할 수 있게 한다.
- 개인정보가 제거된 fixture로 평가를 재실행할 수 있어야 한다.

## 8. 외부 연동

### 8.1 Kiro/Crew

- Crew App UI와 Agent runtime
- chat/tool/task event
- sync/async Agent dispatch
- MCP registration과 permission-scoped API
- 실제 제공 model과 quota는 capability spike에서 확인한다.

### 8.2 MCP

- Discovery proposal과 feedback
- Builder Task, Live Context, Decision과 Completion Report
- Helper context와 refresh
- Episode 조회와 Evidence Proposal
- Agent는 SQLite를 직접 수정하지 않는다.

### 8.3 Git과 파일 시스템

- Task 종료 diff와 관련 code reference
- 생성 workspace 내부에서만 Builder write/shell
- Git provider 또는 remote push는 MVP 필수가 아니다.

### 8.4 배포

- 현재 provider와 workflow는 미정이다.
- MVP 완료 조건 포함 여부는 T0 결정 사항이다.
- 배포를 추가하더라도 한 TypeScript Golden Path와 한 provider로 제한한다.

## 9. 범위 제외

- 기존 임의 project import와 전체 분석
- 다언어 runtime
- 완전한 Ontology·Graph DB
- 강제 퀴즈, 랭킹과 게임화
- 모든 IDE activity 장기 저장
- Event마다 LLM 분석
- 자체 IDE와 범용 sandbox 설치 UX
- 여러 cloud deployment adapter
- Bedrock provider
- Claude Code·Codex adapter
- 복잡한 multi-agent 토론

## 10. 완료 조건

### 10.1 MVP 완료 조건

- `AC-MVP-001`: 새 Learning Goal에서 고정 목록이 아닌 Discovery round가 생성된다.
- `AC-MVP-002`: 사용자의 candidate 수정과 명시적 선택이 revision lineage로 저장된다.
- `AC-MVP-003`: Learning Spec의 세 scope가 생성되고 사용자가 권장안으로 시작할 수 있다.
- `AC-MVP-004`: Crew App에서 Golden Path Builder Task가 실제 코드와 테스트를 완료한다.
- `AC-MVP-005`: Task 중간 Live Context로 Helper가 현재 상황을 설명한다.
- `AC-MVP-006`: 실제 Decision→Helper→사용자 선택→Builder 적용 흐름이 동작한다.
- `AC-MVP-007`: Episode에서 Agent-authored 내용과 사용자 Evidence가 분리된다.
- `AC-MVP-008`: Analyst proposal을 Core가 채택 또는 거절하고 이유를 남긴다.
- `AC-MVP-009`: State 변경·보류의 Evidence Trace를 확인할 수 있다.
- `AC-MVP-010`: 과거 Evidence가 다음 Helper 또는 Discovery 결과를 바꾼다.
- `AC-MVP-011`: 생성 결과물을 실제로 실행하거나 열 수 있다.
- `AC-MVP-012`: Code 중심 thin prototype이 같은 Core 상태를 읽는 것을 확인한다.
- `AC-MVP-013`: secret redaction, path rejection, Agent 권한 거절 test가 통과한다.
- `AC-MVP-014`: Golden Path와 unseen input의 전체 flow를 재현 가능한 방식으로 검증한다.

### 10.2 대회 제출 준비 완료 조건

- 실제 초보 사용자 검증과 동의받은 증언이 있다.
- 일반 Kiro baseline과 비교 결과가 있다.
- false mastery와 Evidence 품질 결과를 재현할 수 있다.
- 주요 오류·빈 상태·권한·접근성 흐름이 검증된다.
- live demo와 fallback demo가 같은 데이터 계약을 사용한다.
- README와 제출 Markdown이 실제 실행·검증 방법과 기술적 차별점을 설명한다.

## 11. 명시된 요구사항

- Build-first full package
- 신규 프로젝트형 MVP
- Learning Goal 필수, Personal Need 선택, available time 없음
- 동적 후보와 무제한 refinement
- LEARNER_FOCUS, AGENT_SUPPORT, EXCLUDED
- 실제 Decision과 Helper always available
- Builder 실제 stream과 Live Context
- Evidence 기반 Concept State와 deterministic Core
- MISCONCEPTION은 open issue
- local SQLite와 selective code analysis
- Agent 중심·Code 중심을 취향 Mode로 취급
- 실제 project는 TypeScript만 지원
- Kiro-only Analyst MVP와 Bedrock 보류
- 실제 초보 사용자 검증

## 12. 승인된 구현 가정

- `ASM-001`: pnpm workspace가 여러 UI·Core·adapter package 경계를 관리하기 적합하다.
- `ASM-002`: Agent 중심 Crew App을 주 vertical flow로 완성하고 Code 중심은 thin prototype으로 제한하는 것이 대회 완성도에 유리하다.
- `ASM-003`: 배포 없이도 결과물을 로컬에서 실행하면 첫 MVP의 build-first 가치를 검증할 수 있다.
- `ASM-004`: Evidence threshold는 fixture와 사용자 pilot 전에는 확정하지 않는 것이 안전하다.
- `ASM-005`: Campus Drop은 Discovery template가 아니라 integration fixture로 적합하다.

위 가정은 2026-08-24 기본안 승인으로 MVP의 working assumption이 됐다. 외부 capability나 사용자 pilot 결과가 반박하면 [DECISIONS.md](DECISIONS.md)에 근거를 남기고 수정한다.

## 13. 후속 검증 또는 세부 결정이 필요한 사항

기본 방향은 승인됐다. 아래 세부사항만 정해진 task에서 검증·기록한다.

1. T01: Kiro/Crew에서 Builder와 Helper session을 앱 안에서 어떻게 분리·표시하고 Core context로 연결할지
2. T01: Code 중심 thin prototype이 실제 Kiro IDE에서 사용할 수 있는 최소 surface
3. T02: 실제 Node.js LTS version, runtime schema와 SQLite/migration library
4. T07·T23: reducer fixture, reviewer 방식과 실제 pilot 규모
5. T28: 대회 제출을 위한 공식 packaging·배포 경로
