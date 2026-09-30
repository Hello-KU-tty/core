# Windows VSIX 설치

현재 설치 후보는 Windows x64용 Vibe Helper **0.0.18**이다. 지원 기준은 Kiro IDE **1.1.70** / 내장 Agent **1.1.158**이다. Windows ARM64와 다른 Kiro·Agent 버전은 이번 검증 대상이 아니다.

**[Windows용 VSIX 0.0.18 다운로드](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/windows/0.0.18/builder-helper-agent-panel-0.0.18-win32-x64-74208fffa5c0.vsix)** · 2,573,191 bytes · [패키지 검증 receipt](../releases/windows/0.0.18/program-vsix-receipt.json)

위 링크에서 VSIX 파일을 바로 내려받는다. 다운로드한 파일의 SHA-256은 다음과 같다.

```text
8da34ce191799cbae5e19d11ed41e3148cd52bec7d174d3196dc192047aa5211
```

PowerShell에서 확인할 수 있다. 다른 폴더에 저장했다면 파일 경로를 바꾼다.

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\builder-helper-agent-panel-0.0.18-win32-x64-74208fffa5c0.vsix" -Algorithm SHA256
```

## 설치와 업데이트

1. [Kiro 공식 다운로드](https://kiro.dev/downloads/)에서 호환되는 **Windows (x64)** IDE를 설치하고 본인 계정으로 로그인한다.
2. Kiro Extensions(`Ctrl+Shift+X`)의 `…` → **Install from VSIX…**에서 위 파일을 선택한다.
3. 업데이트라면 진행 중인 작업을 완료하거나 중지하고 모든 Vibe Helper 창을 닫은 뒤 Kiro를 다시 연다. 새 설치라면 다시 로드 안내를 따른다.
4. 사용할 작업 폴더를 열고 본인이 사용할 폴더인지 확인한 뒤 Workspace Trust를 허용한다.
5. **Agent Panel**을 열어 학습 목표를 입력하거나 History에서 기존 프로젝트를 선택한다.

Core는 확장이 자동으로 준비한다. Node·pnpm 수동 설치나 별도 백엔드 실행은 필요하지 않다. 필요한 도구는 기존 설치를 검증해 재사용하거나 자동으로 준비하며, 첫 도구·의존성 다운로드와 Kiro 모델 사용에는 네트워크가 필요하다. 모델 사용량은 본인 Kiro 계정에서 소비된다. Helper 작업용 보조 Kiro 창이 열릴 수 있다.

## 0.0.18 변경과 복구

- MVP·Task 완료 후에도 Builder 입력과 전송을 유지한다. 실행·설명·수정 요청을 보내면 같은 workspace에서 후속 작업을 이어 간다. 횟수 제한이나 Final Upgrade·Evidence 분석 선행 조건은 없다. 이전 완료 보고와 작업 파일은 보존한다.
- Helper도 완료된 작업에 계속 질문할 수 있다. 기존 read-only 권한과 Evidence 출처 구분을 유지한다.
- 전체 권한이 거부된 것처럼 남던 경고를 고쳤다. 개별 도구 거부는 실행 기록의 `요청 제한`과 원인으로 표시한다. 실제 권한 경계나 실패 상태를 성공으로 바꾸지 않는다.

0.0.17에서 반영한 다음 수정도 포함한다.

- Kiro를 실행한 프로세스의 PATH가 바뀌어도 저장된 프로젝트의 Node·pnpm을 재검증해 우선 재사용한다.
- 저장된 도구가 사라지거나 변조되면 원인을 표시한다. `PROJECT_RECORDED_NODE_UNAVAILABLE` 또는 `PROJECT_RECORDED_PNPM_UNAVAILABLE`이면 기존 도구 설치 상태를 확인한다. `PROJECT_RECORDED_TOOLCHAIN_INVALID`이면 저장된 도구 설정과 실행기 변경 여부를 확인한다. 로컬 DB나 프로젝트를 삭제하지 않는다.
- 도우미 답변 끝부분을 다시 표시하던 `도우미 답변 요약` 영역을 제거했다. 실시간 답변, 사용자 질문과 대화 상태는 유지한다. 재접속 후 전체 답변 복원을 새로 추가한 버전은 아니다.

Core 연결 실패는 명령 팔레트(`Ctrl+Shift+P`)의 **Vibe Helper: Retry Core Connection**으로 재시도한다. 지원 버전·Agent 오류 등은 [공통 문제 해결](DOWNLOAD_GUIDE.md#6-업데이트와-문제-해결)을 확인한다.

## 검증 범위

이 파일은 2026-09-30 현재 Windows PC에서 생성·검증한 VSIX를 그대로 게시한 것이다. backend kit는 **2026.09.30.1**이며 VSIX 내부 71개 파일과 프론트에 적용한 kit 관리 파일 118개의 hash를 확인했다.

- Core `pnpm check`: unit 179, integration 411, eval 43, Campus Drop 3, smoke 6, E2E 12 통과. unit/integration은 각각 1개 skip이다.
- 확장 host CJS 171개, 프론트 57파일/807테스트와 타입 검사·빌드 통과.
- 실제 프론트 controller와 인증 HTTP/SSE·SQLite 연동 통과. 완료 후 Builder 3회·Helper 3회, 중복 전송, 재접속, 기존 완료 기록·파일 보존을 검증했다. Agent는 합성 fixture다.
- 기존 도구와 자동 설치 도구 모두 개발 PATH 없는 새 프로세스에서 재사용, frozen install, build, test, smoke와 HTTP 앱 실행 통과.
- 기록된 도구 누락·변경, launcher·shim·descriptor 변조와 downgrade 거부 검사 통과.

- 모든 Kiro 창을 정상 종료한 뒤 0.0.18을 설치하고 기존 프로젝트를 다시 열었다. 완료 상태의 Builder·Helper 입력 활성화, 기존 완료 보고, 연결 정상과 과거 권한 경고 제거를 확인했다. 설치된 프론트 번들·portable 파일 hash도 검증했다.

자동화 검증의 모델 호출은 0회다. **설치 후 실제 모델로 Discovery→Builder→Helper 전체 흐름을 완주한 결과와 다른 PC 실측은 아직 없다.** 모든 Builder 오류가 해결됐다는 뜻은 아니다. 상세 변경과 재현 명령은 [지속 대화 검증 기록](CONTINUOUS_BUILDER_20260930.md)을 참고한다.
