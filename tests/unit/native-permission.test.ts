import { linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { guardBuilderToolInput } from '../../packages/kiro-adapter/src/builder-tool-guard.js'

// Directory junctions need no administrator privilege on Windows. File aliases
// use hard links there; both must be denied by the regular single-link guard.
const fileAlias = process.platform === 'win32' ? linkSync : symlinkSync

// Evaluate the panel's CJS helper with its one guard dependency injected, so
// these gates are tested before an extension bundle has been built.
const source = readFileSync(
  new URL('../../examples/kiro-panel/src/native-permission.cjs', import.meta.url),
  'utf8',
)
const nativeModule = {
  exports: {} as {
    chooseNativeBuilderPermission: (
      detail: unknown,
      workspace: string,
      onDiagnostic?: (reason: string) => void,
      projectCommand?: (command: string) => Promise<string | null>,
      options?: { windows1170Diagnostic: boolean },
    ) => Promise<string | null>
  },
}
new Function('require', 'module', source)((name: string) => {
  if (name === 'node:fs/promises') return { lstat, readFile, realpath }
  if (name === 'node:path') return { join, win32 }
  if (name !== '@vibe-helper/kiro-adapter/builder-tool-guard') throw new Error('UNEXPECTED_REQUIRE')
  return { guardBuilderToolInput }
}, nativeModule)
const { chooseNativeBuilderPermission } = nativeModule.exports

const option = [{ kind: 'allow_once', optionId: 'allow-1' }]
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'vibe-native-permission-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, '.kiro'))
  return root
}

