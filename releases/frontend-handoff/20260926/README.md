# Windows 프론트 인계 파일

[frontend-handoff-20260926.zip](frontend-handoff-20260926.zip)을 **Download raw file**로 내려받고 [receipt](frontend-handoff-receipt.json)의 SHA-256을 확인한다. 압축을 푼 뒤 내부 `README.md` 또는 [적용 가이드](../../../docs/FRONTEND_WINDOWS_QUICKSTART.md)를 따른다.

- 소스 commit: [`88db173ece4426f433e19b8055a4880930e7f592`](https://github.com/Hello-KU-tty/core/commit/88db173ece4426f433e19b8055a4880930e7f592). 변경 내용이 없는 상태에서 생성했으며, 이 ZIP을 추가한 전달 commit과 구분한다.
- 적용 대상: `Hello-KU-tty/program`의 `73d0eb58e374357d6f28ea8db13e9b659cec5e5a`. 수정된 원본이나 재적용은 검사 단계에서 중단하므로 해당 경우 패치를 검토해 반영한다.
- 검증 환경: 현재 Windows x64 PC, Kiro 1.1.70 / Agent 1.1.158 / API 1.131.0의 exact source. 다른 기기 검증은 제외했다.
- 패치 적용 범위: Discovery → 후보 선택/JIT → Spec 생성·수정·확정/Task 준비 → History. Builder/Helper 및 후속 화면은 제공 host·SDK와 참조 코드로 프론트가 연결한다.
- 검증: 프론트 228 tests, 실제 Core 소비 검사, 설치된 프론트 VSIX에서 실제 Agent 4회와 History 무재실행. [전체 결과와 제한](../../../docs/FRONTEND_HANDOFF_RESULTS_20260926.md).

ZIP은 5,025,853 bytes이고 SHA-256은 `1e730fcf7485c32088ce65c4571fdc52233314324aa3b2e34b80536d35d18089`다. 파일별 hash는 압축 내부 `manifest.json`에 있다. SDK·portable·license·참조 VSIX·적용/제품 조립 스크립트를 포함하므로 프론트는 백엔드 저장소를 별도로 빌드할 필요가 없다.

백엔드 성능·Analyst 의미 품질 개선은 프론트 연결과 병행한다. 이번 인계를 T19/T19-N 또는 모든 화면 연결 완료로 해석하지 않는다.
