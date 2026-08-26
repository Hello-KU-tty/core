import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

const revisionCheck = (name: string, column: AnySQLiteColumn) => check(name, sql`${column} >= 1`)

const payloadColumns = () => ({
  payloadJson: text('payload_json').notNull(),
  payloadHash: text('payload_hash').notNull(),
})

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    headRevision: integer('head_revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('projects_head_revision_positive', table.headRevision),
    index('projects_status_idx').on(table.status),
  ],
)

export const projectRevisions = sqliteTable(
  'project_revisions',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.revision] }),
    revisionCheck('project_revisions_revision_positive', table.revision),
    check('project_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('project_revisions_correlation_idx').on(table.correlationId),
  ],
)

export const discoverySessions = sqliteTable(
  'discovery_sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    headRevision: integer('head_revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('discovery_sessions_head_revision_positive', table.headRevision),
    index('discovery_sessions_project_idx').on(table.projectId),
    index('discovery_sessions_status_idx').on(table.status),
  ],
)

export const discoverySessionRevisions = sqliteTable(
  'discovery_session_revisions',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    openedAt: text('opened_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.revision] }),
    revisionCheck('discovery_session_revisions_revision_positive', table.revision),
    check('discovery_session_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const candidates = sqliteTable(
  'candidates',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    headRevision: integer('head_revision').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('candidates_head_revision_positive', table.headRevision),
    index('candidates_session_idx').on(table.sessionId),
  ],
)

export const candidateRevisions = sqliteTable(
  'candidate_revisions',
  {
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.candidateId, table.revision] }),
    revisionCheck('candidate_revisions_revision_positive', table.revision),
    check('candidate_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const candidateParentEdges = sqliteTable(
  'candidate_parent_edges',
  {
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    parentCandidateId: text('parent_candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    parentRevision: integer('parent_revision').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.candidateId, table.revision, table.position] }),
    foreignKey({
      name: 'candidate_parent_edges_child_revision_fk',
      columns: [table.candidateId, table.revision],
      foreignColumns: [candidateRevisions.candidateId, candidateRevisions.revision],
    }).onDelete('restrict'),
    foreignKey({
      name: 'candidate_parent_edges_parent_revision_fk',
      columns: [table.parentCandidateId, table.parentRevision],
      foreignColumns: [candidateRevisions.candidateId, candidateRevisions.revision],
    }).onDelete('restrict'),
    uniqueIndex('candidate_parent_edges_parent_unique').on(
      table.candidateId,
      table.revision,
      table.parentCandidateId,
      table.parentRevision,
    ),
  ],
)

export const candidateRounds = sqliteTable(
  'candidate_rounds',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    roundIndex: integer('round_index').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    uniqueIndex('candidate_rounds_session_round_unique').on(table.sessionId, table.roundIndex),
    revisionCheck('candidate_rounds_round_index_positive', table.roundIndex),
    check('candidate_rounds_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const candidateRoundItems = sqliteTable(
  'candidate_round_items',
  {
    roundId: text('round_id')
      .notNull()
      .references(() => candidateRounds.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    candidateRevision: integer('candidate_revision').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roundId, table.position] }),
    foreignKey({
      name: 'candidate_round_items_candidate_revision_fk',
      columns: [table.candidateId, table.candidateRevision],
      foreignColumns: [candidateRevisions.candidateId, candidateRevisions.revision],
    }).onDelete('restrict'),
  ],
)

export const discoveryFeedback = sqliteTable(
  'discovery_feedback',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    roundId: text('round_id')
      .notNull()
      .references(() => candidateRounds.id, { onDelete: 'restrict' }),
    intent: text('intent').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('discovery_feedback_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('discovery_feedback_session_idx').on(table.sessionId),
  ],
)

export const discoverySelections = sqliteTable(
  'discovery_selections',
  {
    sessionId: text('session_id')
      .primaryKey()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    feedbackId: text('feedback_id')
      .notNull()
      .unique()
      .references(() => discoveryFeedback.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    candidateRevision: integer('candidate_revision').notNull(),
    selectedAt: text('selected_at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'discovery_selections_candidate_revision_fk',
      columns: [table.candidateId, table.candidateRevision],
      foreignColumns: [candidateRevisions.candidateId, candidateRevisions.revision],
    }).onDelete('restrict'),
  ],
)

export const learningSpecs = sqliteTable(
  'learning_specs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    headRevision: integer('head_revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('learning_specs_head_revision_positive', table.headRevision),
    index('learning_specs_project_status_idx').on(table.projectId, table.status),
  ],
)

