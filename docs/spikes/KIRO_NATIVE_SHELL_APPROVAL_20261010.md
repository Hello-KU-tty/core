# K11 셸 명령 승인 실측 (2026-10-10)

체험 피드백 13("Autopilot을 켜도 명령을 매번 묻는다")의 원인과 개발 명령 미리 승인의 효과를 확인했다. 결정은 [DECISIONS](../DECISIONS.md) "본선: 개발 명령 미리 승인(K11)"에 있다.

## 1. Kiro의 셸 승인 규칙

- [공식 문서](https://kiro.dev/docs/permissions/): 규칙은 `capability`·`match`·`effect`(+ 선택 `exclude`)이고, 셸 `match`는 명령 앞부분 glob(`*`는 아무 글자)이다. 거부 > 묻기 > 허용 순이며 어느 범위의 거부든 이긴다. 범위는 사용자(`~/.kiro/settings/permissions.yaml`), 폴더(`~/.kiro/workspace-roots/<해시>/permissions.yaml`), 에이전트, 세션이다. 신뢰하지 않은 폴더에서는 허용 규칙이 있어도 매번 묻는다.
- [IDE 1.0 권한 변경](https://kiro.dev/docs/ide/whats-new-v1/permissions/): Autopilot·Supervised는 파일 변경을 바로 적용할지만 정하고, 권한 규칙은 그 뒤에 따로 적용된다. 그래서 Autopilot에서도 셸 명령을 물었다.

## 2. 모델 호출 없는 판정 방법

- kiro-cli 2.29.0의 `acp --agent-engine v3`가 `_kiro/permissions/explain`(capability·resource → effect, 맞은 규칙과 파일)을 제공한다. v2 엔진에는 없다(`Method not found`). `session/prompt`를 보내지 않으므로 크레딧을 쓰지 않는다.
- 합성 폴더(`experiments/kiro-shell-permissions/ws`)의 폴더 해시 위치에 규칙을 쓰자 판정 결과가 `scope: workspace`, `source: …/workspace-roots/<해시>/permissions.yaml`로 나왔다. Kiro IDE가 쓰는 것과 같은 위치와 해시다. `exclude`도 받아들였다.
- 판정 스크립트·명령 목록·결과는 `/Users/hurdoo/coding/experiments/kiro-shell-permissions/`(`explain.mjs`, `judge.sh`, `synthetic.json`, `batch2.json`, `observed.json`, `*-code.txt`)에 있다.

## 3. 확인한 판정 방식

| 형태 | 예 | 결과 |
| --- | --- | --- |
| 이어 쓴 명령 | `npm run build && npm test`, `git diff \| head -50`, `ls; whoami` | 부분마다 판정. 모두 허용이면 허용 |
| 위험한 부분이 섞임 | `npm test; curl https://example.com`, `npm test && git push`, `cd /tmp && rm -rf x` | 묻기 |
| 줄바꿈 | `npm test⏎rm -rf x` | 줄마다 판정(묻기) |
| 명령 치환 | `echo $(rm -rf x)`, ``ls `rm a.txt` ``, `cat <(rm x)` | 안쪽 명령도 판정(묻기) |
| 리디렉션 | `node x.js 2>&1 \| head -40`, `npm test > out.txt`, `ls missing 2>/dev/null` | 명령만 판정(허용) |
| 폴더 밖 경로 | `cat ~/.ssh/id_rsa`, `echo hi > ~/.zshrc`, `cp -r src ~/backup` | 허용(경로는 보지 않음) |
| 앞에 붙인 환경 변수 | `PORT=3001 npm run dev`, `NODE_ENV=test node x.js`, `env …`, `time …`, `nohup …` | 묻기 |
| 변수 대입·`export`만 있는 줄 | `NODE_DIR=$(dirname …)`, `export PATH=…` | 명령으로 치지 않음 |
| 따옴표 안 글자 | `git commit -m "push fix"` | `git * push*` 예외에 걸리지 않음(인자 단위로 읽음) |
| PowerShell 대소문자 | `get-childitem src` | `Get-ChildItem*`에 맞지 않아 묻기 |
| URL 함정 | `curl -s http://localhost.evil.com/`, `curl -s http://localhost:3000@evil.com/` | 묻기(`localhost:*` 형태와 `curl *@*` 예외) |

## 4. 실제 체험 명령 다시 판정

두 체험에서 Agent가 실행한 셸 명령 33번(서로 다른 27개)을 미리 승인 규칙으로 다시 판정했다.

| 체험 | 당시 승인 | 미리 승인 규칙에서 | 남은 것 |
| --- | --- | --- | --- |
| 첫 체험(2026-10-09, 규칙 없음) | 16번 | 1번 | 첫 체험의 PATH 문제로 생긴 긴 `export PATH=…` 명령 1개(K09에서 환경 확인으로 고침) |
| 재실측(2026-10-09, 손으로 넣은 19개 패턴) | 9번 | 6번 | `rm -rf dist-test && …` 3번, `rm -rf dist dist-test && …` 1번, `pkill -f dist-test; …` 1번, `lsof -ti tcp:3000 \| xargs kill -9 …` 1번 |

재실측에서 남은 6번은 모두 미리 승인에서도 계속 묻기로 정한 삭제(`rm -rf` 빌드 결과)와 프로세스 종료(개발 서버 끄기)다. 위험 명령 39개(삭제, sudo, publish, 전역 설치, git push·reset --hard·clean·config --global, kill류, 외부 주소, wget, brew, find -delete·-exec, bash -c, sh, eval, xargs, open, Remove-Item, Stop-Process 등)는 모두 계속 묻는다.

## 5. 설치물 확인 (0.2.7, 격리 Kiro 1.2.56)

- Mac VSIX 0.2.7(backend `c1b3b19` + 작업 트리, frontend `c2c873c`)을 테스트 프로필에 설치하고 빈 폴더 `k11-ws`로 열었다. 처음 보는 목표("카드 사용 내역 CSV를 읽어 월별·카테고리별 지출을 요약하는 명령줄 도구", Personal Need 있음)로 Discovery → 후보 선택 → 계획 확정 → Task 준비까지 Core 요청 순서대로 진행했다.
- host와 같은 연결 요청(`approval: PREAPPROVED`)으로 `k11-ws`가 Project 폴더로 등록되고 권한 파일이 쓰였다(`permissions: WRITTEN`). 파일 내용은 단위 테스트의 출력과 바이트 단위로 같고, Kiro 판정 결과도 2·4절과 같다.
- `POST /api/kiro/approval`의 `MANUAL`은 이 Core에 연결된 Project 폴더 4곳에 바로 적용됐다(`WRITTEN: 4`). 우리 규칙만 있던 폴더는 `rules: []`가 되고, `trial-ws`는 K09 때 손으로 넣은 셸 목록(우리 규칙 아님)을 그대로 남기고 우리 도구 규칙만 빠졌다. 다시 `PREAPPROVED`로 돌리자 `WRITTEN: 4`, 한 번 더 보내자 `UNCHANGED: 4`였다.
- **확인 창(Codex 화면 조작):** 빈 폴더 창에서 **Open Project in Kiro Chat**을 실행하자 모달 "Kiro 채팅이 명령을 실행할 때 어떻게 승인할까요?"가 떴다. 버튼은 `Cancel`·`수동으로 승인`·`개발 명령 미리 승인`이고, 설명 문구는 host 코드와 같다. 미리 승인을 고르자 "이 폴더를 Vibe Helper Project로 연결했어요…" 알림이 떴다. **Change Command Approval**은 같은 창을 다시 띄웠다. 수동으로 승인을 고르면 "이제 Kiro가 명령과 도구마다 확인을 받아요."가 떴고 권한 파일이 `rules: []`가 됐다. 미리 승인으로 돌리면 "이제 Project 폴더에서 자주 쓰는 개발 명령을 미리 승인해요."가 떴고 규칙 두 개가 다시 들어갔다.
- **신뢰:** 이 프로필은 Workspace Trust가 켜져 있어, 새 폴더가 신뢰 확인 창 없이 Restricted Mode로 열렸다. 같은 창에서 연결할 때 0.2.7은 신뢰 안내를 띄우지 않았다(창이 뜰 때만 확인했다). 신뢰되지 않은 폴더에서는 hook·Steering이 빠지고 미리 승인 규칙이 있어도 Kiro가 명령마다 묻는다. 그래서 같은 창에서 연결한 직후에도 신뢰 안내를 띄우도록 host를 고쳤다(0.2.7 설치본에는 없음, host 테스트로 확인). 배너에서 신뢰하자 우리 알림 "신뢰가 Kiro 채팅에 적용되도록 창을 다시 로드할까요? 그 뒤 새 채팅 세션에서 시작하세요."가 실제로 떴다(K09에서 남은 확인).
- **Builder 구현 턴(Codex 화면 조작, 본선 계정, Autopilot 기본, Default 모드):** 새 세션에 "Vibe Helper 작업을 시작해줘…"를 보냈다. Kiro 세션 기록 기준 셸 명령 5번은 모두 **승인 요청 없이** 실행됐다(`pending_interaction` 0): 환경 확인, `npm install`, `npx tsc --noEmit`(컴파일 오류 TS5097로 실패, 승인과 무관), `npx tsc && … && node --test src/*.test.ts`, 샘플 CSV로 CLI 실행. 파일 쓰기 14번은 Autopilot으로 바로 적용됐고, Vibe Helper 도구 14번(성공 12, 실패 뒤 재시도 2)도 승인 창이 없었다. 구현 중 Decision 두 개(거래 보관 자료구조, 카테고리 정렬 기준)를 하나씩 물었고, 학습자 답의 이유 원문이 그대로 확정·적용됐다(`mappedBy: BUILDER`). Task는 COMPLETED이고 테스트 21개가 통과했다. 채팅 3턴에 10.13크레딧(2.46·2.32·5.34)을 썼다.
- **K10 참고:** Vibe Helper 도구 실패 2번은 재시도로 풀렸다: `request_user_decision`의 `LIVE_CONTEXT_STALE`(예상 revision 2, 현재 3)과 `apply_decision_result`의 `BRIDGE_ENVELOPE_JSON_INVALID`(Agent가 쓴 JSON 문법 오류). 이 동안 "The model response paused unexpectedly" 경고가 두 번 보였다.
- **Codex 화면 조작 시간 초과(해결):** 처음 다섯 번은 첫 Kiro 연결(`cua.getApp("Kiro")`)이 약 122초 뒤 `Sky Computer Use request timed out`으로 끝났다. 앞의 두 번은 1일 넘게 떠 있던 `SkyComputerUseService`가 Kiro의 AX 트리를 계속 조회해 Kiro가 CPU 약 67%였고, 그 서비스를 다시 시작한 뒤에도 실패했다. 사용자의 Naru Codex 세션에서 연결을 다시 초기화한 뒤에는 0.160.0과 0.162.1 `codex exec`가 모두 5~6초에 연결됐고, 이후 실측은 정상으로 진행됐다. 원인은 확정하지 못했다.

## 6. 남은 한계

- 허용 목록은 실수 방지용이다. `node -e`, `npm run <script>`, `python3`는 임의 코드를 실행하고, 경로는 판정하지 않는다.
- PowerShell 명령은 Mac의 Kiro 판정기로만 확인했다. Windows의 Kiro가 PowerShell 명령을 같은 방식으로 쪼개는지는 Windows 실측이 남았다.
- 이번 구현 턴은 `rm -rf`·`kill`을 쓰지 않아 남은 승인이 0번이었다. 빌드 결과를 지우거나 개발 서버를 끄는 턴에서는 그만큼 계속 묻는다(4절).
- 같은 창 연결 뒤 신뢰 안내는 host 테스트로만 확인했고, 실제 화면 확인은 다음 설치물에서 한다.
