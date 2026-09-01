import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BUILDER_PROMPT_SOURCE,
  createBuilderAgentDefinition,
  type BuilderAgentDefinition,
} from './builder-agent.js'

export async function loadBuilderAgentDefinition(
  repositoryRoot: string,
  guardCommand: string,
): Promise<BuilderAgentDefinition> {
  const promptPath = resolve(repositoryRoot, BUILDER_PROMPT_SOURCE)
  const prompt = await readFile(promptPath, 'utf8')
  return createBuilderAgentDefinition(prompt, { guardCommand })
}
