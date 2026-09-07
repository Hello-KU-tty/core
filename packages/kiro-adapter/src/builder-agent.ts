import {
  type BuilderApplyDecisionToolInput,
  builderApplyDecisionToolInputSchema,
  type BuilderCompleteTaskToolInput,
  builderCompleteTaskToolInputSchema,
  type BuilderTaskContext,
  builderTaskContextSchema,
  builderGetDecisionResultQuerySchema,
  builderGetTaskQuerySchema,
  type BuilderRequestDecisionToolInput,
  builderRequestDecisionToolInputSchema,
  builderStartTaskCommandSchema,
  type BuilderUpdateLiveContextToolInput,
  builderUpdateLiveContextToolInputSchema,
  type CommandReceipt,
  commandReceiptSchema,
  type DecisionCommandReceipt,
  decisionCommandReceiptSchema,
  type DecisionResult,
  decisionResultSchema,
} from '@vibe-helper/contracts'

export const BUILDER_PROMPT_VERSION = '1.3.1' as const
export const BUILDER_PROMPT_SOURCE = 'docs/agent-prompts/builder.md' as const
export const BUILDER_AGENT_NAME = 'vibe-helper-builder' as const
export const BUILDER_MCP_SERVER_NAME = 'vibe-helper-builder-core' as const
export const BUILDER_CORE_TOOL_NAMES = [
  'get_builder_task',
  'start_task',
  'update_build_context',
  'request_user_decision',
  'get_decision_result',
  'apply_decision_result',
  'complete_task',
] as const
export const BUILDER_NATIVE_TOOL_NAMES = ['fs_read', 'fs_write', 'execute_bash'] as const

export type BuilderCoreToolName = (typeof BUILDER_CORE_TOOL_NAMES)[number]

export interface BuilderAgentDefinitionOptions {
  readonly guardCommand: string
}

export interface BuilderAgentDefinition {
  readonly name: typeof BUILDER_AGENT_NAME
  readonly description: string
  readonly promptVersion: typeof BUILDER_PROMPT_VERSION
  readonly promptSource: typeof BUILDER_PROMPT_SOURCE
  readonly prompt: string
  readonly includeMcpJson: false
  readonly tools: readonly [
    'fs_read',
    'fs_write',
    'execute_bash',
    `@${typeof BUILDER_MCP_SERVER_NAME}`,
  ]
  readonly allowedTools: readonly [
    'fs_read',
    'fs_write',
    'execute_bash',
    `@${typeof BUILDER_MCP_SERVER_NAME}`,
  ]
  readonly toolsSettings: {
    readonly read: {
      readonly allowedPaths: readonly ['./**']
      readonly deniedPaths: readonly ['.kiro/**']
    }
    readonly write: {
      readonly allowedPaths: readonly ['./**']
      readonly deniedPaths: readonly ['.kiro/**']
    }
    readonly shell: {
      readonly allowedCommands: readonly [
        'node --test*',
        'pnpm test*',
        'pnpm rebuild esbuild',
        'pnpm run *',
        'pnpm install --frozen-lockfile',
        'npm test*',
        'npm run *',
        'npm install',
        'npm install --include=dev',
      ]
      readonly deniedCommands: readonly []
      readonly denyByDefault: true
    }
  }
  readonly hooks: {
    readonly preToolUse: readonly [{ readonly command: string }]
  }
}

export interface BuilderToolCaller {
  callTool(name: BuilderCoreToolName, input: unknown): Promise<unknown>
}

export class BuilderAgentAdapterError extends Error {
  readonly code: 'INVALID_PROMPT' | 'INVALID_GUARD' | 'TOOL_ERROR' | 'INVALID_TOOL_RESPONSE'

  constructor(code: BuilderAgentAdapterError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BuilderAgentAdapterError'
    this.code = code
  }
}

function declaredPromptVersion(prompt: string): string | null {
  return prompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1] ?? null
}

