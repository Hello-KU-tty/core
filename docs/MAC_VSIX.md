# Mac VSIX 설치

현재 설치 후보는 Apple Silicon Mac(`darwin-arm64`)용 Hello Vibe **0.1.1**이다. 공개 frontend **0.0.18 (`a61d408`)**과 Core `7b35217`에 Mac 설치·도구 통합을 반영했다. 완료 뒤 Builder·Helper 대화, 기록된 도구 재사용과 중복 Helper 요약 제거를 포함한다. Kiro IDE 1.1.70 / 내장 Agent 1.1.158 / API 1.131.0의 source hash를 확인한다. Kiro는 `/Applications/Kiro.app`에 설치하고 본인 계정으로 로그인한다. Intel Mac은 지원 대상이 아니다.

[Mac용 VSIX 다운로드](../releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix?raw=true) · 41,582,063 bytes · SHA-256 `a04c53c63f2aa1abf45d608106e6593dd0b82b2137113225403aa459e5be227e`

2026-09-30 갱신했다. 기존 주소·파일명의 `0.1.0`은 호환 다운로드 경로이며 내부 버전은 **0.1.1**이다. [receipt](../releases/macos/0.1.0/macos-vsix-receipt.json)와 [항목별 hash](../releases/macos/0.1.0/files.json)로 구분한다.

GitHub 파일 화면이 열리면 **Download raw file**을 누른다. 다운로드 후 터미널에서 아래 값이 위 SHA-256과 같은지 확인할 수 있다.

```sh
shasum -a 256 ~/Downloads/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix
```

2026-09-30 파일은 Kiro 격리 프로필 설치 및 실제 설치 자산의 Core/SQLite lifecycle·도구 재사용·변조 거절 **6개 검사 PASS**다. 개발자 ZIP 압축 해제본에서 `pnpm check` 전체(unit177, integration404, eval43, Campus3, smoke6, E2E12; 플랫폼 등 11 SKIP), 패널·개발 host·source 회귀220+2 SKIP, frontend807과 실제 Core consumer·완료 뒤 후속 요청 회귀를 통과했다. 소스 경로에 따른 번들 주석 차이를 없애도록 패키징 기준 경로도 고정했다. 최종 항목별 재현 결과는 receipt에 기록한다. ZIP timestamp로 압축 파일 전체 hash는 달라질 수 있다. 모델 호출은 0회다.

## 설치와 사용

1. [Kiro 공식 다운로드](https://kiro.dev/downloads/)에서 호환 버전의 **macOS (Apple Silicon)** IDE를 받아 `/Applications/Kiro.app`에 설치하고 로그인한다.
2. 위 VSIX를 받은 뒤 Kiro Extensions(`Cmd+Shift+X`)의 `…` → **Install from VSIX…**에서 파일을 선택한다.
3. 다시 로드한 뒤 **Agent Panel**을 연다.
4. 사용할 작업 폴더를 신뢰하고 학습 목표를 입력한다. 생성 프로젝트나 Helper용 보조 창이 열리면 해당 폴더의 신뢰 여부를 확인한다.

개발 저장소, Homebrew, Node/pnpm 수동 설치나 별도 서버 기동은 필요하지 않다. Core는 호환 런타임을 확인하고 필요하면 VSIX에 포함된 공식 Node 24.19.0을 사용한다. 생성 앱용 Node는 배포본을 사용하며 pnpm 11.13.1은 첫 실행 때 무결성을 확인해 전용 저장소에 준비한다. pnpm 및 생성 앱 의존성 다운로드, Kiro 로그인과 모델 사용에는 네트워크가 필요하다.

Core/SQLite는 확장 전용 global storage 아래 `core-data`, 생성 프로젝트는 그 안의 `workspaces`에 저장한다. 설치 폴더와 사용자 데이터를 분리한다. 생성 폴더의 새 터미널에만 필요한 환경을 적용하며 전역 PATH나 셸 설정은 수정하지 않는다. Helper와 Analyst는 기존 읽기 전용 권한을 유지한다.

연결 실패 시 명령 팔레트의 **Vibe Helper: Retry Core Connection**을 실행한다. 지원 버전 오류는 Kiro/Agent 버전을 확인한다. 작업 중 업데이트는 피하고, 종료 후 모든 Vibe Helper 창을 닫아 이전 Core lease가 해제된 뒤 재시작한다. 데이터 삭제로 연결 문제를 해결하지 않는다.

## 검증 범위

- VSIX 항목별 SHA-256/파일 수/개발 경로 누출 검사 및 Kiro 설치 parser.
- 별도 한국어·공백 설치 경로에서 bundled Node와 실제 SQLite/Core 시작, 두 host의 Core 공유, History 보존, lease 종료·재시작.
- 개발 도구 없는 선택 조건에서 Node/pnpm 준비, 실제 생성 프로젝트 명령, 재시작 후 기록 도구 재사용, launcher 변조와 잘못된 기록 거절.
- Core unit/integration, Agent fixture, 패널 host·권한·runtime 회귀.

유료 Kiro Agent의 새 Discovery→Builder→Helper 전체 완주, Intel Mac, 장기 사용과 다음 버전 업그레이드는 이 패키징 검사로 검증됐다고 주장하지 않는다. Windows 설치물은 Windows에서 별도로 만든다. 공개 Marketplace 게시나 사용자 일반 프로필 설치는 수행하지 않는다.

## 재현

Mac 패키징 구현은 이 저장소와 최신 [개발자 ZIP](DOWNLOAD_GUIDE.md#7-vsix가-작동하지-않을-때-개발자용-대안)에 포함된다. 프론트 경로는 반드시 명시한다. 과거 ZIP에 덮어쓰지 않는다.

고정 Node 24.19.0·pnpm 11.13.1 환경에서 frontend 의존성을 `npm ci --ignore-scripts`로 설치한 후, backend 폴더에서:

```sh
pnpm install --frozen-lockfile
pnpm panel:pack:macos ../frontend
node scripts/test-macos-package.mjs
```

Git checkout을 쓴다면 `../frontend`를 실제 program checkout 경로로 바꾼다. 패키징은 매번 `dist/macos-vsix-*`에 VSIX와 항목별 hash·출처 receipt를 만든다. 공식 Node archive 검증용 임시 폴더와 테스트 데이터는 보존한다. `node scripts/build-developer-source.mjs <frontend 경로>`는 두 Git checkout에서 개발자 ZIP을 만들며 게시 작업은 하지 않는다.

검증 환경 메모: 기존 개발 폴더의 `.local-experiments/kiro-native-recovery/biome.json`은 중첩 root로 format을 막는다. 해당 사용자 실험은 보존하고 **ZIP을 새 폴더에 풀어 전체 `pnpm check`를 통과**했다. E2E는 별도 `VIBE_E2E_FRONTEND_PORT=4573`을 사용했다. 이 결과를 원래 개발 폴더의 단일 check 성공으로 표현하지 않는다. 이전 0.1.0 검증 기록은 Git 이력과 `TASKS.md` T19-M1에 보존한다.
