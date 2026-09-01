import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  createEvidenceAnalystAgentDefinition,
  type EvidenceAnalystAgentDefinition,
  EVIDENCE_ANALYST_PROMPT_SOURCE,
} from './evidence-analyst-agent.js'

export async function loadEvidenceAnalystAgentDefinition(
  repositoryRoot: string,
): Promise<EvidenceAnalystAgentDefinition> {
  const prompt = await readFile(join(repositoryRoot, EVIDENCE_ANALYST_PROMPT_SOURCE), 'utf8')
  return createEvidenceAnalystAgentDefinition(prompt)
}
