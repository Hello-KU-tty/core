# Hello Vibe

**만들면서, 이해의 근거를 남기는 Kiro 기반 바이브코딩 개발 환경**

고려대학교 × AWS AI Innovators Challenge 예선 제출 · 팀 Hello-KU-tty

Hello Vibe는 코딩 초보자가 배우고 싶은 기술 하나로 시작해 자기에게 필요한 TypeScript 서비스를 실제로 완성하도록 돕는 Kiro IDE 확장이다. 개발 중 필요한 순간에 Helper와 대화하고, 실제로 내린 판단을 근거로 쌓아 다음 설명과 프로젝트 추천까지 개인화한다.

| 저장소 | 역할 |
| --- | --- |
| [Hello-KU-tty/core](https://github.com/Hello-KU-tty/core) (이 저장소) | TypeScript Core, SQLite 저장소, 역할별 MCP, Agent prompt, Kiro native 연동, 평가·테스트 |
| [Hello-KU-tty/program](https://github.com/Hello-KU-tty/program) | Kiro 확장 frontend: Discovery, Spec, Builder, Helper, History 화면 |

## 소개 영상

https://github.com/user-attachments/assets/aacdf659-c0f1-465a-b23b-72a0256fe466

실제 Kiro IDE에서 진행한 한 프로젝트의 흐름이다. 배우고 싶은 것 입력 → 프로젝트 후보 10개 → Learning Spec → Builder가 실제 결정을 사용자에게 넘김 → Helper에게 질문 → 이유를 적어 선택 → Evidence가 사용자의 이유만 이해 근거로 인정(질문만 한 것과 Agent가 작성한 코드는 제외) → 선택대로 완성된 앱이 새로고침 후에도 데이터를 유지한다.

## 해결하려는 문제

- AI가 동작하는 코드를 만들어도, 사용자는 중요한 제품·기술 판단의 의미를 모를 수 있다.
- 설명·퀴즈·진도 중심의 교육 도구는 실제 개발 흐름을 끊는다.
- 배우고 싶은 기술이 있어도 그 기술이 정말 필요한 프로젝트를 찾기 어렵다.
- "Agent가 코드를 썼다"와 "사용자가 이해했다"가 쉽게 혼동된다.

## 핵심 원칙

- **Build-first:** 교육 때문에 개발을 멈추지 않는다. Builder가 실제 서비스를 앞으로 민다.
- **실제 판단만 요청:** 교육용 가짜 선택지 대신 개발 중 실제로 생긴 Decision만 사용자에게 남긴다.
- **보수적 Evidence:** 확인 응답, 카드 클릭, Agent 답 반복, Agent가 작성한 코드는 이해의 근거가 아니다. 사용자 본인의 설명·예측·판단·적용만 기록한다.
- **Local-first:** 상태는 사용자 컴퓨터의 SQLite에 저장한다. cloud sync는 없다.

## 사용자 흐름

```text
배우고 싶은 기술 입력 (+ 선택적인 개인 필요)
→ Discovery: 동적 프로젝트 후보 10개, 대화로 좁히기
→ Learning Spec: 내가 이해할 것 / Agent가 맡을 것 / 제외할 것
→ Builder: 실제 코드·테스트, 중요한 순간 Decision 요청
→ Helper: 현재 코드·Decision 맥락으로 읽기 전용 설명
→ Episode 단위 Evidence 분석 → Concept State 갱신 또는 보류
→ 다음 Helper 설명과 프로젝트 추천 개인화
→ 완성된 서비스 실행
```

Concept State는 `OBSERVED → EXPLAINED → DEMONSTRATED → TRANSFERRED` 순서로만 올라가며, 오해는 상태 강등이 아니라 해결 가능한 open issue로 남는다.

## Agent와 Core

| 구성 | 하는 일 | 권한 |
| --- | --- | --- |
| Discovery Agent | 후보 생성·수정, Learning Spec 초안 | 코드·shell 없음 |
| Builder Agent | 실제 코드·테스트·디버깅, Decision 요청 | 생성 workspace 안에서만 write/shell |
| Helper Agent | 현재 맥락 기반 설명, 선택지 비교 | 읽기 전용 |
| Evidence Analyst | 종료된 Episode에서 Evidence 제안 | 도구 없음, 제안만 |
| TypeScript Core | validation, 권한 경계, deterministic 상태 계산, SQLite 저장 | 유일한 상태 변경 주체 |

네 Agent는 Kiro IDE의 내장 Agent와 모델 위에서 동작한다. Agent는 제안만 하고, 이해 상태의 판정은 Core의 deterministic reducer가 한다.

## 시스템 구조

```text
Kiro IDE
 └─ Hello Vibe 확장 (Hello-KU-tty/program)
     ├─ Webview 패널: Discovery · Spec · Builder · Helper · History
     ├─ Kiro native Agent 실행 (Discovery / Builder / Helper / Analyst)
     └─ local Core 자동 기동·연결·복구
          ├─ 인증된 loopback HTTP/SSE + 역할별 MCP
          ├─ SQLite: Project · Task · Decision · Event/Episode · Evidence
          ├─ 저장 전 secret·민감 경로 redaction
          └─ 생성 workspace와 결과 앱 실행 supervisor
```

## 다운로드·설치

Mac 복구 보완 **0.1.3**과 대응 개발자 ZIP을 제공한다. Windows 설치물은 **0.0.18**을 유지한다. [현재 제출·검증 상태](docs/VALIDATION_STATUS_20260930.md)에서 설치물, 사람 인터뷰와 미검증 범위를 구분한다.

다운로드 파일 선택부터 첫 실행·업데이트·오류 해결까지는 **[다운로드·설치 가이드](docs/DOWNLOAD_GUIDE.md)**를 참고한다.

**[Windows용 VSIX 0.0.18 다운로드](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/windows/0.0.18/builder-helper-agent-panel-0.0.18-win32-x64-74208fffa5c0.vsix)** · Windows x64용. Kiro IDE 1.1.70 / 내장 Agent 1.1.158 기준이며 [Windows 설치 안내·검증 범위](docs/WINDOWS_VSIX.md)를 확인한다.

**[Mac용 VSIX 0.1.3 고정 다운로드 경로](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix)** · Apple Silicon(M1 이상)용. 기존 주소·파일명의 `0.1.0`은 호환 경로이며 설치 파일 내부 버전은 **0.1.3**이다. 버전·hash로 구분한다. Intel Mac은 지원 대상이 아니다. [Mac 설치 안내·검증 범위](docs/MAC_VSIX.md)를 확인한다.

1. [Kiro IDE](https://kiro.dev/downloads/)를 설치하고 본인 계정으로 로그인한다.
2. Windows x64에서는 위 `win32-x64.vsix`를 받는다. Mac에서는 Kiro를 `/Applications/Kiro.app`에 설치하고 위 `darwin-arm64.vsix`를 받는다.
3. Kiro에서 Extensions → `…` → `Install from VSIX…`로 설치한 뒤 다시 로드한다.
4. Agent Panel을 열고 배우고 싶은 기술을 입력한다.

별도 서비스 로그인이나 API Key는 없다. 모델 사용량은 사용자 본인의 Kiro 계정에서 차감된다. 첫 실행 때 생성 앱의 도구·의존성 준비를 위해 network가 필요할 수 있다. VSIX 사용에는 Node·pnpm 수동 설치나 백엔드 수동 실행이 필요하지 않다. Mac 설치 후보의 검증 기준은 Kiro IDE 1.1.70 / Agent 1.1.158이다. 설치·Core 자동 검사와 실제 앱 생성·실행, Decision 선택·반영, 별도 Helper, 재시작 복원·취소 후 재개를 확인했다. 검증 범위와 복구 과정의 실패는 [실제 설치본 검증 보고](docs/MAC_NATIVE_VERIFICATION_20260930.md)에 구분한다.

VSIX가 작동하지 않으면 먼저 [연결 오류 해결](docs/DOWNLOAD_GUIDE.md#6-업데이트와-문제-해결)을 확인한다. [개발자용 ZIP](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/frontend-handoff/20260927/frontend-handoff-20260927.zip)은 백엔드·프론트 전체 실행 소스로 갱신했다. 새 폴더에 풀어 [소스 재빌드 안내](docs/DOWNLOAD_GUIDE.md#7-vsix가-작동하지-않을-때-개발자용-대안)를 따른다. ZIP 자체는 확장 설치 파일이 아니다.

Mac과 개발자 ZIP은 공개 frontend `a61d408`(0.0.18)과 대응 Core를 기준으로 한다. 완료 뒤 Builder·Helper 대화 유지, 기록된 Node·pnpm 재사용, 중복 Helper 요약 제거를 포함한다. Mac0.1.3에는 구 설치 제거·프로젝트 이동 뒤 도구 복구와 임시 경로 설치 시 native 역할 설정 충돌 수정을 포함한다. Mac 패키지 버전과 Windows 패키지 버전은 별도로 관리한다.

## 개발 환경과 검증

필수 도구는 Node.js 24.19.0과 pnpm 11.13.1이다. `.node-version`, `engines`와 preflight가 다른 runtime을 거절한다.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
```

`pnpm check`는 format, lint, typecheck, DB schema, unit, SQLite integration, 평가 calibration, Campus Drop fixture, build, smoke와 Chromium E2E를 실행한다. 모든 자동 검사는 실제 모델을 호출하지 않는다. 기본 E2E 포트가 사용 중이면 `VIBE_E2E_FRONTEND_PORT`로 빈 포트를 지정한다.

Kiro native 연동과 확장 패널 검사:

```bash
pnpm panel:build
node --test examples/kiro-panel/test/*.test.cjs
node --test examples/program-macos-dev/test/*.test.cjs
node scripts/test-program-consumer.mjs <program checkout 경로>
```

실제 모델을 쓰는 live probe(`pnpm test:eval:live-*`)는 Kiro 로그인 환경에서 본인 계정 사용량을 소비한다. 평가 실행법은 [tests/eval/README.md](tests/eval/README.md)에 있다.

### 최근 검증 결과 (macOS arm64, Node 24.19.0)

| 검사 | 결과 |
| --- | --- |
| ZIP 압축 해제본 backend `pnpm check` | unit 177, integration 418, eval 43, Campus Drop 3, smoke 6, E2E 12 PASS (Windows 전용 등 11 SKIP) |
| 패널·개발 host·source 회귀 | 219 PASS, 2 SKIP |
| frontend 0.0.18 (`program`) | typecheck, 807 tests, build PASS |
| 실제 frontend → HTTP/SSE → SQLite consumer | PASS (모델 경계는 deterministic fixture) |
| 완료 뒤 후속 Builder·Helper | 각 3회, 중복 방지·재접속·기존 완료 보고/파일 보존 PASS (합성 Agent) |
| Mac 0.1.3 설치·Core·도구 | 격리 Kiro 설치, 실제 패키지 검사9개 PASS, 설치 자산69개·ZIP 재빌드72항목 hash 일치; [재현·항목별 hash](docs/MAC_VSIX.md) |
| Mac 0.1.3 실제 모델 | 앱 생성·실행, Decision 선택·반영·Helper2회·재시작 복원·실제 취소 후 재개 확인. [범위와 실패 기록](docs/MAC_NATIVE_VERIFICATION_20260930.md); MVP 전체·다음 개인화 완료를 뜻하지 않음 |
| 의존성 감사 | backend pnpm audit, frontend npm audit 모두 0건 |
| 이전 9/28 개발 환경 실제 모델 수직 흐름 | 학습 목표 입력 → 후보 10개 → Spec 확정 → Builder Decision → Task 완료 → Helper → 후속 Task로 결과 수정 → 재시작 후 복원 (새 설치물의 모델 완주 검증은 아님) |

실제 흐름 기록은 [docs/FRONTEND_MAC_PROGRESS_20260928.md](docs/FRONTEND_MAC_PROGRESS_20260928.md), 보안·접근성 감사는 [docs/T20_AUDIT_20260928.md](docs/T20_AUDIT_20260928.md), 독립 소스 재현은 [docs/SOURCE_REPRODUCIBILITY_20260928.md](docs/SOURCE_REPRODUCIBILITY_20260928.md)에 있다.

## 사용자 검증

실제 초보 사용자 사용과 후속 인터뷰를 진행했다. 제출한 서비스 소개서에는 프로젝트를 고르는 데 도움을 받았고, 개발 중 필요한 개념 설명과 이후 회상에 도움이 됐다는 정성 피드백을 담았다. 이는 사용자 확인과 인터뷰에 근거한 관찰이며, 아래 자동 테스트나 합성 입력 검증과는 별개다.

일반 Kiro 대비 통제된 비교·정량 학습 효과 검증은 아직 수행하지 않았다. 인터뷰의 긍정적 반응을 인과적인 학습 효과나 모든 사용자의 결과로 확대하지 않는다.

## 알려진 한계

- 실제 사용 인터뷰는 정성 검증이며 일반 Kiro 대비 비교·정량 효과는 미검증이다. Mac 설치본의 합성 입력 기반 기술 검증과도 구분한다.
- Evidence Analyst가 미래 계획을 실제 수행으로 잘못 분류할 수 있다. Core는 구조·출처·권한을 검증하지만 자연어 의미의 정확성까지 보장하지 않는다.
- 생성 프로젝트는 새 TypeScript 프로젝트로 한정한다. 기존 프로젝트 import, 다른 coding agent, cloud sync는 범위 밖이다.
- redaction은 알려진 형태 중심이며 모든 개인정보를 탐지하지 않는다. 생성 코드 실행은 OS 수준 sandbox가 아니다.

## 저장소 구조

```text
apps/local-backend        독립 local Core 실행, native Agent relay
apps/mcp-server           MCP process composition root
apps/crew-app, crew-backend  초기 Crew App 경로 (회귀 근거로 보존)
packages/contracts        runtime schema와 shared DTO
packages/domain           deterministic entity·policy·reducer
packages/application      use case, transaction, redaction 경계
packages/runtime          workflow·결과 앱 runtime
packages/storage-sqlite   SQLite repository와 migration
packages/frontend-client  확장 frontend가 소비하는 SDK
packages/kiro-adapter     Kiro/Crew transport 격리
agents/, docs/agent-prompts/  Discovery·Builder·Helper·Analyst prompt 계약
examples/kiro-panel       Kiro 확장 host와 native 연동
tests/                    unit, integration, eval, smoke, E2E, Campus Drop fixture
```

## 설계 문서

1. [PROJECT_BRIEF.md](PROJECT_BRIEF.md): 승인된 목표, 범위와 제약
2. [docs/SPEC.md](docs/SPEC.md): 검증 가능한 제품 요구와 완료 조건
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system boundary, data flow, test 전략
4. [docs/DECISIONS.md](docs/DECISIONS.md): 승인된 판단과 spike 결과
5. [docs/TASKS.md](docs/TASKS.md): 작업 순서와 진행 상태
6. [docs/agent-prompts/](docs/agent-prompts/): 네 Agent의 prompt 계약

frontend 연동 안내는 [docs/FRONTEND_IDE_IMPLEMENTATION_GUIDE.md](docs/FRONTEND_IDE_IMPLEMENTATION_GUIDE.md), Windows 확장 runtime 기록은 [docs/WINDOWS_EXTENSION_HANDOFF_20260923.md](docs/WINDOWS_EXTENSION_HANDOFF_20260923.md)에서 시작한다. `spikes/`는 외부 기능 경계를 확인한 폐기 가능한 실험물이다.
