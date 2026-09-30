# Mac VSIX 설치

현재 설치물은 Apple Silicon Mac(`darwin-arm64`)용 Hello Vibe **0.1.3**다. 공개 frontend **0.0.18 (`a61d408`, checkout `e65cd7f`)**과 Core `d8768d1`의 복구 변경을 포함한다. 완료 뒤 지속 대화·중복 요약 제거, 구 설치 제거·프로젝트 이동 후 도구 복구와 임시 경로에서 개발용 receipt가 native 설정 검사에 충돌하는 문제를 보완했다. Kiro IDE 1.1.70 / 내장 Agent 1.1.158 / API 1.131.0의 source hash를 확인한다. Kiro는 `/Applications/Kiro.app`에 설치하고 본인 계정으로 로그인한다. Intel Mac은 지원 대상이 아니다.

[Mac용 VSIX 고정 경로](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix) · 41,583,184 bytes · SHA-256 `ff3ead843bde482d4fc575b175075c4606f44afc37a70bedd57819646c843e53`

2026-09-30 사용자 승인으로 기존 다운로드 경로에 **0.1.3**을 제공한다. 기존 주소·파일명의 `0.1.0`은 호환 경로이며 설치 파일 내부 버전과 [receipt](../releases/macos/0.1.0/macos-vsix-receipt.json)·[항목별 hash](../releases/macos/0.1.0/files.json)로 구분한다. Windows0.0.18 설치물은 변경하지 않았다.

위 링크에서 VSIX 파일을 바로 내려받는다. 다운로드 후 터미널에서 아래 값이 위 SHA-256과 같은지 확인할 수 있다.

```sh
shasum -a 256 ~/Downloads/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix
```

0.1.3은 Kiro 격리 프로필 설치 및 실제 패키지 자산 Core/SQLite lifecycle·도구 재사용·변조 거절·업그레이드/이동 복구·native 역할 설정 **9개 검사 PASS**다. 설치 자산69개 및 개발자 ZIP 재빌드72항목 hash가 일치한다. 자동 검사는 [검증 상태](VALIDATION_STATUS_20260930.md), 실제 모델 검증은 [후속 보고](MAC_NATIVE_VERIFICATION_20260930.md)로 구분한다. ZIP timestamp로 압축 파일 전체 hash는 달라질 수 있다.

## 설치와 사용

