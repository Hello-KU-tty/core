import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Measure only metadata of Core-owned role files under the synthetic workspace.
// Never persist prompt text, MCP environment, binding credentials or tool args.
export async function nativeBenchmarkPromptMetadata(workspace, role, startedAt) {
  const directory = join(workspace, '.kiro', 'agents')
  const prefix = `vibe-native-${role.toLowerCase()}-`
  const output = []
  for (const name of await readdir(directory).catch(() => [])) {
    if (!name.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(name)) continue
    const path = join(directory, name)
    const info = await lstat(path)
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.mtimeMs < Date.parse(startedAt) ||
      info.size > 524288
    )
      continue
    const config = JSON.parse(await readFile(path, 'utf8'))
    if (typeof config.prompt !== 'string') continue
    output.push({
      role,
      promptVersion: config.prompt.match(/^> Prompt version: `([0-9.]+)`$/m)?.[1] ?? null,
      promptCharacters: config.prompt.length,
      promptBytes: Buffer.byteLength(config.prompt, 'utf8'),
      promptSha256: createHash('sha256').update(config.prompt).digest('hex'),
    })
  }
  return output
}

export async function requireUnusedBenchmarkReport(path) {
  const existing = await lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing) throw new Error('NATIVE_BENCHMARK_REPORT_ALREADY_EXISTS')
}
