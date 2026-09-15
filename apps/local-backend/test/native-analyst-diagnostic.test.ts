import { describe, expect, it } from 'vitest'
import { describeNativeAnalystResult } from '../src/native-analyst-diagnostic.js'

describe('native Analyst metadata diagnostics', () => {
  it('reports only allowlisted shape facts and schema issue locations', () => {
    const result = describeNativeAnalystResult(
      JSON.stringify({
        schemaVersion: 1,
        episodeId: 'episode_00000000-0000-4000-8000-000000000001',
        episodeRevision: 1,
        correlationId: 'corr_00000000-0000-4000-8000-000000000002',
        proposals: [{ secretUserField: 'sensitive learner text' }],
        unexpectedPrivateKey: 'another secret',
      }),
    )
    expect(result).toMatchObject({
      form: 'JSON',
      topLevelType: 'object',
      schemaValid: false,
      unknownFieldCount: 1,
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|sensitive|unexpectedPrivateKey|learner text/)
    expect(JSON.stringify(result)).toContain('proposals')
  })

  it('distinguishes a valid fenced result from unparseable text without retaining the text', () => {
    const valid = JSON.stringify({
      schemaVersion: 1,
      episodeId: 'episode_00000000-0000-4000-8000-000000000001',
      episodeRevision: 1,
      correlationId: 'corr_00000000-0000-4000-8000-000000000002',
      proposals: [],
      noEvidenceReason: 'No independent learner evidence',
    })
    expect(describeNativeAnalystResult(`\`\`\`json\n${valid}\n\`\`\``)).toMatchObject({
      form: 'FENCED_JSON',
      schemaValid: true,
    })
    expect(describeNativeAnalystResult('private learner text')).toEqual({ form: 'UNPARSEABLE' })
  })
})
