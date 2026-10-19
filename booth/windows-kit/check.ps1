# Read-only status of the booth laptop. Prints OK / WARN / FAIL lines; changes nothing.
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')
$ErrorActionPreference = 'Continue'
$failures = 0
function Report([string]$Level, [string]$Text) {
  if ($Level -eq 'FAIL') { $script:failures += 1 }
  $color = @{ OK = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$Level]
  Write-Host ('[{0,-4}] {1}' -f $Level, $Text) -ForegroundColor $color
}

Report INFO "BoothRoot: $BoothRoot"
try {
  $kiro = Find-KiroExe
  Report OK ("Kiro: {0} ({1})" -f $kiro, (Get-Item -LiteralPath $kiro).VersionInfo.ProductVersion)
  $cli = Find-KiroCli $kiro
  if ($cli) { Report OK "Kiro CLI shim: $cli" } else { Report WARN 'Kiro bin\kiro.cmd 없음 (VSIX는 화면에서 설치)' }
} catch { Report FAIL $_.Exception.Message }

$kiroCli = Get-Command kiro-cli -ErrorAction SilentlyContinue | Select-Object -First 1
if ($kiroCli) {
  $version = (& $kiroCli.Source --version 2>$null | Select-Object -First 1)
  Report OK "kiro-cli: $($kiroCli.Source) $version (2.21.1 이상, 본선 계정 로그인 필요)"
} else { Report FAIL 'kiro-cli가 PATH에 없어요 (Discovery·Analyst가 씀)' }

$extension = @(Get-ChildItem -LiteralPath $ExtensionsDir -Directory -Filter 'vibe-helper.builder-helper-agent-panel-*' -ErrorAction SilentlyContinue)
if ($extension.Count -gt 0) { Report OK ('Hello Vibe 확장: ' + (($extension | ForEach-Object { $_.Name }) -join ', ')) }
else { Report FAIL "Hello Vibe 확장이 부스 프로필에 없어요: $ExtensionsDir" }

$settingsPath = Join-Path $ProfileDir 'User\settings.json'
if (Test-Path -LiteralPath $settingsPath) {
  $settings = Get-Content -Raw -Encoding UTF8 -LiteralPath $settingsPath | ConvertFrom-Json
  foreach ($key in $BoothSettings.Keys) {
    $want = $BoothSettings[$key]
    $have = if ($settings.PSObject.Properties[$key]) { $settings.$key } else { $null }
    $same = if ($want -is [System.Collections.IDictionary]) { $null -ne $have } else { "$have" -eq "$want" }
    if ($same) { Report OK "설정 $key = $have" } else { Report FAIL "설정 $key = '$have' (원하는 값 '$want')" }
  }
} else { Report FAIL "부스 프로필 설정이 없어요: $settingsPath (setup.ps1)" }

foreach ($mode in 'start', 'decision') {
  $guide = Join-Path $GuideDir "$mode.booth-guide.md"
  if (Test-Path -LiteralPath $guide) { Report OK "안내 탭: $guide" } else { Report FAIL "안내 탭 없음: $guide" }
}

if (Test-Path -LiteralPath $GoldenInfo) {
  $info = Get-Content -Raw -Encoding UTF8 -LiteralPath $GoldenInfo | ConvertFrom-Json
  Report OK ("② 원본 저장됨: {0}" -f $info.savedAt)
} else { Report WARN '② 원본 없음 (stage.ps1 → save-golden.ps1)' }

$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($name in '① 처음부터 만들어 보기.lnk', '② 결정하는 순간 체험하기.lnk') {
  if (Test-Path -LiteralPath (Join-Path $desktop $name)) { Report OK "바탕화면 아이콘: $name" } else { Report FAIL "바탕화면 아이콘 없음: $name" }
}
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Hello Vibe 부스 자동 초기화.lnk'
if (Test-Path -LiteralPath $startup) { Report OK '로그인 때 자동 초기화 시작' } else { Report WARN '시작 프로그램에 자동 초기화 없음' }

$watcher = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { Test-CommandLineHas $_ 'idle-watch.ps1' })
$minutes = Get-BoothConfigValue 'IdleMinutes' 10
if ($watcher.Count -gt 0) { Report OK "자동 초기화 실행 중 (입력 없이 ${minutes}분)" } else { Report WARN '자동 초기화가 실행 중이 아니에요' }
if (Test-Path -LiteralPath $PauseFlag) { Report WARN '자동 초기화 일시정지 중 (idle-paused)' }

$running = @(Get-BoothKiroProcesses)
Report INFO ("부스 Kiro 프로세스 {0}개, Core PID {1}" -f $running.Count, (Get-CoreOwnerPid))
Report INFO ("archive 기록 {0}개" -f @(Get-ChildItem -LiteralPath $ArchiveDir -Directory -ErrorAction SilentlyContinue).Count)
$log = Get-ChildItem -LiteralPath $LogDir -Filter 'booth-*.log' -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
if ($log) {
  Report INFO "최근 로그 ($($log.Name)):"
  Get-Content -LiteralPath $log.FullName -Encoding UTF8 -Tail 8 | ForEach-Object { Write-Host "       $_" }
}
if ($failures -gt 0) { Report FAIL "$failures개 항목을 고쳐야 해요" } else { Report OK '필수 항목 통과' }
