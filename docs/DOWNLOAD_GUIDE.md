# Vibe Helper 다운로드·설치 가이드

Vibe Helper는 Kiro IDE 안에서 사용하는 확장입니다. 일반 사용자는 Kiro와 제품 VSIX만 설치하면 됩니다. 백엔드 저장소 다운로드, Node.js·pnpm 수동 설치, 별도 서버 실행은 필요하지 않습니다.

## 1. 설치 전 확인

| 항목 | 준비 사항 |
| --- | --- |
| 운영체제 | Windows x64. Windows ARM64·Linux용 제품 설치는 검증되지 않았습니다. |
| Kiro | 검증 기준은 Kiro IDE **1.1.70**, 내장 Agent **1.1.158**입니다. 받을 VSIX의 Release 노트에서 호환 버전을 확인하세요. |
| 계정 | Kiro에 로그인할 본인 계정과 사용 가능한 모델 사용량이 필요합니다. |
| 네트워크 | 로그인·Agent 호출과 첫 실행의 도구·의존성 다운로드에 필요합니다. |

다른 Kiro 버전은 호환 검사를 통과하지 못할 수 있습니다. Kiro 자체의 OS 지원과 Vibe Helper의 지원 범위는 다릅니다. macOS의 실제 프론트 실행은 현재 개발 검증용이며, 일반 사용자용 Mac 설치물로 안내하지 않습니다.

별도 Vibe Helper 계정이나 API Key는 필요하지 않습니다. 모델 사용량은 본인의 Kiro 계정에서 소비됩니다. 프로젝트 상태는 로컬 SQLite에 저장되며, Agent 요청에는 Kiro의 모델 서비스가 사용됩니다.

## 2. Kiro IDE 다운로드

1. [Kiro 공식 다운로드 페이지](https://kiro.dev/downloads/)를 엽니다.
2. **IDE** 항목에서 호환 버전의 **Windows (x64)** 설치 파일을 받습니다.
3. 설치 파일을 실행하고 Kiro를 엽니다.
4. 화면 안내에 따라 본인 계정으로 로그인합니다.

Vibe Helper는 IDE 확장이므로 다운로드 페이지의 CLI·Crew가 아닌 **IDE**를 선택하세요.

## 3. Vibe Helper VSIX 다운로드

1. [Vibe Helper 제품 Releases](https://github.com/Hello-KU-tty/program/releases)를 엽니다.
2. 사용할 Release의 지원 OS·Kiro 버전과 알려진 제한을 확인합니다.
3. **Assets**에서 이름에 `win32-x64`가 있고 확장자가 `.vsix`인 제품 파일을 받습니다.

파일명 예시는 `builder-helper-agent-panel-<버전>-win32-x64-<해시>.vsix`입니다. 실제 버전과 파일명은 해당 Release를 따릅니다. `Source code (zip)`·`Source code (tar.gz)`는 개발용 소스이며 Kiro에 설치할 확장 파일이 아닙니다. `frontend-handoff` ZIP도 프론트 개발자용 인계 자료입니다.

**Release 또는 VSIX가 보이지 않는 경우:** 저장소 접근 권한이나 배포 상태를 확인하고 프로젝트 담당자에게 제품 VSIX를 요청하세요. 2026-09-29 이 가이드 작성 시 인증 없는 GitHub API 조회에서는 공개 최신 Release를 확인하지 못했습니다. 로컬 검토 후보가 있다는 기록만으로 다운로드 가능한 공개 배포본이 있다고 보장하지 않습니다.

배포자가 SHA-256을 제공했다면 PowerShell에서 아래 명령을 실행하고 공개된 값과 비교할 수 있습니다. 경로는 실제 받은 파일로 바꿉니다.

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\<받은-VSIX-파일명>.vsix" -Algorithm SHA256
```

## 4. Kiro에 확장 설치

1. Kiro에서 **Extensions** 화면을 엽니다 (`Ctrl+Shift+X`).
2. 확장 화면의 `…` 메뉴에서 **Install from VSIX…**를 선택합니다.
3. 내려받은 `.vsix` 파일을 선택합니다.
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
| Release가 없거나 404가 표시됨 | GitHub 저장소 접근 권한을 확인하고, 담당자에게 배포된 제품 VSIX를 요청합니다. |
| VSIX를 설치할 수 없음 | 소스 ZIP이 아닌 `.vsix`인지, Windows x64용인지, Kiro 버전이 Release의 조건과 맞는지 확인합니다. |
| 작업 폴더 신뢰 요청 | 본인이 사용할 작업 폴더를 열고 Workspace Trust를 확인합니다. |
| Core 연결 실패 | 명령 팔레트(`Ctrl+Shift+P`)에서 **Vibe Helper: Retry Core Connection**을 실행합니다. 연결 후 필요하면 창을 다시 로드합니다. |
| `NATIVE_INSTALLATION_*` 또는 호환성 오류 | 해당 VSIX가 지원하는 Kiro·내장 Agent 버전을 확인합니다. 다른 버전의 지원은 별도 검증이 필요합니다. |
| 다운로드·의존성 설치 실패 | 네트워크 연결과 오류 메시지를 확인하고 준비를 재시도합니다. |
| Agent 오류·시간 초과 | 기존 작업의 종료 상태와 저장된 결과를 먼저 확인한 뒤 재시도합니다. 반복 클릭으로 새 요청을 겹치지 않게 합니다. |

문제가 계속되면 OS, Kiro 버전, VSIX 파일명과 화면의 오류 코드를 담당자에게 전달하세요. 로그인 정보·token·개인 대화 원문은 포함하지 마세요. 연결 문제 해결을 위해 로컬 DB나 프로젝트 폴더를 삭제할 필요는 없습니다.

## 개발자용 안내

이 저장소를 수정·검증하려면 [README의 개발 환경과 검증](../README.md#개발-환경과-검증)을 따릅니다. 개발 도구는 Node.js **24.19.0**, pnpm **11.13.1**로 고정되어 있습니다.

- [프론트 연동·패키징 인계](FRONTEND_HANDOFF.md)
- [Windows 일반 설치 검증과 지원 범위](spikes/T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md)
- [macOS 개발 검증 기록](FRONTEND_MAC_PROGRESS_20260928.md)

위 검증 기록의 과거 버전·파일은 당시 결과입니다. 실제 다운로드·설치 대상은 제공받은 Release의 제품 VSIX를 기준으로 선택하세요.
