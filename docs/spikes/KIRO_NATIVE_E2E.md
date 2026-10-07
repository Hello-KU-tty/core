# Kiro-native 끝단 실측 (K03·K05)

Kiro 채팅 → hook → Core 기록, 그리고 Kiro Agent가 Core MCP로 Decision을 묻고 학습자의 자연어 답을 확정하는 흐름을 실제 Kiro에서 확인한 기록이다. [K01 spike](KIRO_NATIVE_HOOK_SPIKE.md)의 후속이다.

## 환경

- Kiro 1.2.4, `kiro.kiroAgent` 1.1.294(실측 중 1.1.237에서 자동 갱신), 격리 user-data-dir 프로필, 개인 BuilderId 무료 플랜, 모델 Auto.
- Core: 저장소의 `apps/local-backend`를 `core-only` 모드로 실행하고 `--native-role BUILDER … --kiro-hooks`로 한 Task에 묶인 Builder MCP와 hook 엔드포인트를 열었다. 데이터는 저장소 밖 `/Users/hurdoo/coding/experiments/kiro-native-e2e/`.
- 데이터: `scripts/seed-kiro-native-demo.mjs <root> campus-drop`으로 만든 합성 Project/Task(Campus Drop, LEARNER_FOCUS: 만료 링크·접근 토큰). 실제 사용자 데이터가 아니며 Agent 성과나 학습 Evidence가 아니다.
- 설치: `scripts/kiro-workspace-install.mjs`가 생성 workspace에 Steering(always·manual), hook 1개, MCP 설정, 학습자 요약 파일을 썼다. MCP 첫 승인은 이 합성 workspace 전용 `permissions.yaml`에 `vibe-helper/*` 허용 규칙을 넣어 대신했다.
- 판정: Core SQLite의 구조화 필드(복사본에서 조회)와 Kiro 세션 기록의 `tool_call`·`tool_result`로만 했다. 문자열 존재 여부로 대기·판정하지 않았다.

## 결과

| 단계 | 판정 | 근거 |
| --- | --- | --- |
| hook 스크립트 오프라인 | PASS | 합성 UserPromptSubmit 입력 → USER `USER_MESSAGE` 1건, Stop 입력은 무시, 잘못된 입력은 Core 400 거절, 세 경우 모두 hook exit 0 |
| Kiro 로드 | PASS | `v2 hooks loaded 1`, `[vibe-helper] mcp.connect.ok`(stdio bridge → Core) |
| 사용자 프롬프트 기록 | PASS | Kiro 채팅의 요청 3건이 순서대로 USER `USER_MESSAGE`로 저장 |
| Decision 요청(무관한 Task) | FAIL(설정 원인) | 처음 합성 Task가 Webhook Lens(학습 범위와 무관)여서 Agent가 만료 시간을 옵션 인자로 만들고 묻지 않았다 |
| Decision 요청(Campus Drop) | PASS | Agent가 Learning Spec의 학습 범위를 근거로 `request_user_decision` 호출, 채팅에 번호 선택지 3개와 추천을 제시. Core에 Decision과 `DECISION_REQUESTED` 저장 |
| 자연어 답 확정 | PASS | 새 세션에서 "하루 정도로 하자. … 1시간은 짧아."에 Agent가 `get_builder_task`로 열린 Decision을 찾고 `resolve_decision_from_chat`(2번, 원문 인용) 호출. Core 수락: `selectionKind OPTION`, 선택지 2(24시간), `rationale`은 학습자 원문 그대로, `chatSource.mappedBy BUILDER`, 출처 USER |
| 적용·Episode | PASS | `apply_decision_result`·`update_build_context` 수락. DECISION Episode는 학습자 답 2건 포함 후 `PENDING_ANALYSIS`, Analyst 작업 1건 `PENDING` |

| Helper 기록(K06) | PASS | `/vibe-helper 만료 시간을 24시간으로 정했는데, 링크에 토큰 서명은 왜 따로 필요한 거야?` → Helper Steering으로 설명만 답함(파일 수정 없음). Core에 HELPER_CONVERSATION Episode: 질문 USER `USER_MESSAGE`(접두 제거), 답 AGENT/HELPER `HELPER_RESPONSE`. 일반 채팅 기록에는 중복되지 않음. 0.11크레딧 |

## 발견한 문제와 조치

1. **멱등키 생성:** Agent가 `idem_<uuid v4>`를 직접 쓰다 형식을 틀리거나(넷째 묶음 0으로 시작) python으로 만들려다 셸 승인 대기에 걸렸다. Steering 0.2.0에 UUID v4 형식과 "명령을 실행하지 말 것"을 넣은 뒤 다음 세션에서는 유효한 키를 썼다. `kiroAgent.execution.rejectAll`로는 대기를 풀지 못했다.
2. **불필요한 `start_task`:** 매 세션 ACTIVE Task에 `start_task`를 호출해 거절됐다. Steering에 "PENDING일 때만"을 넣었다.
3. **bridge JSON 포장:** 일부 도구는 `inputJson` 문자열 포장을 요구해 Agent가 두세 번 재시도했다(`BRIDGE_ENVELOPE_JSON_REQUIRED`). 크레딧이 늘어나므로 K05에서 Steering 안내나 bridge 포장 규칙을 다시 본다.
4. **Context 순서:** Decision 적용 전에 Context를 갱신해 `LIVE_CONTEXT_ACTIVE_DECISIONS_MISMATCH`가 한 번 났고 Agent가 순서를 바꿔 회복했다.

## 비용

세션 기록 기준 누적 약 6.9크레딧(승인 대기로 멈춘 턴은 기록이 없어 실제는 더 많다). 이번 흐름에서 Decision 요청 턴 1.17, 확정·구현·적용 턴 1.62크레딧. MCP 도구 스키마 로드 때문에 일반 턴보다 비싸다.

## 남은 것

- Analyst 실행(Kiro-native 경로에서 누가 실행할지)과 다음 개인화 반영
- 확장 UI의 설치·제거와 사용자 동의 화면, 일반 trust 프로필의 승인 화면
- Agent 해석 정확도 평가 세트(K05)와 Helper 기록(K06)
