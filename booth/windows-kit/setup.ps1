# One-time setup of the booth laptop (safe to run again). Creates C:\HelloVibeBooth, a separate Kiro
# profile with Hello Vibe, the two desktop icons, operator shortcuts, the idle reset and the wallpaper.
param(
  [string]$Vsix,
  [int]$IdleMinutes = 10,
  [switch]$SkipVsix,
  [switch]$SkipWallpaper
)
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')

Write-Host 'Hello Vibe 부스 키트 설치'
$kiro = Find-KiroExe
$cli = Find-KiroCli $kiro
Write-Host "  Kiro: $kiro"

foreach ($dir in $BoothRoot, $ProjectsDir, $StartFolder, $DecisionFolder, $GoldenDir, $GuideDir, $ArchiveDir,
  $LogDir, $EmptyDir, $OperatorDir, (Join-Path $ProfileDir 'User'), $ExtensionsDir) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
if (@(Get-ChildItem -LiteralPath $EmptyDir -Force).Count -gt 0) { throw "$EmptyDir 는 비어 있어야 해요 (① 폴더를 이걸로 비워요)" }

# 1. Booth profile settings, merged into whatever the profile already has.
$settingsPath = Join-Path $ProfileDir 'User\settings.json'
$settings = $null
if (Test-Path -LiteralPath $settingsPath) {
  try { $settings = Get-Content -Raw -Encoding UTF8 -LiteralPath $settingsPath | ConvertFrom-Json }
  catch { Copy-Item -LiteralPath $settingsPath -Destination "$settingsPath.bak" -Force }
}
if ($null -eq $settings) { $settings = New-Object PSObject }
foreach ($key in $BoothSettings.Keys) {
  $settings | Add-Member -NotePropertyName $key -NotePropertyValue $BoothSettings[$key] -Force
}
Write-JsonFile $settingsPath $settings
Write-Host "  부스 프로필 설정: $settingsPath"

# 2. Hello Vibe VSIX into the booth profile's own extensions folder.
if (-not $SkipVsix) {
  if (-not $Vsix) {
    $releases = Join-Path $KitDir '..\..\releases\windows\kiro-native'
    $Vsix = Get-ChildItem -LiteralPath $releases -Filter 'builder-helper-agent-panel-*-win32-x64.vsix' |
      Where-Object { $_.Name -match '-(\d+\.\d+\.\d+)-win32' } |
      Sort-Object { [version]($_.Name -replace '^.*-(\d+\.\d+\.\d+)-win32.*$', '$1') } -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $Vsix -or -not (Test-Path -LiteralPath $Vsix)) { throw 'VSIX를 찾지 못했어요. -Vsix <경로>로 지정하세요.' }
  Write-Host ("  VSIX: {0}`r`n        SHA-256 {1}" -f $Vsix, (Get-FileHash -LiteralPath $Vsix -Algorithm SHA256).Hash.ToLower())
  if ($cli) {
    & $cli --user-data-dir $ProfileDir --extensions-dir $ExtensionsDir --install-extension $Vsix --force
    if ($LASTEXITCODE -ne 0) { throw "VSIX 설치 실패 (exit $LASTEXITCODE)" }
  } else {
    Write-Warning 'Kiro의 bin\kiro.cmd가 없어요. stage.ps1로 부스 Kiro를 연 뒤 Extensions → Install from VSIX로 설치하세요.'
  }
}

# 3. Guide tabs (outside the Project folders, so ① stays an empty folder).
Copy-Item -Path (Join-Path $KitDir 'guide\*.booth-guide.md') -Destination $GuideDir -Force

