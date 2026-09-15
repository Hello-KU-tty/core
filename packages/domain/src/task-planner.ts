import {
  type BuilderTask,
  builderTaskSchema,
  type LearningSpecRevision,
  type PersonalizationTrace,
  type Project,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, rejected } from './result.js'

const OPERATION = 'BUILDER_TASK_PLAN'
const MAX_TITLE = 120
const MAX_LONG_TEXT = 4_000
const MAX_SHORT_TEXT = 240

export interface PlanBuilderTaskInput {
  readonly project: Project
  readonly spec: LearningSpecRevision
  readonly taskId: string
  readonly sequence: number
  readonly now: string
}

export interface PlanFinalUpgradeTaskInput {
  readonly project: Project
  readonly spec: LearningSpecRevision
  readonly sourceTask: BuilderTask
  readonly personalization: PersonalizationTrace
  readonly userGoal: string
  readonly taskId: string
  readonly now: string
}

function uniqueNormalized(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const key = value.trim().toLocaleLowerCase('en-US')
    if (!seen.has(key)) {
      seen.add(key)
      result.push(value.trim())
    }
  }
  return result
}

function pack(values: readonly string[], prefix: string, limit: number): string[] {
  const chunks: string[] = []
  let current = prefix
  for (const value of values) {
    const separator = current === prefix ? '' : '; '
    if (`${current}${separator}${value}`.length > limit) {
      if (current !== prefix) chunks.push(current)
      current = `${prefix}${value}`
    } else {
      current = `${current}${separator}${value}`
    }
  }
  if (current !== prefix) chunks.push(current)
  return chunks
}

function appendBoundedTitle(title: string, suffix: string): string {
  const limit = MAX_TITLE - suffix.length
  let prefix = ''
  for (const character of title) {
    if (prefix.length + character.length > limit) break
    prefix += character
  }
  return `${prefix.trimEnd()}${suffix}`
}

function goalStatement(prefix: string, userGoal: string, fallback: string): string {
  const statement = `${prefix}${userGoal}`
  return statement.length <= MAX_LONG_TEXT ? statement : fallback
}

export function planBuilderTask(input: PlanBuilderTaskInput): DomainResult<BuilderTask> {
  const entityIds = [input.project.id, input.spec.id]
  if (
    input.spec.status !== 'CONFIRMED' ||
    input.spec.projectId !== input.project.id ||
    input.spec.correlationId !== input.project.correlationId ||
    input.project.status !== 'SPEC_REVIEW'
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'BUILDER_TASK_CONFIRMED_SPEC_REQUIRED',
      entityIds,
    })
  }

  const expectedConcepts = uniqueNormalized(
    input.spec.scope
      .filter((item) => item.category === 'LEARNER_FOCUS')
      .flatMap((item) => item.conceptNames),
  )
  if (expectedConcepts.length > 20) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'BUILDER_TASK_EXPECTED_CONCEPT_LIMIT_EXCEEDED',
      entityIds,
    })
  }

  const agentSupport = uniqueNormalized(
    input.spec.scope.filter((item) => item.category === 'AGENT_SUPPORT').map((item) => item.title),
  )
  const excludedWork = pack(
    uniqueNormalized(
      input.spec.scope.filter((item) => item.category === 'EXCLUDED').map((item) => item.title),
    ),
    '',
    MAX_SHORT_TEXT,
  )
  if (excludedWork.length > 30) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'BUILDER_TASK_EXCLUDED_WORK_LIMIT_EXCEEDED',
      entityIds,
    })
  }

  const requirements = [
    ...input.spec.mvpFeatures,
    'Use TypeScript for the generated project runtime.',
    ...pack(agentSupport, 'Agent-supported implementation scope: ', MAX_LONG_TEXT),
    ...pack(input.spec.deploymentConstraints, 'Deployment constraints: ', MAX_LONG_TEXT),
    'Write .vibe-helper/result.json for the compiled loopback web entry and health path.',
  ]
  const acceptanceCriteria = [
    ...input.spec.mvpFeatures.map((feature, index) => ({
      key: `feature_${String(index + 1).padStart(2, '0')}`,
      description: `Implement and verify this MVP feature: ${feature}`,
    })),
    {
      key: 'local_result',
      description: 'The generated TypeScript project runs locally with a documented command.',
    },
    {
      key: 'tests_pass',
      description: 'The generated project automated tests pass without hiding failures.',
    },
  ]

  const parsed = builderTaskSchema.safeParse({
    schemaVersion: 1,
    id: input.taskId,
    projectId: input.project.id,
    learningSpecId: input.spec.id,
    learningSpecRevision: input.spec.revision,
    correlationId: input.spec.correlationId,
    revision: 1,
    title: input.project.title,
    productGoal: input.spec.productPurpose,
    requirements,
    acceptanceCriteria,
    expectedConcepts,
    excludedWork,
    prerequisiteTaskIds: [],
    expectedDecisionCategories: uniqueNormalized(
      input.spec.expectedDecisions.map((decision) => decision.category),
    ),
    sequence: input.sequence,
    status: 'PENDING',
    createdAt: input.now,
    updatedAt: input.now,
    source: { kind: 'CORE' },
    redactionStatus: input.spec.redactionStatus,
  })
  if (!parsed.success) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'BUILDER_TASK_PLAN_INVALID',
      entityIds,
    })
  }

  return applied(parsed.data, {
    operation: OPERATION,
    reasonCode: 'BUILDER_TASK_PLANNED',
    entityIds: [...entityIds, parsed.data.id],
    after: parsed.data.status,
  })
}

