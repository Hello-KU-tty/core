import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  DISCOVERY_MODEL_ID,
  selectDiscoveryHaikuModel,
  selectBuiltinAnalystHaikuModel,
  selectBuiltinAnalystModel,
  availableBuiltinAnalystModels,
} = require('../../examples/kiro-native-host/native-model.cjs')

const sessionId = 'session_synthetic_0001'
const modeId = 'vibe-native-discovery-deadbeef'

function configOptions(currentModel = 'auto', models = ['auto', DISCOVERY_MODEL_ID]) {
  return [
    { type: 'select', id: 'mode', currentValue: modeId, options: [{ value: modeId }] },
    {
      type: 'select',
      id: 'model',
      currentValue: currentModel,
      options: models.map((value) => ({ value, name: value })),
    },
  ]
}

function harness(overrides: Record<string, unknown> = {}) {
  const client = {
    ownsSession: vi.fn((id: string) => id === sessionId),
    selectModel: vi.fn(async () => ({ configOptions: configOptions(DISCOVERY_MODEL_ID) })),
  }
  return {
    client,
    sessionId,
    modeId,
    modeSelection: { configOptions: configOptions() },
    ...overrides,
  }
}

async function codeFrom(input: Parameters<typeof selectDiscoveryHaikuModel>[0]) {
  try {
    await selectDiscoveryHaikuModel(input)
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? null
  }
}

describe('selectDiscoveryHaikuModel', () => {
  it('selects the exact available ID only on the owned session after mode ACK', async () => {
    const input = harness()
    await expect(selectDiscoveryHaikuModel(input)).resolves.toBe('claude-haiku-4.5')
    expect(input.client.ownsSession).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect(input.client.selectModel).toHaveBeenCalledExactlyOnceWith(sessionId, DISCOVERY_MODEL_ID)
  })

  it('rejects an unowned session and a non-Discovery role without selecting a model', async () => {
    const unowned = harness({ sessionId: 'session_other_0001' })
    expect(await codeFrom(unowned)).toBe('NATIVE_MODEL_SESSION_UNOWNED')
    expect(unowned.client.selectModel).not.toHaveBeenCalled()

    const wrongRole = harness({ modeId: 'vibe-native-builder-deadbeef' })
    expect(await codeFrom(wrongRole)).toBe('NATIVE_MODEL_SESSION_UNOWNED')
    expect(wrongRole.client.selectModel).not.toHaveBeenCalled()
  })

  it('requires mode selection ACK before inspecting model options', async () => {
    const input = harness({
      modeSelection: {
        configOptions: configOptions().map((option) =>
          option.id === 'mode' ? { ...option, currentValue: 'default' } : option,
        ),
      },
    })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_MODE_UNCONFIRMED')
    expect(input.client.selectModel).not.toHaveBeenCalled()
  })

  it('rejects a missing mode ACK configOptions list without selecting a model', async () => {
    const input = harness({ modeSelection: { configOptions: undefined } })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_MODE_UNCONFIRMED')
    expect(input.client.selectModel).not.toHaveBeenCalled()
  })

  it('rejects unavailable Haiku instead of falling back to Auto or matching a display name', async () => {
    const input = harness({
      modeSelection: {
        configOptions: [
          configOptions()[0],
          {
            type: 'select',
            id: 'model',
            currentValue: 'auto',
            options: [
              { value: 'auto', name: 'Auto' },
              { value: 'some-other-id', name: 'Claude Haiku 4.5' },
            ],
          },
        ],
      },
    })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_UNAVAILABLE')
    expect(input.client.selectModel).not.toHaveBeenCalled()
  })

  it('rejects duplicate exact model choices as ambiguous', async () => {
    const input = harness({
      modeSelection: {
        configOptions: configOptions('auto', [DISCOVERY_MODEL_ID, DISCOVERY_MODEL_ID]),
      },
    })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_OPTION_AMBIGUOUS')
    expect(input.client.selectModel).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'missing model option', configOptions: [configOptions()[0]] },
    { label: 'duplicate model option', configOptions: [...configOptions(), configOptions()[1]] },
    {
      label: 'wrong model type',
      configOptions: [configOptions()[0], { ...configOptions()[1], type: 'input' }],
    },
    {
      label: 'missing model choices',
      configOptions: [configOptions()[0], { ...configOptions()[1], options: undefined }],
    },
    {
      label: 'malformed model choice',
      configOptions: [
        configOptions()[0],
        { ...configOptions()[1], options: [{ name: 'no value' }] },
      ],
    },
  ])('rejects $label as malformed', async ({ configOptions: options }) => {
    const input = harness({ modeSelection: { configOptions: options } })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_OPTIONS_MALFORMED')
    expect(input.client.selectModel).not.toHaveBeenCalled()
  })

  it('rejects a model ACK that kept Auto and does not retry with fallback', async () => {
    const input = harness()
    input.client.selectModel.mockResolvedValue({ configOptions: configOptions('auto') })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_SELECTION_UNCONFIRMED')
    expect(input.client.selectModel).toHaveBeenCalledTimes(1)
  })

  it('rejects a model ACK that changed the selected role', async () => {
    const input = harness()
    input.client.selectModel.mockResolvedValue({
      configOptions: configOptions(DISCOVERY_MODEL_ID).map((option) =>
        option.id === 'mode' ? { ...option, currentValue: 'default' } : option,
      ),
    })
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_SELECTION_UNCONFIRMED')
  })

  it('rejects RPC failure without trying a different model', async () => {
    const input = harness()
    input.client.selectModel.mockRejectedValue(new Error('synthetic RPC failure'))
    expect(await codeFrom(input)).toBe('NATIVE_MODEL_SELECTION_FAILED')
    expect(input.client.selectModel).toHaveBeenCalledTimes(1)
  })
})