# 4. Desktop icons, operator shortcuts and the idle reset at sign-in.
$desktop = [Environment]::GetFolderPath('Desktop')
New-BoothShortcut (Join-Path $desktop '① 처음부터 만들어 보기.lnk') 'launch.ps1' '-Mode start' `
  ((Join-Path $KitDir 'assets\start.ico') + ',0') 'Hello Vibe: 배우고 싶은 것으로 프로젝트를 찾아 처음부터 만들어 봐요'
New-BoothShortcut (Join-Path $desktop '② 결정하는 순간 체험하기.lnk') 'launch.ps1' '-Mode decision' `
  ((Join-Path $KitDir 'assets\decision.ico') + ',0') 'Hello Vibe: 만들다 멈춘 프로젝트에서 AI가 묻는 선택에 답해 봐요'
New-BoothShortcut (Join-Path $OperatorDir '1. ② 준비 시작 (stage).lnk') 'stage.ps1' '' $null '빈 폴더와 새 Core로 부스 Kiro 열기' -Visible
New-BoothShortcut (Join-Path $OperatorDir '2. ② 원본 저장 (save-golden).lnk') 'save-golden.ps1' '' $null '지금 상태를 ② 원본으로 저장' -Visible
New-BoothShortcut (Join-Path $OperatorDir '상태 확인 (check).lnk') 'check.ps1' '' $null '부스 상태 확인' -Visible
New-BoothShortcut (Join-Path $OperatorDir '자동 초기화 일시정지·재개.lnk') 'idle-pause.ps1' '' $null '자동 초기화 켜고 끄기'
New-BoothShortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'Hello Vibe 부스 자동 초기화.lnk') 'idle-watch.ps1' '' $null 'Hello Vibe 부스 자동 초기화'

# 5. booth.json (the previous wallpaper is kept from the first run for teardown.ps1).
$config = Read-BoothConfig
if ($null -eq $config) { $config = New-Object PSObject }
$desktopKey = 'HKCU:\Control Panel\Desktop'
$current = Get-ItemProperty -Path $desktopKey
if (-not $config.PSObject.Properties['PreviousWallpaper']) {
  $config | Add-Member -NotePropertyName PreviousWallpaper -NotePropertyValue ([string]$current.Wallpaper)
  $config | Add-Member -NotePropertyName PreviousWallpaperStyle -NotePropertyValue ([string]$current.WallpaperStyle)
}
$config | Add-Member -NotePropertyName KiroExe -NotePropertyValue $kiro -Force
$config | Add-Member -NotePropertyName IdleMinutes -NotePropertyValue $IdleMinutes -Force
$config | Add-Member -NotePropertyName SetupAt -NotePropertyValue (Get-Date).ToString('s') -Force
Write-JsonFile $ConfigPath $config

# 6. Wallpaper.
if (-not $SkipWallpaper) {
  $wallpaper = Join-Path $BoothRoot 'wallpaper.png'
  Copy-Item -LiteralPath (Join-Path $KitDir 'assets\wallpaper.png') -Destination $wallpaper -Force
  Set-ItemProperty -Path $desktopKey -Name WallpaperStyle -Value '10'
  Set-ItemProperty -Path $desktopKey -Name TileWallpaper -Value '0'
  Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class HelloVibeBoothWallpaper {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern bool SystemParametersInfo(int action, int param, string value, int flags);
  public static bool Set(string path) { return SystemParametersInfo(0x14, 0, path, 0x3); }
}
'@
  if (-not [HelloVibeBoothWallpaper]::Set($wallpaper)) { Write-Warning '바탕화면 배경을 바꾸지 못했어요.' }
}

# 7. Start the idle reset now (it ignores a second copy).
$watch = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f (Join-Path $KitDir 'idle-watch.ps1')
Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList $watch | Out-Null
Write-BoothLog 'setup: done'

Write-Host ''
Write-Host '설치 끝. 다음 순서:'
Write-Host "  1. $OperatorDir\1. ② 준비 시작 (stage) → 부스 Kiro에서 로그인하고 ② 프로젝트를 선택 직전까지 진행"
Write-Host "  2. $OperatorDir\2. ② 원본 저장 (save-golden)"
Write-Host '  3. 바탕화면 ①, ② 아이콘으로 리허설, check.ps1로 상태 확인'
