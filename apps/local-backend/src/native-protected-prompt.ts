export type NativeProtectedPromptProvenance = 'CORE_CONTEXT' | 'SYNTHETIC_REDACTED_EVAL_INPUT'

export interface NativeHelperPromptInput {
  readonly rolePrompt: string
  readonly question: string
  readonly refreshStatus: 'NOT_NEEDED' | 'REQUESTED' | 'UNAVAILABLE'
  readonly context: unknown
  readonly provenance?: NativeProtectedPromptProvenance
}

export interface NativeAnalystPromptInput {
  readonly rolePrompt: string
  readonly message: string
  readonly provenance?: NativeProtectedPromptProvenance
}

export function composeNativeProtectedHelperPrompt(input: NativeHelperPromptInput): string {
  const body =
    input.provenance === 'SYNTHETIC_REDACTED_EVAL_INPUT'
      ? [
          'Transport adaptation: standalone-native-helper-eval/0.1.0. ' +
            'SYNTHETIC_REDACTED_EVAL_INPUT follows for a read-only comparison. ' +
            'Deterministic Core did not execute get_helper_context for this synthetic cell, ' +
            'and no Core state is read or changed. You have no native tools; do not claim a ' +
            'tool call or treat this input as actual user Evidence.',
          `Exact user question: ${input.question}`,
          `Context refresh request status: ${input.refreshStatus}.`,
          `Synthetic validated Helper context JSON: ${JSON.stringify(input.context)}`,
        ].join('\n\n')
      : [
          'Transport adaptation: native-builtin-helper/0.1.0. Deterministic Core has already ' +
            'executed the exact read-only get_helper_context query for this Project, Task, ' +
            'Decision and user question. The validated result follows. You have no native ' +
            'tools; do not claim you called a tool yourself. If freshness is MISSING or STALE, ' +
            'state the limitation. Do not infer unavailable code or change project state.',
          `Exact user question: ${input.question}`,
          `Context refresh request status: ${input.refreshStatus}.`,
          `Validated Core Helper context JSON: ${JSON.stringify(input.context)}`,
        ].join('\n\n')
  return `${input.rolePrompt}\n\n${body}`
}

export function composeNativeProtectedAnalystPrompt(input: NativeAnalystPromptInput): string {
  const transport =
    input.provenance === 'SYNTHETIC_REDACTED_EVAL_INPUT'
      ? 'Transport adaptation: standalone-native-analyst-clean-eval/0.1.0. ' +
        'SYNTHETIC_REDACTED_EVAL_INPUT follows for a bounded no-tool comparison. ' +
        'Core did not create, query, accept, or store this synthetic Episode. ' +
        'Use only its direct USER Events as evidence, do not infer a user statement from ' +
        'Agent text, and do not claim that the result is human learning or durable Evidence. ' +
        'Return the prompt-specified JSON shape.'
      : 'Transport adaptation: native-builtin-analyst/0.1.2. You have no native tools. ' +
        'Only the Core-provided Episode context below is evidence; do not infer a user ' +
        'statement from Agent text. Return the prompt-specified JSON shape.'
  const body = [
    transport,
    input.message,
    'Final schema check: every proposal.concept.originalExpression is a required, ' +
      'nonempty string copied as a short phrase from a direct USER Event (at most 120 ' +
      'characters). Never omit it or substitute Agent text. Drop any proposal without ' +
      'such a phrase. A request for explanation or comparison alone is not the user’s ' +
      'own claim, reason, prediction, or choice; if none exists, return proposals: [] ' +
      'and noEvidenceReason. Preserve any direct user claim inside a question.',
  ].join('\n\n')
  return `${input.rolePrompt}\n\n${body}`
}
