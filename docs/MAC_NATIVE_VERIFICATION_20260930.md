# Mac 설치본 추가 검증 — 2026-09-30

## 판정

**설치·실제 확장 호스트의 Core 자동 기동·무결성은 PASS, native 모델 수직 흐름은 미실행이다.** 폴더/비용 승인은 받았지만 컴퓨터 제어가 새 격리 Kiro 인스턴스를 선택하지 못해 실제 Workspace Trust 화면과 패널을 조작할 수 없다. 소스 검증·Core health를 native 완주로 바꾸지 않는다.

## 지금까지 전달한 작업

- `7bf1c33`: Mac Node를 persistent private cache로 분리하고 구 확장 제거 후 이관, 등록 프로젝트 이동 후 새 프로젝트 도구 선택을 복구했다. 변조·링크·downgrade 거절과 중단 복구 회귀를 유지했다. 제출 문서·깨진 링크6개·조직 소개 초안도 정리했다.
- `dcbc7d9`: Mac0.1.2 VSIX와 frontend0.0.18 기준 개발자 ZIP을 기존 로컬 파일 경로에 갱신했다. push와 GitHub 게시/설정 변경은 하지 않았다.
- ZIP 새 추출본의 전체 `pnpm check`: unit177+3SKIP, integration418+8SKIP, eval43, Campus3, smoke6, E2E12. frontend807/타입/build, 설치 자산 모델0 검사8개, 재빌드 VSIX72항목 및 소스874개 hash 불변을 확인했다. [검증 상태](VALIDATION_STATUS_20260930.md).
- 사용자 PDF/PPTX·영상·기존 실험·stash는 보존했다. 영상 재제작은 별도 담당 작업이다.

## 이번에 추가 확인한 것

2026-09-30 09:06 KST 종료 점검. 수정하지 않은 Mac0.1.2 VSIX를 새 확장 디렉터리/사용자 데이터 디렉터리에 설치하고 실제 Kiro GUI 프로세스로 실행했다. 단순 CLI 설치 parser나 별도 테스트 Core만 확인한 것이 아니다.

| 검사 | 결과 |
| --- | --- |
| 격리 설치 | 버전0.1.2, 설치된 자산69개 SHA-256 일치 |
| IDE/Agent 소스 | Kiro1.1.70, Agent1.1.158, API1.131.0의 기존 exact-source 검사 PASS |
| 제품 자동 기동 | 실제 확장 호스트가 자체 global storage에서 Core를 시작함. 인증 SDK health의 agent는 `KIRO_IDE_BUILTIN_AGENT` |
| 빈 사용자 데이터 | 프로젝트0, SQLite50테이블, read-only `quick_check=ok` |
| native worker | 상태 파일 없음. worker 준비 완료나 모델 호출 성공을 확인하지 못함 |
| 계정/모델 | dashboard를 다시 열어 사용량/초과과금 비활성을 관측. 이번 모델 호출0 |

Kiro는 별도 user-data-dir에서도 자체 공유 계정 저장소를 사용한다. 따라서 사용자 데이터/profile의 분리는 계정까지 별도로 격리했다는 뜻이 아니다. 자격 증명을 직접 읽거나 복사하지 않았고 로그인·과금 설정도 변경하지 않았다.

## 승인과 남은 단계

- 사용자 승인: 앞서 제시한 격리 합성 폴더 Trust, 계정 누적2,000크레딧까지. 신규 호출은1,980 이상에서 중단하고15분 이내 새 dashboard 관측으로 확인한다. 초과 과금은 비활성으로 유지한다. 과거900/880 observation/claim은 수정하지 않는다.
- 실제 제품의 시작/생성 프로젝트만 신뢰한다. profile·계정 저장 영역과 상위 임시 폴더 전체를 신뢰하지 않는다.
- GUI 연결 초기화, 앱 이름·bundle ID·경로 재선택과 창 목록 확인을 시도했지만 기존 인스턴스만 선택됐다. 새 프로세스/renderer/확장 호스트 시작은 로그와 제품 health로 확인했다. 기존 사용자 창을 종료하거나 Trust 저장소를 직접 고쳐 우회하지 않는다.
- 사용자가 검증용 `start-here` 창에서 시작 폴더 신뢰/패널 상태를 확인해 주면, 새 사용량 관측 후 실제 Discovery→Spec→Builder·Decision·Helper→결과 실행·History·후속 대화/취소 검증을 이어간다. 이후 생성 폴더 신뢰도 승인된 합성 범위로 제한한다.

이번 보고서는 동결 ZIP 이후 기록이며 설치물의 hash나 검증 결과를 소급 변경하지 않는다. 영상·조직 소개 게시·원격 push는 수행하지 않았다.
