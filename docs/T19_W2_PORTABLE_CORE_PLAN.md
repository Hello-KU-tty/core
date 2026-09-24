# T19-W2 portable Core·runtime 계획

> 2026-09-24 · 사용자 `T19 w2` 요청으로 착수. [W1 결과](spikes/T19_W1_WINDOWS_CAPABILITY_RESULTS_20260924.md)를 입력으로 사용한다.

1. source checkout과 mutable root를 분리한 win32-x64 Core package를 만든다. Core/stdio bridge/guard/worker, canonical prompt, SQL migration·journal, 해당 SQLite prebuild와 runtime license만 명시적으로 수집한다.
2. 실행 파일·고정 args/env·관측 version/API/architecture를 담은 descriptor를 사용한다. Kiro child → PATH의 기존 Node → 검증된 private cache → 조건부 공식 Node 다운로드 순서로 실제 SQLite transaction/reopen probe를 수행한다. 개발 pin은 유지한다.
3. Node 24.19.0 Windows x64의 공식 `win-x64/node.exe`를 SHA-256 pin으로 검증한다. ZIP 전체 대신 실행 파일과 배포 license를 사용해 archive extraction 권한을 만들지 않는다. fresh staging·완료 marker·재검증·취소·offline·손상·재시도를 검증한다.
4. dependency 추가 없이 Windows .NET ZIP writer로 target-specific VSIX를 만들고 전체 allowlist·hash·누출 검사를 한다. macOS 기존 경로는 보존하며 다른 target은 검증 전 지원하지 않는다.
5. repository 밖 한글/공백 경로에서 패키지 자체로 Core 초기화·migration·SDK·인증·재시작 및 실제 stdio MCP의 권한·scope·revoke를 검사한다. runtime 세 후보와 acquisition negative tests, 관련 회귀 및 `pnpm check`를 실행한다.

W2 artifact에는 W3 통합을 위한 adapter/API가 포함된다. 자동 활성화·다중 창·crash/update lifecycle, Windows native source/Helper 제품 UX, 생성 앱 toolchain과 clean Windows 전체 흐름은 W3~W5에서 완료한다. 추가 모델 호출, IDE 설치/설정 변경, commit/push는 이 작업에 포함하지 않는다.
