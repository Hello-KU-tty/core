# K01 Kiro-native capability spike 결과

본선 방향([PROJECT_BRIEF §0](../../PROJECT_BRIEF.md#0-본선-방향-kiro-native-개입))의 전제인 Kiro hook·Steering·MCP·Spec 개입 경로를 실제 Kiro에서 확인한 결과다.

## 환경과 경계

- Kiro 1.2.4(`kiro.kiroAgent` 1.1.237), macOS arm64. 격리 user-data-dir·빈 extensions-dir 프로필에서 합성 workspace만 열었다. 사용자 기존 Kiro 창과 확장은 건드리지 않았다.
- 계정: 사용자가 직접 로그인한 개인 BuilderId 무료 플랜. 모델 Auto. 실측 총 **2.58크레딧**(상한 15). 합성 데이터만 사용했다.
- 격리 프로필에서 workspace trust를 껐다. 일반 프로필의 trust·승인 화면은 별도 확인이 필요하다.
- 조작 방법: computer use가 없어 probe 확장이 파일 inbox의 Kiro 명령을 실행했다. 답변·도구·크레딧은 Kiro가 디스크에 남기는 세션 기록(`~/.kiro/sessions/<workspace hash>/<session>/messages.jsonl`)으로, hook 발동은 hook 스크립트 로그로 확인했다. 실험 파일은 저장소 밖 `/Users/hurdoo/coding/experiments/kiro-hook-spike/`에 있다.
- 공유 상태 주의: 격리 프로필도 `~/.aws/sso/cache/kiro-auth-token.json`(로그인)과 `~/.kiro/`(세션 기록, `workspace-roots/<hash>/permissions.yaml`)를 사용자 기본 Kiro와 공유한다.

## 판정 요약

| # | 항목 | 판정 | 근거 |
| --- | --- | --- | --- |
| S1 | hook 파일 형식 | PASS | `.kiro/hooks/*.json`(`version: v1`, `hooks[]`, `trigger`, `action.type: command`) 10개 로드 로그. legacy `.kiro.hook`은 목록에 보이지만 발동하지 않았다 |
| S2 | trigger 발동·stdin | PASS | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostFileCreate, PostFileSave, Stop, PreTaskExec 발동. 모든 stdin에 `session_id`, `cwd`, `hook_event_name`. UserPromptSubmit은 `prompt`, Tool 계열은 `tool_name`·`tool_input`(Post는 `tool_response`), File 계열은 `file_path`, Task 계열은 `spec_name`·`task_name` |
| S3 | promptSubmit 출력 주입 | PASS | hook stdout의 "ORCHID-42"를 Agent가 그대로 답함 |
| S4 | 도구 차단·확인 | 차단 PASS / 확인 PARTIAL | exit 2 + stderr로 `fs_write` 차단, Agent가 차단 사실을 설명. stdout `{"hookSpecificOutput":{"permissionDecision":"ask"}}` 뒤 턴이 PreToolUse에서 멈췄으나 확인 창 자체는 화면으로 보지 못했다 |
| S5 | 승인 UX | PARTIAL | command hook은 승인 없이 실행(trust 꺼진 격리 프로필). MCP 도구 첫 호출은 `tool_approval` 대기. `mcp.json`의 `autoApprove`는 무시되고 시작 시 `~/.kiro/workspace-roots/<hash>/permissions.yaml`로 이관된다. `rules: [{capability: mcp, match: [server/tool], effect: allow}]`를 쓰자 승인 없이 호출됐다 |
| S6 | Steering 반영 | PARTIAL | always Steering 본문 수정은 다음 대화에 즉시 반영. `#[[file:...]]` 참조 내용은 반영되지 않았고(`[NO-PROFILE-FILE]`), 한 번은 Agent가 없는 marker를 지어냈다 |
| S7 | `request_decision` 호출 | PASS(5회) | 결정이 필요한 프롬프트 4/4 호출(Steering 예시와 겹치는 링크 만료 3회, 예시에 없는 비밀번호 저장 1회), 결정이 필요 없는 프롬프트 0/1. 호출 후 Agent가 선택지와 "왜?"를 채팅에서 물음 |
| S8 | 세션 연결 | PASS | MCP 호출 자체에는 세션 정보가 없지만 PostToolUse hook이 `mcp_vibe_spike_request_decision`을 `session_id`·질문·응답과 함께 전달. 사용자 답(이유 포함)도 같은 `session_id`의 UserPromptSubmit으로 수집되고 Agent가 선택대로 구현 |
| S9 | 확장에서 채팅 열기 | PARTIAL | `kiroAgent.focusChatInput({newSession, prompt, submit})`로 새 탭은 생겼으나 자동 전송은 안 됐다. 입력창 채움은 화면 미확인. `kiroAgent.sessions.create`·`sessions.sendPrompt(sessionId, text)`는 프롬프트 전송까지 동작 |
| S9-A | Helper 후보 A | PASS(경로 변경) | 문자열 `#vibe-helper`는 manual Steering을 붙이지 않았다. 대신 promptSubmit hook이 `도우미:` 접두를 감지해 Helper 역할 지시를 주입하자 Agent가 파일 수정 없이 비교 설명(`[VH-HELPER]`) |
| S10 | 외부 작성 Spec 실행 | PASS / PostTaskExec 미관측 | 외부에서 쓴 `.kiro/specs/<name>/` 3파일을 `kiro.spec.runAllTasks({documentUri})`로 실행. spec mode가 task를 실행하고 PreTaskExec hook·코드 구현 확인. 관측 시간 안에 PostTaskExec는 발동하지 않았다 |
| 추가 | Stop hook 계속 실행 | PASS(조건부) | stdout `{"decision":"block","reason":...}`로 Agent가 이어서 실행. 학습 목적 지시(`report_concepts` 호출)는 따랐고, 임의 지시(파일에 단어 쓰기)는 주입 공격으로 보고 거절 |
| 추가 | 계정별 MCP | 확인 | 만료된 팀 Enterprise 토큰에서는 거버넌스 조회 401로 `mcpDisabled: true, mcpReason: api_failure`. 개인 BuilderId에서는 `mcpDisabled: false` |

## 설계에 반영할 것

1. **학습자 요약은 Steering 본문에 직접 쓴다.** `#[[file:]]` 참조는 쓰지 않는다. adapter가 `.kiro/steering/` 파일을 Core 요약으로 갱신한다.
2. **Decision은 MCP 호출 + hook 관찰로 기록한다.** Agent는 `request_decision`을 부르고, adapter는 PostToolUse hook의 `session_id`·입력·응답으로 Decision과 세션을 묶는다. 이어지는 사용자 답은 같은 세션의 UserPromptSubmit으로 받는다.
3. **Helper A는 promptSubmit 주입으로 구현한다.** 접두(예: `도우미:`)나 패널 버튼으로 연 채팅에서 hook이 Helper 역할 지시를 넣는다. Helper 대화는 같은 hook으로 USER 출처를 남긴다. 탭 자동 열기는 `focusChatInput` 입력 채움을 화면으로 확인한 뒤 결정한다.
4. **Stop hook으로 개념 보고를 받는다.** 지시문은 사용자가 설정한 학습 자동화임이 분명한 문구로 쓴다. 임의 지시는 모델이 거절할 수 있다.
5. **MCP 허용은 설치 시 사용자 동의로 쓴다.** 우리 도구만 `permissions.yaml` 규칙에 넣거나 사용자가 첫 호출에서 "항상 허용"을 고르게 한다. `~/.kiro` 공유 영역을 쓰는 일이므로 설치 화면에서 알린다.
6. **hook 입력은 redaction 후 저장한다.** `tool_input`·`tool_response`에 파일 전체 내용과 절대 경로가 들어온다.
7. **MCP가 꺼진 계정 대비.** Enterprise 거버넌스는 MCP를 끌 수 있다. hook만으로 Evidence 수집이 동작하게 하고, Decision은 Stop hook이 정해진 형식의 질문을 찾아 기록하는 대체 경로를 K05에서 검증한다. 본선 팀 계정이 나오면 `GovernanceService Resolved` 로그로 MCP 상태를 먼저 확인한다.

## 비공개 인터페이스 의존

다음은 공식 문서에 없는 명령·인자·파일 형식이라 버전마다 깨질 수 있다. 제품에서는 버전 확인과 실패 시 fallback을 둔다.

- `kiroAgent.sessions.create`, `kiroAgent.sessions.sendPrompt(sessionId, text)`, `kiroAgent.focusChatInput({newSession, prompt, submit})`
- `kiro.spec.runAllTasks({documentUri, makeAllRequired})`
- `~/.kiro/sessions/.../messages.jsonl` 기록 형식, `~/.kiro/workspace-roots/<hash>/permissions.yaml` 규칙 형식
- hook의 ask·block·Stop continue 출력 형식(번들 분석으로 확인, Claude Code hook과 같은 형식)

## 남은 확인

- 일반 trust 프로필에서 command hook·MCP 첫 실행 승인 화면(S5)과 ask 확인 창(S4)을 화면으로 확인
- `focusChatInput`의 입력 채움(S9)과 PostTaskExec 발동 조건(S10)
- MCP 없는 Decision 대체 경로(K05)
- 본선 팀 계정의 MCP 거버넌스 상태
- Windows에서 hook 명령(`node <script>`)의 경로·인용 처리