describe('native Builder permission gate', () => {
  it.skipIf(process.platform !== 'win32')(
    'accepts Windows cwd spelling differences only for the same real directory and guarded command',
    async () => {
      const root = await realpath(workspace())
      const outside = await realpath(workspace())
      const alias = join(outside, 'alias')
      symlinkSync(root, alias, 'junction')
      const changedCase =
        root[0] === root[0]?.toUpperCase()
          ? root[0]?.toLowerCase() + root.slice(1)
          : root[0]?.toUpperCase() + root.slice(1)
      const request = (cwd: string, command = 'pnpm run build') => ({
        toolName: 'shell',
        rawInput: { command, cwd, run_in_background: false },
        options: option,
      })
      for (const cwd of [changedCase, root.replaceAll('\\', '/')]) {
        expect(
          await chooseNativeBuilderPermission(request(cwd), root, undefined, undefined, {
            windows1170Diagnostic: true,
          }),
        ).toBe('allow-1')
        expect(
          await chooseNativeBuilderPermission(request(cwd, 'whoami'), root, undefined, undefined, {
            windows1170Diagnostic: true,
          }),
        ).toBeNull()
      }
      expect(await chooseNativeBuilderPermission(request(changedCase), root)).toBeNull()
      for (const cwd of [
        outside,
        alias,
        `${root}\\src\\..`,
        `${root}.`,
        `${root}:stream`,
        `\\\\?\\${root}`,
        '..',
        '.\\',
      ])
        expect(
          await chooseNativeBuilderPermission(request(cwd), root, undefined, undefined, {
            windows1170Diagnostic: true,
          }),
        ).toBeNull()
    },
  )
  it.skipIf(process.platform !== 'win32')(
    'accepts source-pinned Windows absolute targets only within the unprotected workspace',
    async () => {
      const root = await realpath(workspace())
      const outside = await realpath(workspace())
      symlinkSync(join(root, '.kiro'), join(root, 'protected-alias'), 'junction')
      symlinkSync(outside, join(root, 'outside-alias'), 'junction')
      const allow = (path: string, diagnostic = true) =>
        chooseNativeBuilderPermission(
          {
            toolName: 'write',
            nativeToolId: 'fs_write',
            rawInput: { path, text: 'synthetic' },
            options: option,
          },
          root,
          undefined,
          undefined,
          { windows1170Diagnostic: diagnostic },
        )
      expect(await allow(join(root, 'src', 'new.ts'))).toBe('allow-1')
      expect(await allow(join(root, 'src', 'new.ts').replaceAll('\\', '/'))).toBe('allow-1')
      expect(await allow(join(root, 'src', 'new.ts'), false)).toBeNull()
      for (const path of [
        join(outside, 'new.ts'),
        join(root, '.kiro', 'agent.json'),
        join(root, 'protected-alias', 'agent.json'),
        join(root, 'outside-alias', 'new.ts'),
        join(root, '.kiro.', 'agent.json'),
        join(root, 'src', 'file.ts:stream'),
        'C:relative.ts',
        'file:///C:/temp/test.ts',
        '\\\\server\\share\\test.ts',
      ]) {
        expect(await allow(path)).toBeNull()
      }
    },
  )

  it('accepts only the bounded display description in the 1.1.158 shell profile', async () => {
    const root = workspace()
    const request = (description: unknown) => ({
      toolName: 'shell',
      rawInput: { command: 'pnpm run build', description, run_in_background: false },
      options: option,
    })
    const profile = { windows1170Diagnostic: true }
    expect(await chooseNativeBuilderPermission(request('Build the local app'), root)).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        request('Build the local app'),
        root,
        undefined,
        undefined,
        profile,
      ),
    ).toBe('allow-1')
    for (const description of [42, {}, 'x'.repeat(241)])
      expect(
        await chooseNativeBuilderPermission(
          request(description),
          root,
          undefined,
          undefined,
          profile,
        ),
      ).toBeNull()
    const unsafe = request('Build the local app')
    unsafe.rawInput.command = 'pnpm run build; whoami'
    expect(
      await chooseNativeBuilderPermission(unsafe, root, undefined, undefined, profile),
    ).toBeNull()
    unsafe.rawInput.command = 'pnpm run build'
    unsafe.rawInput.run_in_background = true
    expect(
      await chooseNativeBuilderPermission(unsafe, root, undefined, undefined, profile),
    ).toBeNull()
  })

  it('refreshes a Windows lock with finite approved config while legacy and unsafe config remain denied', async () => {
    const root = workspace()
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    const command = 'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile'
    const detail = {
      toolName: 'shell',
      rawInput: { command, cwd: '.', run_in_background: false },
      options: option,
    }
    const checkedLauncher = async () => command
    for (const config of [
      'allowBuilds:\n  esbuild: true\n',
      'packages:\n  - .\nonlyBuiltDependencies:\n  - better-sqlite3\n',
    ]) {
      writeFileSync(join(root, 'pnpm-workspace.yaml'), config)
      expect(await chooseNativeBuilderPermission(detail, root, undefined, checkedLauncher)).toBe(
        'allow-1',
      )
      expect(await chooseNativeBuilderPermission(detail, root)).toBeNull()
    }
    for (const config of [
      'allowBuilds:\n  unexpected: true\n',
      'packages:\n  - ../outside\n',
      'pnpmfile: ./hook.cjs\n',
      'configDependencies:\n  unsafe: 1.0.0\n',
    ]) {
      writeFileSync(join(root, 'pnpm-workspace.yaml'), config)
      expect(
        await chooseNativeBuilderPermission(detail, root, undefined, checkedLauncher),
      ).toBeNull()
    }
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')
    writeFileSync(join(root, '.pnpmfile.mjs'), 'throw Error("must not execute")')
    expect(await chooseNativeBuilderPermission(detail, root, undefined, checkedLauncher)).toBeNull()
  })

  it('requires a verified Windows launcher before applying the existing command and cwd guard', async () => {
    const root = workspace()
    const prefix = '.\\.kiro\\vibe-tools.cmd '
    const request = (command: string, cwd = '.') => ({
      toolName: 'shell',
      rawInput: { command, cwd, run_in_background: false },
      options: option,
    })
    const normalize = async (command: string) =>
      command.startsWith(prefix) ? command.slice(prefix.length) : null
    expect(
      await chooseNativeBuilderPermission(
        request(`${prefix}pnpm run build`),
        root,
        undefined,
        normalize,
      ),
    ).toBe('allow-1')
    expect(
      await chooseNativeBuilderPermission(request('pnpm run build'), root, undefined, normalize),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        request(`${prefix}pnpm run build & whoami`),
        root,
        undefined,
        normalize,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        request(`${prefix}pnpm run build`, '..'),
        root,
        undefined,
        normalize,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        request(`${prefix}pnpm run build`),
        root,
        undefined,
        async () => {
          throw new Error('changed launcher')
        },
      ),
    ).toBeNull()
  })
  it('prepares or refreshes only a regular generated-app pnpm lock with scripts explicitly ignored', async () => {
    const root = workspace()
    const request = (command: string, extras = {}) => ({
      toolName: 'shell',
      rawInput: { command, cwd: '.', run_in_background: false, ...extras },
      options: option,
    })
    expect(
      await chooseNativeBuilderPermission(
        request('pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile'),
        root,
      ),
    ).toBeNull()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'synthetic-app', private: true }),
    )
    const reasons: string[] = []
    expect(
      await chooseNativeBuilderPermission(
        request('pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile'),
        root,
        (reason) => reasons.push(reason),
      ),
    ).toBe('allow-1')
    expect(reasons).toEqual(['LOCKFILE_PREPARE_ALLOWED'])
    for (const denied of [
      'pnpm install --lockfile-only',
      'pnpm install --ignore-scripts --lockfile-only',
      'pnpm install --lockfile-only --ignore-scripts',
      'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile; pwd',
    ])
      expect(await chooseNativeBuilderPermission(request(denied), root)).toBeNull()
    for (const extras of [
      { cwd: '..' },
      { run_in_background: true },
      { ignoreWarning: true },
      { timeout: 300_001 },
    ])
      expect(
        await chooseNativeBuilderPermission(
          request('pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile', extras),
          root,
        ),
      ).toBeNull()
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    reasons.length = 0
    expect(
      await chooseNativeBuilderPermission(
        request('pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile'),
        root,
        (reason) => reasons.push(reason),
      ),
    ).toBe('allow-1')
    expect(reasons).toEqual(['LOCKFILE_REFRESH_ALLOWED'])
  })

  it('rejects executable or aliased pnpm bootstrap configuration', async () => {
    const root = workspace()
    const request = {
      toolName: 'shell',
      rawInput: {
        command: 'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile',
        cwd: root,
      },
      options: option,
    }
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'synthetic-app', private: true }),
    )
    writeFileSync(join(root, '.pnpmfile.cjs'), 'module.exports = {}')
    expect(await chooseNativeBuilderPermission(request, root)).toBeNull()
    const second = workspace()
    writeFileSync(
      join(second, 'package.json'),
      JSON.stringify({ name: 'synthetic-app', private: true }),
    )
    fileAlias(join(root, '.pnpmfile.cjs'), join(second, 'pnpm-workspace.yaml'))
    expect(await chooseNativeBuilderPermission(request, second)).toBeNull()
    const third = workspace()
    writeFileSync(
      join(third, 'package.json'),
      JSON.stringify({ name: 'synthetic-app', private: true }),
    )
    writeFileSync(join(third, '.npmrc'), 'global-pnpmfile=./hooks.cjs\n')
    expect(await chooseNativeBuilderPermission(request, third)).toBeNull()
    const fourth = workspace()
    writeFileSync(
      join(fourth, 'package.json'),
      JSON.stringify({ name: 'synthetic-app', private: true }),
    )
    writeFileSync(join(fourth, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    expect(await chooseNativeBuilderPermission(request, fourth)).toBeNull()
    for (const name of ['.pnpmfile.cjs', '.npmrc', 'pnpm-workspace.yaml']) {
      const refresh = workspace()
      writeFileSync(join(refresh, 'package.json'), '{"name":"synthetic-app","private":true}')
      writeFileSync(join(refresh, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
      writeFileSync(join(refresh, name), 'synthetic configuration')
      expect(await chooseNativeBuilderPermission(request, refresh)).toBeNull()
    }
    const symlinked = workspace()
    writeFileSync(join(symlinked, 'package.json'), '{"name":"synthetic-app","private":true}')
    writeFileSync(join(symlinked, 'real-lock.yaml'), 'lockfileVersion: 9.0\n')
    fileAlias(join(symlinked, 'real-lock.yaml'), join(symlinked, 'pnpm-lock.yaml'))
    expect(await chooseNativeBuilderPermission(request, symlinked)).toBeNull()
    const linked = workspace()
    writeFileSync(join(linked, 'package.json'), '{"name":"synthetic-app","private":true}')
    writeFileSync(join(linked, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    linkSync(join(linked, 'pnpm-lock.yaml'), join(linked, 'other-lock.yaml'))
    expect(await chooseNativeBuilderPermission(request, linked)).toBeNull()
    const packageLink = workspace()
    writeFileSync(join(packageLink, 'package.json'), '{"name":"synthetic-app","private":true}')
    writeFileSync(join(packageLink, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    linkSync(join(packageLink, 'package.json'), join(packageLink, 'other-package.json'))
    expect(await chooseNativeBuilderPermission(request, packageLink)).toBeNull()
    const packageSymlink = workspace()
    writeFileSync(
      join(packageSymlink, 'real-package.json'),
      '{"name":"synthetic-app","private":true}',
    )
    writeFileSync(join(packageSymlink, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    fileAlias(join(packageSymlink, 'real-package.json'), join(packageSymlink, 'package.json'))
    expect(await chooseNativeBuilderPermission(request, packageSymlink)).toBeNull()
  })

  it('only accepts a structured, known file tool and a one-time option', async () => {
    const root = workspace()
    const input = { path: 'src/app.js', text: 'export {}' }
    expect(
      await chooseNativeBuilderPermission(
        { toolName: 'write', nativeToolId: 'fs_write', rawInput: input, options: option },
        root,
      ),
    ).toBe('allow-1')
    for (const nativeToolId of [null, 'str_replace', 'unrecognized'])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'write', nativeToolId, rawInput: input, options: option },
          root,
        ),
      ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'shell',
          rawInput: {
            command: 'npm test',
            cwd: root,
            ignoreWarning: false,
            timeout: 120_000,
            warning: null,
            run_in_background: false,
          },
          options: option,
        },
        root,
      ),
    ).toBe('allow-1')
    for (const cwd of ['.', './'])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'shell', rawInput: { command: 'npm test', cwd }, options: option },
          root,
        ),
      ).toBe('allow-1')
    for (const input of [
      { command: 'npm test', cwd: outsidePath(root) },
      { command: 'npm test', cwd: '..' },
      { command: 'npm test', cwd: '../' },
      { command: 'npm test', cwd: 'src' },
      { command: 'npm test', cwd: '../outside' },
      { command: 'npm test', ignoreWarning: true },
      { command: 'npm test', run_in_background: true },
      { command: 'npm test', run_in_background: 'false' },
      { command: 'npm test', run_in_background: null },
      { command: 'npm test', timeout: 300_001 },
      { command: 'npm test', timeout: '1000' },
      { command: 'npm test', warning: 'Unreviewed warning' },
      { command: 'npm test', warning: { message: 'unexpected' } },
    ])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'shell', rawInput: input, options: option },
          root,
        ),
      ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'read',
          rawInput: { path: 'src/app.js', offset: 0, limit: 100 },
          options: option,
        },
        root,
      ),
    ).toBe('allow-1')
    expect(
      await chooseNativeBuilderPermission(
        { toolName: 'read', rawInput: { path: 'src/app.js', limit: -1 }, options: option },
        root,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        { toolName: 'executeBash', rawInput: input, options: option },
        root,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        { toolName: null, rawInput: input, options: option },
        root,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'write',
          nativeToolId: 'fs_write',
          rawInput: input,
          options: [{ kind: 'allow_always', optionId: 'allow-forever' }],
        },
        root,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'write',
          nativeToolId: 'fs_write',
          rawInput: { ...input, destination: '../outside' },
          options: option,
        },
        root,
      ),
    ).toBeNull()
  })

  it('rejects protected, escaping, and symlink targets', async () => {
    const root = workspace()
    const outside = workspace()
    symlinkSync(outside, join(root, 'src', 'linked'), 'junction')
    const alias = join(mkdtempSync(join(tmpdir(), 'vibe-native-cwd-alias-')), 'workspace')
    symlinkSync(root, alias, 'junction')
    expect(
      await chooseNativeBuilderPermission(
        { toolName: 'shell', rawInput: { command: 'npm test', cwd: alias }, options: option },
        root,
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        { toolName: 'shell', rawInput: { command: 'npm test', cwd: '.' }, options: option },
        alias,
      ),
    ).toBeNull()
    for (const path of ['.kiro/agents/role.json', '../outside.js', 'src/linked/out.js'])
      expect(
        await chooseNativeBuilderPermission(
          {
            toolName: 'write',
            nativeToolId: 'fs_write',
            rawInput: { path, text: 'x' },
            options: option,
          },
          root,
        ),
      ).toBeNull()
  })

  it('permits only the pinned IDE existing-file edit shape within the generated workspace', async () => {
    const root = workspace()
    const outside = workspace()
    symlinkSync(outside, join(root, 'src', 'linked'), 'junction')
    const edit = { path: 'package.json', oldStr: '"test": "old"', newStr: '"test": "new"' }
    for (const input of [edit, { ...edit, replace_all: false }, { ...edit, replace_all: true }])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'write', nativeToolId: 'str_replace', rawInput: input, options: option },
          root,
        ),
      ).toBe('allow-1')
    for (const nativeToolId of [null, 'fs_write', 'unrecognized'])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'write', nativeToolId, rawInput: edit, options: option },
          root,
        ),
      ).toBeNull()
    for (const input of [
      { ...edit, oldStr: '' },
      { ...edit, newStr: 1 },
      { ...edit, replace_all: null },
      { ...edit, replace_all: 'false' },
      { ...edit, extra: 'unexpected' },
      { ...edit, text: 'mixed formats' },
      { ...edit, oldStr: 'x'.repeat(1_048_577) },
      { ...edit, newStr: 'x'.repeat(1_048_577) },
      { ...edit, path: '../outside.json' },
      { ...edit, path: '.kiro/agents/builder.json' },
      { ...edit, path: 'src/linked/out.json' },
    ])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'write', nativeToolId: 'str_replace', rawInput: input, options: option },
          root,
        ),
      ).toBeNull()
  })

  it('reports only bounded write denial enums without file or replacement text', async () => {
    const root = workspace()
    const reasons: string[] = []
    const input = {
      path: 'package.json',
      oldStr: 'fixture-private-old',
      newStr: 'fixture-private-new',
    }
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'write',
          nativeToolId: null,
          rawInput: input,
          options: option,
        },
        root,
        (reason: string) => reasons.push(reason),
      ),
    ).toBeNull()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'write',
          nativeToolId: 'str_replace',
          rawInput: input,
          options: option,
        },
        root,
        (reason: string) => reasons.push(reason),
      ),
    ).toBe('allow-1')
    expect(reasons).toEqual(['TOOL_ID_MISMATCH', 'ALLOWED'])
    expect(JSON.stringify(reasons)).not.toContain('fixture-private')
    expect(JSON.stringify(reasons)).not.toContain(root)
  })

  it('maps only the installed IDE directory listing shape to bounded read', async () => {
    const root = workspace()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'search',
          rawInput: {
            path: '.',
            explanation: 'Inspect the generated app files',
            depth: 2,
          },
          options: option,
        },
        root,
      ),
    ).toBe('allow-1')
    for (const input of [
      { path: '~', depth: 1 },
      { path: '../', depth: 1 },
      { path: '.', depth: 4 },
      { path: '.', depth: 1, command: 'npm test' },
    ])
      expect(
        await chooseNativeBuilderPermission(
          { toolName: 'search', rawInput: input, options: option },
          root,
        ),
      ).toBeNull()
  })

  it('rejects shell metacharacters and unreviewed command shapes', async () => {
    const root = workspace()
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'shell',
          rawInput: { command: 'node --test src/app.test.js' },
          options: option,
        },
        root,
      ),
    ).toBe('allow-1')
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'shell',
          rawInput: { command: 'node --test src/app.test.js; pwd' },
          options: option,
        },
        root,
      ),
    ).toBeNull()
  })

  it('reports bounded shell denial reasons without exposing command or workspace text', async () => {
    const root = workspace()
    for (const [input, expected] of [
      [{ command: 'npm test', cwd: '..' }, 'CWD_MISMATCH'],
      [{ command: 'npm test', run_in_background: true }, 'BACKGROUND_NOT_FALSE'],
      [{ command: 'npm test', timeout: 300_001 }, 'TIMEOUT_INVALID'],
      [{ command: 'npm test', extraPrivateKey: 'secret' }, 'UNKNOWN_FIELD'],
      [{ command: 'npm test; echo secret' }, 'GUARD_SHELL_DENIED'],
    ] as const) {
      const reasons: string[] = []
      const chosen = await chooseNativeBuilderPermission(
        { toolName: 'shell', rawInput: input, options: option },
        root,
        (reason: string) => reasons.push(reason),
      )
      expect(chosen).toBeNull()
      expect(reasons).toEqual([expected])
      expect(reasons[0]).not.toContain(root)
      expect(reasons[0]).not.toContain('secret')
    }
    const reasons: string[] = []
    expect(
      await chooseNativeBuilderPermission(
        {
          toolName: 'shell',
          rawInput: { command: 'npm test', run_in_background: false },
          options: option,
        },
        root,
        (reason: string) => reasons.push(reason),
      ),
    ).toBe('allow-1')
    expect(reasons).toEqual(['ALLOWED'])
  })

  it('records the unresolved package-script escape gate without executing a script', async () => {
    const root = workspace()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          test: "node -e \"require('node:fs').writeFileSync('../outside-marker','x')\"",
        },
      }),
    )
    // The top-level native command is syntactically allowed, even though the
    // package script could write outside the workspace. This is a known FAIL
    // for OS confinement, not a security proof for the Builder role.
    expect(
      await chooseNativeBuilderPermission(
        { toolName: 'shell', rawInput: { command: 'npm test' }, options: option },
        root,
      ),
    ).toBe('allow-1')
  })
})

function outsidePath(root: string): string {
  return join(root, '..')
}
