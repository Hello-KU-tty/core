# Hello Vibe booth kit: shared paths and helpers, dot-sourced by the other scripts.
# Windows PowerShell 5.1. Keep every .ps1 here UTF-8 with BOM: 5.1 reads BOM-less files as the ANSI code page.
$ErrorActionPreference = 'Stop'

$KitDir = $PSScriptRoot
$BoothRoot = if ($env:HELLO_VIBE_BOOTH_ROOT) { $env:HELLO_VIBE_BOOTH_ROOT } else { 'C:\HelloVibeBooth' }
$ConfigPath = Join-Path $BoothRoot 'booth.json'
$ProfileDir = Join-Path $BoothRoot 'kiro-profile'
$ExtensionsDir = Join-Path $BoothRoot 'kiro-extensions'
$ProjectsDir = Join-Path $BoothRoot 'projects'
$StartFolder = Join-Path $ProjectsDir 'start'
$DecisionFolder = Join-Path $ProjectsDir 'decision'
$GoldenDir = Join-Path $BoothRoot 'golden'
$GoldenCoreData = Join-Path $GoldenDir 'core-data'
$GoldenDecision = Join-Path $GoldenDir 'decision'
$GoldenInfo = Join-Path $GoldenDir 'golden.json'
$GuideDir = Join-Path $BoothRoot 'guide'
$ArchiveDir = Join-Path $BoothRoot 'archive'
$LogDir = Join-Path $BoothRoot 'logs'
$EmptyDir = Join-Path $BoothRoot 'empty'
$OperatorDir = Join-Path $BoothRoot 'operator'
$PauseFlag = Join-Path $BoothRoot 'idle-paused'
$LaunchingFlag = Join-Path $BoothRoot 'launching'
$CoreData = Join-Path $ProfileDir 'User\globalStorage\vibe-helper.builder-helper-agent-panel\core-data'
$KiroSessions = Join-Path $env:USERPROFILE '.kiro\sessions'
# Core's own lock and connection files. They never go into or come out of the golden copy.
$CoreRuntimeDirs = @('backend.lock', 'backend.stopped-*', 'backend.abandoned-*')
$CoreRuntimeFiles = @('connection.json')
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Booth profile settings (setup.ps1 writes them, check.ps1 compares them).
$BoothSettings = [ordered]@{
  'window.restoreWindows' = 'none'
  'window.newWindowDimensions' = 'maximized'
  'workbench.startupEditor' = 'none'
  'update.mode' = 'none'
  'extensions.autoUpdate' = $false
  'extensions.autoCheckUpdates' = $false
  # A chat session opens about 3 s after the window, before a trust answer, and an untrusted
  # session stays Supervised. Booth folders are ours, so trust is off for this profile only.
  'security.workspace.trust.enabled' = $false
  # Workflows hand whole Tasks to a planning agent and the learner's choices disappear (K18).
  'kiroAgent.workflows.enabled' = $false
  'kiroAgent.agentAutonomy' = 'Autopilot'
  'workbench.editorAssociations' = @{ '*.booth-guide.md' = 'vscode.markdown.preview.editor' }
}

function Write-BoothLog([string]$Message) {
  try {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $file = Join-Path $LogDir ('booth-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    [IO.File]::AppendAllText($file, $line + "`r`n", $Utf8NoBom)
  } catch {}
}

function Read-BoothConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return $null }
  return (Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath | ConvertFrom-Json)
}

function Get-BoothConfigValue([string]$Name, $Default) {
  $config = Read-BoothConfig
  if ($config -and $config.PSObject.Properties[$Name] -and $null -ne $config.$Name) { return $config.$Name }
  return $Default
}

function Write-JsonFile([string]$Path, $Value) {
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 6), $Utf8NoBom)
}

function Find-KiroExe {
  $candidates = @()
  $configured = Get-BoothConfigValue 'KiroExe' $null
  if ($configured) { $candidates += [string]$configured }
  $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Kiro\Kiro.exe')
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Kiro\Kiro.exe') }
  $shim = Get-Command kiro -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($shim) { $candidates += (Join-Path (Split-Path -Parent (Split-Path -Parent $shim.Source)) 'Kiro.exe') }
  foreach ($path in $candidates) {
    if ($path -and (Test-Path -LiteralPath $path)) { return (Resolve-Path -LiteralPath $path).Path }
  }
  throw 'Kiro.exe를 찾지 못했어요. booth.json의 KiroExe에 Kiro.exe 경로를 적어 주세요.'
}

function Find-KiroCli([string]$KiroExe) {
  $cli = Join-Path (Split-Path -Parent $KiroExe) 'bin\kiro.cmd'
  if (Test-Path -LiteralPath $cli) { return $cli }
  return $null
}

