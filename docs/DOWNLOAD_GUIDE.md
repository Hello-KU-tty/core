# Hello Vibe 다운로드·설치 가이드

Hello Vibe는 Kiro IDE 안에서 사용하는 확장입니다. 먼저 운영체제에 맞는 VSIX를 설치하세요. 개발자용 ZIP과 소스 빌드는 VSIX가 작동하지 않을 때 사용하는 개발자용 대안입니다.

## 1. 설치 전 확인

| 항목 | 준비 사항 |
| --- | --- |
| 운영체제 | Mac 설치 후보는 Apple Silicon(`darwin-arm64`)용입니다. Intel Mac은 지원하지 않습니다. Windows x64 설치 안내는 해당 설치물의 조건을 따릅니다. Windows ARM64·Linux는 미검증입니다. |
| Kiro | 검증 기준은 Kiro IDE **1.1.70**, 내장 Agent **1.1.158**입니다. 제공받은 VSIX의 설치 안내에서 호환 버전을 확인하세요. |
| 계정 | Kiro에 로그인할 본인 계정과 사용 가능한 모델 사용량이 필요합니다. |
| 네트워크 | 로그인·Agent 호출과 첫 실행의 도구·의존성 다운로드에 필요합니다. |

다른 Kiro 버전은 호환 검사를 통과하지 못할 수 있습니다. Kiro 자체의 OS 지원과 Hello Vibe의 지원 범위는 다릅니다. Apple Silicon Mac 설치 후보와 검증 한계는 [Mac 설치 안내](MAC_VSIX.md)를 확인하세요.

Windows x64 설치 후보와 검증 한계는 [Windows 설치 안내](WINDOWS_VSIX.md)를 확인하세요.

별도 Hello Vibe 계정이나 API Key는 필요하지 않습니다. 모델 사용량은 본인의 Kiro 계정에서 소비됩니다. 프로젝트 상태는 로컬 SQLite에 저장되며, Agent 요청에는 Kiro의 모델 서비스가 사용됩니다.

## 2. Kiro IDE 다운로드

