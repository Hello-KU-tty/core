import { redactSensitiveText } from '@vibe-helper/application/redaction'
import {
  contractErrorSchema,
  operationErrorSchema,
  projectHistorySchema,
  projectSessionSnapshotSchema,
  type ContractError,
  type OperationError,
  type ProjectHistory,
  type ProjectSessionSnapshot,
} from '@vibe-helper/contracts'

export const CREW_CORE_APPLICATION_PATH = '/apps/vibe-helper/api/application'

const CHAT_SLOT_COLLECTION_PATH = '/api/chat/slots'
const MAX_RESTORED_MESSAGES = 100

export interface CrewAppApi {
  get(path: string): Promise<unknown>
  post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
}

export class CrewAppClientError extends Error {
  readonly code: string
  readonly category: 'CONNECTION' | 'CONTRACT' | 'PERMISSION' | 'OPERATION'
  readonly causeDetail: ContractError | OperationError | undefined

  constructor(
    category: CrewAppClientError['category'],
    code: string,
    message: string,
    options?: { readonly cause?: unknown; readonly causeDetail?: ContractError | OperationError },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CrewAppClientError'
    this.category = category
    this.code = code
    this.causeDetail = options?.causeDetail
  }
}

interface ApplicationSuccess {
  readonly success: true
  readonly data: unknown
}

function parseApplicationSuccess(response: unknown): ApplicationSuccess {
  if (typeof response !== 'object' || response === null || !('success' in response)) {
    throw new CrewAppClientError(
      'CONTRACT',
      'INVALID_APPLICATION_RESPONSE',
      'Core returned an invalid response.',
    )
  }
  const record = response as Record<string, unknown>
  if (record.success === true && 'data' in record) return { success: true, data: record.data }
  if (record.success === false && 'error' in record) {
    const contractError = contractErrorSchema.safeParse(record.error)
    const operationError = operationErrorSchema.safeParse(record.error)
    const error = contractError.success
      ? contractError.data
      : operationError.success
        ? operationError.data
        : null
    if (error !== null) {
      throw new CrewAppClientError(
        error.category === 'PERMISSION' ? 'PERMISSION' : 'OPERATION',
        error.code,
        error.message,
        { causeDetail: error },
      )
    }
  }
  throw new CrewAppClientError(
    'CONTRACT',
    'INVALID_APPLICATION_RESPONSE',
    'Core returned an invalid response.',
  )
}

export class CrewCoreClient {
  readonly #api: CrewAppApi

  constructor(api: CrewAppApi) {
    this.#api = api
  }

  async listProjects(correlationId: string, limit = 50): Promise<ProjectHistory> {
    const response = await this.#postCore({
      schemaVersion: 1,
      kind: 'UI_LIST_PROJECTS',
      correlationId,
      actor: { kind: 'UI' },
      limit,
    })
    return projectHistorySchema.parse(parseApplicationSuccess(response).data)
  }

  async restoreProjectSession(
    correlationId: string,
    projectId: string,
    helperConversationLimit = 20,
  ): Promise<ProjectSessionSnapshot> {
    const response = await this.#postCore({
      schemaVersion: 1,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      correlationId,
      actor: { kind: 'UI' },
      projectId,
      helperConversationLimit,
    })
    return projectSessionSnapshotSchema.parse(parseApplicationSuccess(response).data)
  }

  async #postCore(body: Readonly<Record<string, unknown>>): Promise<unknown> {
    try {
      return await this.#api.post(CREW_CORE_APPLICATION_PATH, body)
    } catch (error) {
      if (error instanceof CrewAppClientError) throw error
      throw new CrewAppClientError(
        'CONNECTION',
        'CORE_CONNECTION_UNAVAILABLE',
        'The local Vibe Helper Core is unavailable.',
        { cause: error },
      )
    }
  }
}

export interface CrewConversationMessage {
  readonly key: string
  readonly role: 'USER' | 'ASSISTANT'
  readonly content: string
}

export interface CrewProjectSessions {
  readonly builderSlotKey: string
  readonly helperSlotKey: string
  readonly builderMessages: readonly CrewConversationMessage[]
  readonly helperMessages: readonly CrewConversationMessage[]
}

export function builderSlotKey(projectId: string): string {
  return `vibe-helper-builder-${projectId}`
}

export function helperSlotKey(projectId: string): string {
  return `vibe-helper-helper-${projectId}`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSlotKeys(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) {
    throw new CrewAppClientError(
      'CONTRACT',
      'INVALID_SLOT_LIST',
      'Crew returned an invalid slot list.',
    )
  }
  return new Set(
    value.flatMap((slot) => (isRecord(slot) && typeof slot.key === 'string' ? [slot.key] : [])),
  )
}

function readMessages(value: unknown): readonly CrewConversationMessage[] {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new CrewAppClientError(
      'CONTRACT',
      'INVALID_SLOT_HISTORY',
      'Crew returned an invalid conversation history.',
    )
  }
  return value.messages
    .flatMap((message, index): CrewConversationMessage[] => {
      if (!isRecord(message) || typeof message.content !== 'string') return []
      const key =
        typeof message.id === 'string'
          ? message.id
          : `${index}-${message.role === 'user' ? 'user' : 'assistant'}-${message.content.length}`
      if (message.role === 'user') {
        return [{ key, role: 'USER', content: redactSensitiveText(message.content) }]
      }
      if (message.role === 'assistant' || message.role === 'streaming') {
        return [{ key, role: 'ASSISTANT', content: redactSensitiveText(message.content) }]
      }
      return []
    })
    .slice(-MAX_RESTORED_MESSAGES)
}

export class CrewSessionClient {
  readonly #api: CrewAppApi

  constructor(api: CrewAppApi) {
    this.#api = api
  }

  async restoreProject(projectId: string): Promise<CrewProjectSessions> {
    const builder = builderSlotKey(projectId)
    const helper = helperSlotKey(projectId)
    try {
      const slots = readSlotKeys(await this.#api.get(CHAT_SLOT_COLLECTION_PATH))
      const [builderMessages, helperMessages] = await Promise.all([
        this.#readHistoryIfPresent(slots, builder),
        this.#readHistoryIfPresent(slots, helper),
      ])
      return {
        builderSlotKey: builder,
        helperSlotKey: helper,
        builderMessages,
        helperMessages,
      }
    } catch (error) {
      if (error instanceof CrewAppClientError) throw error
      throw new CrewAppClientError(
        'CONNECTION',
        'CREW_SESSION_CONNECTION_UNAVAILABLE',
        'Crew conversation history is unavailable.',
        { cause: error },
      )
    }
  }

  async #readHistoryIfPresent(
    slots: ReadonlySet<string>,
    slotKey: string,
  ): Promise<readonly CrewConversationMessage[]> {
    if (!slots.has(slotKey)) return []
    return readMessages(await this.#api.get(`${CHAT_SLOT_COLLECTION_PATH}/${slotKey}?limit=100`))
  }
}
