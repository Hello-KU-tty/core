# Windows VSIX 설치

현재 설치 후보는 Windows x64용 Vibe Helper **0.0.17**이다. 지원 기준은 Kiro IDE **1.1.70** / 내장 Agent **1.1.158**이다. Windows ARM64와 다른 Kiro·Agent 버전은 이번 검증 대상이 아니다.

**[Windows용 VSIX 0.0.17 다운로드](../releases/windows/0.0.17/builder-helper-agent-panel-0.0.17-win32-x64-828aca63a3be.vsix?raw=true)** · 2,570,177 bytes · [패키지 검증 receipt](../releases/windows/0.0.17/program-vsix-receipt.json)

GitHub 파일 화면이 열리면 **Download raw file**을 누른다. 다운로드한 파일의 SHA-256은 다음과 같다.

```text
b4634b3ef9c899a7295b5317b25293ad002545bb09126fe64f0afa8c5344bcd3
```

PowerShell에서 확인할 수 있다. 다른 폴더에 저장했다면 파일 경로를 바꾼다.

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\builder-helper-agent-panel-0.0.17-win32-x64-828aca63a3be.vsix" -Algorithm SHA256
```

## 설치와 업데이트

1. [Kiro 공식 다운로드](https://kiro.dev/downloads/)에서 호환되는 **Windows (x64)** IDE를 설치하고 본인 계정으로 로그인한다.
2. Kiro Extensions(`Ctrl+Shift+X`)의 `…` → **Install from VSIX…**에서 위 파일을 선택한다.
3. 업데이트라면 진행 중인 작업을 완료하거나 중지하고 모든 Vibe Helper 창을 닫은 뒤 Kiro를 다시 연다. 새 설치라면 다시 로드 안내를 따른다.
4. 사용할 작업 폴더를 열고 본인이 사용할 폴더인지 확인한 뒤 Workspace Trust를 허용한다.
5. **Agent Panel**을 열어 학습 목표를 입력하거나 History에서 기존 프로젝트를 선택한다.

Core는 확장이 자동으로 준비한다. Node·pnpm 수동 설치나 별도 백엔드 실행은 필요하지 않다. 필요한 도구는 기존 설치를 검증해 재사용하거나 자동으로 준비하며, 첫 도구·의존성 다운로드와 Kiro 모델 사용에는 네트워크가 필요하다. 모델 사용량은 본인 Kiro 계정에서 소비된다. Helper 작업용 보조 Kiro 창이 열릴 수 있다.

## 0.0.17 변경과 복구

- Kiro를 실행한 프로세스의 PATH가 바뀌어도 저장된 프로젝트의 Node·pnpm을 재검증해 우선 재사용한다.
- 저장된 도구가 사라지거나 변조되면 원인을 표시한다. `PROJECT_RECORDED_NODE_UNAVAILABLE` 또는 `PROJECT_RECORDED_PNPM_UNAVAILABLE`이면 기존 도구 설치 상태를 확인한다. `PROJECT_RECORDED_TOOLCHAIN_INVALID`이면 저장된 도구 설정과 실행기 변경 여부를 확인한다. 로컬 DB나 프로젝트를 삭제하지 않는다.
- 도우미 답변 끝부분을 다시 표시하던 `도우미 답변 요약` 영역을 제거했다. 실시간 답변, 사용자 질문과 대화 상태는 유지한다. 재접속 후 전체 답변 복원을 새로 추가한 버전은 아니다.

Core 연결 실패는 명령 팔레트(`Ctrl+Shift+P`)의 **Vibe Helper: Retry Core Connection**으로 재시도한다. 지원 버전·Agent 오류 등은 [공통 문제 해결](DOWNLOAD_GUIDE.md#6-업데이트와-문제-해결)을 확인한다.

## 검증 범위

이 파일은 2026-09-29 현재 Windows PC에서 생성·검증한 VSIX를 그대로 게시한 것이다. backend kit는 **2026.09.29.4**이며 VSIX 내부 71개 파일과 프론트에 적용한 kit 관리 파일 118개의 hash를 확인했다.

- Core `pnpm check`: unit 179, integration 402, eval 42, Campus Drop 3, smoke 6, E2E 12 통과. unit/integration은 각각 1개 skip이다.
- 확장 host CJS 169개, 프론트 57파일/800테스트와 타입 검사·빌드 통과.
- 실제 프론트 controller와 인증 HTTP/SSE·SQLite 연동 통과. Agent는 합성 fixture다.
- 기존 도구와 자동 설치 도구 모두 개발 PATH 없는 새 프로세스에서 재사용, frozen install, build, test, smoke와 HTTP 앱 실행 통과.
- 기록된 도구 누락·변경, launcher·shim·descriptor 변조와 downgrade 거부 검사 통과.

이번 검사에서 모델 호출은 0회다. **0.0.17을 Kiro에 설치한 뒤 실제 모델로 Discovery→Builder→Helper 전체 흐름을 완주한 결과와 다른 PC 실측은 아직 없다.** 모든 Builder 오류가 해결됐다는 뜻은 아니다. 소스 수정과 VSIX 게시 범위는 별도이며, 이 문서는 공개된 설치 파일의 검증 결과를 설명한다.
