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

- **기한:** 10/11 포스터 사전 제출.
- **범위:** Kiro 채팅의 사용자 발언 → hook → Evidence → 학습자 요약 갱신 → 다음 대화 변화 중 실측된 범위를 한 장면으로 캡처한다. 실측되지 않은 부분은 목표 구조로 구분해 표시한다.
- **완료 조건:** 캡처 원본과 재현 절차, 실측·목표 구분 표기.

### [ ] K08. 본선 통합 검증과 fallback

- **기한:** 10/18 본선.
- **범위:** Discovery부터 다음 개인화까지 새 구조의 수직 흐름, 기존 패널 경로 fallback, 설치 경험, 발표 데모. Windows 0.0.19 반영(권한 거부 수정)은 Windows 호스트 작업으로 별도 판단한다.
- **완료 조건:** `pnpm check`와 실제 Kiro 흐름 기록, 알려진 한계 문서화.

### [~] K09. 첫 실사용 체험 피드백 반영

- **출처:** 사용자 직접 체험(2026-10-09, Kiro 1.2.37, 개인 Builder ID)과 피드백 15건. 검토·검증 기록은 [첫 체험 기록](spikes/KIRO_NATIVE_FIRST_TRIAL_20261009.md).
- **범위:** 패널 문구·버튼·로딩(1·2·3·5, frontend), Steering 0.5.0(4·8·13: 예상 Decision은 예고로만, 구현 중 하나씩, 묻기 전 기록, 시작 전 환경 확인), 빈 현재 폴더를 Project 폴더로 등록(6), 신뢰 안내(7), Helper가 Builder 진행 상황을 보게 함(9), Vibe Helper 도구 허용 규칙(11), Kiro 채팅의 Helper 에이전트(12), 예선 전역 에이전트 정리(14).
- **완료 조건:** 관련 unit·integration·패널 테스트, VSIX 재생성, 실제 Kiro 재실측. 재실측에는 6 적용 뒤 신뢰·hook·Steering 적재 시점(7)을 다시 보는 것을 포함한다(모델 크레딧 필요).
- **진행:** 코드·문서 반영과 0.2.1 VSIX 완료(backend `0cd52c8`·`4def349`, frontend `program` `finals/trial-feedback` `c2c873c`). 자동 검사 통과(backend unit 177·integration 489, 패널 CJS 179, frontend 811, Mac 패키지 9). 패널 화면은 Chrome 1280px·360px로 확인. 모델 호출 없는 격리 Kiro 확인: 빈 현재 폴더 연결, 다시 로드 없이 Builder MCP 연결과 `vibe-helper` 에이전트 등록, 새 채팅 세션에서 hook 2개 적재. 본선 계정 재실측(2026-10-09, [재실측 기록](spikes/KIRO_NATIVE_K09_REMEASURE_20261009.md)): 처음 보는 목표·Personal Need로 Discovery부터 Task 완료까지 진행. 현재 폴더 연결, hook 기록, 환경 확인, 작업 맥락 기록, 구현이 닿은 시점의 Decision 하나와 기록 후 질문, 첫 시도 확정, Vibe Helper 도구 11회 실패 0·승인 0, 다른 탭 Helper의 진행 중 Builder 활동 사용을 확인(계정 사용량 27.03). Analyst 과대 판정 문제는 기본 모델 Sonnet 5.5(대안 Auto)와 정책 최대치 저장으로 처리했다(DECISIONS). 이 변경을 담은 0.2.2 VSIX(backend `012c664`, 0.2.1과 Core 묶음만 다름)를 만들어 격리 Kiro 1.2.56에 설치하고 Core 연결, 처음 보는 목표(Personal Need 없음)의 Discovery부터 Task 준비까지 확인했다. 남은 것: 모드 목록에서 `vibe-helper` 에이전트를 고르는 화면 조작, 신뢰·동의·새 창 확인 창의 실제 화면(사용자 클릭, 테스트 프로필·폴더·Project 준비 완료), Sonnet 5.5 Analyst 실제 실행.

### [>] K10. Kiro 채팅 Builder 워크플로 재설계

- **출처:** 체험 피드백 10. Vibe Helper 도구 호출 25번 중 9번 실패(형식 3, 순서 3, 인용 글자 깨짐 1, 모드 2). 학습자의 실제 이유가 Decision 기록 전 발언이라 버려져 판단 근거 Evidence가 하나도 남지 않았다.
- **진행 방식:** 현재 Builder 도구·순서·Core 검증 규칙을 한 장으로 정리해 사용자에게 보여 주고, 사용자가 재설계한다. 정리 전에는 Core Builder 계약을 바꾸지 않는다.
- **검토 거리(초안):** Kiro 채팅용 도구 수와 입력 축소(식별자·버전·멱등키를 서버가 채움), 이유 인용을 글자 복사 대신 hook이 받은 메시지 ID로, Decision 요청 직전 발언의 근거 인정 여부, 작업 맥락과 완료 단계 자동화.

### [ ] K11. 셸 명령 자동 허용 정책

- **출처:** 체험 피드백 13. Autopilot에서도 셸 명령은 매번 확인했다(16번, 모두 이번만 허용).
- **검토 거리:** Kiro 권한 규칙(명령 앞부분 기준 항상 허용, 작업 공간 범위)과 우리가 미리 넣을 수 있는 범위, 위험 낮은 명령 목록, 사용자 동의와 끄기, 공개 문서가 아닌 내부 형식 의존 위험.

### [ ] K12. 크레딧 사용 측정과 절감

- **출처:** 체험 피드백 15. 채팅 18.16크레딧 중 10.13은 앱 전체 구현 한 턴(모델 호출 46번)이었고, Vibe Helper 처리 몫은 약 4~5크레딧으로 추정했다.
- **검토 거리:** 같은 과제를 Vibe Helper 연결 유무로 비교 측정, Steering·도구 설명 크기, 실패 재시도, 채팅 밖 kiro-cli 실행(Discovery·Helper·Analyst) 비용.

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

