import { describe, expect, it } from 'vitest'
import {
  composeNativeProtectedAnalystPrompt,
  composeNativeProtectedHelperPrompt,
} from '../src/native-protected-prompt.js'

describe('protected native prompt composition', () => {
  it('preserves the production Helper body byte for byte', () => {
    const rolePrompt = '# Helper role'
    const question = 'Why is the result immutable?'
    const context = { schemaVersion: 1, value: 'validated' }
    const expectedBody = [
      'Transport adaptation: native-builtin-helper/0.1.0. Deterministic Core has already ' +
        'executed the exact read-only get_helper_context query for this Project, Task, ' +
        'Decision and user question. The validated result follows. You have no native ' +
        'tools; do not claim you called a tool yourself. If freshness is MISSING or STALE, ' +
        'state the limitation. Do not infer unavailable code or change project state.',
      `Exact user question: ${question}`,
      'Context refresh request status: NOT_NEEDED.',
      `Validated Core Helper context JSON: ${JSON.stringify(context)}`,
    ].join('\n\n')
    expect(
      composeNativeProtectedHelperPrompt({
        rolePrompt,
        question,
        refreshStatus: 'NOT_NEEDED',
        context,
      }),
    ).toBe(`${rolePrompt}\n\n${expectedBody}`)
  })

  it('preserves the production Analyst body byte for byte', () => {
    const rolePrompt = '# Analyst role'
    const message = '{"episode":"validated"}'
    const expectedBody = [
      'Transport adaptation: native-builtin-analyst/0.1.2. You have no native tools. ' +
        'Only the Core-provided Episode context below is evidence; do not infer a user ' +
        'statement from Agent text. Return the prompt-specified JSON shape.',
      message,
      'Final schema check: every proposal.concept.originalExpression is a required, ' +
        'nonempty string copied as a short phrase from a direct USER Event (at most 120 ' +
        'characters). Never omit it or substitute Agent text. Drop any proposal without ' +
        'such a phrase. A request for explanation or comparison alone is not the user’s ' +
        'own claim, reason, prediction, or choice; if none exists, return proposals: [] ' +
        'and noEvidenceReason. Preserve any direct user claim inside a question.',
    ].join('\n\n')
    expect(composeNativeProtectedAnalystPrompt({ rolePrompt, message })).toBe(
      `${rolePrompt}\n\n${expectedBody}`,
    )
  })

  it('labels synthetic inputs without claiming a Core query, mutation, or human Evidence', () => {
    const helper = composeNativeProtectedHelperPrompt({
      rolePrompt: '# Helper role',
      question: 'Synthetic question',
      refreshStatus: 'NOT_NEEDED',
      context: { synthetic: true },
      provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT',
    })
    const analyst = composeNativeProtectedAnalystPrompt({
      rolePrompt: '# Analyst role',
      message: '{"synthetic":true}',
      provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT',
    })
    for (const prompt of [helper, analyst]) {
      expect(prompt).toContain('SYNTHETIC_REDACTED_EVAL_INPUT')
      expect(prompt).toContain('Core did not')
    }
    expect(helper).toContain('no Core state is read or changed')
    expect(helper).toContain('Synthetic validated Helper context JSON:')
    expect(analyst).toContain('do not claim that the result is human learning or durable Evidence')
  })
})
