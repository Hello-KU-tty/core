# Operator, step 2 of preparing mode ②: closes booth Kiro, lets Core close SQLite by itself, then
# copies the Core data and the Project folder into golden\. Every ② launch starts from this copy.
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')

Write-BoothLog 'save-golden: begin'
Write-Host '부스 Kiro를 닫고 Core가 스스로 끝나기를 기다려요 (최대 1~2분)...'
Stop-BoothProcesses -GracefulCore
if (-not (Test-Path -LiteralPath (Join-Path $CoreData 'data'))) { throw "Core 데이터가 없어요: $CoreData" }
if (-not (Test-Path -LiteralPath (Join-Path $DecisionFolder '.kiro\steering'))) {
  throw 'projects\decision에 Hello Vibe Project가 없어요. stage.ps1부터 다시 하세요.'
}
$logs = @(Get-BoothSessionDirs | ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName 'messages.jsonl') -ErrorAction SilentlyContinue } |
  Sort-Object LastWriteTime -Descending)
if ($logs.Count -eq 0) {
  Write-Warning '이 폴더의 Kiro 채팅 기록이 보이지 않아요. Builder가 선택을 물었는지 확인하세요.'
} else {
  # The latest chat must end on a recorded, unanswered choice. Kiro logs each Vibe Helper call with
  # actionType mcp_vibe_helper_<tool>; the bare tool names also appear in tool lists and Steering.
  $asked = @(Select-String -LiteralPath $logs[0].FullName -SimpleMatch 'mcp_vibe_helper_ask_choice')
  $saved = @(Select-String -LiteralPath $logs[0].FullName -SimpleMatch 'mcp_vibe_helper_save_choice')
  $tail = (Get-Content -LiteralPath $logs[0].FullName -Encoding UTF8 -Tail 5) -join "`n"
  if ($asked.Count -eq 0) { Write-Warning '마지막 채팅에 ask_choice(선택 기록)가 없어요. Builder가 번호 선택지를 물었는지 확인하세요.' }
  elseif ($saved.Count -gt 0 -and $saved[-1].LineNumber -gt $asked[-1].LineNumber) {
    Write-Warning '마지막 선택에 이미 답(save_choice)이 기록돼 있어요. ②는 답하기 전 상태여야 해요.'
  }
  if ($tail -notmatch '"turn_end"') { Write-Warning '마지막 채팅 턴이 끝나기 전에 닫혔을 수 있어요.' }
}

New-Item -ItemType Directory -Force -Path $GoldenDir | Out-Null
Remove-Item -LiteralPath $GoldenInfo -Force -ErrorAction SilentlyContinue  # a half copy never counts as ready
Invoke-Mirror $CoreData $GoldenCoreData -SkipCoreRuntime
Invoke-Mirror $DecisionFolder $GoldenDecision
Write-JsonFile $GoldenInfo ([ordered]@{ savedAt = (Get-Date).ToString('s'); decisionFolder = $DecisionFolder })
Remove-Item -LiteralPath $PauseFlag -Force -ErrorAction SilentlyContinue
Write-BoothLog 'save-golden: done'

Write-Host ''
Write-Host '② 원본을 저장했어요. 바탕화면 ② 아이콘으로 리허설하세요:'
Write-Host '  채팅에 "이어서 해줘" → Builder가 같은 선택을 번호로 다시 묻는지 확인.'
Write-Host '  (staging 채팅 기록은 다음 실행 때 archive로 옮겨지고, 창은 새 채팅으로 열려요)'
