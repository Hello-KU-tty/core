# 작업 계획

## 1. 상태 표기와 실행 규칙

- `[ ]`: 아직 시작하지 않음
- `[-]`: 선행 결정이나 외부 조건 때문에 대기
- `[>]`: 다음에 실행할 작업. 문서 전체에서 반드시 하나만 둔다.
- `[~]`: 진행 중
- `[x]`: 완료하고 완료 조건을 검증함

작업은 위에서 아래로만 진행해야 한다는 뜻이 아니다. 다만 선행 조건을 만족하지 않은 작업은 시작하지 않는다. 각 작업을 끝낼 때 산출물과 완료 조건을 실제로 확인한 뒤 상태를 갱신한다. 제품 범위가 바뀌면 먼저 `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`를 정합하게 고친 뒤 이 문서를 조정한다.

MVP는 단순 화면 시제품이 아니라 `Discovery → Learning Spec → Builder → 실제 Decision → Helper → Evidence → 다음 개인화`가 한 번 이어지는 검증 가능한 수직 흐름이다. 공통 계약과 상태 처리부터 만들고, Agent와 UI는 그 위에 연결한다.

본선 작업은 2절의 K 작업으로 진행한다. 예선 작업의 상세 기록은 [예선 작업 기록](archive/preliminary/TASKS_PRELIMINARY.md)에 원문 그대로 있다.

## 2. 본선: Kiro-native 전환

