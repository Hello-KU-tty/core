import { isAbsolute, win32 } from 'node:path'

export { isPrivateDirectory, privateDirectory } from '@vibe-helper/runtime'

/** Quote only backend-owned paths in a Kiro preToolUse command. */
export function guardCommand(
  node: string,
  script: string,
  workspace: string,
  platform = process.platform,
): string {
  for (const value of [node, script, workspace]) {
    if (
      !(platform === 'win32' ? win32.isAbsolute(value) : isAbsolute(value)) ||
      /[\r\n\0]/.test(value)
    )
      throw new Error('GUARD_PATH_INVALID')
  }
  if (platform === 'win32') {
    // Kiro v2 invokes shell hooks. Avoid cmd/PowerShell expansion in path components.
    if ([node, script, workspace].some((value) => /["%$`!&|<>^]/.test(value)))
      throw new Error('WINDOWS_GUARD_PATH_UNSUPPORTED')
    return `"${node}" "${script}" --workspace "${workspace}"`
  }
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  return `${quote(node)} ${quote(script)} --workspace ${quote(workspace)}`
}
