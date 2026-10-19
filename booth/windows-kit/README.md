# Hello Vibe 부스 키트 (Windows)

부스 노트북을 매장 체험용처럼 만드는 PowerShell 키트다. 바탕화면 ①·② 아이콘, 매번 처음 상태로 되돌리기, 입력이 없을 때 자동 초기화를 담았다.

설치, ② 원본 만들기, 리허설과 운영 순서는 [docs/BOOTH_WINDOWS_HANDOFF.md](../../docs/BOOTH_WINDOWS_HANDOFF.md)에 있다.

| 파일 | 하는 일 |
| --- | --- |
| `setup.ps1` / `teardown.ps1` | 설치와 행사 뒤 정리 |
| `launch.ps1 -Mode start\|decision` | 바탕화면 ①·② 아이콘 |
| `stage.ps1` → `save-golden.ps1` | ② 원본 만들기 |
| `idle-watch.ps1`, `idle-pause.ps1` | 자동 초기화와 일시정지 |
| `check.ps1` | 읽기 전용 상태 확인 |
| `BoothCommon.ps1`, `splash.ps1` | 공통 경로·함수, 준비 중 창 |
| `clear-last-project.mjs` | ① 전에 패널의 마지막 Project 기억(`bhlr.lastProjectId`)만 지운다 |
| `guide/*.booth-guide.md` | Kiro 가운데에 여는 안내 탭 |
| `assets/` | 바탕화면 배경과 아이콘(`render-assets.mjs`로 다시 만든다) |
| `attract.html` | 큰 모니터용 소개 영상 반복 화면 |

`.ps1`은 Windows PowerShell 5.1용이고 UTF-8 BOM으로 저장한다.