export function planFinalUpgradeTask(input: PlanFinalUpgradeTaskInput): DomainResult<BuilderTask> {
  const entityIds = [input.project.id, input.spec.id, input.sourceTask.id, input.personalization.id]
  if (
    input.project.status !== 'BUILDING' ||
    input.spec.status !== 'CONFIRMED' ||
    input.spec.projectId !== input.project.id ||
    input.sourceTask.projectId !== input.project.id ||
    input.sourceTask.status !== 'COMPLETED' ||
    input.sourceTask.sequence !== 1 ||
    input.sourceTask.finalUpgrade !== undefined ||
    input.personalization.projectId !== input.project.id ||
    input.personalization.mode !== 'EVIDENCE_AWARE' ||
    input.personalization.target.kind !== 'HELPER_TURN' ||
    input.personalization.target.taskId !== input.sourceTask.id
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'FINAL_UPGRADE_EVIDENCE_REQUIRED',
      entityIds,
    })
  }
  const userGoal = input.userGoal.trim()
  const expectedConcepts = uniqueNormalized(input.sourceTask.expectedConcepts).slice(0, 20)
  const parsed = builderTaskSchema.safeParse({
    schemaVersion: 1,
    id: input.taskId,
    projectId: input.project.id,
    learningSpecId: input.spec.id,
    learningSpecRevision: input.spec.revision,
    correlationId: input.project.correlationId,
    revision: 1,
    title: appendBoundedTitle(input.project.title, ' 개선'),
    productGoal: userGoal,
    requirements: [
      goalStatement(
        'Implement the user-selected improvement: ',
        userGoal,
        'Implement the user-selected improvement described in productGoal.',
      ),
      'Preserve the working MVP unless the user explicitly changes its behavior.',
      'Use TypeScript for the generated project runtime.',
      'Update .vibe-helper/result.json when the compiled loopback web entry changes.',
    ],
    acceptanceCriteria: [
      {
        key: 'user_selected_improvement',
        description: goalStatement(
          'Implement and verify the selected improvement: ',
          userGoal,
          'Implement and verify the user-selected improvement described in productGoal.',
        ),
      },
      {
        key: 'local_result',
        description: 'The updated TypeScript project runs through the local result manifest.',
      },
      {
        key: 'tests_pass',
        description: 'The updated generated project tests pass without hiding failures.',
      },
    ],
    expectedConcepts,
    excludedWork: input.sourceTask.excludedWork,
    prerequisiteTaskIds: [input.sourceTask.id],
    expectedDecisionCategories: input.sourceTask.expectedDecisionCategories,
    finalUpgrade: {
      sourceTaskId: input.sourceTask.id,
      personalizationTraceId: input.personalization.id,
      userGoal,
    },
    sequence: 2,
    status: 'PENDING',
    createdAt: input.now,
    updatedAt: input.now,
    source: { kind: 'CORE' },
    redactionStatus: 'VERIFIED_REDACTED',
  })
  if (!parsed.success) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'FINAL_UPGRADE_PLAN_INVALID',
      entityIds,
    })
  }
  return applied(parsed.data, {
    operation: OPERATION,
    reasonCode: 'FINAL_UPGRADE_TASK_PLANNED',
    entityIds: [...entityIds, parsed.data.id],
    after: parsed.data.status,
  })
}
