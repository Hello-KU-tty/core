# 본선 방향: 일반 Kiro 바이브코딩에 끼어드는 Vibe Helper

프론트 담당자에게 본선에서 무엇을 바꾸려는지 공유하는 문서다. 아직 **구상과 검증 계획 단계**이며, 아래 구조는 Kiro 기능 실측(spike) 결과에 따라 바뀔 수 있다. 확정되면 `PROJECT_BRIEF.md`, `docs/DECISIONS.md`, `docs/TASKS.md`에 반영하고 다시 알린다.

## 일정

| 시점 | 할 일 |
| --- | --- |
| 지금~10/9 | Kiro hook·Steering·Spec·MCP 실측과 전환 여부 판단 |
| 10/11까지 | 포스터 사전 제출. 실측된 핵심 장면 한 컷을 넣는다 |
| 10/12~10/18 | 새 구조 안정화와 추가 구현. 기존 패널 경로는 본선 fallback으로 유지 |

## 왜 바꾸나

원래 하려던 것은 **사용자가 평소처럼 Kiro로 바이브코딩하는 동안 Vibe Helper가 옆에서 끼어들어 돕는 것**이었다. 예선에서는 시간 때문에 우리 패널 안에서 Builder를 직접 돌리는 형태, 즉 Kiro 안에 별도 바이브코딩 환경을 하나 더 만드는 형태가 됐다.

본선에서는 원래 구상으로 돌아간다.

- 코딩은 **Kiro 자체 채팅·Spec·task 실행**이 맡는다.
- Vibe Helper는 Kiro 기능(Spec 파일, Steering, MCP, Hook)으로 그 흐름에 들어가 Discovery, Decision, Helper, Evidence와 개인화를 제공한다.
- 사용자가 Kiro 채팅에 직접 친 말이 그대로 사용자 Evidence가 되므로, 학습 근거가 예선보다 강해진다.

## 목표 구조

```text
┌─ Vibe Helper 패널 ─────────┐        ┌─ Kiro 본체 ─────────────────────────┐
│ ① Discovery → Learning Spec ├─쓰기──▶ .kiro/specs/<app>/requirements.md     │
│                             │        │ .kiro/steering/vibe-learner.md        │
│ ④ Helper                    │        │   └ #[[file:.kiro/vibe/profile.md]]   │
│ ⑤ Evidence·Concept 보기     │        │ Kiro Agent가 task 실행 (= Builder)    │
└──────────▲──────────────────┘        │   ├ MCP: request_decision 등 ─────┐   │
           │                           │   └ Hooks: promptSubmit/postTool/ │   │
     Local Core (SQLite, Analyst) ◀────┴──────── postTask/agentStop ──────┘───┘
           └── profile.md 재생성 → Steering이 다음 대화에 자동 반영
```

| 역할 | 예선 | 본선 목표 |
| --- | --- | --- |
| Discovery·Learning Spec | 우리 패널 | **그대로 우리 패널.** 확정된 Spec을 Kiro Spec 파일(`requirements.md`)로 내보낸다 |
| Builder | 우리 패널이 Kiro 내부 Agent 세션을 직접 운영 | **사용자가 쓰는 Kiro 채팅 그대로.** Steering 파일로 행동만 조정한다 |
| Decision | 패널의 Builder 탭에서 선택 | Kiro 채팅 안에서 Agent가 묻고 사용자가 답한다. 패널에도 같은 Decision 카드를 보여준다 |
| Helper | 패널 탭, 권한을 막은 별도 세션 | 후보 A: Kiro 채팅 탭 + `#vibe-helper` Steering. 후보 B: 지금처럼 패널. **A를 먼저 실측한다** |
| Evidence 수집 | 패널 입력과 Builder 보고 | Kiro hook이 사용자 발언·Agent 도구 사용·task 종료를 Core에 기록 |
| 개인화 | 다음 Helper 답변·Discovery | 추가로 Core가 학습자 요약 파일을 만들고 Steering이 모든 Kiro 대화에 반영 |

## 바뀌는 원칙

- **Helper 권한 제한을 프롬프트 수준으로 완화한다.** 예선에서는 Helper를 read-only 권한으로 강제하려고 별도 세션과 복잡한 준비 절차가 필요했다. 본선에서는 "AI에게 물어보며 바이브코딩한다"는 경험을 우선한다. 다만 **Evidence와 Concept State는 여전히 Core만 바꿀 수 있다.**
- **Core는 최소한만 고친다.** Kiro 전용 기능은 `packages/kiro-adapter` 쪽에만 둔다. 다른 도구(Claude Code 등)로 옮길 때 adapter만 바꾸면 되게 한다.
- Builder의 "생성 workspace 안에서만 쓰기" 제한은 사용자 자신의 Kiro Agent를 관찰·개입하는 구조로 바뀐다. 구체 경계는 결정 기록에 남긴다.

## 프론트에 예상되는 영향

확정 전이라 **아직 프론트 코드를 크게 바꾸지 않는 것을 권한다.** 현재 예상은 다음과 같다.

- **유지:** Discovery 화면, Spec 확인 화면, History. 데이터 계약은 그대로 쓸 예정이다.
- **추가 가능성:** Spec 확정 뒤 "Kiro에서 시작하기"(Kiro Spec 파일 생성 후 Kiro 채팅 열기) 동작. Kiro 채팅에서 발생한 Decision 카드와 "이 답변이 근거로 기록됨" 같은 Evidence 표시.
- **축소 가능성:** 패널 안의 Builder stream·composer. Builder가 Kiro 채팅으로 옮겨 가면 패널의 Builder 탭은 진행 상황 요약 정도로 줄어든다.
- **미정:** Helper 위치(A/B). 실측 결과를 보고 알린다.

## 지금 검증하는 것

| # | 확인할 것 |
| --- | --- |
| S1 | Kiro 1.2.4가 실제로 읽는 hook 파일 형식 |
| S2 | 각 hook(prompt 제출, Agent 종료, 도구 사용 전후, 파일, Spec task)의 발동과 전달 정보 |
| S3 | prompt 제출 hook의 출력이 Agent 맥락에 들어가는지 |
| S4 | 도구 사용 전 hook으로 차단하거나 사용자 확인을 띄울 수 있는지 |
| S5 | 명령형 hook의 첫 실행 승인 화면 |
| S6 | Steering 상시 포함과 파일 참조가 바로 반영되는지 |
| S7 | Agent가 `request_decision` MCP 도구를 실제로 얼마나 호출하는지 |
| S8 | `session_id`로 Kiro 채팅 탭을 구분할 수 있는지 |
| S9 | 확장에서 Kiro 채팅을 열고 입력을 채울 수 있는지(Helper 후보 A) |
| S10 | 확장이 만든 Spec 파일을 Kiro가 인식하고 task를 실행하는지 |

결과는 `docs/spikes/`에 PASS/PARTIAL/BLOCKED로 남기고 공유한다.

## 참고

- 현재 제품 기준: [PROJECT_BRIEF.md](../PROJECT_BRIEF.md), [아키텍처](ARCHITECTURE.md)
- 이 브랜치(`finals/plan`)는 공유용 문서만 담는다. 제출된 `main`의 다운로드 경로와 파일은 바꾸지 않았다.
