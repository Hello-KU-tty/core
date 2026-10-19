# After the booth: closes booth Kiro, removes the icons, shortcuts and idle reset, restores the wallpaper.
# Keeps C:\HelloVibeBooth (archive\ holds visitors' chats and Core data: local only, never upload).
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')

foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { Test-CommandLineHas $_ 'idle-watch.ps1' })) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Stop-BoothProcesses
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($path in (Join-Path $desktop '① 처음부터 만들어 보기.lnk'), (Join-Path $desktop '② 결정하는 순간 체험하기.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Startup')) 'Hello Vibe 부스 자동 초기화.lnk')) {
  Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
}

$previous = Get-BoothConfigValue 'PreviousWallpaper' $null
if ($null -ne $previous) {
  $style = [string](Get-BoothConfigValue 'PreviousWallpaperStyle' '10')
  if (-not $style) { $style = '10' }
  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value $style
  Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class HelloVibeBoothWallpaperRestore {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern bool SystemParametersInfo(int action, int param, string value, int flags);
  public static bool Set(string path) { return SystemParametersInfo(0x14, 0, path, 0x3); }
}
'@
  [void][HelloVibeBoothWallpaperRestore]::Set([string]$previous)
}
Write-BoothLog 'teardown: done'
Write-Host "정리했어요. 기록은 $BoothRoot 에 남아 있어요 (archive는 방문자 대화라 외부로 올리지 마세요)."
