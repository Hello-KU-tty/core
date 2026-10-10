# T19-W4 생성 앱 toolchain 계획

> 2026-09-24 사용자 `T19 W4` 착수 요청. W3 완료와 승인된 Windows 확장 설치 요구를 따른다.

1. 기존 Node/pnpm을 확인하고 없으면 private tool directory에 검증된 배포물을 준비한다. Core용 Kiro runtime과 생성 앱용 일반 Node를 분리하며 개발 pin 24.19.0/11.12.0은 유지한다.
2. 고정 Windows Kiro source에서 native shell 환경 전달 방식을 확인하고 생성 workspace에만 적용한다. 전역 PATH, 사용자 설정과 일반 workspace를 수정하지 않는다. 전달을 입증하지 못하면 gate 실패로 남긴다.
3. result launcher는 명시적 project runtime descriptor로 실행한다. Electron launch env와 Core credential을 앱에 전달하지 않는다.
4. 실제 packaged Windows 환경에서 기존/미설치 도구 각각의 frozen install, TypeScript build, test와 HTTP smoke를 검증한다. 다운로드 무결성·offline·취소·손상과 scope/권한 실패도 검증한다.
5. native Agent shell 실제 실행 증거와 deterministic launcher 증거를 구분하고 회귀·전체 `pnpm check` 후 결과와 인계를 기록한다. W5 clean profile 전체 수직 흐름과 상위 T19/T19-N은 별도 gate다.

추가 npm dependency나 lifecycle script를 도입하지 않는다. 사용자 데이터 삭제·전송, commit/push·공개 배포는 포함하지 않는다. 합성 검증용 파일·IDE profile만 사용하고 Agent 작성물을 사용자 학습 Evidence로 계산하지 않는다.
