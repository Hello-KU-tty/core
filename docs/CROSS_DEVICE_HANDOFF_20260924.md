# 다른 기기에서 T19-W5 재개

> 2026-09-24 Windows 개발 checkpoint. W1~W4는 완료, **W5는 진행 중**이다. 출하 승인이나 clean Windows 설치 PASS가 아니다.
> 저장소: `Hello-KU-tty/core`, remote: `https://github.com/Hello-KU-tty/core.git`, branch: `codex/windows-extension-runtime-20260923`.

사용자는 현재 작업을 다른 기기에서 이어가기 위한 commit/push를 요청했고, collaborator 권한이 있는 기존 조직 remote의 같은 branch를 대상으로 확인했다. 2026-09-23 문서의 당시 local-commit-only 제한은 이번 요청에 적용하지 않는다. PR/merge/release와 사용자 데이터 동기화는 이번 인계에 포함하지 않는다.

## 1. 소스 받기

새 개발 checkout에서는 다음을 실행한다. `main`이나 이전 native recovery branch에서 W1을 다시 시작하지 않는다.

```powershell
git clone --branch codex/windows-extension-runtime-20260923 --single-branch https://github.com/Hello-KU-tty/core.git
Set-Location core
git status --short
git log -1 --oneline
```

기존 clone이면 먼저 `git status --short`와 현재 branch를 확인하고 기존 변경을 보존한다. 작업 트리가 깨끗한 경우 `git fetch origin`, `git switch codex/windows-extension-runtime-20260923`, `git pull --ff-only origin codex/windows-extension-runtime-20260923` 순서로 갱신한다. local branch가 없으면 fetch 뒤 `git switch --track origin/codex/windows-extension-runtime-20260923`을 사용한다. 분기된 이력이나 기존 변경을 reset/clean으로 없애지 않는다.

읽는 순서는 [AGENTS.md](../AGENTS.md) → [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) → [SPEC.md](SPEC.md) → [ARCHITECTURE.md](ARCHITECTURE.md) → [DECISIONS.md](DECISIONS.md) → [TASKS.md](TASKS.md)다. 이후 [W5 실측 결과](spikes/T19_W5_WINDOWS_RELEASE_RESULTS_20260924.md), [sanitized receipt](spikes/T19_W5_WINDOWS_RELEASE_RECEIPTS_20260924.json), [W5 설치 검증 인계](T19_W5_RELEASE_VALIDATION_HANDOFF.md), [W5 계획](T19_W5_RELEASE_VALIDATION_PLAN.md)을 읽는다. [2026-09-23 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)는 구현 전 역사 기록이다.

## 2. 개발 환경과 재빌드

- 개발 도구는 **Node.js 24.19.0 / pnpm 11.12.0**이다. `.node-version`, frozen lockfile과 preflight를 유지한다. 이전 PC의 임시 도구 경로나 Playwright cache 환경 변수를 그대로 복사하지 않는다.
- 실제 W5 native 검증 대상은 **Windows x64, Kiro 1.1.14 / Agent 1.1.28 / API 1.131.0** 및 source attestation을 통과하는 설치다. Kiro host Node 24.18.0 재사용 관측과 repository 개발 pin을 구분한다. 다른 Kiro source/버전, ARM64 또는 macOS에 Windows PASS를 적용하지 않는다.
- 다른 OS에서는 소스 검토와 해당 환경에서 가능한 회귀부터 진행한다. 지원하지 않는 Kiro 설치를 맞추기 위해 자동 downgrade하거나 source/권한 gate를 해제하지 않는다. 계정 로그인과 Workspace Trust는 실제 사용자 단계다.

