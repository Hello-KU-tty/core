import { stdin, stderr } from 'node:process'

import { guardBuilderToolInput } from './builder-tool-guard.js'

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

const workspaceIndex = process.argv.indexOf('--workspace')
const expectedWorkspace = workspaceIndex < 0 ? undefined : process.argv[workspaceIndex + 1]
if (expectedWorkspace === undefined) {
  stderr.write('BUILDER_GUARD_WORKSPACE_REQUIRED\n')
  process.exitCode = 2
} else {
  try {
    const input: unknown = JSON.parse(await readStandardInput())
    const result = await guardBuilderToolInput(input, expectedWorkspace)
    if (!result.allowed) {
      stderr.write(`${result.reasonCode ?? 'BUILDER_TOOL_DENIED'}\n`)
      process.exitCode = 2
    }
  } catch {
    stderr.write('GUARD_INPUT_INVALID\n')
    process.exitCode = 2
  }
}
