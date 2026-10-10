# Kiro-native 첫 실사용 체험 검토 (2026-10-09)

사용자가 Mac 0.2.0 설치물로 새 Kiro 프로필에서 Discovery부터 앱 완성까지 직접 진행한 뒤 피드백 15건을 남겼다. 아래는 체험 Core DB, Kiro 채팅 기록 2개, Kiro 창 로그, 설치된 Kiro 1.2.37 설정으로 확인한 사실이다. 채팅 원문은 옮기지 않는다.

## 조건

- Kiro 1.2.37, 개인 Builder ID(체험 중 월 한도 50크레딧 도달), 채팅 모델 Auto.
- Core 시작 02:00, Discovery 02:01~02:07(kiro-cli 5회), Kiro 연결 02:08, 채팅 02:09~02:39.
- 결과: Task 완료, Decision 2개 요청·확정·적용. 판단 근거 Evidence 제안 3건은 모두 근거 부족으로 거절, Builder 보고 개념 8개가 OBSERVED.

## 확인한 원인

| 피드백 | 확인 |
| --- | --- |
| 7 처음 창 연결 실패 | Core는 연결돼 있었다. 생성 폴더 창이 신뢰되지 않은 상태로 열려 Kiro가 hook 실행을 끄고(`hooks.v2.executionDisabledUntrustedWorkspace`) Steering을 비워 두었다. 첫 두 메시지는 Core에 기록되지 않았다. Retry Core가 창을 다시 로드했을 때는 신뢰된 상태였다. Kiro는 hook을 세션 시작 때 읽는다. |
| 4·8 결정 두 개를 한 번에 | Steering 0.4.0이 Spec의 `expectedDecisions` 문장을 그대로 넣고 구현 전에 묻게 했다. 첫 질문은 그 두 문장과 거의 같았고, 채팅에 보인 시각(02:11)보다 Core 기록(02:18)이 늦었다. 설계 문서는 이 목록을 예고로만 정의한다. |
| 9 다른 세션·Helper가 모름 | Builder가 Decision을 채팅에만 먼저 보였고, 작업 맥락은 실패 뒤 02:18에 처음 기록했다. Core는 Builder의 채팅 답을 저장하지 않는다. 02:14 패널 Helper는 Spec만 보고 되물었고(답 일부 영어), 02:15 새 세션은 열린 Decision을 0개로 봤다. |
| 10 Decision 저장 복잡 | Vibe Helper 도구 호출 25번 중 9번 실패: idempotencyKey 형식 2, 필수 필드 1, 작업 맥락 없이 Decision 요청 1, 완료 맥락 없이 Task 완료 1, Decision 기록 전 메시지 인용 1, 인용 한글 깨짐 1, 도구 없는 모드 2. 학습자의 실제 이유가 기록 전 발언이라 버려졌다. |
| 11 도구 허용 잦음 | Vibe Helper 도구 7개를 하나씩 항상 허용했다. Kiro는 도구별 규칙으로 `~/.kiro/workspace-roots/<폴더 해시>/permissions.yaml`에 저장한다. |
| 13 명령 확인 잦음 | 셸 승인 16번 모두 이번만 허용. 프로젝트 환경에 node·pnpm만 있고 npm이 없어(`command not found: npm`) Agent가 긴 PATH를 붙인 명령을 매번 다르게 만들었다. Kiro의 항상 허용은 명령 앞부분 기준이다(`kiroAgent.trust.defaultPattern`). |
| 14 모드 목록 | 목록의 builder·helper·analyst 등은 9/13 예선 작업 때 `~/.kiro/agents/`에 남은 전역 에이전트다. 고른 `vibe-probe-builder`는 도구가 0개라 Vibe Helper 도구가 "사용할 수 없음"으로 실패했다. |
| 15 크레딧 | 채팅 두 세션 합계 18.16크레딧. 그중 10.13이 앱 전체 구현 한 턴(모델 호출 46, 파일 쓰기 29, 명령 13, 약 10분). Vibe Helper 처리 턴은 약 4~5크레딧으로 추정. kiro-cli 실행 10회는 별도. |
| 12 Helper 위치 | Kiro 1.2.37은 작업 폴더 `.kiro/agents/`의 사용자 에이전트를 지원하고, 채팅 탭마다 에이전트를 고를 수 있다. 탭을 자동으로 여는 공개 API는 확인하지 못했다. |
| 2 후보 버튼 | Core 계약에 `REVISE`(후보 지정)와 `REGENERATE`(지정 없음)가 메시지와 함께 이미 있다. |
| 6 새 폴더 | 예선에서 Builder 쓰기를 Core 폴더로 묶으려던 설계와 본선 K02의 "기존 프로젝트 import 제외" 판단 때문이다. 결과적으로 새 창·신뢰 문제와 긴 경로가 생겼다. |

## 처리

반영 범위와 남긴 작업은 [TASKS](../TASKS.md)의 K09~K12에 있다.
