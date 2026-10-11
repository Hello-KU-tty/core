import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ApplicationService } from '@vibe-helper/application'
import type { AgentRole } from '@vibe-helper/contracts'
import {
  createRoleBoundMcpHttpHandler,
  KIRO_CHAT_BUILDER_TOOL_NAMES,
} from '@vibe-helper/mcp-server/role-server'
import type { LocalMcpHandler } from './agent-host.js'

const NATIVE_TOOLS: Partial<Record<AgentRole, readonly string[]>> = {
  DISCOVERY: [
    'get_discovery_context',
    'submit_candidate_previews',
    'submit_candidate_enrichments',
    'submit_candidate_round',
    'submit_candidate_merge',
    'submit_learning_spec',
  ],
  BUILDER: [
    'get_builder_task',
    'get_build_status',
    'start_task',
    'update_build_context',
    'request_user_decision',
    'get_decision_result',
    'apply_decision_result',
    'resolve_decision_from_chat',
    'complete_task',
  ],
  HELPER: ['get_helper_context'],
}

/** One run's Core authority. No Kiro CLI process or unbound role server is involved. */
export function createNativeCoreBinding(options: {
  application: ApplicationService
  role: 'DISCOVERY' | 'BUILDER' | 'HELPER'
  /** `KIRO_CHAT`: the learner's own Kiro chat Builder tools (K10); needs role BUILDER. */
  surface?: 'KIRO_CHAT'
  projectId: string
  correlationId: string
  taskId?: string
  discoverySessionId?: string
  toolNames?: readonly string[]
}): {
  path: string
  authorization: string
  toolNames: readonly string[]
  handler: LocalMcpHandler
  revoke: () => void
} {
  if (options.surface === 'KIRO_CHAT' && options.role !== 'BUILDER')
    throw new TypeError('NATIVE_ROLE_UNSUPPORTED')
  const names =
    options.surface === 'KIRO_CHAT' ? KIRO_CHAT_BUILDER_TOOL_NAMES : NATIVE_TOOLS[options.role]
  if (!names) throw new TypeError('NATIVE_ROLE_UNSUPPORTED')
  if (
    options.role === 'DISCOVERY'
      ? !options.discoverySessionId || options.taskId !== undefined
      : !options.taskId || options.discoverySessionId !== undefined
  )
    throw new TypeError('NATIVE_ROLE_SCOPE_INVALID')
  const selected = options.toolNames ?? names
  if (selected.length === 0 || selected.some((name) => !names.includes(name)))
    throw new TypeError('NATIVE_TOOL_SELECTION_INVALID')
  const path = `/mcp/native-${randomUUID()}`
  const authorization = `Bearer ${randomBytes(32).toString('hex')}`
  let active = true
  const core = createRoleBoundMcpHttpHandler({
    role: options.role,
    application: options.application,
    ...(options.surface === undefined ? {} : { surface: options.surface }),
    toolNames: selected,
    binding: {
      projectId: options.projectId,
      correlationId: options.correlationId,
      ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
      ...(options.discoverySessionId === undefined
        ? {}
        : { discoverySessionId: options.discoverySessionId }),
      isActive: () => active,
    },
  })
  return {
    path,
    authorization,
    toolNames: selected,
    revoke: () => {
      active = false
    },
    handler: {
      fetch: (request) => {
        const supplied = Buffer.from(request.headers.get('authorization') ?? '')
        const expected = Buffer.from(authorization)
        if (!active || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
          return Promise.resolve(new Response(null, { status: 401 }))
        return core.fetch(request)
      },
      close: async () => {
        active = false
        await core.close()
      },
    },
  }
}