export const learningSpecRevisions = sqliteTable(
  'learning_spec_revisions',
  {
    specId: text('spec_id')
      .notNull()
      .references(() => learningSpecs.id, { onDelete: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'restrict' }),
    candidateRevision: integer('candidate_revision').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.specId, table.revision] }),
    foreignKey({
      name: 'learning_spec_revisions_candidate_revision_fk',
      columns: [table.candidateId, table.candidateRevision],
      foreignColumns: [candidateRevisions.candidateId, candidateRevisions.revision],
    }).onDelete('restrict'),
    revisionCheck('learning_spec_revisions_revision_positive', table.revision),
    check('learning_spec_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    specId: text('spec_id')
      .notNull()
      .references(() => learningSpecs.id, { onDelete: 'restrict' }),
    headRevision: integer('head_revision').notNull(),
    sequence: integer('sequence').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('tasks_head_revision_positive', table.headRevision),
    uniqueIndex('tasks_project_sequence_unique').on(table.projectId, table.sequence),
    index('tasks_project_status_idx').on(table.projectId, table.status),
  ],
)

export const taskRevisions = sqliteTable(
  'task_revisions',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    specId: text('spec_id')
      .notNull()
      .references(() => learningSpecs.id, { onDelete: 'restrict' }),
    specRevision: integer('spec_revision').notNull(),
    sequence: integer('sequence').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.revision] }),
    foreignKey({
      name: 'task_revisions_spec_revision_fk',
      columns: [table.specId, table.specRevision],
      foreignColumns: [learningSpecRevisions.specId, learningSpecRevisions.revision],
    }).onDelete('restrict'),
    revisionCheck('task_revisions_revision_positive', table.revision),
    check('task_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const projectActiveTasks = sqliteTable(
  'project_active_tasks',
  {
    projectId: text('project_id')
      .primaryKey()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .unique()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    taskRevision: integer('task_revision').notNull(),
    status: text('status').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_active_tasks_task_revision_fk',
      columns: [table.taskId, table.taskRevision],
      foreignColumns: [taskRevisions.taskId, taskRevisions.revision],
    }).onDelete('restrict'),
    check('project_active_tasks_status_valid', sql`${table.status} IN ('ACTIVE', 'BLOCKED')`),
  ],
)

export const liveContexts = sqliteTable(
  'live_contexts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    headVersion: integer('head_version').notNull(),
    checkpoint: text('checkpoint').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('live_contexts_head_version_positive', table.headVersion),
    uniqueIndex('live_contexts_task_unique').on(table.taskId),
  ],
)

export const liveContextVersions = sqliteTable(
  'live_context_versions',
  {
    contextId: text('context_id')
      .notNull()
      .references(() => liveContexts.id, { onDelete: 'restrict' }),
    contextVersion: integer('context_version').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    checkpoint: text('checkpoint').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.contextId, table.contextVersion] }),
    revisionCheck('live_context_versions_version_positive', table.contextVersion),
    check('live_context_versions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const decisionRequests = sqliteTable(
  'decision_requests',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    contextVersion: integer('context_version').notNull(),
    category: text('category').notNull(),
    correlationId: text('correlation_id').notNull(),
    requestedAt: text('requested_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('decision_requests_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('decision_requests_project_idx').on(table.projectId, table.requestedAt),
  ],
)

