# Operator: pause or resume the idle reset (for example while explaining with Kiro open).
#   idle-pause.ps1          toggle and show the new state in a message box
#   idle-pause.ps1 -On|-Off set it without a message box
param([switch]$On, [switch]$Off)
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')

$pause = if ($On) { $true } elseif ($Off) { $false } else { -not (Test-Path -LiteralPath $PauseFlag) }
if ($pause) { New-Item -ItemType File -Force -Path $PauseFlag | Out-Null }
else { Remove-Item -LiteralPath $PauseFlag -Force -ErrorAction SilentlyContinue }
$state = if ($pause) { '자동 초기화를 멈췄어요. 다시 켜려면 한 번 더 실행하세요.' } else { '자동 초기화를 다시 켰어요.' }
Write-BoothLog ('idle-pause: ' + $(if ($pause) { 'paused' } else { 'resumed' }))
if ($On -or $Off) { Write-Host $state }
else {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($state, 'Hello Vibe 부스', 'OK', 'Information', 'Button1', 'DefaultDesktopOnly')
}
