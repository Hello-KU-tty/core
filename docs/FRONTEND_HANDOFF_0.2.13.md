# 0.2.13 프론트 인계 (2026-10-18)

frontend 담당자가 패널 정리를 사용자에게 넘겼고, 사용자가 backend에 frontend 작업까지 맡겼다(TASKS K23). backend가 program `main`에 패널 정리(K23)와 결정 순간 Helper 안내(K24)를 직접 합쳤고, Mac 0.2.13을 만들어 실제 Kiro에서 확인했다. **Windows 0.2.13은 program `main` `d314006`으로 빌드한다.** 빌드는 사용자나 frontend가 한다. 빌드 절차와 지난 기록은 [Kiro-native 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)에 있다.

- **Mac 0.2.13:** [`builder-helper-agent-panel-0.2.13-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.13-darwin-arm64.vsix) · 41,625,387 bytes · SHA-256 `7a1218213f93aa13c5cdd9df157bf1a7ceac57272776ef1db9e2be89a9b39b92`
- **빌드 출처:** backend `main` `eb7a130`, program `main` `d314006`. 둘 다 깨끗한 worktree다.
- **바뀐 동작:** [0.2.13에서 바뀐 점](FRONTEND_KIRO_NATIVE_HANDOFF.md#0213에서-바뀐-점). 실측: [K23 패널](../tests/eval/results/kiro-0.2.13-k23-panel.md), [K24 Helper 안내](../tests/eval/results/kiro-0.2.13-k24-helper-invite.md).
- **DB:** migration이 없다. 0.2.12 DB를 그대로 쓰고 0.2.12로 되돌려도 열린다.
- **일정:** 본선 발표 2026-10-19, 부스 2026-10-20.

## 1. 할 일

| 순서 | 할 일 | 언제까지 | 끝난 기준 |
| --- | --- | --- | --- |
| 1 | Windows 0.2.13 빌드와 확인 | 발표(10-19) 전, 되도록 바로 | 아래 [2](#2-windows-0213-빌드와-확인)의 확인 |
| 2 | Windows 0.2.13 올리기와 링크 바꾸기 | 1과 함께 | core `main`에 VSIX·receipt·files, 설치 가이드, README를 한 커밋으로([3](#3-올리기)) |
| 3 | 부스 PC 준비 | 부스(10-20) 전 | 0.2.13 설치, 상위 폴더 신뢰(0.2.12 확인 30), Kiro 자동 업데이트 끄기 |

## 2. Windows 0.2.13 빌드와 확인

- **절차:** [Windows에서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서)의 1~4. backend는 `main`의 최신(이 문서가 올라간 커밋 이후), program은 `main` `d314006`이다. 버전은 `0.2.13`으로 나온다.
- **업그레이드 전:** 열려 있는 Kiro 창을 모두 닫는다. 0.2.13 Core가 처음 뜰 때 연결된 폴더의 Steering(0.9.6)과 미리 승인 규칙을 다시 쓴다. 이미 열려 있던 채팅 세션은 이전 Steering을 계속 쓰니 **새 세션(+)**에서 확인한다.
- **확인 항목:** 1~8(설치와 연결), 9·14·16(처음 보는 목표의 새 Project, 첫 Task)은 지금처럼 본다. 아래 31~36을 새로 본다. 26~28은 지난번처럼 지나가며 본다.

31. **탭과 이름:** 패널 이름이 Vibe Helper이고 탭은 진행 · 학습 기록 두 개다. 도우미 탭은 없다.
32. **지금 할 일:** 새 Project를 열면 카드가 연결 → (새 창이면) 신뢰 → 다시 로드 → "오른쪽 Kiro 채팅에 이렇게 보내 보세요. 시작해 줘 [복사]" 순서로 바뀐다. 각 단계에서 카드 문구와 실제로 해야 하는 일이 맞는지, 걸린 초를 알려 주세요.
33. **결정 순간 Helper 안내(K24):**
    - Builder가 선택을 물을 때마다, 마지막 질문 앞에 "몰라도 괜찮고 먼저 물어봐도 된다"는 말과 `/vibe-helper …` 예시, "예시일 뿐이고 내 말로 묻는 게 좋다"는 말이 있다.
    - 패널 카드에 질문, "잘 몰라도 괜찮아요. 고르기 전에 먼저 물어보세요.", 예시 줄과 **예시 복사**가 보인다. 복사하면 클립보드에 `/vibe-helper 이 선택지들이 뭐가 다른지 쉽게 알려줘`가 들어간다.
    - 복사한 문구를 채팅에 붙여 넣어 보낸다. Builder가 파일 수정이나 명령 없이 설명만 하고, 정해지면 번호와 이유를 보내 달라고 끝낸다. 선택으로 기록되지 않는다.
34. **Next Move:** 완료 뒤 후보마다 "다음 작업후보 N번 진행해" 문구와 복사 버튼이 있다. 붙여 넣어 보내면 그 후보로 후속 Task가 시작된다.
35. **다른 Project 창:** Project 폴더 창에서 다른 Project를 열면 카드 위에 "다른 프로젝트의 작업 내역이에요. 이어서 하려면 이 프로젝트를 새 창에서 열어야 해요. [새 창에서 열기]"가 보이고, 복사 문구는 없다. 그 Project 폴더 창을 다시 열면 패널이 그 Project를 연다.
36. **미리 승인(K23):** Builder가 `curl.exe -s localhost:<port>/…`처럼 `http://` 없이 쓰거나 옵션을 앞에 둔 curl, 그리고 `set -e`, `#` 주석 줄이 묻지 않고 돈다. 승인 창이 뜬 명령은 원문을 알려 주세요.

## 3. 올리기

- 확인한 VSIX와 `receipt.json`, `files.json`을 core의 `releases/windows/kiro-native/`에 넣고 0.2.12 파일을 교체한다.
- 같은 커밋에서 아래를 0.2.13으로 바꾼다. 0.2.12 파일을 지우면 지금 링크가 끊기기 때문이다. 포스터의 설치 QR이 설치 가이드를 가리킨다.
  - [설치 가이드](DOWNLOAD_GUIDE.md):
    - Windows 링크와 SHA-256, 확인 명령의 파일 이름
    - 첫 문단의 "Windows는 0.2.13이 올라오기 전까지 0.2.12이며, 화면이 다른 곳은 따로 적었습니다." 문장
    - "(Windows 0.2.12는 …)"로 적은 괄호 세 곳(패널 아이콘, 진행 탭)과 표의 "0.2.13 준비 중"
  - README: Windows 링크와 "**0.2.12**(Windows x64, 0.2.13 준비 중)" 문장
- 커밋 메시지와 [Kiro-native 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)의 Windows 확인 절에 결과(1~16, 26~28, 31~36)를 남긴다.
