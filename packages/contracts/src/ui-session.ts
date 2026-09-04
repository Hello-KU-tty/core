import { z } from 'zod'

import { episodeStatusSchema } from './activity.js'
import { discoveryContextSchema } from './agent-contracts.js'
import { builderTaskSchema, decisionRequestSchema, liveProjectContextSchema } from './build.js'
import {
  discoverySessionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from './discovery.js'
import { learningSpecRevisionSchema } from './learning-spec.js'
import {
  conversationIdSchema,
  correlationIdSchema,
  decisionIdSchema,
  episodeIdSchema,
  nonEmptyTextSchema,
  schemaVersionSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'

export const crewAppSurfaceSchema = z.enum(['DISCOVERY', 'SPEC', 'BUILD'])

export const helperConversationSummarySchema = z.strictObject({
  conversationId: conversationIdSchema,
  episodeId: episodeIdSchema,
  taskId: taskIdSchema,
  decisionId: decisionIdSchema.optional(),
  status: episodeStatusSchema,
  startedAt: utcTimestampSchema,
  endedAt: utcTimestampSchema.optional(),
  redactedUserExcerpts: z.array(nonEmptyTextSchema).max(5),
  helperResponseSummaries: z.array(nonEmptyTextSchema).max(5),
})

export const projectHistoryItemSchema = z.strictObject({
  project: projectSchema,
  suggestedSurface: crewAppSurfaceSchema,
  activeTask: builderTaskSchema.nullable(),
  pendingDecisionCount: z.int().nonnegative().max(100),
  currentContextVersion: z.int().positive().nullable(),
  helperConversationCount: z.int().nonnegative(),
})

export const projectHistorySchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  projects: z.array(projectHistoryItemSchema).max(100),
})

export const projectSessionSnapshotSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  project: projectSchema,
  suggestedSurface: crewAppSurfaceSchema,
  discoverySession: discoverySessionSchema.nullable(),
  discoveryContext: discoveryContextSchema.nullable(),
  selectedCandidate: projectCandidateRevisionSchema.nullable(),
  learningSpec: learningSpecRevisionSchema.nullable(),
  activeTask: builderTaskSchema.nullable(),
  currentTask: builderTaskSchema.nullable(),
  liveContext: liveProjectContextSchema.nullable(),
  pendingDecisions: z.array(decisionRequestSchema).max(100),
  helperConversations: z.array(helperConversationSummarySchema).max(20),
})

export type CrewAppSurface = z.infer<typeof crewAppSurfaceSchema>
export type HelperConversationSummary = z.infer<typeof helperConversationSummarySchema>
export type ProjectHistoryItem = z.infer<typeof projectHistoryItemSchema>
export type ProjectHistory = z.infer<typeof projectHistorySchema>
export type ProjectSessionSnapshot = z.infer<typeof projectSessionSnapshotSchema>
