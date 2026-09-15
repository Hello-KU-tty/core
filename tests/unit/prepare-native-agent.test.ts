import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareNativeAgent } from '../../scripts/prepare-native-agent.mjs'

const URL = 'http://127.0.0.1:47231/mcp/native-00000000-0000-4000-8000-000000000001'
async function fixture(role = 'HELPER') {
  const root = await mkdtemp('/private/tmp/vibe-native-preparer-unit-')
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const bindingFile = join(root, 'binding.json')
  const binding = {
    role,
    workspace,
    url: URL,
    authorization: 'Bearer synthetic-private-token',
    toolNames: role === 'HELPER' ? ['get_helper_context'] : ['get_builder_task'],
  }
  await writeFile(bindingFile, JSON.stringify(binding))
  return { root, workspace, bindingFile, binding }
}

describe('native role config preparation', () => {
  it('uses the canonical Helper prompt and only its bound read tool', async () => {
    const f = await fixture()
    const result = await prepareNativeAgent(f)
    const config = JSON.parse(await readFile(result.path, 'utf8'))
    expect(config.name).toBe('vibe-native-helper')
    expect(config.prompt).toContain('> Prompt version: `1.2.0`')
    expect(config.tools).toEqual(['@vibe-native-core/get_helper_context'])
    expect(config).not.toHaveProperty('allowedTools')
    expect(config).not.toHaveProperty('toolsSettings')
    expect(config.permissions.rules).toEqual(
      expect.arrayContaining([
        { capability: 'fs_write', effect: 'deny' },
        { capability: 'shell', effect: 'deny' },
      ]),
    )
  })

  it('rejects a mismatched issued workspace and symlinked Agent config directory', async () => {
    const f = await fixture()
    await expect(
      prepareNativeAgent({ workspace: f.root, bindingFile: f.bindingFile }),
    ).rejects.toThrow('NATIVE_WORKSPACE_BINDING_MISMATCH')
    await mkdir(join(f.root, 'outside'))
    await symlink(join(f.root, 'outside'), join(f.workspace, '.kiro'))
    await expect(prepareNativeAgent(f)).rejects.toThrow('NATIVE_AGENT_CONFIG_SYMLINK_DENIED')
  })

  it('rejects a tool outside the selected Core role catalog', async () => {
    const f = await fixture()
    await writeFile(
      f.bindingFile,
      JSON.stringify({ ...f.binding, toolNames: ['get_helper_context', 'request_user_decision'] }),
    )
    await expect(prepareNativeAgent(f)).rejects.toThrow('NATIVE_BINDING_DESCRIPTOR_INVALID')
  })
})