export const decisionResolutions = sqliteTable(
  'decision_resolutions',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id')
      .notNull()
      .unique()
      .references(() => decisionRequests.id, { onDelete: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    correlationId: text('correlation_id').notNull(),
    resolvedAt: text('resolved_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('decision_resolutions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const decisionApplications = sqliteTable(
  'decision_applications',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id')
      .notNull()
      .unique()
      .references(() => decisionRequests.id, { onDelete: 'restrict' }),
    resolutionId: text('resolution_id')
      .notNull()
      .unique()
      .references(() => decisionResolutions.id, { onDelete: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    correlationId: text('correlation_id').notNull(),
    appliedAt: text('applied_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('decision_applications_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const decisionStates = sqliteTable(
  'decision_states',
  {
    decisionId: text('decision_id')
      .primaryKey()
      .references(() => decisionRequests.id, { onDelete: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    resolutionId: text('resolution_id').references(() => decisionResolutions.id, {
      onDelete: 'restrict',
    }),
    applicationId: text('application_id').references(() => decisionApplications.id, {
      onDelete: 'restrict',
    }),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check(
      'decision_states_status_valid',
      sql`${table.status} IN ('REQUESTED', 'RESOLVED', 'APPLIED')`,
    ),
    index('decision_states_project_status_idx').on(table.projectId, table.status),
  ],
)

export const completionReports = sqliteTable(
  'completion_reports',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id')
      .notNull()
      .unique()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    expectedTaskRevision: integer('expected_task_revision').notNull(),
    correlationId: text('correlation_id').notNull(),
    completedAt: text('completed_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('completion_reports_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'restrict' }),
    decisionId: text('decision_id').references(() => decisionRequests.id, {
      onDelete: 'restrict',
    }),
    sequence: integer('sequence').notNull(),
    eventType: text('event_type').notNull(),
    correlationId: text('correlation_id').notNull(),
    occurredAt: text('occurred_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    uniqueIndex('activity_events_project_sequence_unique').on(table.projectId, table.sequence),
    check('activity_events_sequence_nonnegative', sql`${table.sequence} >= 0`),
    check('activity_events_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('activity_events_correlation_idx').on(table.correlationId),
  ],
)

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'restrict' }),
    decisionId: text('decision_id').references(() => decisionRequests.id, {
      onDelete: 'restrict',
    }),
    headRevision: integer('head_revision').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('episodes_head_revision_positive', table.headRevision),
    index('episodes_project_status_idx').on(table.projectId, table.status),
  ],
)

export const episodeRevisions = sqliteTable(
  'episode_revisions',
  {
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.episodeId, table.revision] }),
    revisionCheck('episode_revisions_revision_positive', table.revision),
    check('episode_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const episodeEventEdges = sqliteTable(
  'episode_event_edges',
  {
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'restrict' }),
    episodeRevision: integer('episode_revision').notNull(),
    eventId: text('event_id')
      .notNull()
      .references(() => activityEvents.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.episodeId, table.episodeRevision, table.position] }),
    foreignKey({
      name: 'episode_event_edges_episode_revision_fk',
      columns: [table.episodeId, table.episodeRevision],
      foreignColumns: [episodeRevisions.episodeId, episodeRevisions.revision],
    }).onDelete('restrict'),
    uniqueIndex('episode_event_edges_event_unique').on(
      table.episodeId,
      table.episodeRevision,
      table.eventId,
    ),
  ],
)

export const canonicalConcepts = sqliteTable(
  'canonical_concepts',
  {
    id: text('id').primaryKey(),
    headRevision: integer('head_revision').notNull(),
    canonicalName: text('canonical_name').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('canonical_concepts_head_revision_positive', table.headRevision),
    uniqueIndex('canonical_concepts_name_unique').on(table.canonicalName),
  ],
)

export const canonicalConceptRevisions = sqliteTable(
  'canonical_concept_revisions',
  {
    conceptId: text('concept_id')
      .notNull()
      .references(() => canonicalConcepts.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    canonicalName: text('canonical_name').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.conceptId, table.revision] }),
    revisionCheck('canonical_concept_revisions_revision_positive', table.revision),
    check('canonical_concept_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const conceptAliasProposals = sqliteTable(
  'concept_alias_proposals',
  {
    id: text('id').primaryKey(),
    conceptId: text('concept_id').references(() => canonicalConcepts.id, {
      onDelete: 'restrict',
    }),
    proposedAlias: text('proposed_alias').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    proposedAt: text('proposed_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('concept_alias_proposals_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('concept_alias_proposals_concept_status_idx').on(table.conceptId, table.status),
  ],
)

export const evidenceProposals = sqliteTable(
  'evidence_proposals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'restrict' }),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'restrict' }),
    conceptId: text('concept_id').references(() => canonicalConcepts.id, {
      onDelete: 'restrict',
    }),
    signal: text('signal').notNull(),
    strength: text('strength').notNull(),
    promptDependence: text('prompt_dependence').notNull(),
    correlationId: text('correlation_id').notNull(),
    proposedAt: text('proposed_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('evidence_proposals_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('evidence_proposals_concept_idx').on(table.conceptId),
    index('evidence_proposals_episode_idx').on(table.episodeId),
  ],
)

export const evidenceDecisions = sqliteTable(
  'evidence_decisions',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .unique()
      .references(() => evidenceProposals.id, { onDelete: 'restrict' }),
    outcome: text('outcome').notNull(),
    reasonCode: text('reason_code').notNull(),
    correlationId: text('correlation_id').notNull(),
    decidedAt: text('decided_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('evidence_decisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const acceptedEvidence = sqliteTable(
  'accepted_evidence',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'restrict' }),
    episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'restrict' }),
    conceptId: text('concept_id')
      .notNull()
      .references(() => canonicalConcepts.id, { onDelete: 'restrict' }),
    proposalId: text('proposal_id').references(() => evidenceProposals.id, {
      onDelete: 'restrict',
    }),
    decisionId: text('decision_id').references(() => evidenceDecisions.id, {
      onDelete: 'restrict',
    }),
    supportsState: text('supports_state'),
    correlationId: text('correlation_id').notNull(),
    acceptedAt: text('accepted_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('accepted_evidence_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('accepted_evidence_concept_idx').on(table.conceptId, table.acceptedAt),
  ],
)

