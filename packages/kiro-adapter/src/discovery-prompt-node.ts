import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  createDiscoveryAgentDefinition,
  type DiscoveryAgentDefinition,
  DISCOVERY_PROMPT_SOURCE,
} from './discovery-agent.js'

export async function loadDiscoveryAgentDefinition(
  repositoryRoot: string,
): Promise<DiscoveryAgentDefinition> {
  const promptPath = resolve(repositoryRoot, DISCOVERY_PROMPT_SOURCE)
  const prompt = await readFile(promptPath, 'utf8')
  return createDiscoveryAgentDefinition(prompt)
}
