# 심사 전 저장소·배포·제출 자료 감사

2026-09-30 KST. 구현·공개 업데이트 전에 수행한 조사와 권고다. 코드, 기존 제출 자료, 사용자 데이터와 GitHub는 변경하지 않았다. 유료 모델 호출은 하지 않았다.

## 1. 결론과 실행 순서

가장 큰 문제는 공개 설치물과 공개 소스가 서로 다른 버전이라는 점이다. 특히 Mac VSIX는 최신 프론트 수정이 빠진 과거 소스를 포함한다. 새 기능을 늘리기보다 소스와 설치물 일치, 실제 설치본 완주, 영상 재제작과 설명 정합성을 먼저 처리한다.

| 순서 | 우선순위 | 대상 | 필요한 조치 | 완료 기준 |
| --- | --- | --- | --- | --- |
| 1 | P0 | 소스·설치물 기준 | Windows 0.0.17의 소스 확보, 로컬 Mac 변경 검토, 두 저장소 commit 조합 확정 | VSIX·kit·소스·검증 기록이 같은 조합을 가리킴 |
| 2 | P0 | Mac VSIX | 최신 프론트로 다시 만들고 버전·receipt 갱신 | 최신 기능 포함, 설치·실제 전체 흐름 PASS |
| 3 | P0 | 양 OS 설치본 | 실제 Discovery→Spec→Builder→Decision/Helper→결과 앱→History 확인 | 새 배포 파일을 설치한 환경의 실측 기록 |
| 4 | P0 | README 영상 | 실제 결과물과 Helper/Decision/Evidence 중심으로 재촬영 | 작은 화면에서도 읽히는 약 3분 영상, 기존 주소 유지 |
| 5 | P0 | program README | mock 전용이라는 설명을 현재 제품에 맞춤 | 소스 저장소 첫 화면에서 제품 설치·실행·검증 경로 확인 가능 |
| 6 | P1 | 개발자 ZIP | 최신 조합으로 재현 가능한 개발 묶음과 설명 준비 | 빈 폴더에서 두 소스·필요한 자산으로 패키징 가능 |
| 7 | P1 | 제출 설명 | 제품명·사용자 인터뷰·테스트 수·지원 범위 정합성 보완 | PDF와 공개 문서가 같은 사실을 설명 |
| 8 | P1 | GitHub 진입·문서 | 조직에서 제품으로 연결, 깨진 근거 링크 보완 | 제출 진입 주소부터 설치·영상·근거까지 접근 가능 |
| 9 | P2 | 기능·운영 보완 | B3 실패 복원, Helper 기록, CI·license 등 | P0 완료 후 영향 범위에 맞춰 별도 처리 |