Windows 개발 shell에서 exact 도구를 준비한 다음 실행한다.

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm preflight
pnpm check
pnpm panel:pack:windows
node --test examples/kiro-panel/test/*.test.cjs
```

명령이 실패하면 후속 단계 전에 실패를 기록하고 원인을 확인한다. `pnpm check`는 모델을 호출하지 않는다. Windows package 산출물은 `dist/portable-core-win32-x64/`, `dist/portable-win32-x64/vibe-helper-portable-core-0.3.7-win32-x64.vsix`, `dist/portable-win32-x64/receipt.json`이다. VSIX와 생성 bundle은 Git에 넣지 않았으므로 새 기기에서 빌드한다. 기록된 기존 VSIX SHA-256은 `a0a179dd623de0b8fa2d9bed0b58311e590bb8f08c98ac91f4945bcc8d904ebf`이며 **이전 기기에서 검증한 파일의 식별자**다. 새 빌드는 hash와 용량을 다시 기록하며 byte-for-byte 일치를 가정하지 않는다.

모델을 호출하지 않는 packaged 회귀도 실제 경로를 채워 **순차 실행**한다. 조건부 runtime/dependency 다운로드는 발생할 수 있다.

```powershell
$kiroExe = '<이 기기의 Kiro.exe 절대 경로>'
$pnpmEntry = '<이 기기의 pnpm.cjs 또는 pnpm.cmd 절대 경로>'
node scripts/test-portable-core.mjs $kiroExe
node scripts/test-managed-core.mjs
node scripts/test-project-tools.mjs $pnpmEntry
node scripts/test-project-tool-recovery.mjs
```

마지막 recovery 검사는 바로 앞 project-tools 검사가 만든 로컬 `dist/project-tools-location.json`과 도구 cache가 필요하다. 이전 PC의 location 파일을 복사해서 실행하지 않는다. native host 초기화와 무거운 전체 회귀를 동시에 돌려 원인 분석을 흐리지 않는다.

## 3. 현재 판정

| 항목 | 현재 근거와 제한 |
| --- | --- |
| 작업 상태 | T19-W1~W4 `[x]`, **T19-W5 `[~]`**, T19 `[-]`, T19-N `[~]`. T20 착수 없음 |
| Windows 구현 | portable Core/SQLite/MCP/SDK, VSIX, runtime 재사용·필요 시 private 획득, 다중 창 Core lifecycle, 생성 앱 Node/pnpm과 보호 launcher |
| 최신 전체 회귀 | 0.3.7 제품 코드 `pnpm check` PASS: unit 97, integration 296 + skip 1, eval 35, Campus Drop 3, smoke 6, E2E 12. 별도 CJS 102 PASS |
| portable / lifecycle | 0.3.7 재실행에서 각각 11 / 8 PASS. 최초 기동 실패와 CORE_START_TIMEOUT은 보존. crash 연결 39.1초, update 연결 45.6초 관측으로 안정성 완료 주장 불가 |
| Personal Need 있음 | 0.3.6에서 기존 Project의 bounded 복구 흐름으로 Task COMPLETED, 결과 HTTP 200, Helper 2개, 분석 4개 성공, History 무재실행. 동일 최신 버전 fresh install 완주와 구분 |
| Evidence | 위 합성 흐름의 USER_UNDERSTANDING은 0, Concept 10개 모두 OBSERVED. 클릭/Agent 출력만으로 실제 사람의 이해를 입증하지 않음 |
| 최신 Personal Need 없음 | 후보 생성·상세화·수정·선택 성공 후 Spec 질문에 제때 답하지 못해 timeout/NATIVE_CANCEL_UNCONFIRMED. 질문 UI 결함으로 확정하지 않음 |
| native 초기화 / 취소 | 이후 취소 검사와 Kiro 재시작 후 새 Project 모두 모델 prompt 전 NATIVE_ROLE_CATALOG_UNVERIFIED. catalog 0개 관측, 실제 TEXT/TOOL 뒤 취소 PASS 미확보 |
| GUI / frontend / clean OS | 일부 History 조회만 실제 GUI 확인. 전체 GUI와 통합 frontend, 개발 도구/source 없는 별도 Windows 환경은 미검증 |

W5에서 수정한 주요 경계는 세션 소유권을 확인한 초기 catalog 알림 보존, ACL 검사 오류 구분, PID 재사용 판별, 상위 VSIX 버전의 생성 앱 launcher 갱신, 승인된 제한적 pnpm 설정의 script 없는 lock 갱신, 긴 no-Evidence 사유의 화면 preview다. Builder canonical prompt는 **1.3.8**이고 [평가 결과](../tests/eval/results/builder-agent-v1.3.8.md)를 함께 보존한다. 제품 설명보다 상세 원인·실패·버전별 관측은 W5 결과 문서를 기준으로 한다.

## 4. 다음 작업

1. **W5를 이어서 조사한다.** native catalog가 비는 시점의 MCP bridge 시작/종료, session 소유권, catalog 준비 시간·고정 오류 metadata를 대조한다. 등록 지연과 bridge 실패를 구분하기 전에 gate 완화, 무한 재시도나 timeout 확대를 적용하지 않는다. Core 초기 기동 지연도 별도로 측정한다.
2. 최신 package의 **새 합성 root / 새 Project**로 Personal Need 유무 흐름을 각각 끝까지 검증한다. Spec 질문을 실제로 확인하고 제때 답변한다. Task 완료·Decision 적용·Helper·분석·결과 HTTP·History를 같은 실행에 연결한다. 이전 0.3.6 복구 성공을 최신 fresh 성공으로 옮겨 적지 않는다.
3. 실제 TEXT/TOOL 발생 뒤 명시적 native 취소와 terminal ACK, 이후 새 실행을 확인한다. initialization 실패 후 cleanup cancel 호출은 이 gate의 PASS가 아니다.
4. 전체 GUI와 [IDE frontend 계약](FRONTEND_IDE_IMPLEMENTATION_GUIDE.md)을 검증하고, 별도 환경이 준비되면 [clean Windows 절차](T19_W5_RELEASE_VALIDATION_HANDOFF.md)를 수행한다. 새 개발 기기에 도구/source를 설치한 것만으로 clean machine 조건을 충족하지 않는다. 기존 T19-N 의미 품질·실제 사용자 Evidence와 OS shell confinement 등의 미해결 gate도 유지한다.

실제 모델을 쓰는 W5 harness는 아래와 같다. 두 명령은 각각 별도 실행이며 첫 실행을 정리한 뒤 두 번째를 시작한다. 로그인/Trust와 질문 대응이 가능한 상태에서 실행하고 Kiro 사용량과 원본 실패를 기록한다. 환경 준비만을 위해 자동 실행하지 않는다.

```powershell
node scripts/test-managed-host.mjs $kiroExe --vertical --without-project-tools --hold
node scripts/test-managed-host.mjs $kiroExe --vertical --without-project-tools --personal-need --hold
```

`--hold`는 합성 host를 남긴다. 검증을 마치면 기록된 PID의 command line과 합성 root 소유권을 확인한 process tree만 닫는다. 실제 취소 검사는 **해당 기기의 vertical 실행이 terminal이고 설치 host가 살아 있는 합성 root**에서 `node scripts/test-installed-native-cancel.mjs '<합성 root>'`로 수행한다.

새 기기에서는 이전 PC의 root/receipt에 `--reuse`, `--retry-builder-from`, `--continue-build-from`을 적용하지 않는다. 같은 기기에서만 필요한 bounded continuation 조건은 W5 설치 검증 인계를 따른다. STARTED만 있고 응답이 불명확한 mutation을 삭제하거나 자동 replay하지 않는다. W1의 과거 8-call probe 예산은 이미 소진됐으므로 W1 live probe를 환경 준비 단계로 재실행하지 않는다.

## 5. 넘기는 것과 로컬에 남기는 것

Git에는 source, scripts, tests, canonical prompts, 계획/결정/실측 결과와 sanitized receipt를 포함한다. `.gitattributes`는 소스와 prompt의 LF를 고정해 Windows/macOS 사이 줄바꿈 차이를 줄인다.

`dist/`, `dist-types/`, `node_modules/`, VSIX, 원본 로그, private receipt, SQLite DB/생성 workspace, `connection.json`, Kiro profile/계정 credential, 임시 PID/location 파일은 현재 PC에 남는다. 문서에 적힌 `dist/w5-*.log`는 기존 검증의 로컬 근거 위치이며 새 clone에서 존재하지 않는 것이 정상이다. 공개 가능한 요약은 committed W5 결과/receipt에 있다. 이 인계는 소스 개발의 연속성을 위한 것이며 제품 사용자 데이터의 cloud sync가 아니다.

## 새 기기에서 보낼 재개 요청

```text
docs/CROSS_DEVICE_HANDOFF_20260924.md와 AGENTS.md, 상위 요구 문서를 읽고 T19-W5를 이어서 진행해줘.
브랜치는 codex/windows-extension-runtime-20260923이고 W1~W4는 완료, W5는 진행 중이야.
현재 기기의 환경과 Git 상태부터 확인하고, native catalog 초기화 실패와 Core 기동 지연을 먼저 조사해줘.
이전 PC의 private profile/DB/receipt는 없으니 새 합성 환경을 사용해줘.
clean Windows, 최신 양쪽 fresh 수직 흐름, 실제 native 취소와 전체 GUI/frontend 검증 전에는 W5나 T19/T19-N을 완료 처리하지 마.
```
