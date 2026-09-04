import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourcePath = join(workspaceRoot, 'docs', 'agent-prompts', 'discovery.md')
const builderSourcePath = join(workspaceRoot, 'docs', 'agent-prompts', 'builder.md')
const helperSourcePath = join(workspaceRoot, 'docs', 'agent-prompts', 'helper.md')
const agentsDirectory = join(workspaceRoot, 'agents')
const expectedVersion = '1.1.9'
const discoveryModel = process.env.VIBE_HELPER_DISCOVERY_MODEL ?? 'claude-haiku-4.5'
const specModel = process.env.VIBE_HELPER_SPEC_MODEL ?? discoveryModel
for (const model of [discoveryModel, specModel]) {
  if (!['claude-haiku-4.5', 'gpt-5.6-terra', 'auto'].includes(model)) {
    throw new TypeError(`Unsupported Discovery model: ${model}`)
  }
}
const prompt = await readFile(sourcePath, 'utf8')
const builderPrompt = await readFile(builderSourcePath, 'utf8')
const helperPrompt = await readFile(helperSourcePath, 'utf8')
const version = prompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1]

if (version !== expectedVersion) {
  throw new TypeError(
    `Discovery prompt version mismatch: expected ${expectedVersion}, received ${version ?? 'none'}`,
  )
}
if (builderPrompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1] !== '1.1.0') {
  throw new TypeError('Builder prompt version mismatch: expected 1.1.0')
}
if (helperPrompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1] !== '1.0.0') {
  throw new TypeError('Helper prompt version mismatch: expected 1.0.0')
}

function sectionStart(heading) {
  const index = prompt.indexOf(`\n${heading}\n`)
  if (index < 0) throw new TypeError(`Discovery prompt is missing ${heading}`)
  return index + 1
}

const previewStart = sectionStart('## 빠른 PREVIEW turn')
const enrichmentStart = sectionStart('## ENRICHMENT turn')
const candidateStart = sectionStart('## 후보 생성')
const mergeStart = sectionStart('## 빠른 MERGE turn')
const learningSpecStart = sectionStart('## Learning Spec')
const specFastStart = sectionStart('## 빠른 SPEC turn')
const specRecoveryStart = sectionStart('## SPEC recovery turn')
const expressionStart = sectionStart('## 표현 방식')
const identity = prompt.slice(0, sectionStart('## 최우선 원칙')).trimEnd()
const specQuality = prompt.slice(learningSpecStart, specFastStart).trim()
const expressionAndSafety = prompt.slice(expressionStart).trim()
const phasePrompts = {
  preview: `${identity}\n\n${prompt.slice(previewStart, enrichmentStart).trim()}\n`,
  enrichment: `${identity}\n\n${prompt.slice(enrichmentStart, candidateStart).trim()}\n`,
  round: `${prompt.slice(0, previewStart).trimEnd()}\n\n${prompt.slice(candidateStart, learningSpecStart).trim()}\n\n${expressionAndSafety}\n`,
  merge: `${prompt.slice(0, previewStart).trimEnd()}\n\n${prompt.slice(mergeStart, learningSpecStart).trim()}\n\n${expressionAndSafety}\n`,
  spec: `${identity}\n\n${specQuality}\n\n${prompt.slice(specFastStart, specRecoveryStart).trim()}\n\n모든 구조화된 결과는 제공된 Core tool로 제출하라.\n`,
  specRecovery: `${identity}\n\n${specQuality}\n\n${prompt.slice(specRecoveryStart, expressionStart).trim()}\n\n모든 구조화된 결과는 제공된 Core tool로 제출하라.\n`,
}

