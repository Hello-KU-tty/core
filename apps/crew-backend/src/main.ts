import { mkdir } from 'node:fs/promises'
import { isAbsolute, join, parse, resolve } from 'node:path'

import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { createRoleBoundMcpHttpHandler } from '@vibe-helper/mcp-server/role-server'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'

import {
  createCrewBackendServer,
  DISCOVERY_MERGE_MCP_PATH,
  DISCOVERY_ROUND_MCP_PATH,
  DISCOVERY_SPEC_MCP_PATH,
  DISCOVERY_SPEC_RECOVERY_MCP_PATH,
} from './server.js'

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new TypeError(`${name} is required`)
  return value
}

function explicitAbsolutePath(name: string, value: string): string {
  const normalized = resolve(value)
  if (!isAbsolute(value) || normalized === parse(normalized).root) {
    throw new TypeError(`${name} must be an explicit non-root absolute path`)
  }
  return normalized
}

function applicationDirectories(): { readonly data: string; readonly workspaces: string } {
  const explicitData = process.env.VIBE_HELPER_DATA_DIR
  const explicitWorkspaces = process.env.VIBE_HELPER_WORKSPACE_ROOT
  if (explicitData !== undefined || explicitWorkspaces !== undefined) {
    if (explicitData === undefined || explicitWorkspaces === undefined) {
      throw new TypeError(
        'VIBE_HELPER_DATA_DIR and VIBE_HELPER_WORKSPACE_ROOT must be provided together',
      )
    }
    return {
      data: explicitAbsolutePath('VIBE_HELPER_DATA_DIR', explicitData),
      workspaces: explicitAbsolutePath('VIBE_HELPER_WORKSPACE_ROOT', explicitWorkspaces),
    }
  }

  const crewHome = explicitAbsolutePath('KIROCREW_HOME', required('KIROCREW_HOME'))
  const appName = required('KIROCREW_APP_NAME')
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(appName)) {
    throw new TypeError('KIROCREW_APP_NAME is invalid')
  }
  const appDataRoot = join(crewHome, 'apps', appName, 'data')
  return {
    data: join(appDataRoot, 'core'),
    workspaces: join(appDataRoot, 'generated-workspaces'),
  }
}

function listenPort(): number {
  const port = Number(required('PORT'))
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('PORT must be an integer from 1 through 65535')
  }
  return port
}

export async function runCrewBackend(): Promise<void> {
  const directories = applicationDirectories()
  await mkdir(directories.workspaces, { recursive: true, mode: 0o700 })
  const storage = await openSqliteStorage({ dataDirectory: directories.data })
  const workspacePolicy = await WorkspacePathPolicy.create(directories.workspaces)
  const application = new ApplicationService({ storage, workspacePolicy })
  const discoveryMcpHandlers = {
    [DISCOVERY_ROUND_MCP_PATH]: createRoleBoundMcpHttpHandler({
      role: 'DISCOVERY',
      application,
      toolNames: ['get_discovery_context', 'submit_candidate_round'],
    }),
    [DISCOVERY_MERGE_MCP_PATH]: createRoleBoundMcpHttpHandler({
      role: 'DISCOVERY',
      application,
      toolNames: ['get_discovery_context', 'submit_candidate_merge'],
    }),
    [DISCOVERY_SPEC_MCP_PATH]: createRoleBoundMcpHttpHandler({
      role: 'DISCOVERY',
      application,
      toolNames: ['submit_learning_spec'],
    }),
    [DISCOVERY_SPEC_RECOVERY_MCP_PATH]: createRoleBoundMcpHttpHandler({
      role: 'DISCOVERY',
      application,
      toolNames: ['get_discovery_context', 'submit_learning_spec'],
    }),
  }
  const server = createCrewBackendServer({
    application,
    proxySecret: required('KIROCREW_PROXY_SECRET'),
    discoveryMcpHandlers,
  })

  const close = (): void => {
    server.close(() => storage.close())
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  await new Promise<void>((resolve, reject) => {
    const startupError = (error: Error): void => reject(error)
    server.once('error', startupError)
    server.listen(listenPort(), '127.0.0.1', () => {
      server.off('error', startupError)
      resolve()
    })
  })
}

void runCrewBackend().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Crew backend failed to start'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
