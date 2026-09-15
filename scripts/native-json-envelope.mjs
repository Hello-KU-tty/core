// The pinned Kiro MCP parser drops empty JSON containers before the stdio
// server sees them. A string scalar preserves Agent-authored JSON verbatim;
// the original Core tool still validates the decoded object. Builder and
// Discovery mutation schemas contain required collections; the same pinned
// parser can erase explicit empty values in each.
const ENVELOPED_TOOLS = {
  BUILDER: new Set([
    'update_build_context',
    'request_user_decision',
    'apply_decision_result',
    'complete_task',
  ]),
  DISCOVERY: new Set([
    'submit_candidate_previews',
    'submit_candidate_round',
    'submit_candidate_merge',
    'submit_learning_spec',
  ]),
}
const MAX_BUILDER_INPUT_BYTES = 131_072
// A direct Discovery round may carry a 512 KiB candidate JSON string plus
// bounded metadata. The local HTTP/Core request limit is 2 MiB; this facade
// admits that existing 512 KiB field without claiming full 2 MiB equivalence.
const MAX_DISCOVERY_INPUT_BYTES = 1_048_576
const MAX_SCHEMA_BYTES = 65_536

export function isJsonEnvelopeTool(role, name) {
  return ENVELOPED_TOOLS[role]?.has(name) === true
}

export function advertiseJsonEnvelope(role, tool) {
  if (!isJsonEnvelopeTool(role, tool.name)) return tool
  const originalSchema = JSON.stringify(tool.inputSchema)
  if (!originalSchema || Buffer.byteLength(originalSchema, 'utf8') > MAX_SCHEMA_BYTES)
    throw new Error('BRIDGE_ENVELOPE_SCHEMA_TOO_LARGE')
  return {
    ...tool,
    description: `${tool.description ?? ''}\nSubmit the complete original arguments as one JSON string in inputJson. Preserve all required empty arrays and objects in that string. The Core validates the original schema below; this facade does not supply missing semantic values.\nOriginal input JSON Schema: ${originalSchema}`,
    inputSchema: {
      type: 'object',
      properties: {
        inputJson: {
          type: 'string',
          description:
            'JSON.stringify of the complete original tool argument object, including empty arrays and objects.',
        },
      },
      required: ['inputJson'],
      additionalProperties: false,
    },
  }
}

export function decodeBoundedJsonEnvelope(argumentsValue, maxInputBytes = MAX_BUILDER_INPUT_BYTES) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue))
    throw new Error('BRIDGE_ENVELOPE_WRAPPER_INVALID')
  const keys = Object.keys(argumentsValue)
  if (keys.some((key) => !['inputJson', '__tool_use_purpose', '_meta'].includes(key)))
    throw new Error('BRIDGE_ENVELOPE_WRAPPER_INVALID')
  if (
    Object.hasOwn(argumentsValue, '__tool_use_purpose') &&
    (typeof argumentsValue.__tool_use_purpose !== 'string' ||
      argumentsValue.__tool_use_purpose.length > 1_000)
  )
    throw new Error('BRIDGE_ENVELOPE_WRAPPER_INVALID')
  if (
    Object.hasOwn(argumentsValue, '_meta') &&
    (argumentsValue._meta === null ||
      typeof argumentsValue._meta !== 'object' ||
      Array.isArray(argumentsValue._meta))
  )
    throw new Error('BRIDGE_ENVELOPE_WRAPPER_INVALID')
  if (typeof argumentsValue.inputJson !== 'string') throw new Error('BRIDGE_ENVELOPE_JSON_REQUIRED')
  if (Buffer.byteLength(argumentsValue.inputJson, 'utf8') > maxInputBytes)
    throw new Error('BRIDGE_ENVELOPE_JSON_TOO_LARGE')
  let input
  try {
    input = JSON.parse(argumentsValue.inputJson)
  } catch {
    throw new Error('BRIDGE_ENVELOPE_JSON_INVALID')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('BRIDGE_ENVELOPE_OBJECT_REQUIRED')
  return input
}

export function decodeJsonEnvelope(role, name, argumentsValue) {
  if (!isJsonEnvelopeTool(role, name)) return { input: argumentsValue, decoded: false }
  const maxInputBytes = role === 'DISCOVERY' ? MAX_DISCOVERY_INPUT_BYTES : MAX_BUILDER_INPUT_BYTES
  return { input: decodeBoundedJsonEnvelope(argumentsValue, maxInputBytes), decoded: true }
}

export function envelopeFailureReceipt(role, name, argumentsValue, error) {
  const value = argumentsValue?.inputJson
  const inputJsonType =
    value === undefined
      ? 'missing'
      : value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : typeof value
  const code =
    typeof error?.message === 'string' && /^BRIDGE_ENVELOPE_[A-Z_]{1,80}$/.test(error.message)
      ? error.message
      : 'BRIDGE_ENVELOPE_UNKNOWN'
  return {
    event: 'NATIVE_JSON_ENVELOPE_REJECTED',
    role,
    toolName: name,
    code,
    inputJsonType,
    inputJsonBytes: typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : null,
  }
}
