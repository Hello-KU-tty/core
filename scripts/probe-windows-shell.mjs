// Read-only preflight for the Windows-provided PowerShell used in the W5 host.
// This does not select a Kiro profile, change execution policy, or call a model.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

assert.equal(process.platform, 'win32')
const executable = await realpath(process.argv[2] ?? '')
assert.equal(basename(executable).toLowerCase(), 'kiro.exe')
const app = join(dirname(executable), 'resources/app')
const product = JSON.parse(await readFile(join(app, 'product.json'), 'utf8'))
assert.equal(product.applicationName, 'kiro')
const script = join(app, 'out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1')
const stat = await lstat(script)
assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size < 256 * 1024)
assert.equal((await realpath(script)).toLowerCase(), resolve(script).toLowerCase())
const scriptSha256 = createHash('sha256')
  .update(await readFile(script))
  .digest('hex')
const env = { ...process.env, VIBE_SHELL_PROBE_SCRIPT: script }
for (const key of Object.keys(env))
  if (/^PSModulePath$/i.test(key) || key.startsWith('VSCODE_')) delete env[key]
const command = `
$ErrorActionPreference = 'Stop'
$r = @{ policy = [string](Get-ExecutionPolicy); languageMode = [string]$ExecutionContext.SessionState.LanguageMode }
try { . $env:VIBE_SHELL_PROBE_SCRIPT; $r.loaded = $true }
catch { $r.loaded = $false; $r.errorType = $_.Exception.GetType().Name; $r.errorId = $_.FullyQualifiedErrorId }
[Console]::WriteLine('W5_SHELL_PROBE_JSON:' + ($r | ConvertTo-Json -Compress))
`
const { stdout } = await promisify(execFile)(
  join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
  ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
  { env, windowsHide: true, timeout: 30000, maxBuffer: 32768 },
)
const marker = 'W5_SHELL_PROBE_JSON:'
const records = stdout.split(/\r?\n/).filter((line) => line.startsWith(marker))
assert.equal(records.length, 1)
const observed = JSON.parse(records[0].slice(marker.length))
assert.ok(
  ['Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass', 'Undefined'].includes(
    observed.policy,
  ),
)
assert.ok(
  ['FullLanguage', 'RestrictedLanguage', 'ConstrainedLanguage', 'NoLanguage'].includes(
    observed.languageMode,
  ),
)
assert.equal(typeof observed.loaded, 'boolean')
const report = {
  schemaVersion: 1,
  kind: 'W5_WINDOWS_DEFAULT_POWERSHELL_SCRIPT_LOAD',
  observedAt: new Date().toISOString(),
  kiroVersion: product.version,
  scriptSha256,
  modelCalls: 0,
  policyChanged: false,
  profileChanged: false,
  status: observed.loaded ? 'SCRIPT_LOADABLE' : 'SCRIPT_BLOCKED',
  interactiveTerminalVerified: false,
  policy: observed.policy,
  languageMode: observed.languageMode,
  errorType: observed.errorType === 'PSSecurityException' ? observed.errorType : null,
  errorId: observed.errorId === 'UnauthorizedAccess' ? observed.errorId : null,
}
await writeFile('dist/windows-shell-preflight-receipt.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
if (!observed.loaded) process.exitCode = 2
