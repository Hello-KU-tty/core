import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  createHelperAgentDefinition,
  type HelperAgentDefinition,
  HELPER_PROMPT_SOURCE,
} from './helper-agent.js'

export async function loadHelperAgentDefinition(
  repositoryRoot: string,
): Promise<HelperAgentDefinition> {
  const prompt = await readFile(join(repositoryRoot, HELPER_PROMPT_SOURCE), 'utf8')
  return createHelperAgentDefinition(prompt)
}
