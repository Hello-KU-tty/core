# "준비하고 있어요" window shown by launch.ps1. Closes when the signal file is gone (or after 2 min).
param([Parameter(Mandatory = $true)][string]$SignalFile)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Size = New-Object System.Drawing.Size(620, 220)
$form.BackColor = [System.Drawing.Color]::FromArgb(7, 5, 13)

$bar = New-Object System.Windows.Forms.Panel
$bar.Dock = 'Top'
$bar.Height = 6
$bar.BackColor = [System.Drawing.Color]::FromArgb(139, 92, 246)

$label = New-Object System.Windows.Forms.Label
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$label.ForeColor = [System.Drawing.Color]::White
$label.Font = New-Object System.Drawing.Font('Malgun Gothic', 18)
$label.Text = "Hello Vibe를 준비하고 있어요`r`n잠시만 기다려 주세요 (20~40초)"

$form.Controls.Add($label)
$form.Controls.Add($bar)

$started = Get-Date
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 300
$timer.Add_Tick({
  if (-not (Test-Path -LiteralPath $SignalFile) -or ((Get-Date) - $started).TotalSeconds -gt 120) {
    $timer.Stop()
    $form.Close()
  }
})
$timer.Start()
[void]$form.ShowDialog()
