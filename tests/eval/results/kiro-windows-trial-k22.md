# K22 사용자 Windows 0.2.11 실사용 2회 분석과 판정 (2026-10-17)

사용자가 본선 계정으로 Windows 0.2.11(Steering 0.9.2, 미리 승인, 모델 Auto, Workflow 꺼짐)을 두 번 썼다(2026-10-16 15:51~19:00). 실시간 채팅 앱 1개, 뽀모도로 타이머 1개와 그 후속 Task 1개다. Windows의 Codex가 Kiro 세션 기록, Core SQLite, Kiro·kiro-cli 로그를 묶어 넘겼다(transfer 공유, 개인 경로는 `<CORE_ROOT>`·`<USER_HOME>`으로 가림). 원본은 저장소에 넣지 않았다. 학습자 발언은 사용자 본인의 시험 입력이다.

## 첫 Task에서 물었는가

| Project | Spec 예상 Decision | 첫 Task에서 Builder | 판정 |
| --- | --- | --- | --- |
| 실시간 채팅(학습 목표: 클라이언트-서버 아키텍처, 양방향 통신) | 0개 | 환경 확인 → PLAN → 코드 전에 `ask_choice`(WebSocket·폴링·SSE) → 학습자 질문 두 번에 답 → "그럼 그걸로 가자" 기록 → 구현 | 코드 전에 물음 |
| 뽀모도로(학습 목표: setInterval, 상태에 따른 DOM) | 0개 | 설정 파일 4개 → 타이머 코드 전에 `ask_choice`(1초씩 빼기 vs 시작 시각 기준) → "1" → 구현 | 코드 전에 물음 |
| 뽀모도로 후속("123 다 만들어보자") | 같은 Spec | 후속 Task에서 휴식 전환 방식(자동/수동)을 물음 | 물음 |

- 본선 계정·Windows에서는 두 번 모두 첫 Task에서 물었다. 앞서 Windows에서 하나도 묻지 않은 세 번(0.2.6~0.2.7, 0.2.9, 0.2.10)은 frontend 계정이었고, 0.2.9·0.2.10은 Workflow가 켜져 있었다. 원인을 OS로 볼 근거는 줄었다.
- 두 Spec 모두 예상 Decision이 0개였는데, Builder가 물은 선택은 둘 다 학습 목표의 핵심 갈림길이었다. Spec이 갈림길을 예고하지 못한 것이다(아래 Discovery 1.5.0).

## 승인 창 8개

| # | 명령(요약) | 원인 | 0.2.12에서 |
| --- | --- | --- | --- |
| 1 | `echo …; [System.Environment]::OSVersion.VersionString; node -v; …` | 운영체제 확인 식 | Steering 0.9.3(K21)이 버전 확인만 하게 함 |
| 2 | `pnpm config set … 2>$null; pnpm approve-builds esbuild 2>&1 \| Out-String` | `Out-String` 미등록 | 허용(`Out-String` 추가) |
| 3·4 | `pnpm test 2>&1 \| Out-String`, `pnpm build 2>&1 \| Out-String` | 같음 | 허용 |
| 5 | `(Invoke-WebRequest "http://localhost:3000" -UseBasicParsing).StatusCode` | 괄호 | 계속 묻기. Steering 0.9.4가 승인 없이 도는 한 줄을 줌 |
| 6·7 | `$env:NPM_CONFIG_GLOBALCONFIG=$null; $env:NPM_CONFIG_USERCONFIG=$null; npx vitest run 2>&1 \| Out-String` 외 1 | 아래 npm 오류를 피하려는 변수 대입 | npm 오류를 고쳐 이 우회가 필요 없음. 우회 없는 같은 명령은 허용 |
| 8 | `try { $r = Invoke-WebRequest "http://localhost:5173" … } catch { … }` | 스크립트 블록 | 계속 묻기. Steering 0.9.4 |

6번 승인 창은 39분 동안 답을 기다렸다(사용자 자리 비움). 판정은 `experiments/kiro-shell-permissions/judge.sh k22-windows-trial.json`(kiro-cli 2.31.1)으로 했다. 0.2.11 규칙의 결과는 `k22-windows-trial-0.2.11.txt`, 새 규칙은 `k22-windows-trial-0.2.12.txt`다.

- **새 규칙에서 허용:** 2·3·4, 우회 없는 `npx vitest run 2>&1 | Out-String`, `npx tsc --noEmit 2>&1 | Out-String; echo "TSC_EXIT=$LASTEXITCODE"`, `Invoke-WebRequest "http://localhost:3000" -UseBasicParsing`(따옴표, `-Uri` 없음), `… | Select-Object -ExpandProperty StatusCode`, `Invoke-RestMethod "http://localhost:3000/api/items"`.
- **계속 묻기:** 괄호·`try`·`$env:` 형태, `pnpm test | Out-String; Remove-Item -Recurse foo`, `Out-String -InputObject (Remove-Item …)`, `Write-Output (Remove-Item …)`, `pnpm test 2>&1 | Out-String | Remove-Item foo`, `http://evil.com@localhost:3000`.
- **예전 목록:** 관찰 27개, 합성 86개, K21 버전 확인 목록의 판정이 0.2.11 규칙과 같다.
- **알려진 점:** `Invoke-WebRequest "http://localhost:3000" -OutFile C:\Windows\x`는 허용이다. 따옴표 없는 형태는 0.2.7부터 이미 허용이었다. 이 목록은 실수를 줄이는 장치이지 샌드박스가 아니다(K11).

