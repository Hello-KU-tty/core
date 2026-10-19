# Runs at sign-in (Startup folder). When nobody has touched the laptop for IdleMinutes (booth.json,
# default 10), closes booth Kiro and shows the desktop, so the next visitor starts from the icons.
# It also ends a Builder turn nobody is watching. 0 turns it off; the idle-paused file pauses it.
. (Join-Path $PSScriptRoot 'BoothCommon.ps1')

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HelloVibeBoothIdle {
  [StructLayout(LayoutKind.Sequential)]
  private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")]
  private static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  public static double Minutes() {
    LASTINPUTINFO info = new LASTINPUTINFO();
    info.cbSize = (uint)Marshal.SizeOf(info);
    if (!GetLastInputInfo(ref info)) return 0;
    return unchecked((uint)Environment.TickCount - info.dwTime) / 60000.0;
  }
}
'@

$mutex = New-Object System.Threading.Mutex($false, 'Local\HelloVibeBoothIdle')
$owned = $false
try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
if (-not $owned) { exit 0 }

Write-BoothLog 'idle-watch: started'
while ($true) {
  Start-Sleep -Seconds 15
  try {
    $limit = [double](Get-BoothConfigValue 'IdleMinutes' 10)
    if ($limit -le 0) { continue }
    if ((Test-Path -LiteralPath $PauseFlag) -or (Test-Path -LiteralPath $LaunchingFlag)) { continue }
    $idle = [HelloVibeBoothIdle]::Minutes()
    if ($idle -lt $limit) { continue }
    if (@(Get-BoothKiroProcesses).Count -eq 0) { continue }
    Write-BoothLog ('idle-watch: {0:N1} min without input, closing booth Kiro' -f $idle)
    Stop-BoothProcesses
    (New-Object -ComObject Shell.Application).MinimizeAll()
  } catch {
    Write-BoothLog ('idle-watch: ' + $_.Exception.Message)
  }
}
