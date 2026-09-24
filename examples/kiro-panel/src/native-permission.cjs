const { lstat, readFile, realpath } = require('node:fs/promises')
const { join } = require('node:path')
const { guardBuilderToolInput } = require('@vibe-helper/kiro-adapter/builder-tool-guard')

const LOCKFILE_PREPARE_COMMAND =
  'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile'

async function lockfilePrepareReady(workspace, windowsLauncher = false) {
  const stat = async (name) => lstat(join(workspace, name)).catch((error) => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  const [manifest, lockfile, config, npmrc, pnpmfile, pnpmfileMjs] = await Promise.all([
    stat('package.json'), stat('pnpm-lock.yaml'), stat('pnpm-workspace.yaml'),
    stat('.npmrc'), stat('.pnpmfile.cjs'), stat('.pnpmfile.mjs'),
  ])
  // The same script-free exact command can prepare or refresh a generated-app
  // lock after the Agent changes package.json. Never follow an aliased lock or
  // run it with unverified workspace config or an executable pnpmfile present.
  if (!manifest?.isFile() || manifest.isSymbolicLink() || manifest.nlink !== 1 ||
      npmrc != null || pnpmfile != null || pnpmfileMjs != null) return null
  if (config != null) {
    // The Windows host runner repeats this finite config check before spawning pnpm.
    // Legacy native execution still requires no workspace-local config.
    if (!windowsLauncher || !config.isFile() || config.isSymbolicLink() ||
        config.nlink !== 1 || config.size > 8192) return null
    const text = await readFile(join(workspace, 'pnpm-workspace.yaml'), 'utf8')
    let section = ''
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue
      if (/^(packages|allowBuilds|onlyBuiltDependencies):\s*$/.test(line)) {
        section = line.split(':')[0]; continue
      }
      const valid = section === 'packages' ? /^\s+-\s+['"]?\.['"]?\s*$/ :
        section === 'allowBuilds' ? /^\s+(esbuild|better-sqlite3):\s+(true|false)\s*$/ :
        section === 'onlyBuiltDependencies' ? /^\s+-\s+(esbuild|better-sqlite3)\s*$/ : null
      if (!valid?.test(line)) return null
    }
  }
  if (lockfile == null) return 'INITIAL'
  return lockfile.isFile() && !lockfile.isSymbolicLink() && lockfile.nlink === 1 ?
    'REFRESH' : null
}

function shellCwdMatches(cwd, workspace) {
  // Pinned Kiro 1.0.794 resolves shell cwd relative to the session workspace.
  // openNativeRole permits only one IDE folder, realpath-equal to this job's
  // generated workspace, before session/new. No other relative alias is safe.
  return cwd == null || cwd === workspace || cwd === '.' || cwd === './'
}

function shellInputProblem(detail, workspace) {
  const input = detail.rawInput
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'INPUT_INVALID'
  if (typeof input.command !== 'string' || !input.command.trim()) return 'COMMAND_INVALID'
  if (Object.keys(input).some(key => ![
    'command', 'cwd', 'ignoreWarning', 'timeout', 'warning', 'run_in_background',
  ].includes(key))) return 'UNKNOWN_FIELD'
  if (!shellCwdMatches(input.cwd, workspace)) return 'CWD_MISMATCH'
  if (input.ignoreWarning != null && input.ignoreWarning !== false) return 'IGNORE_WARNING'
  if (Object.hasOwn(input, 'run_in_background') && input.run_in_background !== false)
    return 'BACKGROUND_NOT_FALSE'
  if (input.timeout != null && (!Number.isSafeInteger(input.timeout) ||
      input.timeout < 1 || input.timeout > 300_000)) return 'TIMEOUT_INVALID'
  if (input.warning != null) return 'WARNING_PRESENT'
  if (!Array.isArray(detail.options) || !detail.options.some(value =>
      value?.kind === 'allow_once' && typeof value.optionId === 'string' &&
      value.optionId.length > 0)) return 'ALLOW_ONCE_MISSING'
  return null
}

/** Fail closed if the installed IDE changes a native permission request's tool shape. */
async function chooseNativeBuilderPermission(detail, workspace, onDiagnostic, projectCommand) {
  let canonicalWorkspace = workspace
  if (detail?.toolName === 'shell') {
    const info = await lstat(workspace).catch(() => null)
    canonicalWorkspace = await realpath(workspace).catch(() => null)
    if (!info?.isDirectory() || info.isSymbolicLink() || !canonicalWorkspace) {
      onDiagnostic?.('WORKSPACE_NOT_CANONICAL'); return null
    }
    const problem = shellInputProblem(detail, workspace)
    if (problem) { onDiagnostic?.(problem); return null }
    if (projectCommand) {
      const command = await projectCommand(detail.rawInput.command).catch(() => null)
      if (!command) { onDiagnostic?.('PROJECT_TOOLCHAIN_DENIED'); return null }
      detail = { ...detail, rawInput: { ...detail.rawInput, command } }
    }
  }
  if (!detail || !['read', 'search', 'write', 'shell'].includes(detail.toolName) ||
      !detail.rawInput || typeof detail.rawInput !== 'object' ||
      Array.isArray(detail.rawInput)) return null
  const input = detail.rawInput
  if (detail.toolName === 'shell') {
    if (typeof input.command !== 'string' || !input.command.trim()) return null
  } else if (typeof input.path !== 'string' || !input.path.trim()) return null
  if (detail.toolName !== 'shell' &&
      (input.path.startsWith('~') || input.path.includes('\\') ||
       input.path.includes('\0') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input.path)))
    return null
  // The permission surface is private to the pinned IDE build. If its shape
  // grows, review that new field before granting an automatic allow_once.
  const readingRange = 'start_line' in input || 'end_line' in input ||
    'explanation' in input && detail.toolName === 'read'
  const editingExistingFile = detail.toolName === 'write' &&
    (Object.hasOwn(input, 'oldStr') || Object.hasOwn(input, 'newStr') ||
      Object.hasOwn(input, 'replace_all'))
  if (detail.toolName === 'write' && detail.nativeToolId !==
      (editingExistingFile ? 'str_replace' : 'fs_write')) {
    onDiagnostic?.('TOOL_ID_MISMATCH'); return null
  }
  const expectedKeys = detail.toolName === 'shell' ?
    ['command', 'cwd', 'ignoreWarning', 'timeout', 'warning', 'run_in_background'] :
    detail.toolName === 'read' ? readingRange ?
      ['path', 'start_line', 'end_line', 'explanation'] : ['path', 'offset', 'limit'] :
      detail.toolName === 'search' ? ['path', 'explanation', 'depth'] :
        editingExistingFile ? ['path', 'oldStr', 'newStr', 'replace_all'] : ['path', 'text']
  if (Object.keys(input).some(key => !expectedKeys.includes(key))) {
    if (detail.toolName === 'write') onDiagnostic?.('UNKNOWN_FIELD')
    return null
  }
  if (detail.toolName === 'shell' &&
      (!shellCwdMatches(input.cwd, workspace) ||
       input.ignoreWarning != null && input.ignoreWarning !== false ||
       Object.hasOwn(input, 'run_in_background') && input.run_in_background !== false ||
       input.timeout != null && (!Number.isSafeInteger(input.timeout) ||
         input.timeout < 1 || input.timeout > 300_000) ||
       input.warning != null)) return null
  if (detail.toolName === 'read' &&
      (readingRange ?
        (input.start_line != null && (!Number.isSafeInteger(input.start_line) ||
          input.start_line < 1 || input.start_line > 1_000_000) ||
         input.end_line != null && (!Number.isSafeInteger(input.end_line) ||
          input.end_line < 1 || input.end_line > 1_000_000) ||
         input.start_line != null && input.end_line != null &&
          input.end_line < input.start_line ||
         input.explanation != null && (typeof input.explanation !== 'string' ||
          input.explanation.length > 240)) :
        (input.offset != null && (!Number.isSafeInteger(input.offset) || input.offset < 0) ||
         input.limit != null && (!Number.isSafeInteger(input.limit) || input.limit < 1 ||
           input.limit > 1_000_000)))) return null
  if (detail.toolName === 'search' &&
      (input.depth != null && (!Number.isSafeInteger(input.depth) || input.depth < 1 ||
        input.depth > 3) || input.explanation != null &&
        (typeof input.explanation !== 'string' || input.explanation.length > 240))) return null
  if (detail.toolName === 'write' &&
      (editingExistingFile ?
        (typeof input.oldStr !== 'string' || input.oldStr.length === 0 ||
          Buffer.byteLength(input.oldStr, 'utf8') > 1_048_576 ||
          typeof input.newStr !== 'string' ||
          Buffer.byteLength(input.newStr, 'utf8') > 1_048_576 ||
          (Object.hasOwn(input, 'replace_all') && typeof input.replace_all !== 'boolean')) :
        (typeof input.text !== 'string' || Buffer.byteLength(input.text, 'utf8') > 1_048_576))) {
    onDiagnostic?.('CONTENT_INVALID')
    return null
  }
  const option = Array.isArray(detail.options) &&
    detail.options.find(value => value?.kind === 'allow_once' &&
      typeof value.optionId === 'string' && value.optionId.length > 0)
  if (!option) {
    if (detail.toolName === 'write') onDiagnostic?.('ALLOW_ONCE_MISSING')
    return null
  }
  if (detail.toolName === 'shell' && input.command === LOCKFILE_PREPARE_COMMAND) {
    const mode = await lockfilePrepareReady(canonicalWorkspace, Boolean(projectCommand))
    onDiagnostic?.(mode === 'INITIAL' ? 'LOCKFILE_PREPARE_ALLOWED' :
      mode === 'REFRESH' ? 'LOCKFILE_REFRESH_ALLOWED' : 'LOCKFILE_PREPARE_DENIED')
    return mode ? option.optionId : null
  }
  const checked = await guardBuilderToolInput({ toolName: detail.toolName === 'search' ?
    'read' : detail.toolName,
    input: detail.toolName === 'shell' ? { ...input, cwd: canonicalWorkspace } : input,
    cwd: canonicalWorkspace }, canonicalWorkspace)
  if (detail.toolName === 'shell') onDiagnostic?.(checked.allowed ? 'ALLOWED' :
    ['GUARD_INPUT_INVALID', 'GUARD_CWD_MISMATCH', 'GUARD_PATH_ESCAPE',
      'GUARD_PROTECTED_PATH', 'GUARD_SHELL_DENIED'].includes(checked.reasonCode) ?
      checked.reasonCode : 'CORE_GUARD_DENIED')
  if (detail.toolName === 'write') onDiagnostic?.(checked.allowed ? 'ALLOWED' :
    ['GUARD_INPUT_INVALID', 'GUARD_CWD_MISMATCH', 'GUARD_PATH_ESCAPE',
      'GUARD_PROTECTED_PATH'].includes(checked.reasonCode) ?
      checked.reasonCode : 'CORE_GUARD_DENIED')
  return checked.allowed ? option.optionId : null
}
module.exports = { chooseNativeBuilderPermission }
