import { isAbsolute } from 'node:path'

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { agentRoleSchema } from '@vibe-helper/contracts'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'

import { createRoleBoundMcpServer } from './role-server.js'

const requiredAbsolutePath = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || !isAbsolute(value)) {
    throw new TypeError(`${name} must be an explicit absolute path`)
  }
  return value
}

export async function runRoleBoundMcpServer(): Promise<void> {
  const role = agentRoleSchema.parse(process.env.VIBE_HELPER_AGENT_ROLE)
  const dataDirectory = requiredAbsolutePath('VIBE_HELPER_DATA_DIR')
  const workspaceRoot = requiredAbsolutePath('VIBE_HELPER_WORKSPACE_ROOT')
  const storage = await openSqliteStorage({ dataDirectory })
  const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
  const application = new ApplicationService({ storage, workspacePolicy })
  const server = createRoleBoundMcpServer({ role, application })

  const close = async (): Promise<void> => {
    await server.close()
    storage.close()
  }
  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())
  await server.connect(new StdioServerTransport())
}

void runRoleBoundMcpServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'MCP server failed to start'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
