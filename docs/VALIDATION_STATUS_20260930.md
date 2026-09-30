# 제출·검증 상태 — 2026-09-30

이 문서는 제출 화면, 사용자 확인, 자동 검사와 실제 모델 검증을 구분한다. 후속 변경은 사용자 지시에 따라 **로컬 commit만** 하며 push·GitHub 조직/저장소 설정 변경은 하지 않는다.

## 제출 화면으로 확인한 것

- 제출 마감 표시: 9월30일00:00. 마지막 저장 표시: 2026년9월29일23:59:59.
- 제출 소개서는 업로드 PDF `/decks/31-322067.pdf`다. 저장소의 PDF를 바꿔도 서버에 이미 업로드한 파일은 바뀌지 않는다.
- 소스 제출 주소: [Hello-KU-tty 조직](https://github.com/Hello-KU-tty).
- 서비스 배포 주소: [고정 다운로드 가이드](https://github.com/Hello-KU-tty/core/blob/main/docs/DOWNLOAD_GUIDE.md).
- 첨부된 두 이미지는 같은 내용이다. 별도 두 폼의 차이나 내일 아침 심사 시작을 확인한 근거로 쓰지 않는다. 마감 뒤 수정 허용 여부도 이 화면만으로 판단하지 않는다.

## 사람 검증과 기술 검증

| 구분 | 확인 범위 | 주장하지 않는 것 |
| --- | --- | --- |
| 실제 사용 후 인터뷰 | 사용자가 수행 사실을 확인한 정성 근거 | 참여자 수·원문 재공개, 정량 학습 향상·완주율, 일반 Kiro 대비 우월성 |
| 이전 Mac native | 9/28 개발 host의 실제 모델 수직 흐름과 당시 한계 | 새 Kiro1.1.70/VSIX0.1.2 전체 완주 |
| 공개 설치물 기준 | Windows0.0.18, Mac0.1.1 및 frontend0.0.18 | 이번 Mac 코드 수정의 Windows 재검증 |
| 로컬 후속 후보 | Mac0.1.2, persistent Node·기존 설치 제거·프로젝트 이동 복구 | 게시 완료, Intel Mac·장기 안정성 |
| 영상 | 기존 README 경로 유지, 별도 담당자가 재제작 중 | 교체 완료 또는 새 영상 검수 완료 |

새 모델 호출은 정확한 합성 폴더 Trust와 최신 계정 사용량 관측이 필요하다. 누적900/신규 호출 중단880·초과과금 비활성 경계를 유지한다. 이번 설치본의 native 전체 흐름은 T19-M2에 별도 기록하며 자동 검사를 모델 완주로 바꾸지 않는다.

## 후속 자동 검증

- Node24.19.0/pnpm11.13.1, 새 ZIP 압축 해제본의 frozen install 및 `pnpm check` 전체 PASS: unit177+3SKIP, integration418+8SKIP, eval43, Campus3, smoke6, E2E12.
- frontend 고정 설치·typecheck·57files/807tests·build PASS. frontend 소스는 변경하지 않았다.
- 패널/native/개발 host/source 회귀219PASS+2SKIP. 실제 frontend→HTTP/SSE→SQLite consumer 및 완료 뒤 Builder3/Helper3 후속 요청 PASS(합성 Agent, 유료 호출0).
- 복구 집중 회귀38PASS+1SKIP, 실제 패키지 자산 검사8PASS. 설치 parser PASS, 설치된 버전0.1.2 및 자산69개 hash 일치. ZIP 재빌드의 VSIX72항목 hash 일치(압축 timestamp는 별도).
- 제출/설치/조직 안내10문서의 상대 링크71개 대상 존재를 확인했다. 과거 `dist/` 링크6개는 다운로드처럼 표시하지 않고 당시 파일명과 hash로 보존했다.
- 첫 전체 검사는 Chromium Mach-port sandbox 권한에서 E2E12개가 실행 전에 실패했다. 같은 추출본을 허용된 테스트 전용 브라우저 환경에서 전체 재실행해 PASS했다. 기존 사용자 실험의 중첩 Biome 설정은 삭제하지 않았다.
- 최초 검사 때는 Trust 승인 대기였다. 이후 사용자가 합성 폴더와 누적2,000크레딧을 승인했고 새 격리 Kiro의 Core 자동 기동·무결성을 추가 확인했다. 현재는 새 Kiro 창의 컴퓨터 제어 연결 문제로 native 완주가 미실행이다. [후속 보고](MAC_NATIVE_VERIFICATION_20260930.md). 계정 dashboard 조회와 모델0 검증을 완주로 계산하지 않는다.
- 최종 소스 commit `7bf1c33`의 ZIP876항목을 다시 새 폴더에 풀어 전체check·frontend807/타입/build를 통과했고 소스874개 hash 불변을 확인했다. 설치된 확장에서 복사한 자산의 모델0 검사8개도 PASS다. 이 문서의 후속 결과는 동결 ZIP 밖에 보존한다.

## 복구 변경

- 공식 배포 Node를 해시 검증 후 확장 데이터 영역의 private cache에 둔다. 구 확장 폴더 제거 뒤에도 생성 앱의 도구 선택을 유지한다.
- 기존 bundled Node 기록은 같은 제품의 상위 버전에서만 이관한다. 외부 실행 파일 교체, 변조·링크·downgrade는 계속 거절한다.
- 유일한 등록 프로젝트가 이동해도 정확한 도구 기록으로 새 프로젝트를 시작할 수 있다. 옮겨진 프로젝트를 검색하거나 자동 등록/이동하지 않으며 예전 경로를 재생성하지 않는다. 기존 프로젝트를 이어 쓰려면 사용자가 원래 위치를 복원해야 한다.
- 원본 코드·DB·대화·기존 실험과 stash를 보존한다. 현재 Windows portable은 프론트의 기존 kit2026.09.30.1 그대로이며 이 Mac 수정이 적용됐다고 주장하지 않는다.

## 전달

[설치 가이드](DOWNLOAD_GUIDE.md) · [Mac 후보와 hash](MAC_VSIX.md) · [개발자 ZIP receipt](../releases/frontend-handoff/20260927/README.md) · [조직 소개 게시 초안](GITHUB_LANDING_HANDOFF.md).

기존 URL/파일명은 유지하되 새 내부 버전과 hash를 명시한다. Git 이력·시각을 바꾸거나 마감 전 결과로 위장하지 않는다. GitHub 공개 링크는 사용자가 실제로 push하기 전까지 이전 파일을 가리킨다.
