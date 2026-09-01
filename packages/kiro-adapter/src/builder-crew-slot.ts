import { realpath, stat } from 'node:fs/promises'

const SLOT_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/

export interface CrewGatewayClient {
  post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
}

export class BuilderCrewSlotError extends Error {
  readonly code:
    | 'INVALID_SLOT_ID'
    | 'WORKSPACE_NOT_DIRECTORY'
    | 'WORKSPACE_BINDING_TOO_LATE'
    | 'WORKSPACE_NOT_BOUND'

  constructor(code: BuilderCrewSlotError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BuilderCrewSlotError'
    this.code = code
  }
}

export class BuilderCrewSlotBinding {
  readonly #client: CrewGatewayClient
  readonly #boundWorkspaces = new Map<string, string>()
  readonly #startedSlots = new Set<string>()

  constructor(client: CrewGatewayClient) {
    this.#client = client
  }

  async bindWorkspaceBeforeFirstMessage(slotId: string, workspace: string): Promise<string> {
    if (!SLOT_ID_PATTERN.test(slotId)) {
      throw new BuilderCrewSlotError('INVALID_SLOT_ID', 'Crew slot ID is invalid.')
    }
    if (this.#startedSlots.has(slotId)) {
      throw new BuilderCrewSlotError(
        'WORKSPACE_BINDING_TOO_LATE',
        'Builder workspace must be bound before the first message.',
      )
    }
    const canonical = await realpath(workspace)
    if (!(await stat(canonical)).isDirectory()) {
      throw new BuilderCrewSlotError(
        'WORKSPACE_NOT_DIRECTORY',
        'Builder workspace must be an existing directory.',
      )
    }
    await this.#client.post(`/api/chat/slots/${slotId}/project`, { project: canonical })
    this.#boundWorkspaces.set(slotId, canonical)
    return canonical
  }

  markFirstMessageDispatched(slotId: string): void {
    if (!this.#boundWorkspaces.has(slotId)) {
      throw new BuilderCrewSlotError(
        'WORKSPACE_NOT_BOUND',
        'Builder message dispatch requires a bound project workspace.',
      )
    }
    this.#startedSlots.add(slotId)
  }

  workspaceFor(slotId: string): string | null {
    return this.#boundWorkspaces.get(slotId) ?? null
  }
}
