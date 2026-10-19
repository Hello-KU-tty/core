# Hello Vibe 설치 가이드

Hello Vibe는 Kiro IDE 확장입니다. Vibe Helper 패널에서 배우고 싶은 것을 바탕으로 만들 프로젝트를 고르고, 실제 만들기는 Kiro 채팅에서 합니다. 이 문서는 본선 설치물 **0.2.14**(Mac, Windows) 기준입니다. 0.2.14는 0.2.13에 연결 안정성 수정(아래 6장)을 더한 것이고 화면은 같습니다.

## 1. 준비물

- **컴퓨터:** Apple Silicon Mac(M1 이상) 또는 Windows 11 x64. Intel Mac, Windows ARM, Linux는 지원하지 않습니다.
- **Kiro IDE:** 최신판. 1.2.56에서 확인했습니다.
- **Kiro CLI:** 2.21.1 이상. 2.29에서 확인했습니다.
- **Kiro 계정:** 모델 사용량(크레딧)이 남아 있는 본인 계정. Kiro IDE와 Kiro CLI에 각각 로그인합니다.
- **인터넷 연결**

Hello Vibe 계정이나 API 키는 없습니다. Node.js, pnpm 같은 개발 도구를 직접 설치할 필요도 없습니다.

## 2. 내려받기

| 운영체제 | 설치 파일 |
| --- | --- |
| Mac (Apple Silicon) | **[0.2.14 내려받기](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/macos/kiro-native/builder-helper-agent-panel-0.2.14-darwin-arm64.vsix)** (약 40MB) |
| Windows (x64) | **[0.2.14 내려받기](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/windows/kiro-native/builder-helper-agent-panel-0.2.14-win32-x64.vsix)** (약 2.5MB) |

링크를 누르면 `.vsix` 파일이 바로 내려받아집니다. [Windows 설치 파일 폴더](../releases/windows/kiro-native/)에서도 받을 수 있습니다.

<details>
<summary>파일이 온전한지 확인하기 (선택)</summary>

| 파일 | SHA-256 |
| --- | --- |
| Mac 0.2.14 | `665d796471845dbc03b6c947a1988061fdf76ccea1750222420a73538104cfdb` |
| Windows 0.2.14 | `9501810e74d229c62a4b99b49ec35c3aec3ac266e1fed27601bfacc1295ed927` |

Mac 터미널:

```sh
shasum -a 256 ~/Downloads/builder-helper-agent-panel-0.2.14-darwin-arm64.vsix
```