describe('selectBuiltinAnalystHaikuModel', () => {
  const builtinOptions = (currentModel = 'auto') =>
    configOptions(currentModel).map((option) =>
      option.id === 'mode'
        ? { ...option, currentValue: 'vibe', options: [{ value: 'vibe' }] }
        : option,
    )

  it('selects Haiku on the owned built-in Analyst session after mode ACK', async () => {
    const input = harness({ modeId: 'vibe', modeSelection: { configOptions: builtinOptions() } })
    input.client.selectModel.mockResolvedValue({
      configOptions: builtinOptions(DISCOVERY_MODEL_ID),
    })
    await expect(selectBuiltinAnalystHaikuModel(input)).resolves.toBe(DISCOVERY_MODEL_ID)
    expect(input.client.selectModel).toHaveBeenCalledExactlyOnceWith(sessionId, DISCOVERY_MODEL_ID)
  })

  it('rejects a role switch or unavailable exact model without fallback', async () => {
    const wrongMode = harness({ modeId: 'vibe', modeSelection: { configOptions: configOptions() } })
    await expect(selectBuiltinAnalystHaikuModel(wrongMode)).rejects.toMatchObject({
      code: 'NATIVE_MODEL_MODE_UNCONFIRMED',
    })
    expect(wrongMode.client.selectModel).not.toHaveBeenCalled()

    const unavailable = harness({
      modeId: 'vibe',
      modeSelection: {
        configOptions: builtinOptions().map((option) =>
          option.id === 'model' ? { ...option, options: [{ value: 'auto' }] } : option,
        ),
      },
    })
    await expect(selectBuiltinAnalystHaikuModel(unavailable)).rejects.toMatchObject({
      code: 'NATIVE_MODEL_UNAVAILABLE',
    })
    expect(unavailable.client.selectModel).not.toHaveBeenCalled()
  })
})

describe('pinned protected Analyst model comparison', () => {
  const sonnetId = 'claude-sonnet-4.5'
  const builtinOptions = (currentModel = 'auto', models = ['auto', DISCOVERY_MODEL_ID, sonnetId]) =>
    configOptions(currentModel, models).map((option) =>
      option.id === 'mode'
        ? { ...option, currentValue: 'vibe', options: [{ value: 'vibe' }] }
        : option,
    )

  it('reveals only unique exact Haiku/Sonnet IDs from the owned model catalog', () => {
    expect(availableBuiltinAnalystModels(builtinOptions())).toEqual([DISCOVERY_MODEL_ID, sonnetId])
    expect(availableBuiltinAnalystModels(builtinOptions('auto', ['auto', 'other-model']))).toEqual(
      [],
    )
    expect(() =>
      availableBuiltinAnalystModels(builtinOptions('auto', [sonnetId, sonnetId])),
    ).toThrow('NATIVE_MODEL_OPTION_AMBIGUOUS')
  })

  it('selects only an exact available Sonnet on the owned built-in session with ACK', async () => {
    const input = harness({ modeId: 'vibe', modeSelection: { configOptions: builtinOptions() } })
    input.client.selectModel.mockResolvedValue({ configOptions: builtinOptions(sonnetId) })
    await expect(selectBuiltinAnalystModel(input, sonnetId)).resolves.toBe(sonnetId)
    expect(input.client.selectModel).toHaveBeenCalledExactlyOnceWith(sessionId, sonnetId)
  })

  it('rejects unsupported or absent IDs without falling back to Auto', async () => {
    const input = harness({ modeId: 'vibe', modeSelection: { configOptions: builtinOptions() } })
    await expect(selectBuiltinAnalystModel(input, 'auto')).rejects.toMatchObject({
      code: 'NATIVE_MODEL_UNSUPPORTED',
    })
    expect(input.client.selectModel).not.toHaveBeenCalled()
    const missing = harness({
      modeId: 'vibe',
      modeSelection: { configOptions: builtinOptions('auto', ['auto', DISCOVERY_MODEL_ID]) },
    })
    await expect(selectBuiltinAnalystModel(missing, sonnetId)).rejects.toMatchObject({
      code: 'NATIVE_MODEL_UNAVAILABLE',
    })
    expect(missing.client.selectModel).not.toHaveBeenCalled()
  })
})
