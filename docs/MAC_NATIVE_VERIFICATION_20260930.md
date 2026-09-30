# Mac 설치본 추가 검증 — 2026-09-30

## 판정

**0.1.3 설치본의 한정된 native 검증을 통과했다.** 실제 앱 생성·실행, Decision 선택·코드 반영, 별도 Helper, History, 대기 상태 재시작 복원, 실행 중 취소와 같은 작업 재개·완료를 확인했다. 아래09:06/10:57 기록은 이전 시점의 결과다. 다음 개인화·MVP 전체 완료, Windows/Intel·장기 안정성·사람의 학습 효과를 입증하는 결과는 아니다.

## 11:09~11:24 KST 승인 후 추가 검증

- 사용자가 ‘등록 시 대기/진행 선택’ 확정과 Builder 반영·취소 검증을 승인했다. 새 dashboard 관측879.82/2,000·overages Disabled 뒤 같은 제품 UI에서 선택했다. 재시작 전에 남겨 둔 Decision의 resolution이 저장되고 Builder가 자동 재개됐다.
- 11:13 KST Decision application과 후속 Task 완료를 확인했다. 등록 폼에 대기/진행 선택, 진행 등록 시 현재 쪽수(기본0)가 추가됐고 완료 선택·완료→진행 전이는 허용하지 않았다. Builder의 타입/build/41tests/smoke 성공 기록을 확인했다.
- 같은 생성 앱에서 제품의 `UI_LAUNCH_RESULT`로 loopback 서버를 시작하고 Chrome으로 검증했다. 진행 상태·37쪽 직접 등록→완료, 기존 대기 등록, 새로고침 후 두 기록 유지가 PASS다. 서버 재시작으로 origin 포트가 달라진 이전 브라우저 데이터의 자동 이관을 주장하지 않는다.
- Builder 보고와 별도로 보호된 프로젝트 launcher를 `/bin/sh .kiro/vibe-tools.cmd`로 실행해 타입 검사와41개 테스트를 다시 통과했다. 처음 개발용 전역 pnpm으로 실행했을 때 store 환경 차이로 모듈 재설치 확인 단계에서 중단됐다. 해당 재설치를 강제하거나 의존성을 삭제하지 않았다. launcher의 실행 비트를 임의 변경하지 않고 제품의 관리 도구를 사용했다.
- 11:18 KST 파일 변경·명령 실행 없는 검토 요청을 시작했다. 실제 `AGENT_RUNNING_BUILDER`를 확인한 뒤 UI ‘중단’을 눌렀고 run이 `CANCELLED`, 세션이 `AGENT_SESSION_CLOSED_BUILDER`로 종료됐다. 입력창도 다시 활성화됐다. 취소는 전체 Task 삭제가 아니며 Task는 이어갈 수 있는 ACTIVE 상태로 남았다.
- 11:19~11:21 KST 같은 작업에 짧은 읽기 전용 요청을 보내 재개·완료를 확인했다. Core 도구4건이 실패한 뒤 복구됐고 최종 run은 `SUCCEEDED`, Task는 `COMPLETED`다. 실패 중1건은 이미 시작된 Task에 대한 `BUILDER_START_TASK`, 나머지3건은 redacted 진단에서 구체 action/error code가 노출되지 않았다. 원인을 모두 규명했다거나 무오류라고 주장하지 않는다.
- 취소 전·취소 후·재개 완료 후 앱 소스19개 aggregate SHA-256이 `aee8285b09eb843ed18fdd8c5707094826d95f0077c38e4dfc6bb8267128ab1c`로 동일했다. 최종 SQLite는 Task3개 모두COMPLETED, 완료 보고서3개·Decision resolution/application 각1개, Analysis6개 모두SUCCEEDED, `quick_check=ok`다. 진행 중 UI run은0이다.
- 최종 History는6개 개념 모두 관찰 수준이며 사용자 이해로 인정된 근거는0이다. 이유 없는 옵션 선택, Agent 코드·보고·테스트와 질문만으로 이해를 올리지 않았다. 모든 입력은 합성 검증이며 사람의 학습 효과로 사용하지 않는다.
- 사용량 관측은11:09에879.82, 11:18에884.19, 11:23에886.80/2,000이며 overages Disabled를 유지했다. 이번 재개 구간 증가6.98, 최초867.38 대비19.42는 계정 추정치의 차이이고 호출별 확정 청구액이 아니다. 최종 모델 호출은 모두 종료했다.

제품 소스·Mac0.1.3 VSIX·개발자 ZIP의 bytes/hash는 이번 검증에서 변경하지 않았다. 기존 ZIP 안 보고서는10:57까지의 동결 기록이며 이 추가 결과는 저장소 문서와 Mac receipt에 남긴다. 로컬 commit만 하고 push하지 않는다.

## 직접 UI 검증 재개와 0.1.3 수정