1. [Kiro 공식 다운로드 페이지](https://kiro.dev/downloads/)를 엽니다.
2. **IDE** 항목에서 호환 버전과 자신의 OS를 선택합니다. Apple Silicon Mac은 **macOS (Apple Silicon)**, Windows x64는 **Windows (x64)**입니다.
3. 설치 파일을 실행하고 Kiro를 엽니다.
4. 화면 안내에 따라 본인 계정으로 로그인합니다.

Hello Vibe는 IDE 확장이므로 다운로드 페이지의 CLI·Crew가 아닌 **IDE**를 선택하세요.

## 3. VSIX 다운로드

### Windows (x64)

**[Windows용 VSIX 0.0.18 다운로드](../releases/windows/0.0.18/builder-helper-agent-panel-0.0.18-win32-x64-74208fffa5c0.vsix?raw=true)**

GitHub 파일 화면이 열리면 **Download raw file**을 누릅니다. Windows x64용이며, Kiro IDE **1.1.70** / 내장 Agent **1.1.158**을 기준으로 합니다. 파일 무결성 확인과 설치·복구 방법은 [Windows 설치 안내](WINDOWS_VSIX.md)를 따르세요.

0.0.18은 MVP 완료 후에도 빌더와 도우미를 계속 사용할 수 있습니다. 실행·설명·수정 요청은 같은 프로젝트의 후속 작업으로 이어지며 기존 완료 기록을 보존합니다. 도구 요청 제한은 해당 실행 기록에 표시하고 전체 권한 거부처럼 남겨 두지 않습니다. 0.0.17의 도구 재사용과 중복 요약 제거도 포함합니다. 검증 범위는 [Windows 설치 안내](WINDOWS_VSIX.md)를 확인하세요.

### Mac (Apple Silicon)

**[Mac용 VSIX 고정 다운로드 경로](../releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix?raw=true)**

공개본은 **0.1.1**이며 이 checkout에는 공개 frontend 0.0.18 기준의 **0.1.3 로컬 후보**를 준비했습니다. 이번 변경은 push하지 않았으므로 공개 URL에는 아직 반영되지 않았습니다. 기존 주소·파일명은 유지하며 새 후보는 구 확장 제거·프로젝트 이동 후 도구 복구와 임시 경로 설치 시 native 역할 설정 충돌을 보완합니다. 설치 파일 내부 버전과 [receipt](../releases/macos/0.1.0/macos-vsix-receipt.json)를 대조하세요.

GitHub 파일 화면이 열리면 **Download raw file**을 누릅니다. Apple Silicon(M1 이상)용이며 Intel Mac용 파일은 아닙니다. Kiro는 `/Applications/Kiro.app`에 설치합니다. 파일 무결성 확인과 자세한 설치·복구 방법은 [Mac 설치 안내](MAC_VSIX.md)를 따르세요.

이 후보는 격리 프로필 설치와 실제 Core/SQLite·도구·구 설치 제거/이동 복구 자동 검사를 통과했습니다. 실제 모델로 Discovery/Spec→앱 생성·실행, Decision 선택·반영, 별도 Helper, 재시작 복원과 실행 중 취소·재개를 확인했습니다. 실패 후 복구와 검증 한계는 [실제 설치본 검증 보고](MAC_NATIVE_VERIFICATION_20260930.md)를 보세요. 다음 개인화·MVP 전체, 실제 IDE 자동 업데이트 전체와 장기 사용까지 검증한 것은 아닙니다.

## 4. Kiro에 확장 설치

1. Kiro에서 **Extensions** 화면을 엽니다 (Mac: `Cmd+Shift+X`, Windows: `Ctrl+Shift+X`).
2. 확장 화면의 `…` 메뉴에서 **Install from VSIX…**를 선택합니다.
3. 내려받은 운영체제별 제품 `.vsix` 파일을 선택합니다.
4. 설치 완료 후 다시 로드 안내가 나오면 실행합니다.
5. 왼쪽 **Agent Panel**을 엽니다.

작업 폴더를 열고 Workspace Trust 확인이 나오면 본인이 사용할 폴더인지 확인한 뒤 신뢰합니다. 확장이 생성 프로젝트 폴더를 열어 주면 해당 폴더에서 이어서 진행합니다.

Core는 확장이 자동으로 준비하고 연결합니다. 처음에는 연결 준비 표시가 나타날 수 있으며, 필요한 실행 도구는 기존 도구를 재사용하거나 자동으로 준비합니다. 사용자가 connection 파일이나 인증 token을 입력할 필요는 없습니다.

## 5. 첫 프로젝트 시작

1. Agent Panel의 **학습 목표**에 배우고 싶은 기술을 입력합니다. 예: `TypeScript로 상태에 따라 화면이 달라지는 앱을 만들어 보고 싶어요.`
2. 개인적인 필요나 최근의 불편이 있다면 선택 입력에 적습니다.
3. **후보 만나기**를 누르고 제안된 프로젝트를 살펴봅니다.
4. 후보를 선택하고 Learning Spec을 확인·수정한 뒤 시작합니다.
5. Builder의 개발 흐름을 확인하고, 궁금한 판단은 Helper에게 질문합니다.
6. 작업 완료 후 결과 실행 기능으로 생성된 서비스를 엽니다. 저장된 프로젝트는 History에서 확인할 수 있습니다.

Helper·분석 작업에 필요한 보조 Kiro 창이 열릴 수 있습니다. 실행 중인 작업이 있다면 창을 닫기 전에 완료 또는 중지 상태를 확인하세요.

## 6. 업데이트와 문제 해결

업데이트할 때는 진행 중인 작업을 완료하거나 중지한 뒤 새 제품 VSIX를 설치합니다. 설치 후 Kiro를 완전히 종료했다가 다시 열어 새 확장과 Core를 사용하세요. 저장된 프로젝트가 History에 표시되는지 확인합니다.

| 증상 | 확인·복구 방법 |
| --- | --- |
| 설치 파일을 찾을 수 없음 | 위 다운로드 절의 파일 등록 상태를 확인하고, 담당자에게 제품 VSIX를 요청합니다. |
| VSIX를 설치할 수 없음 | 소스 ZIP이 아닌 `.vsix`인지, Mac은 `darwin-arm64` 등 OS·CPU가 맞는지, Kiro 버전이 해당 설치물의 조건과 맞는지 확인합니다. |
| 작업 폴더 신뢰 요청 | 본인이 사용할 작업 폴더를 열고 Workspace Trust를 확인합니다. |
| Core 연결 실패 | 명령 팔레트(Mac: `Cmd+Shift+P`, Windows: `Ctrl+Shift+P`)에서 **Vibe Helper: Retry Core Connection**을 실행합니다. 연결 후 필요하면 창을 다시 로드합니다. |
| `NATIVE_INSTALLATION_*` 또는 호환성 오류 | 해당 VSIX가 지원하는 Kiro·내장 Agent 버전을 확인합니다. 다른 버전의 지원은 별도 검증이 필요합니다. |
| 다운로드·의존성 설치 실패 | 네트워크 연결과 오류 메시지를 확인하고 준비를 재시도합니다. |
| Agent 오류·시간 초과 | 기존 작업의 종료 상태와 저장된 결과를 먼저 확인한 뒤 재시도합니다. 반복 클릭으로 새 요청을 겹치지 않게 합니다. |

문제가 계속되면 OS, Kiro 버전, VSIX 파일명과 화면의 오류 코드를 담당자에게 전달하세요. 로그인 정보·token·개인 대화 원문은 포함하지 마세요. 연결 문제 해결을 위해 로컬 DB나 프로젝트 폴더를 삭제할 필요는 없습니다.

## 7. VSIX가 작동하지 않을 때: 개발자용 대안

먼저 위 오류 해결 절차로 OS·Kiro 버전과 연결 상태를 확인하세요. 계속 실패하고 개발 환경을 준비할 수 있다면 아래 방법으로 설치물을 재빌드할 수 있습니다. 빌드 성공이 Kiro 호환성 문제의 해결을 보장하지는 않습니다.

### Mac: 소스에서 VSIX 재빌드

[Mac 설치 안내의 재현 절차](MAC_VSIX.md#재현)에 따라 Core와 프론트 소스, Node.js 24.19.0·pnpm 11.13.1을 준비하고 `pnpm panel:pack:macos <frontend 경로>`로 새 VSIX를 만듭니다. 아래 개발자 ZIP에도 두 저장소 소스가 포함됩니다. 생성된 `darwin-arm64.vsix`를 **Install from VSIX…**로 설치합니다.

### Mac·Windows: 개발자용 소스 ZIP

**[개발자용 소스 ZIP 다운로드](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/frontend-handoff/20260927/frontend-handoff-20260927.zip)** · [파일·SHA-256·검증 기록](../releases/frontend-handoff/20260927/README.md)

기존 주소·파일명의 공개본은 **2026-09-30 전체 실행 소스 snapshot**입니다. 이 checkout의 복구 보완 ZIP은 로컬 후보이며 push 전까지 공개 다운로드는 이전 파일입니다. 해당 파일의 receipt/hash를 함께 확인하세요. `backend/`와 `frontend/`(0.0.18), 파일별 hash를 기록한 `SOURCE_MANIFEST.json`을 포함합니다. 과거 update kit이나 이전 checkout에 덮어쓰지 말고 **새 폴더**에 압축을 푸세요. 20260926 kit 선행 적용은 필요하지 않습니다.

1. ZIP을 내려받고 SHA-256을 [현재 receipt](../releases/frontend-handoff/20260927/frontend-handoff-receipt.json)와 비교합니다.
2. 새 개발 폴더에 풀고 ZIP 최상위 `README.md`를 읽습니다. Git clone 없이 빌드할 수 있습니다.
3. `frontend/`에서 `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build`를 실행합니다.
4. `backend/`에서 `pnpm install --frozen-lockfile`을 실행합니다. Mac은 `pnpm panel:pack:macos ../frontend`로 빌드합니다. Windows는 `frontend/`에서 `node ../backend/examples/frontend-handoff/package-program.mjs .`를 실행합니다.
5. 생성된 운영체제별 `.vsix`를 Kiro에 설치합니다. ZIP 자체를 **Install from VSIX…**에 넣지 않습니다.

포함된 Windows portable은 공개 frontend의 kit `2026.09.30.1` 원본이며 runtime dependencies와 라이선스를 포함합니다. Mac에서는 실행하지 않으며 별도 arm64 portable을 빌드합니다. 계정·DB·대화·개발 node_modules는 포함하지 않습니다. 빌드 도구와 의존성을 받으려면 네트워크가 필요합니다.

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\frontend-handoff-20260927.zip" -Algorithm SHA256
```

Mac에서는 `shasum -a 256 <다운로드한 ZIP>`으로 확인합니다. 같은 URL의 갱신 파일은 [현재 receipt](../releases/frontend-handoff/20260927/frontend-handoff-receipt.json)의 SHA-256으로 구분합니다.

### 개발 환경과 검증

이 저장소를 수정·검증하려면 [README의 개발 환경과 검증](../README.md#개발-환경과-검증)을 따릅니다. 개발 도구는 Node.js **24.19.0**, pnpm **11.13.1**로 고정되어 있습니다.

- [프론트 연동·패키징 인계](FRONTEND_HANDOFF.md)
- [Windows 일반 설치 검증과 지원 범위](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md)
- [macOS 개발 검증 기록](FRONTEND_MAC_PROGRESS_20260928.md)

위 검증 기록의 과거 버전·파일은 당시 결과입니다. 실제 설치 대상은 담당자가 제공한 제품 VSIX와 해당 설치 안내를 기준으로 선택하세요.
