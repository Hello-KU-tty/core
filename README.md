# Vibe Helper

**만들면서, 이해의 근거를 남기는 Kiro 기반 바이브코딩 개발 환경**

고려대학교 × AWS AI Innovators Challenge 예선 제출 · 팀 Hello-KU-tty

Vibe Helper는 코딩 초보자가 배우고 싶은 기술 하나로 시작해 자기에게 필요한 TypeScript 서비스를 실제로 완성하도록 돕는 Kiro IDE 확장이다. 개발 중 필요한 순간에 Helper와 대화하고, 실제로 내린 판단을 근거로 쌓아 다음 설명과 프로젝트 추천까지 개인화한다.

| 저장소 | 역할 |
| --- | --- |
| [Hello-KU-tty/core](https://github.com/Hello-KU-tty/core) (이 저장소) | TypeScript Core, SQLite 저장소, 역할별 MCP, Agent prompt, Kiro native 연동, 평가·테스트 |
| [Hello-KU-tty/program](https://github.com/Hello-KU-tty/program) | Kiro 확장 frontend: Discovery, Spec, Builder, Helper, History 화면 |

## 시연 영상

[▶ 시연 영상 보기 (MP4, 약 3분)](docs/assets/vibe-helper-demo.mp4)

Kiro IDE에서 학습 목표를 입력해 프로젝트 후보를 만나고, 후보를 골라 Learning Spec을 확인한 뒤 Builder가 실제 개발을 시작하는 흐름이다. 대기 구간은 줄였고 Builder 구간은 2배속이다.

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
 └─ Vibe Helper 확장 (Hello-KU-tty/program)
     ├─ Webview 패널: Discovery · Spec · Builder · Helper · History
     ├─ Kiro native Agent 실행 (Discovery / Builder / Helper / Analyst)
     └─ local Core 자동 기동·연결·복구
          ├─ 인증된 loopback HTTP/SSE + 역할별 MCP
          ├─ SQLite: Project · Task · Decision · Event/Episode · Evidence
          ├─ 저장 전 secret·민감 경로 redaction
          └─ 생성 workspace와 결과 앱 실행 supervisor
```

## 다운로드·설치

다운로드 파일 선택부터 첫 실행·업데이트·오류 해결까지는 **[다운로드·설치 가이드](docs/DOWNLOAD_GUIDE.md)**를 참고한다.

**[Windows용 VSIX 0.0.17 다운로드](releases/windows/0.0.17/builder-helper-agent-panel-0.0.17-win32-x64-828aca63a3be.vsix?raw=true)** · Windows x64용. Kiro IDE 1.1.70 / 내장 Agent 1.1.158 기준이며 [Windows 설치 안내·검증 범위](docs/WINDOWS_VSIX.md)를 확인한다.

**[Mac용 VSIX 0.1.0 다운로드](releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix?raw=true)** · Apple Silicon(M1 이상)용. GitHub 파일 화면이 열리면 **Download raw file**을 누른다. Intel Mac은 지원 대상이 아니다. [Mac 설치 안내·검증 범위](docs/MAC_VSIX.md)를 확인한다.

1. [Kiro IDE](https://kiro.dev/downloads/)를 설치하고 본인 계정으로 로그인한다.
2. Windows x64에서는 위 `win32-x64.vsix`를 받는다. Mac에서는 Kiro를 `/Applications/Kiro.app`에 설치하고 위 `darwin-arm64.vsix`를 받는다.
3. Kiro에서 Extensions → `…` → `Install from VSIX…`로 설치한 뒤 다시 로드한다.
4. Agent Panel을 열고 배우고 싶은 기술을 입력한다.

별도 서비스 로그인이나 API Key는 없다. 모델 사용량은 사용자 본인의 Kiro 계정에서 차감된다. 첫 실행 때 생성 앱의 도구·의존성 준비를 위해 network가 필요할 수 있다. VSIX 사용에는 Node·pnpm 수동 설치나 백엔드 수동 실행이 필요하지 않다. Mac 설치 후보의 검증 기준은 Kiro IDE 1.1.70 / Agent 1.1.158이다. 설치·Core 자동 검사는 통과했으며 이 설치물의 실제 모델 전체 흐름은 별도 검증 대상이다.

VSIX가 작동하지 않으면 먼저 [연결 오류 해결](docs/DOWNLOAD_GUIDE.md#6-업데이트와-문제-해결)을 확인하고, 개발 환경에서는 [소스 재빌드·개발자용 ZIP 대안](docs/DOWNLOAD_GUIDE.md#7-vsix가-작동하지-않을-때-개발자용-대안)을 사용할 수 있다. ZIP은 Windows용 과거 update kit이므로 Mac에 직접 설치하지 않는다.

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
| backend `pnpm check` | unit 137, integration 365, eval 41, Campus Drop 3, smoke 6, E2E 12 PASS (Windows 전용 등 11 SKIP) |
| Kiro native 연동 회귀 | 161 PASS, 2 SKIP |
| frontend (`program`) | typecheck, 719 tests, build PASS |
| 실제 frontend → HTTP/SSE → SQLite consumer | PASS (모델 경계는 deterministic fixture) |
| 의존성 감사 | backend pnpm audit, frontend npm audit 모두 0건 |
| 실제 모델 수직 흐름 | 학습 목표 입력 → 후보 10개 → Spec 확정 → Builder Decision → Task 완료 → Helper → 후속 Task로 결과 수정 → 재시작 후 복원 |

실제 흐름 기록은 [docs/FRONTEND_MAC_PROGRESS_20260928.md](docs/FRONTEND_MAC_PROGRESS_20260928.md), 보안·접근성 감사는 [docs/T20_AUDIT_20260928.md](docs/T20_AUDIT_20260928.md), 독립 소스 재현은 [docs/SOURCE_REPRODUCIBILITY_20260928.md](docs/SOURCE_REPRODUCIBILITY_20260928.md)에 있다.

## 알려진 한계

- 실제 초보 사용자 대상 검증과 일반 Kiro와의 비교는 아직 진행하지 않았다. 학습 효과를 수치로 주장하지 않는다.
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