export const misconceptionIssues = sqliteTable(
  'misconception_issues',
  {
    id: text('id').primaryKey(),
    conceptId: text('concept_id')
      .notNull()
      .references(() => canonicalConcepts.id, { onDelete: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    headStorageRevision: integer('head_storage_revision').notNull(),
    status: text('status').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('misconception_issues_head_revision_positive', table.headStorageRevision),
    index('misconception_issues_concept_status_idx').on(table.conceptId, table.status),
  ],
)

export const misconceptionIssueHistory = sqliteTable(
  'misconception_issue_history',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => misconceptionIssues.id, { onDelete: 'restrict' }),
    storageRevision: integer('storage_revision').notNull(),
    conceptId: text('concept_id')
      .notNull()
      .references(() => canonicalConcepts.id, { onDelete: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    recordedAt: text('recorded_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.storageRevision] }),
    revisionCheck('misconception_issue_history_revision_positive', table.storageRevision),
    check('misconception_issue_history_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const conceptLedgers = sqliteTable(
  'concept_ledgers',
  {
    id: text('id').primaryKey(),
    conceptId: text('concept_id')
      .notNull()
      .unique()
      .references(() => canonicalConcepts.id, { onDelete: 'restrict' }),
    headRevision: integer('head_revision').notNull(),
    state: text('state').notNull(),
    reducerVersion: text('reducer_version').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [revisionCheck('concept_ledgers_head_revision_positive', table.headRevision)],
)

export const conceptLedgerRevisions = sqliteTable(
  'concept_ledger_revisions',
  {
    ledgerId: text('ledger_id')
      .notNull()
      .references(() => conceptLedgers.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    conceptId: text('concept_id')
      .notNull()
      .references(() => canonicalConcepts.id, { onDelete: 'restrict' }),
    state: text('state').notNull(),
    reducerVersion: text('reducer_version').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.revision] }),
    revisionCheck('concept_ledger_revisions_revision_positive', table.revision),
    check('concept_ledger_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const auditRecords = sqliteTable(
  'audit_records',
  {
    id: text('id').primaryKey(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    resourceRevision: integer('resource_revision'),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    correlationId: text('correlation_id').notNull(),
    occurredAt: text('occurred_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('audit_records_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('audit_records_resource_idx').on(table.resourceType, table.resourceId),
    index('audit_records_correlation_idx').on(table.correlationId),
  ],
)

export const evaluationRuns = sqliteTable(
  'evaluation_runs',
  {
    id: text('id').primaryKey(),
    headRevision: integer('head_revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    evaluatorVersion: text('evaluator_version').notNull(),
    systemUnderTestVersion: text('system_under_test_version').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    revisionCheck('evaluation_runs_head_revision_positive', table.headRevision),
    index('evaluation_runs_status_idx').on(table.status),
    index('evaluation_runs_correlation_idx').on(table.correlationId),
  ],
)

export const evaluationRunRevisions = sqliteTable(
  'evaluation_run_revisions',
  {
    evaluationRunId: text('evaluation_run_id')
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    ...payloadColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.evaluationRunId, table.revision] }),
    revisionCheck('evaluation_run_revisions_revision_positive', table.revision),
    check('evaluation_run_revisions_payload_json_valid', sql`json_valid(${table.payloadJson})`),
  ],
)

export const baselineResults = sqliteTable(
  'baseline_results',
  {
    id: text('id').primaryKey(),
    evaluationRunId: text('evaluation_run_id')
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: 'restrict' }),
    correlationId: text('correlation_id').notNull(),
    kind: text('kind').notNull(),
    baselineName: text('baseline_name').notNull(),
    baselineVersion: text('baseline_version').notNull(),
    recordedAt: text('recorded_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('baseline_results_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    uniqueIndex('baseline_results_identity_unique').on(
      table.kind,
      table.baselineName,
      table.baselineVersion,
    ),
    index('baseline_results_evaluation_run_idx').on(table.evaluationRunId),
  ],
)

export const idempotencyReceipts = sqliteTable(
  'idempotency_receipts',
  {
    key: text('key').primaryKey(),
    correlationId: text('correlation_id').notNull(),
    operation: text('operation').notNull(),
    resourceId: text('resource_id').notNull(),
    resourceRevision: integer('resource_revision'),
    recordedAt: text('recorded_at').notNull(),
    ...payloadColumns(),
  },
  (table) => [
    check('idempotency_receipts_payload_json_valid', sql`json_valid(${table.payloadJson})`),
    index('idempotency_receipts_correlation_idx').on(table.correlationId),
    index('idempotency_receipts_resource_idx').on(table.resourceId),
  ],
)
