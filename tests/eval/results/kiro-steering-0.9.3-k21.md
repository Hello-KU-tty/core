# K21 첫 턴 버전 확인 명령: 판정과 Steering 0.9.3 (2026-10-17)

frontend Windows 0.2.11 확인(2026-10-16)에서 첫 Task의 승인 창은 하나뿐이었다. Builder가 시작하며 실행한 버전 확인 명령이다(22:49:50).

```
cmd /c ver; node -v; npm -v; pnpm -v; yarn -v; python3 --version; git --version
```

## 판정(모델 호출 없음)

`experiments/kiro-shell-permissions/judge.sh k21-version.json`(kiro-cli 2.31.1 `_kiro/permissions/explain`, 0.2.11 규칙)로 판정했다. 결과는 같은 폴더의 `k21-version.txt`에 있다.

- **묻기:** `cmd /c ver`, `ver`, 그리고 이 둘을 앞에 붙인 위 명령. PowerShell 식(`$PSVersionTable.PSVersion`, `[System.Environment]::OSVersion.VersionString`)과 `Get-Command …`도 묻는다.
- **허용:**
  - `node -v`, `npm -v`, `pnpm -v`, `yarn -v`, `bun -v`, `python3 --version`, `python --version`, `py --version`, `git --version`, `uname -sm`, `where.exe node`, `which node npm pnpm git`, `node -p process.platform`.
  - 이 명령들을 `;`나 `&&`로 이어 붙인 한 줄. Mac Steering 예시(`uname -sm; node -v; …`)도 허용이다.
  - `2>&1`, `2>$null`을 붙인 형태.
- **판정:** 이어 붙인 것은 원인이 아니다. Kiro는 조각마다 판정하고, 조각이 모두 미리 승인에 있으면 허용한다. 원인은 운영체제를 알아내는 `cmd /c ver` 하나다. Steering 0.9.2가 운영체제까지 알리는 명령을 시키며 `uname -sm`을 예로 들었고, Windows의 Builder가 같은 자리에 `cmd /c ver`를 넣었다.

## 바꾼 것

- **Steering 0.9.3(Builder "Before the first build step"):**
  - 버전 확인만으로 된 한 줄을 실행한다(`node -v; npm -v; pnpm -v; yarn -v; bun -v; python3 --version; git --version`).
  - 운영체제를 알아내는 명령(`cmd /c ver`, `ver`, `systeminfo` 등)은 따로 넣지 않는다. 작업 폴더 경로로 알 수 있고, 그 명령은 학습자 승인을 기다리며 채팅을 멈춘다.
- **미리 승인 규칙:** 바꾸지 않았다. `cmd /c *`는 넓어 넣지 않는다. `cmd /c ver`·`ver`만 넣으려면 0.2.11 규칙을 인식 목록에 더하는 업그레이드가 따라오는데, Steering만으로 같은 효과를 낸다.

## 검증

- adapter 단위 테스트: Steering 0.9.3 문장, `uname -sm` 예시 없음. Core 연결 통합 테스트의 Steering 버전.
- Node 24.19.0: `pnpm typecheck` 통과, unit 177 통과·3 skip, integration 561 통과·9 skip, eval 47 통과·1 skip.
- **아직 안 한 것:** 실제 Kiro 첫 Task 확인. 0.2.12는 다른 작업과 함께 한 번에 빌드하기로 했다(사용자 결정 2026-10-17). 그 빌드의 Mac 첫 Task 실측과 frontend Windows 확인에서 첫 턴 승인 창 0개와 버전 확인 명령 형태를 본다. Mac에서는 0.9.2 예시도 허용이었으므로 차이는 Windows 확인에서만 드러난다.