Windows PowerShell:

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\builder-helper-agent-panel-0.2.14-win32-x64.vsix"
```

빌드 출처와 파일별 해시는 [Mac receipt](../releases/macos/kiro-native/macos-vsix-receipt.json), [Windows receipt](../releases/windows/kiro-native/windows-vsix-receipt.json)에 있습니다.

</details>

## 3. 설치

### Kiro IDE

[Kiro 다운로드 페이지](https://kiro.dev/downloads/)에서 **IDE**를 받아 설치하고 로그인합니다.

### Kiro CLI

후보 찾기, 계획 세우기, 학습 분석은 Kiro CLI로 실행됩니다. 터미널에서 설치합니다.

Mac 터미널:

```sh
curl -fsSL https://cli.kiro.dev/install | bash
```

Windows PowerShell:

```powershell
irm https://cli.kiro.dev/install.ps1 | iex
```

새 터미널에서 `kiro-cli login`으로 로그인하고, `kiro-cli whoami`가 계정을 보여 주는지 확인합니다. IDE 로그인과는 따로입니다. Kiro를 열어 둔 채 설치했다면 Kiro를 완전히 종료했다가 다시 엽니다.

### Hello Vibe 확장

1. Kiro에서 확장 화면을 엽니다. Mac은 `Cmd+Shift+X`, Windows는 `Ctrl+Shift+X`입니다.
2. 확장 화면 위쪽의 `…` 메뉴에서 **Install from VSIX…** 항목을 고르고 내려받은 `.vsix` 파일을 선택합니다.
3. 다시 로드하라는 안내가 나오면 따릅니다.
4. 왼쪽 막대의 **Vibe Helper** 아이콘을 누릅니다. 패널이 로컬 Core에 자동으로 연결됩니다.

Windows에서는 첫 실행 때 Hello Vibe가 Node.js 24.19.0을 내려받아 무결성을 확인한 뒤 씁니다. PC에 설치된 Node.js는 쓰지 않습니다.

## 4. 첫 프로젝트 만들기

1. Kiro에서 **빈 폴더**를 열고, 폴더를 신뢰할지 물으면 신뢰합니다. 폴더를 열지 않았거나 파일이 있는 폴더라면 6번에서 Hello Vibe가 프로젝트용 새 폴더를 만들어 새 창으로 엽니다.
2. 패널에 **학습 목표**를 적습니다. 예: `TypeScript로 상태에 따라 화면이 바뀌는 앱을 만들어 보고 싶어요.` 현재 실력, 개인적인 필요, 최근의 어려움은 선택입니다. **후보 만나기**를 누르면 20~40초 뒤 프로젝트 후보가 나옵니다.
3. 마음에 드는 후보에서 **이걸로 진행**을 누릅니다. 원하는 게 없으면 방향을 적고 **보완하기**를 누릅니다.
4. 계획(이번 프로젝트의 범위, 만들면서 정하게 될 것들)을 읽고, 고칠 곳이 있으면 적어서 **이 내용으로 고치기**, 괜찮으면 **이걸로 시작**을 누릅니다.
5. 처음 한 번 명령 승인 방식을 묻습니다.
   - **개발 명령 미리 승인:** 설치·빌드·테스트, 내 컴퓨터 서버 확인과 브라우저로 열기 같은 자주 쓰는 명령은 묻지 않습니다. 파일 삭제, 배포, git push 같은 명령은 계속 묻습니다. Kiro 채팅도 Autopilot으로 시작해서 파일 수정을 하나씩 검토하지 않아도 됩니다(Kiro 채팅에서 직접 모드를 바꾼 적이 있으면 그 선택을 따릅니다).
   - **수동으로 승인:** 명령마다 Kiro가 확인을 받습니다.
   - 나중에 명령 팔레트의 **Vibe Helper: Change Command Approval**로 바꿀 수 있습니다.
6. Hello Vibe가 이 프로젝트를 Kiro 채팅에 연결합니다. 패널 맨 위 **지금 할 일**이 신뢰, 다시 로드처럼 지금 할 일을 하나씩 알려 줍니다. 새 창으로 열렸다면 새 창에서 '신뢰'를 누른 뒤 패널이 다시 뜨기까지 보통 10~30초 걸립니다. 연결이 끝나면 Hello Vibe가 Kiro 채팅에 새 세션을 열어 주고, 패널이 보낼 첫 말 `시작해 줘`와 복사 버튼을 보여 줍니다. 그대로 보내거나 "시작하자"처럼 말하면 Kiro가 계획대로 만들기 시작합니다. 새 세션이 열리지 않았으면 Kiro 채팅의 **+** 버튼으로 엽니다.
7. 만들다가 정해야 할 것이 생기면 Kiro가 번호가 붙은 선택지로 묻고 기다립니다. **잘 몰라도 괜찮습니다.** 고르기 전에 `/vibe-helper 1번이랑 2번이 뭐가 다른지 알려줘`처럼 먼저 물어보세요. Kiro와 패널이 예시 질문을 보여 주고 패널에서는 복사도 됩니다(0.2.13부터). 예시는 예시일 뿐이고, 내가 이해한 대로·헷갈리는 부분을 내 말로 묻는 게 더 좋습니다. 정했으면 번호와 함께 **고른 이유를 한 문장** 적어 주세요. 그 이유가 학습 기록의 근거가 됩니다. "응"이나 버튼 클릭만으로는 이해했다고 기록하지 않습니다. 묻는 중에 궁금한 걸 물어봐도 선택으로 기록되지 않습니다. 고르지 않은 선택이 기록됐다면 채팅에 "그건 내가 고른 게 아니야"라고 말하세요. 그 선택을 기록에서 빼고 다시 물어봅니다(0.2.9부터).
8. 작업이 끝나면 Kiro가 만든 앱의 서버를 켜 둔 채 브라우저로 열어 주고 주소를 알려 줍니다.
9. 작업 하나가 끝나면 패널 **진행** 탭에 "다음 한 걸음" 카드가 10초 안팎에 뜹니다. 이 프로젝트를 키울 방향 3개가 나옵니다. 하고 싶은 것이 있으면 그 카드의 문구("다음 작업후보 2번 진행해")를 복사해 Kiro 채팅에 보내면 이어서 만듭니다. 그냥 두거나, 원하는 기능을 직접 말해도 됩니다. 진행 탭에는 지금 Kiro 채팅이 기다리는 질문, 이번 작업에서 고른 것과 인정된 학습 기록도 보입니다.

**질문하기:** 만들기를 하던 채팅에 `/vibe-helper 질문`을 입력합니다. 붙여 넣어도 됩니다. 그 질문에는 코드를 읽고 설명만 하며 수정하지 않고, 선택으로 기록하지도 않습니다. 고칠 것은 `/vibe-helper` 없이 이어서 부탁합니다. 0.2.13부터 패널에는 도우미 탭이 없고 질문은 Kiro 채팅에서 합니다.

**기록 보기:** 패널의 **학습 기록** 탭에서 개념마다 내가 직접 한 말과 고른 이유를 봅니다. 코드에만 쓰인 개념은 따로 이름만 모입니다. 학습 요약은 프로젝트 폴더의 `.vibe-helper/learner-profile.md`에 저장되고, **새 채팅 세션부터** Kiro의 설명에 반영됩니다.

**이어서 하기:** Kiro를 껐다 켜도 연결은 유지됩니다. 프로젝트 폴더를 열면 패널이 그 폴더의 프로젝트를 엽니다(0.2.13부터). 새 채팅 세션에서 이어 갑니다. 다른 프로젝트는 패널 첫 화면의 **이전 프로젝트**에서 **이어서 보기**를 누릅니다. 그 프로젝트의 폴더가 아닌 창이면 "다른 프로젝트의 작업 내역이에요"와 **새 창에서 열기**가 보입니다.

## 5. 업데이트

1. 진행 중인 채팅 답변이 끝난 뒤 새 `.vsix`를 같은 방법(**Install from VSIX…**)으로 설치합니다.
2. 열려 있는 Kiro 창을 모두 닫았다가 다시 엽니다. 이전 Core가 끝나기 전에는 "이전 버전의 Core를 사용하는 Kiro 창이 종료되기를 기다리고 있어요"가 보일 수 있습니다. 다른 Kiro 창을 닫고 **Vibe Helper: Retry Core Connection**을 실행합니다.
3. 이전 프로젝트와 Kiro 채팅 연결은 그대로 남습니다. 다시 연결하지 않아도 됩니다.
4. Kiro 채팅에서 **새 세션(+)**을 열고 이어 갑니다. 진행 중이던 세션은 이전 버전의 안내를 계속 씁니다.

0.2.9를 한 번 실행하면 저장소 형식이 바뀌어 0.2.8 이하로 되돌릴 수 없습니다.

이전 버전이 터미널과 출력 창을 Kiro 채팅 자리로 옮겼을 수 있습니다. 0.2.9 이상을 처음 열 때 "원래 배치로 되돌리기"를 물으면 누르세요(Kiro 화면 배치가 처음 상태로 돌아갑니다).

## 6. 문제가 생기면

명령 팔레트는 Mac `Cmd+Shift+P`, Windows `Ctrl+Shift+P`입니다.

화면에 보이는 문구별로 정리했습니다.

- **"Kiro CLI를 찾지 못했어요"**: 3단계의 Kiro CLI를 설치하고, Kiro를 완전히 종료했다가 연 뒤 **Vibe Helper: Retry Core Connection**을 실행합니다.
- **"Kiro CLI 로그인이 필요해요"**: 터미널에서 `kiro-cli login`을 실행한 뒤 **Retry Core Connection**을 실행합니다. 이전 기록은 계속 볼 수 있습니다.
- **"Core 준비 실패"**: **재시도** 또는 **Retry Core Connection**을 누릅니다. 코드가 `KIRO_NATIVE_HOST_PLATFORM_UNSUPPORTED`이면 지원하지 않는 컴퓨터입니다.
- **"Core에 연결할 수 없어요 (코드)"**(0.2.14부터 코드가 함께 보입니다): 먼저 **Retry Core Connection**을 실행하고, 그래도 같으면 괄호 안 코드를 알려 주세요.
- **"이 프로젝트 터미널에 Hello Vibe의 Node·npm을 준비하지 못했어요"**(0.2.14부터): 패널과 Kiro 채팅은 그대로 쓸 수 있습니다. Kiro 채팅의 설치·테스트 명령이 실패하면 창을 다시 로드하고 새 세션에서 이어 갑니다.
- **"Vibe Helper Core에 연결하지 못했어요"**(0.2.10부터, 프로젝트 폴더 창): Hello Vibe가 잠시 뒤 저절로 다시 시도합니다. 바로 다시 시도하려면 알림의 **다시 연결**을 누릅니다.
- **"Kiro 사용량 한도에 도달했어요"**: Kiro 계정의 크레딧을 확인합니다.
- **"계획을 확정하고 작업이 준비된 뒤에 … 열 수 있어요"**: 4단계 4번의 **이걸로 시작**을 먼저 누릅니다.
- **Kiro 채팅이 계획을 모르거나 Vibe Helper 도구를 쓰지 못할 때**: 폴더를 신뢰했는지 확인하고, 명령 팔레트의 **Developer: Reload Window**로 창을 다시 로드한 뒤 새 세션에서 시작합니다. Kiro의 MCP 서버 목록에서 `vibe-helper`가 Connected인지도 봅니다. Kiro는 한 번 끊긴 MCP 서버를 스스로 다시 띄우지 않아서, Kiro 채팅이 "Vibe Helper 도구를 쓸 수 없다"고 하면 창을 다시 로드해야 합니다.
- **Kiro 채팅이 선택을 묻지 않고 "워크플로우로 구현"할 때**: Kiro 설정의 Workflows(`kiroAgent.workflows.enabled`)가 켜져 있으면 Kiro가 구현을 별도 작업으로 넘길 수 있고, 그 작업은 선택을 묻지 못합니다. Hello Vibe는 채팅에서 직접 만들게 안내하지만, 계속 그러면 명령 팔레트의 **Disable Workflows**로 끄고 새 세션에서 시작합니다.
- **명령이 도는 동안 터미널이 Kiro 채팅 자리를 가릴 때**: 이전 버전이 옮겨 둔 화면 배치가 남아 있는 경우입니다. 명령 팔레트의 **Vibe Helper: Restore Kiro Layout**(Mac 0.2.12, Windows 0.2.11부터) 또는 **View: Reset View Locations**로 처음 배치로 되돌립니다. 직접 옮긴 창 위치도 함께 돌아갑니다.
- **VSIX가 설치되지 않을 때**: Mac은 `darwin-arm64`, Windows는 `win32-x64` 파일인지 확인합니다.

해결되지 않으면 [GitHub 이슈](https://github.com/Hello-KU-tty/core/issues)에 운영체제, Kiro 버전(Help → About), `kiro-cli --version` 결과, 확장 버전, 화면의 오류 문구를 적어 주세요. 로그인 정보, 토큰, 대화 원문은 붙이지 마세요. 문제를 풀려고 프로젝트 폴더나 기록을 지울 필요는 없습니다.

## 7. 데이터와 사용량

- **저장 위치:** 학습 목표, 채팅 발언, 선택과 이유, 분석 결과는 이 컴퓨터의 로컬 SQLite(Kiro의 확장 전용 저장 공간)에 저장됩니다. 클라우드 동기화는 없습니다. 자동 삭제와 내보내기 기능은 아직 없습니다.
- **채팅 기록:** 연결한 프로젝트 폴더의 Kiro 채팅 발언은 학습 기록으로 저장됩니다. 저장 전에 알려진 형태의 비밀 정보는 가리지만 완벽하지 않습니다. 토큰, 비밀번호, 개인정보는 입력하지 마세요.
- **프로젝트 폴더에 생기는 파일:** `.kiro/`(Kiro 설정: steering, hook, MCP, Spec)와 `.vibe-helper/`(학습 요약)입니다. 0.2.8 이하가 만든 도우미 에이전트 파일(`.kiro/agents/vibe-helper.json`)은 0.2.9가 다시 연결할 때 지웁니다.
- **모델 사용량:** 본인 Kiro 계정의 크레딧이 쓰입니다. Kiro 채팅(만들기, 도우미)은 Kiro IDE 계정, 후보 찾기·계획·학습 분석·다음 한 걸음은 Kiro CLI 계정에서 차감됩니다.
- **삭제:** 확장 화면에서 Hello Vibe를 제거해도 기록과 프로젝트 폴더는 남습니다.

## 8. 소스에서 직접 빌드 (개발자용)

Node.js 24.x와 pnpm 11.x(권장 24.19.0, 11.13.1)가 필요합니다. [core](https://github.com/Hello-KU-tty/core)와 [program](https://github.com/Hello-KU-tty/program)을 받은 뒤:

```sh
# program 폴더에서
npm ci --ignore-scripts

# core 폴더에서
pnpm install --frozen-lockfile
pnpm panel:pack:macos <program 폴더>          # Mac
pnpm panel:pack:kiro-windows <program 폴더>   # Windows
```

결과는 core 폴더의 `dist/`에 생깁니다. program은 `main`으로 빌드합니다. Windows 빌드와 확인 절차는 [본선 인계 문서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서), 저장소 검증은 [README](../README.md#개발-환경과-검증)에 있습니다.

## 예선 설치물

예선 설치물(Mac 0.1.4, Windows 0.0.18)은 Kiro 1.1.70 전용이고 Kiro 채팅 연결이 없습니다. 기록은 [예선 다운로드 가이드](archive/preliminary/DOWNLOAD_GUIDE_PRELIMINARY.md), [Mac 0.1.4](MAC_VSIX.md), [Windows 0.0.18](WINDOWS_VSIX.md)에 남아 있습니다.
