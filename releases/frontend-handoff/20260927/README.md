# Windows 프론트 update kit 20260927

[frontend-handoff-20260927.zip](frontend-handoff-20260927.zip)을 **Download raw file**로 내려받고 [receipt](frontend-handoff-receipt.json)의 SHA-256을 확인한다. 답변·적용 절차·Builder/Helper 연결 계약은 [프론트 인계 문서](../../../docs/FRONTEND_HANDOFF_20260927.md)를 따른다. 같은 내용이 압축 내부 `README.md`에 있다.

- 소스 commit: [`92b9ec06207885b6ef633c16b23491c5b6709603`](https://github.com/Hello-KU-tty/core/commit/92b9ec06207885b6ef633c16b23491c5b6709603). 변경 내용이 없는 상태에서 생성했으며, 이 ZIP을 추가한 전달 commit과 구분한다.
- 적용 대상: 이미 20260926 kit을 적용한 `Hello-KU-tty/program` `main` `048bce383a774f429f8868949d4ba2f95a63c66a`. `update-program.mjs`는 `portable/`, `vendor/frontend-client/`, `vendor/frontend-host/`만 교체하고 UI 소스는 수정하지 않는다. 관리 파일이 수정돼 있으면 중단한다.
- 저장소 추적 보완: `portable/node_modules/` 미커밋과 CRLF 변환으로 새 clone에서 VSIX 조립이 실패하던 문제를 `.gitattributes`/`.gitignore` 규칙으로 고친다.
- 검증 환경: 현재 Windows x64 PC. 지원 pin Kiro 1.1.70 / Agent 1.1.158 / API 1.131.0. 이번 변경 뒤 모델 native 재실측과 다른 기기 검증은 하지 않았다. [검증 기록](../../../docs/spikes/T19_FRONTEND_HANDOFF_UPDATE_20260927.json).

ZIP은 5,031,622 bytes이고 SHA-256은 `4c9b338bcdc24f72afa0eaf61c70c5c54d13a780fabf7fb5440df5cce378f0d9`다. 파일별 hash는 압축 내부 `manifest.json`에 있다.