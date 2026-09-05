import {
  type CommandReceipt,
  commandReceiptSchema,
  type HelperContext,
  helperContextSchema,
  helperGetContextQuerySchema,
  helperRequestContextRefreshCommandSchema,
} from '@vibe-helper/contracts'

export const HELPER_PROMPT_VERSION = '1.1.0' as const
export const HELPER_PROMPT_SOURCE = 'docs/agent-prompts/helper.md' as const
export const HELPER_AGENT_NAME = 'vibe-helper-helper' as const
export const HELPER_MCP_SERVER_NAME = 'vibe-helper-helper-core' as const
export const HELPER_TOOL_NAMES = ['get_helper_context', 'request_builder_context_refresh'] as const

export type HelperToolName = (typeof HELPER_TOOL_NAMES)[number]

export interface HelperAgentDefinition {
  readonly name: typeof HELPER_AGENT_NAME
  readonly description: string
  readonly promptVersion: typeof HELPER_PROMPT_VERSION
  readonly promptSource: typeof HELPER_PROMPT_SOURCE
  readonly prompt: string
  readonly includeMcpJson: false
  readonly tools: readonly [`@${typeof HELPER_MCP_SERVER_NAME}`]
  readonly allowedTools: readonly [`@${typeof HELPER_MCP_SERVER_NAME}`]
}

export interface HelperToolCaller {
  callTool(name: HelperToolName, input: unknown): Promise<unknown>
}

export class HelperAgentAdapterError extends Error {
  readonly code: 'INVALID_PROMPT' | 'TOOL_ERROR' | 'INVALID_TOOL_RESPONSE'

  constructor(code: HelperAgentAdapterError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'HelperAgentAdapterError'
    this.code = code
  }
}

function declaredPromptVersion(prompt: string): string | null {
  return prompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1] ?? null
}

export function createHelperAgentDefinition(prompt: string): HelperAgentDefinition {
  if (declaredPromptVersion(prompt) !== HELPER_PROMPT_VERSION) {
    throw new HelperAgentAdapterError(
      'INVALID_PROMPT',
      `Helper prompt must declare version ${HELPER_PROMPT_VERSION}.`,
    )
  }
  return {
    name: HELPER_AGENT_NAME,
    description: 'Explains the current validated Builder context without changing project state.',
    promptVersion: HELPER_PROMPT_VERSION,
    promptSource: HELPER_PROMPT_SOURCE,
    prompt,
    includeMcpJson: false,
    tools: [`@${HELPER_MCP_SERVER_NAME}`],
    allowedTools: [`@${HELPER_MCP_SERVER_NAME}`],
  }
}

function unwrapToolResponse(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  if ('isError' in value && value.isError === true) {
    throw new HelperAgentAdapterError('TOOL_ERROR', 'Helper Core tool returned an error.')
  }
  if ('structuredContent' in value) return value.structuredContent
  return value
}

function parseToolResponse<T>(
  value: unknown,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): T {
  const parsed = schema.safeParse(unwrapToolResponse(value))
  if (!parsed.success) {
    throw new HelperAgentAdapterError(
      'INVALID_TOOL_RESPONSE',
      'Helper Core tool returned an invalid response.',
    )
  }
  return parsed.data
}

export class HelperAgentToolAdapter {
  readonly #caller: HelperToolCaller

  constructor(caller: HelperToolCaller) {
    this.#caller = caller
  }

  async getContext(input: unknown): Promise<HelperContext> {
    const request = helperGetContextQuerySchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('get_helper_context', request),
      helperContextSchema,
    )
  }

  async requestContextRefresh(input: unknown): Promise<CommandReceipt> {
    const request = helperRequestContextRefreshCommandSchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('request_builder_context_refresh', request),
      commandReceiptSchema,
    )
  }
}