const common = {
  model: discoveryModel,
  includeMcpJson: false,
  mcpServers: {},
  managedToolPolicy: {
    exclude: ['spawn_run', 'cron_add', 'cron_remove', 'cron_update', 'cron_remove_all', 'task_run'],
  },
}
const agents = [
  {
    ...common,
    name: 'vibe-helper-discovery-preview',
    description: 'Stores ten lightweight Candidate previews through the bounded Discovery Core.',
    prompt: phasePrompts.preview,
    tools: ['@vibe-helper:discovery-preview-core'],
    allowedTools: ['@vibe-helper:discovery-preview-core'],
  },
  {
    ...common,
    name: 'vibe-helper-discovery-enrichment',
    description: 'Completes one fixed batch of Candidate previews without changing identity.',
    prompt: phasePrompts.enrichment,
    tools: ['@vibe-helper:discovery-enrichment-core'],
    allowedTools: ['@vibe-helper:discovery-enrichment-core'],
  },
  {
    ...common,
    name: 'vibe-helper-discovery-round',
    description: 'Generates and refines project Candidates through the bounded Discovery Core.',
    prompt: phasePrompts.round,
    tools: ['@vibe-helper:discovery-round-core'],
    allowedTools: ['@vibe-helper:discovery-round-core'],
  },
  {
    ...common,
    name: 'vibe-helper-discovery-merge',
    description: 'Merges selected project Candidates through Core-derived lineage metadata.',
    prompt: phasePrompts.merge,
    tools: ['@vibe-helper:discovery-merge-core'],
    allowedTools: ['@vibe-helper:discovery-merge-core'],
  },
  {
    ...common,
    model: specModel,
    name: 'vibe-helper-discovery-spec',
    description: 'Drafts and refines the selected project Learning Spec through Discovery Core.',
    prompt: phasePrompts.spec,
    tools: ['@vibe-helper:discovery-spec-core'],
    allowedTools: ['@vibe-helper:discovery-spec-core'],
  },
  {
    ...common,
    model: specModel,
    name: 'vibe-helper-discovery-spec-recovery',
    description: 'Recovers missing Spec context, then drafts or refines the Learning Spec.',
    prompt: phasePrompts.specRecovery,
    tools: ['@vibe-helper:discovery-spec-recovery-core'],
    allowedTools: ['@vibe-helper:discovery-spec-recovery-core'],
  },
  {
    name: 'vibe-helper-builder',
    description: 'Builds the confirmed TypeScript project inside its Core-assigned workspace.',
    prompt: builderPrompt,
    includeMcpJson: false,
    mcpServers: {},
    tools: ['fs_read', 'fs_write', 'execute_bash', '@vibe-helper:builder-core'],
    allowedTools: ['fs_read', 'fs_write', '@vibe-helper:builder-core'],
    toolsSettings: {
      read: { allowedPaths: ['./**'], deniedPaths: ['.kiro/**'] },
      write: { allowedPaths: ['./**'], deniedPaths: ['.kiro/**'] },
      shell: {
        allowedCommands: [
          'node --test*',
          'pnpm test*',
          'pnpm rebuild esbuild',
          'pnpm run *',
          'pnpm install --frozen-lockfile',
          'npm test*',
          'npm run *',
          'npm install',
          'npm install --include=dev',
        ],
        deniedCommands: [],
        denyByDefault: true,
      },
    },
    hooks: {
      preToolUse: [
        {
          command:
            'node "$KIROCREW_HOME/apps/vibe-helper/apps/crew-backend/dist/builder-tool-guard.js" --app-generated-workspace',
        },
      ],
    },
    managedToolPolicy: common.managedToolPolicy,
  },
  {
    name: 'vibe-helper-helper',
    description: 'Explains the current validated Builder context without changing project state.',
    prompt: helperPrompt,
    includeMcpJson: false,
    mcpServers: {},
    tools: ['@vibe-helper:helper-core'],
    allowedTools: ['@vibe-helper:helper-core'],
    managedToolPolicy: common.managedToolPolicy,
  },
]

await mkdir(agentsDirectory, { recursive: true })
for (const agent of agents) {
  const outputPath = join(agentsDirectory, `${agent.name}.json`)
  await writeFile(outputPath, `${JSON.stringify(agent, null, 2)}\n`, { mode: 0o600 })
  process.stdout.write(`Generated ${outputPath}\n`)
}
