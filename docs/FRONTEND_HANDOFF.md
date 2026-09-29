# 프론트 update kit 생성·적용

Node 24.19.0 / pnpm 11.13.1과 PowerShell을 사용한다. 전역 Node를 전환하지 않는다.

## 생성

아래2026.09.29.2 생성 예는 이전 kit2026.09.29.1이 적용된 checkout을 기준으로 한다. 이미2가 적용된 현재 `program`의 다음 kit는 새 검증 receipt와 더 높은 버전을 사용한다.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm frontend:handoff -- --program ../program --verification docs/spikes/T19_FRONTEND_HANDOFF_UPDATE_20260929_2.json --kit-version 2026.09.29.2
```

`--program`의 `.vibe-helper-kit.json` 또는 `--previous-manifest <이전 kit/manifest.json>`을 읽고 실제 관리 파일 전체의 hash와 대조한다. 옛 checkout에 receipt가 없으면 `examples/frontend-handoff/program-managed-*.json` 중 정확히 일치하는 기준 하나만 선택한다. 로컬 관리 파일 변경·불완전한 기준·중복 기준은 중단한다. 수정 파일을 새 기준으로 임의 등록하지 않는다.

`--kit-version` 생략 시 UTC 날짜와 직전 kit에서 다음 버전을 계산한다. 검증 JSON의 `kitVersion`/`previousKitVersion`도 일치해야 한다. `--readme`로 별도 인계를 지정할 수 있다. 출력 이름은 `frontend-handoff-YYYYMMDD-N.zip`이며 manifest는 backend HEAD와 미커밋 여부를 기록한다. 미커밋 kit는 검토 후보이지 immutable release가 아니다.

## 적용

```powershell
node <kit>/update-program.mjs <program> --check
node <kit>/update-program.mjs <program>
# package.json과 package-lock.json의 제품 version을 함께 올린다.
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
node <kit>/update-program.mjs <program> --verify
node <kit>/package-program.mjs <program>
```

관리 대상은 `portable/`, `vendor/frontend-client/`, `vendor/frontend-host/`다. UI는 교체하지 않는다. `.vibe-helper-kit.json`은 다음 업데이트용 버전·hash receipt이며 secret을 포함하지 않는다. 추후 사용자가 commit을 요청하면 이 파일과 관리 파일을 함께 추적한다.

## 이번 후보의 실측 gate

**프론트 실측은 이쪽(core 작업 환경)에서 현재 제출 후보 확장을 설치해 진행할 예정이다.** 사용자 직접 사용을 위한 Kiro 창 준비와 대상 Workspace Trust가 승인되었다. 프론트 개발자의 추가 실측을 기다린다는 의미가 아니다.

0.0.9 → 0.0.10 설치 뒤 Kiro 완전 종료/재시작은 사용 중 작업을 확인하고 진행한다. 기존·신규 프로젝트 Builder, 한국어 서술, Helper catalog, 결과 실행, Decision 명시적 재개, Evidence와 History 복원을 실제 설치물에서 확인해야 한다. 자동 검사나 VSIX 생성만으로 이 결과를 PASS로 바꾸지 않는다. 모델 호출 전 실제 크레딧을 확인한다.
