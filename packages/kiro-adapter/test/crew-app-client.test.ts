import { describe, expect, it, vi } from 'vitest'

import {
  builderSlotKey,
  CREW_CORE_APPLICATION_PATH,
  CrewAppClientError,
  CrewCoreClient,
  CrewSessionClient,
  helperSlotKey,
  type CrewAppApi,
} from '../src/crew-app-client.js'

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const correlationId = 'corr_00000000-0000-4000-8000-000000000001'

describe('Crew browser-safe clients', () => {
  it('uses the fixed Core endpoint and validates the Project History response', async () => {
    const post = vi.fn(async () => ({
      success: true,
      data: { schemaVersion: 1, correlationId, projects: [] },
    }))
    const client = new CrewCoreClient({ get: vi.fn(), post })

    await expect(client.listProjects(correlationId)).resolves.toEqual({
      schemaVersion: 1,
      correlationId,
      projects: [],
    })
    expect(post).toHaveBeenCalledWith(CREW_CORE_APPLICATION_PATH, {
      schemaVersion: 1,
      kind: 'UI_LIST_PROJECTS',
      correlationId,
      actor: { kind: 'UI' },
      limit: 50,
    })
  })

  it('classifies Core permission failures without exposing a raw transport', async () => {
    const client = new CrewCoreClient({
      get: vi.fn(),
      post: vi.fn(async () => ({
        success: false,
        error: {
          schemaVersion: 1,
          kind: 'OPERATION_ERROR',
          category: 'PERMISSION',
          code: 'WORKSPACE_NOT_ASSIGNED',
          disposition: 'USER_ACTION_REQUIRED',
          message: 'Workspace is not assigned.',
          correlationId,
          issues: [],
          redactionStatus: 'VERIFIED_REDACTED',
        },
      })),
    })

    await expect(client.listProjects(correlationId)).rejects.toMatchObject({
      name: 'CrewAppClientError',
      category: 'PERMISSION',
      code: 'WORKSPACE_NOT_ASSIGNED',
    })
  })

  it('restores deterministic Builder and Helper slots and redacts returned history', async () => {
    const builder = builderSlotKey(projectId)
    const helper = helperSlotKey(projectId)
    const api: CrewAppApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/api/chat/slots') return [{ key: builder }, { key: helper }]
        if (path.includes(builder)) {
          return {
            messages: [
              { role: 'user', content: 'token=synthetic-secret-value' },
              { role: 'assistant', content: 'Use /Users/example/private/project.ts.' },
            ],
          }
        }
        return { messages: [{ role: 'assistant', content: 'Review the pending decision.' }] }
      }),
      post: vi.fn(),
    }

    await expect(new CrewSessionClient(api).restoreProject(projectId)).resolves.toEqual({
      builderSlotKey: builder,
      helperSlotKey: helper,
      builderMessages: [
        { key: '0-user-28', role: 'USER', content: 'token=[REDACTED]' },
        { key: '1-assistant-38', role: 'ASSISTANT', content: 'Use [REDACTED_PATH]' },
      ],
      helperMessages: [
        {
          key: '0-assistant-28',
          role: 'ASSISTANT',
          content: 'Review the pending decision.',
        },
      ],
    })
  })

  it('keeps missing slots empty and reports disconnected Crew history', async () => {
    const empty = new CrewSessionClient({ get: vi.fn(async () => []), post: vi.fn() })
    await expect(empty.restoreProject(projectId)).resolves.toMatchObject({
      builderMessages: [],
      helperMessages: [],
    })

    const disconnected = new CrewSessionClient({
      get: vi.fn(async () => {
        throw new Error('offline')
      }),
      post: vi.fn(),
    })
    await expect(disconnected.restoreProject(projectId)).rejects.toBeInstanceOf(CrewAppClientError)
  })
})
