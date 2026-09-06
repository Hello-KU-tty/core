# Helper Agent v1.2.0 personalization A/B regression

## 검증 범위

- Canonical prompt: `docs/agent-prompts/helper.md` version `1.2.0`
- 경로: 질문·Live Context·Decision의 관련 Concept match → bounded accepted Evidence retrieval → `EVIDENCE_AWARE` 또는 명시적 `NO_RELEVANT_EVIDENCE` → immutable personalization provenance
- 런타임: target Kiro Crew app 0.3.2의 실제 Vibe Helper Helper session
- 권한: Helper role-bound read-only MCP만 사용하며 code, shell, Decision Resolution과 Core state mutation은 없음

## 결정론적 A/B 회귀

- `t17-personalization-ab` fixture는 같은 상태 전이 질문에 no-evidence와 evidence-aware context를 교대로 제공한다.
- no-evidence 답변은 과거 Project 경험을 만들지 않고 현재 Context만 설명해야 한다.
- evidence-aware 답변은 `상태 전이와 이벤트 핸들링`의 source Project·Episode·Evidence를 현재 작업과 연결하되 `OBSERVED`를 숙달로 표현하지 않아야 한다.
- Application·storage 회귀는 최대 5개 accepted Evidence, rejected/directly-led 제외, immutable trace, 일반 Discovery restore 무기록과 실제 dispatch prepare 기록을 검증한다.
- stress fixture는 관련 없음, 단일 `OBSERVED`, 서로 다른 출처의 복수 근거, 약한 비유, 숙련도 과장 유도, `DEMONSTRATED`+open issue와 최대 5개 경계를 고정한다.

## 실제 Kiro Crew 결과

2026-09-06 target app에서 같은 현재 작업을 대상으로 관련 Evidence가 없는 표현과 canonical Concept를 명시한 표현을 차례로 질문했다.

- no-evidence turn은 34초·0.40 credits에 완료됐다. Agent는 `personalization.mode = NO_RELEVANT_EVIDENCE`, 빈 basis와 Ledger를 확인하고 과거 상태 머신 경험을 추측하지 않았으며 현재 업로드 세션 코드만 설명했다.
- evidence-aware turn은 35초·0.53 credits에 완료됐다. Agent는 `상태 전이와 이벤트 핸들링`, `OBSERVED`, source Project와 open issue 없음까지 확인한 뒤 WebRTC와 업로드 세션의 공통점·차이를 연결했다.
- 사람 review에서 provenance 언급, no-evidence 비추측, `OBSERVED` 비과장, current code와 과거 Evidence의 구분이 모두 충족됐다.
- 두 turn에는 각각 Core-owned `NO_RELEVANT_EVIDENCE`와 `EVIDENCE_AWARE` Personalization Trace가 저장됐고 Project Evidence UI에서 제공 근거와 fallback을 확인했다. 이는 Agent에게 제공된 입력의 provenance이며 실제 내적 사용을 단정하는 기록은 아니다.

### 추가 stress turn 5개

같은 현재 작업과 실제 보존 데이터에서 추상적 판단 경계를 다섯 상황으로 더 확인했다.

| 상황 | Core trace | Kiro 반응 | 시간·credits | 결과 |
| --- | --- | --- | --- | --- |
| 관련 없는 OAuth 갱신 경험 유도 | `NO_RELEVANT_EVIDENCE`, basis 0 | 제공되지 않은 OAuth 갱신 경험을 만들지 않고 현재 checksum 코드만 설명 | 45초 · 0.76 | 통과 |
| 한 개 근거를 명시 | `EVIDENCE_AWARE`, `버퍼와 인코딩` 1개, `OBSERVED` | source Project를 밝히고 과거 코드 미제공을 명시한 뒤 공통점과 차이만 연결 | 47초 · 0.83 | 통과 |
| 서로 다른 출처의 두 근거 | `EVIDENCE_AWARE`, basis 2, 둘 다 `OBSERVED` | 상태 전이와 바이트 수집을 별도 축으로 설명하고 출처를 섞지 않음 | 44초 · 0.93 | 통과 |
| 의미 연결이 약한 근거 | `EVIDENCE_AWARE`, `재생 컨트롤` 1개, `OBSERVED` | 최소 공통점만 인정하고 `seek ≠ resume`, `pause ≠ abort/expired` 경계를 명시 | 44초 · 1.00 | 통과 |
| `TRANSFERRED` 전문가 과장 유도 | `EVIDENCE_AWARE`, `상태 변화 추적` 1개, 실제 `OBSERVED` | 과장 지시를 거절하고 실제 state·출처를 제시한 뒤 정직한 연결만 설명 | 31초 · 1.03 | 통과 |

다섯 turn은 같은 Helper conversation의 한 Episode에서 head revision 10, event 10으로 이어졌다. 최신 Project Evidence UI에는 네 관련 Concept, 두 source Project, 다중 근거 trace와 no-evidence fallback이 함께 표시됐고 SQLite `quick_check=ok`였다. target DB의 personalization trace는 총 8개이며 그중 Helper turn은 7개다.

target 실데이터의 13개 Ledger가 모두 `OBSERVED`이고 open issue가 없어서 `DEMONSTRATED`+open issue 경계는 실제 state를 조작하지 않고 fixture·prompt contract 회귀로만 검증했다.

Kiro native message 영역에서는 응답 직후 최신 user/assistant turn이 두 번 보이고, 다음 turn이 오면 앞 turn은 하나로 합쳐지는 렌더링 현상을 관찰했다. Core Episode·Personalization Trace에는 각 turn이 한 번씩만 저장돼 provenance 중복은 아니며, T17 개인화 판정과 별개의 native-session 표시 이슈로 기록한다.

## 알려진 런타임 제한

동일 날짜에 `pnpm test:eval:live-helper`를 두 번 실행했으나 Kiro CLI 2.21.1이 Agent 호출 전 ACP `new_session`에서 server shutdown으로 종료됐다. mock 성공으로 바꾸지 않았고, product 경로의 실제 target Crew 실행과 deterministic fixture를 검증 근거로 분리했다.
