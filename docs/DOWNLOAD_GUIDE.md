# Vibe Helper 다운로드·설치 가이드

Vibe Helper는 Kiro IDE 안에서 사용하는 확장입니다. 먼저 운영체제에 맞는 VSIX를 설치하세요. 개발자용 ZIP과 소스 빌드는 VSIX가 작동하지 않을 때 사용하는 개발자용 대안입니다.

## 1. 설치 전 확인

| 항목 | 준비 사항 |
| --- | --- |
| 운영체제 | Mac 설치 후보는 Apple Silicon(`darwin-arm64`)용입니다. Intel Mac은 지원하지 않습니다. Windows x64 설치 안내는 해당 설치물의 조건을 따릅니다. Windows ARM64·Linux는 미검증입니다. |
| Kiro | 검증 기준은 Kiro IDE **1.1.70**, 내장 Agent **1.1.158**입니다. 제공받은 VSIX의 설치 안내에서 호환 버전을 확인하세요. |
| 계정 | Kiro에 로그인할 본인 계정과 사용 가능한 모델 사용량이 필요합니다. |
| 네트워크 | 로그인·Agent 호출과 첫 실행의 도구·의존성 다운로드에 필요합니다. |

다른 Kiro 버전은 호환 검사를 통과하지 못할 수 있습니다. Kiro 자체의 OS 지원과 Vibe Helper의 지원 범위는 다릅니다. Apple Silicon Mac 설치 후보와 검증 한계는 [Mac 설치 안내](MAC_VSIX.md)를 확인하세요.

Windows x64 설치 후보와 검증 한계는 [Windows 설치 안내](WINDOWS_VSIX.md)를 확인하세요.

별도 Vibe Helper 계정이나 API Key는 필요하지 않습니다. 모델 사용량은 본인의 Kiro 계정에서 소비됩니다. 프로젝트 상태는 로컬 SQLite에 저장되며, Agent 요청에는 Kiro의 모델 서비스가 사용됩니다.

## 2. Kiro IDE 다운로드

1. [Kiro 공식 다운로드 페이지](https://kiro.dev/downloads/)를 엽니다.
2. **IDE** 항목에서 호환 버전과 자신의 OS를 선택합니다. Apple Silicon Mac은 **macOS (Apple Silicon)**, Windows x64는 **Windows (x64)**입니다.
3. 설치 파일을 실행하고 Kiro를 엽니다.
4. 화면 안내에 따라 본인 계정으로 로그인합니다.

Vibe Helper는 IDE 확장이므로 다운로드 페이지의 CLI·Crew가 아닌 **IDE**를 선택하세요.

## 3. VSIX 다운로드

### Windows (x64)

**[Windows용 VSIX 0.0.17 다운로드](../releases/windows/0.0.17/builder-helper-agent-panel-0.0.17-win32-x64-828aca63a3be.vsix?raw=true)**

GitHub 파일 화면이 열리면 **Download raw file**을 누릅니다. Windows x64용이며, Kiro IDE **1.1.70** / 내장 Agent **1.1.158**을 기준으로 합니다. 파일 무결성 확인과 설치·복구 방법은 [Windows 설치 안내](WINDOWS_VSIX.md)를 따르세요.

0.0.17은 Kiro 실행 환경의 PATH가 달라져도 기존 Node·pnpm을 재검증해 재사용하며, 답변 끝부분을 반복하던 도우미 요약 영역을 제거했습니다. Core 전체 검사, 프론트 800개 테스트와 배포 런타임의 도구 재사용·앱 실행 검사를 통과했습니다. 이 VSIX를 설치한 후 실제 모델로 전체 흐름을 완주하거나 다른 PC에서 검증한 것은 아닙니다.

### Mac (Apple Silicon)

**[Mac용 VSIX 0.1.0 다운로드](../releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix?raw=true)**

GitHub 파일 화면이 열리면 **Download raw file**을 누릅니다. Apple Silicon(M1 이상)용이며 Intel Mac용 파일은 아닙니다. Kiro는 `/Applications/Kiro.app`에 설치합니다. 파일 무결성 확인과 자세한 설치·복구 방법은 [Mac 설치 안내](MAC_VSIX.md)를 따르세요.

이 후보는 격리 프로필 설치와 실제 Core/SQLite·도구 자동 검사를 통과했습니다. 이 패키지에서 유료 모델의 Discovery→Builder→Helper 전체 흐름, 장기 사용과 업그레이드까지 검증한 것은 아닙니다.

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

[Mac 설치 안내의 재현 절차](MAC_VSIX.md#재현)에 따라 Core와 프론트 소스, Node.js 24.19.0·pnpm 11.13.1을 준비하고 `pnpm panel:pack:macos`로 새 VSIX를 만듭니다. 생성된 `darwin-arm64.vsix`를 **Install from VSIX…**로 설치합니다. 아래 Windows ZIP은 Mac runtime을 포함하지 않아 Mac용 대안으로 사용할 수 없습니다.

### Windows: 개발자용 ZIP

**[개발자용 update kit ZIP 다운로드](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/frontend-handoff/20260927/frontend-handoff-20260927.zip)** · [저장소 파일 위치](../releases/frontend-handoff/20260927/frontend-handoff-20260927.zip)

이 파일은 **20260927 업데이트 kit**으로, 이미 20260926 kit이 적용된 `Hello-KU-tty/program`의 `048bce383a774f429f8868949d4ba2f95a63c66a` 소스가 대상입니다. 최신 제품 설치본이 아니므로 다른 revision에 그대로 덮어쓰지 마세요. [적용 대상](../releases/frontend-handoff/20260927/README.md)을 먼저 확인합니다.

1. ZIP을 내려받고 아래 SHA-256을 [receipt](../releases/frontend-handoff/20260927/frontend-handoff-receipt.json)와 비교합니다.
2. 원하는 개발 폴더에 압축을 풉니다. 최초 적용이라면 [20260926 최초 kit](../releases/frontend-handoff/20260926/frontend-handoff-20260926.zip)과 [최초 적용 안내](FRONTEND_WINDOWS_QUICKSTART.md)를 먼저 따릅니다.
3. 개발용 Node.js·npm·Git을 준비하고 [20260927 적용·빌드·VSIX 패키징 안내](FRONTEND_HANDOFF_20260927.md)에 따라 대상 프론트 소스에 적용합니다.
4. 생성된 제품 `.vsix`를 Kiro에 설치합니다. ZIP 자체를 **Install from VSIX…**에 넣지 않습니다.

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\frontend-handoff-20260927.zip" -Algorithm SHA256
```

기대 SHA-256: `4c9b338bcdc24f72afa0eaf61c70c5c54d13a780fabf7fb5440df5cce378f0d9`.

### 개발 환경과 검증

이 저장소를 수정·검증하려면 [README의 개발 환경과 검증](../README.md#개발-환경과-검증)을 따릅니다. 개발 도구는 Node.js **24.19.0**, pnpm **11.13.1**로 고정되어 있습니다.

- [프론트 연동·패키징 인계](FRONTEND_HANDOFF.md)
- [Windows 일반 설치 검증과 지원 범위](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md)
- [macOS 개발 검증 기록](FRONTEND_MAC_PROGRESS_20260928.md)

위 검증 기록의 과거 버전·파일은 당시 결과입니다. 실제 설치 대상은 담당자가 제공한 제품 VSIX와 해당 설치 안내를 기준으로 선택하세요.
