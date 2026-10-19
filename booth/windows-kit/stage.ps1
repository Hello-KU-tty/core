# Operator, step 1 of preparing mode ②: a fresh Core and an empty Project folder, opened in booth Kiro.
# Build a Project there until the Builder asks a numbered choice and its turn ends, then run save-golden.ps1.
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')

New-Item -ItemType Directory -Force -Path $BoothRoot, $ArchiveDir, $EmptyDir | Out-Null
New-Item -ItemType File -Force -Path $PauseFlag | Out-Null  # keep the idle reset away while staging
Write-BoothLog 'stage: begin'
Stop-BoothProcesses
Save-VisitRecords 'before-stage'
# Fresh Core data, so the golden copy holds only the staged Project and no folder registrations.
if (Test-Path -LiteralPath $CoreData) {
  $old = Join-Path $ArchiveDir ('{0}-core-data-before-stage' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Move-Item -LiteralPath $CoreData -Destination $old
  Write-BoothLog "stage: previous Core data moved to $old"
}
Clear-LastProject
Invoke-Mirror $EmptyDir $DecisionFolder
Invoke-Mirror $EmptyDir $StartFolder
Start-BoothKiro $DecisionFolder $null
Write-BoothLog 'stage: Kiro opened on the decision folder'

Write-Host ''
Write-Host '② 준비: 부스 Kiro가 빈 폴더(projects\decision)로 열렸어요. 이 창에서 직접 진행하세요.'
Write-Host '  1. Kiro 로그인과 Vibe Helper 패널 준비(처음이면 Node 내려받기 때문에 1~2분)를 기다립니다.'
Write-Host '  2. 패널에 배우고 싶은 것을 입력해 후보를 고르고 "이걸로 시작"을 누릅니다.'
Write-Host '     명령 미리 승인을 물으면 승인합니다. 채팅의 명령 승인은 내용을 읽고 누릅니다.'
Write-Host '  3. Builder가 번호 선택지를 묻고 턴이 끝나면 멈춥니다. 답하지 마세요.'
Write-Host '  4. save-golden.ps1을 실행합니다. (자동 초기화는 그때까지 멈춰 있어요)'