- 사용자 후속 승인으로 기존 Kiro 인스턴스를 정상 Quit했다. 미저장 파일 폐기나 데이터 삭제는 하지 않았다. 실제 설치본 창에 연결해 `start-here`와 제품의 `core-data/workspaces`만 UI로 신뢰했다. profile 자체·계정 저장 영역·상위 임시 폴더 전체를 신뢰하지 않았다.
- 09:53 및10:01 KST dashboard에서867.38/2,000·overages Disabled를 확인했다. 개인적 필요를 포함한 새 합성 학습 목표(판별 유니온과 독서 상태 전이)를 UI에 입력했다. 이는 실제 사람의 이해 증거가 아니다.
- 0.1.2 첫 요청은 생성 작업공간 전환·Trust 이후 `NATIVE_PACKAGED_ROLE_CONFIG_INVALID`로 모델 실행 전에 실패했다. 임시 경로의 개발용 receipt 환경변수가 packaged runtime의 정확한 env 검사에 충돌했다. 사용자 화면은 구체 코드 대신 진행 중 결과 복원 실패를 표시했다.
- `d8768d1`에서 packaged Core의 개발용 receipt 삽입만 제거했다. exact prompt/command/args/env·경로/권한 검사는 유지했다. 기존0.1.2 설치 자산에 새 회귀를 실행해 실패를 재현한 뒤 수정본의 실제 패키지9개 검사, relay6개·native runtime6개 검사와 타입 검사를 통과했다.
- 0.1.3 설치 parser·설치 자산69개 hash 일치. 새 개발자 ZIP 추출본 전체check(unit177/integration418/eval43/Campus3/smoke6/E2E12, 기존11SKIP), frontend807/타입/build PASS. 처음 E2E는 기존4173 서버로 인해 시작 전 중단됐고, 해당 서버를 보존하며 별도43173에서 전체check를 재실행했다. ZIP 재빌드72항목 hash가 같으며 소스 checkout 없이 재현했다.
- 10:02:26~10:02:53 KST 실제 Preview가 후보10개를 반환했다. ‘독서 모임 책 추적’을 선택해 enrichment와 Spec을 완료하고10:05:12 Builder를 시작했다. Builder가 생성 프로젝트에서 파일을 작성하며 Helper는 별도 창에서 read-only 도구로 맥락 질문에 답했다. 주 창에 답변·저장된 질문이 표시되고 Analyst 종료도 관측했다. 학습 효과·Windows·Intel·장기 안정성으로 확대하지 않는다.

## 실제 설치본 관측 결과

| 단계 | 결과와 경계 |
| --- | --- |
| 최초 Builder | 10:13 KST 완료, 약7분48초. 생성 workspace의 코드·테스트·빌드·smoke 실행을 관측했고 Builder는33개 테스트 통과를 보고했다. 도구42건 중 `.kiro` 접근 제한과 잘못된 편집 인자2건을 복구했다. 최초 Task에는 Decision이 없었다. |
| 결과 실행 | 제품의 ‘결과 실행’으로 loopback 앱 기동. Chrome에서 책 등록→대기→읽기 시작→42쪽 저장→완료와 새로고침 후 완료 기록 유지를 직접 확인했다. 완료 상태에는 재시작 버튼이 없었다. Core 재시작을 넘는 브라우저 데이터 유지까지 주장하지 않는다. |
| 완료 뒤 후속 Builder | 같은 workspace에 새 Task를 만들고 기존 완료 기록을 보존했다. 이미 읽는 책 등록 요구에 대해 두 선택지를 비교하는 실제 Decision을 생성하고 코드 수정 없이 대기했다. |
| Helper 2회 | 최초 작업 중 질문과 후속 Decision 질문에 별도 read-only Helper가 답했다. 두 번째 답변은 생성된 상태 타입·등록 UI를 근거로 선택의 장단점을 설명했다. Agent가 사용자 대신 선택하지 않았다. |
| History/Evidence | Analyst 종료를 관측했다. History는6개 개념을 관찰 수준으로 표시하고 이해 근거가 없음을 밝혔다. 합성 질문·Builder 출력·테스트 통과를 사람의 이해 증거로 올리지 않았다. |
| 실제 종료·재시작 | 정상 Quit 후 SDK 연결 불가로 Core 종료를 확인했다. 같은 격리 profile과 프로젝트를 재실행하자 worker 연결, BLOCKED Task, 미선택 Decision1개, 저장된 Helper 대화2개가 복원됐다. 재시작 직전 SQLite `quick_check=ok`. 재시작 후 실행 목록은 비어 있었으며 과거 실행 목록 보존을 주장하지 않는다. 자동 모델 재실행은 관측하지 않았다. |
| 10:57 당시 남은 검증 | 합성 선택지 확정이 승인 검토에서 차단돼 사용자 승인을 요청했다. 이후 승인으로 선택·반영·취소·재개를 위와 같이 검증했다. 다음 개인화는 여전히 이번 결과에 포함하지 않는다. |

10:57까지의 계정 dashboard 관측:09:53/10:01에867.38, 10:12에875.79, 10:47에877.57, 10:57에879.82/2,000. 모두 overages Disabled였으며 과금·로그인 설정은 바꾸지 않았다. 이 구간 증가분12.44는 계정 전체의 추정 사용량 차이이고 호출별 확정 청구액이 아니다. 당시 새 모델 호출을 중단한 뒤 위 후속 승인으로 재개했다.

결과 실행의 기본 브라우저는 Safari였으나 자동화 허용 대기로 약30분 지연 후 제어가 거절됐다. Safari 권한을 우회하지 않고 허용된 Chrome에서 같은 loopback 결과를 검증했다. 이 지연을 Builder 실행 시간이나 제품 오류로 계산하지 않는다.

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
- 09:06 당시 GUI 연결 초기화, 앱 이름·bundle ID·경로 재선택과 창 목록 확인으로도 새 인스턴스를 선택하지 못했다. 이후 직접 신뢰·기존 창 정상 종료 승인을 받아 위와 같이 해결했다. Trust 저장소 직접 수정으로 우회하지 않았다.
- 실제 Discovery→Spec→Builder·Decision·Helper→결과 실행·History·후속 대화/취소의 단계별 결과를 기록한다. 생성 폴더 신뢰도 승인된 합성 범위로 제한한다.

이전 동결 ZIP 결과는 당시 기록으로 보존하며 최신 개발자 ZIP에는 이 후속 보고를 포함한다. 설치물의 과거 hash나 검증 결과를 소급 변경하지 않는다. 영상·조직 소개 게시·원격 push는 수행하지 않았다.