심사 시작 시각은 확인되지 않았다. [공식 홈페이지](https://ku-aws-challenge.framer.ai/)는 예선 심사를 9/30~10/2로 안내한다. 사용자 제공 제출 화면은 마감 9/30 00:00, 마지막 저장 9/29 23:59:59를 보여준다. 공개 공지에서 마감 후 수정 허용 여부는 확인하지 못했다. URL 유지가 마감 후 수정 허용이나 이력 비공개를 의미하지 않는다.

## 2. 실제 제출 주소와 고정 범위

두 스크린샷은 같은 제출 상태를 보여준다.

| 자료 | 제출 화면 또는 공개 문서의 주소 | 처리 원칙 |
| --- | --- | --- |
| 소스 진입 | `https://github.com/Hello-KU-tty` | 조직 이름 유지. core/program로 명확히 안내 |
| 서비스 배포 진입 | `https://github.com/Hello-KU-tty/core/blob/main/docs/DOWNLOAD_GUIDE.md` | repository·branch·파일 경로 유지 |
| 제출 PDF | 제출 서버의 `/decks/31-322067.pdf` | GitHub와 별개. GitHub 변경으로 이 업로드가 바뀌지 않음 |
| 시연 영상 | `https://github.com/Hello-KU-tty/core/blob/main/docs/assets/vibe-helper-demo.mp4` | 기존 MP4 경로 유지 |
| Windows VSIX | `https://github.com/Hello-KU-tty/core/blob/main/releases/windows/0.0.17/builder-helper-agent-panel-0.0.17-win32-x64-828aca63a3be.vsix?raw=true` | 기존 다운로드 주소 보존 |
| Mac VSIX | `https://github.com/Hello-KU-tty/core/blob/main/releases/macos/0.1.0/builder-helper-agent-panel-0.1.0-darwin-arm64.vsix?raw=true` | 기존 다운로드 주소 보존 |
| 개발자 update kit | `https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/frontend-handoff/20260927/frontend-handoff-20260927.zip` | 기존 다운로드 주소 보존. 내용의 적용 대상은 반드시 일치시킴 |

제출 화면의 배포 URL 앞부분은 입력창에서 잘려 있지만, 표시된 뒷부분과 공개 문서 경로가 일치한다. PDF의 상대 경로만으로 제출 서버 도메인을 추정하지 않았다.

조직·문서·영상 페이지는 비로그인 HTTP 200, 세 주요 설치/ZIP 주소는 리다이렉트 후 HTTP 200이었다. 두 저장소 모두 public이다. 현재 `releases/`는 Git에 추적된 일반 디렉터리다. GitHub Releases와 Git tag는 양쪽 모두 0개다.

### 같은 주소로 갱신하는 방법

현재 주소는 `main`의 경로이므로 같은 파일 경로를 일반 commit으로 갱신하면 URL은 유지된다. 링크가 commit SHA에 고정돼 있지 않다는 점을 이용하는 정상적인 배포 방식이다. 기존 경로를 삭제하거나 브랜치 이름을 바꾸지 않는다.

다만 현재 파일명과 상위 디렉터리에 버전·빌드 식별자가 포함돼 있다. **주소를 유지하는 것과 동일한 버전으로 위장하는 것은 분리한다.** 파일을 바꾸면 VSIX 내부 version을 올리고, 가이드에서 실제 설치 버전·소스 commit·빌드 시각·SHA-256을 함께 갱신한다. 기존 경로를 계속 쓴다면 고정 다운로드 주소로 취급한다는 점과 실제 내부 버전을 설명한다. 같은 version의 서로 다른 바이너리를 배포하면 설치 캐시와 업그레이드 판별, 재현이 혼란스러워진다.

한 번의 배포 commit에는 바이너리, 다운로드 가이드, OS 설치 안내, receipt/hash를 함께 포함한다. GitHub에 반영한 후 비로그인으로 실제 바이트를 다시 내려받아 hash를 대조하고 설치한다. 옛 파일은 기존 Git commit으로 회수할 수 있게 이력을 보존한다. 캐시 때문에 즉시 새 파일이 보일 것으로 가정하지 않는다.

날짜가 박힌 20260927 ZIP을 최신 내용으로 교체한다면 내부 README·manifest·적용 스크립트와 외부 receipt도 함께 바꿔야 한다. 과거 인계 문서가 그 주소의 옛 바이트를 증거로 인용하는 경우에는 기존 commit의 영구 링크를 근거로 분리한다. 이미 제출된 주소는 그대로 둔다.

장기적으로는 고정된 `releases/latest/download/<일정한 파일명>`과 버전별 보존본을 조합할 수 있다. 다만 현재 Releases가 없으므로 이번 심사 전 주소 유지에 필수인 변경은 아니다. [GitHub의 최신 release 링크](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)를 따르며, [immutable release](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)는 공개 후 asset/tag를 바꿀 수 없다는 제약이 있다.

## 3. 저장소와 설치물의 불일치

### 3.1 조사 기준

| 대상 | 확인한 기준 |
| --- | --- |
| GitHub core/main | `0e4f8812f8183409108d12bc0b4edb866b457466` |
| GitHub program/main | `e1cffdd24ccc81835cf2c26617462ebbdb1ccca1`, package 0.0.16 |
| 현재 core checkout | `5fb8e64`, origin/main보다 1 commit 뒤. Mac 구현·문서 등 기존 미커밋 변경 있음 |
| 인접 frontend checkout | `fix/discovery-reload-restore@14cc61b`, package 0.0.3 |
| 최신 frontend 별도 worktree | `program-demo-e1cffdd`, 공개 program/main과 동일 |
| 공개 Windows VSIX | 0.0.17, kit 2026.09.29.4라는 설치 문서 |
| 공개 program의 kit | 2026.09.29.3, backendHead `505ea587…`, 관리 파일 118개 hash 일치 |
| 공개 Mac VSIX | 0.1.0, 프론트 번들이 `14cc61b`에서 재빌드한 결과와 바이트 단위로 일치 |

공개 브랜치와 현재 접근 가능한 로컬 refs를 조회했으나 Windows 0.0.17의 `PROJECT_RECORDED_NODE_UNAVAILABLE` 구현은 공개 core 소스에서 찾지 못했다. 공개 Windows VSIX에는 이 구현이 있다. 프론트의 Helper 요약 제거 역시 공개 program/main에는 없다. Windows 제작 PC의 미공개 소스를 확보해 대응 관계부터 정리해야 한다.

### 3.2 P0: Mac은 최신 프론트 기능이 빠져 있음

Mac 패키징 스크립트 `scripts/package-macos-program.mjs:12`는 인자를 생략하면 인접 `../vibe-helper-frontend`를 사용한다. 이 디렉터리는 오래된 브랜치다. 공개 Mac VSIX의 두 번들을 같은 빌드 옵션으로 대조했다.

| 번들 | 공개 Mac VSIX와 `program@14cc61b` 재빌드 일치 | SHA-256 |
| --- | --- | --- |
| `extension/dist/extension.js` | 완전 일치 | `7ecead06f04d2d89c3e5bc6c80ea144367ada580eaa1e2eb456792f5f2340c3c` |
| `extension/dist/webview/main.js` | 완전 일치 | `2c313272c6351aa3e4694bb317e1ecfb295c459b7ba2485e735de47673a0b0a3` |

최신 `e1cffdd`로 빌드한 두 번들과는 일치하지 않았다. Mac 바이너리에는 최신 `resolveDecisionAndContinue`, 명시적 Spec 시작에 연결된 Builder 자동 시작 코드, `agent-chat-message` 기반 연속 채팅 표시가 없다. Windows 0.0.17에는 이 코드가 있다. 단순 버전 라벨 차이가 아니다.

처리: 최신 프론트 경로와 commit을 명시하도록 패키징을 보완하고, 구버전 checkout을 조용히 사용하지 않도록 검사한다. receipt에 backend/frontend SHA, dirty 여부, kit 버전, OS target, 내부 extension version, 번들 hash를 기록한다. Mac 버전은 0.1.1 이상으로 올리는 것이 적절하다. 실제 설치본에서 Spec 시작·Decision 계속하기·Helper 대화를 확인한다.

### 3.3 P0: Mac 패키징 소스가 공개돼 있지 않음

공개 core/main에는 `panel:pack:macos`와 `scripts/package-macos-program.mjs`, `scripts/mac-node-distribution.mjs`, `scripts/test-macos-package.mjs`가 없다. 필요한 runtime/terminal 변경도 로컬 미커밋 상태다. `docs/MAC_VSIX.md`의 재현 명령은 공개 clone으로 실행할 수 없다. 문서도 이를 별도 한계로 적고 있다.

처리: origin/main을 기준으로 별도 작업 경로를 만들고 기존 Mac 변경을 파일별로 검토·통합한다. 현재 로컬 README/다운로드 가이드를 그대로 덮어쓰면 origin/main에만 있는 Windows 다운로드 안내를 잃을 수 있으므로 두 변경을 합친다. 사용자 작업물을 reset하거나 무관한 PPTX·실험물을 일괄 stage하지 않는다.

### 3.4 P0: Windows 0.0.17 소스 재현 불가

[Windows 안내](https://github.com/Hello-KU-tty/core/blob/main/docs/WINDOWS_VSIX.md)는 0.0.17/kit4/프론트 800 tests를 기록한다. 공개 program/main은 0.0.16/kit3/794 tests다. 공개 소스에서 빌드해도 게시된 0.0.17의 수정과 검증 구성을 얻지 못한다.

처리: Windows 제작 checkout의 runtime 도구 재사용 수정, 관련 tests, Helper 요약 UI 제거, package/lock version, kit4 receipt를 가져온다. Core→kit→program→VSIX 순서로 재생성하고 검증한다. 버전 숫자만 0.0.17로 고치는 것으로 해결되지 않는다. Mac 결과를 Windows PASS로 대신하지 않는다.

### 3.5 P1: ZIP은 최신 개발용 전체 소스가 아님

현재 다운로드 가이드의 ZIP은 9/27의 부분 update kit다. `program@048bce3`에 9/26 kit이 이미 적용돼 있다는 전제가 있다. 최신 program에 덮어쓰는 일반적인 개발용 ZIP이 아니고 Mac runtime도 포함하지 않는다.

처리: 심사자가 필요로 하는 것은 최신 소스의 재현 경로다. 두 저장소 commit 조합과 일치하는 완전한 개발 묶음을 준비하거나, kit라는 성격·필수 baseline·지원 OS를 명확히 유지한다. `docs/SOURCE_REPRODUCIBILITY_20260929.md`의 실제 소스 ZIP 링크는 추적되지 않는 `dist/`를 가리켜 GitHub에서 열리지 않는다. 공개 가능한 정제 소스·receipt를 제공하고 새 압축 해제본으로 검증해야 한다.

## 4. 실제 설치 검증과 잔여 기능

두 최신 설치 안내 모두 설치·자동 검사와 실제 유료 모델 전체 완주를 구분한다. 과거 9/25 Windows 및 9/28 Mac 개발 host 완주 기록은 존재하지만, 그것이 현재 0.0.17/0.1.0 설치본의 전체 검증은 아니다.

다음 실측은 배포하려는 정확한 VSIX를 별도 profile에 설치해 진행한다. 개인 계정 사용량·Overages·기존 작업 idle을 확인하고, 기존 사용자 프로젝트 대신 합성 새 프로젝트를 사용한다.

1. 설치→Core 자동 시작→새 학습 목표에서 후보 10개 확인. 실패 후 재시도도 확인.
2. 후보 선택→Spec 확인/수정→명시적 시작에서 Builder가 정확히 한 번 실행되는지 확인.
3. 실제 Decision에서 Helper에게 묻고, 이유를 입력해 선택한 뒤 같은 Task가 이어지는지 확인.
4. Helper 별도 창 준비와 B7 tool catalog 오류 재발 여부, 실제 Builder shell·검증 완료 판정 확인.
5. 결과 앱을 브라우저에서 조작하고 핵심 동작을 확인.
6. Evidence의 출처와 상태를 확인. Agent가 만든 코드나 클릭만으로 사용자 이해 상태가 오르지 않아야 함.
7. 후속 Task/마지막 개선, 재시작 History와 새 모델 요청 없는 복원 확인.
8. Need 유무와 기존 테스트에 없던 목표를 구분해 관측. 검증하지 못한 경우 그대로 기록.

| 잔여 항목 | 관측 근거와 처리 |
| --- | --- |
| B7 Helper 도구 0개 | 진단·복구 보완은 있으나 원인 해결 실측이 남음. 설치본에서 재현되면 P0로 승격 |
| B8/B13 Builder shell·완료 | 자동 회귀는 있으나 최신 설치본의 native 경로 확인 필요. 허용 목록을 풀어서 통과시키지 않음 |
| B3 실패 History | 실패 이유가 재시작 후 사라질 수 있고 탐색 중으로 남음. P1 복구 개선 후보. 데이터 삭제 없이 durable 실패·재시도/abandon 설계 필요 |
| Helper 재접속 기록 | 전체 대화 복원과 저장된 요약 복원을 구분. 0.0.17의 요약 표시 제거로 복원이 강화됐다고 설명하지 않음 |
| Discovery/Spec의 Helper | 현재 화면에는 노출되지 않는다는 인계 기록. 심사 직전 역할/범위 확대보다 지원 범위 설명 정합성을 우선 |
| Analyst 의미 오류 | 계획/수행 오분류 한계 유지. 촬영용으로 근거를 조작하거나 reducer를 완화하지 않음 |

Kiro 공식 다운로드는 조사 시점 IDE 1.1.70을 최신으로 표시했다. 현재 제품 pin과 맞지만 내장 Agent 1.1.158 및 source gate까지 설치 후 확인해야 한다. [공식 다운로드](https://kiro.dev/downloads/)

## 5. 영상 재제작

현재 `docs/assets/vibe-helper-demo.mp4`는 176.53초, 1200×766, H.264 영상만 있으며 오디오 stream은 없다. 10초 간격으로 전체를 샘플링하고 주요 장면을 확인했다. 시작부의 Kiro 세션 이전 팝업, 긴 후보/Spec 대기, 끝의 영어 Builder stream이 눈에 띈다. 제품 패널이 화면의 일부만 차지하고 빈 Kiro 화면이 넓다. 샘플에서 결과 앱 실행·Helper 설명·Evidence·개인화가 전달되지 않는다. README도 Builder 시작까지의 영상으로 설명한다.

사용자 요청에 따라 재제작이 필요하다. 코드를 바꾸기 전에 녹화하면 다시 촬영할 가능성이 높으므로 설치본과 시나리오를 먼저 고정한다. 발표 PDF 9쪽의 독서 기록 대시보드를 사용할 수 있다면 발표와 영상의 맥락을 맞추기 좋다. 다른 프로젝트라면 새 시연임을 분명히 한다.

| 분량 예시 | 보여줄 장면 | 전달할 내용 |
| --- | --- | --- |
| 0:00~0:12 | 완성 앱에서 필터/정렬 직접 조작 | 실제로 작동하는 결과물이 먼저 보임 |
| 0:12~0:35 | 학습 목표→후보 추천 이유→선택 | 배울 개념이 필요한 프로젝트를 찾음 |
| 0:35~0:50 | Spec의 세 범위와 시작 | 사용자가 배울 것과 Agent가 맡을 것 |
| 0:50~1:20 | Builder의 코드·테스트와 실제 Decision | 개발 과정과 실제 판단을 보여줌 |
| 1:20~1:55 | 같은 Decision을 Helper에게 질문→사용자가 이유를 말하고 선택→계속 실행 | 제품의 핵심 사용 경험 |
| 1:55~2:15 | 결과 앱 다시 실행·기능 검증 | 선택과 구현의 결과 |
| 2:15~2:40 | Evidence 출처와 이해 상태 또는 보류 이유 | 코드 작성과 사용자 이해의 차이 |
| 2:40~3:00 | History/다음 Helper 또는 후속 작업·설치 주소 | 기록이 다음 사용으로 이어지는 지점 |

촬영 화면은 패널과 관련 코드를 읽을 수 있게 확대한다. 실제 한국어 UI와 짧은 자막을 쓰고, 대기는 편집으로 줄이되 편집·배속을 표시한다. 결과 앱, Decision, Helper는 내용을 읽을 수 있을 만큼 유지한다. 일반 Kiro 팝업·불필요한 사이드바·계정 사용량·개인 경로는 프레임에서 제외한다. 기존 파일은 보존한 상태로 새 영상의 처음부터 끝까지 검토한 후 같은 MP4 경로에 교체한다.

촬영을 위해 합성 입력을 썼다면 사람의 학습 효과로 소개하지 않는다. Evidence가 보류되면 그 실제 상태와 이유를 보여줄 수 있다. 녹화나 mock fixture를 새로운 입력에 대한 live 검증으로 표시하지 않는다.

## 6. README·발표자료·공개 근거

### P0: program README

[program README](https://github.com/Hello-KU-tty/program/blob/main/README.md)는 Node >=18, VS Code ^1.90, mock 자동응답, native 연결 미구현이라고 설명한다. 실제 package는 Node24.19.0 / API1.131.0이며 `src/extension.ts`가 managed host를 연결한다. 제품과 개발 fixture 설명이 섞인 오래된 문서다.

제품명, 실제 기능, 운영체제별 설치 안내 링크, 영상, 두 저장소 역할, 고정 개발 도구와 실행 명령, 실제 모델 검사 범위를 첫 화면에 정리한다. 데모 adapter가 남아 있다는 사실은 개발용 설명으로 분리한다.

### P1: 발표 PDF와 core README

사용자가 저장소에 둔 `Hello Vibe 서비스 소개서.pdf`는 10쪽이다. 제출 서버 파일과 바이트가 같은지는 다운로드 원본이 없어 확정하지 않았다. 본문에 명시적 clickable URL annotation은 없고 마지막 페이지에 조직 주소가 텍스트로 표시된다.

- PDF 제품명은 Hello Vibe, 공개 core README는 Vibe Helper, program README/확장명은 Builder & Helper Agent Panel이다. 공개 설명을 Hello Vibe로 맞추되 확장 내부 `publisher/name`, 저장소명, command ID, global storage key는 이름 정리 목적으로 바꾸지 않는다. 데이터·업그레이드 경계에 영향을 준다.
- PDF 10쪽은 직접 사용한 신입생 A/B의 인터뷰를 소개한다. README는 아직 초보 사용자 검증을 하지 않았다고 한다. 실제 인터뷰 진행·공개 동의 여부를 사용자에게 확인 요청했다. 실제 자료라면 날짜·버전·참여자 수·질적 피드백 범위의 익명 요약을 근거로 문서를 맞춘다. 장기 학습 효과나 비교 우월성으로 확대하지 않는다. 확인 전에는 어느 쪽도 임의로 사실로 확정하지 않는다.
- PDF 9쪽과 README의 719/564/161은 과거 검증 시점 수치다. 현재 공개 소스의 794와 Windows 문서의 800을 뒤섞지 않는다. 표마다 날짜·commit·OS·모델 사용 여부를 붙인다.
- PDF 7쪽의 질문 기록과 이해 상태 상승을 구분해서 설명한다. `evidence-policy.ts`는 QUESTION 자체로 상태를 올리지 않는다.
- PDF 9쪽의 대화 복원은 최신 제품의 전체 대화 복원과 같은 뜻으로 확대하지 않는다. PDF 10쪽의 Kiro Crew 테스트 완료는 기존 Crew 경로의 회귀 기록 범위로 설명한다.
- 폴더의 PPTX 두 개는 10쪽이지만 편집 지시문과 placeholder가 남아 있는 초안이다. 제출 PDF와 다르므로 이들을 최종 발표자료로 공개하면 안 된다. 사용자가 제공한 PDF 원본을 보존한다.

현재 PDF에 맞추기 위해 구현되지 않은 기능이나 인터뷰를 추가로 만들어낸 것으로 설명해서는 안 된다. 원본 PDF의 수정은 GitHub 파일 수정과 별개이며 이번 감사에서는 하지 않았다.

### P1: 근거 링크와 최신 상태

공개 소스의 Markdown 파일을 대상으로 경로 존재 검사를 했다. core 148개 파일/상대 링크 549개 중 27건, program 28개 파일/상대 링크 19개 중 9건이 공개 checkout에 없는 경로를 가리켰다. 코드 블록 안 링크나 anchor의 의미까지 검증한 완전한 Markdown 파서는 아니므로 경로 검사 결과로 해석한다.

README·다운로드 가이드의 주요 상대 파일 경로는 존재한다. 문제는 심사자가 더 들어가서 볼 증거들이다. `docs/SOURCE_REPRODUCIBILITY_20260929.md`, `docs/SUBMISSION_READINESS_20260929.md`와 일부 frontend 인계는 비공개 `dist/` 파일을 가리킨다. 과거 spike에는 `/private/tmp/…` 링크가 있다. program의 `PROJECT_SPEC.md`는 그 저장소에 없는 `docs/agent-prompts/`를 가리킨다.

처리: 현재 제출용 요약에서 공개 가능한 receipt/소스로 연결하고, 과거 로컬 증거는 공개 첨부가 아님을 표시한다. 과거 날짜 기록은 그대로 유지하고 맨 위에 현재 상태 문서를 연결한다. `SUBMISSION.md`의 ‘아직 제출하지 않음’, 데모 초안의 ‘전체 영상 없음’은 현재 상태와 다르므로 역사적 기록임을 밝힌다.

## 7. GitHub 운영과 안전한 변경 단위

조사 시 양쪽 Releases 0, tags 0, Actions runs 0, 열린 PR 0이었다. 두 저장소에서 license는 탐지되지 않았고 `.github` workflow도 없다. 조직 profile용 공개 `.github` repository 조회는 404였다.

- 제출된 조직 페이지에서 core를 첫 진입으로 찾기 쉽게 pin/소개를 정리한다. core와 program README 상단 모두 고정 다운로드 가이드와 영상을 연결한다. 조직 profile 작성은 이후 별도 변경으로 처리할 수 있다.
- 새 CI를 넣는다면 자동 배포보다 공개 소스의 설치·검증·패키지 inventory 확인부터 시작한다. 심사 직전 반드시 완성해야 할 대규모 작업으로 확대하지 않는다.
- 배포 후보마다 core/program SHA, kit, VSIX 내부 version/target, SHA-256, 설치 검증·모델 실측 범위를 하나의 공개 manifest로 묶는다. 현재 Windows receipt는 이름/크기/hash/항목 수만 있어 소스 재현 정보가 부족하고, Mac의 상세 receipt는 로컬에만 있다.
- license 부재는 배포 기능 장애는 아니지만 재사용 조건이 모호하다. 사용자가 선택한 license와 third-party notice를 별도로 정리한다. 감사 중 임의 license를 부여하지 않았다.
- 무관한 문서·개인 대화·DB·설정 파일을 일괄 포함하지 않는다. VSIX 내부에 `.env`, DB, 로그, source map, connection 파일로 의심되는 항목명은 없었고 OS별 portable manifest의 모든 파일 hash가 일치했다. 이는 일반적인 secret·개인정보 전수 보증이 아니다.

권장 변경 단위는 (1) 재현 가능한 소스·패키징, (2) 실제 검증한 설치물과 receipt·고정 가이드, (3) 영상과 공개 설명이다. push 시 저장소 AGENTS.md의 계정/경로 규칙을 따른다. 이번 요청은 조사·보고이므로 commit·push·asset 교체·제출 서버 조작은 수행하지 않았다.

## 8. 이번 감사에서 새로 수행한 검사

GitHub HEAD를 API로 확인하고 같은 SHA의 별도 압축 해제본을 `/private/tmp/vibe-helper-audit-20260930-UxcjA2`에 만들었다. 사용자의 작업 checkout을 최신으로 강제 변경하지 않았다. Node24.19.0·pnpm11.13.1을 명시했다.

| 검사 | 결과와 범위 |
| --- | --- |
| core frozen install | PASS |
| core `pnpm check` | format/lint/typecheck/DB/unit/integration/eval/Campus/build/smoke 통과. 최초 E2E는 macOS sandbox의 Chromium Mach port 권한으로 launch 실패 |
| core E2E 재검증 | 허용된 실행 환경의 임시 profile에서 12/12 PASS. 최초 실패를 숨기지 않고 별도 재검증으로 기록 |
| program `npm ci --ignore-scripts` | PASS, npm audit 0 |
| program typecheck/test/build | 57 files / 794 tests PASS |
| panel build + panel/Mac 개발 host CJS 회귀 | PASS |
| 실제 program consumer | controller/provider/dispatcher→인증 HTTP/SSE→SQLite PASS. Agent는 deterministic fixture, 모델0 |
| core production dependency audit | 알려진 취약점 0 |
| program kit | 관리 파일 118개 hash 일치 |
| Mac portable manifest | 65개 파일 크기/hash 일치 |
| Windows portable manifest | 64개 파일 크기/hash 일치 |
| 공개 다운로드 | 비로그인 HTTP HEAD로 조직/문서/영상/Windows/Mac/ZIP 접근 확인. 공개 HEAD와 같은 Git snapshot의 바이너리 크기/hash를 설치 안내와 대조해 일치 |
| 발표·영상 | PDF 10쪽의 텍스트/관련 페이지 렌더 확인, PPTX 초안 비교, 영상 metadata와 전체 구간 샘플 확인 |

현재 설치 파일 hash:

| 파일 | bytes | SHA-256 |
| --- | ---: | --- |
| Windows 0.0.17 VSIX | 2,570,177 | `b4634b3ef9c899a7295b5317b25293ad002545bb09126fe64f0afa8c5344bcd3` |
| Mac 0.1.0 VSIX | 41,564,663 | `ebbc501c51d82d9b48e3a7c8482110fcd9c4a4cc5adf4e6307eea5f08ff7aacf` |
| 20260927 ZIP | 5,031,622 | `4c9b338bcdc24f72afa0eaf61c70c5c54d13a780fabf7fb5440df5cce378f0d9` |
| 현재 MP4 | 2,525,334 | `b881973ff2da488babba8a9656dbca679525383dcd4e0d79fbf8f791dd780b49` |

새 native 모델 완주, 현재 Windows PC 설치, 장기 사용, 사람 학습 효과, 제출 서버 PDF 원본 일치, 모든 secret 유형과 Git 전체 과거 이력의 보안 감사는 이번 검사에 포함하지 않는다. 임시 검사 파일은 저장소 지침에 따라 보존했다.