export function createBuilderAgentDefinition(
  prompt: string,
  options: BuilderAgentDefinitionOptions,
): BuilderAgentDefinition {
  if (declaredPromptVersion(prompt) !== BUILDER_PROMPT_VERSION) {
    throw new BuilderAgentAdapterError(
      'INVALID_PROMPT',
      `Builder prompt must declare version ${BUILDER_PROMPT_VERSION}.`,
    )
  }
  if (options.guardCommand.trim().length === 0) {
    throw new BuilderAgentAdapterError(
      'INVALID_GUARD',
      'Builder requires a pre-tool guard command.',
    )
  }
  return {
    name: BUILDER_AGENT_NAME,
    description: 'Builds the confirmed TypeScript project inside its Core-assigned workspace.',
    promptVersion: BUILDER_PROMPT_VERSION,
    promptSource: BUILDER_PROMPT_SOURCE,
    prompt,
    includeMcpJson: false,
    tools: ['fs_read', 'fs_write', 'execute_bash', `@${BUILDER_MCP_SERVER_NAME}`],
    allowedTools: ['fs_read', 'fs_write', 'execute_bash', `@${BUILDER_MCP_SERVER_NAME}`],
    toolsSettings: {
      read: { allowedPaths: ['./**'], deniedPaths: ['.kiro/**'] },
      write: { allowedPaths: ['./**'], deniedPaths: ['.kiro/**'] },
      shell: {
        allowedCommands: [
          'node --test*',
          'pnpm test*',
          'pnpm rebuild esbuild',
          'pnpm run *',
          'pnpm install --frozen-lockfile',
          'npm test*',
          'npm run *',
          'npm install',
          'npm install --include=dev',
        ],
        deniedCommands: [],
        denyByDefault: true,
      },
    },
    hooks: { preToolUse: [{ command: options.guardCommand }] },
  }
}

function unwrapToolResponse(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  if ('isError' in value && value.isError === true) {
    throw new BuilderAgentAdapterError('TOOL_ERROR', 'Builder Core tool returned an error.')
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
    throw new BuilderAgentAdapterError(
      'INVALID_TOOL_RESPONSE',
      'Builder Core tool returned an invalid response.',
    )
  }
  return parsed.data
}

export class BuilderAgentToolAdapter {
  readonly #caller: BuilderToolCaller

  constructor(caller: BuilderToolCaller) {
    this.#caller = caller
  }

  async getTask(input: unknown): Promise<BuilderTaskContext> {
    const request = builderGetTaskQuerySchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('get_builder_task', request),
      builderTaskContextSchema,
    )
  }

  async startTask(input: unknown): Promise<CommandReceipt> {
    const request = builderStartTaskCommandSchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('start_task', request),
      commandReceiptSchema,
    )
  }

  async updateContext(input: BuilderUpdateLiveContextToolInput): Promise<CommandReceipt> {
    const request = builderUpdateLiveContextToolInputSchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('update_build_context', request),
      commandReceiptSchema,
    )
  }

  async getDecisionResult(input: unknown): Promise<DecisionResult> {
    const request = builderGetDecisionResultQuerySchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('get_decision_result', request),
      decisionResultSchema,
    )
  }

  async requestDecision(input: BuilderRequestDecisionToolInput): Promise<DecisionCommandReceipt> {
    const request = builderRequestDecisionToolInputSchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('request_user_decision', request),
      decisionCommandReceiptSchema,
    )
  }

  async applyDecision(input: BuilderApplyDecisionToolInput): Promise<DecisionCommandReceipt> {
    const request = builderApplyDecisionToolInputSchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('apply_decision_result', request),
      decisionCommandReceiptSchema,
    )
  }

  async completeTask(input: BuilderCompleteTaskToolInput): Promise<CommandReceipt> {
    const request = builderCompleteTaskToolInputSchema.parse(input)
    return parseToolResponse(
      await this.#caller.callTool('complete_task', request),
      commandReceiptSchema,
    )
  }
}
