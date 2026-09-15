// Native IDE transport for immutable Preview enrichment. The Agent authors only
// new detail fields; the six preview meaning fields come from the exact Core
// round. The original MCP tool and Core validators receive a complete input.
import { z } from '../packages/contracts/node_modules/zod/index.js'
import {
  candidateEnrichmentDraftSchema,
  candidatePreviewSchema,
  discoverySubmitCandidateEnrichmentsToolInputBaseSchema,
} from '../packages/contracts/dist/discovery.js'
import { decodeBoundedJsonEnvelope } from './native-json-envelope.mjs'

const IMMUTABLE_FIELDS = [
  'title',
  'summary',
  'coreInteraction',
  'appeal',
  'technologyNecessity',
  'generationTags',
]
const mutableCandidateSchema = candidateEnrichmentDraftSchema.omit(
  Object.fromEntries(IMMUTABLE_FIELDS.map((field) => [field, true])),
)
const nativeInputSchema = discoverySubmitCandidateEnrichmentsToolInputBaseSchema
  .omit({ candidates: true })
  .extend({ candidates: z.array(mutableCandidateSchema).min(1).max(10) })
const schemaText = JSON.stringify(z.toJSONSchema(nativeInputSchema))
if (Buffer.byteLength(schemaText, 'utf8') > 65_536)
  throw new Error('BRIDGE_ENRICHMENT_SCHEMA_TOO_LARGE')

export function isNativeEnrichmentTool(role, name) {
  return role === 'DISCOVERY' && name === 'submit_candidate_enrichments'
}

export function advertiseNativeEnrichment(role, tool) {
  if (!isNativeEnrichmentTool(role, tool.name)) return tool
  return {
    ...tool,
    description: `${tool.description ?? ''}\nSubmit the complete native enrichment arguments as one JSON string in inputJson. Each candidate must contain only candidateId and Agent-authored enrichment fields from the schema below. Do not include or rewrite title, summary, coreInteraction, appeal, technologyNecessity or generationTags: the bridge copies those exact immutable values from the staged Core Preview Round. FIRST and SECOND must each contain their assigned five Candidate IDs; SELECTED must contain only current Preview IDs. The original MCP tool and Core still validate the complete result.\nNative enrichment input JSON Schema: ${schemaText}`,
    inputSchema: {
      type: 'object',
      properties: {
        inputJson: {
          type: 'string',
          description:
            'JSON.stringify of the native enrichment input schema shown in the tool description.',
        },
      },
      required: ['inputJson'],
      additionalProperties: false,
    },
  }
}

export async function bindNativeEnrichment(binding, name, rawArguments, readContext) {
  if (!isNativeEnrichmentTool(binding.role, name)) return { input: rawArguments, bound: false }
  const rawInput = decodeBoundedJsonEnvelope(rawArguments)
  if (!Array.isArray(rawInput.candidates)) throw new Error('BRIDGE_ENRICHMENT_CANDIDATES_REQUIRED')
  for (const candidate of rawInput.candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      IMMUTABLE_FIELDS.some((field) => Object.hasOwn(candidate, field))
    )
      throw new Error('BRIDGE_ENRICHMENT_IMMUTABLE_FIELDS_FORBIDDEN')
  }
  const parsed = nativeInputSchema.safeParse(rawInput)
  if (!parsed.success) throw new Error('BRIDGE_ENRICHMENT_INPUT_INVALID')
  const input = parsed.data
  if (
    input.projectId !== binding.projectId ||
    input.discoverySessionId !== binding.discoverySessionId ||
    input.correlationId !== binding.correlationId
  )
    throw new Error('BRIDGE_ENRICHMENT_SCOPE_MISMATCH')
  const boundBatch = {
    ENRICH_FIRST: 'FIRST',
    ENRICH_SECOND: 'SECOND',
    ENRICH_SELECTED: 'SELECTED',
  }[binding.mode]
  if (!boundBatch || input.batch !== boundBatch) throw new Error('BRIDGE_ENRICHMENT_MODE_MISMATCH')
  if (
    !Array.isArray(binding.requestedCandidateIds) ||
    (boundBatch === 'SELECTED' && binding.requestedCandidateIds.length === 0) ||
    (boundBatch !== 'SELECTED' && binding.requestedCandidateIds.length !== 0)
  )
    throw new Error('BRIDGE_ENRICHMENT_BINDING_INVALID')

  // get_discovery_context is already validated by the role-bound Core MCP
  // endpoint; still validate the exact preview records before copying them.
  const context = await readContext()
  const previewResult = z
    .array(candidatePreviewSchema)
    .length(10)
    .safeParse(context?.previewRound?.previews)
  if (
    !previewResult.success ||
    new Set(previewResult.data.map((preview) => preview.candidateId)).size !== 10 ||
    new Set(previewResult.data.map((preview) => preview.position)).size !== 10
  )
    throw new Error('BRIDGE_ENRICHMENT_CONTEXT_INVALID')
  // Do not preempt Core's idempotency lookup with an ACTIVE/revision/round gate.
  // The persisted Preview remains available after a successful final batch.
  // An exact replay can then reach Core; a new stale key still fails Core's
  // original revision/status checks inside the transaction.
  if (
    context?.project?.id !== binding.projectId ||
    context?.session?.id !== binding.discoverySessionId ||
    context.session.correlationId !== binding.correlationId ||
    context.previewRound?.id !== input.previewRoundId ||
    context.previewRound.discoverySessionId !== binding.discoverySessionId ||
    context.previewRound.correlationId !== binding.correlationId
  )
    throw new Error('BRIDGE_ENRICHMENT_CONTEXT_STALE')

  const previews = previewResult.data.filter((preview) =>
    input.batch === 'FIRST'
      ? preview.position <= 5
      : input.batch === 'SECOND'
        ? preview.position > 5
        : true,
  )
  const byId = new Map(previews.map((preview) => [preview.candidateId, preview]))
  const suppliedIds = input.candidates.map((candidate) => candidate.candidateId)
  if (
    suppliedIds.length !== new Set(suppliedIds).size ||
    (input.batch !== 'SELECTED' && suppliedIds.length !== 5) ||
    (input.batch !== 'SELECTED' && byId.size !== 5) ||
    suppliedIds.some((id) => !byId.has(id)) ||
    (input.batch === 'SELECTED' &&
      (suppliedIds.length !== binding.requestedCandidateIds.length ||
        suppliedIds.some((id) => !binding.requestedCandidateIds.includes(id)))) ||
    (input.batch !== 'SELECTED' &&
      previews.some((preview) => !suppliedIds.includes(preview.candidateId)))
  )
    throw new Error('BRIDGE_ENRICHMENT_BATCH_INVALID')

  return {
    bound: true,
    batch: input.batch,
    candidateCount: suppliedIds.length,
    input: {
      ...input,
      candidates: input.candidates.map(({ candidateId, ...details }) => {
        const preview = byId.get(candidateId)
        return {
          candidateId,
          title: preview.title,
          summary: preview.summary,
          coreInteraction: preview.coreInteraction,
          appeal: preview.appeal,
          technologyNecessity: preview.technologyNecessity,
          generationTags: preview.generationTags,
          ...details,
        }
      }),
    },
  }
}

export { nativeInputSchema }