1. [Kiro 공식 다운로드](https://kiro.dev/downloads/)에서 호환 버전의 **macOS (Apple Silicon)** IDE를 받아 `/Applications/Kiro.app`에 설치하고 로그인한다.
2. 위 VSIX를 받은 뒤 Kiro Extensions(`Cmd+Shift+X`)의 `…` → **Install from VSIX…**에서 파일을 선택한다.
3. 다시 로드한 뒤 **Agent Panel**을 연다.
4. 사용할 작업 폴더를 신뢰하고 학습 목표를 입력한다. 생성 프로젝트나 Helper용 보조 창이 열리면 해당 폴더의 신뢰 여부를 확인한다.

개발 저장소, Homebrew, Node/pnpm 수동 설치나 별도 서버 기동은 필요하지 않다. Core는 호환 런타임을 확인하고 필요하면 VSIX에 포함된 공식 Node 24.19.0을 private cache에 준비한다. 생성 앱용 Node도 해시별 cache에 보존하며 재사용 전에 무결성을 확인한다. pnpm 11.13.1은 첫 실행 때 무결성을 확인해 전용 저장소에 준비한다. pnpm 및 생성 앱 의존성 다운로드, Kiro 로그인과 모델 사용에는 네트워크가 필요하다.

Core/SQLite는 확장 전용 global storage 아래 `core-data`, 생성 프로젝트는 그 안의 `workspaces`에 저장한다. 설치 폴더와 사용자 데이터를 분리한다. 생성 폴더의 새 터미널에만 필요한 환경을 적용하며 전역 PATH나 셸 설정은 수정하지 않는다. Helper와 Analyst는 기존 읽기 전용 권한을 유지한다.

연결 실패 시 명령 팔레트의 **Vibe Helper: Retry Core Connection**을 실행한다. 지원 버전 오류는 Kiro/Agent 버전을 확인한다. 작업 중 업데이트는 피하고, 종료 후 모든 Vibe Helper 창을 닫아 이전 Core lease가 해제된 뒤 재시작한다. 데이터 삭제로 연결 문제를 해결하지 않는다.

프로젝트 폴더를 옮기면 새 프로젝트의 도구 준비는 계속 가능하지만 이동한 프로젝트를 자동 재연결하지 않는다. 기존 History의 작업을 이어 쓰려면 원래 경로를 복원한다. `PROJECT_RECORDED_NODE_UNAVAILABLE`, `PROJECT_RECORDED_TOOLCHAIN_INVALID`나 cache 무결성 오류가 계속되면 오류 코드와 버전을 보고하고 descriptor/shim/DB를 임의 삭제하지 않는다.

## 검증 범위

- VSIX 항목별 SHA-256/파일 수/개발 경로 누출 검사 및 Kiro 설치 parser.
- 별도 한국어·공백 설치 경로에서 bundled Node와 실제 SQLite/Core 시작, 두 host의 Core 공유, History 보존, lease 종료·재시작.
- 개발 도구 없는 선택 조건에서 Node/pnpm 준비, 실제 생성 프로젝트 명령, 재시작 후 기록 도구 재사용, launcher 변조와 잘못된 기록 거절.
- Core unit/integration, Agent fixture, 패널 host·권한·runtime 회귀.

구 설치 폴더가 제거된 상태와 유일한 프로젝트가 이동된 상태는 실제 패키지 자산으로 격리 재현했다. 자동 검사는 실제 Kiro의 자동 정리 시점 전체·모델 의미 품질·Intel Mac·장기 사용을 입증하지 않는다. 실제 설치본의 단계별 모델 결과와 실패·미검증 항목은 후속 보고에 남긴다. Windows 설치물은 Windows에서 별도로 만든다. 공개 Marketplace 게시나 사용자 일반 프로필 설치는 수행하지 않는다.

## 재현

Mac 패키징 구현은 이 저장소와 최신 [개발자 ZIP](DOWNLOAD_GUIDE.md#7-vsix가-작동하지-않을-때-개발자용-대안)에 포함된다. 프론트 경로는 반드시 명시한다. 과거 ZIP에 덮어쓰지 않는다.

고정 Node 24.19.0·pnpm 11.13.1 환경에서 frontend 의존성을 `npm ci --ignore-scripts`로 설치한 후, backend 폴더에서:

```sh
pnpm install --frozen-lockfile
pnpm panel:pack:macos ../frontend
node scripts/test-macos-package.mjs
```

Git checkout을 쓴다면 `../frontend`를 실제 program checkout 경로로 바꾼다. 패키징은 매번 `dist/macos-vsix-*`에 VSIX와 항목별 hash·출처 receipt를 만든다. 공식 Node archive 검증용 임시 폴더와 테스트 데이터는 보존한다. `node scripts/build-developer-source.mjs <frontend 경로>`는 두 Git checkout에서 개발자 ZIP을 만들며 게시 작업은 하지 않는다.

검증 환경 메모: 기존 개발 폴더의 `.local-experiments/kiro-native-recovery/biome.json`은 중첩 root로 format을 막는다. 해당 사용자 실험은 보존하고 **ZIP을 새 폴더에 풀어 전체 `pnpm check`를 통과**했다. 0.1.3 E2E는 기존4173 서버를 종료하지 않고 `VIBE_E2E_FRONTEND_PORT=43173`을 사용했다. 이 결과를 원래 개발 폴더의 단일 check 성공으로 표현하지 않는다. 이전0.1.0~0.1.2 결과는 Git 이력과 TASKS에 보존한다.