function Test-CommandLineHas($Process, [string]$Text) {
  $line = $Process.CommandLine
  return [bool]($line -and $line.IndexOf($Text, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Get-BoothKiroProcesses {
  return @(Get-CimInstance Win32_Process -Filter "Name = 'Kiro.exe'" |
    Where-Object { Test-CommandLineHas $_ $ProfileDir })
}

function Get-CoreOwnerPid {
  $owner = Join-Path $CoreData 'backend.lock\owner.json'
  if (-not (Test-Path -LiteralPath $owner)) { return $null }
  try { return [int]((Get-Content -Raw -LiteralPath $owner | ConvertFrom-Json).pid) } catch { return $null }
}

# Booth Kiro, its Core, MCP bridges and anything started from the booth folders (dev servers
# included), plus their child processes. Nothing is matched by process name alone.
function Get-BoothProcessIds {
  $all = @(Get-CimInstance Win32_Process)
  $roots = @{}
  foreach ($p in $all) {
    $id = [int]$p.ProcessId
    if ($id -eq $PID) { continue }
    $isBoothKiro = $p.Name -eq 'Kiro.exe' -and (Test-CommandLineHas $p $ProfileDir)
    if ($isBoothKiro -or (Test-CommandLineHas $p $CoreData) -or (Test-CommandLineHas $p $ProjectsDir)) {
      $roots[$id] = $p
    }
  }
  $found = @{}
  foreach ($id in $roots.Keys) { $found[$id] = $true }
  $queue = New-Object System.Collections.Queue
  foreach ($p in $roots.Values) { $queue.Enqueue($p) }
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    foreach ($child in $all) {
      $childId = [int]$child.ProcessId
      if ($childId -eq $PID -or $found.ContainsKey($childId)) { continue }
      if ($child.ParentProcessId -ne $parent.ProcessId) { continue }
      # A reused parent PID: the child must not be older than the parent.
      if ($child.CreationDate -and $parent.CreationDate -and $child.CreationDate -lt $parent.CreationDate) { continue }
      $found[$childId] = $true
      $queue.Enqueue($child)
    }
  }
  return @($found.Keys)
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return [bool](& $Condition)
}

# Closes booth Kiro (politely first, then by force), then stops what is left. -GracefulCore waits
# for Core to close SQLite by itself (about 30-40 s after its last Kiro window), for the golden copy.
function Stop-BoothProcesses([switch]$GracefulCore) {
  foreach ($p in Get-BoothKiroProcesses) {
    if (Test-CommandLineHas $p '--type=') { continue }
    try { [void](Get-Process -Id $p.ProcessId -ErrorAction Stop).CloseMainWindow() } catch {}
  }
  if (-not (Wait-Until { @(Get-BoothKiroProcesses).Count -eq 0 } 8)) {
    # A quit prompt or a busy window: Core keeps its lease while any booth Kiro lives.
    foreach ($p in Get-BoothKiroProcesses) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    [void](Wait-Until { @(Get-BoothKiroProcesses).Count -eq 0 } 10)
  }
  if ($GracefulCore) {
    $core = Get-CoreOwnerPid
    if ($core) {
      Write-BoothLog "waiting for Core $core to close by itself"
      [void](Wait-Until { -not (Get-Process -Id $core -ErrorAction SilentlyContinue) } 75)
    }
  }
  $ids = @(Get-BoothProcessIds)
  if ($ids.Count -gt 0) { Write-BoothLog ('stopping booth processes: ' + ($ids -join ',')) }
  foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  if (-not (Wait-Until { @(Get-BoothProcessIds).Count -eq 0 } 20)) {
    throw ('부스 프로세스가 끝나지 않았어요: ' + ((Get-BoothProcessIds) -join ','))
  }
}

function ConvertTo-LocalPath([string]$Path) {
  if ($Path -match '^file:') { $Path = ([Uri]$Path).LocalPath }
  return $Path.Replace('/', '\').TrimEnd('\')
}

function Test-PathUnder([string]$Path, [string]$Root) {
  $p = ConvertTo-LocalPath $Path
  $r = $Root.TrimEnd('\')
  return ($p -ieq $r) -or $p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)
}

# Kiro chat sessions live in %USERPROFILE%\.kiro\sessions for every profile; pick the booth ones.
function Get-BoothSessionDirs {
  if (-not (Test-Path -LiteralPath $KiroSessions)) { return @() }
  $roots = @($ProjectsDir, (Join-Path $CoreData 'workspaces'))
  $result = @()
  foreach ($hash in Get-ChildItem -LiteralPath $KiroSessions -Directory) {
    foreach ($dir in Get-ChildItem -LiteralPath $hash.FullName -Directory -Filter 'sess_*') {
      $meta = Join-Path $dir.FullName 'session.json'
      if (-not (Test-Path -LiteralPath $meta)) { continue }
      try { $session = Get-Content -Raw -Encoding UTF8 -LiteralPath $meta | ConvertFrom-Json } catch { continue }
      $paths = @()
      foreach ($name in 'workspacePaths', 'rootPaths') {
        if ($session.PSObject.Properties[$name]) { $paths += @($session.$name) }
      }
      $isBooth = $false
      foreach ($path in $paths) {
        foreach ($root in $roots) { if ($path -and (Test-PathUnder ([string]$path) $root)) { $isBooth = $true } }
      }
      if ($isBooth) { $result += $dir }
    }
  }
  return $result
}

# Moves booth chat sessions and copies the Core database into archive\<time> (local only).
function Save-VisitRecords([string]$Label = 'visit') {
  $sessions = @(Get-BoothSessionDirs)
  $dbDir = Join-Path $CoreData 'data'
  $dbFiles = @()
  if (Test-Path -LiteralPath $dbDir) { $dbFiles = @(Get-ChildItem -LiteralPath $dbDir -File -Filter 'vibe-helper.sqlite*') }
  $goldenDb = Join-Path $GoldenCoreData 'data\vibe-helper.sqlite'
  $dbChanged = $dbFiles.Count -gt 0
  if ($dbChanged -and (Test-Path -LiteralPath $goldenDb) -and $dbFiles.Count -eq 1) {
    $dbChanged = (Get-FileHash -LiteralPath $dbFiles[0].FullName).Hash -ne (Get-FileHash -LiteralPath $goldenDb).Hash
  }
  if ($sessions.Count -eq 0 -and -not $dbChanged) { return }
  $target = Join-Path $ArchiveDir ('{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $Label)
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  if ($dbChanged) {
    $dbTarget = Join-Path $target 'core-db'
    New-Item -ItemType Directory -Force -Path $dbTarget | Out-Null
    foreach ($file in $dbFiles) { Copy-Item -LiteralPath $file.FullName -Destination $dbTarget -Force }
  }
  if ($sessions.Count -gt 0) {
    $sessionTarget = Join-Path $target 'sessions'
    New-Item -ItemType Directory -Force -Path $sessionTarget | Out-Null
    foreach ($dir in $sessions) {
      Move-Item -LiteralPath $dir.FullName -Destination (Join-Path $sessionTarget ($dir.Parent.Name + '-' + $dir.Name))
    }
  }
  Write-BoothLog ("archived {0} session(s), db={1} -> {2}" -f $sessions.Count, $dbChanged, $target)
}

# robocopy /MIR: copies only what changed, removes extras and copes with long node_modules paths.
# /SJ keeps junctions as junctions (pnpm links node_modules with them on Windows); they point inside
# the same folder, so they are right again once the copy is back at its original path.
function Invoke-Mirror([string]$From, [string]$To, [switch]$SkipCoreRuntime) {
  # A missing source would mirror as empty and wipe the target.
  if (-not (Test-Path -LiteralPath $From)) { throw "복사할 원본이 없어요: $From" }
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  $robo = @($From, $To, '/MIR', '/SJ', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
  if ($SkipCoreRuntime) { $robo += @('/XD') + $CoreRuntimeDirs + @('/XF') + $CoreRuntimeFiles }
  & robocopy.exe @robo | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) { throw "robocopy 실패($code): $From -> $To" }
}

# The panel reopens the last Project seen in any window when its folder is not a Project folder, so
# ① would show the previous visitor's Project. Forget it in the booth profile (Kiro must be closed),
# with the Node that Hello Vibe already downloaded into the profile.
function Clear-LastProject {
  $state = Join-Path $ProfileDir 'User\globalStorage\state.vscdb'
  if (-not (Test-Path -LiteralPath $state)) { return }
  $tools = Join-Path $ProfileDir 'User\globalStorage\vibe-helper.builder-helper-agent-panel\core-tools'
  $node = Get-ChildItem -LiteralPath $tools -Recurse -File -Include 'vibe-helper-core.exe', 'node.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $node) { Write-BoothLog 'clear-last-project: no managed Node in the profile yet'; return }
  & $node.FullName --no-warnings (Join-Path $KitDir 'clear-last-project.mjs') $state
  if ($LASTEXITCODE -ne 0) { Write-BoothLog "clear-last-project: exit $LASTEXITCODE" }
}

function Start-BoothKiro([string]$Folder, [string]$Guide) {
  $exe = Find-KiroExe
  $arguments = '--user-data-dir "{0}" --extensions-dir "{1}" --new-window "{2}"' -f $ProfileDir, $ExtensionsDir, $Folder
  if ($Guide -and (Test-Path -LiteralPath $Guide)) { $arguments += ' "{0}"' -f $Guide }
  Write-BoothLog "starting Kiro: $Folder"
  Start-Process -FilePath $exe -ArgumentList $arguments | Out-Null
}

function Wait-BoothKiroWindow([int]$Seconds) {
  return Wait-Until {
    foreach ($p in Get-BoothKiroProcesses) {
      $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
      if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { return $true }
    }
    return $false
  } $Seconds
}

function New-BoothShortcut([string]$Path, [string]$Script, [string]$Arguments, [string]$Icon, [string]$Description, [switch]$Visible) {
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($Path)
  $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $style = if ($Visible) { '-NoExit ' } else { '-WindowStyle Hidden ' }
  $link.Arguments = ('-NoProfile -ExecutionPolicy Bypass {0}-File "{1}" {2}' -f $style, (Join-Path $KitDir $Script), $Arguments).Trim()
  $link.WorkingDirectory = $KitDir
  if ($Icon) { $link.IconLocation = $Icon }
  $link.Description = $Description
  if (-not $Visible) { $link.WindowStyle = 7 }
  $link.Save()
}
