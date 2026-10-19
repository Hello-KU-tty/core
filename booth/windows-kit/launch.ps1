# Desktop icons ① and ②: put the booth back to its starting state, then open Kiro in that mode.
#   start    ① empty folder, Discovery from the beginning
#   decision ② the golden Project, stopped right before a learner choice
param([Parameter(Mandatory = $true)][ValidateSet('start', 'decision')][string]$Mode)
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')
Add-Type -AssemblyName System.Windows.Forms

$mutex = New-Object System.Threading.Mutex($false, 'Local\HelloVibeBoothLaunch')
$owned = $false
try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
if (-not $owned) { exit 0 }  # a double click while the first launch is still running

try {
  Write-BoothLog "launch ${Mode}: begin"
  New-Item -ItemType Directory -Force -Path $BoothRoot | Out-Null
  [IO.File]::WriteAllText($LaunchingFlag, $Mode, $Utf8NoBom)
  $splash = '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "{0}" -SignalFile "{1}"' -f (Join-Path $KitDir 'splash.ps1'), $LaunchingFlag
  Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList $splash | Out-Null

  if ($Mode -eq 'decision' -and -not (Test-Path -LiteralPath $GoldenInfo)) {
    throw '② 체험용 프로젝트가 아직 준비되지 않았어요. (운영자: stage.ps1 → save-golden.ps1)'
  }
  Stop-BoothProcesses
  Save-VisitRecords
  # Before the first golden copy exists, ① still works on whatever Core data the profile has.
  if (Test-Path -LiteralPath $GoldenInfo) { Invoke-Mirror $GoldenCoreData $CoreData -SkipCoreRuntime }
  if ($Mode -eq 'start') {
    Clear-LastProject
    Invoke-Mirror $EmptyDir $StartFolder
    $folder = $StartFolder
  } else {
    Invoke-Mirror $GoldenDecision $DecisionFolder
    $folder = $DecisionFolder
  }
  Start-BoothKiro $folder (Join-Path $GuideDir "$Mode.booth-guide.md")
  if (Wait-BoothKiroWindow 60) { Write-BoothLog "launch ${Mode}: Kiro window is up" }
  else { Write-BoothLog "launch ${Mode}: no Kiro window after 60 s" }
} catch {
  Write-BoothLog ("launch ${Mode}: failed: " + $_.Exception.Message)
  Remove-Item -LiteralPath $LaunchingFlag -Force -ErrorAction SilentlyContinue
  [void][System.Windows.Forms.MessageBox]::Show(
    "준비하다가 문제가 생겼어요. 잠시 뒤 아이콘을 다시 눌러 주세요.`r`n`r`n" + $_.Exception.Message, 'Hello Vibe',
    'OK', 'Warning', 'Button1', 'DefaultDesktopOnly')  # on top of every window
} finally {
  Remove-Item -LiteralPath $LaunchingFlag -Force -ErrorAction SilentlyContinue
  $mutex.ReleaseMutex()
}
