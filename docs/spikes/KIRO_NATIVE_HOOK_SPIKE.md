# K01 Kiro-native capability spike 결과

본선 방향([PROJECT_BRIEF §0](../../PROJECT_BRIEF.md#0-본선-방향-kiro-native-개입))의 전제인 Kiro hook·Steering·MCP·Spec 개입 경로를 실제 Kiro에서 확인한 결과다.

## 환경과 경계

- Kiro 1.2.4(`kiro.kiroAgent` 1.1.237), macOS arm64. 격리 user-data-dir·빈 extensions-dir 프로필에서 합성 workspace만 열었다. 사용자 기존 Kiro 창과 확장은 건드리지 않았다.
- 계정: 사용자가 직접 로그인한 개인 BuilderId 무료 플랜. 모델 Auto. 실측 총 약 **3.0크레딧**(Kiro 화면 표시 2.95/50 + 이후 재확인 0.08, 상한 15). 합성 데이터만 사용했다.
- 격리 프로필에서 workspace trust를 껐다. 일반 프로필의 trust·승인 화면은 별도 확인이 필요하다.
- 화면: Codex(gpt-6-astra) computer use는 Kiro 창을 읽다가 세 번 시간 초과돼 쓰지 못했고, 사용자가 화면을 캡처해 확인했다.
- 조작 방법: computer use가 없어 probe 확장이 파일 inbox의 Kiro 명령을 실행했다. 답변·도구·크레딧은 Kiro가 디스크에 남기는 세션 기록(`~/.kiro/sessions/<workspace hash>/<session>/messages.jsonl`)으로, hook 발동은 hook 스크립트 로그로 확인했다. 실험 파일은 저장소 밖 `/Users/hurdoo/coding/experiments/kiro-hook-spike/`에 있다.
- 공유 상태 주의: 격리 프로필도 `~/.aws/sso/cache/kiro-auth-token.json`(로그인)과 `~/.kiro/`(세션 기록, `workspace-roots/<hash>/permissions.yaml`)를 사용자 기본 Kiro와 공유한다.

## 판정 요약

| # | 항목 | 판정 | 근거 |
| --- | --- | --- | --- |
| S1 | hook 파일 형식 | PASS | `.kiro/hooks/*.json`(`version: v1`, `hooks[]`, `trigger`, `action.type: command`) 10개 로드 로그. legacy `.kiro.hook`은 목록에 보이지만 발동하지 않았다 |
| S2 | trigger 발동·stdin | PASS | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostFileCreate, PostFileSave, Stop, PreTaskExec, PostTaskExec 발동(PostFileDelete는 미시험). 모든 stdin에 `session_id`, `cwd`, `hook_event_name`. UserPromptSubmit은 `prompt`, Tool 계열은 `tool_name`·`tool_input`(Post는 `tool_response`), File 계열은 `file_path`, Task 계열은 `spec_name`·`task_name`(Post는 `task_success`) |
| S3 | promptSubmit 출력 주입 | PASS | hook stdout의 "ORCHID-42"를 Agent가 그대로 답함 |
| S4 | 도구 차단·확인 | 차단 PASS / 확인 PARTIAL | exit 2 + stderr로 `fs_write` 차단, Agent가 차단 사실을 설명. stdout `{"hookSpecificOutput":{"permissionDecision":"ask"}}` 뒤 턴이 PreToolUse에서 멈췄으나 확인 창 자체는 화면으로 보지 못했다 |
| S5 | 승인 UX | PARTIAL | command hook은 승인 없이 실행(trust 꺼진 격리 프로필). MCP 도구 첫 호출은 `tool_approval` 대기. `mcp.json`의 `autoApprove`는 무시되고 시작 시 `~/.kiro/workspace-roots/<hash>/permissions.yaml`로 이관된다. `rules: [{capability: mcp, match: [server/tool], effect: allow}]`를 쓰자 승인 없이 호출됐다 |
| S6 | Steering 반영 | PASS(세션 단위) | `#[[file:...]]` 참조는 `.kiro` 밖(`.vibe-helper/profile.md`)과 안(`.kiro/vibe/profile.md`) 모두 inline된다. 참조 파일에만 적은 별명·선호를 Agent가 그대로 답했다. 단 Steering 본문과 참조 내용은 **세션 시작 때 고정**돼 같은 세션 안의 수정은 반영되지 않고 새 세션부터 반영된다. 처음의 FAIL 판정은 "마커를 붙여라 + 안 보이면 [NO-PROFILE-FILE]"라는 실험 지시를 모델이 따르지 않은 것을 잘못 해석한 것이다(세션 기록의 `steeringDocuments[].content`에는 내용이 들어 있었다) |
| S7 | `request_decision` 호출 | PASS(5회) | 결정이 필요한 프롬프트 4/4 호출(Steering 예시와 겹치는 링크 만료 3회, 예시에 없는 비밀번호 저장 1회), 결정이 필요 없는 프롬프트 0/1. 호출 후 Agent가 선택지와 "왜?"를 채팅에서 물음 |
| S8 | 세션 연결 | PASS | MCP 호출 자체에는 세션 정보가 없지만 PostToolUse hook이 `mcp_vibe_spike_request_decision`을 `session_id`·질문·응답과 함께 전달. 사용자 답(이유 포함)도 같은 `session_id`의 UserPromptSubmit으로 수집되고 Agent가 선택대로 구현 |
| S9 | 확장에서 채팅 열기 | PARTIAL | `kiroAgent.focusChatInput({newSession, prompt, submit})`로 새 탭은 생겼으나 입력창은 비어 있었고(사용자 화면 확인) 자동 전송도 안 됐다. `kiroAgent.sessions.create`·`sessions.sendPrompt(sessionId, text)`는 프롬프트 전송까지 동작 |
| S9-A | Helper 진입 | PASS | `/vibe-helper 질문`(manual Steering의 슬래시 명령)을 보내면 그 턴에만 Helper Steering이 붙고, Agent가 Helper 역할로 학습자 프로필(별명·선호 비유)까지 반영해 설명했다. `inclusion: auto`로 바꾸면 접두 없이 "왜?" 질문에서 Agent가 Helper Steering을 스스로 불러오고 코드 요청에서는 불러오지 않았다. 다만 처음 불러올 때 `Load steering` 승인(Always allow 가능)이 필요하다. 문자열 `#vibe-helper`는 프로그램 전송에서 붙지 않았다(UI의 `#` 선택기는 미확인). hook이 `도우미:` 접두를 감지해 지시를 주입하는 방식도 동작한다 |
| S10 | 외부 작성 Spec 실행 | PASS | 외부에서 쓴 `.kiro/specs/<name>/` 3파일을 `kiro.spec.runAllTasks({documentUri})`로 실행. spec mode가 하위 Agent로 task를 실행해 완료했다(사용자 화면: "All done. Task 1 is complete", 0.7크레딧). PreTaskExec(`spec_name`, `task_name`)와 PostTaskExec(같은 필드 + `task_success: true`)가 task 완료 업데이트 직후 발동했고, 하위 Agent의 도구 사용도 부모 `session_id`로 들어왔다. PostTaskExec로 BUILD_TASK Episode를 닫을 수 있다 |
| 추가 | Stop hook 계속 실행 | PASS(조건부) | stdout `{"decision":"block","reason":...}`로 Agent가 이어서 실행. 학습 목적 지시(`report_concepts` 호출)는 따랐고, 임의 지시(파일에 단어 쓰기)는 주입 공격으로 보고 거절 |
| 추가 | 계정별 MCP | 확인 | 만료된 팀 Enterprise 토큰에서는 거버넌스 조회 401로 `mcpDisabled: true, mcpReason: api_failure`. 개인 BuilderId에서는 `mcpDisabled: false` |

## 설계에 반영할 것

1. **학습자 요약은 Steering이 참조하는 파일로 둔다.** adapter가 Core 요약 파일을 갱신하고 Steering은 `#[[file:]]`로 참조한다. Steering은 세션 시작 때 고정되므로, 세션 도중 바뀐 상태는 UserPromptSubmit hook 출력으로 그 턴에 주입한다.
2. **Decision은 MCP 호출 + hook 관찰로 기록한다.** Agent는 `request_decision`을 부르고, adapter는 PostToolUse hook의 `session_id`·입력·응답으로 Decision과 세션을 묶는다. 이어지는 사용자 답은 같은 세션의 UserPromptSubmit으로 받는다.
3. **Helper는 Kiro Steering으로 붙인다.** 기본 진입은 `/vibe-helper` 슬래시 명령(manual Steering)이고, 질문 의도에 자동으로 붙는 `inclusion: auto`는 첫 승인 UX를 보고 선택한다. hook의 접두 주입은 fallback이다. 질문은 UserPromptSubmit으로 USER 출처를 남긴다. Helper 답변 텍스트는 hook에 없으므로 수집 방법은 K06에서 정한다. `focusChatInput`의 prompt 채움은 동작하지 않았다.
4. **Stop hook으로 개념 보고를 받는다.** 지시문은 사용자가 설정한 학습 자동화임이 분명한 문구로 쓴다. 임의 지시는 모델이 거절할 수 있다.
5. **MCP 허용은 설치 시 사용자 동의로 쓴다.** 우리 도구만 `permissions.yaml` 규칙에 넣거나 사용자가 첫 호출에서 "항상 허용"을 고르게 한다. `~/.kiro` 공유 영역을 쓰는 일이므로 설치 화면에서 알린다.
6. **hook 입력은 redaction 후 저장한다.** `tool_input`·`tool_response`에 파일 전체 내용과 절대 경로가 들어온다.
7. **MCP가 꺼진 계정 대비.** Enterprise 거버넌스는 MCP를 끌 수 있다. hook만으로 Evidence 수집이 동작하게 하고, Decision은 Stop hook이 정해진 형식의 질문을 찾아 기록하는 대체 경로를 K05에서 검증한다. 본선 팀 계정이 나오면 `GovernanceService Resolved` 로그로 MCP 상태를 먼저 확인한다.

## 측정 오류 정정

- S6: 처음에 `#[[file:]]` 참조가 vibe 모드에서 동작하지 않는다고 적었으나 틀렸다. 모델에게 "보이면 마커를 붙이고 안 보이면 [NO-PROFILE-FILE]"이라고 지시한 실험에서 모델이 탈출구 문구를 골랐을 뿐, 세션 기록과 중립 질문(별명 묻기)으로는 내용이 전달됐다. `.kiro/` 하위 폴더 정책 때문이라는 중간 가설도 실측으로 기각했다.
- S10: 처음 보고에서 PostTaskExec가 발동하지 않았다고 적었으나 틀렸다. 대기 조건을 "hook 로그에 `PostTaskExec` 문자열이 있음"으로 썼는데, 앞선 실험에서 Agent가 읽은 hook 설정 파일 내용이 이미 로그에 있어 대기가 즉시 끝났다. 실제 발동(task 완료 직후) 전에 결과를 읽었다. 이후 판정은 `hook_event_name` 필드로만 한다.

## 비공개 인터페이스 의존

다음은 공식 문서에 없는 명령·인자·파일 형식이라 버전마다 깨질 수 있다. 제품에서는 버전 확인과 실패 시 fallback을 둔다.

- `kiroAgent.sessions.create`, `kiroAgent.sessions.sendPrompt(sessionId, text)`, `kiroAgent.focusChatInput({newSession, prompt, submit})`
- `kiro.spec.runAllTasks({documentUri, makeAllRequired})`
- `~/.kiro/sessions/.../messages.jsonl` 기록 형식, `~/.kiro/workspace-roots/<hash>/permissions.yaml` 규칙 형식
- hook의 ask·block·Stop continue 출력 형식(번들 분석으로 확인, Claude Code hook과 같은 형식)

## 남은 확인

- 일반 trust 프로필에서 command hook·MCP 첫 실행 승인 화면(S5)과 ask 확인 창(S4)을 화면으로 확인
- 채팅 탭 입력 채움은 동작하지 않으므로 Helper 진입은 접두나 패널 안내로 한다
- task 실패 시 PostTaskExec의 `task_success: false` 형태
- MCP 없는 Decision 대체 경로(K05)
- 본선 팀 계정의 MCP 거버넌스 상태
- Windows에서 hook 명령(`node <script>`)의 경로·인용 처리
