# 프론트 update kit 20260929

2026-09-29. `frontend-handoff-20260927` 다음 kit다. 20260927 kit를 적용한 program checkout에서 kit 관리 디렉터리(`portable/`, `vendor/frontend-client/`, `vendor/frontend-host/`)만 교체한다. UI 소스는 바꾸지 않는다.

## 포함된 백엔드 변경

| 항목 | 커밋 | 내용 |
| --- | --- | --- |
| B6 | `a4a6632` | 같은 생성 폴더 창이 여럿이면 현재 worker 창의 endpoint 선택 |
| B7~B11 | `936788a` | MCP bridge 진단, guard 상세 코드와 검증 없는 완료 거절, tool 분류와 `NATIVE_FILE_NOT_FOUND`, Builder prompt 1.3.11(사용자 언어), pnpm 11.13.1 |
| B12 | `7deefa3` | 생성 프로젝트 launcher가 실제 제품 VSIX(`vibe-helper.builder-helper-agent-panel-X.Y.Z`)의 버전 업그레이드를 인정 |
| B12 | `365ce2a` | 제품 업그레이드 중에는 이전 pin(예: 11.12.0)이 고른 pnpm을 새 pin으로 교체 허용. Node와 다른 필드는 그대로 일치해야 함 |

B12가 없으면 확장 버전을 올릴 때마다 기존 생성 프로젝트의 Builder가 `PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED`로 막힌다. B10(pnpm pin 교체) 이전에 만든 프로젝트는 두 B12 커밋이 모두 있어야 복구된다.

## 적용

```powershell
$kit = '<압축을 푼 frontend-handoff-20260929>'
$program = '<program checkout>'
node "$kit\update-program.mjs" $program --check
node "$kit\update-program.mjs" $program
Set-Location $program
git add portable vendor
npm run typecheck
npm test
npm run build
node "$kit\update-program.mjs" $program --verify
node "$kit\package-program.mjs" $program
```

- 이전 기준은 20260927 kit의 관리 파일 118개(`examples/frontend-handoff/program-managed-20260927.json`)다. 20260926 기준으로 만든 kit는 20260927을 적용한 checkout에서 `PROGRAM_MANAGED_FILE_MODIFIED`로 거절된다.
- `package.json`의 `version`을 올려 설치한 뒤 Kiro를 완전히 종료했다가 다시 연다. Reload만 하면 이전 설치 경로의 Core가 남을 수 있다.
- 생성 프로젝트는 사용자가 쓰던 Node를 그대로 기록한다. 전역 Node 전환(`nvm use`)은 launcher 검사에서 거절되므로 하지 않는다.

## 검증 범위

`verification/update.json`에 기록했다. 프론트 Windows PC에서 PowerShell, Node 24.19.0, pnpm 11.13.1로 `pnpm check` 전체를 통과했다. 모델 호출은 0회다. 실제 native 수직 흐름, B6 두 창 선택, B7 원인, B11 한국어 품질은 이 kit 설치 후 실측으로 확인한다.

Git Bash에서는 `whoami.exe`가 Windows 명령이 아닌 도구로 잡혀 private path 테스트 2개가 실패한다. Windows 검증은 PowerShell에서 실행한다.