본선 방향은 [PROJECT_BRIEF §0](../PROJECT_BRIEF.md#0-본선-방향-kiro-native-개입)과 [DECISIONS](DECISIONS.md)의 본선 결정 세 건을 따른다. 일정 기준은 포스터 사전 제출 10/11, 본선 10/18이다.

### [x] K00. 저장소 정리와 본선 방향 기록

- **범위:** 날짜형 인계·보고 문서와 예선 작업 상세를 `docs/archive/preliminary/`로 옮기고 링크를 고친다. Brief·SPEC·ARCHITECTURE 머리의 누적 승인 메모를 승인 이력으로 옮긴다. 본선 방향을 Brief·DECISIONS·ARCHITECTURE·AGENTS.md에 기록하고 K 작업을 만든다.
- **보존:** 제출 다운로드 가이드, `docs/assets/`, `releases/`, spike 기록은 제자리에 둔다. 문서 원문은 의미를 바꾸지 않고 옮긴다. 미추적 발표 원본·감사 초안·`prompt.txt`는 건드리지 않는다.
- **완료 조건:** 추적 Markdown의 상대 링크가 이동 전과 같은 수준으로 해석된다(이동 전부터 있던 `dist/`·임시 경로 참조 제외). 로컬 commit까지만 한다.
- **검증:** 문서 41개를 이동하고 56개 문서의 링크를 고쳤다. 추적·신규 Markdown 전체의 상대 링크 재검사에서 새로 깨진 링크는 0개다. `pnpm format:check`는 기존 `.local-experiments/kiro-native-recovery/biome.json` 중첩 설정 오류로 실행 전에 멈췄다(이전부터 있던 문제, Markdown은 Biome 대상 아님). 프론트 공유 문서는 사용자 요청으로 별도 브랜치 `finals/plan`에 push했다.

### [x] K01. Kiro-native capability spike

- **선행:** K00.
- **범위:** 합성 workspace(`/Users/hurdoo/coding/experiments/`)와 별도 Kiro 창에서 S1~S10을 실측한다. S1 hook 파일 형식, S2 trigger별 발동·stdin, S3 promptSubmit 출력의 맥락 주입, S4 preToolUse 차단·확인, S5 명령 hook 승인 UX, S6 Steering always와 `#[[file:]]` 즉시 반영, S7 `request_decision` 호출률, S8 `session_id` 탭 구분, S9 확장에서 채팅 열기·입력(Helper 후보 A), S10 확장이 쓴 Spec 인식과 task 실행.
- **비용 경계:** 모델 호출이 없는 항목을 먼저 한다. 모델 호출은 개인 계정 무료 플랜, Auto 모델, 15크레딧 상한, 합성 데이터만 쓴다. 로그인은 사용자가 직접 한다.
- **산출물:** `docs/spikes/KIRO_NATIVE_HOOK_SPIKE.md`와 실행 기록. 항목별 PASS/PARTIAL/BLOCKED와 근거.
- **완료 조건:** 각 항목의 판정과 재현 절차가 남고, K02~K06의 진행 여부와 Helper A/B 선택이 결정된다.
- **결과:** [spike 결과](spikes/KIRO_NATIVE_HOOK_SPIKE.md). 개인 BuilderId·Auto로 약 3.0크레딧 사용. hook 수집·맥락 주입·도구 차단·Decision MCP 호출(4/4)·세션 연결·외부 Spec 실행은 PASS. `#[[file:]]` 참조는 동작하나 Steering은 세션 시작 때 고정된다(처음 FAIL 판정은 실험 설계 오류로 정정). Helper는 `/vibe-helper` 슬래시 명령(manual Steering)으로 붙고 `inclusion: auto`도 동작한다(첫 승인 필요). Spec task 시작·종료 hook(PreTaskExec·PostTaskExec, `task_success` 포함)도 PASS. `focusChatInput` 입력 채움은 사용자 화면 확인 결과 동작하지 않았다. 일반 trust 승인 화면과 ask 확인 창은 남은 확인으로 K03·K06에서 다시 본다. K02~K06은 진행한다.

### [x] K02. Core의 host 중립 수집 경로

- **선행:** K01에서 hook 수집 경로가 PASS 또는 PARTIAL.
- **범위(조정):** Concept State의 host 중립 학습자 요약(`buildLearnerProfile`)과 채팅 Decision 답의 결정적 확정 규칙(`parseChatDecisionReply`)을 domain 순수 함수로 추가한다. 외부 workspace root 등록은 기존 프로젝트 import가 MVP 제외라 만들지 않고 생성 workspace를 Kiro 폴더로 연다. Kiro 형식은 Core에 넣지 않는다. (후속: 사용자 승인으로 일반 채팅 Evidence와 채팅 Decision 혼합 확정을 추가하면서 Core 계약이 늘었다. K05 참조. DB 스키마는 그대로다.)
- **완료 조건:** unit 테스트, provenance(USER rationale 원문 유지·추측 금지) 회귀, 타입 검사.
- **검증:** 학습자 요약 5개·채팅 Decision 16개 테스트 추가. Node 24.19.0/pnpm 11.13.1에서 `pnpm typecheck` 통과, `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 439 통과·8 skip(기존 418 + 신규 21). 새 파일은 Biome check 통과. 전체 `pnpm lint`·`format:check`는 기존 `.local-experiments` 중첩 Biome 설정 오류로 실행하지 못했고, build·smoke·E2E는 이번 domain 변경 범위에서 돌리지 않았다.

### [~] K03. Kiro adapter의 workspace 연결

- **선행:** K01, K02.
- **범위:** 확장이 대상 workspace의 `.kiro/`에 Steering·hook·MCP 설정을 설치·갱신·제거한다. hook 명령은 stdin JSON을 Core 이벤트로 바꾸는 Node 스크립트 하나로 통일한다. 사용자의 기존 `.kiro/` 파일을 덮어쓰지 않는다.
- **완료 조건:** 설치·제거 왕복 테스트, 기존 파일 보존 테스트, 실제 Kiro에서 hook 발동과 Core 기록 확인.
- **진행:** 개발 경로 완료. `packages/kiro-adapter/src/kiro-workspace-node.ts`(hook 입력 해석, 세션→대화 ID, hooks·MCP·Steering 생성, 기존 MCP 설정 보존 병합), `apps/local-backend/src/kiro-hook-binding.ts`(채팅 기록만 가능한 hook 전용 토큰 엔드포인트, `--kiro-hooks`), `scripts/kiro-hook.mjs`(항상 exit 0), `scripts/kiro-workspace-install.mjs`, `scripts/seed-kiro-native-demo.mjs`. 실제 Kiro에서 hook→Core 기록과 Builder MCP 연결 확인([끝단 실측](spikes/KIRO_NATIVE_E2E.md)). 남은 것: 확장 UI의 설치·제거와 사용자 동의, 기존 `.kiro/` 파일 충돌 처리. 설치물: Mac VSIX 0.2.0의 host가 Core를 `managed-kiro`로 띄우고 `vibeHelper.openInKiro`로 Project를 연결해 새 창으로 연다. 포장된 bridge·hook 사본을 쓴다. 격리 Kiro 1.2.37에서 설치부터 채팅 Decision, kiro-cli Analyst, Concept State 갱신, Discovery 미리보기까지 확인했다(약 2크레딧, [프론트 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)). 확장 업데이트 뒤 재연결 필요, MCP 첫 승인·Trust 화면 미확인.

### [~] K04. Learning Spec을 Kiro Spec으로 내보내기

- **선행:** K01 S10.
- **범위:** 확정 Learning Spec을 `.kiro/specs/<app>/requirements.md`(EARS)와 LEARNER_FOCUS·AGENT_SUPPORT·EXCLUDED 절로 렌더링하고 Kiro에서 시작하는 동작을 제공한다.
- **완료 조건:** 렌더링 snapshot 테스트, 실제 Kiro의 Spec 인식과 task 실행 확인.
- **진행:** `renderKiroSpec`(확정 Learning Spec·Task → `.kiro/specs/<slug>/` requirements·design·tasks, 문장은 옮기기만 하고 바꾸지 않음, 한글 제목은 `vibe-helper-<id>` 폴더)과 설치 스크립트의 Core 스냅샷 조회·기존 Spec 보존을 추가했다. 단위 테스트 1개, 실제 Core에서 Campus Drop Spec 생성 확인. 이번 생성 파일로 Kiro task 실행은 크레딧 때문에 아직 하지 않았다(같은 구조의 외부 Spec 실행은 K01 S10에서 PASS). 확장의 "Kiro에서 시작하기" 버튼은 K03 UI 작업과 함께 남았다.

### [~] K05. Kiro 채팅 안의 Decision

- **선행:** K01 S7·S8, K03.
- **범위:** Steering과 Builder MCP `request_user_decision`으로 Agent가 실제 Decision을 채팅에서 묻게 하고, 사용자 답은 Agent가 맥락으로 해석해 `resolve_decision_from_chat`(학습자 원문 인용 필수)으로 기록하며 Core가 인용·순서·명시 번호 모순을 검증한다. 일반 채팅 발언은 `UI_RECORD_CHAT_MESSAGE`로 USER Evidence가 된다. Agent 해석 정확도 평가 세트(정답이 있는 대화 약 20개)를 Kiro Auto로 측정한다. 패널에 같은 Decision 카드를 보여준다.
- **완료 조건:** 연결 규칙 unit 테스트, 실제 Kiro에서 Decision 요청·사용자 답·Evidence 제안까지 한 번 이어짐. 호출률이 낮으면 fallback과 한계를 기록한다.
- **진행:** 실제 Kiro에서 Decision 요청 → 학습자 자연어 답 → `resolve_decision_from_chat` 수락 → 적용까지 1회 이어짐([끝단 실측](spikes/KIRO_NATIVE_E2E.md)). Steering 0.2.0(멱등키 형식, start_task 조건). Core 부분 완료. 평가 8개 실행: 6/8 PASS, 저장된 확정 4건 모두 정확·이유 원문 유지, 실패 2건(번호 함정, 제3안)은 모두 미기록으로 끝남([평가 결과](../tests/eval/results/kiro-chat-decision-steering-0.2.0.md)). 남은 것: 패널 Decision 카드, Agent용 Core 응답 축소는 `get_build_status`(Task revision·Context 버전·열린 Decision 번호 선택지만, 최대 10개)와 Steering 0.3.0으로 Core·테스트 반영 완료(실제 Kiro 확인 남음), 제3안 처리 Steering, 세션 시작 시 열린 Decision 안내, Kiro-native 경로의 Analyst 실행. 계약 `UI_RECORD_CHAT_MESSAGE`·`BUILDER_RESOLVE_DECISION_FROM_CHAT`·`DecisionResolution.chatSource`, MCP 도구 `resolve_decision_from_chat`, domain `findExplicitOptionMentions`. 새 integration 7개·domain 7개 추가. `pnpm typecheck` 통과, unit 177 통과·3 skip, integration 453 통과·8 skip. Kiro 연결과 평가 세트는 K03 이후 진행.

### [~] K06. Helper 위치 확정과 연결

- **선행:** K01 S9.
- **범위:** Kiro 채팅에서 `/vibe-helper`(manual Steering) 또는 `inclusion: auto`로 Helper를 붙이고, 질문과 답을 Helper Episode로 기록한다. 답변 텍스트 수집 방법을 정한다. hook 접두 주입과 B(패널)는 fallback이다. Helper는 Core의 Evidence·State 변경 도구를 받지 않는다.
- **완료 조건:** Helper 대화가 HELPER_CONVERSATION Episode로 묶이고 다음 개인화에 반영됨을 실제 흐름으로 확인.
- **진행:** `/vibe-helper 질문`(manual Steering 슬래시 명령)을 hook이 Helper 질문으로 보관하고, 턴이 끝나는 Stop hook에서 hook 실행기가 Kiro 세션 기록의 마지막 Agent 답을 읽어 붙인다. Core는 기존 `UI_RECORD_HELPER_EXCHANGE`로 질문(USER)과 답 요약(AGENT/HELPER, 240자)을 HELPER_CONVERSATION Episode에 기록한다. Helper 질문은 일반 채팅 Evidence로 중복 기록하지 않는다. 실제 Kiro에서 확인(0.11크레딧). 남은 것: Helper Episode 종료 시점(현재는 Decision 확정·Task 완료 때 닫힘), `inclusion: auto` 자동 진입의 첫 승인 UX, 세션 기록 형식이 바뀔 때의 fallback(답 미확보 시 안내 문구로 기록).

### [-] K07. 포스터 핵심 장면 확보

- **보류(2026-10-09):** 포스터는 팀원과 함께 완성하므로 이 작업 목록에서 뺀다. 포스터 기간에는 K09 마무리와 K10~K12, K08을 진행한다.
- **포스터 QR(2026-10-12):** 포스터 2(Figma `posters-hurdoo2`)의 "설치 가이드" QR을 `https://github.com/Hello-KU-tty/core/blob/main/docs/DOWNLOAD_GUIDE.md`로 교체했다(디코딩 확인). 문서는 본선 Kiro-native 0.2.8 기준으로 다시 써서 main에 push했다(904c57b, ab0d1e5). 완료. "소스 저장소" QR(github.com/Hello-KU-tty/core)은 정상이다.

- **기한:** 10/11 포스터 사전 제출.
- **범위:** Kiro 채팅의 사용자 발언 → hook → Evidence → 학습자 요약 갱신 → 다음 대화 변화 중 실측된 범위를 한 장면으로 캡처한다. 실측되지 않은 부분은 목표 구조로 구분해 표시한다.
- **완료 조건:** 캡처 원본과 재현 절차, 실측·목표 구분 표기.

### [ ] K08. 본선 통합 검증과 fallback

- **기한:** 10/18 본선.
- **범위:** Discovery부터 다음 개인화까지 새 구조의 수직 흐름, 기존 패널 경로 fallback, 설치 경험, 발표 데모. Windows 0.0.19 반영(권한 거부 수정)은 Windows 호스트 작업으로 별도 판단한다.
- **완료 조건:** `pnpm check`와 실제 Kiro 흐름 기록, 알려진 한계 문서화. 데모에 쓸 Kiro 버전에서 확인 루틴(재시작 후 연결 복원, Builder 도구, Helper 탭, hook 기록)을 통과하고, 데모 기기의 Kiro 자동 업데이트를 끈다(DECISIONS "버전은 의존성이 깨지지 않는 범위만").

### [~] K09. 첫 실사용 체험 피드백 반영

- **출처:** 사용자 직접 체험(2026-10-09, Kiro 1.2.37, 개인 Builder ID)과 피드백 15건. 검토·검증 기록은 [첫 체험 기록](spikes/KIRO_NATIVE_FIRST_TRIAL_20261009.md).
- **범위:** 패널 문구·버튼·로딩(1·2·3·5, frontend), Steering 0.5.0(4·8·13: 예상 Decision은 예고로만, 구현 중 하나씩, 묻기 전 기록, 시작 전 환경 확인), 빈 현재 폴더를 Project 폴더로 등록(6), 신뢰 안내(7), Helper가 Builder 진행 상황을 보게 함(9), Vibe Helper 도구 허용 규칙(11), Kiro 채팅의 Helper 에이전트(12), 예선 전역 에이전트 정리(14).
- **완료 조건:** 관련 unit·integration·패널 테스트, VSIX 재생성, 실제 Kiro 재실측. 재실측에는 6 적용 뒤 신뢰·hook·Steering 적재 시점(7)을 다시 보는 것을 포함한다(모델 크레딧 필요).
- **진행:** 코드·문서 반영과 0.2.1 VSIX 완료(backend `0cd52c8`·`4def349`, frontend `program` `finals/trial-feedback` `c2c873c`). 자동 검사 통과(backend unit 177·integration 489, 패널 CJS 179, frontend 811, Mac 패키지 9). 패널 화면은 Chrome 1280px·360px로 확인. 모델 호출 없는 격리 Kiro 확인: 빈 현재 폴더 연결, 다시 로드 없이 Builder MCP 연결과 `vibe-helper` 에이전트 등록, 새 채팅 세션에서 hook 2개 적재. 본선 계정 재실측(2026-10-09, [재실측 기록](spikes/KIRO_NATIVE_K09_REMEASURE_20261009.md)): 처음 보는 목표·Personal Need로 Discovery부터 Task 완료까지 진행. 현재 폴더 연결, hook 기록, 환경 확인, 작업 맥락 기록, 구현이 닿은 시점의 Decision 하나와 기록 후 질문, 첫 시도 확정, Vibe Helper 도구 11회 실패 0·승인 0, 다른 탭 Helper의 진행 중 Builder 활동 사용을 확인(계정 사용량 27.03). Analyst 과대 판정 문제는 기본 모델 Sonnet 5.5(대안 Auto)와 정책 최대치 저장으로 처리했다(DECISIONS). 이 변경을 담은 0.2.2 VSIX(backend `012c664`, 0.2.1과 Core 묶음만 다름)를 만들어 격리 Kiro 1.2.56에 설치하고 Core 연결, 처음 보는 목표(Personal Need 없음)의 Discovery부터 Task 준비까지 확인했다. 화면 확인(2026-10-09~10): 사용자 클릭으로 도구 허용 동의 저장, 새 창으로 생성 폴더 열림, Helper 탭 판별과 Core 기록을 확인했다. 이때 `vibe-helper` 에이전트가 도구를 받지 못하는 문제(파일에 `tools` 없음)와, 도구를 연 뒤 taskId를 빼 Core가 거절하는 문제를 찾아 0.2.3(backend `7df50ec`)에서 고쳤다. 사용자 결정으로 Helper는 읽기 권한만 갖는다(DECISIONS, Steering 0.5.1). 0.2.3에서 Codex 화면 조작으로 모드 목록의 `vibe-helper` 선택, 도구 8개, `get_helper_context` 성공, 승인 창 0회를 확인했다. 이어서 찾은 연결 끊김 문제(Core가 연결을 메모리에만 두어 Kiro 재시작·업데이트·충돌 뒤 hook이 발언을 버리고 MCP가 `BRIDGE_BINDING_REVOKED`)는 사용자 승인으로 0.2.4(backend `2b0487a`)에서 고쳤다: Core 시작 때 연결 복원, bridge가 같은 폴더·역할의 새 연결을 따라감, 끊긴 동안의 학습자 발언 큐(DECISIONS 2026-10-10, Steering 0.5.2). Codex 실측으로 Kiro 재시작+업데이트 뒤 다시 연결 없이 Builder·Helper 도구와 hook 기록, 열린 창 다시 연결 뒤 다시 로드 없는 호출, Core에 닿지 못한 발언의 큐 보존과 1회 기록을 확인했다. 남은 것: 우리 신뢰 안내 알림의 실제 화면, Sonnet 5.5 Analyst 실제 실행, Kiro 1.2.56에서 구현이 들어가는 Builder 턴, 잠자기 뒤 Core 재시작의 실제 발생 여부.

### [~] K10. Kiro 채팅 Builder 워크플로 재설계

- **출처:** 체험 피드백 10. Vibe Helper 도구 호출 25번 중 9번 실패(형식 3, 순서 3, 인용 글자 깨짐 1, 모드 2). 학습자의 실제 이유가 Decision 기록 전 발언이라 버려져 판단 근거 Evidence가 하나도 남지 않았다.
- **진행 방식:** 현재 Builder 도구·순서·Core 검증 규칙을 한 장으로 정리해 사용자에게 보여 주고, 사용자가 재설계한다. 정리 전에는 Core Builder 계약을 바꾸지 않는다.
- **검토 거리(초안):** Kiro 채팅용 도구 수와 입력 축소(식별자·버전·멱등키를 서버가 채움), 이유 인용을 글자 복사 대신 hook이 받은 메시지 ID로, Decision 요청 직전 발언의 근거 인정 여부, 작업 맥락과 완료 단계 자동화.
- **완료 조건:** Kiro 채팅 도구 계약과 Core 연결·판정 규칙의 unit·integration 테스트, Analyst 평가 기존 16개 회귀 없음과 놓침 사례, 채팅 Decision 평가 재실행, 실제 Kiro에서 Builder·Helper 탭 흐름 1회, VSIX 재생성.
- **진행:** 현재 상태 한 장 정리 완료(2026-10-09, backend `012c664`·Steering 0.5.0 기준): [Builder 워크플로 정리](spikes/KIRO_NATIVE_BUILDER_WORKFLOW_20261009.md). 재설계 결정(2026-10-10, 사용자 승인): DECISIONS "Kiro 채팅 Builder 워크플로 재설계(K10)"와 [발언 예시·도구 계약](spikes/KIRO_NATIVE_BUILDER_REDESIGN_20261010.md). PROJECT_BRIEF §0 Builder 문장을 고쳤다. 구현은 K11과 겹치지 않게 worktree `finals/k10-builder-redesign`에서 한다. 구현·자동 검사 완료(2026-10-10): Kiro 채팅 도구 5개(`check_progress`·`save_progress`·`ask_choice`·`save_choice`·`finish_task`, 입력 schema 29.1KB→5.0KB), 학습자 발언 연결(요청 전·Helper 탭), 선택 바꾸기(새 Decision, 마이그레이션 없음), 좁힌 번호 검사, 완료 사전 검증·`CHANGED_BY_DECISION`, Builder 채팅 턴 기록, Evidence 정책, Steering 0.6.0, Analyst 1.1.0. typecheck 0, unit 177, integration 519, eval 45, 패널 CJS 182. Analyst 1.1.0 평가 완료(2026-10-11, Sonnet 5.5): K10 11개 1차 10/11, 형식 오탐 1개를 Core 인용 규칙으로 고친 뒤 통과, 기존 16개 회귀 15/16(1.0.8은 14/16), 9.01크레딧([결과](../tests/eval/results/evidence-analyst-v1.1.0-k10.md)). 실제 Kiro 확인 완료(2026-10-11, K11과 합친 0.2.7): 채팅 Decision 평가 11/13, 실제 흐름은 학습자 발언 세 번으로 Task 완료와 DEMONSTRATED 판단 Evidence까지 이어짐, Vibe Helper 도구 Core 거절 0·승인 창 0([기록](../tests/eval/results/kiro-chat-decision-k10.md)). 실측에서 활성 Decision 상한 버그(10→30, 명시 오류)와 Steering 0.6.1(직접 낸 안)을 고쳤다. 이 단계 약 22크레딧. `main` 통합(2026-10-11, 사용자 지시로 브랜치를 `main` 하나로): frontend Windows 실측에서 나온 두 문제(완료 뒤 이어서 만들기 경로 없음, 늦은 신뢰 창의 다시 로드 안내 없음)와 학습자 언어 규칙을 고쳤다(Steering 0.6.2, DECISIONS "Kiro 채팅에서 완료 뒤 이어서 만들기와 늦은 신뢰 다시 로드"). Mac 0.2.7을 `main`(backend `5f1257c`, frontend `88275f6`)으로 다시 빌드해 `releases/macos/kiro-native/`에 올렸고, 실제 Kiro에서 완료 뒤 요청 → 후속 Task → 학습자 답 연결 → 완료를 확인했다(채팅 약 5.8크레딧). 남은 것: 별도 Helper 탭 실측(화면 조작 필요), Windows 0.2.7(K13).

### [~] K11. 셸 명령 자동 허용 정책

- **출처:** 체험 피드백 13. Autopilot에서도 셸 명령은 매번 확인했다(16번, 모두 이번만 허용).
- **검토 거리:** Kiro 권한 규칙(명령 앞부분 기준 항상 허용, 작업 공간 범위)과 우리가 미리 넣을 수 있는 범위, 위험 낮은 명령 목록, 사용자 동의와 끄기, 공개 문서가 아닌 내부 형식 의존 위험.
- **결정(사용자, 2026-10-10):** 개발 명령 목록 B안, 선택지는 "개발 명령 미리 승인"과 "수동으로 승인" 두 개([DECISIONS](DECISIONS.md) "본선: 개발 명령 미리 승인(K11)").
- **진행:** 모델 호출 없는 Kiro 판정으로 규칙을 확인했다([셸 승인 실측](spikes/KIRO_NATIVE_SHELL_APPROVAL_20261010.md)): 실제 체험 명령 기준 첫 체험 16→1번, 재실측 9→6번(남은 것은 모두 `rm -rf`·`kill`), 위험 명령 39개는 계속 묻기. 구현: adapter `KIRO_PREAPPROVED_RULES`·`applyKiroCommandApproval`(Kiro 모양 파일만 고침, 수동 전환 때 우리 항목만 제거), Core 연결 요청 `approval`과 `POST /api/kiro/approval`(연결된 모든 Project 폴더에 적용), host 확인 창 두 선택지와 **Vibe Helper: Change Command Approval**. 검증(Node 24.19.0): adapter 단위 테스트 포함 `pnpm typecheck` 통과, unit 177 통과·3 skip, integration 503 통과·8 skip, 패널 CJS 185 통과·2 skip(같은 창 연결 뒤 신뢰 안내 포함), Mac 패키지 9 PASS, 바꾼 TS 파일 Biome 통과(전체 `format:check`·`lint`는 기존 `.local-experiments` 중첩 설정 오류로 실행 전에 멈춤). Mac VSIX 0.2.7(미배포, K10과 함께 배포 예정)을 격리 Kiro 1.2.56에 설치하고, 처음 보는 목표의 새 Project를 빈 폴더에 연결해 설치된 Core에서 미리 승인 → 수동 → 미리 승인 왕복, 같은 요청 반복 시 변화 없음, 다른 Project 폴더의 학습자 규칙 보존, Core가 쓴 파일의 Kiro 판정이 단위 테스트 출력과 같음을 확인했다. Codex 화면 조작으로 확인 창 두 선택지와 문구, 바꾸기 명령의 알림과 규칙 제거·복원을 확인했다. 본선 계정 Builder 구현 턴(Autopilot, Default 모드)에서 셸 명령 5번이 모두 승인 요청 없이 실행됐고(첫 체험은 16번 모두 승인), Vibe Helper 도구 14번도 승인 창이 없었으며, 구현 중 Decision 2개, 이유 원문 확정, Task 완료, 테스트 21개 통과까지 이어졌다(채팅 10.13크레딧). 실측 중 같은 창 연결 때 신뢰 안내가 없는 빈틈을 찾아 host를 고쳤다(신뢰되지 않은 폴더에서는 미리 승인이 효과가 없다). 신뢰 직후 다시 로드 제안 알림은 실제 화면에서 확인했다(K09 남은 확인).
- **남은 것:** Windows의 PowerShell 판정(frontend 실측), 같은 창 연결 뒤 신뢰 안내의 실제 화면(늦은 신뢰 다시 로드 포함, Windows 0.2.7 확인 8). 프론트 인계 문서 갱신과 Mac 0.2.7 배포는 끝냈다(2026-10-11).

### [~] K13. Windows 설치물 (frontend 담당)

- **출처:** 사용자 지시(2026-10-10). 본선에는 Windows 지원이 포함되고, Mac은 backend, Windows는 frontend가 빌드·확인·업로드한다.
- **backend 몫(완료):** host·Core·hook·bridge의 Windows 지원과 공통 포장 스크립트(`pnpm panel:pack:kiro-windows`), Windows를 흉내 낸 테스트, [핸드오프의 Windows 절차](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서).
- **완료 조건:** frontend가 Windows 11 x64에서 0.2.5 이상 VSIX를 빌드하고 핸드오프의 확인 1~7을 통과해 `releases/windows/kiro-native/`에 올린다. Windows 문제는 frontend가 PR로 고쳐도 되고(관련 테스트 실행, macOS 영향은 PR에 명시), backend가 검토해 Mac 설치물에도 반영한다. 직접 고치기 어려운 것은 보고하면 backend가 고친다.
- **진행:** frontend가 0.2.6을 Windows 11 실기기에서 확인 1~7 통과로 올렸다(2026-10-10~11, 사용자 위치 kiro-cli와 사적 AppData 수정 포함). 2026-10-11 `main` 통합 뒤 0.2.7(K10·K11·완료 뒤 이어서 만들기·늦은 신뢰 다시 로드)을 `main`에서 빌드하고 확인 1~10을 거쳐 올려 달라고 요청했고, frontend가 backend `4c6362c`·frontend `88275f6`으로 빌드해 확인 1~10을 통과(9·10은 조건부)하고 올렸다(2026-10-11, [0.2.7 Windows 확인](FRONTEND_KIRO_NATIVE_HANDOFF.md#027-windows-확인-2026-10-11)). 조건부 두 건(첫 Builder 턴이 선택을 열지 않음, 후속 Task의 `finish_task` 누락·첫 거절)은 K14에서 고쳤다. `scripts/test-portable-core.mjs`가 Kiro 1.2.56(Electron 44, Node 24.21, ABI 149)의 Kiro 런타임 단계에서 `RUNTIME_PROBE_REJECTED`로 실패한다. 본선 host는 Core를 실제 Node로만 띄우므로 이 단계를 본선 기준으로 바꿀지 결정이 남았다.

### [~] K14. Builder가 묻는 기준과 후속 Task 완료 (Windows 0.2.7 확인 후속)

- **출처:** frontend Windows 0.2.7 확인(2026-10-11)의 backend 검토 두 건. 첫 Builder 턴이 선택을 열지 않음(0.2.6 2차와 같음), 후속 Task에서 `finish_task` 누락과 이전 기준 키로 인한 첫 거절.
- **결정:** [DECISIONS](DECISIONS.md) "본선: Builder가 학습자에게 묻는 기준"(사용자 결정, 2026-10-12). 애매하면 묻는다.
- **범위:** Steering 0.7.0, kiro-adapter가 에이전트 담당 영역 전달, `save_progress`·`ask_choice` 응답의 `followUpTask`, 기준 키를 밝히는 완료 거절.
- **완료 조건:** adapter·Core·연결 테스트, 기존 unit·integration·eval·패널 회귀 없음, 실제 Kiro에서 처음 보는 목표로 첫 Builder 턴(예상 Decision을 구현 중 하나씩 묻는지, 시작 때 몰아 묻지 않는지, 에이전트 담당 선택을 밝히는지)과 후속 Task 완료(첫 `finish_task` 성공), Mac VSIX 재생성.
- **진행:** 구현과 자동 검사 완료(2026-10-12, Node 24.19.0): `pnpm typecheck` 통과, unit 177 통과·3 skip, integration 528 통과·9 skip, eval 46 통과·1 skip, 패널 CJS 187 통과·2 skip, `scripts/test-macos-package.mjs` 9 PASS, 바꾼 파일 Biome 통과. 실제 Kiro 확인 완료([기록](../tests/eval/results/kiro-builder-ask-k14.md), 시험 VSIX, 약 16크레딧): 예상 Decision이 없는 처음 보는 목표에서 "만들기 시작해줘" → 학습 목표 영역의 선택 두 개를 코드 직전에 하나씩 물음 → 완료, 후속 요청 두 번도 하나씩 물음, 후속 Task의 첫 `finish_task` 성공. 실측에서 Builder가 규칙·영역 이름을 학습자에게 말해 Steering 문구를 고치고 다시 확인했다. Mac 설치물 0.2.8에 들어갔고 Windows 0.2.8 빌드를 frontend에 요청했다(2026-10-12, K15와 함께). 남은 것: 예상 Decision이 있는 Spec의 첫 턴 실측(이번 Discovery는 비워 둠).

### [ ] K12. 크레딧 사용 측정과 절감

- **출처:** 체험 피드백 15. 채팅 18.16크레딧 중 10.13은 앱 전체 구현 한 턴(모델 호출 46번)이었고, Vibe Helper 처리 몫은 약 4~5크레딧으로 추정했다.
- **검토 거리:** 같은 과제를 Vibe Helper 연결 유무로 비교 측정, Steering·도구 설명 크기, 실패 재시도, 채팅 밖 kiro-cli 실행(Discovery·Helper·Analyst) 비용.

### [x] K15. Next Move(다음 한 걸음)

- **출처:** 사용자 결정(2026-10-12). Final Upgrade가 본선 경로에 없다는 확인에서 시작했다.
- **결정:** [DECISIONS](DECISIONS.md) "본선: Final Upgrade 대신 Next Move(다음 한 걸음)", [SPEC 5.8.1](SPEC.md#581-next-move다음-한-걸음).
- **선행:** K14(Builder가 묻는 기준과 후속 Task 완료) 구현(`0d72da4`). 같은 후속 Task·`save_progress` 응답 영역을 고친다.
- **범위:** Core(job 생성·lease·재시도·검증, 조회·다시 만들기, 고른 번호 연결과 후속 Task provenance), storage migration 0008, WorkflowRuntime의 별도 Next Move worker(Analyst와 동시 실행), local-backend `NEXT_MOVE` mode, `discovery.md` Next Move 절, Steering(완료 한 줄 안내, 물을 때만 전달, 번호 넘기기), Helper context, 패널 카드(frontend 담당, 조회 계약 인계), Mac VSIX.
- **완료 조건:** domain·application unit·integration(완료당 job 하나, Analyst와 동시 실행, 재시도·실패, 늦은 결과 거절, 번호 연결과 모순 거절, 지난 것 처리, Evidence·Concept State 불변), 기존 DB를 보존하는 migration 테스트, Next Move 평가 fixture(처음 보는 목표 2개와 Campus Drop, Personal Need 유무, 이미 한 방향 반복 금지, 로컬 실행 제약)와 prompt 버전·결과 기록, 기존 unit·integration·eval·패널 회귀 없음, 실제 Kiro에서 Task 완료 → 패널 생성 중 → 후보 → 학습자 번호 발언 → 후속 Task 완료 → 새 후보 1회와 완료부터 후보 저장까지 시간(목표 30초, Analyst 동시 실행 상태), 패널 데스크톱·좁은 화면 확인, Mac VSIX 재생성.
- **기한:** 내부 10/18, 본선 발표 10/19 전.
- **진행:** backend 구현과 자동 검사 완료(2026-10-12, Node 24.19.0): 계약(`next-move.ts`, Task `nextMove`, Kiro 채팅 `nextMove`, Helper context, `UI_READ_NEXT_MOVE`·`UI_RETRY_NEXT_MOVE`, worker용 `NEXT_MOVE_*`), domain 전이·view·번호 판정, migration 0008, Core(완료 때 job, lease·회수·재시도·실패, 최신 Task가 아니면 닫기, 고른 번호 검증과 후속 Task provenance), kiro-adapter `NextMoveJobAdapter`, Analyst와 따로 도는 Next Move worker, local-backend `NEXT_MOVE` mode, Discovery prompt 1.4.0(NEXT MOVE turn), Steering 0.8.0. `pnpm typecheck`·`db:check` 통과, unit 177 통과·3 skip, integration 542 통과·9 skip(새 Next Move 14개 포함), eval 47 통과·1 skip, 패널 CJS 187 통과·2 skip, 바꾼 파일 Biome 통과(기존 `application-service.ts` 287행 지적 1건 제외). 제품 경로 실측([결과](../tests/eval/results/next-move-v1.4.0.md)): Task 완료부터 후보 저장까지 7.2~9.3초, 동시에 돈 Analyst 7.4~9.7초, 4번 모두 첫 시도 READY, 회당 약 0.036크레딧. 패널 카드는 frontend 저장소 `feat/next-move-card`(`6a6a557`, `main`에서 분기)에 backend가 구현했다(사용자 결정, 2026-10-12): 빌더 탭의 생성 중 한 줄·후보 3개와 Kiro 채팅 안내·실패와 "다시 만들기", Kiro-native에서 Final Upgrade 숨김, 생성 중 1.5초·그 밖 4초 간격 다시 읽기, `vendor/frontend-client`를 backend `main`으로 갱신. frontend typecheck 통과, `npm test` 828 통과(새 10개), headless Chromium 1280·420·300px 미리보기에서 가로 넘침·콘솔 오류 없음. Mac 설치물 0.2.8(backend `10eaafb`, frontend `6a6a557`, 두 checkout 깨끗함, 포장 검사 9 PASS)을 실제 Kiro에서 확인했다([결과](../tests/eval/results/next-move-v1.4.0.md#실제-kiro-확인-028-2026-10-12)): 기존 K14 DB가 0008로 올라가며 기록 유지, Task 완료 → 패널 생성 중(1.9초) → 후보 3개(9.8초) → 학습자 질문에 Builder가 같은 후보 전달 → "2번 해 보자"로 후속 Task(출처 보존, 카드 사라짐) → 완료 → 고른 것을 반복하지 않는 새 후보(10.3초). job 8.3·8.9초, 같이 돈 Analyst 7.8·6.5초, 약 7.5크레딧. Windows 0.2.8은 frontend가 `feat/next-move-card`를 `main`에 합친 뒤 빌드한다([인계](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows-028-빌드-요청-frontend)). 알려진 점: Builder가 크기를 영어 값("SMALL")으로 전함, 실패·다시 만들기는 실제 화면이 아니라 테스트로만 확인.

### [ ] K16. 첫 후보 화면에서 바구니 없이 방향만 적어 보완하기

- **출처:** 사용자 직접 체험(2026-10-12, 체험 빌드 backend `57ef752`·frontend `88275f6`). 처음 받은 후보 10개 화면에서 바구니를 비운 채 방향을 적고 "보완하기"를 누르자 "요청을 처리하지 못했습니다. 다시 시도해 주세요."가 떴다. 사용자 판단: 마음에 드는 후보가 없을 때 방향만 적어 요청하는 것도 정상 사용이다.
- **원인:** 첫 화면의 후보는 미리보기뿐이고 Core에는 후보 라운드가 아직 없다. Core는 피드백이 가리키는 후보를 채워 첫 라운드를 만들 수 있을 때만 받는다(`#recordDiscoveryFeedback`의 `canMaterializeReferencedPreviews`, 대상 1개 이상 필요). 패널은 글만 있는 보완을 대상 없는 `REGENERATE`로 보내고 그 전에 라운드를 준비하지 않아 `DISCOVERY_ROUND_NOT_CURRENT`로 거절된다. 패널은 이 코드를 몰라 일반 문구를 보인다. 모델 호출 전 거절이라 크레딧은 쓰지 않는다. 입력 없이 누르는 `MORE`는 먼저 `ENRICH_ALL`로 라운드 1을 만들므로 통과하고, 라운드가 생긴 뒤에는 글만 적어도 통과한다. 0.2.7 배포본에도 같은 문제가 있다(frontend `c2c873c`부터 보완 버튼이 하나). frontend 테스트는 라운드가 이미 있는 상태만 다뤘다.
- **재발(2026-10-13):** 0.2.9 체험 프로필(`kiro-user-trial-20261012`, 새 목표 "그래픽을 만져보고 싶어")에서 같은 조작으로 다시 실패했다. 0.2.9에는 K16 수정이 들어가지 않았다. Core에는 미리보기 라운드(11:31:25 KST)만 있고 후보 라운드·피드백 기록은 없다.
- **재현:** 모델 호출 없는 Core 테스트에서 미리보기만 있는 상태의 대상 없는 `REGENERATE`는 `DISCOVERY_ROUND_NOT_CURRENT`, 후보 1개를 채운 뒤 `REVISE`는 통과, 라운드 1이 생긴 뒤 대상 없는 `REGENERATE`는 통과.
- **범위(초안):** 미리보기만 있는 상태에서 바구니 없이 글만 적은 보완이 새 후보 라운드로 이어지게 한다(패널이 먼저 라운드를 준비할지, Core가 미리보기 상태의 대상 없는 피드백을 받을지는 구현 전에 정한다). 크레딧이 덜 드는 쪽을 우선한다. 알 수 없는 오류 코드도 쓸 수 있는 안내로 보인다.
- **완료 조건:** 미리보기 상태의 대상 없는 보완을 다루는 Core integration·frontend 테스트, 기존 Discovery 회귀 없음, 실제 Kiro 패널에서 첫 화면 → 방향만 적어 보완하기 → 새 후보 1회, Mac VSIX 재생성.

### [~] K17. 직접 체험 후속: 선택 위조 방지, 중단된 턴, 시작 흐름과 패널 정리

- **출처:** 사용자 직접 체험(2026-10-12, 체험 빌드 backend `57ef752`·frontend `88275f6`, Kiro 1.2.56)과 Kiro 세션 기록·체험 Core DB 분석.
  - Builder(Kiro Auto)가 자기 답변 끝에 학습자 차례를 지어내고("user2번으로 가자") 바로 `save_choice`를 불렀다.
  - Core는 질문 뒤 Builder 탭 학습자 발언이 하나라도 있으면 기록을 받는다. 그래서 잠금 방식 Decision이 학습자 선택으로 남았고, 그 위에 "SQLite Locking: 설명함" Evidence가 섰다.
  - 두 번째로 지어낸 답은 같은 턴이라 거절됐지만, Builder는 멈추지 않고 구현을 이어 갔다.
  - 같은 체험에서 나온 문제:
    - 중단된 턴의 Builder 답이 Core에 들어가지 않는다.
    - 신뢰 전에 만들어진 채팅 세션이 Supervised로 남는다.
    - 패널이 하단 패널 전체를 채팅 자리로 옮긴다.
    - `/vibe-helper`가 두 개로 보인다.
    - Builder가 완료 뒤 서버를 끄고 데이터를 지운다.
    - 패널이 채팅 중에 무엇을 보여 줄지 흐리다.
- **결정(사용자, 2026-10-12):**
  - Core 판정을 "가장 최근 발언만 답"처럼 좁히지 않는다. 위조는 Steering으로 막는다.
  - 위조는 형태가 다양하다. 그래서 학습자가 "내가 고른 게 아니다"라고 하면 되돌리는 경로를 둔다.
  - 미리 승인 목록에 브라우저 열기를 더한다.
  - 고친 뒤 Next Move를 포함한 버전으로 다시 빌드한다.
  - 나머지는 분석 때 낸 제안을 따른다. 구현 전에 DECISIONS(필요하면 SPEC)에 기록한다.
- **범위와 순서:**
  1. **선택 위조 방지(Steering 0.9.0):**
     - 선택지를 보여 준 응답은 질문으로 끝낸다. 학습자의 말이나 차례는 어떤 형태로도 쓰지 않는다.
     - 질문 뒤 학습자가 다시 묻거나 설명을 정리한 것은 선택이 아니다.
     - `save_choice`가 거절되면 그 선택에 기대는 구현을 멈추고, 다시 물은 뒤 턴을 끝낸다.
  2. **선택 되돌리기(Core·Steering):**
     - 학습자가 기록된 선택을 자기가 고르지 않았다고 하면(말투 무관), Builder가 기존 `save_choice`로 알린다. 새 도구는 만들지 않는다.
     - Core는 그 해결을 "학습자 확인 안 됨"으로 무르고 Decision을 다시 연다. 그 선택을 출처로 쓴 Evidence를 빼고 Concept State를 다시 계산한다.
     - Builder는 다시 묻고, 답에 맞게 코드를 고친다.
     - 되돌리기는 상태를 낮추는 쪽이다. 그래서 Core는 해결 뒤 Builder 탭 학습자 발언이 있는지만 확인한다.
     - Core에는 지금 Evidence를 빼는 상태가 없다. 계약과 저장소 변경을 SPEC·DECISIONS에 먼저 정한다.
  3. **중단된 턴 기록(hook·Core):**
     - Kiro는 중단된 턴에 Stop hook을 부르지 않는다. 대신 세션 기록에 `turn_end stopReason: "cancelled"`를 남긴다.
     - 다음 UserPromptSubmit에서 hook이 이 기록을 읽는다. Stop hook이 이미 쓰는 `lastAssistantReply` 경로를 재사용한다.
     - 직전 턴이 중단으로 끝났으면 그 턴의 Builder 답을 "중단됨" 표시와 함께 새 학습자 발언보다 먼저 기록한다. Kiro 실행 ID로 한 번만 기록한다.
     - 다음 정상 Stop까지 미루면 학습자의 다음 발언보다 뒤에 기록돼 순서가 틀어진다.
     - 중단된 `/vibe-helper` 질문이 다음 Builder 턴의 답과 짝지어지는 문제도 같이 고친다.
  4. **미리 승인과 Autopilot(host·adapter):**
     - "개발 명령 미리 승인"을 고르면 `kiroAgent.agentAutonomy`를 Autopilot으로 쓴다. 연결 뒤에는 `kiroAgent.newSession`(채팅 + 버튼과 같은 Kiro 명령)으로 새 세션을 열어, 지금의 "+ 새 세션" 안내를 대신한다.
     - 새 세션이 필요한 이유: 신뢰 전에 창이 열리면 Kiro가 3초 안에 세션을 만든다. 신뢰 뒤 다시 로드해도 그 세션을 그대로 불러와서 Supervised로 남는다. 체험 기록: 01:10:35 `session/new`(신뢰 전), 11:26:39 `session/load`.
     - "수동으로 승인"은 손대지 않는다. Kiro가 기억한 학습자의 마지막 모드 선택이 있으면 그쪽이 이긴다.
     - 미리 승인 목록에 다음을 더한다.
       - Mac: `open http://localhost:*`, `open http://127.0.0.1:*`
       - Windows: `Start-Process http://localhost:*`, `start http://localhost:*`
       - `*@*` 형태는 뺀다.
  5. **완료 뒤 서버 켜 두기(Steering):**
     - 마지막 확인 뒤 개발 서버를 끄지 않고, 학습자가 볼 데이터를 지우지 않는다.
     - 브라우저로 앱을 열어 주고 주소를 한 줄로 알린다.
     - 서버는 미리 승인에 걸리는 형태로 띄운다. 예: `PORT=3100 npm start`처럼 앞에 환경 변수를 붙이지 않는다.
  6. **`/vibe-helper` 하나로(adapter):**
     - 체험 기록상 두 번째 `/vibe-helper`(11:31)는 Helper 지침 없이, 같은 Builder 세션의 같은 에이전트(`chat-agent`)로 실행됐다.
     - 슬래시 메뉴에서 봇을 고르면 Helper 에이전트로 넘어가는지 실제 Kiro에서 확인한다.
     - 넘어가지 않으면 `.kiro/agents/vibe-helper.json`을 더는 쓰지 않고, 다시 연결할 때 지운다. md 하나만 남긴다. DECISIONS 2026-10-09 "Kiro 채팅 Helper 에이전트"를 고친다.
  7. **패널(frontend 저장소 기능 브랜치, frontend가 합침):**
     - **터미널 이동 문제:**
       - `revealAgentPanelOnRight`에서 하단 패널 전체를 옮기는 `movePanelToSecondarySideBar` 대체 경로를 없앤다.
       - Kiro에 있는 `vscode.moveViews`로 우리 뷰 하나만 옮긴다. 목적지 container는 실측으로 정한다.
       - 이미 옮겨진 터미널을 되돌리는 방법은 구현 전에 정한다.
     - **Kiro-native 빌더 탭:** 채팅에 없는 것만 보인다.
       - 지금 상태 한 줄(진행 중 Task, 기다리는 선택 하나)
       - 이번 Task에서 새로 인정된 학습 근거
       - 완료 뒤 Next Move 카드
       - 한 줄씩 접은 결정 목록
     - **Discovery·Spec:**
       - 로딩 중에 예상 시간에서 1초씩 줄어드는 카운트다운을 보인다. 예상 시간을 넘기면 "조금 더 걸리고 있어요"로 바꾼다. 예상 시간은 실측으로 정한다(빈 입력 보완하기 약 2분).
       - Spec 맨 위 '이대로 시작'을 없애고 footer에만 둔다.
  8. **0.2.9 빌드:**
     - `main`(K15 Next Move 포함)으로 Mac VSIX 0.2.9를 만든다.
     - 체험 환경(`experiments/kiro-user-trial-20261012`)을 DB를 보존하며 올린다.
     - Windows 0.2.9는 frontend에 요청한다.
- **완료 조건:**
  - **평가:** 채팅 Decision 평가 재실행. 새 fixture: 질문 뒤 곁가지 질문이나 설명 정리만 있을 때 기록하지 않음, 거절 뒤 멈춤, 되돌리기. Steering 버전과 결과를 기록한다.
  - **Core:** 되돌리기 unit·integration(Decision 다시 열림, 연결 Evidence 제외, Concept State 재계산, 되돌린 뒤 다시 기록). 스키마가 바뀌면 기존 DB를 보존하는 migration 테스트.
  - **hook:** 세션 기록 파싱 unit(정상 종료·중단·오류 종료), 연결 integration(기록 순서, 한 번만 기록, 중단된 Helper 질문).
  - **host·adapter:** 미리 승인 때 설정과 새 세션, 수동 승인 때 변화 없음. 새 허용 규칙의 Kiro 판정(`*@*`와 묶인 위험 명령은 계속 묻기).
  - **회귀:** 기존 unit·integration·eval·패널 CJS 회귀 없음. frontend 테스트와 1280·420·300px 화면 확인.
  - **실제 Kiro(Mac 0.2.9) 1회:**
    - 새 폴더 신뢰 → 미리 승인 → 새 세션이 Autopilot
    - 선택 질문 뒤 곁가지 질문에 기록하지 않음
    - "내가 고른 게 아니야"로 되돌린 뒤 다시 고름
    - 턴 중단 뒤 다음 발언에서 중단된 답이 기록됨
    - 긴 명령 중 채팅이 터미널로 바뀌지 않음
    - `/vibe-helper` 한 개
    - 완료 뒤 서버가 켜져 있고 브라우저가 열림
    - 패널에 Next Move
- **진행:**
  - **1·2 구현과 자동 검사 완료(2026-10-12, Node 24.19.0):**
    - 결정 기록: DECISIONS "학습자 선택 위조 방지와 되돌리기(K17)", SPEC `FR-DEC-007`.
    - Steering 0.9.0: 질문으로 끝내기, 학습자 말 대신 쓰지 않기, 곁가지 질문은 답이 아님, 거절 뒤 멈춤, `"not_mine"`.
    - `save_choice`의 `"not_mine"`과 `UNDONE` 응답.
    - Core 되돌리기: 진행 중이면 다시 열기, 결정 이력 유지, `USER_DECISION`을 출처로 쓴 이해 Evidence 빼기, Concept State 재계산(근거가 없으면 Core 관찰로 OBSERVED), 해결한 오해 issue 다시 열기, 늦게 온 분석 거절.
    - migration 0009(`decision_disputes`·`evidence_withdrawals`).
    - 검증: `pnpm typecheck`·`db:check` 통과, unit 177 통과·3 skip, integration 548 통과·9 skip(새 6개: 되돌리기 3, reducer 1, 정책 1, 0008→0009 migration 1), eval 47 통과·1 skip, 패널 CJS 187 통과·2 skip. 바꾼 파일 Biome는 원래 있던 지적 3건(`useTemplate` 1, import 순서 2)만 남음.
  - **3~8 구현과 자동 검사 완료(2026-10-12):**
    - 중단된 턴: hook binding이 다음 프롬프트 때 Kiro 세션 기록의 `turn_end`(정상 종료 아님, Stop hook 기록 없음)를 읽어 그 턴의 Builder 답을 `interrupted`로 먼저 기록한다. Kiro 실행 ID 멱등키로 한 번만 기록하고, 멈춘 `/vibe-helper` 질문은 다음 Builder 답과 짝짓지 않는다.
    - 미리 승인: Kiro 설정 `kiroAgent.agentAutonomy`를 Autopilot으로 쓰고, 막 연결했거나 신뢰한 폴더에서 `kiroAgent.newSession`으로 새 세션을 연다. 브라우저 열기·`lsof *`·메서드가 붙은 로컬 `curl`을 미리 승인한다. 0.2.7~0.2.8 규칙은 다시 연결할 때(`UPGRADE`) 새 목록으로 바뀐다.
    - `/vibe-helper` 하나: Helper 에이전트 파일을 더 쓰지 않고, 예전에 쓴 것은 지운다.
    - Steering 0.9.0: 완료 뒤 서버를 켜 두고 브라우저로 연다.
    - 패널(frontend `feat/k17-panel`): 하단 패널 이동 제거와 배치 되돌리기 안내, Kiro-native 빌더 탭 정리(상태·이번 작업의 학습 기록·다음 한 걸음·결정 줄), Discovery·Spec 남은 시간, Spec 시작 버튼 하나. `feat/next-move-card`·`feat/reload-required-notice`를 합쳐 둠(`4906b36`).
    - 결정 기록: DECISIONS "체험 후속 정리(K17)".
  - **실제 Kiro 확인과 0.2.9(2026-10-12):** 격리 프로필(Kiro 1.2.56, 0.2.8에서 업그레이드, 신뢰 켬)에서 계획의 실측 항목을 모두 봤다(결과는 [인계 0.2.9 확인](FRONTEND_KIRO_NATIVE_HANDOFF.md#029-확인-2026-10-12-mac)). 실측에서 버그 세 건을 찾아 고쳤다.
    - 다른 막는 선택이 열려 있으면 되돌리기·선택 바꾸기가 거절됨 → `372628b`.
    - 대체된 결정 때문에 완료한 Task가 '결정이 있어요'로 보임 → frontend `b4b8831`.
    - Next Move 한 줄 길이 초과로 두 번 다 실패 → `3721a76`.
    - Mac 0.2.9(backend `3721a76`, frontend `4906b36`, 두 checkout 깨끗함, 포장 검사 9 PASS)를 `releases/macos/kiro-native/`에 넣었다.
    - 최종 검사: unit 177 통과·3 skip, integration 552 통과·9 skip, eval 47 통과·1 skip, 패널 CJS 187 통과·2 skip, frontend 838 통과.
    - 이 단계 약 14.4크레딧(계정 누적 144.18).
  - **남은 것:**
    - 채팅 Decision 평가 재실행: 새 fixture(곁가지 질문, 거절 뒤 멈춤, 되돌리기). 실제 Kiro 흐름에서는 각 한 번씩 확인했다.
    - 새 미리 승인 항목(`lsof`, 메서드 `curl`)의 Kiro 판정.
    - frontend의 `feat/k17-panel` 합치기와 Windows 0.2.9 빌드. 요청은 [0.2.9 프론트 인계](FRONTEND_HANDOFF_0.2.9.md).
    - 배치 되돌리기 안내를 놓치면 다시 묻지 않는다(체험 프로필, 2026-10-13). `offerLayoutRepair`가 답을 받기 전에 `vibeHelper.layoutRepairOffered`를 저장한다. 업그레이드 뒤 아무도 보지 않던 00:11 창에서 안내가 지나갔고, 0.2.7이 옮긴 `terminal` 등의 위치(`views.customizations` 2=보조 사이드바)가 남아 터미널이 채팅을 덮었다. 답(또는 닫기)을 받은 뒤에만 저장하도록 고친다. 새로 설치한 프로필은 해당 없음.
  - **push와 체험 환경(2026-10-13):** backend `main`과 frontend `feat/k17-panel`(`4906b36`)을 push했다. 체험 환경을 0.2.9로 올렸다. 올리기 전 Core DB·`.kiro`·권한 파일은 `backup-before-0.2.9/`에 두었다. 다시 열 때 migration 0009, Steering 0.9.0, 도우미 에이전트 파일 삭제, 미리 승인 규칙 갱신이 일어났고 기록(이벤트 47개, 완료 Task 1개)은 그대로다. 이미 미리 승인을 고른 설치라 Autopilot은 저절로 켜지지 않는다(인계 "알려진 제한").

### [~] K18. Windows 0.2.9 확인 후속: 이름으로 node 종료, Core 재시작, Workflow 위임

- **출처:** frontend Windows 0.2.9 확인(2026-10-14, Kiro 1.2.56, 미리 승인). 확인 1~8 통과 뒤 9~17에서 세 건으로 막혔다.
  - Builder가 앱 서버를 다시 띄우려고 `Get-Process -Name "node" | Stop-Process -Force`를 실행했다. Core(`core.mjs`)와 MCP bridge(`bridge.mjs`)가 둘 다 관리 Node `node.exe` 위에서 돌아 함께 죽었다. Core는 host가 3초 만에 다시 띄웠지만, Kiro는 죽은 stdio MCP 서버를 다시 띄우지 않았다. Builder는 1시간 동안 "Core 재연결 중"이라고만 했다.
  - 창을 다시 로드한 뒤 Core(18404)가 13:06까지 살아 있다가 정상 종료(`backend.stopped`)했다. 그 뒤 아무도 Core를 다시 띄우지 않았고, bridge는 `VIBE_HELPER_NOT_CONNECTED`만 돌려줬다.
  - Builder가 첫 Task와 후속 Task를 Kiro Workflow(`run_workflow`)로 통째로 구현했다. Project 전체에서 `DECISION_REQUESTED`가 0건이었다. 그 PC는 `kiroAgent.workflows.enabled: true`(기본 꺼짐)였다.
- **원인(코드 확인):**
  - 미리 승인 목록에는 `Get-Process`·`Stop-Process`·`Start-Process -FilePath node`가 없다. 따라서 우리 규칙상 두 명령 모두 물어야 한다. 묻지 않았다면 사용자·작업 공간 권한 파일에 남은 "항상 허용"을 의심한다(frontend 확인 요청). Steering 0.9.0에는 서버를 끄는 방법에 대한 규칙이 없다.
  - managed Core는 host lease가 30초 갱신되지 않으면 스스로 닫는다. host의 2초 점검 타이머는 첫 `prepare()`(패널 webview가 열릴 때 등) 뒤에만 돈다. 한 번 `FAILED`가 되면(45초 시간 초과, 60초 안 두 번 재시작) 타이머가 영구히 멈춘다. Core의 lease 점검은 벽시계 기준이라 절전에서 깨어나면 host가 갱신하기 전에 모든 lease를 만료시킨다.
  - Workflow는 별도 creator가 계획을 만들고 각 단계를 따로 실행한다. 단계는 이 대화를 보지 못하고 학습자에게 묻지 못한다. Mac 확인 프로필은 이 설정이 꺼져 있어(키 없음) K14 확인이 이 경로를 다루지 않았다.
- **결정:** [DECISIONS](DECISIONS.md) "Windows 0.2.9 확인 후속(K18)". 실행 파일 이름 변경은 사용자 결정(2026-10-14, 이번 0.2.10에 함께).
- **범위:**
  1. Steering 0.9.1: 이름으로 일괄 종료 금지(자기가 띄운 PID·포트로만), 도구 자체가 사라지면 창 다시 로드 안내, 구현을 workflow·하위 에이전트에 넘기지 않기.
  2. Core·bridge·hook의 실행 파일 이름을 `node`가 아닌 `vibe-helper-core`로 바꾼다. 해시를 검증한 관리 Node 사본을 쓰고, Kiro-native host는 PATH의 Node 대신 늘 관리 Node를 쓴다.
  3. Core lease: 타이머 공백(절전·멈춤) 뒤에는 바로 닫지 않고 갱신 유예를 다시 준다. 살아 있는 host의 갱신 만료를 늘린다.
  4. host: 연결된 Project 폴더에서는 패널 없이도 Core를 띄운다. `FAILED` 뒤에도 간격을 늘려 다시 시도하고, 연결된 폴더에서는 "다시 연결" 알림을 보인다.
  5. 인계 문서의 확인 13 문구("적용값이 Autopilot")를 고친다. Mac 0.2.10을 만들고 Windows 0.2.10을 frontend에 요청한다.
- **완료 조건:** runtime unit(관리 Node 사본 이름·해시·경쟁), host lease unit(공백, 만료), lifecycle CJS(실패 뒤 다시 시도, 연결된 폴더에서 시작, 알림), 기존 unit·integration·eval·패널 CJS·포장 검사 회귀 없음, Steering 0.9.1 실제 Kiro 확인(Workflow를 켠 Mac 프로필에서 첫 Builder 턴이 채팅에서 직접 만들고 선택을 묻는지, `killall node`·`pkill node` 뒤에도 Core·bridge가 살아 있는지), Mac VSIX 0.2.10.
- **진행(2026-10-14):**
  - **구현과 자동 검사 완료(Node 24.19.0):**
    - runtime `namedCoreExecutable`(해시를 검증한 `vibe-helper-core` 사본, 바뀐 사본은 옆으로 옮기고 다시 복사)와 host의 `nodeExecutables: []`.
    - `HostLeases`(갱신 만료 2분, 5초 넘는 타이머 공백 뒤 유예).
    - `core-lifecycle.cjs`(`FAILED` 뒤 5~60초 다시 시도), `frontend-host.cjs`(연결된 폴더에서 시작, 다시 연결되면 준비 마저 하기, "다시 연결" 알림 한 번).
    - Steering 0.9.1, 결정 기록.
    - 검사: `pnpm typecheck` 통과, unit 177 통과·3 skip, integration 558 통과·9 skip(새 6개), eval 47 통과·1 skip, 패널 CJS 192 통과·2 skip(새 5개), 바꾼 파일 Biome 오류 없음.
    - commit `1923f07`, 버전 `dc5859e`.
  - **Mac 0.2.10:** 깨끗한 worktree(backend `dc5859e`, program `main` `324214e`)로 빌드했다. 41,609,475 bytes, SHA-256 `a7dc53d4…f510`, 포장 검사 9 PASS.
  - **실제 Kiro 확인([기록](../tests/eval/results/kiro-steering-0.9.1-k18.md), 약 7.9크레딧, 계정 누적 약 165.4):**
    - 0.2.9에서 올린 프로필의 Core는 PATH의 Node로 돌고 있었다. 0.2.10에서는 Core·bridge가 `vibe-helper-core`로 돌고 `pgrep -x node`·`pgrep node`에 잡히지 않았다. MCP·hook 명령과 Steering은 Core 시작 때 다시 쓰였다.
    - Core를 PID로 종료하면 2~3초 만에 다시 떴고 bridge는 유지됐다(다시 로드 전후). Kiro를 닫으면 23초 뒤 Core가 스스로 끝났다.
    - Workflow를 켠 세션에서 0.9.1 Builder가 채팅에서 후속 기능을 만들고 선택을 묻고 완료했다. workflow 문단을 뺀 대조도 위임하지 않아 Mac에서는 재현되지 않았다.
    - Kiro는 Workflow 세션 지침에 "항상 `run_workflow`"를 넣고, 그 지침은 서버 A/B 설정으로 바뀐다.
  - **남은 것:**
    - frontend의 0.2.9 사건 답(승인 창, 권한 파일, 절전)과 Windows 0.2.10 확인 9~21. 요청은 [0.2.10 프론트 인계](FRONTEND_HANDOFF_0.2.10.md).
    - 패널 없는 창의 Core 시작, 절전 뒤 유예, `FAILED` 뒤 다시 시도는 실제 화면으로 만들 수 없어 단위 테스트로만 확인했다(frontend 확장이 활성화 때 패널을 연다).
    - Workflow 위임 방지의 효과는 Windows 확인 9·14가 판정한다.

### [ ] K19. Mac·Windows의 Node 포함 방식 맞추기 (본선 뒤 판단)

- **출처:** 사용자 질문(2026-10-14): Mac VSIX는 Node를 넣고 Windows는 내려받는 이유. 사용자 결정: 어느 쪽으로 맞출지는 본선 뒤에 정한다.
- **배경:**
  - Windows는 Kiro 런타임(`ELECTRON_RUN_AS_NODE`)을 빌려 쓰는 전제로 Node를 넣지 않았다([DECISIONS](DECISIONS.md) 2026-09-23 "Windows 우선 확장 설치와 런타임 재사용"). VSIX는 2.6MB다.
  - Mac은 공식 Node 24.19.0을 넣었다(2026-09-29 "Mac 배포용 VSIX", VSIX 41MB).
  - 본선 Kiro-native에서 Kiro 런타임 후보가 빠졌다(Core가 자기 실행 파일을 hook·MCP 명령에 씀). K18에서 PATH의 Node도 뺐다.
  - 그래서 지금은 모든 Windows 설치가 첫 실행 때 nodejs.org에서 `node.exe`(약 90MB)를 내려받는다. nodejs.org가 막힌 망에서는 Core가 시작하지 않는다(`RUNTIME_DOWNLOAD_UNAVAILABLE`).
- **고를 안(본선 뒤 판단):**
  1. **Windows에도 넣기:** Windows 포장(`build-portable-core.mjs win32-x64`)에 해시를 고정한 공식 `node.exe`와 라이선스를 넣는다. `acquireCoreNode`의 Windows 경로를 Mac처럼 설치물에서 검증·복사하게 바꾼다. 오프라인 첫 실행이 되고 외부 의존이 줄지만, VSIX가 30~40MB로 커진다.
  2. **Mac에서도 빼기:** Mac 포장에서 `bin/node`를 빼고, Mac 관리 Node를 Windows처럼 공식 배포본에서 해시를 고정해 내려받게 한다. VSIX가 작아지지만, Mac도 첫 실행에 인터넷이 필요하다.
  - 어느 쪽이든 0.2.10 이하가 만든 캐시(`runtime-cache`)와의 관계를 정하고, 시작 전에 DECISIONS를 고친다.
- **완료 조건(고른 안 기준):**
  - 첫 실행(1번은 오프라인, 2번은 내려받기)
  - 기존 캐시가 있는 설치의 업그레이드
  - 변조 거절(runtime unit, `test-portable-core.mjs`·`test-macos-package.mjs`)
  - 두 플랫폼 VSIX 크기 측정
  - 바뀐 플랫폼의 빌드와 확인 1~8
- **그때까지:** 부스·시연용 Windows PC는 행사 전에 한 번 실행해 관리 Node 캐시를 만들어 둔다.

### [~] K20. Windows 0.2.10 확인 후속: 한글 이스케이프, 따옴표 주소, 첫 Task 선택, 완료 뒤 바꾼 선택

- **출처:** frontend Windows 0.2.10 확인(2026-10-15, [0.2.10 Windows 확인](FRONTEND_KIRO_NATIVE_HANDOFF.md#0210-windows-확인-2026-10-15))의 backend 요청 네 건.
  1. `ask_choice`의 최상위 문자열(`question` 등)이 `\uXXXX` 글자 그대로 저장돼 패널에 보였다. `save_progress`는 인자 전체가 `summary` 하나에 들어가 `kind` 검증 오류가 났다.
  2. 확인 16 실패: Builder가 `Start-Process "http://localhost:5173"`, `(Invoke-WebRequest -Uri "…" -UseBasicParsing).StatusCode`처럼 주소를 따옴표로 감싸 미리 승인 패턴과 맞지 않았다. 첫 승인 창이 27분 동안 턴을 멈췄다.
  3. 첫 Task("계획대로 만들기 시작해 줘")가 `ask_choice` 없이 앱 전체를 만들었다(0.2.7 Windows와 같은 증상). Workflow는 켜져 있었지만 쓰지 않았다.
  4. 완료 뒤 학습자가 이유와 함께 이전 선택을 바꾸자 새 후속 Task가 됐고, Decision 기록에는 변경이 남지 않았다. 의도를 물었다.
- **확인(2026-10-16, Mac):**
  - 1은 Mac에서도 생긴다. 10/9 이후 Mac Kiro 세션의 Vibe Helper 도구 호출 118건 중 11건이 같은 원인이다. 모델이 인자를 JSON 문자열로 한 번 더 감싸 한글을 `\uXXXX`로 쓴다. 8건은 Kiro `tool_call`이 거절했다(`arguments: expected object, received string`, K10의 알려진 한계). 2건은 배열을 문자열로 보내 schema가 거절했다. 1건(10/12 K17 실측 `save_progress` 요약)은 그대로 저장됐다. Mac Core DB의 결정 요청 60건에는 없었다. bridge·Windows 경로의 문제가 아니다.
  - 2는 Mac kiro-cli 판정기로도 재현된다(`open "http://localhost:5173"`, `curl "http://…"`도 묻기). 괄호로 감싼 `(Invoke-WebRequest …).StatusCode`는 패턴을 넣어도 하나의 명령으로 읽히지 않아 계속 묻는다.
  - 4는 지금 설계대로다. 적용된 Decision의 `save_choice`는 `DECISION_ALREADY_APPLIED`로 거절되고, 바꾸는 요청은 후속 Task가 된다.
- **결정:** 사용자 결정(2026-10-16): 1은 풀어서 받기, 3은 Mac 실측 뒤 Steering, 4는 의도한 동작으로 문서화, 끝나면 Mac 0.2.11·push·Windows 요청까지.
- **범위:**
  1. MCP 입력 단계(Kiro 채팅 도구): 문자열 전체가 이스케이프된 경우만 풀어서 받는다. 다른 인자까지 한 문자열에 들어간 경우는 다시 보내라는 오류로 돌려준다. 배열·객체를 JSON 문자열로 보낸 경우도 풀어서 받는다.
  2. 미리 승인: 따옴표로 감싼 주소(`Start-Process`·`start`·`open`·`curl`)와 `Invoke-WebRequest -Uri` 형태를 더한다. 0.2.9~0.2.10 규칙을 가진 폴더는 업그레이드한다.
  3. Steering 0.9.2: 주소는 따옴표 없이, 서버 확인은 괄호 없이 쓴다. 도구 인자는 JSON 객체로, 한글은 그대로 쓴다. 첫 Task 규칙은 실측 결과에 맞춘다.
  4. 완료 뒤 바꾼 선택은 DECISIONS와 인계 문서에 적는다.
- **완료 조건:** contracts·MCP·adapter 단위 테스트, 기존 unit·integration·eval·패널 CJS·포장 검사 회귀 없음, kiro-cli 판정기, Workflow를 켠 Mac 프로필에서 처음 보는 목표의 첫 Task 실측(0.9.1 재현, 0.9.2 확인), Mac VSIX 0.2.11, Windows 0.2.11 요청.

## 3. 예선 작업 요약

상세 기록은 [예선 작업 기록](archive/preliminary/TASKS_PRELIMINARY.md)에 있다.

| 상태 | 작업 | 비고 |
| --- | --- | --- |
| [x] | T00~T18 | 문서 승인, capability spike, Core 계약·reducer·SQLite·MCP, Discovery·Spec·Builder·Decision·Helper·Evidence·개인화, Campus Drop Golden Path |
| [x] | T19-W0~W5 | Windows 확장 설치·Core 자동 기동·도구 준비·출하 검증 |
| [x] | T19-M1~M7, T19-D1 | Mac VSIX와 게시, 권한 거부 수정(Mac 0.1.4), 문서 날짜 정리 |
| [-] | T19 | 예선 제출로 종료. 남은 T19-F15(채팅 스트림 표시 실제 화면 확인)와 T19-F11은 본선 구조가 확정된 뒤 K08에서 필요성을 다시 판단한다 |
| [-] | T19-N | 예선 native 경로의 실험 기록으로 종료. 본선에서는 기존 패널 경로의 fallback 근거로만 쓴다 |
| [-] | T20 | 예선 hardening으로 종료. 남은 항목은 K02~K08의 보안·provenance 완료 조건으로 옮긴다 |
| [-] | T21~T30 | 예선 이후 강화 계획. 본선 범위는 K 작업으로 대체하고, 평가·pilot(T22~T24)은 본선 뒤 다시 판단한다 |
| [-] | Windows 0.0.19 | 권한 거부 수정의 Windows 반영. Windows 호스트가 필요해 대기한다 |

## 4. 대회 이후: 범용 제품으로 확장

### [ ] T31. Claude Code와 Codex host adapter

**범위**

- Core/MCP contract를 유지한 채 host별 event, tool, session과 permission 차이를 adapter로 흡수한다.

**선행 조건**

- Kiro 기반 MVP와 contract가 안정되어야 한다.

**산출물**

- host capability matrix와 adapter interface
- host별 contract/integration test

**완료 조건**

- Core reducer와 Evidence model을 fork하지 않고 새 host를 연결한다.
- 기능이 없는 host에서는 조용히 흉내 내지 않고 명시적 제한과 fallback을 제공한다.

### [ ] T32. 기존 project import와 언어 확장

**범위**

- 신규 project 전용 MVP를 넘어 기존 repository의 최소 구조와 concept을 import한다.
- TypeScript 외 언어는 language profile과 안전한 실행 경계가 준비된 순서로 추가한다.

**선행 조건**

- T31 또는 안정된 host abstraction과 별도 threat model이 있어야 한다.

**산출물**

- import scanner, consent/redaction flow와 language profile
- repository size, generated files, secret과 unsupported stack test

**완료 조건**

- 전체 코드를 무조건 LLM에 보내지 않고 metadata, diff와 필요한 snippet부터 단계적으로 사용한다.
- import 실패가 원본 repository를 수정하지 않는다.

### [ ] T33. 장기 memory, 동기화와 다중 기기

**범위**

- local-only Ledger를 사용자의 명시적 동의 아래 기기 간 동기화할 수 있는 모델을 설계한다.
- retention, delete/export, conflict와 encryption 경계를 정의한다.

**선행 조건**

- 실제 장기 사용 수요와 개인정보 영향 평가가 있어야 한다.

**산출물**

- sync threat model, data contract와 conflict policy
- opt-in migration 및 삭제 검증

**완료 조건**

- local-only 사용은 계속 가능하고 cloud 동기화가 기본 활성화되지 않는다.
- 사용자 삭제가 projection뿐 아니라 source event와 backup 정책까지 일관되게 처리된다.

### [ ] T34. 장기 학습 검증과 제품화

**범위**

- 여러 project에 걸친 transfer, 잘못된 state 누적, 관심 변화와 실제 서비스 완성의 관계를 검증한다.
- 개인 사용자 외 교육기관·커뮤니티 확장은 별도 사용자와 권한 모델로 평가한다.

**선행 조건**

- 반복 사용자가 충분하고 연구·제품 동의가 구분되어야 한다.

**산출물**

- longitudinal evaluation, product health metric와 governance 제안
- 유지할 기능, 제거할 기능과 새 Golden Path 결정

**완료 조건**

- 장기 학습 효과를 단기 proxy로 과장하지 않는다.
- 결과를 근거로 scope와 business/operation 모델을 새 결정 기록으로 승인한다.

### [ ] T35. 생성 결과물 배포 도우미

- **출처:** 원래 구상의 Final Upgrade(배포 전 마지막 업그레이드)는 배포 단계가 있어야 성립한다(DECISIONS "본선: Final Upgrade 대신 Next Move", 2026-10-12).
- **범위(후보):** 한 TypeScript Golden Path와 한 hosted provider(SPEC 8.4), 배포 직전 점검과 마지막 업그레이드 제안. hosted 배포는 데이터 경계를 바꾸므로 시작 전에 별도 승인과 결정 기록이 필요하다.
