# 권한 거부 뒤 Builder 턴 취소 수정

## 증상

0.0.18(Windows)·0.1.3(Mac)에서 Builder의 도구 요청이 권한 가드에 한 번이라도 거부되면 그 턴 전체가 `NATIVE_CANCELLED_CONFIRMED`로 끝났다. Mac 0.1.3 실제 프로젝트에서 6회 연속 재현했다. 거부 대상은 `list_directory` depth 4, Kiro 1.1.158의 `file_search`(query 형식), `find`·`ls` 셸 명령이었다.

## 원인

`8ce42db`(0.0.18)는 거부된 도구 행을 화면에 보여 주는 `TOOL` 이벤트를 추가했다. 이 이벤트에는 Core native 이벤트 검증이 요구하는 필드(`updateKeys`, `rawInputKeys`, `outputTruncated` 등)가 없었다. 도구 ID는 원문 tool call ID였고, `bridgeErrorCode`에는 Core가 모르는 `PERMISSION_GUARD_*` 코드가 들어 있었다. Core는 이를 `NATIVE_EVENT_INVALID`로 거절했다. 워커는 이벤트 전송 실패를 치명적 오류로 처리해 작업을 abort했다. 권한 판정 자체는 정상이었다.

## 수정 (`f3abfae`)

- Core는 `NATIVE_TOOL_PERMISSION_DENIED`를 받는다. `PERMISSION_GUARD_BUILDER_*`는 Builder 작업에서만 받는다. 둘 다 입력·경로·명령·출력·Core action이 없는 실패 행이어야 한다.
- 워커는 거부 행을 Core `TOOL` 형식으로 보낸다. 도구 ID는 같은 도구의 다른 업데이트와 같은 세션 범위 hash를 쓴다. 표시 이벤트 전송이 실패해도 작업을 abort하지 않고 이후 이벤트 순서를 유지한다.
- 무엇을 허용·거부할지는 바꾸지 않았다. `file_search` query 형식은 여전히 거부되며, 거부 뒤에도 턴이 계속된다.

## 검증

- 새 relay·worker 회귀 테스트는 수정 전 Core에서 `NATIVE_EVENT_INVALID`로 실패하고 수정 후 통과한다.
- unit 177 통과(3 skip), integration 418 통과(8 skip), 패널 CJS 173 통과(2 skip), typecheck 통과.
- 저장소의 `pnpm lint`·`format:check`는 `.local-experiments`의 중첩 `biome.json` 때문에 시작하지 못했다. 변경한 TS 파일만 Biome으로 따로 검사해 통과했다.
- Mac 0.1.4(`3e23b34`): 실제 패키지 검사 9개 PASS. Kiro 1.1.70 격리 프로필 설치 PASS. 설치 자산 69개 hash 일치(`package.json`은 Kiro가 설치 시 다시 씀). 검증 빌드와 재빌드의 VSIX 항목 72개 hash가 같다.
- 실제 모델: 같은 수정 번들을 개발 로드한 Kiro에서 Builder 턴 중 거부가 3회(검색 2, 알 수 없는 형식 1) 나왔다. 턴은 취소되지 않고 정상 종료됐다. 화면에는 "일부 도구 요청이 제한됐어요"가 표시되고 후속 요청을 보낼 수 있었다. 설치된 0.1.4 VSIX로 한 실제 모델 검증은 아니다.

## 게시 상태

- 사용자 승인으로 Mac 0.1.4를 기존 다운로드 경로(`releases/macos/0.1.0/`)에 게시했다. 크기·SHA-256·항목 hash는 [receipt](../releases/macos/0.1.0/macos-vsix-receipt.json)와 [files.json](../releases/macos/0.1.0/files.json)을 따른다.
- 개발자 ZIP은 0.1.3 기준으로 두고 다시 만들지 않았다.
- Windows 0.0.18 설치물과 program 저장소는 변경하지 않았다.

## Windows 0.0.19·프론트 kit 인계

Windows portable과 VSIX 스크립트는 Windows x64 호스트에서만 실행된다(`PORTABLE_TARGET_UNVERIFIED`, `VSIX_TARGET_UNVERIFIED`). Mac에서 대신 만들지 않았다. Windows PC에서 다음 순서로 진행한다.

1. core `main`을 `f3abfae` 이후로 받고 `pnpm install --frozen-lockfile`을 실행한다.
2. `pnpm frontend:handoff`로 새 kit을 만든다. 기존 [kit 절차](FRONTEND_HANDOFF.md)에 따라 program checkout에 적용하고 관리 파일 hash를 대조한다.
3. program의 `package.json`·`package-lock.json` 버전을 0.0.19로 올리고, 타입 검사·테스트·빌드 후 VSIX를 만든다.
4. `pnpm check`와 확장 host CJS 테스트를 돌린다. 설치 후에는 Builder가 거부된 요청 뒤에도 계속 진행하는지 실제 화면에서 확인한다.
5. `releases/windows/0.0.19/`와 [Windows VSIX 문서](WINDOWS_VSIX.md)를 갱신한다.