## npm이 Windows Project 터미널에서 실행되지 않음

```
Error: double-loading config "<CORE_ROOT>\project-tools\empty.npmrc" as "global", previously loaded as "user"
```

- Vibe Helper가 Project 터미널에 넣는 환경(`projectEnvironment`, K17 `prepareProjectTerminal`)이 `npm_config_userconfig`와 `npm_config_globalconfig`를 같은 빈 파일로 지정했다. npm 11은 같은 파일을 두 번 읽으면 시작하지 않는다. 이 Mac의 npm 11.17.0으로 같은 오류를 재현했고, 파일을 나누면 정상 실행됐다.
- 결과: 채팅 앱은 pnpm으로 우회했고, 타이머는 Builder가 두 변수를 지운 명령을 붙여 썼다. 그 명령이 승인 창 6·7번이 됐다.
- 고침: global 설정은 새 빈 파일 `empty-global.npmrc`를 쓴다. user 설정은 그대로 `empty.npmrc`다. 이미 설치된 곳은 Core가 다음에 Project 도구를 준비할 때 파일을 만든다.

## 완료 보고의 개념 이름이 버려짐

- Builder가 `finish_task`에 보낸 개념 이름이 Spec 개념 이름과 글자가 달랐다. Core는 Spec에 있는 이름만 기록한다(`ignoredConcepts`).

| 완료 | Builder가 보낸 이름 | Spec 이름 | 기록 |
| --- | --- | --- | --- |
| 채팅 | 클라이언트-서버 아키텍처, WebSocket 양방향 통신과 브로드캐스트 | 클라이언트-서버 아키텍처, 양방향 통신 | 1개 |
| 타이머 | setInterval과 상태 관리 | setInterval로 시간 경과 측정, 상태 변화에 따른 DOM 업데이트 | 0개 |
| 타이머 후속 | 상태 기계와 자동 전환, 초기화 순서와 구독 콜백 | 같음 | 0개 |

- 이 Mac의 2026-10-09 이후 완료 16건 중 9건도 개념 기록이 0개였다. 개념 기록이 없으면 OBSERVED Evidence가 생기지 않아 학습 기록 탭이 빈다.
- 고침: `check_progress`가 확정 Spec의 개념 이름(`conceptNames`, 학습 목표와 에이전트 지원)을 돌려준다. 도구 설명과 Steering 0.9.4가 `finish_task` `concepts`에 그 이름을 그대로 쓰게 한다. 다른 이름으로 와도 지금처럼 거절하지 않고 기록하지 않는다.

## 그 밖의 관찰

- **실패를 성공처럼 말함:** `pnpm install`이 종료 코드 1(`ERR_PNPM_IGNORED_BUILDS`)로 끝났는데 Builder가 "설치가 됐어요"라고 했다. Steering 0.9.4가 종료 코드가 0이 아니면 실패로 말하게 한다.
- **새 창에서 Core 연결이 늦음(사용자 체감 약 30초):** 두 번째 Project 창(16:08:35 열림)의 기록이다.
  - Kiro 확장 호스트가 늦게 떴다. 우리 확장은 `onStartupFinished`로 16:08:54(19초 뒤)에 활성화됐다. 같은 호스트가 16:08:52, 16:09:13~17에 응답하지 않았다(Kiro 렌더러 로그).
  - 신뢰 → "다시 로드" 안내 → 16:09:07 다시 로드 → 16:09:18 패널 활성화. 16:10:09에 한 번 더 다시 로드됐다(누가 눌렀는지는 기록에 없음).
  - 첫 Project 창은 활성화 2초, 신뢰 후 다시 로드까지 약 10초였다. 차이는 Kiro 쪽 시작 지연이다.
  - 우리 확장은 `extensionDependencies: ["kiro.kiroAgent"]` 때문에 Kiro 에이전트 전용 확장 호스트에 같이 놓인다("Placing extension(s) kiro.kiroAgent, vibe-helper.builder-helper-agent-panel on a separate extension host"). 우리 쪽에서 Kiro 에이전트를 부르는 곳은 `kiroAgent.newSession` 명령 하나뿐이다. 의존을 빼면 일반 확장 호스트에서 더 일찍 활성화될 수 있지만, 활성화 순서가 바뀌므로 본선 뒤 frontend와 두 플랫폼에서 확인한다.
- **Kiro·PowerShell 쪽(우리 몫 아님):** 출력에 PowerShell 7 창 제목 제어 문자가 섞임(`:\Program Files\WindowsApps\…\pwsh.exe\`), `npm install` 180초 시간 초과, `Start-Sleep -Seconds 60`이 70초 시간 초과, 재사용 터미널의 예전 출력. Builder가 매번 다시 확인해 복구했다. 07:25~08:00 사이 35분 동안 모델 호출이 없었던 구간은 원인을 알 수 없다(승인·질문 대기 아님).
- **열린 Episode 2개:** 첫 Task 두 개에서 시작 발언("작업 시작", "ㄱㄱ")과 완료 뒤 마지막 턴을 담은 `BUILD_TASK` Episode가 `OPEN`으로 남았다. 분석할 Evidence는 없다. 본선 뒤 확인한다.
- **Analyst:** 6번 모두 성공, 제안 0개. 학습자 발언이 번호·질문·짧은 확인이라 이해 Evidence가 없었다. 의도한 동작이다.
